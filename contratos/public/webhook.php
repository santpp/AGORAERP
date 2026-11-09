<?php

/**
 * Recibe los webhooks de GHL en /webhook.php.
 * Funciona en el repositorio (contratos/public/) y en el servidor, donde este archivo está en public_html/
 * y el código de contratos está en ../contratos/.
 */

declare(strict_types=1);

$base = is_file(__DIR__ . '/../contratos/src/Web/arranque.php') ? __DIR__ . '/../contratos' : __DIR__ . '/..';
require $base . '/src/Web/arranque.php';
require $base . '/src/Web/emitir.php';
