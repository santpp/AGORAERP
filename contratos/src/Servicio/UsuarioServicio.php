<?php

declare(strict_types=1);

namespace Asocim\Contratos\Servicio;

use Asocim\Contratos\Seguridad\Roles;
use PDO;

/** Usuarios del sistema, inicio de sesión y sesiones. */
final class UsuarioServicio
{
    public const HORAS_SESION = 12;
    public const INTENTOS_MAXIMOS = 5;
    public const MINUTOS_BLOQUEO = 15;
    public const CLAVE_MINIMA = 10;

    public function __construct(private readonly PDO $pdo, private readonly ?\Closure $ahora = null)
    {
    }

    /** Crea un usuario. Solo lo llama un administrador (o el comando del servidor para el primero). */
    public function crear(string $correo, string $nombre, string $clave, string $rol): int
    {
        $correo = strtolower(trim($correo));
        if (!filter_var($correo, FILTER_VALIDATE_EMAIL)) {
            throw new ErrorContrato('El correo no es válido.');
        }
        if (trim($nombre) === '') {
            throw new ErrorContrato('Escribe el nombre de la persona.');
        }
        if (!in_array($rol, Roles::TODOS, true)) {
            throw new ErrorContrato('Rol no válido.');
        }
        if (mb_strlen($clave) < self::CLAVE_MINIMA) {
            throw new ErrorContrato('La clave debe tener al menos ' . self::CLAVE_MINIMA . ' caracteres.');
        }
        if ($this->porCorreo($correo) !== null) {
            throw new ErrorContrato('Ya existe una persona con ese correo.', 409);
        }
        $st = $this->pdo->prepare('INSERT INTO usuarios (correo, nombre, clave_hash, rol, activo, creado_en) VALUES (?,?,?,?,1,?)');
        $st->execute([$correo, trim($nombre), password_hash($clave, PASSWORD_DEFAULT), $rol, $this->ahora()]);
        return (int) $this->pdo->lastInsertId();
    }

    /** Cambia la clave propia. Exige la clave actual y cierra las demás sesiones. */
    public function cambiarClave(int $usuarioId, string $claveActual, string $claveNueva, string $tokenActual): void
    {
        $u = $this->pdo->prepare('SELECT * FROM usuarios WHERE id = ?');
        $u->execute([$usuarioId]);
        $fila = $u->fetch();
        if ($fila === false || !password_verify($claveActual, $fila['clave_hash'])) {
            throw new ErrorContrato('La clave actual no es correcta.', 401);
        }
        if (mb_strlen($claveNueva) < self::CLAVE_MINIMA) {
            throw new ErrorContrato('La clave nueva debe tener al menos ' . self::CLAVE_MINIMA . ' caracteres.');
        }
        $this->pdo->prepare('UPDATE usuarios SET clave_hash = ? WHERE id = ?')
            ->execute([password_hash($claveNueva, PASSWORD_DEFAULT), $usuarioId]);
        $this->pdo->prepare('DELETE FROM sesiones WHERE usuario_id = ? AND hash <> ?')
            ->execute([$usuarioId, hash('sha256', $tokenActual)]);
    }

    public function cambiarRol(int $usuarioId, string $rol, int $administradorId): void
    {
        if (!in_array($rol, Roles::TODOS, true)) {
            throw new ErrorContrato('Rol no válido.');
        }
        if ($usuarioId === $administradorId && $rol !== Roles::ADMIN) {
            throw new ErrorContrato('No puedes quitarte a ti mismo el rol de administrador.', 409);
        }
        $this->pdo->prepare('UPDATE usuarios SET rol = ? WHERE id = ?')->execute([$rol, $usuarioId]);
        $this->cerrarSesiones($usuarioId);
    }

    public function reactivar(int $usuarioId): void
    {
        $this->pdo->prepare('UPDATE usuarios SET activo = 1, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?')->execute([$usuarioId]);
    }

    /** El administrador fija una clave nueva a otra persona. Cierra sus sesiones abiertas. */
    public function restablecerClave(int $usuarioId, string $claveNueva): void
    {
        if (mb_strlen($claveNueva) < self::CLAVE_MINIMA) {
            throw new ErrorContrato('La clave debe tener al menos ' . self::CLAVE_MINIMA . ' caracteres.');
        }
        $this->pdo->prepare('UPDATE usuarios SET clave_hash = ?, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?')
            ->execute([password_hash($claveNueva, PASSWORD_DEFAULT), $usuarioId]);
        $this->cerrarSesiones($usuarioId);
    }

    public function desactivar(int $usuarioId, int $administradorId): void
    {
        if ($usuarioId === $administradorId) {
            throw new ErrorContrato('No puedes desactivar tu propia cuenta.', 409);
        }
        $this->pdo->prepare('UPDATE usuarios SET activo = 0 WHERE id = ?')->execute([$usuarioId]);
        $this->cerrarSesiones($usuarioId);
    }

    /**
     * Devuelve el token de sesión (solo se entrega una vez; en la base queda su hash).
     * @return array{token:string,usuario:array<string,mixed>}
     */
    public function iniciarSesion(string $correo, string $clave): array
    {
        $u = $this->porCorreo(strtolower(trim($correo)));
        $generico = new ErrorContrato('Correo o clave incorrectos.', 401);
        if ($u === null) {
            password_verify($clave, '$2y$10$abcdefghijklmnopqrstuuJ4a8mbk1tXbMwxFsPSnx0fwyzIGLhE2'); // mismo tiempo que con un usuario real
            throw $generico;
        }
        if ($u['bloqueado_hasta'] !== null && $u['bloqueado_hasta'] > $this->ahora()) {
            throw new ErrorContrato('Demasiados intentos. Espera 15 minutos.', 429);
        }
        if (!password_verify($clave, $u['clave_hash']) || (int) $u['activo'] !== 1) {
            $this->registrarFallo((int) $u['id'], (int) $u['intentos_fallidos']);
            throw $generico;
        }
        $this->pdo->prepare('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?')->execute([$u['id']]);

        $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $this->pdo->prepare('INSERT INTO sesiones (usuario_id, hash, expira_en, creado_en) VALUES (?,?,?,?)')
            ->execute([$u['id'], hash('sha256', $token), $this->sumarHoras(self::HORAS_SESION), $this->ahora()]);
        return ['token' => $token, 'usuario' => $this->publico($u)];
    }

    /** @return array<string,mixed>|null usuario activo de una sesión vigente */
    public function usuarioDeSesion(?string $token): ?array
    {
        if ($token === null || $token === '') {
            return null;
        }
        $st = $this->pdo->prepare(
            'SELECT u.* FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
             WHERE s.hash = ? AND s.expira_en > ? AND u.activo = 1'
        );
        $st->execute([hash('sha256', $token), $this->ahora()]);
        $u = $st->fetch();
        return $u === false ? null : $this->publico($u);
    }

    public function cerrarSesion(string $token): void
    {
        $this->pdo->prepare('DELETE FROM sesiones WHERE hash = ?')->execute([hash('sha256', $token)]);
    }

    /** @return list<array<string,mixed>> */
    public function listar(): array
    {
        return array_map(fn (array $u) => $this->publico($u), $this->pdo->query('SELECT * FROM usuarios ORDER BY nombre')->fetchAll());
    }

    /** @return array<string,mixed>|null */
    public function porCorreo(string $correo): ?array
    {
        $st = $this->pdo->prepare('SELECT * FROM usuarios WHERE correo = ?');
        $st->execute([$correo]);
        $u = $st->fetch();
        return $u === false ? null : $u;
    }

    /** @param array<string,mixed> $u @return array<string,mixed> */
    private function publico(array $u): array
    {
        return ['id' => (int) $u['id'], 'correo' => $u['correo'], 'nombre' => $u['nombre'], 'rol' => $u['rol'], 'activo' => (int) $u['activo'] === 1];
    }

    private function registrarFallo(int $usuarioId, int $fallos): void
    {
        $fallos++;
        $bloqueo = $fallos >= self::INTENTOS_MAXIMOS ? gmdate('Y-m-d H:i:s', strtotime($this->ahora() . ' UTC') + self::MINUTOS_BLOQUEO * 60) : null;
        $this->pdo->prepare('UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id = ?')
            ->execute([$bloqueo ? 0 : $fallos, $bloqueo, $usuarioId]);
    }

    private function cerrarSesiones(int $usuarioId): void
    {
        $this->pdo->prepare('DELETE FROM sesiones WHERE usuario_id = ?')->execute([$usuarioId]);
    }

    private function sumarHoras(int $horas): string
    {
        return gmdate('Y-m-d H:i:s', strtotime($this->ahora() . ' UTC') + $horas * 3600);
    }

    private function ahora(): string
    {
        return $this->ahora !== null ? ($this->ahora)() : gmdate('Y-m-d H:i:s');
    }
}
