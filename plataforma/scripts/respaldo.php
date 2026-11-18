<?php

declare(strict_types=1);

/**
 * Copia de seguridad completa: base de datos (instantánea consistente), PDF de convenios, clave de enlaces y .env.
 * Base SQLite (storage/contratos.sqlite) o MySQL/MariaDB (storage/contratos.sql, volcado con mysqldump).
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
$usuario = getenv('CONTRATOS_BD_USUARIO') ?: null;
$clave = getenv('CONTRATOS_BD_CLAVE') ?: null;
$mysql = str_starts_with($dsn, 'mysql:');
if (!$mysql && !str_starts_with($dsn, 'sqlite:')) {
    fallar('CONTRATOS_BD debe empezar por sqlite: o mysql:.');
}
if (!$mysql && !is_file(substr($dsn, strlen('sqlite:')))) {
    fallar('No existe la base ' . substr($dsn, strlen('sqlite:')) . '.');
}

if (!is_dir($destino) && !mkdir($destino, 0700, true)) {
    fallar("No se pudo crear {$destino}.");
}
$marca = date('Ymd-His');
$trabajo = sys_get_temp_dir() . '/respaldo-' . $marca . '-' . bin2hex(random_bytes(4));
mkdir($trabajo . '/storage/documentos', 0700, true);

// 1. Base: instantánea consistente aunque la aplicación esté escribiendo.
//    SQLite: VACUUM INTO. MySQL/MariaDB: mysqldump --single-transaction (sin bloquear la aplicación).
$conteos = [];
try {
    $pdo = new PDO($dsn, $usuario, $clave, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    if ($mysql) {
        require __DIR__ . '/lib/mysql.php';
        $partes = mysql_partes($dsn);
        $credenciales = mysql_credenciales($partes, $usuario, $clave);
        $volcado = $trabajo . '/storage/contratos.sql';
        $orden = escapeshellarg(mysql_programa('mariadb-dump', 'mysqldump'))
            . ' --defaults-extra-file=' . escapeshellarg($credenciales)
            . ' --single-transaction --quick --hex-blob --no-tablespaces --default-character-set=utf8mb4 '
            . escapeshellarg($partes['dbname']) . ' > ' . escapeshellarg($volcado) . ' 2> ' . escapeshellarg($volcado . '.err');
        exec($orden, $salida, $codigo);
        unlink($credenciales);
        $errores = trim((string) @file_get_contents($volcado . '.err'));
        @unlink($volcado . '.err');
        if ($codigo !== 0 || !str_contains((string) shell_exec('tail -c 200 ' . escapeshellarg($volcado)), 'Dump completed')) {
            throw new RuntimeException('mysqldump falló: ' . $errores);
        }
    } else {
        $pdo->exec('VACUUM INTO ' . $pdo->quote($trabajo . '/storage/contratos.sqlite'));
    }
    foreach (['contratos', 'versiones', 'firmas', 'documentos', 'documentos_firmados', 'usuarios', 'eventos'] as $tabla) {
        $conteos[$tabla] = (int) $pdo->query("SELECT COUNT(*) FROM {$tabla}")->fetchColumn();
    }
    $pdo = null;
} catch (Throwable $e) {
    exec('rm -rf ' . escapeshellarg($trabajo));
    fallar('No se pudo copiar la base: ' . $e->getMessage());
}

// 2. PDF de convenios (enviados y firmados), claves de cifrado y .env.
$documentos = $raiz . '/storage/documentos';
foreach (is_dir($documentos) ? scandir($documentos) : [] as $f) {
    if (is_file("{$documentos}/{$f}") && !copy("{$documentos}/{$f}", "{$trabajo}/storage/documentos/{$f}")) {
        fallar("No se pudo copiar {$f}.");
    }
}
// Claves de cifrado: todas las versiones (una copia sin la clave con que se cifró un dato no puede leerlo).
$claves = glob($raiz . '/storage/claves/v*.key') ?: [];
if ($claves) {
    mkdir($trabajo . '/storage/claves', 0700, true);
}
foreach (array_merge(['storage/clave-enlaces.key', '.env'], array_map(fn ($c) => 'storage/claves/' . basename($c), $claves)) as $rel) {
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
    'motor' => $mysql ? 'mysql' : 'sqlite',
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
