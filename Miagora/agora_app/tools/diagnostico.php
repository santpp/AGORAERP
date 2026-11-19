<?php
/**
 * Agora Digital App · diagnóstico del servidor (por SSH). No cambia nada.
 *   php agora_app/tools/diagnostico.php
 *   php agora_app/tools/diagnostico.php --probar-correo=tu@correo.com
 *   php agora_app/tools/diagnostico.php --probar-whatsapp=+584121234567
 *   php agora_app/tools/diagnostico.php --probar-tasas
 */
declare(strict_types=1);
require __DIR__ . '/_cli.php';

use Agora\App;
use Agora\Core\Clock;
use Agora\Core\Db;
use Agora\Core\Env;
use Agora\Core\Migrator;
use Agora\Notify\Outbox;
use Agora\Notify\WhatsApp;
use Agora\Security\Integrity;
use Agora\Services\Backup;

$a = cli_args($argv);
$fails = 0;
$warns = 0;
$check = function (string $label, bool $ok, string $detail = '', bool $warnOnly = false) use (&$fails, &$warns): void {
    if ($ok) {
        cli_out("\033[32m✓\033[0m {$label}" . ($detail ? " · {$detail}" : ''));
    } elseif ($warnOnly) {
        $warns++;
        cli_out("\033[33m!\033[0m {$label}" . ($detail ? " · {$detail}" : ''));
    } else {
        $fails++;
        cli_out("\033[31m✗\033[0m {$label}" . ($detail ? " · {$detail}" : ''));
    }
};

cli_out("\nAgora Digital App · diagnóstico del servidor v" . App::VERSION . ' · ' . Clock::ts() . " UTC\n");
$check('PHP 8.1 o superior', PHP_VERSION_ID >= 80100, PHP_VERSION);
foreach (['pdo_mysql', 'sodium', 'curl', 'mbstring', 'openssl', 'zlib', 'intl'] as $e) {
    $check("Extensión {$e}", extension_loaded($e), '', $e === 'intl');
}
$check('OPcache (rendimiento; actívalo en hPanel → Configuración de PHP)', extension_loaded('Zend OPcache') && filter_var(ini_get('opcache.enable'), FILTER_VALIDATE_BOOLEAN), '', true);
$check('APCu (límites en memoria, opcional)', function_exists('apcu_enabled') && apcu_enabled(), 'sin APCu los límites usan la base', true);
$check('Archivo .env', is_file(AGORA_APP . '/.env'));
$perm = is_file(AGORA_APP . '/.env') ? substr(sprintf('%o', fileperms(AGORA_APP . '/.env')), -3) : '';
$check('.env solo legible por tu usuario (600)', in_array($perm, ['600', '400'], true), $perm, true);
foreach (['AUDIT_KEY', 'OTP_PEPPER', 'INTEGRITY_KEY', 'BACKUP_KEY'] as $k) {
    $v = Env::str($k);
    $check("Secreto {$k}", strlen($v) >= 32 && !str_contains($v, 'cambia'), strlen($v) . ' caracteres');
}
$check('APP_ENV = production', Env::isProduction(), Env::str('APP_ENV'), true);
$check('APP_URL con https', str_starts_with(Env::str('APP_URL'), 'https://'), Env::str('APP_URL'));
$check('Cookies seguras (COOKIE_SECURE)', Env::bool('COOKIE_SECURE', true));
$pub = Env::str('PUBLIC_DIR', dirname(AGORA_APP) . '/public_html');
$check('public_html encontrado', is_dir($pub), $pub);
if (is_dir($pub)) {
    $inside = preg_match('#/public_html(/|$)#', (string) realpath(AGORA_APP)) === 1 || str_starts_with((string) realpath(AGORA_APP) . '/', (string) realpath($pub) . '/');
    $check('agora_app FUERA de public_html', !$inside);
    $ht = (string) @file_get_contents($pub . '/.htaccess');
    $check('.htaccess con la trampa de código fuente', str_contains($ht, 'seguridad/trampa.php'));
    $stray = [];
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($pub, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) {
        $rel = substr($f->getPathname(), strlen($pub) + 1);
        if (preg_match('/\.ph(p\d?|ar|tml)$/i', $rel) && !in_array($rel, ['index.php', 'api/index.php', 'seguridad/trampa.php'], true)) {
            $stray[] = $rel;
        }
    }
    $check('Sin archivos PHP extra en public_html', !$stray, $stray ? implode(', ', array_slice($stray, 0, 5)) : '');
    $check('Plantilla de la app compilada', is_file(AGORA_APP . '/templates/app.html'));
}
try {
    $db = Db::fromEnv();
    $check('Conexión a la base de datos', true, Env::str('DB_DRIVER', 'mysql') . ' ' . Env::str('DB_DATABASE'));
    $pending = Migrator::run($db, true, true);
    $check('Tablas al día', $pending === 0, $pending ? "{$pending} script(s) pendientes: corre instalar.php" : '');
    $app = new App($db);
    $check('Administrador de la plataforma o ALERT_EMAILS (para los avisos)', (bool) $app->alerts->platformRecipients(), implode(', ', $app->alerts->platformRecipients()));
    $state = json_decode((string) @file_get_contents(Env::str('STORAGE_DIR', AGORA_APP . '/storage') . '/cron-estado.json'), true) ?: [];
    $last = isset($state['_ultima']) ? Clock::unix() - (int) strtotime($state['_ultima'] . ' UTC') : null;
    $check('Tarea programada (cron) corriendo', $last !== null && $last < 300, $last === null ? 'nunca corrió' : "hace {$last} s");
    foreach (['tasas', 'integridad', 'respaldo', 'salida'] as $t) {
        if (isset($state[$t])) {
            $check("Tarea {$t}", (bool) ($state[$t]['ok'] ?? false), $state[$t]['error'] ?? '', true);
        }
    }
    $fx = $app->fx()->current();
    $check('Tasa BCV vigente', (bool) ($fx['bcv']['vigente'] ?? false), $fx['bcv'] ? $fx['bcv']['tasa'] . ' Bs/US$ · ' . $fx['bcv']['actualizado'] : 'sin datos', true);
    $check('Binance P2P vigente', (bool) ($fx['binance']['compra']['vigente'] ?? false), $fx['binance']['compra'] ? 'compra ' . $fx['binance']['compra']['mediana'] . ' · venta ' . ($fx['binance']['venta']['mediana'] ?? '—') : 'sin datos', true);
    $ic = $db->one('SELECT status, checked_at FROM integrity_checks ORDER BY id DESC LIMIT 1');
    $check('Manifiesto de integridad', is_file(Integrity::manifestPath()));
    $check('Última revisión de integridad', $ic && $ic['status'] === 'OK', $ic ? $ic['status'] . ' · ' . $ic['checked_at'] : 'sin revisiones', true);
    $bk = $db->one("SELECT file_name, finished_at FROM backup_runs WHERE status = 'OK' ORDER BY id DESC LIMIT 1");
    $age = $bk ? Clock::unix() - (int) strtotime($bk['finished_at'] . ' UTC') : null;
    $check('Respaldo de las últimas 26 horas', $age !== null && $age < 26 * 3600, $bk ? $bk['file_name'] : 'ninguno', true);
    $check('Copia fuera del servidor (S3)', Backup::s3Configured(), Backup::s3Configured() ? Env::str('S3_ENDPOINT') : 'opcional: configura S3_* en .env', true);
} catch (\Throwable $e) {
    $check('Conexión a la base de datos', false, $e->getMessage());
}
$check('Correo configurado (SMTP)', Outbox::mailConfigured() && Env::str('MAIL_DRIVER') === 'smtp', Env::str('MAIL_DRIVER') . ' ' . Env::str('MAIL_HOST'));
$check('WhatsApp (API oficial de Meta)', WhatsApp::configured(), WhatsApp::configured() ? 'plantilla ' . Env::str('WHATSAPP_TEMPLATE_OTP', 'agora_codigo_verificacion') : 'sin configurar: los códigos irán solo por correo', true);

if (!empty($a['probar-correo'])) {
    try {
        [$s, $t, $h] = \Agora\Notify\Templates::simple('Prueba de correo de Agora', 'El correo funciona', '<p>Este es un correo de prueba del diagnóstico del servidor.</p>');
        Outbox::deliverEmail((string) $a['probar-correo'], $s, $t, $h);
        $check('Envío de correo de prueba', true, (string) $a['probar-correo']);
    } catch (\Throwable $e) {
        $check('Envío de correo de prueba', false, $e->getMessage());
    }
}
if (!empty($a['probar-whatsapp'])) {
    try {
        $id = WhatsApp::sendOtp((string) $a['probar-whatsapp'], '123456');
        $check('Envío de WhatsApp de prueba (código 123456)', true, $id);
    } catch (\Throwable $e) {
        $check('Envío de WhatsApp de prueba', false, $e->getMessage());
    }
}
if (!empty($a['probar-tasas'])) {
    foreach (['bcv' => fn () => \Agora\Fx\Sources::bcv(), 'binance compra' => fn () => \Agora\Fx\Sources::binance('BUY'), 'binance venta' => fn () => \Agora\Fx\Sources::binance('SELL')] as $name => $fn) {
        $r = $fn();
        $check('Consulta ' . $name, $r['ok'], $r['ok'] ? (isset($r['rate']) ? (string) $r['rate'] : count($r['prices']) . ' anuncios, mejor ' . $r['prices'][0]) : (string) $r['error']);
    }
}
cli_out("\n" . ($fails ? "\033[31m{$fails} problema(s)\033[0m" : "\033[32mTodo en orden\033[0m") . ($warns ? " · {$warns} aviso(s)" : '') . "\n");
exit($fails ? 1 : 0);
