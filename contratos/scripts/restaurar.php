<?php

declare(strict_types=1);

/**
 * Simulacro de restauración: comprueba que un respaldo se puede restaurar, sin tocar producción.
 *
 * Uso:  php scripts/restaurar.php respaldos/respaldo-AAAAMMDD-HHMMSS.tar.gz
 *
 * Descomprime en una carpeta temporal y verifica: sha256 de cada archivo contra el manifiesto, integridad de
 * la base (PRAGMA integrity_check), conteos de filas iguales a los del manifiesto, y que cada PDF que la base
 * menciona está en el respaldo. Sale con código 0 si todo cuadra. La restauración real se hace a mano:
 * ver docs/respaldos.md.
 */

$archivo = $argv[1] ?? '';
if ($archivo === '' || !is_file($archivo)) {
    fwrite(STDERR, "Uso: php scripts/restaurar.php respaldo.tar.gz\n");
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

// 1. Cada archivo coincide con su sha256.
foreach ($manifiesto['archivos'] as $rel => $sha) {
    $ruta = "{$tmp}/{$rel}";
    if (!is_file($ruta)) {
        $errores[] = "Falta {$rel}.";
    } elseif (hash_file('sha256', $ruta) !== $sha) {
        $errores[] = "sha256 distinto en {$rel}.";
    }
}

// 2. La base abre, está íntegra y tiene los mismos conteos.
$conteos = [];
try {
    $pdo = new PDO('sqlite:' . $tmp . '/storage/contratos.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $integridad = (string) $pdo->query('PRAGMA integrity_check')->fetchColumn();
    if ($integridad !== 'ok') {
        $errores[] = "integrity_check: {$integridad}";
    }
    foreach ($manifiesto['conteos'] as $tabla => $esperado) {
        $conteos[$tabla] = (int) $pdo->query("SELECT COUNT(*) FROM {$tabla}")->fetchColumn();
        if ($conteos[$tabla] !== $esperado) {
            $errores[] = "{$tabla}: {$conteos[$tabla]} filas, el manifiesto dice {$esperado}.";
        }
    }
    // 3. Cada PDF registrado en la base está en el respaldo (se compara el nombre: la ruta absoluta cambia entre servidores).
    foreach (['documentos', 'documentos_firmados'] as $tabla) {
        foreach ($pdo->query("SELECT ruta FROM {$tabla}")->fetchAll(PDO::FETCH_COLUMN) as $ruta) {
            if (!is_file($tmp . '/storage/documentos/' . basename((string) $ruta))) {
                $errores[] = "Falta el PDF " . basename((string) $ruta) . " ({$tabla}).";
            }
        }
    }
} catch (Throwable $e) {
    $errores[] = 'La base no abre: ' . $e->getMessage();
}

exec('rm -rf ' . escapeshellarg($tmp));
echo 'Respaldo: ' . $archivo . PHP_EOL;
echo 'Creado:   ' . ($manifiesto['creado_en'] ?? '?') . PHP_EOL;
echo 'Archivos: ' . count($manifiesto['archivos']) . '  Filas: ' . json_encode($conteos) . PHP_EOL;
if ($errores) {
    echo "RESULTADO: FALLA\n - " . implode("\n - ", $errores) . PHP_EOL;
    exit(1);
}
echo "RESULTADO: OK (se puede restaurar)\n";
