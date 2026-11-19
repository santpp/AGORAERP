<?php
declare(strict_types=1);

namespace Agora\Services;

use Agora\Core\Clock;
use Agora\Core\Db;
use Agora\Http\HttpError;

/** Cierre de mes: un mes CERRADO queda marcado; sus cambios se registran en la auditoría. */
final class Periods
{
    private array $cache = [];

    public function __construct(private Db $db)
    {
    }

    /** @return list<string> meses cerrados (AAAA-MM) */
    public function closed(int $orgId): array
    {
        return $this->cache[$orgId] ??= array_map(fn ($r) => (string) $r['period'], $this->db->all("SELECT period FROM accounting_periods WHERE org_id = ? AND status = 'CERRADO' ORDER BY period", [$orgId]));
    }

    public function isClosed(int $orgId, string $period): bool
    {
        return in_array($period, $this->closed($orgId), true);
    }

    /** @return list<array<string,mixed>> */
    public function list(int $orgId): array
    {
        return $this->db->all('SELECT period, status, closed_at, reopened_at, reopen_reason FROM accounting_periods WHERE org_id = ? ORDER BY period DESC', [$orgId]);
    }

    public function close(int $orgId, string $period, int $userId, array $snapshot): void
    {
        $cur = substr(Clock::today(), 0, 7);
        if (strcmp($period, $cur) >= 0) {
            throw HttpError::badRequest('Solo se pueden cerrar meses que ya terminaron.');
        }
        $row = $this->db->one('SELECT status FROM accounting_periods WHERE org_id = ? AND period = ?', [$orgId, $period]);
        if ($row && $row['status'] === 'CERRADO') {
            throw new HttpError(409, 'YA_CERRADO', 'Ese mes ya está cerrado.');
        }
        $data = ['status' => 'CERRADO', 'closed_at' => Clock::ts(), 'closed_by' => $userId, 'close_snapshot' => json_encode($snapshot, JSON_UNESCAPED_UNICODE), 'updated_at' => Clock::ts()];
        if ($row) {
            $this->db->update('accounting_periods', $data, ['org_id' => $orgId, 'period' => $period]);
        } else {
            $this->db->insert('accounting_periods', ['org_id' => $orgId, 'period' => $period, 'reopened_at' => null, 'reopened_by' => null, 'reopen_reason' => null] + $data);
        }
        unset($this->cache[$orgId]);
    }

    public function reopen(int $orgId, string $period, int $userId, string $reason): void
    {
        $n = $this->db->exec("UPDATE accounting_periods SET status = 'ABIERTO', reopened_at = ?, reopened_by = ?, reopen_reason = ?, updated_at = ? WHERE org_id = ? AND period = ? AND status = 'CERRADO'", [Clock::ts(), $userId, mb_substr($reason, 0, 400), Clock::ts(), $orgId, $period]);
        if ($n !== 1) {
            throw new HttpError(409, 'NO_CERRADO', 'Ese mes no está cerrado.');
        }
        unset($this->cache[$orgId]);
    }
}
