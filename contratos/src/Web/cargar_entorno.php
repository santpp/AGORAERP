<?php

declare(strict_types=1);

/** Lee un archivo .env sencillo (CLAVE=valor). No sobrescribe variables ya definidas. */
function cargar_entorno(string $archivo): void
{
    if (!is_file($archivo)) {
        return;
    }
    foreach (file($archivo, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $linea) {
        $linea = trim($linea);
        if ($linea === '' || $linea[0] === '#' || !str_contains($linea, '=')) {
            continue;
        }
        [$clave, $valor] = array_map('trim', explode('=', $linea, 2));
        if (getenv($clave) === false) {
            putenv("{$clave}={$valor}");
        }
    }
}
