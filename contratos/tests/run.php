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
require __DIR__ . '/CalculadoraContratoTest.php';

$clase = 'Asocim\\Contratos\\Tests\\CalculadoraContratoTest';
$pasadas = 0;
$fallidas = [];

foreach (get_class_methods($clase) as $metodo) {
    if (!str_starts_with($metodo, 'test_')) {
        continue;
    }
    $prueba = new $clase();
    try {
        $prueba->prepararPrueba();
        $prueba->{$metodo}();
        if ($prueba->excepcionEsperada() !== null) {
            $fallidas[$metodo] = 'no lanzó ' . $prueba->excepcionEsperada();
            continue;
        }
        $pasadas++;
    } catch (\PHPUnit\Framework\AssertionFailed $e) {
        $fallidas[$metodo] = $e->getMessage();
    } catch (\Throwable $e) {
        $esperada = $prueba->excepcionEsperada();
        if ($esperada !== null && $e instanceof $esperada) {
            $pasadas++;
        } else {
            $fallidas[$metodo] = get_class($e) . ': ' . $e->getMessage();
        }
    }
}

foreach ($fallidas as $metodo => $motivo) {
    echo "FALLA  {$metodo}: {$motivo}\n";
}
$total = $pasadas + count($fallidas);
echo "\n{$pasadas}/{$total} pruebas pasaron\n";
exit($fallidas === [] ? 0 : 1);
