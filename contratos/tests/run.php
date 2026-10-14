<?php

/**
 * Ejecutor de pruebas sin dependencias, para cuando PHPUnit no está instalado.
 *   php tests/run.php
 * Con PHPUnit instalado (composer install), usa: vendor/bin/phpunit
 */

declare(strict_types=1);

spl_autoload_register(static function (string $clase): void {
    $prefijos = [
        'Asocim\\Contratos\\Tests\\' => __DIR__ . '/',
        'Asocim\\Contratos\\' => __DIR__ . '/../src/',
    ];
    foreach ($prefijos as $prefijo => $dir) {
        if (str_starts_with($clase, $prefijo)) {
            $archivo = $dir . str_replace('\\', '/', substr($clase, strlen($prefijo))) . '.php';
            if (is_file($archivo)) {
                require $archivo;
            }
        }
    }
});

require __DIR__ . '/ShimPHPUnit.php';

$clases = [
    'Asocim\\Contratos\\Tests\\CalculadoraContratoTest',
    'Asocim\\Contratos\\Tests\\ServicioContratoTest',
];

$pasadas = 0;
$fallidas = [];

foreach ($clases as $clase) {
    require str_replace(['Asocim\\Contratos\\Tests\\', '\\'], [__DIR__ . '/', '/'], $clase) . '.php';
    foreach (get_class_methods($clase) as $metodo) {
        if (!str_starts_with($metodo, 'test_')) {
            continue;
        }
        $prueba = new $clase();
        $nombre = basename(str_replace('\\', '/', $clase)) . '::' . $metodo;
        try {
            $prueba->prepararPrueba();
            $prueba->{$metodo}();
            if ($prueba->excepcionEsperada() !== null) {
                $fallidas[$nombre] = 'no lanzó ' . $prueba->excepcionEsperada();
                continue;
            }
            $pasadas++;
        } catch (\PHPUnit\Framework\AssertionFailed $e) {
            $fallidas[$nombre] = $e->getMessage();
        } catch (\Throwable $e) {
            $esperada = $prueba->excepcionEsperada();
            if ($esperada !== null && $e instanceof $esperada) {
                $pasadas++;
            } else {
                $fallidas[$nombre] = get_class($e) . ': ' . $e->getMessage();
            }
        }
    }
}

foreach ($fallidas as $nombre => $motivo) {
    echo "FALLA  {$nombre}: {$motivo}\n";
}
$total = $pasadas + count($fallidas);
echo "\n{$pasadas}/{$total} pruebas pasaron\n";
exit($fallidas === [] ? 0 : 1);
