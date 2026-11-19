<?php
declare(strict_types=1);

namespace Agora\Fx;

use Agora\App;
use Agora\Core\Clock;
use Agora\Core\Db;
use Agora\Core\Env;
use Agora\Core\Ids;
use Agora\Core\Log;
use Agora\Http\HttpError;

/**
 * Tasas en vivo y política "según la operación":
 *  · COBRO_BS (cobras en bolívares una factura en divisas): la MÁS ALTA entre BCV y Binance compra
 *    (mediana de los 5 mejores anuncios), para que los bolívares alcancen para recomprar los dólares.
 *  · VENTA_USDT (vendes USDT): la mejor oferta de compra en Binance (la más alta).
 *  · COMPRA_USDT (compras USDT): el anuncio más barato en Binance.
 *  · FISCAL (facturas): siempre BCV, como exige la norma.
 * Con la política SIEMPRE_ALTA, toda operación interna usa la tasa más alta disponible (lo fiscal sigue en BCV).
 * La tasa elegida se "congela" 15 minutos en una cotización (fx_quotes) con todas las candidatas: queda auditada.
 */
final class Rates
{
    public const OPS = ['COBRO_BS', 'VENTA_USDT', 'COMPRA_USDT', 'FISCAL'];
    private const FRESH_BINANCE = 2 * 3600;
    private const FRESH_BCV = 5 * 86400;

    public function __construct(private Db $db)
    {
    }

    /** Tarea programada: consulta las fuentes, guarda la foto y publica fx/actual.json */
    public function refresh(): array
    {
        $out = [];
        $bcv = Sources::bcv();
        $this->snapshot('BCV', $bcv['ok'] ? ['rate' => $bcv['rate'], 'best' => $bcv['rate'], 'median' => $bcv['rate'], 'worst' => $bcv['rate'], 'n' => 1] : null, $bcv['error'], ['fuente' => $bcv['source'], 'fecha' => $bcv['date']]);
        $out['BCV'] = $bcv['ok'] ? $bcv['rate'] : null;
        foreach (['BUY' => 'BINANCE_BUY', 'SELL' => 'BINANCE_SELL'] as $side => $src) {
            $b = Sources::binance($side);
            $stats = $b['ok'] ? self::stats($b['prices']) : null;
            $this->snapshot($src, $stats, $b['error'], ['fuente' => $b['source'], 'anuncios' => $b['ads'], 'precios' => array_slice($b['prices'], 0, 10)]);
            $out[$src] = $stats['median'] ?? null;
        }
        $this->publish();
        return $out;
    }

    /** @param list<float> $prices ordenados del mejor al peor @return array{rate:float,best:float,median:float,worst:float,n:int} */
    public static function stats(array $prices): array
    {
        $top = array_slice($prices, 0, 5);
        $k = count($top);
        $sorted = $top;
        sort($sorted);
        $median = $k % 2 ? $sorted[intdiv($k, 2)] : ($sorted[$k / 2 - 1] + $sorted[$k / 2]) / 2;
        return ['rate' => round($median, 4), 'best' => $top[0], 'median' => round($median, 4), 'worst' => $top[$k - 1], 'n' => count($prices)];
    }

    /** @param array{rate:float,best:float,median:float,worst:float,n:int}|null $s */
    public function snapshot(string $source, ?array $s, ?string $error, array $detail = []): void
    {
        $this->db->insert('fx_snapshots', [
            'source' => $source, 'rate' => $s['rate'] ?? null, 'best' => $s['best'] ?? null, 'median' => $s['median'] ?? null, 'worst' => $s['worst'] ?? null,
            'sample_size' => $s['n'] ?? 0, 'status' => $s ? 'OK' : 'ERROR', 'error' => $error ? mb_substr($error, 0, 255) : null,
            'detail' => json_encode($detail, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 'fetched_at' => Clock::ts(),
        ]);
        if (!$s) {
            Log::warn('No se pudo actualizar la tasa', ['fuente' => $source, 'error' => $error]);
            return;
        }
        $day = Clock::today();
        $row = $this->db->one('SELECT * FROM fx_daily WHERE day = ? AND source = ?', [$day, $source]);
        $r = (float) $s['rate'];
        if ($row) {
            $n = (int) $row['samples'];
            $this->db->update('fx_daily', [
                'rate_last' => $r, 'rate_min' => min((float) $row['rate_min'], $r), 'rate_max' => max((float) $row['rate_max'], $r),
                'rate_avg' => round(((float) $row['rate_avg'] * $n + $r) / ($n + 1), 6), 'samples' => $n + 1, 'updated_at' => Clock::ts(),
            ], ['day' => $day, 'source' => $source]);
        } else {
            $this->db->insert('fx_daily', ['day' => $day, 'source' => $source, 'rate_last' => $r, 'rate_min' => $r, 'rate_max' => $r, 'rate_avg' => $r, 'samples' => 1, 'updated_at' => Clock::ts()]);
        }
    }

    /** Último dato bueno de cada fuente */
    public function current(): array
    {
        $src = [];
        foreach (['BCV', 'BINANCE_BUY', 'BINANCE_SELL'] as $s) {
            $r = $this->db->one("SELECT rate, best, median, worst, sample_size, fetched_at, detail FROM fx_snapshots WHERE source = ? AND status = 'OK' ORDER BY id DESC LIMIT 1", [$s]);
            $last = $this->db->one('SELECT status, error, fetched_at FROM fx_snapshots WHERE source = ? ORDER BY id DESC LIMIT 1', [$s]);
            $age = $r ? Clock::unix() - (int) strtotime((string) $r['fetched_at'] . ' UTC') : null;
            $fresh = $r && $age <= ($s === 'BCV' ? self::FRESH_BCV : self::FRESH_BINANCE);
            $detail = $r ? (json_decode((string) $r['detail'], true) ?: []) : [];
            $src[$s] = $r ? [
                'tasa' => (float) $r['rate'], 'mejor' => (float) $r['best'], 'mediana' => (float) $r['median'], 'peor' => (float) $r['worst'], 'anuncios' => (int) $r['sample_size'],
                'actualizado' => App::iso((string) $r['fetched_at']), 'vigente' => $fresh, 'fecha_valor' => $detail['fecha'] ?? null,
                'ultimo_error' => $last && $last['status'] === 'ERROR' ? $last['error'] : null,
            ] : null;
        }
        $ok = array_filter($src, fn ($x) => $x && $x['vigente']);
        return [
            'bcv' => $src['BCV'],
            'binance' => ['compra' => $src['BINANCE_BUY'], 'venta' => $src['BINANCE_SELL']],
            'estado' => count($ok) === 3 ? 'OK' : ($ok ? 'PARCIAL' : 'SIN_DATOS'),
            'generado' => App::iso(Clock::ts()),
        ];
    }

    public function policy(int $orgId): string
    {
        $v = $this->db->value("SELECT setting_value FROM org_settings WHERE org_id = ? AND setting_key = 'tasa_politica'", [$orgId]);
        return $v === 'SIEMPRE_ALTA' ? 'SIEMPRE_ALTA' : 'SEGUN_OPERACION';
    }

    public function setPolicy(int $orgId, string $policy, int $userId): void
    {
        $this->db->upsert('org_settings', ['org_id' => $orgId, 'setting_key' => 'tasa_politica', 'setting_value' => $policy, 'updated_at' => Clock::ts(), 'updated_by' => $userId], ['org_id', 'setting_key'], ['setting_value', 'updated_at', 'updated_by']);
    }

    /** Candidatas y elegida para una operación (sin guardar) */
    public function choose(string $op, string $policy, ?array $cur = null): array
    {
        $cur ??= $this->current();
        $bcv = $cur['bcv'] && $cur['bcv']['vigente'] ? $cur['bcv'] : null;
        $buy = $cur['binance']['compra'] && $cur['binance']['compra']['vigente'] ? $cur['binance']['compra'] : null;
        $sell = $cur['binance']['venta'] && $cur['binance']['venta']['vigente'] ? $cur['binance']['venta'] : null;
        $c = [];
        $add = function (string $src, string $label, ?float $v, ?string $at) use (&$c): void {
            if ($v !== null && $v > 0) {
                $c[] = ['fuente' => $src, 'nombre' => $label, 'tasa' => round($v, 4), 'actualizado' => $at];
            }
        };
        switch ($op) {
            case 'COBRO_BS':
                $add('BCV', 'BCV (oficial)', $bcv['tasa'] ?? null, $bcv['actualizado'] ?? null);
                $add('BINANCE_BUY', 'Binance compra (mediana de los 5 mejores)', $buy['mediana'] ?? null, $buy['actualizado'] ?? null);
                $rule = 'La más alta entre BCV y Binance compra';
                $pick = 'max';
                break;
            case 'VENTA_USDT':
                $add('BINANCE_SELL', 'Binance: mejor oferta para vender USDT', $sell['mejor'] ?? null, $sell['actualizado'] ?? null);
                $add('BINANCE_SELL', 'Binance venta (mediana de los 5 mejores)', $sell['mediana'] ?? null, $sell['actualizado'] ?? null);
                $rule = 'La mejor oferta de compra de USDT en Binance (la más alta)';
                $pick = 'max';
                break;
            case 'COMPRA_USDT':
                $add('BINANCE_BUY', 'Binance: anuncio más barato para comprar USDT', $buy['mejor'] ?? null, $buy['actualizado'] ?? null);
                $add('BINANCE_BUY', 'Binance compra (mediana de los 5 mejores)', $buy['mediana'] ?? null, $buy['actualizado'] ?? null);
                $rule = 'El anuncio más barato para comprar USDT en Binance';
                $pick = 'min';
                break;
            case 'FISCAL':
                $add('BCV', 'BCV (oficial)', $bcv['tasa'] ?? null, $bcv['actualizado'] ?? null);
                $rule = 'Tasa oficial del BCV (obligatoria en facturas)';
                $pick = 'max';
                break;
            default:
                throw HttpError::badRequest('Operación no válida.');
        }
        if ($policy === 'SIEMPRE_ALTA' && $op !== 'FISCAL') {
            $add('BCV', 'BCV (oficial)', $bcv['tasa'] ?? null, $bcv['actualizado'] ?? null);
            foreach ([['BINANCE_BUY', $buy], ['BINANCE_SELL', $sell]] as [$s, $x]) {
                $add($s, $s === 'BINANCE_BUY' ? 'Binance compra (mejor)' : 'Binance venta (mejor)', $x['mejor'] ?? null, $x['actualizado'] ?? null);
                $add($s, $s === 'BINANCE_BUY' ? 'Binance compra (mediana)' : 'Binance venta (mediana)', $x['mediana'] ?? null, $x['actualizado'] ?? null);
            }
            $rule = 'Siempre la más alta disponible (política de la empresa)';
            $pick = 'max';
        }
        if (!$c) {
            return ['tasa' => null, 'fuente' => null, 'regla' => $rule, 'candidatas' => []];
        }
        usort($c, fn ($a, $b) => $pick === 'max' ? $b['tasa'] <=> $a['tasa'] : $a['tasa'] <=> $b['tasa']);
        return ['tasa' => $c[0]['tasa'], 'fuente' => $c[0]['fuente'], 'nombre' => $c[0]['nombre'], 'regla' => $rule, 'candidatas' => $c];
    }

    /** Cotización congelada 15 minutos (queda registrada con sus candidatas) */
    public function quote(int $orgId, int $userId, string $op, ?int $amountUsdCents): array
    {
        if (!in_array($op, self::OPS, true)) {
            throw HttpError::badRequest('Operación no válida.');
        }
        $policy = $this->policy($orgId);
        $ch = $this->choose($op, $policy);
        if ($ch['tasa'] === null) {
            throw new HttpError(409, 'SIN_TASAS', 'No hay tasas actualizadas en este momento. Escribe la tasa a mano (queda registrada).');
        }
        $id = Ids::ulid();
        $min = max(1, min(60, Env::int('FX_QUOTE_MINUTES', 15)));
        $exp = Clock::ts($min * 60);
        $this->db->insert('fx_quotes', [
            'id' => $id, 'org_id' => $orgId, 'user_id' => $userId, 'operation' => $op, 'amount_usd_cents' => $amountUsdCents, 'rate' => $ch['tasa'], 'source' => $ch['fuente'],
            'policy' => mb_substr($policy . ': ' . $ch['regla'], 0, 60), 'candidates' => json_encode($ch['candidatas'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 'created_at' => Clock::ts(), 'expires_at' => $exp,
            'used_at' => null, 'used_entity' => null, 'used_entity_id' => null,
        ]);
        $out = ['cotizacion' => $id, 'operacion' => $op, 'tasa' => $ch['tasa'], 'fuente' => $ch['fuente'], 'nombre' => $ch['nombre'], 'regla' => $ch['regla'], 'politica' => $policy, 'vence' => App::iso($exp), 'minutos' => $min, 'candidatas' => $ch['candidatas']];
        if ($amountUsdCents !== null) {
            $out['monto_usd'] = round($amountUsdCents / 100, 2);
            $out['monto_bs'] = round($amountUsdCents / 100 * $ch['tasa'], 2);
        }
        return $out;
    }

    /** @return list<array<string,mixed>> */
    public function history(int $days): array
    {
        $from = (new \DateTimeImmutable(Clock::today()))->modify('-' . max(1, min(400, $days)) . ' days')->format('Y-m-d');
        $out = [];
        foreach ($this->db->all('SELECT day, source, rate_last, rate_min, rate_max, rate_avg, samples FROM fx_daily WHERE day >= ? ORDER BY day, source', [$from]) as $r) {
            $out[(string) $r['day']][(string) $r['source']] = ['ultima' => (float) $r['rate_last'], 'minima' => (float) $r['rate_min'], 'maxima' => (float) $r['rate_max'], 'promedio' => (float) $r['rate_avg'], 'muestras' => (int) $r['samples']];
        }
        return array_map(fn ($day, $v) => ['fecha' => $day] + $v, array_keys($out), $out);
    }

    /** Escribe public_html/fx/actual.json (lo lee la app sin pasar por PHP; es información pública de mercado) */
    public function publish(): void
    {
        $pub = Env::str('PUBLIC_DIR', dirname(AGORA_APP) . '/public_html');
        if (!is_dir($pub)) {
            return;
        }
        $dir = $pub . '/fx';
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        $cur = $this->current();
        $cur['politica'] = [];
        foreach (self::OPS as $op) {
            $ch = $this->choose($op, 'SEGUN_OPERACION', $cur);
            $cur['politica'][$op] = ['tasa' => $ch['tasa'], 'fuente' => $ch['fuente'], 'regla' => $ch['regla']];
        }
        $tmp = $dir . '/.actual.' . bin2hex(random_bytes(4)) . '.tmp';
        file_put_contents($tmp, json_encode($cur, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        @chmod($tmp, 0644);
        rename($tmp, $dir . '/actual.json');
    }
}
