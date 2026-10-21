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

use Asocim\Contratos\Documento\GeneradorPdf;
use Asocim\Contratos\Ghl\ClienteGhl;
use Asocim\Contratos\Persistencia\Base;
use Asocim\Contratos\Servicio\ContratoServicio;
use Asocim\Contratos\Servicio\UsuarioServicio;
use Asocim\Contratos\Web\Aplicacion;

$pdo = Base::desdeEntorno('sqlite:' . __DIR__ . '/../../storage/contratos.sqlite');
$raiz = dirname(__DIR__, 2);
$generador = new GeneradorPdf(
    getenv('PDF_PYTHON') ?: '/opt/agora-pdf/bin/python',
    $raiz . '/tools/pdf/llenar_convenio.py',
    $raiz . '/storage/tmp',
);
$documentos = $raiz . '/storage/documentos';
$ghl = new ClienteGhl((string) getenv('GHL_TOKEN'), (string) getenv('GHL_LOCATION_ID'));
$app = new Aplicacion(
    new ContratoServicio($pdo, null, $generador, $documentos, $ghl, getenv('APP_URL') ?: 'https://contratos.agoradigital.app'),
    new UsuarioServicio($pdo),
    (string) getenv('GHL_WEBHOOK_SECRET'),
    $ghl,
);

$cabeceras = [];
foreach ($_SERVER as $k => $v) {
    if (str_starts_with($k, 'HTTP_')) {
        $cabeceras[strtolower(str_replace('_', '-', substr($k, 5)))] = (string) $v;
    }
}
$cabeceras['ip-cliente'] = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
