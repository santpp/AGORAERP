<?php

declare(strict_types=1);

/**
 * Rota la clave de cifrado de los datos guardados (hoy: los enlaces de firma).
 *
 * Uso:
 *   php scripts/rotar-claves.php              crea storage/claves/v{n+1}.key y recifra todo con ella
 *   php scripts/rotar-claves.php --recifrar   no crea clave: pasa a la versión actual lo que esté en otra
 *                                             (p. ej. datos copiados desde contratos/ en el formato anterior)
 *
 * Al terminar indica qué claves antiguas ya no usa ningún dato: esas se pueden retirar (sacarlas del servidor y
 * guardarlas con los respaldos el tiempo que se conserven respaldos que las necesiten). Ver docs/claves.md.
 */

$raiz = dirname(__DIR__);
spl_autoload_register(static function (string $clase) use ($raiz): void {
    if (str_starts_with($clase, 'Agora\\Plataforma\\')) {
        $archivo = $raiz . '/src/' . str_replace('\\', '/', substr($clase, strlen('Agora\\Plataforma\\'))) . '.php';
        if (is_file($archivo)) {
            require $archivo;
        }
    }
});
require $raiz . '/src/Web/cargar_entorno.php';
cargar_entorno($raiz . '/.env');

use Agora\Plataforma\Persistencia\Base;
use Agora\Plataforma\Seguridad\Llavero;
use Agora\Plataforma\Servicio\ContratoServicio;

$soloRecifrar = in_array('--recifrar', array_slice($argv, 1), true);
$storage = $raiz . '/storage';

try {
    $pdo = Base::desdeEntorno('sqlite:' . $storage . '/contratos.sqlite');
    $llavero = Llavero::desdeStorage($storage);
    if ($soloRecifrar) {
        $actual = $llavero->versionActual() ?? throw new RuntimeException("No se pudo crear ni leer {$storage}/claves.");
        echo "Versión actual: v{$actual}\n";
    } else {
        $actual = $llavero->crearVersion();
        echo "Clave nueva: storage/claves/v{$actual}.key\n";
    }

    $recifradas = 0;
    $ilegibles = [];
    $pdo->beginTransaction();
    $actualizar = $pdo->prepare('UPDATE enlaces_firma SET token_cifrado = ? WHERE version_id = ?');
    foreach ($pdo->query('SELECT version_id, token_cifrado FROM enlaces_firma')->fetchAll(PDO::FETCH_ASSOC) as $fila) {
        if (Llavero::versionDe((string) $fila['token_cifrado']) === $actual) {
            continue;
        }
        $texto = $llavero->descifrar((string) $fila['token_cifrado'], ContratoServicio::USO_ENLACES);
        if ($texto === null) {
            $ilegibles[] = (int) $fila['version_id'];
            continue;
        }
        $actualizar->execute([$llavero->cifrar($texto, ContratoServicio::USO_ENLACES), $fila['version_id']]);
        $recifradas++;
    }
    $pdo->commit();
    echo "Enlaces recifrados: {$recifradas}\n";
    if ($ilegibles) {
        // Sin su clave no se pueden leer; el enlace sigue funcionando para el cliente, solo no se muestra en el panel.
        echo 'Sin clave para leerlos (se dejan como están): versiones ' . implode(', ', $ilegibles) . "\n";
    }

    // Qué versiones siguen en uso: una petición que empezó antes de la rotación puede haber cifrado con la anterior.
    $enUso = [];
    foreach ($pdo->query('SELECT token_cifrado FROM enlaces_firma')->fetchAll(PDO::FETCH_COLUMN) as $valor) {
        $v = Llavero::versionDe((string) $valor);
        $enUso[$v] = ($enUso[$v] ?? 0) + 1;
    }
    foreach ($llavero->versiones() as $v) {
        if ($v === $actual) {
            continue;
        }
        echo isset($enUso[$v])
            ? "v{$v}: aún la usan {$enUso[$v]} enlaces. Vuelve a ejecutar con --recifrar antes de retirarla.\n"
            : "v{$v}: ningún dato la usa; se puede retirar (storage/claves/v{$v}.key).\n";
    }
    if (!isset($enUso[0]) && (is_file($storage . '/clave-enlaces.key') || getenv('APP_CLAVE'))) {
        echo "Formato anterior: ningún dato lo usa; storage/clave-enlaces.key y APP_CLAVE ya no hacen falta.\n";
    }
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, 'ERROR: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
