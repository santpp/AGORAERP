<?php
declare(strict_types=1);

namespace Agora\Services;

use Agora\App;
use Agora\Core\Clock;
use Agora\Http\HttpError;
use Agora\Security\Validator;

/**
 * Pasar datos entre la edición local (HTML/PC, respaldo) y el servidor:
 *  · exportar: un archivo con el mismo formato del respaldo de la edición local (se puede restaurar allá)
 *    más una sección "servidor" con documentos fiscales, cobros, auditoría y cierres;
 *  · importar: carga un respaldo de la edición local; sus facturas entran como documentos HISTÓRICOS
 *    (no se re-emiten) y el correlativo del servidor sigue desde el último número.
 */
final class Transfer
{
    private const CRED = ['agora_fin_sess', 'agora_fin_acc_v1', 'agora_fin_key_hash', 'agora_fin_key_kdf_v1', 'agora_fin_login_tries'];

    public function __construct(private App $app)
    {
    }

    public function export(int $orgId): array
    {
        $db = $this->app->db;
        $data = [];
        foreach ($db->all('SELECT doc_key, content FROM org_documents WHERE org_id = ? ORDER BY doc_key', [$orgId]) as $r) {
            if (in_array($r['doc_key'], Docs::DERIVED, true) || in_array($r['doc_key'], Docs::LOCAL_ONLY, true)) {
                continue;
            }
            $data[(string) $r['doc_key']] = (string) $r['content'];
        }
        $data['agora_fin_pagos_v1'] = (string) json_encode($this->app->payments->forClient($orgId), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $inv = array_map(fn ($f) => ['id' => $f['id'], 'num' => $f['num'], 'clientId' => $f['clientAppId'], 'code' => null, 'issueDate' => $f['issueDate'], 'dueDate' => $f['dueDate'], 'subtotal' => $f['subtotal'], 'ivaRate' => $f['ivaRate'], 'iva' => $f['iva'], 'paidDate' => null, 'lines' => array_map(fn ($l) => ['productId' => $l['productId'], 'amount' => $l['amount'], 'rec' => false, 'title' => $l['title']], $f['lines']), 'updatedAt' => $f['updatedAt'], 'src' => 'file'], $this->app->fiscal()->forClient($orgId));
        $data['agora_fin_imported_v1'] = (string) json_encode($inv, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $org = $db->one('SELECT uid, name, plan FROM organizations WHERE id = ?', [$orgId]) ?? [];
        $docs = [];
        foreach ($db->all('SELECT * FROM fiscal_documents WHERE org_id = ? ORDER BY id', [$orgId]) as $r) {
            $docs[] = $this->app->fiscal()->out($r, true) + ['sello' => $r['hash'], 'sello_anterior' => $r['prev_hash']];
        }
        return [
            'app' => 'agora-digital-app', 'version' => 11.0, 'format' => 2, 'createdAt' => App::iso(Clock::ts()), 'origen' => 'servidor',
            'empresa' => ['uid' => $org['uid'] ?? '', 'nombre' => $org['name'] ?? '', 'plan' => $org['plan'] ?? ''],
            'data' => $data,
            'servidor' => [
                'perfil_fiscal' => $this->app->fiscal()->profileOut($orgId),
                'rangos_control' => $this->app->fiscal()->ranges($orgId),
                'documentos_fiscales' => $docs,
                'cobros' => $db->all('SELECT app_id, invoice_ref, paid_on, method, currency, amount_cents, usd_cents, fee_cents, rate, rate_type, rate_bcv, igtf_cents, reference, payer, status, created_at, reverted_at, revert_reason FROM payments WHERE org_id = ? ORDER BY id', [$orgId]),
                'periodos' => $this->app->periods->list($orgId),
                'auditoria' => $db->all('SELECT id, user_email, role, ip, module, action, entity, entity_id, origin, grant_id, prev_hash, hash, created_at FROM audit_log WHERE org_id = ? ORDER BY id DESC LIMIT 5000', [$orgId]),
            ],
        ];
    }

    /** @param array<string,mixed> $j respaldo de la edición local */
    public function import(int $orgId, array $j, array $actor, ?string $grantId): array
    {
        if (($j['app'] ?? null) !== 'agora-digital-app' || !is_array($j['data'] ?? null) || array_is_list($j['data'])) {
            throw HttpError::badRequest('Ese archivo no es un respaldo de Agora Digital App.');
        }
        $db = $this->app->db;
        $data = $j['data'];
        foreach ($data as $k => $v) {
            if (!is_string($k) || !Docs::validKey($k) || !is_string($v)) {
                throw HttpError::badRequest('El respaldo trae un dato con formato no válido.');
            }
        }
        $clients = json_decode($data['agora_fin_clients_v2'] ?? '[]', true) ?: [];
        $byId = [];
        foreach ($clients as $c) {
            if (is_array($c) && isset($c['id'])) {
                $byId[(string) $c['id']] = $c;
            }
        }
        $imported = json_decode($data['agora_fin_imported_v1'] ?? '[]', true) ?: [];
        $pagos = json_decode($data['agora_fin_pagos_v1'] ?? '[]', true) ?: [];
        $skip = array_merge(self::CRED, Docs::LOCAL_ONLY, Docs::DERIVED, Docs::USER_PREFS, ['agora_fin_pagos_v1', 'agora_fin_audit']);
        $res = $db->transaction(function () use ($db, $orgId, $data, $skip, $imported, $byId, $actor, $grantId) {
            $docs = 0;
            foreach ($data as $key => $raw) {
                if (in_array($key, $skip, true)) {
                    continue;
                }
                if (json_decode($raw) === null && trim($raw) !== 'null') {
                    continue;
                }
                $this->putDoc($orgId, $key, $raw, (int) $actor['user_id'], $grantId);
                $docs++;
            }
            if (isset($data['agora_fin_audit']) && strlen($data['agora_fin_audit']) < 4 * 1024 * 1024) {
                $this->putDoc($orgId, 'agora_fin_audit_local_v1', $data['agora_fin_audit'], (int) $actor['user_id'], $grantId);
            }
            [$inv, $invSkipped, $maxNum] = $this->legacyInvoices($orgId, $imported, $byId, (int) $actor['user_id']);
            if ($maxNum > 0) {
                $db->exec("UPDATE document_sequences SET last_number = CASE WHEN last_number < ? THEN ? ELSE last_number END, updated_at = ? WHERE org_id = ? AND doc_type = 'FAC' AND series = ''", [$maxNum, $maxNum, Clock::ts(), $orgId]);
            }
            $db->exec('UPDATE organizations SET data_version = data_version + 1, updated_at = ? WHERE id = ?', [Clock::ts(), $orgId]);
            return ['datos' => $docs, 'facturas' => $inv, 'facturas_omitidas' => $invSkipped];
        });
        $this->app->docs->reproject($orgId);
        $pay = $this->app->payments->importList($orgId, is_array($pagos) ? $pagos : [], $actor);
        $this->app->audit->log($orgId, $actor, 'ajustes', sprintf('importó el respaldo de la edición local: %d dato(s), %d factura(s) histórica(s), %d cobro(s)', $res['datos'], $res['facturas'], $pay['agregados']), 'importacion', null, ['omitidos' => array_slice(array_merge($res['facturas_omitidas'], $pay['omitidos']), 0, 50)], 'SERVIDOR', $grantId);
        return $res + ['cobros' => $pay['agregados'], 'cobros_omitidos' => $pay['omitidos']];
    }

    private function putDoc(int $orgId, string $key, string $raw, int $userId, ?string $grantId): void
    {
        $db = $this->app->db;
        $cur = $db->one('SELECT version FROM org_documents WHERE org_id = ? AND doc_key = ?' . $db->forUpdate(), [$orgId, $key]);
        $ver = $cur ? (int) $cur['version'] + 1 : 1;
        if ($cur) {
            $db->update('org_documents', ['content' => $raw, 'version' => $ver, 'size_bytes' => strlen($raw), 'updated_at' => Clock::ts(), 'updated_by' => $userId], ['org_id' => $orgId, 'doc_key' => $key]);
        } else {
            $db->insert('org_documents', ['org_id' => $orgId, 'doc_key' => $key, 'content' => $raw, 'version' => $ver, 'size_bytes' => strlen($raw), 'updated_at' => Clock::ts(), 'updated_by' => $userId]);
        }
        $db->insert('org_document_history', ['org_id' => $orgId, 'doc_key' => $key, 'version' => $ver, 'content' => $raw, 'changed_by' => $userId, 'grant_id' => $grantId, 'changed_at' => Clock::ts()]);
    }

    /** @return array{0:int,1:list<string>,2:int} cargadas, omitidas y número más alto */
    private function legacyInvoices(int $orgId, mixed $list, array $byId, int $userId): array
    {
        $db = $this->app->db;
        $n = 0;
        $skipped = [];
        $max = 0;
        foreach (is_array($list) ? $list : [] as $inv) {
            if (!is_array($inv)) {
                continue;
            }
            $num = Validator::clean($inv['num'] ?? '', 16);
            $digits = preg_replace('/\D/', '', $num) ?? '';
            $issue = Validator::date($inv['issueDate'] ?? '');
            if ($digits === '' || strlen($digits) > 12 || !$issue) {
                $skipped[] = 'Factura ' . ($num ?: '?') . ': sin número o sin fecha';
                continue;
            }
            $number = (int) $digits;
            if ($db->value("SELECT 1 FROM fiscal_documents WHERE org_id = ? AND doc_type = 'FAC' AND series = '' AND number = ?", [$orgId, $number])) {
                continue; // ya está (importación repetida)
            }
            $c = $byId[(string) ($inv['clientId'] ?? '')] ?? [];
            $opt = is_array($c['opt'] ?? null) ? $c['opt'] : [];
            $sub = Validator::cents($inv['subtotal'] ?? 0) ?? 0;
            $iva = Validator::cents($inv['iva'] ?? 0) ?? 0;
            if ($sub <= 0) {
                $skipped[] = "Factura {$num}: monto en cero";
                continue;
            }
            $due = Validator::date($inv['dueDate'] ?? '') ?? $issue;
            $id = $db->insert('fiscal_documents', [
                'uid' => \Agora\Core\Ids::ulid(), 'org_id' => $orgId, 'doc_type' => 'FAC', 'series' => '', 'number' => $number, 'number_text' => $num, 'control_number' => null, 'status' => 'EMITIDA', 'legacy' => 1,
                'issue_date' => $issue, 'issue_time' => null, 'due_date' => $due, 'currency' => 'USD', 'rate_bcv' => null, 'rate_bcv_date' => null, 'client_id' => null,
                'client_app_id' => isset($inv['clientId']) && preg_match('/^[A-Za-z0-9_.-]{1,40}$/', (string) $inv['clientId']) ? (string) $inv['clientId'] : null,
                'client_name' => Validator::clean($c['name'] ?? ($inv['client'] ?? 'Cliente'), 200), 'client_rif' => (string) (Validator::rif($opt['rif'] ?? '') ?? ''), 'client_address' => Validator::clean($opt['dir'] ?? '', 400),
                'client_email' => isset($opt['email']) ? Validator::email($opt['email']) : null, 'client_phone' => isset($opt['tel']) ? Validator::clean($opt['tel'], 40) : null, 'payment_terms' => null, 'foreign_payment' => 0,
                'subtotal_cents' => $sub, 'exempt_cents' => $iva > 0 ? 0 : $sub, 'base_general_cents' => $iva > 0 ? $sub : 0, 'iva_general_cents' => $iva, 'total_cents' => $sub + $iva,
                'notes' => 'Importada de la edición local (no emitida desde el servidor).', 'created_by' => $userId, 'created_at' => Clock::ts(), 'updated_at' => Clock::ts(), 'emitted_by' => $userId, 'emitted_at' => Clock::ts(),
            ]);
            $i = 0;
            foreach (is_array($inv['lines'] ?? null) ? $inv['lines'] : [] as $l) {
                if (!is_array($l)) {
                    continue;
                }
                $amt = Validator::cents($l['amount'] ?? 0) ?? 0;
                $li = $sub > 0 ? (int) round($iva * $amt / $sub) : 0;
                $db->insert('fiscal_document_lines', ['document_id' => $id, 'line_no' => ++$i, 'product_code' => isset($l['productId']) ? mb_substr((string) $l['productId'], 0, 60) : null, 'description' => Validator::clean($l['title'] ?? 'Servicio', 500) ?: 'Servicio', 'quantity_milli' => 1000, 'unit_price_cents' => max(0, $amt), 'discount_cents' => 0, 'tax_code' => $iva > 0 ? 'G' : 'E', 'base_cents' => $amt, 'iva_cents' => $li, 'total_cents' => $amt + $li, 'recurring' => !empty($l['rec']) ? 1 : 0]);
            }
            $n++;
            $max = max($max, $number);
        }
        if ($max > 0 && !$db->value("SELECT 1 FROM document_sequences WHERE org_id = ? AND doc_type = 'FAC' AND series = ''", [$orgId])) {
            $db->insert('document_sequences', ['org_id' => $orgId, 'doc_type' => 'FAC', 'series' => '', 'last_number' => $max, 'updated_at' => Clock::ts()]);
        }
        return [$n, $skipped, $max];
    }
}
