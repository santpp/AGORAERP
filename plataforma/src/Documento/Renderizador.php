<?php

declare(strict_types=1);

namespace Agora\Plataforma\Documento;

/**
 * Rellena la plantilla con los datos del contrato.
 *  {{variable}}                 valor escapado
 *  {{#lista}}…{{/lista}}        repite el bloque por cada fila de la lista
 * Si falta un dato, lanza error: nunca se entrega un contrato con huecos.
 */
final class Renderizador
{
    public function render(string $plantilla, array $datos): string
    {
        $plantilla = $this->expandirListas($plantilla, $datos);
        $faltan = [];
        $salida = preg_replace_callback('/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/', function (array $m) use ($datos, &$faltan) {
            if (!array_key_exists($m[1], $datos) || is_array($datos[$m[1]])) {
                $faltan[$m[1]] = true;
                return '';
            }
            return htmlspecialchars((string) $datos[$m[1]], ENT_QUOTES, 'UTF-8');
        }, $plantilla);

        if ($faltan !== []) {
            throw new \RuntimeException('Faltan datos en el contrato: ' . implode(', ', array_keys($faltan)));
        }
        return $salida;
    }

    /** Variables que usa la plantilla (para comprobar que el armador las entrega todas). */
    public function variables(string $plantilla): array
    {
        preg_match_all('/\{\{\s*#?([a-z_][a-z0-9_]*)\s*\}\}/', $plantilla, $m);
        return array_values(array_unique($m[1]));
    }

    private function expandirListas(string $plantilla, array $datos): string
    {
        return preg_replace_callback('/\{\{#([a-z_][a-z0-9_]*)\}\}(.*?)\{\{\/\1\}\}/s', function (array $m) use ($datos) {
            $filas = $datos[$m[1]] ?? null;
            if (!is_array($filas)) {
                throw new \RuntimeException("Falta la lista {$m[1]}.");
            }
            $bloque = '';
            foreach ($filas as $fila) {
                $bloque .= $this->render($m[2], $fila);
            }
            return $bloque;
        }, $plantilla);
    }
}
