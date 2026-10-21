<?php

/**
 * Responde a la petición actual. Lo usan la API (public/index.php) y el webhook.
 * Requiere haber cargado arranque.php antes.
 * Si la respuesta trae '__archivo', se devuelve el PDF tal cual en lugar de JSON.
 */

[$codigo, $cuerpo] = $app->responder(
    $_SERVER['REQUEST_METHOD'] ?? 'GET',
    parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/',
    $cabeceras,
    (string) file_get_contents('php://input'),
);
http_response_code($codigo);
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

if (isset($cuerpo['__archivo'])) {
    header('Content-Type: application/pdf');
    header('Content-Disposition: inline; filename="' . $cuerpo['__nombre'] . '"');
    // El panel muestra los PDF en un iframe propio; ninguna otra web puede incrustarlos.
    header("Content-Security-Policy: frame-ancestors 'self'");
    readfile($cuerpo['__archivo']);
    exit;
}

header('Content-Type: application/json; charset=utf-8');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
$cookie = $cuerpo['cookie'] ?? null;
unset($cuerpo['cookie']);
if ($cookie !== null) {
    header('Set-Cookie: ' . $cookie);
}
echo json_encode($cuerpo, JSON_UNESCAPED_UNICODE);
