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
use Agora\Notify\WhatsApp;
use Agora\Security\Password;
use Agora\Security\Roles;
use Agora\Security\SessionManager;
use Agora\Security\Validator;

/**
 * Acceso: clave + código (OTP) por correo o WhatsApp para Dirección, Superadministradores y quien lo active;
 * recuperación de la clave SOLO con un código enviado al correo o al WhatsApp registrado;
 * invitaciones; sesión, modo de edición y cambio de empresa.
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
        $r->add('POST', '/api/v1/acceso/codigo/enviar', fn (Ctx $c) => self::loginResend($c), $pub);
        $r->add('POST', '/api/v1/acceso/codigo/verificar', fn (Ctx $c) => self::loginVerify($c), $pub + ['rate' => ['acceso:otp:{ip}', 30, 900]]);
        $r->add('POST', '/api/v1/recuperar', fn (Ctx $c) => self::recoverStart($c), $pub + ['rate' => ['recuperar:ip:{ip}', 10, 3600]]);
        $r->add('POST', '/api/v1/recuperar/reenviar', fn (Ctx $c) => self::recoverResend($c), $pub);
        $r->add('POST', '/api/v1/recuperar/confirmar', fn (Ctx $c) => self::recoverConfirm($c), $pub + ['rate' => ['recuperar:conf:{ip}', 20, 900]]);
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
    private static function login(Ctx $c): Response|array
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
            throw new HttpError(429, 'DEMASIADAS_SOLICITUDES', 'Demasiados intentos fallidos desde tu conexión. Espera 15 minutos o recupera tu clave.', ['reintentar_en' => 900 - Clock::unix() % 900]);
        }
        $app->rate->enforce('acceso:correo:' . Ids::sha256($email), 8, 900, 'Demasiados intentos para esta cuenta. Espera 15 minutos o recupera tu clave.');
        $u = $app->db->one('SELECT * FROM users WHERE email = ?', [$email]);
        if (!$u) {
            Password::verify($pass, null); // mismo tiempo que con una cuenta real
            $app->rate->hit($failKey, PHP_INT_MAX, 900);
            throw new HttpError(401, 'CREDENCIALES', self::FAIL);
        }
        if ($u['locked_until'] && !Clock::isPast((string) $u['locked_until'])) {
            Password::verify($pass, null);
            throw new HttpError(429, 'DEMASIADAS_SOLICITUDES', 'Demasiados intentos para esta cuenta. Espera 15 minutos o recupera tu clave.', ['reintentar_en' => max(1, strtotime($u['locked_until'] . ' UTC') - Clock::unix())]);
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
        [$orgId, $role] = self::pickOrg($c, (int) $u['id'], !empty($u['is_platform_admin']));
        $needsMfa = !empty($u['mfa_enabled']) || !empty($u['is_platform_admin']) || ($role && in_array($role, Roles::MFA_REQUIRED, true)) || Env::bool('MFA_TODOS');
        if ($needsMfa && !$app->sessions->isTrustedDevice($c->req, (int) $u['id'])) {
            $cid = $app->otp->create('LOGIN', (int) $u['id'], $c->req->ip, ['org_id' => $orgId, 'action' => $remember ? 'RECORDAR' : null]);
            $channels = $app->otp->channelsFor((int) $u['id']);
            if (!$channels) {
                throw new HttpError(409, 'SIN_CANAL', 'Tu cuenta no tiene un correo verificado para recibir el código. Escríbele a soporte.');
            }
            $pref = $u['mfa_channel'] && in_array($u['mfa_channel'], array_column($channels, 'canal'), true) ? (string) $u['mfa_channel'] : $channels[0]['canal'];
            $sent = $app->otp->send($cid, $pref, $c->req->ip);
            return ['paso' => 'codigo', 'desafio' => $cid, 'canales' => $channels, 'motivo' => $role && in_array($role, Roles::MFA_REQUIRED, true) ? 'Tu rol exige verificación en dos pasos.' : 'Tienes activada la verificación en dos pasos.'] + $sent;
        }
        return self::startSession($c, $u, $orgId, $needsMfa, $remember, 'clave' . ($needsMfa ? ' en un equipo de confianza' : ''));
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
                '<p>Alguien intentó entrar a tu cuenta con una clave incorrecta 10 veces seguidas (última IP: ' . Templates::e($c->req->ip) . ').</p><p>Si fuiste tú, recupera tu clave con un código. Si no fuiste tú, no compartas tus códigos con nadie: tu cuenta queda en espera unos minutos tras cada intento.</p>');
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
    private static function startSession(Ctx $c, array $u, ?int $orgId, bool $mfa, bool $remember, string $how): Response
    {
        $app = $c->app;
        $uid = (int) $u['id'];
        $seenHere = (int) $app->db->value('SELECT COUNT(*) FROM sessions WHERE user_id = ? AND user_agent = ? AND created_at >= ?', [$uid, $c->req->userAgent(), Clock::ts(-90 * 86400)]);
        $hadAny = (int) $app->db->value('SELECT COUNT(*) FROM sessions WHERE user_id = ?', [$uid]);
        $res = Response::json([]);
        $app->sessions->create($c->req, $res, $uid, $orgId, $mfa, $remember);
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

    private static function loginResend(Ctx $c): array
    {
        $d = $c->json();
        $cid = (string) ($d['desafio'] ?? '');
        $ch = $c->app->otp->peek($cid);
        if ($ch['purpose'] !== 'LOGIN') {
            throw new HttpError(422, 'DESAFIO_INVALIDO', 'La solicitud de código no es válida. Empieza de nuevo.');
        }
        return $c->app->otp->send($cid, (string) ($d['canal'] ?? $ch['channel'] ?? 'EMAIL'), $c->req->ip);
    }

    private static function loginVerify(Ctx $c): Response
    {
        $d = $c->json();
        $app = $c->app;
        try {
            $ch = $app->otp->verify((string) ($d['desafio'] ?? ''), (string) ($d['codigo'] ?? ''), 'LOGIN');
        } catch (HttpError $e) {
            if (in_array($e->errorCode, ['CODIGO_INCORRECTO', 'CODIGO_BLOQUEADO'], true)) {
                $app->alerts->event($e->errorCode === 'CODIGO_BLOQUEADO' ? 'OTP_ABUSO' : 'OTP_FALLIDO', $e->errorCode === 'CODIGO_BLOQUEADO' ? 'MEDIA' : 'BAJA', $c->req->ip, $c->req->method, $c->req->path, $c->req->userAgent(), ['proposito' => 'LOGIN']);
            }
            throw $e;
        }
        $u = $app->db->one('SELECT * FROM users WHERE id = ?', [(int) $ch['user_id']]);
        if (!$u || $u['status'] !== 'ACTIVO') {
            throw new HttpError(401, 'CREDENCIALES', self::FAIL);
        }
        $orgId = $ch['org_id'] !== null ? (int) $ch['org_id'] : null;
        $res = self::startSession($c, $u, $orgId, true, $ch['action'] === 'RECORDAR', 'clave y código por ' . ($ch['channel'] === 'WHATSAPP' ? 'WhatsApp' : 'correo'));
        if (!empty($d['recordar_equipo'])) {
            $app->sessions->trustDevice($c->req, $res, (int) $u['id']);
        }
        return $res;
    }

    // ------------------------------------------------------------------ recuperar la clave (solo con código)
    private static function recoverStart(Ctx $c): array
    {
        $t0 = microtime(true);
        $d = $c->json();
        $raw = trim((string) ($d['identificador'] ?? ''));
        $email = Validator::email($raw);
        $phone = $email ? null : Validator::phone($raw);
        if (!$email && !$phone) {
            throw HttpError::badRequest('Escribe tu correo o tu número de WhatsApp (con el código del país, por ejemplo +58 412 1234567).');
        }
        if ($phone && !WhatsApp::configured()) {
            throw new HttpError(409, 'CANAL_NO_DISPONIBLE', 'La recuperación por WhatsApp no está disponible en este momento. Usa tu correo.');
        }
        $channel = $email ? 'EMAIL' : 'WHATSAPP';
        $dest = (string) ($email ?? $phone);
        $app = $c->app;
        $app->rate->enforce('recuperar:dest:' . Ids::sha256($dest), 5, 3600, 'Ya pediste varios códigos para este dato. Espera una hora.');
        $uid = $app->db->value(
            "SELECT u.id FROM user_contacts uc JOIN users u ON u.id = uc.user_id WHERE uc.channel = ? AND uc.contact_value = ? AND uc.verified_at IS NOT NULL AND u.status = 'ACTIVO' ORDER BY uc.is_primary DESC LIMIT 1",
            [$channel, $dest]
        );
        $cid = $app->otp->create('RECUPERACION', $uid !== null ? (int) $uid : null, $c->req->ip, ['channel' => $channel, 'destination' => $dest]);
        $sent = $app->otp->send($cid, $channel, $c->req->ip, true);
        if ($uid !== null) {
            $app->alerts->event('RECUPERACION', 'BAJA', $c->req->ip, $c->req->method, $c->req->path, $c->req->userAgent(), ['canal' => $channel], null, (int) $uid, false);
        }
        App::padTo($t0, Env::int('RECOVERY_MIN_MS', 1200));
        return ['desafio' => $cid, 'mensaje' => 'Si el dato corresponde a una cuenta, te enviamos un código de 6 dígitos. Vence en ' . $sent['minutos'] . ' minutos.'] + $sent;
    }

    private static function recoverResend(Ctx $c): array
    {
        $t0 = microtime(true);
        $cid = (string) ($c->json()['desafio'] ?? '');
        $ch = $c->app->otp->peek($cid);
        if ($ch['purpose'] !== 'RECUPERACION') {
            throw new HttpError(422, 'DESAFIO_INVALIDO', 'La solicitud de código no es válida. Empieza de nuevo.');
        }
        $sent = $c->app->otp->send($cid, (string) $ch['channel'], $c->req->ip, true);
        App::padTo($t0, Env::int('RECOVERY_MIN_MS', 1200));
        return $sent;
    }

    private static function recoverConfirm(Ctx $c): array
    {
        $d = $c->json();
        $app = $c->app;
        $cid = (string) ($d['desafio'] ?? '');
        $pass = is_string($d['clave'] ?? null) ? $d['clave'] : '';
        Password::assertPolicy($pass); // reglas generales antes de tocar el código
        try {
            $ch = $app->otp->check($cid, (string) ($d['codigo'] ?? ''), 'RECUPERACION');
        } catch (HttpError $e) {
            if ($e->errorCode === 'CODIGO_BLOQUEADO') {
                $app->alerts->event('OTP_ABUSO', 'MEDIA', $c->req->ip, $c->req->method, $c->req->path, $c->req->userAgent(), ['proposito' => 'RECUPERACION']);
            }
            throw $e;
        }
        $u = $app->db->one('SELECT * FROM users WHERE id = ?', [(int) $ch['user_id']]);
        if (!$u || $u['status'] !== 'ACTIVO') {
            throw new HttpError(422, 'CODIGO_INCORRECTO', 'Código incorrecto.');
        }
        Password::assertPolicy($pass, (string) $u['email'], (string) $u['name']);
        if (Password::verify($pass, (string) $u['password_hash'])) {
            throw HttpError::badRequest('La clave nueva debe ser distinta de la anterior.');
        }
        $app->otp->consume($ch);
        $uid = (int) $u['id'];
        $app->db->transaction(function () use ($app, $uid, $pass) {
            $app->db->update('users', ['password_hash' => Password::hash($pass), 'password_changed_at' => Clock::ts(), 'failed_logins' => 0, 'locked_until' => null, 'updated_at' => Clock::ts()], ['id' => $uid]);
            $app->sessions->revokeAllForUser($uid, 'clave_restablecida');
            $app->sessions->revokeDevices($uid);
            $app->db->exec('UPDATE step_up_grants SET expires_at = ? WHERE user_id = ? AND expires_at > ?', [Clock::ts(), $uid, Clock::ts()]);
        });
        $via = $ch['channel'] === 'WHATSAPP' ? 'WhatsApp' : 'correo';
        foreach ($app->db->all("SELECT org_id, role FROM memberships WHERE user_id = ? AND status = 'ACTIVA'", [$uid]) as $m) {
            $app->audit->log((int) $m['org_id'], ['user_id' => $uid, 'email' => $u['email'], 'role' => $m['role'], 'ip' => $c->req->ip], 'acceso', 'restableció su clave con un código enviado por ' . $via);
        }
        $app->alerts->event('CLAVE_RESTABLECIDA', 'MEDIA', $c->req->ip, $c->req->method, $c->req->path, $c->req->userAgent(), ['canal' => $ch['channel']], null, $uid, false);
        [$s, $t, $h] = Templates::simple('Tu clave de Agora cambió', 'Se restableció tu clave',
            '<p>Tu clave se cambió con un código enviado por ' . $via . ' (IP ' . Templates::e($c->req->ip) . '). Por seguridad, cerramos todas tus sesiones abiertas.</p><p>Si no fuiste tú, escríbele de inmediato al administrador de tu empresa o a soporte de Agora.</p>');
        $email = (string) $u['email'];
        $app->defer(fn () => $app->outbox->email($email, $s, $t, $h, 'clave_restablecida', null, 2));
        return ['ok' => true, 'mensaje' => 'Listo. Ya puedes entrar con tu clave nueva.'];
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
                    'is_platform_admin' => 0, 'mfa_enabled' => in_array($inv['role'], Roles::MFA_REQUIRED, true) ? 1 : 0, 'mfa_channel' => 'EMAIL', 'failed_logins' => 0, 'locked_until' => null,
                    'last_login_at' => null, 'last_login_ip' => null, 'created_at' => Clock::ts(), 'updated_at' => Clock::ts(),
                ]);
                // el enlace llegó a ese correo: queda verificado
                $app->db->insert('user_contacts', ['user_id' => $uid, 'channel' => 'EMAIL', 'contact_value' => $email, 'verified_at' => Clock::ts(), 'is_primary' => 1, 'created_at' => Clock::ts()]);
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
        return self::startSession($c, $u, $result['org'], true, false, 'invitación aceptada');
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
        if (in_array($row['role'], Roles::MFA_REQUIRED, true) && empty($s['mfa_passed'])) {
            throw new HttpError(403, 'REQUIERE_CODIGO', 'Para usar esa empresa tu rol exige entrar con código. Sal y vuelve a entrar.');
        }
        $u = $c->app->db->one('SELECT * FROM users WHERE id = ?', [(int) $s['user_id']]);
        $remember = strtotime((string) $s['expires_at'] . ' UTC') - strtotime((string) $s['created_at'] . ' UTC') > 86400;
        $c->app->sessions->revoke((string) $s['id'], 'cambio_empresa');
        $c->app->db->upsert('user_prefs', ['user_id' => (int) $s['user_id'], 'pref_key' => 'srv_ultima_empresa', 'pref_value' => (string) $row['id'], 'updated_at' => Clock::ts()], ['user_id', 'pref_key'], ['pref_value', 'updated_at']);
        return self::startSession($c, $u ?? [], (int) $row['id'], !empty($s['mfa_passed']), $remember, 'cambio de empresa');
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
