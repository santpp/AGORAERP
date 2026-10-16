<?php

/**
 * Responde a la petición actual con JSON. Lo usan la API (public/index.php) y el webhook.
 * Requiere haber cargado arranque.php antes.
 */

[$codigo, $cuerpo] = $app->responder(
    $_SERVER['REQUEST_METHOD'] ?? 'GET',
    parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/',
    $cabeceras,
    (string) file_get_contents('php://input'),
);
http_response_code($codigo);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
$cookie = $cuerpo['cookie'] ?? null;
unset($cuerpo['cookie']);
if ($cookie !== null) {
    header('Set-Cookie: ' . $cookie);
}
echo json_encode($cuerpo, JSON_UNESCAPED_UNICODE);
