<?php
declare(strict_types=1);

namespace Agora\Api;

use Agora\App;
use Agora\Core\Clock;
use Agora\Core\Ids;
use Agora\Http\HttpError;
use Agora\Http\Router;
use Agora\Notify\Templates;
use Agora\Notify\WhatsApp;
use Agora\Security\Otp;
use Agora\Security\Password;
use Agora\Security\Roles;
use Agora\Security\StepUp;
use Agora\Security\Validator;

/**
 * Mi cuenta: nombre, clave, correo y WhatsApp de verificación, verificación en dos pasos,
 * sesiones abiertas y equipos de confianza. Todo cambio de contacto o de verificación exige un código
 * al canal que ya tienes (y, si agregas uno nuevo, otro código a ese canal).
 */
final class Account
{
    public static function routes(Router $r, App $app): void
    {
        $o = ['org' => false];
        $r->add('GET', '/api/v1/perfil', fn (Ctx $c) => self::profile($c), $o);
        $r->add('POST', '/api/v1/perfil/nombre', fn (Ctx $c) => self::rename($c), $o);
        $r->add('POST', '/api/v1/perfil/clave', fn (Ctx $c) => self::password($c), $o + ['rate' => ['perfil:clave:{user}', 6, 900]]);
        $r->add('POST', '/api/v1/perfil/contactos', fn (Ctx $c) => self::contactAdd($c), $o + ['rate' => ['perfil:contacto:{user}', 10, 3600]]);
        $r->add('POST', '/api/v1/perfil/contactos/verificar', fn (Ctx $c) => self::contactVerify($c), $o + ['rate' => ['perfil:contacto-v:{user}', 20, 900]]);
        $r->add('POST', '/api/v1/perfil/contactos/{id}/quitar', fn (Ctx $c) => self::contactRemove($c), $o);
        $r->add('POST', '/api/v1/perfil/mfa', fn (Ctx $c) => self::mfa($c), $o);
        $r->add('POST', '/api/v1/perfil/sesiones/{id}/cerrar', fn (Ctx $c) => self::closeSession($c), $o);
        $r->add('POST', '/api/v1/perfil/sesiones/cerrar-otras', fn (Ctx $c) => self::closeOthers($c), $o);
        $r->add('POST', '/api/v1/perfil/equipos/olvidar', fn (Ctx $c) => self::forgetDevices($c), $o);
    }

    public static function handle(string $sessionId): string
    {
        return substr(hash('sha256', 'sesion|' . $sessionId), 0, 20);
    }

    private static function profile(Ctx $c): array
    {
        $s = $c->s();
        $uid = (int) $s['user_id'];
        $u = $c->app->db->one('SELECT name, email, mfa_enabled, mfa_channel, password_changed_at, created_at FROM users WHERE id = ?', [$uid]) ?? [];
        $contacts = array_map(fn ($r) => [
            'id' => (int) $r['id'], 'canal' => $r['channel'], 'valor' => $r['contact_value'], 'verificado' => $r['verified_at'] !== null, 'principal' => (bool) $r['is_primary'],
        ], $c->app->db->all('SELECT id, channel, contact_value, verified_at, is_primary FROM user_contacts WHERE user_id = ? ORDER BY channel, is_primary DESC, id', [$uid]));
        $sessions = array_map(fn ($r) => [
            'id' => self::handle((string) $r['id']), 'ip' => $r['ip'], 'equipo' => mb_substr((string) $r['user_agent'], 0, 140), 'creada' => App::iso((string) $r['created_at']),
            'ultima' => App::iso((string) $r['last_seen_at']), 'actual' => $r['id'] === $s['id'],
        ], $c->app->db->all('SELECT id, ip, user_agent, created_at, last_seen_at FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? AND idle_expires_at > ? ORDER BY last_seen_at DESC LIMIT 30', [$uid, Clock::ts(), Clock::ts()]));
        $role = $s['role'] ?? null;
        return [
            'nombre' => $u['name'] ?? '', 'correo' => $u['email'] ?? '', 'desde' => App::iso($u['created_at'] ?? null), 'clave_cambiada' => App::iso($u['password_changed_at'] ?? null),
            'contactos' => $contacts,
            'mfa' => ['activa' => !empty($u['mfa_enabled']) || ($role && in_array($role, Roles::MFA_REQUIRED, true)), 'obligatoria' => ($role && in_array($role, Roles::MFA_REQUIRED, true)) || !empty($s['is_platform_admin']), 'canal' => $u['mfa_channel'] ?? null],
            'sesiones' => $sessions,
            'equipos_confianza' => (int) $c->app->db->value('SELECT COUNT(*) FROM trusted_devices WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?', [$uid, Clock::ts()]),
            'whatsapp_disponible' => WhatsApp::configured(),
        ];
    }

    private static function rename(Ctx $c): array
    {
        $name = Validator::str($c->json(), 'nombre', 'Tu nombre', 2, 120);
        $c->app->db->update('users', ['name' => $name, 'updated_at' => Clock::ts()], ['id' => $c->userId()]);
        return ['ok' => true, 'nombre' => $name];
    }

    private static function password(Ctx $c): array
    {
        $s = $c->s();
        $d = $c->json();
        $u = $c->app->db->one('SELECT email, name, password_hash FROM users WHERE id = ?', [(int) $s['user_id']]);
        $old = is_string($d['actual'] ?? null) ? $d['actual'] : '';
        $new = is_string($d['nueva'] ?? null) ? $d['nueva'] : '';
        if (!$u || !Password::verify($old, (string) $u['password_hash'])) {
            throw new HttpError(422, 'CLAVE_INCORRECTA', 'La clave actual no es correcta.');
        }
        Password::assertPolicy($new, (string) $u['email'], (string) $u['name']);
        if (hash_equals($old, $new)) {
            throw HttpError::badRequest('La clave nueva debe ser distinta de la actual.');
        }
        $uid = (int) $s['user_id'];
        $closed = $c->app->db->transaction(function () use ($c, $uid, $new, $s) {
            $c->app->db->update('users', ['password_hash' => Password::hash($new), 'password_changed_at' => Clock::ts(), 'updated_at' => Clock::ts()], ['id' => $uid]);
            $c->app->sessions->revokeDevices($uid);
            return $c->app->sessions->revokeAllForUser($uid, 'cambio_clave', (string) $s['id']);
        });
        if ($s['org_id'] !== null) {
            $c->audit('seguridad', 'cambió su clave de acceso');
        }
        [$sj, $t, $h] = Templates::simple('Cambiaste tu clave de Agora', 'Tu clave cambió', '<p>La clave de tu cuenta se cambió desde la IP ' . Templates::e($c->req->ip) . '. Cerramos tus otras sesiones (' . $closed . ').</p><p>Si no fuiste tú, recupera tu clave con un código y escríbele a soporte.</p>');
        $email = (string) $u['email'];
        $c->app->defer(fn () => $c->app->outbox->email($email, $sj, $t, $h, 'clave_cambiada', null, 2));
        return ['ok' => true, 'sesiones_cerradas' => $closed];
    }

    private static function contactAdd(Ctx $c): array
    {
        $s = $c->s();
        $d = $c->json();
        $channel = Validator::enum(strtoupper((string) ($d['canal'] ?? '')), ['EMAIL', 'WHATSAPP'], 'Canal');
        $value = $channel === 'EMAIL' ? Validator::email($d['valor'] ?? '') : Validator::phone($d['valor'] ?? '');
        if (!$value) {
            throw HttpError::badRequest($channel === 'EMAIL' ? 'Escribe un correo válido.' : 'Escribe un número de WhatsApp válido, con el código del país (por ejemplo +58 412 1234567).');
        }
        if ($channel === 'WHATSAPP' && !WhatsApp::configured()) {
            throw new HttpError(503, 'CANAL_NO_DISPONIBLE', 'El envío por WhatsApp no está disponible en este momento.');
        }
        $uid = (int) $s['user_id'];
        if ($c->app->db->value('SELECT 1 FROM user_contacts WHERE user_id = ? AND channel = ? AND contact_value = ? AND verified_at IS NOT NULL', [$uid, $channel, $value])) {
            throw new HttpError(409, 'YA_VERIFICADO', 'Ese dato ya está verificado en tu cuenta.');
        }
        if ($c->app->db->value('SELECT 1 FROM user_contacts WHERE channel = ? AND contact_value = ? AND verified_at IS NOT NULL AND user_id <> ?', [$channel, $value, $uid])) {
            throw new HttpError(409, 'EN_USO', 'Ese dato ya está registrado en otra cuenta.');
        }
        // 1) quien pide el cambio confirma con un código al canal que ya tiene
        $g = $c->app->stepUp->require($c->req, $s, 'CONTACTO', 'contacto:' . $channel);
        // 2) y luego confirma que el canal nuevo es suyo
        $cid = $c->app->otp->create('CONTACTO', $uid, $c->req->ip, ['org_id' => $s['org_id'], 'session_id' => $s['id'], 'channel' => $channel, 'destination' => $value, 'action' => 'CONTACTO', 'scope' => 'contacto:' . $channel, 'reason' => !empty($d['principal']) ? 'principal' : null]);
        $sent = $c->app->otp->send($cid, $channel, $c->req->ip);
        unset($g);
        return ['desafio' => $cid] + $sent;
    }

    private static function contactVerify(Ctx $c): array
    {
        $s = $c->s();
        $d = $c->json();
        $ch = $c->app->otp->verify((string) ($d['desafio'] ?? ''), (string) ($d['codigo'] ?? ''), 'CONTACTO', (string) $s['id']);
        $uid = (int) $s['user_id'];
        if ((int) $ch['user_id'] !== $uid) {
            throw new HttpError(422, 'CODIGO_INVALIDO', 'El código no es válido.');
        }
        $channel = (string) $ch['channel'];
        $value = (string) $ch['destination'];
        $primary = $ch['reason'] === 'principal' || !$c->app->db->value('SELECT 1 FROM user_contacts WHERE user_id = ? AND channel = ? AND verified_at IS NOT NULL', [$uid, $channel]);
        $oldEmail = (string) $c->app->db->value('SELECT email FROM users WHERE id = ?', [$uid]);
        $c->app->db->transaction(function () use ($c, $uid, $channel, $value, $primary) {
            $row = $c->app->db->one('SELECT id FROM user_contacts WHERE user_id = ? AND channel = ? AND contact_value = ?', [$uid, $channel, $value]);
            if ($primary) {
                $c->app->db->exec('UPDATE user_contacts SET is_primary = 0 WHERE user_id = ? AND channel = ?', [$uid, $channel]);
            }
            if ($row) {
                $c->app->db->update('user_contacts', ['verified_at' => Clock::ts(), 'is_primary' => $primary ? 1 : 0], ['id' => (int) $row['id']]);
            } else {
                $c->app->db->insert('user_contacts', ['user_id' => $uid, 'channel' => $channel, 'contact_value' => $value, 'verified_at' => Clock::ts(), 'is_primary' => $primary ? 1 : 0, 'created_at' => Clock::ts()]);
            }
            if ($channel === 'EMAIL' && $primary) {
                if ($c->app->db->value('SELECT 1 FROM users WHERE email = ? AND id <> ?', [$value, $uid])) {
                    throw new HttpError(409, 'EN_USO', 'Ese correo ya es el acceso de otra cuenta.');
                }
                $c->app->db->update('users', ['email' => $value, 'updated_at' => Clock::ts()], ['id' => $uid]);
            }
        });
        $label = $channel === 'EMAIL' ? 'correo' : 'WhatsApp';
        if ($s['org_id'] !== null) {
            $c->audit('seguridad', 'verificó un ' . $label . ' nuevo (' . Otp::mask($channel, $value) . ')' . ($primary ? ' como principal' : ''));
        }
        // aviso al correo anterior: si no fue la persona, se entera
        [$sj, $t, $h] = Templates::simple('Cambio de datos de verificación en Agora', 'Se agregó un ' . $label . ' a tu cuenta', '<p>Se verificó ' . Templates::e(Otp::mask($channel, $value)) . ' para recibir tus códigos de Agora (IP ' . Templates::e($c->req->ip) . ').</p><p>Si no fuiste tú, cambia tu clave y escríbele a soporte.</p>');
        $c->app->defer(fn () => $c->app->outbox->email($oldEmail, $sj, $t, $h, 'contacto_nuevo', null, 2));
        return ['ok' => true, 'canal' => $channel, 'principal' => $primary];
    }

    private static function contactRemove(Ctx $c): array
    {
        $s = $c->s();
        $uid = (int) $s['user_id'];
        $row = $c->app->db->one('SELECT * FROM user_contacts WHERE id = ? AND user_id = ?', [(int) $c->param('id'), $uid]);
        if (!$row) {
            throw HttpError::notFound('Ese dato no existe en tu cuenta.');
        }
        if ($row['channel'] === 'EMAIL' && strtolower((string) $row['contact_value']) === strtolower((string) $s['email'])) {
            throw new HttpError(409, 'ES_ACCESO', 'Ese es el correo con que entras: agrega otro como principal antes de quitarlo.');
        }
        $verified = (int) $c->app->db->value('SELECT COUNT(*) FROM user_contacts WHERE user_id = ? AND verified_at IS NOT NULL', [$uid]);
        if ($row['verified_at'] !== null && $verified <= 1) {
            throw new HttpError(409, 'ULTIMO_CANAL', 'Necesitas al menos un canal verificado para recibir códigos.');
        }
        $c->app->stepUp->require($c->req, $s, 'CONTACTO', 'contacto:' . $row['channel']);
        $c->app->db->exec('DELETE FROM user_contacts WHERE id = ?', [(int) $row['id']]);
        if ($row['channel'] === 'WHATSAPP') {
            $c->app->db->exec("UPDATE users SET mfa_channel = 'EMAIL' WHERE id = ? AND mfa_channel = 'WHATSAPP' AND NOT EXISTS (SELECT 1 FROM user_contacts WHERE user_id = ? AND channel = 'WHATSAPP' AND verified_at IS NOT NULL)", [$uid, $uid]);
        }
        if ($s['org_id'] !== null) {
            $c->audit('seguridad', 'quitó un dato de verificación (' . Otp::mask((string) $row['channel'], (string) $row['contact_value']) . ')');
        }
        return ['ok' => true];
    }

    private static function mfa(Ctx $c): array
    {
        $s = $c->s();
        $d = $c->json();
        $on = !empty($d['activar']);
        $uid = (int) $s['user_id'];
        $role = $s['role'] ?? null;
        if (!$on && (($role && in_array($role, Roles::MFA_REQUIRED, true)) || !empty($s['is_platform_admin']))) {
            throw new HttpError(409, 'MFA_OBLIGATORIA', 'Tu rol exige verificación en dos pasos: no se puede desactivar.');
        }
        $channel = isset($d['canal']) ? Validator::enum(strtoupper((string) $d['canal']), ['EMAIL', 'WHATSAPP'], 'Canal') : null;
        if ($channel && !in_array($channel, array_column($c->app->otp->channelsFor($uid), 'canal'), true)) {
            throw HttpError::badRequest('Primero verifica ese canal en tu cuenta.');
        }
        $g = $c->app->stepUp->require($c->req, $s, 'MFA', 'mfa:cuenta');
        $c->app->db->update('users', ['mfa_enabled' => $on ? 1 : 0, 'mfa_channel' => $channel ?? ($c->app->db->value('SELECT mfa_channel FROM users WHERE id = ?', [$uid]) ?: 'EMAIL'), 'updated_at' => Clock::ts()], ['id' => $uid]);
        if (!$on) {
            $c->app->sessions->revokeDevices($uid);
        }
        if ($s['org_id'] !== null) {
            $c->audit('seguridad', ($on ? 'activó' : 'desactivó') . ' la verificación en dos pasos' . ($channel ? ' (' . ($channel === 'EMAIL' ? 'correo' : 'WhatsApp') . ')' : ''), null, null, null, (string) $g['id']);
        }
        return ['ok' => true, 'activa' => $on || ($role && in_array($role, Roles::MFA_REQUIRED, true)), 'canal' => $channel];
    }

    private static function closeSession(Ctx $c): array
    {
        $s = $c->s();
        $h = $c->param('id');
        foreach ($c->app->db->all('SELECT id FROM sessions WHERE user_id = ? AND revoked_at IS NULL', [(int) $s['user_id']]) as $r) {
            if (hash_equals(self::handle((string) $r['id']), $h)) {
                $c->app->sessions->revoke((string) $r['id'], 'cerrada_por_usuario');
                return ['ok' => true, 'actual' => $r['id'] === $s['id']];
            }
        }
        throw HttpError::notFound('Esa sesión ya no está abierta.');
    }

    private static function closeOthers(Ctx $c): array
    {
        $s = $c->s();
        $n = $c->app->sessions->revokeAllForUser((int) $s['user_id'], 'cerrada_por_usuario', (string) $s['id']);
        if ($s['org_id'] !== null) {
            $c->audit('seguridad', "cerró sus otras sesiones ({$n})");
        }
        return ['ok' => true, 'cerradas' => $n];
    }

    private static function forgetDevices(Ctx $c): array
    {
        $c->app->sessions->revokeDevices($c->userId());
        return ['ok' => true];
    }
}
