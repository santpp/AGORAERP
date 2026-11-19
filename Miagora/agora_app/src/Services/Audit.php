<?php
declare(strict_types=1);

namespace Agora\Services;

use Agora\Core\Clock;
use Agora\Core\Db;
use Agora\Core\Env;

/**
 * Auditoría encadenada: hash = HMAC-SHA256(AUDIT_KEY, hash_anterior | datos del registro).
 * La fila de audit_heads de cada empresa se bloquea al escribir, así la cadena no se bifurca.
 * En la base, los disparadores impiden editar o borrar registros.
 */
final class Audit
{
    public function __construct(private Db $db)
    {
    }

    /**
     * @param array<string,mixed> $actor user_id, email, role, ip
     * @param array<string,mixed>|null $detail antes/después (sin datos secretos)
     */
    public function log(?int $orgId, array $actor, string $module, string $action, ?string $entity = null, ?string $entityId = null, ?array $detail = null, string $origin = 'SERVIDOR', ?string $grantId = null): int
    {
        return $this->db->transaction(function () use ($orgId, $actor, $module, $action, $entity, $entityId, $detail, $origin, $grantId) {
            $head = $orgId ?? 0;
            $h = $this->db->one('SELECT last_hash FROM audit_heads WHERE org_id = ?' . $this->db->forUpdate(), [$head]);
            if (!$h) {
                $this->db->insert('audit_heads', ['org_id' => $head, 'last_id' => 0, 'last_hash' => str_repeat('0', 64), 'updated_at' => Clock::ts()]);
                $prev = str_repeat('0', 64);
            } else {
                $prev = (string) $h['last_hash'];
            }
            $row = [
                'org_id' => $orgId, 'user_id' => $actor['user_id'] ?? null, 'user_email' => (string) ($actor['email'] ?? ''), 'role' => (string) ($actor['role'] ?? ''),
                'ip' => (string) ($actor['ip'] ?? ''), 'module' => mb_substr($module, 0, 40), 'action' => mb_substr($action, 0, 500),
                'entity' => $entity, 'entity_id' => $entityId, 'detail' => $detail ? json_encode($detail, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR) : null,
                'origin' => $origin, 'grant_id' => $grantId, 'prev_hash' => $prev, 'created_at' => Clock::ts(),
            ];
            $row['hash'] = self::sign($row);
            $id = $this->db->insert('audit_log', $row);
            $this->db->update('audit_heads', ['last_id' => $id, 'last_hash' => $row['hash'], 'updated_at' => Clock::ts()], ['org_id' => $head]);
            return $id;
        });
    }

    public static function sign(array $r): string
    {
        $payload = implode('|', [
            $r['prev_hash'], $r['org_id'] ?? '', $r['user_id'] ?? '', $r['user_email'], $r['role'], $r['ip'], $r['module'], $r['action'],
            $r['entity'] ?? '', $r['entity_id'] ?? '', $r['detail'] ?? '', $r['origin'], $r['grant_id'] ?? '', $r['created_at'],
        ]);
        return hash_hmac('sha256', $payload, Env::secret('AUDIT_KEY'));
    }

    /** Recorre la cadena de una empresa. @return array{ok:bool,total:int,primer_error:?int} */
    public function verify(?int $orgId): array
    {
        $prev = str_repeat('0', 64);
        $n = 0;
        $last = 0;
        while (true) {
            $rows = $this->db->all('SELECT * FROM audit_log WHERE ' . ($orgId === null ? 'org_id IS NULL' : 'org_id = ?') . ' AND id > ? ORDER BY id LIMIT 2000', $orgId === null ? [$last] : [$orgId, $last]);
            if (!$rows) {
                break;
            }
            foreach ($rows as $r) {
                $n++;
                $last = (int) $r['id'];
                foreach (['org_id', 'user_id'] as $k) {
                    $r[$k] = $r[$k] === null ? null : (string) $r[$k];
                }
                if ($r['prev_hash'] !== $prev || !hash_equals(self::sign($r), (string) $r['hash'])) {
                    return ['ok' => false, 'total' => $n, 'primer_error' => (int) $r['id']];
                }
                $prev = (string) $r['hash'];
            }
        }
        return ['ok' => true, 'total' => $n, 'primer_error' => null];
    }
}
