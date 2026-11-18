<?php

declare(strict_types=1);

namespace Agora\Plataforma\Seguridad;

/**
 * Qué puede hacer cada rol.
 *  ADMIN      todo, incluido administrar usuarios
 *  REMITENTE  crear, editar, enviar y revocar contratos
 *  VISOR      solo consultar
 */
final class Roles
{
    public const ADMIN = 'ADMIN';
    public const REMITENTE = 'REMITENTE';
    public const VISOR = 'VISOR';

    public const TODOS = [self::ADMIN, self::REMITENTE, self::VISOR];

    private const PERMISOS = [
        self::ADMIN => ['ver', 'editar', 'enviar', 'revocar', 'usuarios'],
        self::REMITENTE => ['ver', 'editar', 'enviar', 'revocar'],
        self::VISOR => ['ver'],
    ];

    public static function puede(string $rol, string $permiso): bool
    {
        return in_array($permiso, self::PERMISOS[$rol] ?? [], true);
    }
}
