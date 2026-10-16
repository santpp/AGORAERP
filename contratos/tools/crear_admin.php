<?php

/**
 * Crea el primer administrador desde la terminal del servidor.
 *   php tools/crear_admin.php correo@asocim.com "Nombre Apellido"
 * Pide la clave sin mostrarla en pantalla.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit("Solo desde la terminal.\n");
}
if ($argc < 3) {
    exit("Uso: php tools/crear_admin.php correo nombre\n");
}

spl_autoload_register(static function (string $clase): void {
    if (str_starts_with($clase, 'Asocim\\Contratos\\')) {
        $archivo = __DIR__ . '/../src/' . str_replace('\\', '/', substr($clase, strlen('Asocim\\Contratos\\'))) . '.php';
        if (is_file($archivo)) {
            require $archivo;
        }
    }
});
require __DIR__ . '/../src/Web/cargar_entorno.php';
cargar_entorno(__DIR__ . '/../.env');

use Asocim\Contratos\Persistencia\Base;
use Asocim\Contratos\Seguridad\Roles;
use Asocim\Contratos\Servicio\UsuarioServicio;

$bd = getenv('CONTRATOS_BD') ?: 'sqlite:' . __DIR__ . '/../storage/contratos.sqlite';
$servicio = new UsuarioServicio(Base::conectar($bd));

echo "Clave del administrador (mínimo 10 caracteres): ";
system('stty -echo');
$clave = trim((string) fgets(STDIN));
system('stty echo');
echo "\n";

$id = $servicio->crear($argv[1], $argv[2], $clave, Roles::ADMIN);
echo "Administrador creado (id {$id}). Ya puedes iniciar sesión.\n";
