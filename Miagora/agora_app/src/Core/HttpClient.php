<?php
declare(strict_types=1);

namespace Agora\Core;

/** Cliente HTTPS mínimo (cURL) con certificados verificados y tiempos de espera cortos. */
final class HttpClient
{
    /** Para pruebas: function(string $method, string $url, array $headers, ?string $body): array{status:int,body:string} */
    public static $fake = null;

    /**
     * @param array<string,string> $headers
     * @return array{status:int,body:string,error:?string}
     */
    public static function request(string $method, string $url, array $headers = [], ?string $body = null, int $timeout = 12): array
    {
        if (self::$fake) {
            $r = (self::$fake)($method, $url, $headers, $body);
            return ['status' => (int) ($r['status'] ?? 0), 'body' => (string) ($r['body'] ?? ''), 'error' => $r['error'] ?? null];
        }
        if (!str_starts_with($url, 'https://')) {
            return ['status' => 0, 'body' => '', 'error' => 'Solo se permiten conexiones https'];
        }
        $ch = curl_init($url);
        $h = [];
        foreach ($headers as $k => $v) {
            $h[] = $k . ': ' . $v;
        }
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $h,
            CURLOPT_CONNECTTIMEOUT => min(6, $timeout),
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_MAXFILESIZE => 5 * 1024 * 1024,
            CURLOPT_USERAGENT => 'AgoraDigitalApp/11 (+https://agoradigital.app)',
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
        $ca = Env::str('HTTP_CA_BUNDLE');
        if ($ca !== '' && is_file($ca)) {
            curl_setopt($ch, CURLOPT_CAINFO, $ca);
        }
        $res = curl_exec($ch);
        $err = $res === false ? curl_error($ch) : null;
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return ['status' => $status, 'body' => is_string($res) ? $res : '', 'error' => $err];
    }

    /** @return array{status:int,json:mixed,error:?string} */
    public static function json(string $method, string $url, mixed $payload = null, array $headers = [], int $timeout = 12): array
    {
        $headers += ['Accept' => 'application/json'];
        $body = null;
        if ($payload !== null) {
            $headers['Content-Type'] = 'application/json';
            $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
        $r = self::request($method, $url, $headers, $body, $timeout);
        $json = null;
        if ($r['body'] !== '') {
            $json = json_decode($r['body'], true);
        }
        return ['status' => $r['status'], 'json' => $json, 'error' => $r['error'] ?? ($json === null && $r['body'] !== '' ? 'Respuesta no es JSON' : null), 'raw' => $r['body']];
    }
}
