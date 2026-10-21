<?php

declare(strict_types=1);

namespace Agora\Plataforma\Persistencia;

use PDO;

/** Conexión a la base (SQLite o MySQL/MariaDB) y aplicación de las migraciones pendientes. */
final class Base
{
    /**
     * @param string $dsn sqlite:/ruta/archivo.sqlite  o  mysql:host=127.0.0.1;port=3306;dbname=contratos;charset=utf8mb4
     */
    public static function conectar(string $dsn, ?string $usuario = null, ?string $clave = null): PDO
    {
        $mysql = str_starts_with($dsn, 'mysql:');
        $opciones = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ];
        if ($mysql) {
            // Sentencias preparadas reales en el servidor: los datos binarios (firma PNG) viajan intactos.
            $opciones[PDO::ATTR_EMULATE_PREPARES] = false;
        }
        $pdo = new PDO($dsn, $usuario, $clave, $opciones);
        if ($mysql) {
            $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci, sql_mode = 'STRICT_ALL_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
        } else {
            $pdo->exec('PRAGMA foreign_keys = ON');
        }
        (new Migrador($pdo))->aplicar();
        return $pdo;
    }

    /** Conexión según .env: CONTRATOS_BD y, para MySQL, CONTRATOS_BD_USUARIO y CONTRATOS_BD_CLAVE. */
    public static function desdeEntorno(string $porDefecto): PDO
    {
        return self::conectar(
            getenv('CONTRATOS_BD') ?: $porDefecto,
            getenv('CONTRATOS_BD_USUARIO') ?: null,
            getenv('CONTRATOS_BD_CLAVE') ?: null,
        );
    }
}
