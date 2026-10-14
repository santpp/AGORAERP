<?php

declare(strict_types=1);

spl_autoload_register(static function (string $clase): void {
    if (str_starts_with($clase, 'Asocim\\Contratos\\')) {
        $archivo = __DIR__ . '/../' . str_replace('\\', '/', substr($clase, strlen('Asocim\\Contratos\\'))) . '.php';
        if (is_file($archivo)) {
            require $archivo;
        }
    }
});

require __DIR__ . '/cargar_entorno.php';
cargar_entorno(__DIR__ . '/../../.env');

use Asocim\Contratos\Persistencia\Base;
use Asocim\Contratos\Servicio\ContratoServicio;
use Asocim\Contratos\Web\Aplicacion;

$bd = getenv('CONTRATOS_BD') ?: 'sqlite:' . __DIR__ . '/../../storage/contratos.sqlite';
$app = new Aplicacion(new ContratoServicio(Base::conectar($bd)), (string) getenv('GHL_WEBHOOK_SECRET'));

$cabeceras = [];
foreach ($_SERVER as $k => $v) {
    if (str_starts_with($k, 'HTTP_')) {
        $cabeceras[strtolower(str_replace('_', '-', substr($k, 5)))] = (string) $v;
    }
}
[$codigo, $cuerpo] = $app->responder(
    $_SERVER['REQUEST_METHOD'] ?? 'GET',
    parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/',
    $cabeceras,
    (string) file_get_contents('php://input'),
);
http_response_code($codigo);
header('Content-Type: application/json; charset=utf-8');
echo json_encode($cuerpo, JSON_UNESCAPED_UNICODE);
