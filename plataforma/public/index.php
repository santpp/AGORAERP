<?php

/**
 * Punto de entrada de la API (/api/...).
 * Funciona en el repositorio (contratos/public/) y en el servidor (public_html/, con el código en ../contratos/).
 */

declare(strict_types=1);

$base = is_file(__DIR__ . '/../contratos/src/Web/arranque.php') ? __DIR__ . '/../contratos' : __DIR__ . '/..';
require $base . '/src/Web/arranque.php';
require $base . '/src/Web/emitir.php';
