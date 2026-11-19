<?php
declare(strict_types=1);

namespace Agora\Services;

/**
 * Comparación y fusión de los documentos de la app.
 *  · changedPeriods(): qué meses (AAAA-MM) toca un cambio, para exigir OTP si alguno está cerrado.
 *  · merge3(): fusión de tres vías (base del navegador, versión actual del servidor y cambio del navegador)
 *    para que dos personas editando a la vez no se pisen: listas con "id" y mapas se fusionan por elemento.
 */
final class JsonDiff
{
    private const P = '/(20\d{2})-(0[1-9]|1[0-2])/';

    /** @return list<string> meses afectados entre $old y $new (vacío si el cambio no toca fechas) */
    public static function changedPeriods(mixed $old, mixed $new): array
    {
        $a = self::flatten($old);
        $b = self::flatten($new);
        $out = [];
        foreach (array_unique(array_merge(array_keys($a), array_keys($b))) as $path) {
            $va = $a[$path] ?? null;
            $vb = $b[$path] ?? null;
            if (array_key_exists($path, $a) && array_key_exists($path, $b) && $va === $vb) {
                continue;
            }
            foreach ([$path, is_string($va) ? $va : '', is_string($vb) ? $vb : ''] as $probe) {
                if (preg_match(self::P, (string) $probe, $m)) {
                    $out[$m[0]] = true;
                    break;
                }
            }
            // elemento de lista con id: el mes sale de sus campos period/date/fecha (antes y después)
            if (preg_match('/^(.*\[id=[^\]]+\])/', $path, $mm)) {
                foreach ([$old, $new] as $doc) {
                    $item = self::itemAt($doc, $mm[1]);
                    foreach (['period', 'date', 'fecha', 'issueDate', 'paidDate'] as $f) {
                        if (is_array($item) && isset($item[$f]) && is_string($item[$f]) && preg_match(self::P, $item[$f], $m)) {
                            $out[$m[0]] = true;
                            break;
                        }
                    }
                }
            }
        }
        ksort($out);
        return array_keys($out);
    }

    /** @return array<string,mixed> ruta → valor hoja */
    public static function flatten(mixed $v, string $prefix = ''): array
    {
        if (!is_array($v)) {
            return [$prefix => $v];
        }
        if ($v === []) {
            return [$prefix => []];
        }
        $out = [];
        $isList = array_is_list($v);
        foreach ($v as $k => $item) {
            $seg = $isList && is_array($item) && isset($item['id']) && is_scalar($item['id']) ? '[id=' . $item['id'] . ']' : '[' . $k . ']';
            $out += self::flatten($item, $prefix . $seg);
        }
        return $out;
    }

    private static function itemAt(mixed $doc, string $path): mixed
    {
        if (!preg_match_all('/\[([^\]]*)\]/', $path, $m)) {
            return null;
        }
        $cur = $doc;
        foreach ($m[1] as $seg) {
            if (!is_array($cur)) {
                return null;
            }
            if (str_starts_with($seg, 'id=')) {
                $id = substr($seg, 3);
                $found = null;
                foreach ($cur as $it) {
                    if (is_array($it) && isset($it['id']) && (string) $it['id'] === $id) {
                        $found = $it;
                        break;
                    }
                }
                $cur = $found;
            } else {
                $cur = $cur[$seg] ?? null;
            }
        }
        return $cur;
    }

    /**
     * Fusión de tres vías. Si $base es null (el navegador no conocía la versión), gana el cambio del navegador.
     * Listas de objetos con "id" y mapas: por elemento. Escalares y demás: gana el cambio del navegador.
     */
    public static function merge3(mixed $base, mixed $current, mixed $mine): mixed
    {
        if ($base === null || $current === $base) {
            return $mine;
        }
        if ($mine === $base) {
            return $current;
        }
        if (is_array($base) && is_array($current) && is_array($mine)) {
            $listId = fn ($a) => array_is_list($a) && ($a === [] || (is_array($a[0] ?? null) && isset($a[0]['id'])));
            if ($listId($base) && $listId($current) && $listId($mine)) {
                $idx = fn ($a) => array_column(array_map(fn ($x) => ['k' => (string) ($x['id'] ?? ''), 'v' => $x], $a), 'v', 'k');
                [$b, $c, $m] = [$idx($base), $idx($current), $idx($mine)];
                $result = $c;
                foreach ($b + $m as $id => $_) {
                    $inB = array_key_exists($id, $b);
                    $inM = array_key_exists($id, $m);
                    if ($inB && !$inM) {
                        unset($result[$id]);                     // yo lo borré
                    } elseif (!$inB && $inM) {
                        $result[$id] = $m[$id];                  // yo lo agregué
                    } elseif ($inB && $inM && $m[$id] !== $b[$id]) {
                        $result[$id] = array_key_exists($id, $c) ? self::merge3($b[$id], $c[$id], $m[$id]) : $m[$id];
                    }
                }
                // conservar el orden del navegador y agregar al final lo nuevo del servidor
                $ordered = [];
                foreach ($m as $id => $_) {
                    if (array_key_exists($id, $result)) {
                        $ordered[] = $result[$id];
                        unset($result[$id]);
                    }
                }
                return array_values(array_merge($ordered, array_values($result)));
            }
            if (!array_is_list($base) && !array_is_list($current) && !array_is_list($mine) || ($base === [] || $current === [] || $mine === [])) {
                $result = $current;
                foreach (array_unique(array_merge(array_keys($base), array_keys($mine))) as $k) {
                    $inB = array_key_exists($k, $base);
                    $inM = array_key_exists($k, $mine);
                    if ($inB && !$inM) {
                        unset($result[$k]);
                    } elseif ($inM && (!$inB || $mine[$k] !== $base[$k])) {
                        $result[$k] = array_key_exists($k, $current) && $inB ? self::merge3($base[$k], $current[$k], $mine[$k]) : $mine[$k];
                    }
                }
                return $result;
            }
        }
        return $mine;
    }
}
