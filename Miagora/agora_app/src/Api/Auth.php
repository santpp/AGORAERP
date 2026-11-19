<?php
declare(strict_types=1);

namespace Agora\Api;

use Agora\App;
use Agora\Core\Clock;
use Agora\Core\Env;
use Agora\Core\Ids;
use Agora\Http\HttpError;
use Agora\Http\Request;
use Agora\Http\Response;
use Agora\Http\Router;
use Agora\Notify\Templates;
use Agora\Security\Password;
use Agora\Security\Roles;
use Agora\Security\SessionManager;
use Agora\Security\Validator;

/**
 * Acceso con correo y clave; invitaciones; sesión, modo de edición y cambio de empresa.
 */
final class Auth
{
    private const FAIL = 'Correo o clave incorrectos.';

    public static function routes(Router $r, App $app): void
    {
        $pub = ['auth' => false, 'org' => false];
        // Muchas personas comparten IP (oficinas, datos móviles con CGNAT): el tope por IP es amplio para entradas
        // correctas y estricto para FALLIDAS (RATE_LOGIN_FAIL_IP, dentro de login). Por cuenta: 8 intentos y espera creciente.
        $r->add('POST', '/api/v1/acceso', fn (Ctx $c) => self::login($c), $pub + ['rate' => ['acceso:ip:{ip}', Env::int('RATE_LOGIN_IP', 300), 900]]);
        $r->add('GET', '/api/v1/invitacion/{token}', fn (Ctx $c) => self::invitationInfo($c), $pub + ['rate' => ['invitacion:ip:{ip}', 30, 900]]);
        $r->add('POST', '/api/v1/invitacion/aceptar', fn (Ctx $c) => self::invitationAccept($c), $pub + ['rate' => ['invitacion:ok:{ip}', 10, 900]]);
        $r->add('GET', '/api/v1/sesion', fn (Ctx $c) => $c->app->sessionPayload($c->s()), ['org' => false]);
        $r->add('POST', '/api/v1/sesion/edicion', fn (Ctx $c) => self::elevate($c), ['org' => false, 'rate' => ['edicion:{user}', 10, 900]]);
        $r->add('POST', '/api/v1/sesion/edicion/cerrar', fn (Ctx $c) => self::unelevate($c), ['org' => false]);
        $r->add('POST', '/api/v1/sesion/empresa', fn (Ctx $c) => self::switchOrg($c), ['org' => false]);
        $r->add('POST', '/api/v1/salir', fn (Ctx $c) => self::logout($c), ['org' => false]);
        $r->add('GET', '/api/v1/salud', fn (Ctx $c) => self::health($c), $pub);
    }

    // ------------------------------------------------------------------ entrar
    private static function login(Ctx $c): Response
    {
        $d = $c->json();
        $email = Validator::email($d['correo'] ?? '');
        $pass = is_string($d['clave'] ?? null) ? $d['clave'] : '';
        $remember = !empty($d['recordar']);
        if (!$email || $pass === '' || strlen($pass) > 256) {
            throw HttpError::badRequest('Escribe tu correo y tu clave.');
        }
        $app = $c->app;
        $failKey = 'acceso:fallos:ip:' . $c->req->ip;
        if ($app->rate->count($failKey, 900) >= Env::int('RATE_LOGIN_FAIL_IP', 30)) {
            throw new HttpError(429, 'DEMASIADAS_SOLICITUDES', 'Demasiados intentos fallidos desde tu conexión. Espera 15 minutos.', ['reintentar_en' => 900 - Clock::unix() % 900]);
        }
        $app->rate->enforce('acceso:correo:' . Ids::sha256($email), 8, 900, 'Demasiados intentos para esta cuenta. Espera 15 minutos.');
        $u = $app->db->one('SELECT * FROM users WHERE email = ?', [$email]);
        if (!$u) {
            Password::verify($pass, null); // mismo tiempo que con una cuenta real
            $app->rate->hit($failKey, PHP_INT_MAX, 900);
            throw new HttpError(401, 'CREDENCIALES', self::FAIL);
        }
        if ($u['locked_until'] && !Clock::isPast((string) $u['locked_until'])) {
            Password::verify($pass, null);
            throw new HttpError(429, 'DEMASIADAS_SOLICITUDES', 'Demasiados intentos para esta cuenta. Espera 15 minutos.', ['reintentar_en' => max(1, strtotime($u['locked_until'] . ' UTC') - Clock::unix())]);
        }
        if (!Password::verify($pass, $u['password_hash'])) {
            $app->rate->hit($failKey, PHP_INT_MAX, 900);
            self::failed($c, $u);
            throw new HttpError(401, 'CREDENCIALES', self::FAIL);
        }
        if ($u['status'] !== 'ACTIVO') {
            throw new HttpError(401, 'CREDENCIALES', self::FAIL);
        }
        $upd = ['failed_logins' => 0, 'locked_until' => null, 'updated_at' => Clock::ts()];
        if (Password::needsRehash((string) $u['password_hash'])) {
            $upd['password_hash'] = Password::hash($pass);
        }
        $app->db->update('users', $upd, ['id' => (int) $u['id']]);
        [$orgId] = self::pickOrg($c, (int) $u['id'], !empty($u['is_platform_admin']));
        return self::startSession($c, $u, $orgId, $remember, 'clave');
    }

    /** @param array<string,mixed> $u */
    private static function failed(Ctx $c, array $u): void
    {
        $n = (int) $u['failed_logins'] + 1;
        // la espera de la cuenta empieza en el mismo intento que el límite por correo (8), con el mismo mensaje:
        // así no se distingue una cuenta que existe de una que no
        $lock = $n >= 8 ? Clock::ts(min(3600, 60 * 2 ** min(6, $n - 8))) : null;
        $c->app->db->update('users', ['failed_logins' => $n, 'locked_until' => $lock, 'updated_at' => Clock::ts()], ['id' => (int) $u['id']]);
        $sev = $n >= 10 ? 'ALTA' : ($n >= 5 ? 'MEDIA' : 'BAJA');
        $c->app->alerts->event($n >= 10 ? 'LOGIN_FUERZA' : 'ACCESO_FALLIDO', $sev, $c->req->ip, $c->req->method, $c->req->path, $c->req->userAgent(), ['cuenta' => $u['uid'], 'intentos' => $n], null, (int) $u['id'], $n === 10 || $n === 20);
        if ($n === 10) {
            // aviso a la persona: alguien está probando su clave
            [$s, $t, $h] = Templates::simple('Intentos fallidos en tu cuenta de Agora', 'Hubo 10 intentos fallidos de entrar a tu cuenta',
                '<p>Alguien intentó entrar a tu cuenta con una clave incorrecta 10 veces seguidas (última IP: ' . Templates::e($c->req->ip) . ').</p><p>Si no fuiste tú, tu cuenta queda en espera unos minutos tras cada intento.</p>');
            $email = (string) $u['email'];
            $c->app->defer(fn () => $c->app->outbox->email($email, $s, $t, $h, 'intentos_fallidos', null, 2));
        }
    }

    /** @return array{0:?int,1:?string} empresa y rol con que se entra */
    private static function pickOrg(Ctx $c, int $userId, bool $platform): array
    {
        $rows = $c->app->db->all("SELECT m.org_id, m.role FROM memberships m JOIN organizations o ON o.id = m.org_id WHERE m.user_id = ? AND m.status = 'ACTIVA' AND o.status = 'ACTIVA' ORDER BY m.created_at", [$userId]);
        if (!$rows) {
            if ($platform) {
                return [null, null];
            }
            throw new HttpError(403, 'SIN_EMPRESA', 'Tu acceso no está asociado a ninguna empresa activa. Escríbele al administrador de tu empresa.');
        }
        $last = $c->app->db->value("SELECT pref_value FROM user_prefs WHERE user_id = ? AND pref_key = 'srv_ultima_empresa'", [$userId]);
        foreach ($rows as $r) {
            if ((string) $r['org_id'] === (string) $last) {
                return [(int) $r['org_id'], (string) $r['role']];
            }
        }
        return [(int) $rows[0]['org_id'], (string) $rows[0]['role']];
    }

    /** @param array<string,mixed> $u */
    private static function startSession(Ctx $c, array $u, ?int $orgId, bool $remember, string $how): Response
    {
        $app = $c->app;
        $uid = (int) $u['id'];
        $seenHere = (int) $app->db->value('SELECT COUNT(*) FROM sessions WHERE user_id = ? AND user_agent = ? AND created_at >= ?', [$uid, $c->req->userAgent(), Clock::ts(-90 * 86400)]);
        $hadAny = (int) $app->db->value('SELECT COUNT(*) FROM sessions WHERE user_id = ?', [$uid]);
        $res = Response::json([]);
        $app->sessions->create($c->req, $res, $uid, $orgId, $remember);
        $app->db->update('users', ['last_login_at' => Clock::ts(), 'last_login_ip' => $c->req->ip], ['id' => $uid]);
        $s = $app->sessions->load(self::withCookie($c->req, $res));
        if (!$s) {
            throw new \RuntimeException('No se pudo abrir la sesión');
        }
        if ($orgId !== null) {
            $app->audit->log($orgId, ['user_id' => $uid, 'email' => $u['email'], 'role' => $s['role'] ?? '', 'ip' => $c->req->ip], 'acceso', 'inició sesión (' . $how . ')');
        }
        if ($hadAny > 0 && $seenHere === 0) {
            // equipo o navegador nuevo: aviso por correo (ayuda a detectar un robo de cuenta)
            [$sj, $t, $h] = Templates::simple('Nuevo inicio de sesión en Agora', 'Entraste desde un equipo nuevo',
                '<p>Se inició sesión en tu cuenta desde un navegador que no habías usado (IP ' . Templates::e($c->req->ip) . ', ' . Templates::e(mb_substr($c->req->userAgent(), 0, 120)) . ').</p><p>Si no fuiste tú, cambia tu clave y cierra las demás sesiones en Ajustes → Seguridad.</p>');
            $email = (string) $u['email'];
            $app->defer(fn () => $app->outbox->email($email, $sj, $t, $h, 'nuevo_equipo', $orgId, 3));
        }
        $res->body = (string) json_encode(['paso' => 'listo', 'sesion' => $app->sessionPayload($s)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        return $res;
    }

    /** Petición igual a la original pero con la cookie recién creada (para leer la sesión en la misma respuesta) */
    private static function withCookie(Request $req, Response $res): Request
    {
        $r = clone $req;
        foreach ($res->cookies as $ck) {
            if ($ck['name'] === SessionManager::cookieName()) {
                $r->cookies[$ck['name']] = $ck['value'];
            }
        }
        return $r;
    }

    // ------------------------------------------------------------------ invitaciones
    /** @return array<string,mixed> */
    private static function invitation(Ctx $c, string $token, bool $lock = false): array
    {
        if (!preg_match('/^[A-Za-z0-9_-]{30,80}$/', $token)) {
            throw HttpError::notFound('La invitación no existe o ya venció.');
        }
        $inv = $c->app->db->one('SELECT i.*, o.name AS org_name, o.status AS org_status, o.max_users FROM invitations i JOIN organizations o ON o.id = i.org_id WHERE i.token_hash = ?' . ($lock ? $c->app->db->forUpdate() : ''), [Ids::sha256($token)]);
        if (!$inv || $inv['accepted_at'] !== null || $inv['revoked_at'] !== null || Clock::isPast((string) $inv['expires_at']) || $inv['org_status'] !== 'ACTIVA') {
            throw HttpError::notFound('La invitación no existe, ya se usó o venció. Pide una nueva.');
        }
        return $inv;
    }

    private static function invitationInfo(Ctx $c): array
    {
        $inv = self::invitation($c, $c->param('token'));
        $exists = $c->app->db->one('SELECT name FROM users WHERE email = ?', [(string) $inv['email']]);
        return ['empresa' => $inv['org_name'], 'rol' => $inv['role'], 'rol_nombre' => Roles::LABELS[$inv['role']] ?? $inv['role'], 'correo' => $inv['email'], 'existe' => (bool) $exists, 'vence' => App::iso((string) $inv['expires_at'])];
    }

    private static function invitationAccept(Ctx $c): Response|array
    {
        $d = $c->json();
        $app = $c->app;
        $token = (string) ($d['token'] ?? '');
        $pass = is_string($d['clave'] ?? null) ? $d['clave'] : '';
        $result = $app->db->transaction(function () use ($c, $app, $token, $pass, $d) {
            $inv = self::invitation($c, $token, true);
            $email = (string) $inv['email'];
            $u = $app->db->one('SELECT * FROM users WHERE email = ?', [$email]);
            $isNew = !$u;
            if ($u) {
                if ($u['status'] !== 'ACTIVO' || !Password::verify($pass, (string) $u['password_hash'])) {
                    throw new HttpError(422, 'CREDENCIALES', 'Ya tienes una cuenta con este correo: escribe tu clave actual para aceptar.');
                }
                $uid = (int) $u['id'];
            } else {
                $name = Validator::str($d, 'nombre', 'Tu nombre', 2, 120);
                Password::assertPolicy($pass, $email, (string) $name);
                $uid = $app->db->insert('users', [
                    'uid' => Ids::ulid(), 'email' => $email, 'name' => $name, 'password_hash' => Password::hash($pass), 'password_changed_at' => Clock::ts(), 'status' => 'ACTIVO',
                    'is_platform_admin' => 0, 'failed_logins' => 0, 'locked_until' => null,
                    'last_login_at' => null, 'last_login_ip' => null, 'created_at' => Clock::ts(), 'updated_at' => Clock::ts(),
                ]);
                $u = $app->db->one('SELECT * FROM users WHERE id = ?', [$uid]);
            }
            if ($app->db->value('SELECT 1 FROM memberships WHERE org_id = ? AND user_id = ?', [(int) $inv['org_id'], $uid])) {
                throw new HttpError(409, 'YA_MIEMBRO', 'Ya formas parte de esta empresa.');
            }
            $max = (int) $inv['max_users'];
            $active = (int) $app->db->value("SELECT COUNT(*) FROM memberships WHERE org_id = ? AND status = 'ACTIVA'", [(int) $inv['org_id']]);
            if ($max > 0 && $active >= $max) {
                throw new HttpError(409, 'PLAN_LLENO', 'La empresa llegó al máximo de personas de su plan. Pídele al administrador que suba de plan.');
            }
            $app->db->insert('memberships', ['org_id' => (int) $inv['org_id'], 'user_id' => $uid, 'role' => $inv['role'], 'status' => 'ACTIVA', 'created_at' => Clock::ts(), 'created_by' => $inv['invited_by'], 'updated_at' => Clock::ts()]);
            $app->db->update('invitations', ['accepted_at' => Clock::ts()], ['id' => (int) $inv['id']]);
            $app->audit->log((int) $inv['org_id'], ['user_id' => $uid, 'email' => $email, 'role' => $inv['role'], 'ip' => $c->req->ip], 'usuarios', 'aceptó la invitación como ' . (Roles::LABELS[$inv['role']] ?? $inv['role']));
            $app->db->upsert('user_prefs', ['user_id' => $uid, 'pref_key' => 'srv_ultima_empresa', 'pref_value' => (string) $inv['org_id'], 'updated_at' => Clock::ts()], ['user_id', 'pref_key'], ['pref_value', 'updated_at']);
            return ['u' => $u, 'org' => (int) $inv['org_id'], 'org_name' => (string) $inv['org_name'], 'nuevo' => $isNew, 'role' => (string) $inv['role']];
        });
        $u = $result['u'];
        $app->alerts->org($result['org'], 'Nueva persona en ' . $result['org_name'], 'Se unió una persona a tu empresa',
            '<p>' . Templates::e((string) $u['name']) . ' (' . Templates::e((string) $u['email']) . ') aceptó la invitación como <b>' . Templates::e(Roles::LABELS[$result['role']] ?? $result['role']) . '</b>.</p>');
        if (!$result['nuevo']) {
            return ['paso' => 'entrar', 'mensaje' => 'Listo: ya formas parte de ' . $result['org_name'] . '. Entra con tu correo y tu clave.'];
        }
        return self::startSession($c, $u, $result['org'], false, 'invitación aceptada');
    }

    // ------------------------------------------------------------------ sesión
    private static function elevate(Ctx $c): array
    {
        $s = $c->s();
        $pass = is_string($c->json()['clave'] ?? null) ? $c->json()['clave'] : '';
        $hash = $c->app->db->value('SELECT password_hash FROM users WHERE id = ?', [(int) $s['user_id']]);
        if ($pass === '' || !Password::verify($pass, $hash !== null ? (string) $hash : null)) {
            $c->app->alerts->event('EDICION_FALLIDA', 'BAJA', $c->req->ip, $c->req->method, $c->req->path, $c->req->userAgent(), [], $s['org_id'] !== null ? (int) $s['org_id'] : null, (int) $s['user_id'], false);
            throw new HttpError(422, 'CLAVE_INCORRECTA', 'Clave incorrecta.');
        }
        $min = max(5, min(60, Env::int('EDIT_MINUTES', 15)));
        $until = $c->app->sessions->elevate((string) $s['id'], $min);
        if ($s['org_id'] !== null) {
            $c->audit('seguridad', 'abrió el modo de edición (' . $min . ' min)');
        }
        return ['edicion_hasta' => App::iso($until), 'minutos' => $min];
    }

    private static function unelevate(Ctx $c): array
    {
        $c->app->db->update('sessions', ['elevated_until' => null], ['id' => (string) $c->s()['id']]);
        return ['ok' => true];
    }

    private static function switchOrg(Ctx $c): Response
    {
        $s = $c->s();
        $uidOrg = (string) ($c->json()['empresa'] ?? '');
        $row = $c->app->db->one("SELECT o.id, m.role FROM organizations o JOIN memberships m ON m.org_id = o.id AND m.user_id = ? WHERE o.uid = ? AND o.status = 'ACTIVA' AND m.status = 'ACTIVA'", [(int) $s['user_id'], $uidOrg]);
        if (!$row) {
            throw HttpError::notFound('No tienes acceso a esa empresa.');
        }
        $u = $c->app->db->one('SELECT * FROM users WHERE id = ?', [(int) $s['user_id']]);
        $remember = strtotime((string) $s['expires_at'] . ' UTC') - strtotime((string) $s['created_at'] . ' UTC') > 86400;
        $c->app->sessions->revoke((string) $s['id'], 'cambio_empresa');
        $c->app->db->upsert('user_prefs', ['user_id' => (int) $s['user_id'], 'pref_key' => 'srv_ultima_empresa', 'pref_value' => (string) $row['id'], 'updated_at' => Clock::ts()], ['user_id', 'pref_key'], ['pref_value', 'updated_at']);
        return self::startSession($c, $u ?? [], (int) $row['id'], $remember, 'cambio de empresa');
    }

    private static function logout(Ctx $c): Response
    {
        $s = $c->s();
        $c->app->sessions->revoke((string) $s['id'], 'salida');
        if ($s['org_id'] !== null) {
            $c->audit('acceso', 'cerró sesión');
        }
        $res = Response::json(['ok' => true]);
        $c->app->sessions->clearCookie($res);
        return $res;
    }

    private static function health(Ctx $c): array
    {
        $ok = true;
        try {
            $c->app->db->value('SELECT 1');
        } catch (\Throwable) {
            $ok = false;
        }
        return ['ok' => $ok, 'version' => App::VERSION, 'hora' => App::iso(Clock::ts())];
    }
}
