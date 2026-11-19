<?php
declare(strict_types=1);

namespace Agora\Api;

use Agora\App;
use Agora\Core\Clock;
use Agora\Core\Env;
use Agora\Core\Ids;
use Agora\Http\HttpError;
use Agora\Http\Router;
use Agora\Notify\Templates;
use Agora\Security\Roles;
use Agora\Security\Validator;

/**
 * Personas de la empresa: invitar, cambiar rol, suspender. El plan limita cuántas personas caben
 * (Bronce 3, Plata 10, Oro 20, Diamante sin límite). Dar o quitar roles exige código (OTP).
 */
final class Users
{
    private const RANK = ['SUPERADMIN' => 4, 'DIRECCION' => 3, 'ADMIN' => 2, 'VENTAS' => 1, 'CONTADOR' => 1];

    public static function routes(Router $r, App $app): void
    {
        $p = ['perm' => 'usuarios.gestionar'];
        $r->add('GET', '/api/v1/usuarios', fn (Ctx $c) => self::list($c), $p);
        $r->add('POST', '/api/v1/usuarios/invitar', fn (Ctx $c) => self::invite($c), $p + ['rate' => ['usuarios:invitar:{user}', 20, 3600]]);
        $r->add('POST', '/api/v1/invitaciones/{uid}/revocar', fn (Ctx $c) => self::revokeInvite($c), $p);
        $r->add('POST', '/api/v1/usuarios/{uid}/rol', fn (Ctx $c) => self::changeRole($c), $p);
        $r->add('POST', '/api/v1/usuarios/{uid}/estado', fn (Ctx $c) => self::changeStatus($c), $p);
    }

    private static function list(Ctx $c): array
    {
        $orgId = $c->orgId();
        $org = $c->app->db->one('SELECT plan, max_users FROM organizations WHERE id = ?', [$orgId]) ?? [];
        $users = array_map(fn ($r) => [
            'uid' => $r['uid'], 'nombre' => $r['name'], 'correo' => $r['email'], 'rol' => $r['role'], 'rol_nombre' => Roles::LABELS[$r['role']] ?? $r['role'], 'estado' => $r['mstatus'],
            'mfa' => (bool) $r['mfa_enabled'] || in_array($r['role'], Roles::MFA_REQUIRED, true), 'ultimo_acceso' => App::iso($r['last_login_at']), 'desde' => App::iso((string) $r['mcreated']), 'tu' => (int) $r['id'] === $c->userId(),
        ], $c->app->db->all(
            'SELECT u.id, u.uid, u.name, u.email, u.mfa_enabled, u.last_login_at, m.role, m.status AS mstatus, m.created_at AS mcreated FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY m.status, u.name',
            [$orgId]
        ));
        $inv = array_map(fn ($r) => ['uid' => $r['uid'], 'correo' => $r['email'], 'rol' => $r['role'], 'rol_nombre' => Roles::LABELS[$r['role']] ?? $r['role'], 'vence' => App::iso((string) $r['expires_at']), 'creada' => App::iso((string) $r['created_at'])],
            $c->app->db->all('SELECT uid, email, role, expires_at, created_at FROM invitations WHERE org_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC', [$orgId, Clock::ts()]));
        return ['usuarios' => $users, 'invitaciones' => $inv, 'plan' => ['nombre' => $org['plan'] ?? '', 'maximo' => (int) ($org['max_users'] ?? 0), 'usados' => self::seatsUsed($c, $orgId)], 'roles' => self::assignable($c)];
    }

    private static function seatsUsed(Ctx $c, int $orgId): int
    {
        return (int) $c->app->db->value("SELECT COUNT(*) FROM memberships WHERE org_id = ? AND status = 'ACTIVA'", [$orgId])
            + (int) $c->app->db->value('SELECT COUNT(*) FROM invitations WHERE org_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?', [$orgId, Clock::ts()]);
    }

    /** @return list<array{rol:string,nombre:string}> roles que puede dar quien gestiona */
    private static function assignable(Ctx $c): array
    {
        $mine = self::RANK[$c->role() ?? ''] ?? 0;
        $out = [];
        foreach (Roles::LABELS as $k => $v) {
            if (self::RANK[$k] <= $mine) {
                $out[] = ['rol' => $k, 'nombre' => $v];
            }
        }
        return $out;
    }

    private static function assertCanGrant(Ctx $c, string $role): void
    {
        if ((self::RANK[$role] ?? 99) > (self::RANK[$c->role() ?? ''] ?? 0)) {
            throw HttpError::forbidden('No puedes dar un rol más alto que el tuyo.');
        }
    }

    private static function invite(Ctx $c): array
    {
        $orgId = $c->orgId();
        $d = $c->json();
        $email = Validator::email($d['correo'] ?? '');
        if (!$email) {
            throw HttpError::badRequest('Escribe un correo válido.');
        }
        $role = Validator::enum(strtoupper((string) ($d['rol'] ?? '')), array_keys(Roles::LABELS), 'Rol');
        self::assertCanGrant($c, $role);
        $org = $c->app->db->one('SELECT name, max_users FROM organizations WHERE id = ?', [$orgId]);
        if ((int) $org['max_users'] > 0 && self::seatsUsed($c, $orgId) >= (int) $org['max_users']) {
            throw new HttpError(409, 'PLAN_LLENO', 'Tu plan ya no tiene cupos (' . (int) $org['max_users'] . ' personas). Sube de plan o suspende a alguien.');
        }
        if ($c->app->db->value('SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND u.email = ?', [$orgId, $email])) {
            throw new HttpError(409, 'YA_MIEMBRO', 'Esa persona ya forma parte de la empresa.');
        }
        $g = null;
        if (in_array($role, Roles::MFA_REQUIRED, true)) {
            $g = $c->app->stepUp->require($c->req, $c->s(), 'USUARIO_INVITAR', 'rol:' . $role);
        }
        $inv = (new \Agora\Services\Platform($c->app))->createInvitation($orgId, $email, $role, $c->userId(), (string) $c->s()['name']);
        $c->audit('usuarios', 'invitó a ' . $email . ' como ' . Roles::LABELS[$role], 'invitacion', $inv['uid'], null, $g ? (string) $g['id'] : null);
        return ['ok' => true, 'invitacion' => $inv['uid'], 'vence' => $inv['vence']];
    }

    private static function revokeInvite(Ctx $c): array
    {
        $n = $c->app->db->exec('UPDATE invitations SET revoked_at = ? WHERE org_id = ? AND uid = ? AND accepted_at IS NULL AND revoked_at IS NULL', [Clock::ts(), $c->orgId(), $c->param('uid')]);
        if ($n !== 1) {
            throw HttpError::notFound('Esa invitación ya no está pendiente.');
        }
        $c->audit('usuarios', 'revocó una invitación', 'invitacion', $c->param('uid'));
        return ['ok' => true];
    }

    /** @return array<string,mixed> */
    private static function target(Ctx $c): array
    {
        $t = $c->app->db->one('SELECT u.id, u.uid, u.name, u.email, m.role, m.status FROM users u JOIN memberships m ON m.user_id = u.id AND m.org_id = ? WHERE u.uid = ?', [$c->orgId(), $c->param('uid')]);
        if (!$t) {
            throw HttpError::notFound('Esa persona no está en la empresa.');
        }
        if ((int) $t['id'] === $c->userId()) {
            throw HttpError::forbidden('No puedes cambiar tu propio rol ni tu acceso.');
        }
        if ((self::RANK[$t['role']] ?? 0) > (self::RANK[$c->role() ?? ''] ?? 0)) {
            throw HttpError::forbidden('No puedes cambiar a alguien con un rol más alto que el tuyo.');
        }
        return $t;
    }

    private static function lastSuperadmin(Ctx $c, array $t): bool
    {
        return $t['role'] === 'SUPERADMIN' && (int) $c->app->db->value("SELECT COUNT(*) FROM memberships WHERE org_id = ? AND role = 'SUPERADMIN' AND status = 'ACTIVA'", [$c->orgId()]) <= 1;
    }

    private static function changeRole(Ctx $c): array
    {
        $t = self::target($c);
        $role = Validator::enum(strtoupper((string) ($c->json()['rol'] ?? '')), array_keys(Roles::LABELS), 'Rol');
        self::assertCanGrant($c, $role);
        if ($role === $t['role']) {
            return ['ok' => true, 'sin_cambios' => true];
        }
        if (self::lastSuperadmin($c, $t)) {
            throw new HttpError(409, 'ULTIMO_SUPERADMIN', 'Es el único Superadministrador: nombra a otro antes de cambiarle el rol.');
        }
        $g = $c->app->stepUp->require($c->req, $c->s(), 'USUARIO_ROL', 'usuario:' . $t['uid']);
        $c->app->db->update('memberships', ['role' => $role, 'updated_at' => Clock::ts()], ['org_id' => $c->orgId(), 'user_id' => (int) $t['id']]);
        // con otro rol cambian los permisos: se cierran sus sesiones para que entre de nuevo
        $c->app->sessions->revokeAllForUser((int) $t['id'], 'cambio_rol');
        if (in_array($role, Roles::MFA_REQUIRED, true)) {
            $c->app->db->update('users', ['mfa_enabled' => 1], ['id' => (int) $t['id']]);
        }
        $c->audit('usuarios', 'cambió el rol de ' . $t['email'] . ': ' . (Roles::LABELS[$t['role']] ?? $t['role']) . ' → ' . Roles::LABELS[$role], 'usuario', (string) $t['uid'], null, (string) $g['id']);
        $c->app->alerts->org($c->orgId(), 'Cambio de rol en tu empresa', 'Se cambió un rol', '<p>' . Templates::e((string) $c->s()['name']) . ' cambió el rol de ' . Templates::e((string) $t['name']) . ' a <b>' . Templates::e(Roles::LABELS[$role]) . '</b>.</p>');
        return ['ok' => true];
    }

    private static function changeStatus(Ctx $c): array
    {
        $t = self::target($c);
        $status = Validator::enum(strtoupper((string) ($c->json()['estado'] ?? '')), ['ACTIVA', 'SUSPENDIDA'], 'Estado');
        if ($status === $t['status']) {
            return ['ok' => true, 'sin_cambios' => true];
        }
        if ($status === 'SUSPENDIDA' && self::lastSuperadmin($c, $t)) {
            throw new HttpError(409, 'ULTIMO_SUPERADMIN', 'Es el único Superadministrador: no se puede suspender.');
        }
        if ($status === 'ACTIVA') {
            $org = $c->app->db->one('SELECT max_users FROM organizations WHERE id = ?', [$c->orgId()]);
            if ((int) $org['max_users'] > 0 && self::seatsUsed($c, $c->orgId()) >= (int) $org['max_users']) {
                throw new HttpError(409, 'PLAN_LLENO', 'Tu plan ya no tiene cupos para reactivar a esta persona.');
            }
        }
        $g = $c->app->stepUp->require($c->req, $c->s(), 'USUARIO_ROL', 'usuario:' . $t['uid']);
        $c->app->db->update('memberships', ['status' => $status, 'updated_at' => Clock::ts()], ['org_id' => $c->orgId(), 'user_id' => (int) $t['id']]);
        if ($status === 'SUSPENDIDA') {
            $c->app->db->exec('UPDATE sessions SET revoked_at = ?, revoke_reason = ? WHERE user_id = ? AND org_id = ? AND revoked_at IS NULL', [Clock::ts(), 'suspendido', (int) $t['id'], $c->orgId()]);
        }
        $c->audit('usuarios', ($status === 'SUSPENDIDA' ? 'suspendió' : 'reactivó') . ' el acceso de ' . $t['email'], 'usuario', (string) $t['uid'], null, (string) $g['id']);
        return ['ok' => true];
    }
}
