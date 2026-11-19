<?php
declare(strict_types=1);

namespace Agora\Security;

use Agora\Core\Clock;
use Agora\Core\Db;
use Agora\Core\Env;
use Agora\Core\Ids;
use Agora\Http\Request;
use Agora\Http\Response;

/**
 * Sesiones guardadas en el servidor. La cookie (HttpOnly, Secure, SameSite=Strict, prefijo __Host-) lleva
 * un token de 256 bits; en la base solo queda su SHA-256. Vencen por inactividad y por tiempo máximo,
 * se renuevan al iniciar sesión y se revocan al cambiar la clave.
 */
final class SessionManager
{
    public function __construct(private Db $db)
    {
    }

    public static function cookieName(): string
    {
        return Env::bool('COOKIE_SECURE', true) ? '__Host-agora' : 'agora_sesion';
    }

    /** @return array{token:string,id:string,csrf:string} */
    public function create(Request $req, Response $res, int $userId, ?int $orgId, bool $remember): array
    {
        $token = Ids::token(32);
        $id = Ids::sha256($token);
        $csrf = bin2hex(random_bytes(32));
        $idleMin = $remember ? Env::int('SESSION_REMEMBER_DAYS', 7) * 1440 : Env::int('SESSION_IDLE_MIN', 60);
        $maxSec = $remember ? Env::int('SESSION_REMEMBER_DAYS', 7) * 86400 : Env::int('SESSION_MAX_HOURS', 12) * 3600;
        $now = Clock::ts();
        $this->db->insert('sessions', [
            'id' => $id, 'user_id' => $userId, 'org_id' => $orgId, 'csrf_token' => $csrf,
            'elevated_until' => null, 'ip' => $req->ip, 'user_agent' => $req->userAgent(), 'created_at' => $now, 'last_seen_at' => $now,
            'idle_expires_at' => Clock::ts($idleMin * 60), 'expires_at' => Clock::ts($maxSec), 'revoked_at' => null, 'revoke_reason' => null,
        ]);
        $res->cookie(self::cookieName(), $token, self::cookieOpts($remember ? Clock::unix() + $maxSec : 0));
        return ['token' => $token, 'id' => $id, 'csrf' => $csrf];
    }

    /** @return array<string,mixed>|null sesión + persona + rol en la empresa activa */
    public function load(Request $req): ?array
    {
        $token = $req->cookie(self::cookieName());
        if (!$token || strlen($token) < 40 || strlen($token) > 64) {
            return null;
        }
        $id = Ids::sha256($token);
        $s = $this->db->one(
            'SELECT s.*, u.email, u.name, u.status AS user_status, u.is_platform_admin, u.uid AS user_uid, u.password_changed_at,
                    m.role, m.status AS membership_status, o.uid AS org_uid, o.name AS org_name, o.status AS org_status
               FROM sessions s
               JOIN users u ON u.id = s.user_id
               LEFT JOIN memberships m ON m.org_id = s.org_id AND m.user_id = s.user_id
               LEFT JOIN organizations o ON o.id = s.org_id
              WHERE s.id = ?',
            [$id]
        );
        $now = Clock::ts();
        if (!$s || $s['revoked_at'] !== null || strcmp((string) $s['expires_at'], $now) < 0 || strcmp((string) $s['idle_expires_at'], $now) < 0 || $s['user_status'] !== 'ACTIVO') {
            return null;
        }
        if ($s['org_id'] !== null && ($s['membership_status'] !== 'ACTIVA' || $s['org_status'] !== 'ACTIVA')) {
            return null;
        }
        // actualizar la actividad como máximo una vez por minuto (menos escrituras con muchos usuarios)
        if (Clock::unix() - strtotime((string) $s['last_seen_at'] . ' UTC') >= 60) {
            $remember = strtotime((string) $s['expires_at'] . ' UTC') - strtotime((string) $s['created_at'] . ' UTC') > 86400;
            $idleMin = $remember ? Env::int('SESSION_REMEMBER_DAYS', 7) * 1440 : Env::int('SESSION_IDLE_MIN', 60);
            $this->db->update('sessions', ['last_seen_at' => $now, 'idle_expires_at' => Clock::ts($idleMin * 60)], ['id' => $id]);
        }
        $s['id'] = $id;
        return $s;
    }

    public function revoke(string $id, string $reason): void
    {
        $this->db->exec('UPDATE sessions SET revoked_at = ?, revoke_reason = ? WHERE id = ? AND revoked_at IS NULL', [Clock::ts(), $reason, $id]);
    }

    public function revokeAllForUser(int $userId, string $reason, ?string $exceptId = null): int
    {
        return $this->db->exec(
            'UPDATE sessions SET revoked_at = ?, revoke_reason = ? WHERE user_id = ? AND revoked_at IS NULL' . ($exceptId ? ' AND id <> ?' : ''),
            $exceptId ? [Clock::ts(), $reason, $userId, $exceptId] : [Clock::ts(), $reason, $userId]
        );
    }

    /** Modo edición (equivale a la "clave de edición" de la v10, pero validado en el servidor) */
    public function elevate(string $id, int $minutes): string
    {
        $until = Clock::ts($minutes * 60);
        $this->db->update('sessions', ['elevated_until' => $until], ['id' => $id]);
        return $until;
    }

    public static function isElevated(array $s): bool
    {
        return !empty($s['elevated_until']) && strcmp((string) $s['elevated_until'], Clock::ts()) > 0;
    }

    public function clearCookie(Response $res): void
    {
        $res->cookie(self::cookieName(), '', self::cookieOpts(1));
    }

    /** @return array<string,mixed> */
    public static function cookieOpts(int $expires): array
    {
        return ['expires' => $expires, 'path' => '/', 'secure' => Env::bool('COOKIE_SECURE', true), 'httponly' => true, 'samesite' => 'Strict'];
    }
}
