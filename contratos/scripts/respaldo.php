<?php

declare(strict_types=1);

/**
 * Copia de seguridad completa: base de datos (instantánea consistente), PDF de convenios, clave de enlaces y .env.
 *
 * Uso:   php scripts/respaldo.php [--destino=/ruta/respaldos] [--conservar=14]
 * Cron:  15 3 * * * php /ruta/contratos/scripts/respaldo.php >> /ruta/contratos/respaldos/respaldo.log 2>&1
 *
 * Crea respaldos/respaldo-AAAAMMDD-HHMMSS.tar.gz (permisos 0600) con un manifest.json que lleva el sha256
 * de cada archivo, y borra los respaldos más antiguos que --conservar días. Sale con código 1 si algo falla.
 */

$raiz = dirname(__DIR__);
require $raiz . '/src/Web/cargar_entorno.php';
cargar_entorno($raiz . '/.env');

$opciones = getopt('', ['destino::', 'conservar::']);
$destino = rtrim((string) ($opciones['destino'] ?? $raiz . '/respaldos'), '/');
$conservar = max(1, (int) ($opciones['conservar'] ?? 14));

function fallar(string $mensaje): never
{
    fwrite(STDERR, '[respaldo] ERROR: ' . $mensaje . PHP_EOL);
    exit(1);
}

$dsn = getenv('CONTRATOS_BD') ?: 'sqlite:' . $raiz . '/storage/contratos.sqlite';
if (!str_starts_with($dsn, 'sqlite:')) {
    fallar('Solo se admite SQLite (CONTRATOS_BD empieza por sqlite:).');
}
$archivoBd = substr($dsn, strlen('sqlite:'));
if (!is_file($archivoBd)) {
    fallar("No existe la base {$archivoBd}.");
}

if (!is_dir($destino) && !mkdir($destino, 0700, true)) {
    fallar("No se pudo crear {$destino}.");
}
$marca = date('Ymd-His');
$trabajo = sys_get_temp_dir() . '/respaldo-' . $marca . '-' . bin2hex(random_bytes(4));
mkdir($trabajo . '/storage/documentos', 0700, true);

// 1. Base: instantánea consistente aunque la aplicación esté escribiendo.
$copiaBd = $trabajo . '/storage/contratos.sqlite';
try {
    $pdo = new PDO($dsn, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec('VACUUM INTO ' . $pdo->quote($copiaBd));
    $conteos = [];
    foreach (['contratos', 'versiones', 'firmas', 'documentos', 'documentos_firmados', 'usuarios', 'eventos'] as $tabla) {
        $conteos[$tabla] = (int) $pdo->query("SELECT COUNT(*) FROM {$tabla}")->fetchColumn();
    }
    $pdo = null;
} catch (Throwable $e) {
    fallar('No se pudo copiar la base: ' . $e->getMessage());
}

// 2. PDF de convenios (enviados y firmados), clave de enlaces y .env.
$documentos = $raiz . '/storage/documentos';
foreach (is_dir($documentos) ? scandir($documentos) : [] as $f) {
    if (is_file("{$documentos}/{$f}") && !copy("{$documentos}/{$f}", "{$trabajo}/storage/documentos/{$f}")) {
        fallar("No se pudo copiar {$f}.");
    }
}
foreach (['storage/clave-enlaces.key', '.env'] as $rel) {
    if (is_file("{$raiz}/{$rel}") && !copy("{$raiz}/{$rel}", "{$trabajo}/{$rel}")) {
        fallar("No se pudo copiar {$rel}.");
    }
}

// 3. Manifiesto con el sha256 de cada archivo, para verificar la restauración.
$archivos = [];
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($trabajo, FilesystemIterator::SKIP_DOTS));
foreach ($it as $archivo) {
    $rel = substr($archivo->getPathname(), strlen($trabajo) + 1);
    $archivos[$rel] = hash_file('sha256', $archivo->getPathname());
}
ksort($archivos);
file_put_contents($trabajo . '/manifest.json', json_encode([
    'creado_en' => date('c'),
    'raiz_origen' => $raiz,
    'conteos' => $conteos,
    'archivos' => $archivos,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

// 4. Empaquetar (solo legible por el dueño: contiene .env y la clave).
$salida = "{$destino}/respaldo-{$marca}.tar.gz";
exec('tar -czf ' . escapeshellarg($salida) . ' -C ' . escapeshellarg($trabajo) . ' . 2>&1', $log, $codigo);
exec('rm -rf ' . escapeshellarg($trabajo));
if ($codigo !== 0 || !is_file($salida)) {
    fallar('tar falló: ' . implode(' ', $log));
}
chmod($salida, 0600);

// 5. Rotación: se borran los respaldos con más de --conservar días.
$limite = time() - $conservar * 86400;
foreach (glob("{$destino}/respaldo-*.tar.gz") ?: [] as $viejo) {
    if (filemtime($viejo) < $limite) {
        unlink($viejo);
    }
}

printf("[respaldo] %s  %s  %d archivos  %s\n", date('c'), $salida, count($archivos), json_encode($conteos));
