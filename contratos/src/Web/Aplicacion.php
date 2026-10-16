<?php

declare(strict_types=1);

namespace Asocim\Contratos\Web;

use Asocim\Contratos\Servicio\ContratoServicio;
use Asocim\Contratos\Servicio\ErrorContrato;
use JsonException;

/** Entrada HTTP: enruta las peticiones al servicio y responde en JSON. */
final class Aplicacion
{
    public function __construct(
        private readonly ContratoServicio $servicio,
        private readonly string $secretoWebhook,
    ) {
    }

    /** @return array{0:int,1:array<string,mixed>} código HTTP y cuerpo */
    public function responder(string $metodo, string $ruta, array $cabeceras, string $cuerpo): array
    {
        try {
            if ($metodo === 'POST' && $ruta === '/webhook.php') {
                return $this->webhookGhl($cabeceras, $cuerpo);
            }
            return [404, ['error' => 'No existe esta ruta.']];
        } catch (ErrorContrato $e) {
            return [$e->http, ['error' => $e->getMessage()]];
        } catch (\Throwable $e) {
            // Sin detalles técnicos hacia fuera; el registro queda en el servidor
            error_log('[contratos] ' . $e->getMessage());
            return [500, ['error' => 'Ocurrió un error inesperado.']];
        }
    }

    /** @return array{0:int,1:array<string,mixed>} */
    private function webhookGhl(array $cabeceras, string $cuerpo): array
    {
        $recibido = $cabeceras['x-webhook-secret'] ?? '';
        if ($this->secretoWebhook === '' || !hash_equals($this->secretoWebhook, $recibido)) {
            return [401, ['error' => 'No autorizado.']];
        }
        try {
            $datos = json_decode($cuerpo, true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return [400, ['error' => 'El cuerpo no es JSON válido.']];
        }
        if (!is_array($datos)) {
            return [400, ['error' => 'Se esperaba un objeto JSON.']];
        }
        $this->registrarRecepcion($datos);
        $resultado = $this->servicio->crearDesdeWebhook($datos);
        return [$resultado['duplicado'] ? 200 : 201, $resultado];
    }

    /**
     * Diagnóstico: guarda solo los NOMBRES de los campos recibidos y si vienen vacíos.
     * No guarda valores, para no registrar datos personales.
     * @param array<string,mixed> $datos
     */
    private function registrarRecepcion(array $datos): void
    {
        $ruta = dirname(__DIR__, 2) . '/storage/webhook-recibidos.log';
        $lineas = [];
        foreach ($datos as $clave => $valor) {
            if (is_array($valor)) {
                $lineas[] = $clave . '=[seccion]';
                continue;
            }
            $lineas[] = $clave . '=' . (trim((string) $valor) === '' ? 'VACIO' : 'con valor');
        }
        @file_put_contents($ruta, date('Y-m-d H:i:s') . ' ' . implode(' | ', $lineas) . "\n", FILE_APPEND);
    }
}
