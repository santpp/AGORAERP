<?php

declare(strict_types=1);

/**
 * Traspaso único de los datos de SQLite a MySQL/MariaDB.
 *
 * Uso:  php scripts/sqlite-a-mysql.php /ruta/storage/contratos.sqlite
 *
 * El destino es la base MySQL de .env (CONTRATOS_BD=mysql:…, CONTRATOS_BD_USUARIO, CONTRATOS_BD_CLAVE).
 * - El archivo SQLite se abre en solo lectura: no se modifica.
 * - El destino debe estar vacío (se aplican sus migraciones y se comprueba que no hay datos).
 * - Se copian todas las tablas en orden de dependencias y con los mismos id, en una sola transacción.
 * - Se verifica cada tabla: número de filas y una suma sha256 de todas sus filas, en origen y destino.
 * Las sesiones no se copian: todos vuelven a iniciar sesión tras el cambio.
 * Sale con código 0 solo si todo coincide.
 */

$raiz = dirname(__DIR__);
spl_autoload_register(static function (string $clase) use ($raiz): void {
    if (str_starts_with($clase, 'Asocim\\Contratos\\')) {
        $archivo = $raiz . '/src/' . str_replace('\\', '/', substr($clase, strlen('Asocim\\Contratos\\'))) . '.php';
        if (is_file($archivo)) {
            require $archivo;
        }
    }
});
require $raiz . '/src/Web/cargar_entorno.php';
cargar_entorno($raiz . '/.env');

use Asocim\Contratos\Persistencia\Base;

/** Tablas en orden de dependencias (las referenciadas primero) y su clave primaria. */
const TABLAS = [
    'usuarios' => 'id',
    'contratos' => 'id',
    'versiones' => 'id',
    'tokens_firma' => 'id',
    'firmas' => 'id',
    'eventos' => 'id',
    'documentos' => 'id',
    'enlaces_firma' => 'version_id',
    'descargas_firma' => 'id',
    'documentos_firmados' => 'id',
];

function fallar(string $mensaje): never
{
    fwrite(STDERR, '[traspaso] ERROR: ' . $mensaje . PHP_EOL);
    exit(1);
}

/** Suma de control de una tabla: sha256 de todas sus filas en orden, con cada valor como texto. */
function suma(PDO $pdo, string $tabla, string $clave, array $columnas): array
{
    $lista = implode(', ', array_map(static fn (string $c) => $c, $columnas));
    $hash = hash_init('sha256');
    $filas = 0;
    foreach ($pdo->query("SELECT {$lista} FROM {$tabla} ORDER BY {$clave}", PDO::FETCH_NUM) as $fila) {
        hash_update($hash, implode("\x1f", array_map(static fn ($v) => $v === null ? "\x00NULL" : (string) $v, $fila)) . "\x1e");
        $filas++;
    }
    return [$filas, hash_final($hash)];
}

$rutaSqlite = $argv[1] ?? '';
if ($rutaSqlite === '' || !is_file($rutaSqlite)) {
    fallar('Indica el archivo SQLite de origen: php scripts/sqlite-a-mysql.php /ruta/contratos.sqlite');
}
$dsnDestino = getenv('CONTRATOS_BD') ?: '';
if (!str_starts_with($dsnDestino, 'mysql:')) {
    fallar('CONTRATOS_BD en .env debe apuntar a MySQL (mysql:host=…;dbname=…;charset=utf8mb4).');
}

$origen = new PDO('sqlite:' . $rutaSqlite, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::SQLITE_ATTR_OPEN_FLAGS => PDO::SQLITE_OPEN_READONLY,
]);
try {
    $destino = Base::desdeEntorno($dsnDestino);
} catch (Throwable $e) {
    fallar('No se pudo conectar a MySQL: ' . $e->getMessage());
}

foreach (array_keys(TABLAS) as $tabla) {
    if ((int) $destino->query("SELECT COUNT(*) FROM {$tabla}")->fetchColumn() > 0) {
        fallar("La tabla {$tabla} de MySQL ya tiene datos. El traspaso solo se hace sobre una base vacía.");
    }
}

// Columnas comunes: las que existen en origen y destino (el destino puede tener columnas nuevas con valor por defecto).
$columnas = [];
foreach (array_keys(TABLAS) as $tabla) {
    $enOrigen = array_column($origen->query("PRAGMA table_info({$tabla})")->fetchAll(PDO::FETCH_ASSOC), 'name');
    $enDestino = $destino->query("SHOW COLUMNS FROM {$tabla}")->fetchAll(PDO::FETCH_COLUMN);
    $columnas[$tabla] = array_values(array_intersect($enOrigen, $enDestino));
}

$destino->beginTransaction();
try {
    foreach (TABLAS as $tabla => $clave) {
        $lista = implode(', ', $columnas[$tabla]);
        $marcas = implode(', ', array_fill(0, count($columnas[$tabla]), '?'));
        $insertar = $destino->prepare("INSERT INTO {$tabla} ({$lista}) VALUES ({$marcas})");
        foreach ($origen->query("SELECT {$lista} FROM {$tabla} ORDER BY {$clave}", PDO::FETCH_NUM) as $fila) {
            foreach ($fila as $i => $valor) {
                $insertar->bindValue($i + 1, $valor, $valor === null ? PDO::PARAM_NULL
                    : ($columnas[$tabla][$i] === 'firma_png' ? PDO::PARAM_LOB : PDO::PARAM_STR));
            }
            $insertar->execute();
        }
    }
    $destino->commit();
} catch (Throwable $e) {
    $destino->rollBack();
    fallar('El traspaso se canceló sin dejar datos a medias: ' . $e->getMessage());
}

// Verificación tabla por tabla.
$diferencias = 0;
foreach (TABLAS as $tabla => $clave) {
    [$filasOrigen, $sumaOrigen] = suma($origen, $tabla, $clave, $columnas[$tabla]);
    [$filasDestino, $sumaDestino] = suma($destino, $tabla, $clave, $columnas[$tabla]);
    $ok = $filasOrigen === $filasDestino && $sumaOrigen === $sumaDestino;
    $diferencias += $ok ? 0 : 1;
    printf("%-20s %6d filas  %s\n", $tabla, $filasDestino, $ok ? 'OK' : "DIFIERE (origen {$filasOrigen} filas)");
}
if ($diferencias > 0) {
    fallar("{$diferencias} tabla(s) no coinciden. No cambies .env todavía: revisa los datos de esas tablas.");
}
echo "Traspaso completo y verificado. Las sesiones no se copian: todos inician sesión de nuevo.\n";
