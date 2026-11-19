<?php
declare(strict_types=1);

namespace Agora\Http;

final class Response
{
    /** @var array<string,string> */
    public array $headers = [];
    /** @var list<array{name:string,value:string,opts:array<string,mixed>}> */
    public array $cookies = [];

    public function __construct(public string $body = '', public int $status = 200)
    {
    }

    public static function json(mixed $data, int $status = 200): self
    {
        $r = new self(json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR), $status);
        $r->headers['Content-Type'] = 'application/json; charset=utf-8';
        return $r;
    }

    public static function html(string $html, int $status = 200): self
    {
        $r = new self($html, $status);
        $r->headers['Content-Type'] = 'text/html; charset=utf-8';
        return $r;
    }

    public static function text(string $text, int $status = 200, string $type = 'text/plain; charset=utf-8'): self
    {
        $r = new self($text, $status);
        $r->headers['Content-Type'] = $type;
        return $r;
    }

    public function header(string $name, string $value): self
    {
        $this->headers[$name] = $value;
        return $this;
    }

    /** @param array<string,mixed> $opts */
    public function cookie(string $name, string $value, array $opts = []): self
    {
        $this->cookies[] = ['name' => $name, 'value' => $value, 'opts' => $opts];
        return $this;
    }

    public function send(): void
    {
        if (!headers_sent()) {
            http_response_code($this->status);
            foreach ($this->headers as $k => $v) {
                header($k . ': ' . str_replace(["\r", "\n"], '', $v), true);
            }
            foreach ($this->cookies as $c) {
                setcookie($c['name'], $c['value'], $c['opts']);
            }
            // con el largo declarado, el navegador da la respuesta por completa apenas la recibe, aunque PHP
            // siga trabajando después (avisos por correo diferidos)
            if ($this->status !== 304 && $this->status !== 204 && !isset($this->headers['Content-Length']) && !filter_var(ini_get('zlib.output_compression'), FILTER_VALIDATE_BOOLEAN)) {
                header('Content-Length: ' . strlen($this->body));
            }
        }
        echo $this->body;
    }
}
