<?php
declare(strict_types=1);

namespace Agora\Api;

use Agora\App;
use Agora\Core\Clock;
use Agora\Http\HttpError;
use Agora\Http\Router;
use Agora\Notify\Templates;
use Agora\Security\Password;
use Agora\Security\Validator;

/** Mi cuenta: nombre, clave y sesiones abiertas. */
final class Account
{
    public static function routes(Router $r, App $app): void
    {
        $o = ['org' => false];
        $r->add('GET', '/api/v1/perfil', fn (Ctx $c) => self::profile($c), $o);
        $r->add('POST', '/api/v1/perfil/nombre', fn (Ctx $c) => self::rename($c), $o);
        $r->add('POST', '/api/v1/perfil/clave', fn (Ctx $c) => self::password($c), $o + ['rate' => ['perfil:clave:{user}', 6, 900]]);
        $r->add('POST', '/api/v1/perfil/sesiones/{id}/cerrar', fn (Ctx $c) => self::closeSession($c), $o);
        $r->add('POST', '/api/v1/perfil/sesiones/cerrar-otras', fn (Ctx $c) => self::closeOthers($c), $o);
    }

    public static function handle(string $sessionId): string
    {
        return substr(hash('sha256', 'sesion|' . $sessionId), 0, 20);
    }

    private static function profile(Ctx $c): array
    {
        $s = $c->s();
        $uid = (int) $s['user_id'];
        $u = $c->app->db->one('SELECT name, email, password_changed_at, created_at FROM users WHERE id = ?', [$uid]) ?? [];
        $sessions = array_map(fn ($r) => [
            'id' => self::handle((string) $r['id']), 'ip' => $r['ip'], 'equipo' => mb_substr((string) $r['user_agent'], 0, 140), 'creada' => App::iso((string) $r['created_at']),
            'ultima' => App::iso((string) $r['last_seen_at']), 'actual' => $r['id'] === $s['id'],
        ], $c->app->db->all('SELECT id, ip, user_agent, created_at, last_seen_at FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? AND idle_expires_at > ? ORDER BY last_seen_at DESC LIMIT 30', [$uid, Clock::ts(), Clock::ts()]));
        return [
            'nombre' => $u['name'] ?? '', 'correo' => $u['email'] ?? '', 'desde' => App::iso($u['created_at'] ?? null), 'clave_cambiada' => App::iso($u['password_changed_at'] ?? null),
            'sesiones' => $sessions,
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
            return $c->app->sessions->revokeAllForUser($uid, 'cambio_clave', (string) $s['id']);
        });
        if ($s['org_id'] !== null) {
            $c->audit('seguridad', 'cambió su clave de acceso');
        }
        [$sj, $t, $h] = Templates::simple('Cambiaste tu clave de Agora', 'Tu clave cambió', '<p>La clave de tu cuenta se cambió desde la IP ' . Templates::e($c->req->ip) . '. Cerramos tus otras sesiones (' . $closed . ').</p><p>Si no fuiste tú, escríbele a soporte.</p>');
        $email = (string) $u['email'];
        $c->app->defer(fn () => $c->app->outbox->email($email, $sj, $t, $h, 'clave_cambiada', null, 2));
        return ['ok' => true, 'sesiones_cerradas' => $closed];
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
}
