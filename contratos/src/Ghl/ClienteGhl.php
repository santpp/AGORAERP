<?php

declare(strict_types=1);

namespace Asocim\Contratos\Ghl;

use Asocim\Contratos\Servicio\ErrorContrato;

/**
 * Cliente mínimo de la API de GoHighLevel (LeadConnector) para contactos y correos.
 * El token es una "Private Integration" de la subcuenta; va en .env (GHL_TOKEN), nunca en el código.
 */
class ClienteGhl
{
    private const BASE = 'https://services.leadconnectorhq.com';
    private const VERSION = '2021-07-28';

    /** @var \Closure(string,string,array<string,mixed>):array<string,mixed> */
    private \Closure $http;

    /**
     * @param ?\Closure(string,string,array<string,mixed>):array<string,mixed> $http solo para pruebas
     */
    public function __construct(
        private readonly string $token,
        private readonly string $locationId,
        ?\Closure $http = null,
    ) {
        $this->http = $http ?? $this->conCurl(...);
    }

    /** Crea o actualiza el contacto por correo y devuelve su id en GHL. */
    public function contactoPara(string $correo, string $nombre, ?string $telefono): string
    {
        $partes = preg_split('/\s+/', trim($nombre), 2) ?: [''];
        $respuesta = ($this->http)('POST', self::BASE . '/contacts/upsert', [
            'locationId' => $this->locationId,
            'email' => $correo,
            'firstName' => $partes[0],
            'lastName' => $partes[1] ?? '',
            'phone' => $telefono ?? '',
        ]);
        $id = $respuesta['contact']['id'] ?? null;
        if (!is_string($id) || $id === '') {
            throw new ErrorContrato('GHL no devolvió el contacto.', 502);
        }
        return $id;
    }

    /** Envía un correo a un contacto ya existente. */
    public function enviarCorreo(string $contactoId, string $asunto, string $html): void
    {
        ($this->http)('POST', self::BASE . '/conversations/messages', [
            'type' => 'Email',
            'contactId' => $contactoId,
            'subject' => $asunto,
            'html' => $html,
        ]);
    }

    /** @param array<string,mixed> $cuerpo @return array<string,mixed> */
    private function conCurl(string $metodo, string $url, array $cuerpo): array
    {
        if ($this->token === '' || $this->locationId === '') {
            throw new ErrorContrato('Falta GHL_TOKEN o GHL_LOCATION_ID en .env.', 500);
        }
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $metodo,
            CURLOPT_POSTFIELDS => json_encode($cuerpo, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $this->token,
                'Version: ' . self::VERSION,
                'Content-Type: application/json',
                'Accept: application/json',
            ],
        ]);
        $respuesta = curl_exec($ch);
        $codigo = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if ($respuesta === false || $codigo < 200 || $codigo >= 300) {
            error_log('[contratos] GHL respondió ' . $codigo . ' en ' . $url);
            throw new ErrorContrato('No se pudo contactar con GHL.', 502);
        }
        $datos = json_decode((string) $respuesta, true);
        return is_array($datos) ? $datos : [];
    }
}
