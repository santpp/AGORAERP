<?php

/** Punto de entrada. El webhook de GHL llega a /webhook.php. */

declare(strict_types=1);

http_response_code(404);
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['error' => 'No existe esta ruta.']);
