<?php
declare(strict_types=1);

namespace Agora\Http;

use Agora\Core\Env;

/** Petición HTTP normalizada (cabeceras en minúsculas, IP real según los proxies de confianza). */
final class Request
{
    /** @var array<string,mixed> datos que agregan los intermediarios (sesión, usuario, parámetros de ruta) */
    public array $attr = [];
    private ?array $jsonCache = null;

    /**
     * @param array<string,string> $query
     * @param array<string,string> $headers
     * @param array<string,string> $cookies
     */
    public function __construct(
        public string $method,
        public string $path,
        public array $query = [],
        public array $headers = [],
        public array $cookies = [],
        public string $body = '',
        public string $ip = '0.0.0.0',
        public string $rawUri = '',
    ) {
        $this->method = strtoupper($method);
    }

    public static function fromGlobals(): self
    {
        $headers = [];
        foreach ($_SERVER as $k => $v) {
            if (str_starts_with($k, 'HTTP_')) {
                $headers[strtolower(str_replace('_', '-', substr($k, 5)))] = (string) $v;
            } elseif (in_array($k, ['CONTENT_TYPE', 'CONTENT_LENGTH'], true)) {
                $headers[strtolower(str_replace('_', '-', $k))] = (string) $v;
            }
        }
        $uri = (string) ($_SERVER['REQUEST_URI'] ?? '/');
        $path = (string) (parse_url($uri, PHP_URL_PATH) ?? '/');
        $max = Env::int('API_MAX_BODY', 8 * 1024 * 1024);
        $len = (int) ($headers['content-length'] ?? 0);
        $body = $len > $max ? '' : (string) file_get_contents('php://input', false, null, 0, $max + 1);
        $req = new self(
            (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'),
            rawurldecode($path),
            array_map('strval', $_GET),
            $headers,
            array_map('strval', $_COOKIE),
            $body,
            self::clientIp((string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'), $headers),
            $uri,
        );
        if ($len > $max || strlen($body) > $max) {
            $req->attr['body_too_large'] = true;
        }
        return $req;
    }

    /** IP del cliente. Solo se cree a una cabecera de proxy si la conexión viene de un proxy de confianza. */
    public static function clientIp(string $remote, array $headers): string
    {
        $trusted = array_filter(array_map('trim', explode(',', Env::str('TRUSTED_PROXIES'))));
        $hdr = strtolower(Env::str('IP_HEADER'));
        if ($hdr !== '' && $trusted && self::ipInList($remote, $trusted) && !empty($headers[$hdr])) {
            $parts = array_map('trim', explode(',', $headers[$hdr]));
            for ($i = count($parts) - 1; $i >= 0; $i--) {
                if (filter_var($parts[$i], FILTER_VALIDATE_IP) && !self::ipInList($parts[$i], $trusted)) {
                    return $parts[$i];
                }
            }
        }
        return filter_var($remote, FILTER_VALIDATE_IP) ? $remote : '0.0.0.0';
    }

    /** @param list<string> $list IPs o rangos CIDR */
    public static function ipInList(string $ip, array $list): bool
    {
        foreach ($list as $cidr) {
            if (str_contains($cidr, '/')) {
                [$net, $bits] = explode('/', $cidr, 2);
                $ipb = @inet_pton($ip);
                $netb = @inet_pton($net);
                if ($ipb === false || $netb === false || strlen($ipb) !== strlen($netb)) {
                    continue;
                }
                $bits = (int) $bits;
                $bytes = intdiv($bits, 8);
                $rem = $bits % 8;
                if (substr($ipb, 0, $bytes) !== substr($netb, 0, $bytes)) {
                    continue;
                }
                if ($rem === 0) {
                    return true;
                }
                $mask = chr((0xff << (8 - $rem)) & 0xff);
                if ((($ipb[$bytes] ?? "\0") & $mask) === (($netb[$bytes] ?? "\0") & $mask)) {
                    return true;
                }
            } elseif ($ip === $cidr) {
                return true;
            }
        }
        return false;
    }

    public function header(string $name, string $default = ''): string
    {
        return $this->headers[strtolower($name)] ?? $default;
    }

    public function cookie(string $name): ?string
    {
        return $this->cookies[$name] ?? null;
    }

    public function isUnsafe(): bool
    {
        return !in_array($this->method, ['GET', 'HEAD', 'OPTIONS'], true);
    }

    public function userAgent(): string
    {
        return mb_substr($this->header('user-agent'), 0, 255);
    }

    /** Cuerpo JSON como arreglo. Solo se acepta application/json (evita envíos de formularios de otros sitios). */
    public function json(): array
    {
        if ($this->jsonCache !== null) {
            return $this->jsonCache;
        }
        if (!empty($this->attr['body_too_large'])) {
            throw new HttpError(413, 'CUERPO_MUY_GRANDE', 'La solicitud es demasiado grande.');
        }
        if ($this->body === '') {
            return $this->jsonCache = [];
        }
        if (!str_starts_with(strtolower($this->header('content-type')), 'application/json')) {
            throw new HttpError(415, 'TIPO_NO_SOPORTADO', 'Envía los datos como JSON.');
        }
        try {
            $data = json_decode($this->body, true, 64, JSON_THROW_ON_ERROR | JSON_BIGINT_AS_STRING);
        } catch (\JsonException) {
            throw new HttpError(400, 'JSON_INVALIDO', 'Los datos enviados no son un JSON válido.');
        }
        if (!is_array($data)) {
            throw new HttpError(400, 'JSON_INVALIDO', 'Se esperaba un objeto JSON.');
        }
        return $this->jsonCache = $data;
    }

    public function input(string $key, mixed $default = null): mixed
    {
        $d = $this->json();
        return $d[$key] ?? $default;
    }
}
