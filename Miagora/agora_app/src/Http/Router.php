<?php
declare(strict_types=1);

namespace Agora\Http;

/**
 * Rutas de la API. Cada ruta declara si exige sesión y permiso.
 * Opciones: auth (bool, por defecto true), perm (string), public_csrf (bool: POST sin sesión que solo
 * comprueba el origen), rate ([clave, máximo, segundos]).
 */
final class Router
{
    /** @var list<array{method:string,regex:string,names:list<string>,handler:callable,opts:array<string,mixed>}> */
    private array $routes = [];

    /** @param array<string,mixed> $opts */
    public function add(string $method, string $pattern, callable $handler, array $opts = []): void
    {
        $names = [];
        $regex = preg_replace_callback('/\{(\w+)\}/', function ($m) use (&$names) {
            $names[] = $m[1];
            return '([A-Za-z0-9._@:-]{1,80})';
        }, $pattern);
        $this->routes[] = ['method' => $method, 'regex' => '#^' . $regex . '$#', 'names' => $names, 'handler' => $handler, 'opts' => $opts];
    }

    /** @return array{handler:callable,params:array<string,string>,opts:array<string,mixed>} */
    public function match(string $method, string $path): array
    {
        $allowed = [];
        foreach ($this->routes as $r) {
            if (!preg_match($r['regex'], $path, $m)) {
                continue;
            }
            if ($r['method'] !== $method && !($method === 'HEAD' && $r['method'] === 'GET')) {
                $allowed[] = $r['method'];
                continue;
            }
            $params = [];
            foreach ($r['names'] as $i => $n) {
                $params[$n] = $m[$i + 1];
            }
            return ['handler' => $r['handler'], 'params' => $params, 'opts' => $r['opts']];
        }
        if ($allowed) {
            throw new HttpError(405, 'METODO_NO_PERMITIDO', 'Método no permitido.');
        }
        throw HttpError::notFound('Ruta no encontrada.');
    }
}
