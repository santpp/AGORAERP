<?php
declare(strict_types=1);

namespace Agora;

use Agora\Api\Ctx;
use Agora\Core\Clock;
use Agora\Core\Db;
use Agora\Core\Env;
use Agora\Core\Log;
use Agora\Http\HttpError;
use Agora\Http\Request;
use Agora\Http\Response;
use Agora\Http\Router;
use Agora\Notify\Outbox;
use Agora\Security\Alerts;
use Agora\Security\Csrf;
use Agora\Security\Headers;
use Agora\Security\Integrity;
use Agora\Security\IpGuard;
use Agora\Security\RateLimiter;
use Agora\Security\Roles;
use Agora\Security\SessionManager;
use Agora\Security\Tripwire;
use Agora\Security\Waf;
use Agora\Services\Audit;
use Agora\Services\Backup;
use Agora\Services\Docs;
use Agora\Services\Payments;
use Agora\Services\Periods;

/**
 * Agora Digital App · servidor. Contenedor de servicios y canal de cada petición:
 * IP bloqueada → cortafuegos (WAF) → límite por IP → ruta → sesión → CSRF → permiso → acción → cabeceras.
 */
final class App
{
    public const VERSION = '11.0.0';
    public const VERSION_LABEL = '11.0 · servidor';

    public Db $db;
    public RateLimiter $rate;
    public IpGuard $ipGuard;
    public SessionManager $sessions;
    public Outbox $outbox;
    public Audit $audit;
    public Alerts $alerts;
    public Periods $periods;
    public Payments $payments;
    public Docs $docs;
    public Tripwire $tripwire;
    public Integrity $integrity;
    private ?Fx\Rates $fx = null;
    private ?Fiscal\Documents $fiscal = null;
    private ?Backup $backup = null;
    private ?Router $router = null;
    /** @var list<callable> tareas para después de responder */
    private array $after = [];

    public function __construct(?Db $db = null)
    {
        $this->db = $db ?? Db::fromEnv();
        $this->rate = new RateLimiter($this->db);
        $this->ipGuard = new IpGuard($this->db);
        $this->sessions = new SessionManager($this->db);
        $this->outbox = new Outbox($this->db);
        $this->audit = new Audit($this->db);
        $this->alerts = new Alerts($this->db, $this->outbox, $this->rate);
        $this->periods = new Periods($this->db);
        $this->payments = new Payments($this->db, $this->periods, $this->audit);
        $this->docs = new Docs($this->db, $this->periods, $this->payments, $this->audit);
        $this->tripwire = new Tripwire($this->db, $this->alerts, $this->ipGuard);
        $this->integrity = new Integrity($this->db, $this->alerts);
    }

    public function fx(): Fx\Rates
    {
        return $this->fx ??= new Fx\Rates($this->db);
    }

    public function fiscal(): Fiscal\Documents
    {
        return $this->fiscal ??= new Fiscal\Documents($this->db, $this->audit, $this->periods);
    }

    public function backup(): Backup
    {
        return $this->backup ??= new Backup($this->db);
    }

    /** Ejecuta $fn después de entregar la respuesta (correos, avisos) */
    public function defer(callable $fn): void
    {
        $this->after[] = $fn;
    }

    public function runDeferred(): void
    {
        $jobs = $this->after;
        $this->after = [];
        foreach ($jobs as $fn) {
            try {
                $fn();
            } catch (\Throwable $e) {
                Log::warn('Tarea diferida con error', ['error' => $e->getMessage()]);
            }
        }
        try {
            Outbox::runDeferred(); // avisos por correo de esta petición (ya se respondió)
        } catch (\Throwable $e) {
            Log::warn('Avisos por correo con error', ['error' => $e->getMessage()]);
        }
    }

    public function router(): Router
    {
        if ($this->router) {
            return $this->router;
        }
        $r = new Router();
        Api\Auth::routes($r, $this);
        Api\Account::routes($r, $this);
        Api\Data::routes($r, $this);
        Api\FiscalApi::routes($r, $this);
        Api\PeriodsApi::routes($r, $this);
        Api\RatesApi::routes($r, $this);
        Api\Users::routes($r, $this);
        Api\SecurityApi::routes($r, $this);
        Api\Admin::routes($r, $this);
        return $this->router = $r;
    }

    // ---------------------------------------------------------------- API
    public function handle(Request $req): Response
    {
        $t0 = microtime(true);
        $s = null;
        try {
            $res = $this->dispatch($req, $s);
        } catch (HttpError $e) {
            $res = Response::json(['error' => $e->errorCode, 'mensaje' => $e->getMessage()] + $e->extra, $e->status);
            if ($e->status === 401) {
                $this->sessions->clearCookie($res);
            }
            if (isset($e->extra['reintentar_en'])) {
                $res->header('Retry-After', (string) (int) $e->extra['reintentar_en']);
            }
        } catch (\PDOException $e) {
            $res = $this->dbError($req, $e, $s);
        } catch (\Throwable $e) {
            $res = $this->internalError($req, $e);
        }
        Headers::api($res);
        $res->header('X-Request-Id', Log::requestId());
        $ms = (int) round((microtime(true) - $t0) * 1000);
        if ($ms > Env::int('SLOW_REQUEST_MS', 2500)) {
            Log::warn('Petición lenta', ['ruta' => $req->method . ' ' . $req->path, 'ms' => $ms]);
        }
        return $res;
    }

    /** @param array<string,mixed>|null $s */
    private function dispatch(Request $req, ?array &$s): Response
    {
        if ($this->ipGuard->isBlocked($req->ip)) {
            throw new HttpError(403, 'ACCESO_BLOQUEADO', 'El acceso desde tu conexión está bloqueado temporalmente por seguridad.');
        }
        $isImport = $req->method === 'POST' && $req->path === '/api/v1/importar';
        if ($hit = Waf::inspect($req, !$isImport)) {
            $this->tripwire->record($req, $hit['severity'], 'WAF', ['regla' => $hit['rule'], 'en' => $hit['where']], $this->sessions->load($req));
            throw new HttpError(403, 'SOLICITUD_RECHAZADA', 'La solicitud fue rechazada por seguridad.');
        }
        $this->limitIp($req->ip);
        $m = $this->router()->match($req->method, $req->path);
        $opts = $m['opts'] + ['auth' => true, 'org' => true, 'perm' => null, 'csrf' => true, 'rate' => null, 'platform' => false];
        $s = $this->sessions->load($req);
        if ($opts['auth'] && !$s) {
            throw new HttpError(401, 'SESION_REQUERIDA', 'Tu sesión terminó. Vuelve a entrar.');
        }
        if ($req->isUnsafe() && $opts['csrf']) {
            try {
                if ($opts['auth'] || $s) {
                    Csrf::verify($req, $s ?? throw new HttpError(401, 'SESION_REQUERIDA', 'Tu sesión terminó. Vuelve a entrar.'));
                } else {
                    Csrf::checkOrigin($req);
                }
            } catch (HttpError $e) {
                if ($e->status === 403) {
                    $this->alerts->event('CSRF', 'MEDIA', $req->ip, $req->method, $req->path, $req->userAgent(), ['motivo' => $e->errorCode], $s && $s['org_id'] !== null ? (int) $s['org_id'] : null, $s ? (int) $s['user_id'] : null);
                }
                throw $e;
            }
        }
        if ($s) {
            $this->limitKey('api:sesion:' . substr((string) $s['id'], 0, 24), Env::int('RATE_SESSION_LIMIT', 900), 300);
        }
        if ($opts['auth'] && $opts['org'] && $s && $s['org_id'] === null && !$opts['platform']) {
            throw new HttpError(409, 'SIN_EMPRESA', 'Elige una empresa para continuar.');
        }
        if ($opts['platform'] && empty($s['is_platform_admin'])) {
            throw HttpError::forbidden('Solo el equipo de Agora Digital puede hacer esto.');
        }
        if ($opts['perm'] && !Roles::can($s['role'] ?? null, (string) $opts['perm'])) {
            throw HttpError::forbidden();
        }
        if ($opts['rate']) {
            [$key, $limit, $win] = $opts['rate'];
            $key = str_replace(['{ip}', '{user}'], [$req->ip, (string) ($s['user_id'] ?? '-')], (string) $key);
            $this->rate->enforce($key, (int) $limit, (int) $win);
        }
        $out = ($m['handler'])(new Ctx($this, $req, $s, $m['params']));
        if ($out instanceof Response) {
            return $out;
        }
        return Response::json($out ?? ['ok' => true]);
    }

    /** Límite global por IP: con APCu si existe (memoria), si no en la base */
    private function limitIp(string $ip): void
    {
        $this->limitKey('api:ip:' . $ip, Env::int('RATE_IP_LIMIT', 1200), 300);
    }

    private function limitKey(string $key, int $limit, int $win): void
    {
        if (function_exists('apcu_enabled') && apcu_enabled() && !Env::isTest()) {
            $k = 'agora:' . $key . ':' . intdiv(Clock::unix(), $win);
            apcu_add($k, 0, $win * 2);
            $n = (int) apcu_inc($k);
            if ($n > $limit) {
                throw new HttpError(429, 'DEMASIADAS_SOLICITUDES', 'Demasiadas solicitudes seguidas. Espera un momento.', ['reintentar_en' => $win - Clock::unix() % $win]);
            }
            return;
        }
        $this->rate->enforce($key, $limit, $win, 'Demasiadas solicitudes seguidas. Espera un momento.');
    }

    /** @param array<string,mixed>|null $s */
    private function dbError(Request $req, \PDOException $e, ?array $s): Response
    {
        $code = Db::triggerMessage($e);
        if ($code) {
            // La base frenó un cambio prohibido: la app ya lo valida, así que llegar aquí es sospechoso.
            try {
                $this->alerts->event('INMUTABLE', 'MEDIA', $req->ip, $req->method, $req->path, $req->userAgent(), ['regla' => $code], $s && $s['org_id'] !== null ? (int) $s['org_id'] : null, $s ? (int) $s['user_id'] : null);
            } catch (\Throwable) {
            }
            $msg = [
                'DOCUMENTO_FISCAL_INMUTABLE' => 'Ese documento fiscal ya fue emitido: no se puede cambiar ni borrar. Usa una nota de crédito o débito.',
                'NUMERO_CONTROL_INMUTABLE' => 'El número de control ya asignado no se puede cambiar.',
                'TRANSICION_INVALIDA' => 'Ese cambio de estado no está permitido.',
                'COBRO_INMUTABLE' => 'Un cobro registrado no se modifica ni se borra; solo se revierte con verificación.',
                'AUDITORIA_INMUTABLE' => 'La auditoría no se puede modificar.',
            ][$code];
            return Response::json(['error' => $code, 'mensaje' => $msg], 409);
        }
        if (Db::isDuplicate($e)) {
            return Response::json(['error' => 'DUPLICADO', 'mensaje' => 'Ese dato ya existe (número o referencia repetida).'], 409);
        }
        if (Db::isRetryable($e)) {
            return Response::json(['error' => 'OCUPADO', 'mensaje' => 'El servidor está ocupado. Intenta de nuevo en unos segundos.'], 503)->header('Retry-After', '3');
        }
        return $this->internalError($req, $e);
    }

    private function internalError(Request $req, \Throwable $e): Response
    {
        Log::error('Error no controlado', ['ruta' => $req->method . ' ' . $req->path, 'error' => $e->getMessage(), 'archivo' => basename($e->getFile()) . ':' . $e->getLine()]);
        $body = ['error' => 'ERROR_INTERNO', 'mensaje' => 'Ocurrió un error inesperado. Intenta de nuevo; si se repite, avisa a soporte con el código ' . Log::requestId() . '.', 'solicitud' => Log::requestId()];
        if (!Env::isProduction() && Env::bool('APP_DEBUG')) {
            $body['detalle'] = $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine();
        }
        return Response::json($body, 500);
    }

    /** Responde y luego hace las tareas diferidas (los correos no hacen esperar a la persona) */
    /**
     * Punto de entrada web. Si la base de datos no responde (caída, mantenimiento o sin conexiones libres en horas pico),
     * contesta 503 con Retry-After en vez de una página en blanco; la app reintenta sola.
     * @param 'api'|'pagina'|'trampa' $kind
     */
    public static function boot(string $kind = 'api'): ?self
    {
        try {
            return new self();
        } catch (\PDOException $e) {
            Log::error('Sin conexión con la base de datos', ['error' => $e->getMessage(), 'tipo' => $kind]);
            if ($kind === 'trampa') {
                $res = Response::html('<!doctype html><meta charset="utf-8"><title>No encontrado</title><p>No encontrado.</p>', 404);
                Headers::document($res);
            } elseif ($kind === 'pagina') {
                $res = Response::html('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>En un momento</title><body style="font-family:-apple-system,system-ui,sans-serif;padding:48px 24px;color:#1D1D1F;background:#F5F5F7"><h1 style="font-size:24px">Volvemos en un momento</h1><p>Agora Digital App está muy ocupada o en mantenimiento. Vuelve a intentar en unos segundos.</p></body></html>', 503);
                Headers::document($res);
                $res->header('Retry-After', '10');
            } else {
                $res = Response::json(['error' => 'OCUPADO', 'mensaje' => 'El servidor está ocupado o en mantenimiento. Intenta de nuevo en unos segundos.'], 503);
                Headers::api($res);
                $res->header('Retry-After', '5');
            }
            self::emit($res);
            return null;
        }
    }

    public function run(): void
    {
        $req = Request::fromGlobals();
        $res = $this->handle($req);
        self::emit($res);
        $this->runDeferred();
    }

    public static function emit(Response $res): void
    {
        $res->send();
        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        } elseif (function_exists('litespeed_finish_request')) {
            litespeed_finish_request();
        } else {
            @ob_end_flush();
            @flush();
        }
    }

    // ---------------------------------------------------------------- página y trampa
    /** Página de la app: plantilla compilada + nonce para la política de contenido + datos de arranque */
    public function page(Request $req): Response
    {
        if ($this->ipGuard->isBlocked($req->ip)) {
            $r = Response::html('<!doctype html><html lang="es"><meta charset="utf-8"><title>Acceso bloqueado</title><body style="font-family:system-ui;padding:40px;color:#1D1D1F"><h1>Acceso bloqueado</h1><p>El acceso desde tu conexión está bloqueado temporalmente por seguridad.</p></body></html>', 403);
            Headers::document($r);
            return $r;
        }
        if ($hit = Waf::inspect($req, false)) {
            $this->tripwire->record($req, $hit['severity'], 'WAF', ['regla' => $hit['rule'], 'en' => $hit['where']]);
            return $this->tripwire->handle($req);
        }
        $tpl = AGORA_APP . '/templates/app.html';
        if (!is_file($tpl)) {
            $r = Response::html('<!doctype html><meta charset="utf-8"><title>Agora</title><p>Falta compilar la app (templates/app.html).</p>', 503);
            Headers::document($r);
            return $r;
        }
        $nonce = rtrim(strtr(base64_encode(random_bytes(18)), '+/', '-_'), '=');
        $s = null;
        try {
            $s = $this->sessions->load($req);
        } catch (\Throwable $e) {
            Log::warn('No se pudo leer la sesión al servir la página', ['error' => $e->getMessage()]);
        }
        $boot = [
            'api' => '/api/v1',
            'version' => self::VERSION,
            'version_texto' => self::VERSION_LABEL,
            'sesion' => $s ? $this->sessionPayload($s) : null,
            'entorno' => Env::str('APP_ENV', 'production'),
        ];
        $json = json_encode($boot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
        $html = str_replace(['{{NONCE}}', '{{ARRANQUE}}'], [$nonce, (string) $json], (string) file_get_contents($tpl));
        $r = Response::html($html);
        Headers::page($r, $nonce);
        return $r;
    }

    public function trap(Request $req): Response
    {
        $s = null;
        try {
            $s = $this->sessions->load($req);
        } catch (\Throwable) {
        }
        return $this->tripwire->handle($req, $s);
    }

    // ---------------------------------------------------------------- utilidades compartidas
    public static function iso(?string $ts): ?string
    {
        if ($ts === null || $ts === '') {
            return null;
        }
        return str_replace(' ', 'T', substr($ts, 0, 23)) . (strlen($ts) > 10 ? 'Z' : '');
    }

    /** Hace que la respuesta tarde al menos $ms (así no se distingue una cuenta que existe de una que no) */
    public static function padTo(float $startedAt, int $ms): void
    {
        if (Env::isTest()) {
            return;
        }
        $left = $ms / 1000 - (microtime(true) - $startedAt);
        if ($left > 0) {
            usleep((int) ($left * 1e6) + random_int(0, 150000));
        }
    }

    /** @param array<string,mixed> $s */
    public function sessionPayload(array $s): array
    {
        $uid = (int) $s['user_id'];
        $orgs = $this->db->all(
            "SELECT o.uid, o.name, o.plan, m.role FROM memberships m JOIN organizations o ON o.id = m.org_id WHERE m.user_id = ? AND m.status = 'ACTIVA' AND o.status = 'ACTIVA' ORDER BY o.name",
            [$uid]
        );
        $org = null;
        if ($s['org_id'] !== null) {
            $o = $this->db->one('SELECT uid, name, plan, timezone, max_users FROM organizations WHERE id = ?', [(int) $s['org_id']]);
            if ($o) {
                $org = ['uid' => $o['uid'], 'nombre' => $o['name'], 'plan' => $o['plan'], 'zona' => $o['timezone'], 'max_usuarios' => (int) $o['max_users']];
            }
        }
        $role = $s['role'] ?? null;
        return [
            'usuario' => [
                'uid' => $s['user_uid'], 'nombre' => $s['name'], 'correo' => $s['email'], 'rol' => $role, 'rol_nombre' => $role ? (Roles::LABELS[$role] ?? $role) : 'Plataforma',
                'permisos' => Roles::permsOf($role),
                'plataforma' => !empty($s['is_platform_admin']),
            ],
            'empresa' => $org,
            'empresas' => array_map(fn ($r) => ['uid' => $r['uid'], 'nombre' => $r['name'], 'plan' => $r['plan'], 'rol' => $r['role'], 'rol_nombre' => Roles::LABELS[$r['role']] ?? $r['role']], $orgs),
            'csrf' => (string) $s['csrf_token'],
            'edicion_hasta' => SessionManager::isElevated($s) ? self::iso((string) $s['elevated_until']) : null,
            'cerrados' => $s['org_id'] !== null ? $this->periods->closed((int) $s['org_id']) : [],
            'version' => self::VERSION,
            'hora_servidor' => self::iso(Clock::ts()),
        ];
    }
}
