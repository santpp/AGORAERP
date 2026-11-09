<?php

declare(strict_types=1);

/** Utilidades para los scripts de respaldo con MySQL/MariaDB. */

/** Partes de un DSN mysql:host=…;port=…;dbname=…;unix_socket=… */
function mysql_partes(string $dsn): array
{
    $partes = [];
    foreach (explode(';', substr($dsn, strlen('mysql:'))) as $par) {
        if (str_contains($par, '=')) {
            [$k, $v] = explode('=', $par, 2);
            $partes[trim($k)] = trim($v);
        }
    }
    if (($partes['dbname'] ?? '') === '') {
        throw new RuntimeException('El DSN de MySQL no tiene dbname.');
    }
    return $partes;
}

/**
 * Archivo temporal de credenciales (permisos 0600) para mysqldump/mysql: así la clave no aparece en la
 * lista de procesos. Quien llama debe borrarlo.
 */
function mysql_credenciales(array $partes, ?string $usuario, ?string $clave): string
{
    $ruta = tempnam(sys_get_temp_dir(), 'mycnf');
    chmod($ruta, 0600);
    $lineas = ['[client]'];
    if ($usuario !== null && $usuario !== '') {
        $lineas[] = 'user=' . $usuario;
    }
    if ($clave !== null && $clave !== '') {
        $lineas[] = 'password="' . str_replace(['\\', '"'], ['\\\\', '\\"'], $clave) . '"';
    }
    if (isset($partes['unix_socket'])) {
        $lineas[] = 'socket=' . $partes['unix_socket'];
    } else {
        $lineas[] = 'host=' . ($partes['host'] ?? 'localhost');
        $lineas[] = 'port=' . ($partes['port'] ?? '3306');
    }
    file_put_contents($ruta, implode("\n", $lineas) . "\n");
    return $ruta;
}

/** Primer ejecutable disponible entre los nombres dados (MariaDB usa mariadb-dump; MySQL, mysqldump). */
function mysql_programa(string ...$nombres): string
{
    foreach ($nombres as $n) {
        $ruta = trim((string) shell_exec('command -v ' . escapeshellarg($n) . ' 2>/dev/null'));
        if ($ruta !== '') {
            return $ruta;
        }
    }
    throw new RuntimeException('No se encontró ' . implode(' ni ', $nombres) . ' en el servidor.');
}
