<?php
declare(strict_types=1);

namespace Agora\Api;

use Agora\App;
use Agora\Http\HttpError;
use Agora\Http\Request;
use Agora\Security\Roles;

/** Contexto de una petición a la API: la app, la petición, la sesión (si hay) y los parámetros de la ruta. */
final class Ctx
{
    /**
     * @param array<string,mixed>|null $s
     * @param array<string,string> $params
     */
    public function __construct(public App $app, public Request $req, public ?array $s, public array $params = [])
    {
    }

    /** @return array<string,mixed> sesión vigente (la ruta exige sesión) */
    public function s(): array
    {
        if (!$this->s) {
            throw new HttpError(401, 'SESION_REQUERIDA', 'Tu sesión terminó. Vuelve a entrar.');
        }
        return $this->s;
    }

    public function orgId(): int
    {
        $s = $this->s();
        if ($s['org_id'] === null) {
            throw new HttpError(409, 'SIN_EMPRESA', 'Elige una empresa para continuar.');
        }
        return (int) $s['org_id'];
    }

    public function userId(): int
    {
        return (int) $this->s()['user_id'];
    }

    public function role(): ?string
    {
        return $this->s['role'] ?? null;
    }

    public function isPlatform(): bool
    {
        return !empty($this->s['is_platform_admin']);
    }

    public function can(string $perm): bool
    {
        return Roles::can($this->role(), $perm);
    }

    public function need(string $perm, string $msg = 'Tu rol no permite hacer esto.'): void
    {
        if (!$this->can($perm)) {
            throw HttpError::forbidden($msg);
        }
    }

    public function needPlatform(): void
    {
        if (!$this->isPlatform()) {
            throw HttpError::forbidden('Solo el equipo de Agora Digital puede hacer esto.');
        }
    }

    /** @return array{user_id:int,email:string,role:string,ip:string} */
    public function actor(): array
    {
        $s = $this->s();
        return ['user_id' => (int) $s['user_id'], 'email' => (string) $s['email'], 'role' => (string) ($s['role'] ?? ($s['is_platform_admin'] ? 'PLATAFORMA' : '')), 'ip' => $this->req->ip];
    }

    /** @return array<string,mixed> */
    public function json(): array
    {
        return $this->req->json();
    }

    public function param(string $k): string
    {
        return $this->params[$k] ?? '';
    }

    /** Registra en la auditoría de la empresa activa */
    public function audit(string $module, string $action, ?string $entity = null, ?string $entityId = null, ?array $detail = null, ?string $grantId = null): void
    {
        $orgId = $this->s && $this->s['org_id'] !== null ? (int) $this->s['org_id'] : null;
        $this->app->audit->log($orgId, $this->actor(), $module, $action, $entity, $entityId, $detail, 'SERVIDOR', $grantId);
    }
}
