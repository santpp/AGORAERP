<?php
/** Entrega el token anti-CSRF de la sesión (GET, mismo origen, con límite). */
declare(strict_types=1);
require __DIR__ . '/_bootstrap.php';

require_method('GET');
require_same_origin($CONFIG, false);
rate_limit($CONFIG, 'csrf', 60, 600);
respond(200, ['token' => csrf_token()]);
