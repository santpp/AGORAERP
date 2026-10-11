<?php
/**
 * Agora Digital App · Landing 3.0 — núcleo común de la API (no se llama directo)
 *
 * Orden pensado para resistir tráfico abusivo en capa 7:
 *   1. Chequeos baratos que no tocan disco ni base de datos
 *      (método, tamaño declarado, origen, tipo de contenido).
 *   2. Límite por IP y límite global por endpoint (archivo con bloqueo, sin BD).
 *   3. Solo entonces: sesión, CSRF, reCAPTCHA y base de datos.
 *
 * Importante: ningún código de origen en hosting compartido absorbe por sí
 * solo miles de bots simultáneos. La primera línea es la CDN/WAF (Cloudflare
 * o la CDN de Hostinger); ver docs/LEEME.md, sección Seguridad.
 */
declare(strict_types=1);

if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) {
    http_response_code(403);
    exit;
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
header('Cross-Origin-Resource-Policy: same-origin');
header('Referrer-Policy: no-referrer');
header('X-Robots-Tag: noindex, nofollow');

function respond(int $status, array $body = []): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/* ---------------------------------------------------------------------
   Configuración: primero FUERA de public_html (recomendado), luego aquí.
   --------------------------------------------------------------------- */
$CONFIG = (static function (): array {
    $candidates = [
        (string)getenv('AGORA_CONFIG'),
        dirname(__DIR__, 2) . '/agora-config.php', // /home/usuario/agora-config.php
        __DIR__ . '/config.php',
    ];
    foreach ($candidates as $file) {
        if ($file !== '' && is_file($file)) {
            $config = require $file;
            if (is_array($config)) {
                return $config + [
                    'rate_dir' => sys_get_temp_dir() . '/agora-rl-' . substr(hash('sha256', __DIR__), 0, 12),
                    'trust_proxy' => '',
                    'min_fill_ms' => 1200,
                    'slots' => ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
                    'timezone' => 'Etc/GMT+4',
                ];
            }
        }
    }
    respond(503, ['error' => 'not_configured']);
})();

/* ---------------------------------------------------------------------
   1 · Chequeos baratos
   --------------------------------------------------------------------- */
function require_method(string ...$methods): void
{
    $method = $_SERVER['REQUEST_METHOD'] ?? '';
    if (!in_array($method, $methods, true)) {
        header('Allow: ' . implode(', ', $methods));
        respond(405, ['error' => 'method']);
    }
}

/**
 * Mismo origen. En POST exige Origin o Sec-Fetch-Site (todo navegador moderno
 * los envía): un bot que no los manda se descarta sin gastar recursos.
 */
function require_same_origin(array $config, bool $strict = true): void
{
    $origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    $site = (string)($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '');
    if ($site !== '' && $site !== 'same-origin') {
        respond(403, ['error' => 'origin']);
    }
    if ($origin !== '' && !in_array($origin, $config['allowed_origins'], true)) {
        respond(403, ['error' => 'origin']);
    }
    if ($strict && $origin === '' && $site === '') {
        respond(403, ['error' => 'origin']);
    }
}

function require_json_request(int $maxBytes = 8192): void
{
    if (stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) {
        respond(415, ['error' => 'content_type']);
    }
    $declared = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($declared <= 0 || $declared > $maxBytes) {
        respond(413, ['error' => 'too_large']);
    }
}

/* Rangos publicados por Cloudflare (verifíquelos de vez en cuando en https://www.cloudflare.com/ips/) */
const CLOUDFLARE_RANGES = [
    '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
    '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
    '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
    '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
];

function ip_in_range(string $ip, string $cidr): bool
{
    [$net, $bits] = explode('/', $cidr);
    $a = @inet_pton($ip);
    $b = @inet_pton($net);
    if ($a === false || $b === false || strlen($a) !== strlen($b)) {
        return false;
    }
    $bits = (int)$bits;
    $bytes = intdiv($bits, 8);
    if (strncmp($a, $b, $bytes) !== 0) {
        return false;
    }
    $rest = $bits % 8;
    if ($rest === 0) {
        return true;
    }
    $mask = (0xFF << (8 - $rest)) & 0xFF;
    return (ord($a[$bytes]) & $mask) === (ord($b[$bytes]) & $mask);
}

/**
 * IP real del visitante. Detrás de Cloudflare, REMOTE_ADDR es la IP de Cloudflare;
 * solo entonces (y nunca si la solicitud viene de otro lado) se usa CF-Connecting-IP.
 * Así nadie puede falsificar la cabecera para esquivar los límites.
 */
function client_ip(array $config): string
{
    $remote = (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    if (($config['trust_proxy'] ?? '') === 'cloudflare' && !empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
        $real = (string)$_SERVER['HTTP_CF_CONNECTING_IP'];
        if (filter_var($real, FILTER_VALIDATE_IP)) {
            foreach (CLOUDFLARE_RANGES as $range) {
                if (ip_in_range($remote, $range)) {
                    return $real;
                }
            }
        }
    }
    return $remote;
}

function ip_hash(array $config): string
{
    return hash_hmac('sha256', client_ip($config), (string)($config['ip_secret'] ?? ''));
}

/* ---------------------------------------------------------------------
   2 · Límite de solicitudes (ventana deslizante en archivo con bloqueo)
   $perIp = false → límite global del endpoint (frena ataques distribuidos
   que esquivan el límite por IP y protege la base de datos y el correo).
   --------------------------------------------------------------------- */
function rate_limit(array $config, string $bucket, int $max, int $windowSeconds, bool $perIp = true): void
{
    $dir = (string)$config['rate_dir'];
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        return;
    }
    $key = $perIp ? $bucket . '|' . client_ip($config) : 'global|' . $bucket;
    $file = $dir . '/' . hash('sha256', $key) . '.json';
    $fp = @fopen($file, 'c+');
    if (!$fp) {
        return;
    }
    flock($fp, LOCK_EX);
    $now = time();
    $hits = json_decode(stream_get_contents($fp) ?: '[]', true);
    $hits = array_values(array_filter(is_array($hits) ? $hits : [], static fn($t) => is_int($t) && $t > $now - $windowSeconds));
    if (count($hits) >= $max) {
        flock($fp, LOCK_UN);
        fclose($fp);
        header('Retry-After: ' . max(1, $windowSeconds - ($now - $hits[0])));
        respond($perIp ? 429 : 503, ['error' => $perIp ? 'rate_limited' : 'busy']);
    }
    $hits[] = $now;
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($hits));
    flock($fp, LOCK_UN);
    fclose($fp);

    // Limpieza ocasional de archivos viejos (1 de cada 200 solicitudes)
    if (random_int(1, 200) === 1) {
        foreach (glob($dir . '/*.json') ?: [] as $old) {
            if (@filemtime($old) < $now - 86400) {
                @unlink($old);
            }
        }
    }
}

/* ---------------------------------------------------------------------
   3 · Sesión, CSRF, captcha y base de datos (solo tras pasar lo anterior)
   --------------------------------------------------------------------- */
function session_boot(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_name('__Host-agora_sid');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.use_trans_sid', '0');
    session_start();
}

function csrf_token(): string
{
    session_boot();
    if (empty($_SESSION['csrf']) || ($_SESSION['csrf_at'] ?? 0) < microtime(true) - 7200) {
        $_SESSION['csrf'] = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $_SESSION['csrf_at'] = microtime(true);
    }
    return $_SESSION['csrf'];
}

function require_csrf(array $config, array $body): void
{
    $header = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    $token = (string)($_SESSION['csrf'] ?? '');
    if ($token === '' || !hash_equals($token, $header) || !hash_equals($token, (string)($body['csrf'] ?? ''))) {
        respond(403, ['error' => 'csrf']);
    }
    // Trampa de tiempo: un humano no completa el formulario en milisegundos
    $age = (microtime(true) - (float)($_SESSION['csrf_at'] ?? 0)) * 1000;
    if ($age < (int)$config['min_fill_ms']) {
        respond(400, ['error' => 'too_fast']);
    }
}

function json_body(int $maxBytes = 8192): array
{
    $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
    if ($raw === false || strlen($raw) > $maxBytes) {
        respond(413, ['error' => 'too_large']);
    }
    $data = json_decode($raw, true, 4);
    if (!is_array($data)) {
        respond(400, ['error' => 'json']);
    }
    return $data;
}

function clean(mixed $value, int $max = 200, bool $multiline = false): string
{
    $s = is_scalar($value) ? (string)$value : '';
    if (!mb_check_encoding($s, 'UTF-8')) {
        return '';
    }
    if (class_exists('Normalizer')) {
        $s = Normalizer::normalize($s, Normalizer::FORM_KC) ?: '';
    }
    $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x{200B}-\x{200F}\x{2028}-\x{202E}\x{2060}-\x{206F}\x{FEFF}]/u', '', $s) ?? '';
    $s = strip_tags($s);
    $s = $multiline ? preg_replace("/[ \t]+/u", ' ', $s) : preg_replace('/\s+/u', ' ', $s);
    return mb_substr(trim((string)$s), 0, $max);
}

/** Validación por lista blanca. Responde 422 con los campos inválidos. */
function validate(array $body, array $schema): array
{
    $out = [];
    $errors = [];
    foreach ($schema as $field => $spec) {
        $value = clean($body[$field] ?? '', $spec['max'] ?? 200, $spec['multiline'] ?? false);
        if ($value === '') {
            if (!empty($spec['required'])) {
                $errors[] = $field;
            }
            $out[$field] = null;
            continue;
        }
        $ok = match (true) {
            isset($spec['regex']) => (bool)preg_match($spec['regex'], $value),
            isset($spec['in']) => in_array($value, $spec['in'], true),
            ($spec['type'] ?? '') === 'email' => filter_var($value, FILTER_VALIDATE_EMAIL) !== false,
            default => true,
        };
        if (!$ok) {
            $errors[] = $field;
        }
        $out[$field] = $value;
    }
    if ($errors) {
        respond(422, ['error' => 'validation', 'fields' => $errors]);
    }
    return $out;
}

function verify_recaptcha(array $config, string $token, string $action): void
{
    if (empty($config['recaptcha_secret'])) {
        return;
    }
    if ($token === '') {
        respond(403, ['error' => 'captcha']);
    }
    $payload = http_build_query(['secret' => $config['recaptcha_secret'], 'response' => $token, 'remoteip' => client_ip($config)]);
    $raw = false;
    if (function_exists('curl_init')) {
        $ch = curl_init('https://www.google.com/recaptcha/api/siteverify');
        curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 5, CURLOPT_CONNECTTIMEOUT => 3]);
        $raw = curl_exec($ch);
        curl_close($ch);
    } else {
        $ctx = stream_context_create(['http' => ['method' => 'POST', 'header' => 'Content-Type: application/x-www-form-urlencoded', 'content' => $payload, 'timeout' => 5]]);
        $raw = @file_get_contents('https://www.google.com/recaptcha/api/siteverify', false, $ctx);
    }
    $res = json_decode((string)$raw, true);
    if (empty($res['success']) || ($res['action'] ?? '') !== $action || ($res['score'] ?? 0) < $config['recaptcha_min_score']) {
        respond(403, ['error' => 'captcha']);
    }
}

function db(array $config): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        try {
            $pdo = new PDO($config['db_dsn'], $config['db_user'], $config['db_pass'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_EMULATE_PREPARES => false,      // consultas preparadas reales
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_TIMEOUT => 5,
                PDO::MYSQL_ATTR_MULTI_STATEMENTS => false, // bloquea "; DROP TABLE…"
            ]);
        } catch (PDOException $e) {
            error_log('agora-api db: ' . $e->getMessage());
            respond(503, ['error' => 'unavailable']);
        }
    }
    return $pdo;
}

/**
 * Reenvío al CRM (webhook de entrada de GoHighLevel). Corre DESPUÉS de guardar
 * en MySQL y nunca bloquea la respuesta al visitante: si GHL no responde en
 * 4 s, el prospecto ya está a salvo en la base y en el correo del equipo.
 */
function forward_webhook(array $config, array $payload): void
{
    $url = (string)($config['ghl_webhook_url'] ?? '');
    if ($url === '' || !preg_match('#^https://[a-z0-9.-]+\.(leadconnectorhq\.com|msgsndr\.com|gohighlevel\.com)/#i', $url)) {
        return; // solo destinos de GoHighLevel: evita que la configuración se use para SSRF
    }
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true, CURLOPT_POSTFIELDS => $json, CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_TIMEOUT => 4, CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        ]);
        $ok = curl_exec($ch) !== false && curl_getinfo($ch, CURLINFO_RESPONSE_CODE) < 300;
        curl_close($ch);
    } else {
        $ctx = stream_context_create(['http' => ['method' => 'POST', 'header' => 'Content-Type: application/json', 'content' => $json, 'timeout' => 4, 'follow_location' => 0]]);
        $ok = @file_get_contents($url, false, $ctx) !== false;
    }
    if (!$ok) {
        error_log('agora-api webhook: sin respuesta de GoHighLevel');
    }
}

/**
 * Guardia para todo POST: el orden importa (de lo más barato a lo más caro).
 */
function guard_post(array $config, string $action, int $maxPerIp, int $window, int $globalMax = 0): array
{
    require_method('POST');
    require_same_origin($config, true);
    require_json_request();
    rate_limit($config, $action, $maxPerIp, $window);
    if ($globalMax > 0) {
        rate_limit($config, $action, $globalMax, $window, false);
    }
    session_boot();
    $body = json_body();
    require_csrf($config, $body);
    if (!empty($body['website'])) {
        respond(400, ['error' => 'bot']);
    }
    verify_recaptcha($config, clean($body['recaptcha'] ?? '', 4096), $action);
    return $body;
}
