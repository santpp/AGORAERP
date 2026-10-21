<?php

declare(strict_types=1);

namespace Asocim\Contratos\Tests;

use Asocim\Contratos\Persistencia\Base;
use PDO;

/**
 * Base para las pruebas: SQLite en memoria por defecto. Con CONTRATOS_PRUEBAS_BD (DSN mysql:…) las mismas
 * pruebas corren contra MySQL/MariaDB; la base se vacía antes de cada prueba (usar solo una base de pruebas).
 *   CONTRATOS_PRUEBAS_BD='mysql:host=127.0.0.1;port=3306;dbname=contratos_prueba;charset=utf8mb4' \
 *   CONTRATOS_PRUEBAS_BD_USUARIO=... CONTRATOS_PRUEBAS_BD_CLAVE=... php tests/run.php
 */
final class BasePrueba
{
    public static function conectar(): PDO
    {
        $dsn = getenv('CONTRATOS_PRUEBAS_BD') ?: '';
        if ($dsn === '') {
            return Base::conectar('sqlite::memory:');
        }
        $usuario = getenv('CONTRATOS_PRUEBAS_BD_USUARIO') ?: null;
        $clave = getenv('CONTRATOS_PRUEBAS_BD_CLAVE') ?: null;
        $pdo = new PDO($dsn, $usuario, $clave, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $tabla) {
            $pdo->exec('DROP TABLE `' . str_replace('`', '', (string) $tabla) . '`');
        }
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        return Base::conectar($dsn, $usuario, $clave);
    }
}
