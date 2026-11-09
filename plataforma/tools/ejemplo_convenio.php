<?php

/**
 * Genera el convenio de ejemplo (el de la PDF original) para revisar la plantilla.
 *   php tools/ejemplo_convenio.php > salida.html
 */

declare(strict_types=1);

spl_autoload_register(static function (string $clase): void {
    if (str_starts_with($clase, 'Agora\\Plataforma\\')) {
        $archivo = __DIR__ . '/../src/' . str_replace('\\', '/', substr($clase, strlen('Agora\\Plataforma\\'))) . '.php';
        if (is_file($archivo)) {
            require $archivo;
        }
    }
});

use Agora\Plataforma\Calculo\CalculadoraContrato;
use Agora\Plataforma\Calculo\Cargo;
use Agora\Plataforma\Calculo\Dinero;
use Agora\Plataforma\Calculo\Terminos;
use Agora\Plataforma\Documento\ArmadorConvenio;
use Agora\Plataforma\Documento\Renderizador;

$terminos = new Terminos(Dinero::desde('105'), 12, 2026, 11, 1, [new Cargo('Inscripción', Dinero::desde('20'))]);
$resultado = (new CalculadoraContrato())->calcular($terminos);
$variables = (new ArmadorConvenio())->variables([
    'nombre' => 'Yuly Eunice Navas Callaspo',
    'cedula' => '14943155',
    'telefono' => '0412-5063751',
    'staff' => 'Maria Carvallo',
    'fecha' => '2026-10-13',
    'descuento_primera' => '0',
], $terminos, $resultado);

$plantilla = file_get_contents(__DIR__ . '/../plantillas/convenio.html');
echo (new Renderizador())->render($plantilla, $variables);
