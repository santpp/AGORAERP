<?php
declare(strict_types=1);

namespace Agora\Security;

use Agora\Core\Clock;
use Agora\Core\Db;
use Agora\Http\HttpError;

/** Límite de peticiones por ventana fija (contador atómico en la base; funciona en hosting compartido sin Redis). */
final class RateLimiter
{
    public function __construct(private Db $db)
    {
    }

    /** @return array{allowed:bool,hits:int,retry:int} */
    public function hit(string $key, int $limit, int $windowSec, int $cost = 1): array
    {
        $now = Clock::unix();
        $start = intdiv($now, $windowSec) * $windowSec;
        $bucket = self::bucket($key);
        $this->db->upsertIncrement('rate_limits', ['bucket' => $bucket, 'window_start' => $start, 'hits' => $cost, 'expires_at' => $start + $windowSec * 2], ['bucket', 'window_start'], 'hits', $cost);
        $hits = (int) $this->db->value('SELECT hits FROM rate_limits WHERE bucket = ? AND window_start = ?', [$bucket, $start]);
        return ['allowed' => $hits <= $limit, 'hits' => $hits, 'retry' => max(1, $start + $windowSec - $now)];
    }

    public function count(string $key, int $windowSec): int
    {
        $start = intdiv(Clock::unix(), $windowSec) * $windowSec;
        return (int) ($this->db->value('SELECT hits FROM rate_limits WHERE bucket = ? AND window_start = ?', [self::bucket($key), $start]) ?? 0);
    }

    /** Lanza 429 con "Retry-After" si se pasa del límite */
    public function enforce(string $key, int $limit, int $windowSec, string $msg = 'Demasiados intentos. Espera un momento y vuelve a intentarlo.'): void
    {
        $r = $this->hit($key, $limit, $windowSec);
        if (!$r['allowed']) {
            throw new HttpError(429, 'DEMASIADAS_SOLICITUDES', $msg, ['reintentar_en' => $r['retry']]);
        }
    }

    private static function bucket(string $key): string
    {
        return strlen($key) <= 120 ? $key : substr($key, 0, 56) . ':' . hash('sha256', $key);
    }
}
