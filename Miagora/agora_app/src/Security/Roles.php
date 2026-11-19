<?php
declare(strict_types=1);

namespace Agora\Security;

/** Permisos por rol, validados en el servidor (el selector "Ver como" de la app es solo visual). */
final class Roles
{
    public const LABELS = ['SUPERADMIN' => 'Superadministrador', 'DIRECCION' => 'Dirección', 'ADMIN' => 'Administración', 'VENTAS' => 'Ventas', 'CONTADOR' => 'Contador (solo lectura)'];

    private const PERMS = [
        'datos.leer' => ['SUPERADMIN', 'DIRECCION', 'ADMIN', 'VENTAS', 'CONTADOR'],
        'datos.escribir' => ['SUPERADMIN', 'DIRECCION', 'ADMIN'],
        'agenda.escribir' => ['SUPERADMIN', 'DIRECCION', 'ADMIN', 'VENTAS'],
        'facturas.ver' => ['SUPERADMIN', 'DIRECCION', 'ADMIN', 'CONTADOR', 'VENTAS'],
        'facturas.emitir' => ['SUPERADMIN', 'DIRECCION', 'ADMIN'],
        'facturas.anular' => ['SUPERADMIN', 'DIRECCION'],
        'pagos.registrar' => ['SUPERADMIN', 'DIRECCION', 'ADMIN'],
        'pagos.revertir' => ['SUPERADMIN', 'DIRECCION'],
        'periodos.cerrar' => ['SUPERADMIN', 'DIRECCION'],
        'periodos.reabrir' => ['SUPERADMIN'],
        'fiscal.configurar' => ['SUPERADMIN', 'DIRECCION'],
        'usuarios.gestionar' => ['SUPERADMIN', 'DIRECCION'],
        'auditoria.ver' => ['SUPERADMIN', 'DIRECCION', 'CONTADOR'],
        'libro.ventas' => ['SUPERADMIN', 'DIRECCION', 'ADMIN', 'CONTADOR'],
        'seguridad.ver' => ['SUPERADMIN'],
        'seguridad.gestionar' => ['SUPERADMIN'],
        'exportar' => ['SUPERADMIN', 'DIRECCION'],
        'importar' => ['SUPERADMIN'],
        'tasas.cotizar' => ['SUPERADMIN', 'DIRECCION', 'ADMIN', 'VENTAS'],
    ];

    public static function can(?string $role, string $perm): bool
    {
        return $role !== null && in_array($role, self::PERMS[$perm] ?? [], true);
    }

    public static function valid(string $role): bool
    {
        return isset(self::LABELS[$role]);
    }

    /** @return list<string> */
    public static function permsOf(?string $role): array
    {
        return array_keys(array_filter(self::PERMS, fn ($roles) => $role !== null && in_array($role, $roles, true)));
    }
}
