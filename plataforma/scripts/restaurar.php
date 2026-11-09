<?php

declare(strict_types=1);

/**
 * Simulacro de restauración: comprueba que un respaldo se puede restaurar, sin tocar producción.
 *
 * Uso:
 *   php scripts/restaurar.php respaldos/respaldo-AAAAMMDD-HHMMSS.tar.gz
 *   php scripts/restaurar.php respaldo.tar.gz --importar-en='mysql:host=localhost;dbname=contratos_simulacro'
 *
 * Siempre: sha256 de cada archivo contra el manifiesto.
 * Base SQLite: integridad (PRAGMA integrity_check), filas por tabla y PDF referenciados.
 * Base MySQL: el volcado está completo y tiene todas las tablas. Con --importar-en (una base de simulacro
 * vacía; credenciales en CONTRATOS_SIMULACRO_USUARIO y CONTRATOS_SIMULACRO_CLAVE) además se importa, se
 * comparan filas y PDF, y la base de simulacro se vacía al terminar.
 * La restauración real se hace a mano: ver docs/respaldos.md.
 */

// Argumentos en cualquier orden (getopt deja de leer opciones tras el primer argumento sin guiones).
$archivo = '';
$dsnSimulacro = '';
foreach (array_slice($argv, 1) as $arg) {
    if (str_starts_with($arg, '--importar-en=')) {
        $dsnSimulacro = substr($arg, strlen('--importar-en='));
    } elseif (!str_starts_with($arg, '--')) {
        $archivo = $arg;
    }
}
if ($archivo === '' || !is_file($archivo)) {
    fwrite(STDERR, "Uso: php scripts/restaurar.php respaldo.tar.gz [--importar-en=DSN_MYSQL]\n");
    exit(2);
}

$errores = [];
$tmp = sys_get_temp_dir() . '/restauracion-' . bin2hex(random_bytes(4));
mkdir($tmp, 0700, true);
exec('tar -xzf ' . escapeshellarg($archivo) . ' -C ' . escapeshellarg($tmp) . ' 2>&1', $log, $codigo);
if ($codigo !== 0) {
    fwrite(STDERR, 'No se pudo descomprimir: ' . implode(' ', $log) . PHP_EOL);
    exit(1);
}

$manifiesto = json_decode((string) @file_get_contents($tmp . '/manifest.json'), true);
if (!is_array($manifiesto)) {
    $errores[] = 'Falta manifest.json o no es válido.';
    $manifiesto = ['archivos' => [], 'conteos' => []];
}
$motor = $manifiesto['motor'] ?? 'sqlite';

// 1. Cada archivo coincide con su sha256.
foreach ($manifiesto['archivos'] as $rel => $sha) {
    $ruta = "{$tmp}/{$rel}";
    if (!is_file($ruta)) {
        $errores[] = "Falta {$rel}.";
    } elseif (hash_file('sha256', $ruta) !== $sha) {
        $errores[] = "sha256 distinto en {$rel}.";
    }
}

/** Filas por tabla y PDF referenciados, comparados con el manifiesto. */
function comprobarBase(PDO $pdo, array $manifiesto, string $tmp, array &$errores): array
{
    $conteos = [];
    foreach ($manifiesto['conteos'] as $tabla => $esperado) {
        $conteos[$tabla] = (int) $pdo->query("SELECT COUNT(*) FROM {$tabla}")->fetchColumn();
        if ($conteos[$tabla] !== $esperado) {
            $errores[] = "{$tabla}: {$conteos[$tabla]} filas, el manifiesto dice {$esperado}.";
        }
    }
    // Se compara el nombre del PDF: la ruta absoluta cambia entre servidores.
    foreach (['documentos', 'documentos_firmados'] as $tabla) {
        foreach ($pdo->query("SELECT ruta FROM {$tabla}")->fetchAll(PDO::FETCH_COLUMN) as $ruta) {
            if (!is_file($tmp . '/storage/documentos/' . basename((string) $ruta))) {
                $errores[] = 'Falta el PDF ' . basename((string) $ruta) . " ({$tabla}).";
            }
        }
    }
    return $conteos;
}

$conteos = [];
if ($motor === 'sqlite') {
    // 2a. La base abre, está íntegra y tiene los mismos conteos.
    try {
        $pdo = new PDO('sqlite:' . $tmp . '/storage/contratos.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $integridad = (string) $pdo->query('PRAGMA integrity_check')->fetchColumn();
        if ($integridad !== 'ok') {
            $errores[] = "integrity_check: {$integridad}";
        }
        $conteos = comprobarBase($pdo, $manifiesto, $tmp, $errores);
    } catch (Throwable $e) {
        $errores[] = 'La base no abre: ' . $e->getMessage();
    }
} else {
    // 2b. El volcado está completo y contiene todas las tablas.
    $volcado = $tmp . '/storage/contratos.sql';
    $final = (string) shell_exec('tail -c 200 ' . escapeshellarg($volcado) . ' 2>/dev/null');
    if (!str_contains($final, 'Dump completed')) {
        $errores[] = 'El volcado de MySQL está incompleto (no termina con «Dump completed»).';
    }
    $texto = (string) @file_get_contents($volcado);
    foreach (array_keys($manifiesto['conteos']) as $tabla) {
        if (!str_contains($texto, "CREATE TABLE `{$tabla}`")) {
            $errores[] = "El volcado no contiene la tabla {$tabla}.";
        }
    }
    $texto = '';
    if ($dsnSimulacro !== '') {
        // 3. Importar en una base de simulacro vacía y comparar.
        require __DIR__ . '/lib/mysql.php';
        $usuario = getenv('CONTRATOS_SIMULACRO_USUARIO') ?: null;
        $clave = getenv('CONTRATOS_SIMULACRO_CLAVE') ?: null;
        try {
            $partes = mysql_partes($dsnSimulacro);
            $pdo = new PDO($dsnSimulacro, $usuario, $clave, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            if ($pdo->query('SHOW TABLES')->fetchAll() !== []) {
                throw new RuntimeException('La base de simulacro no está vacía. Usa una base dedicada y vacía.');
            }
            $credenciales = mysql_credenciales($partes, $usuario, $clave);
            exec(escapeshellarg(mysql_programa('mariadb', 'mysql')) . ' --defaults-extra-file=' . escapeshellarg($credenciales)
                . ' ' . escapeshellarg($partes['dbname']) . ' < ' . escapeshellarg($volcado) . ' 2>&1', $salida, $codigoImportar);
            unlink($credenciales);
            if ($codigoImportar !== 0) {
                throw new RuntimeException('La importación falló: ' . implode(' ', $salida));
            }
            $conteos = comprobarBase($pdo, $manifiesto, $tmp, $errores);
            // Se deja la base de simulacro vacía otra vez.
            $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
            foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $tabla) {
                $pdo->exec('DROP TABLE `' . str_replace('`', '', (string) $tabla) . '`');
            }
        } catch (Throwable $e) {
            $errores[] = $e->getMessage();
        }
    }
}

exec('rm -rf ' . escapeshellarg($tmp));
echo 'Respaldo: ' . $archivo . PHP_EOL;
echo 'Creado:   ' . ($manifiesto['creado_en'] ?? '?') . '  Motor: ' . $motor . PHP_EOL;
echo 'Archivos: ' . count($manifiesto['archivos']) . '  Filas: ' . json_encode($conteos ?: $manifiesto['conteos']) . PHP_EOL;
if ($motor === 'mysql' && $dsnSimulacro === '') {
    echo "Aviso: sin --importar-en solo se comprobó el volcado; la prueba completa lo importa en una base de simulacro.\n";
}
if ($errores) {
    echo "RESULTADO: FALLA\n - " . implode("\n - ", $errores) . PHP_EOL;
    exit(1);
}
echo "RESULTADO: OK (se puede restaurar)\n";
