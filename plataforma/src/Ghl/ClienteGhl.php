<?php

declare(strict_types=1);

namespace Agora\Plataforma\Ghl;

use Agora\Plataforma\Servicio\ErrorContrato;

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

    /** Id del campo cédula: false = sin consultar todavía, null = no existe. */
    private string|false|null $idCedula = false;

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
            throw new ErrorContrato('No se pudo guardar el contacto en AGORA.', 502);
        }
        return $id;
    }

    /**
     * Busca contactos de la subcuenta por nombre, correo o teléfono.
     * @return list<array{id:string,nombre:string,correo:string,telefono:string,cedula:string}>
     */
    public function buscarContactos(string $consulta): array
    {
        $url = self::BASE . '/contacts/?' . http_build_query(['locationId' => $this->locationId, 'query' => $consulta, 'limit' => 20]);
        $respuesta = ($this->http)('GET', $url, []);
        $idCedula = $this->idCampoCedula();
        $salida = [];
        foreach ($respuesta['contacts'] ?? [] as $c) {
            $cedula = '';
            foreach ($c['customFields'] ?? [] as $campo) {
                if (($idCedula !== null && ($campo['id'] ?? '') === $idCedula) || ($campo['key'] ?? '') === 'contact.cedula') {
                    $cedula = trim((string) ($campo['value'] ?? ''));
                }
            }
            $nombre = trim(($c['firstName'] ?? '') . ' ' . ($c['lastName'] ?? ''));
            $salida[] = [
                'id' => (string) ($c['id'] ?? ''),
                'nombre' => $nombre !== '' ? $nombre : (string) ($c['contactName'] ?? ''),
                'correo' => (string) ($c['email'] ?? ''),
                'telefono' => (string) ($c['phone'] ?? ''),
                'cedula' => $cedula,
                'asignado' => (string) ($c['assignedTo'] ?? ''),
            ];
        }
        return array_values(array_filter($salida, fn (array $c) => $c['id'] !== ''));
    }

    /** Id de usuario en GHL de la persona con ese correo (null si no existe en la subcuenta). */
    public function usuarioPorCorreo(string $correo): ?string
    {
        $respuesta = ($this->http)('GET', self::BASE . '/users/?' . http_build_query(['locationId' => $this->locationId]), []);
        foreach ($respuesta['users'] ?? [] as $u) {
            if (strcasecmp((string) ($u['email'] ?? ''), $correo) === 0 && !empty($u['id'])) {
                return (string) $u['id'];
            }
        }
        return null;
    }

    /** Id del campo personalizado cuya clave es contact.cedula (se consulta una vez por petición). */
    private function idCampoCedula(): ?string
    {
        if ($this->idCedula === false) {
            $this->idCedula = null;
            $defs = ($this->http)('GET', self::BASE . '/locations/' . rawurlencode($this->locationId) . '/customFields', []);
            foreach ($defs['customFields'] ?? [] as $d) {
                if (($d['fieldKey'] ?? '') === 'contact.cedula') {
                    $this->idCedula = (string) ($d['id'] ?? '') ?: null;
                }
            }
        }
        return $this->idCedula;
    }

    /** Guarda el correo en el contacto de AGORA, para que los avisos le lleguen a esa dirección. */
    public function actualizarCorreo(string $contactoId, string $correo): void
    {
        ($this->http)('PUT', self::BASE . '/contacts/' . rawurlencode($contactoId), ['email' => $correo]);
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
            CURLOPT_POSTFIELDS => $metodo === 'GET' ? null : json_encode($cuerpo, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
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
            throw new ErrorContrato('No se pudo conectar con AGORA. Intenta de nuevo.', 502);
        }
        $datos = json_decode((string) $respuesta, true);
        return is_array($datos) ? $datos : [];
    }
}
