<?php

declare(strict_types=1);

namespace Asocim\Contratos\Persistencia;

use PDO;

/** Conexión a la base y creación del esquema. */
final class Base
{
    public static function conectar(string $dsn): PDO
    {
        $pdo = new PDO($dsn, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec(file_get_contents(__DIR__ . '/esquema.sql'));
        return $pdo;
    }
}
