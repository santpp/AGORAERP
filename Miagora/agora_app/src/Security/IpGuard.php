<?php
declare(strict_types=1);

namespace Agora\Security;

use Agora\Core\Clock;
use Agora\Core\Db;

/** Bloqueo temporal de direcciones IP (trampa de código fuente, WAF o abuso de acceso). */
final class IpGuard
{
    private array $cache = [];

    public function __construct(private Db $db)
    {
    }

    public function isBlocked(string $ip): bool
    {
        if (array_key_exists($ip, $this->cache)) {
            return $this->cache[$ip];
        }
        $row = $this->db->one('SELECT blocked_until FROM ip_blocks WHERE ip = ?', [$ip]);
        return $this->cache[$ip] = ($row !== null && strcmp((string) $row['blocked_until'], Clock::ts()) > 0);
    }

    public function block(string $ip, string $reason, string $severity, int $minutes): void
    {
        $now = Clock::ts();
        $until = Clock::ts($minutes * 60);
        $row = $this->db->one('SELECT hits, blocked_until FROM ip_blocks WHERE ip = ?', [$ip]);
        if ($row) {
            $newUntil = strcmp($until, (string) $row['blocked_until']) > 0 ? $until : (string) $row['blocked_until'];
            $this->db->update('ip_blocks', ['reason' => mb_substr($reason, 0, 255), 'severity' => $severity, 'hits' => (int) $row['hits'] + 1, 'blocked_until' => $newUntil, 'updated_at' => $now], ['ip' => $ip]);
        } else {
            $this->db->insert('ip_blocks', ['ip' => $ip, 'reason' => mb_substr($reason, 0, 255), 'severity' => $severity, 'hits' => 1, 'blocked_until' => $until, 'created_at' => $now, 'updated_at' => $now]);
        }
        $this->cache[$ip] = true;
    }

    public function unblock(string $ip): void
    {
        $this->db->update('ip_blocks', ['blocked_until' => Clock::ts(), 'updated_at' => Clock::ts()], ['ip' => $ip]);
        $this->cache[$ip] = false;
    }
}
