<?php
declare(strict_types=1);

namespace Agora\Services;

use Agora\App;
use Agora\Core\Clock;
use Agora\Core\Env;
use Agora\Core\Ids;
use Agora\Http\HttpError;
use Agora\Notify\Templates;
use Agora\Security\Password;
use Agora\Security\Roles;
use Agora\Security\Validator;

/** Operaciones de la plataforma (Agora Digital): empresas clientes, planes, invitaciones y administradores. */
final class Platform
{
    /** Personas por plan del CRM (0 = sin límite) */
    public const PLANS = ['BRONCE' => 3, 'PLATA' => 10, 'ORO' => 20, 'DIAMANTE' => 0];

    public function __construct(private App $app)
    {
    }

    public function createOrg(string $name, string $plan): array
    {
        $name = Validator::clean($name, 160);
        if (mb_strlen($name) < 2) {
            throw HttpError::badRequest('El nombre de la empresa es muy corto.');
        }
        $plan = strtoupper($plan);
        if (!isset(self::PLANS[$plan])) {
            throw HttpError::badRequest('Plan no válido: BRONCE, PLATA, ORO o DIAMANTE.');
        }
        $base = trim((string) preg_replace('/[^a-z0-9]+/', '-', strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name) ?: $name)), '-') ?: 'empresa';
        $slug = substr($base, 0, 56);
        for ($i = 2; $this->app->db->value('SELECT 1 FROM organizations WHERE slug = ?', [$slug]); $i++) {
            $slug = substr($base, 0, 50) . '-' . $i;
        }
        $uid = Ids::ulid();
        $id = $this->app->db->insert('organizations', ['uid' => $uid, 'name' => $name, 'slug' => $slug, 'plan' => $plan, 'status' => 'ACTIVA', 'timezone' => 'America/Caracas', 'max_users' => self::PLANS[$plan], 'data_version' => 0, 'created_at' => Clock::ts(), 'updated_at' => Clock::ts()]);
        $this->app->audit->log($id, ['user_id' => null, 'email' => 'plataforma', 'role' => 'PLATAFORMA', 'ip' => 'cli'], 'plataforma', 'creó la empresa ' . $name . ' (plan ' . $plan . ')');
        return ['id' => $id, 'uid' => $uid, 'slug' => $slug, 'nombre' => $name, 'plan' => $plan];
    }

    /** Crea la invitación y la envía por correo. @return array{uid:string,enlace:string,vence:string} */
    public function createInvitation(int $orgId, string $email, string $role, ?int $invitedBy, string $inviterName): array
    {
        $email = Validator::email($email) ?? throw HttpError::badRequest('Correo no válido.');
        if (!Roles::valid($role)) {
            throw HttpError::badRequest('Rol no válido.');
        }
        $org = $this->app->db->one('SELECT name FROM organizations WHERE id = ?', [$orgId]) ?? throw HttpError::notFound('Esa empresa no existe.');
        $this->app->db->exec('UPDATE invitations SET revoked_at = ? WHERE org_id = ? AND email = ? AND accepted_at IS NULL AND revoked_at IS NULL', [Clock::ts(), $orgId, $email]);
        $token = Ids::token(32);
        $uid = Ids::ulid();
        $days = max(1, min(30, Env::int('INVITATION_DAYS', 7)));
        $exp = Clock::ts($days * 86400);
        $this->app->db->insert('invitations', ['uid' => $uid, 'org_id' => $orgId, 'email' => $email, 'role' => $role, 'token_hash' => Ids::sha256($token), 'invited_by' => $invitedBy, 'expires_at' => $exp, 'accepted_at' => null, 'revoked_at' => null, 'created_at' => Clock::ts()]);
        $link = rtrim(Env::str('APP_URL', 'https://agoradigital.app'), '/') . '/#invitacion=' . $token;
        [$sj, $t, $h] = Templates::invitation((string) $org['name'], Roles::LABELS[$role], $link, $inviterName, $days);
        $this->app->outbox->email($email, $sj, $t, $h, 'invitacion', $orgId, 2);
        return ['uid' => $uid, 'enlace' => $link, 'vence' => (string) App::iso($exp)];
    }

    public function setPlan(string $orgUid, string $plan): void
    {
        $plan = strtoupper($plan);
        if (!isset(self::PLANS[$plan])) {
            throw HttpError::badRequest('Plan no válido.');
        }
        $n = $this->app->db->exec('UPDATE organizations SET plan = ?, max_users = ?, updated_at = ? WHERE uid = ?', [$plan, self::PLANS[$plan], Clock::ts(), $orgUid]);
        if ($n !== 1) {
            throw HttpError::notFound('Esa empresa no existe.');
        }
    }

    public function setStatus(string $orgUid, string $status): void
    {
        $status = strtoupper($status);
        if (!in_array($status, ['ACTIVA', 'SUSPENDIDA', 'CERRADA'], true)) {
            throw HttpError::badRequest('Estado no válido.');
        }
        $id = $this->app->db->value('SELECT id FROM organizations WHERE uid = ?', [$orgUid]) ?? throw HttpError::notFound('Esa empresa no existe.');
        $this->app->db->update('organizations', ['status' => $status, 'updated_at' => Clock::ts()], ['id' => (int) $id]);
        if ($status !== 'ACTIVA') {
            $this->app->db->exec('UPDATE sessions SET revoked_at = ?, revoke_reason = ? WHERE org_id = ? AND revoked_at IS NULL', [Clock::ts(), 'empresa_' . strtolower($status), (int) $id]);
        }
    }

    public function createPlatformAdmin(string $email, string $name, string $password): int
    {
        $email = Validator::email($email) ?? throw HttpError::badRequest('Correo no válido.');
        Password::assertPolicy($password, $email, $name);
        $existing = $this->app->db->value('SELECT id FROM users WHERE email = ?', [$email]);
        if ($existing) {
            $this->app->db->update('users', ['is_platform_admin' => 1, 'updated_at' => Clock::ts()], ['id' => (int) $existing]);
            return (int) $existing;
        }
        $id = $this->app->db->insert('users', [
            'uid' => Ids::ulid(), 'email' => $email, 'name' => Validator::clean($name, 120) ?: 'Administración', 'password_hash' => Password::hash($password), 'password_changed_at' => Clock::ts(),
            'status' => 'ACTIVO', 'is_platform_admin' => 1, 'failed_logins' => 0, 'locked_until' => null, 'last_login_at' => null, 'last_login_ip' => null,
            'created_at' => Clock::ts(), 'updated_at' => Clock::ts(),
        ]);
        return $id;
    }
}
