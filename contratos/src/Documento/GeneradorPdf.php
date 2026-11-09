<?php

declare(strict_types=1);

namespace Asocim\Contratos\Documento;

use Asocim\Contratos\Servicio\ErrorContrato;

/**
 * Llama al script de Python que llena el convenio original (tools/pdf/llenar_convenio.py).
 * Python y PyMuPDF viven en /opt/agora-pdf (ver la guía de instalación).
 */
final class GeneradorPdf
{
    public function __construct(
        private readonly string $python,
        private readonly string $script,
        private readonly string $carpetaTemporal,
    ) {
    }

    /**
     * @param array<string,mixed> $datos
     * @return string ruta del PDF generado
     */
    public function generar(array $datos, string $salida, ?string $firmaPng = null): string
    {
        if (!is_file($this->python) || !is_file($this->script)) {
            throw new ErrorContrato('No está instalado el generador de PDF en el servidor.', 500);
        }
        @mkdir($this->carpetaTemporal, 0700, true);
        @mkdir(dirname($salida), 0700, true);
        $datosJson = $this->carpetaTemporal . '/' . bin2hex(random_bytes(8)) . '.json';
        file_put_contents($datosJson, json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));

        $orden = escapeshellarg($this->python) . ' ' . escapeshellarg($this->script) . ' '
            . escapeshellarg($datosJson) . ' ' . escapeshellarg($salida)
            . ($firmaPng !== null ? ' ' . escapeshellarg($firmaPng) : '') . ' 2>&1';
        exec($orden, $resultado, $codigo);
        @unlink($datosJson);

        if ($codigo !== 0 || !is_file($salida)) {
            error_log('[contratos] PDF falló: ' . implode("\n", $resultado));
            throw new ErrorContrato('No se pudo generar el PDF del contrato. Avisa al administrador.', 500);
        }
        @chmod($salida, 0600);
        return $salida;
    }
}
