<?php

declare(strict_types=1);

/**
 * Aplica las migraciones pendientes de la base de .env y muestra el estado.
 * La aplicación también las aplica sola al conectarse; este script sirve para hacerlo a mano en un despliegue.
 *
 * Uso:  php scripts/migrar.php
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

use Agora\Plataforma\Persistencia\Migrador;

$dsn = getenv('CONTRATOS_BD') ?: 'sqlite:' . $raiz . '/storage/contratos.sqlite';
try {
    $pdo = new PDO($dsn, getenv('CONTRATOS_BD_USUARIO') ?: null, getenv('CONTRATOS_BD_CLAVE') ?: null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
    $migrador = new Migrador($pdo);
    $aplicadas = $migrador->aplicar();
    echo 'Motor: ' . $migrador->motor() . PHP_EOL;
    echo $aplicadas ? 'Aplicadas ahora: ' . implode(', ', $aplicadas) . PHP_EOL : "No había migraciones pendientes.\n";
    foreach ($pdo->query('SELECT version, aplicada_en FROM migraciones ORDER BY version') as $fila) {
        echo "  {$fila['version']}  ({$fila['aplicada_en']})\n";
    }
} catch (Throwable $e) {
    fwrite(STDERR, 'ERROR: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
