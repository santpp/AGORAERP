<?php

/**
 * Punto de entrada de la API (/api/...). El webhook de GHL sigue en /webhook.php.
 * En el servidor, public_html/.htaccess envía /api/... a este archivo.
 */

declare(strict_types=1);

require __DIR__ . '/../src/Web/arranque.php';
