<?php
declare(strict_types=1);

namespace Agora\Services;

use Agora\Core\Clock;
use Agora\Core\Db;
use Agora\Http\HttpError;
use Agora\Http\Request;
use Agora\Security\Roles;
use Agora\Security\StepUp;
use Agora\Security\Validator;

/**
 * Datos de la app (los mismos que la edición local guardaba en el navegador), ahora en el servidor:
 *  · documentos de la empresa con versión, historial y fusión cuando dos personas editan a la vez;
 *  · reglas por clave: meses cerrados (OTP), recibos emitidos (OTP), cobros (servicio Payments), auditoría;
 *  · preferencias personales por usuario; credenciales y datos del facturero local nunca se suben.
 */
final class Docs
{
    public const LOCAL_ONLY = ['agora_fin_sess', 'agora_fin_acc_v1', 'agora_fin_key_hash', 'agora_fin_key_kdf_v1', 'agora_fin_login_tries', 'agora_fin_audit_anchor_v1', 'agora-facturas-v1', 'agora-factura-v2', 'agora-correlativos-v1', 'agora-formato-v1', 'agora-facturacion', 'agora_fin_fact_sig'];
    public const USER_PREFS = ['agora_fin_theme', 'agora_fin_accent', 'agora_fin_nav_v1', 'agora_fin_side_v1', 'agora_fin_gestures_v1', 'agora_fin_athena_cfg_v1', 'agora_fin_athena_greet_day', 'agora_fin_role'];
    /** Claves con datos de meses: cambiar un mes cerrado exige OTP */
    public const GUARDED = ['agora_fin_expenses_v2', 'agora_fin_investments_v2', 'agora_fin_aportes_v1', 'agora_fin_receipts_v1', 'agora_fin_tasas_v1', 'agora_fin_rates_v1', 'agora_fin_cash_v1', 'agora_fin_budget_over_v1', 'agora_fin_goals_v1', 'agora_fin_matrix_v1', 'agora_fin_com_paid_v1', 'agora_fin_com_paid_ref_v1', 'agora_fin_decisions', 'agora_fin_payments', 'agora_fin_pay_refs_v1'];
    public const AGENDA = ['agora_fin_events_v1', 'agora_fin_agenda_cfg_v1', 'agora_fin_actions'];
    /** Las arma el servidor (no se guardan desde la app): facturas salen de los documentos fiscales */
    public const DERIVED = ['agora_fin_imported_v1'];
    private const MAX_BYTES = 4 * 1024 * 1024;

    public function __construct(private Db $db, private Periods $periods, private Payments $payments, private Audit $audit, private StepUp $stepUp)
    {
    }

    public static function validKey(string $k): bool
    {
        return (bool) preg_match('/^(agora_fin_[a-z0-9_]{1,40}|agora-[a-z0-9-]{1,40})$/', $k);
    }

    /** @return array{datos:array<string,string>,versiones:array<string,int>} valores como texto (igual que en el navegador) */
    public function load(int $orgId, int $userId): array
    {
        $vals = [];
        $vers = [];
        foreach ($this->db->all('SELECT doc_key, content, version FROM org_documents WHERE org_id = ?', [$orgId]) as $r) {
            if (in_array($r['doc_key'], self::DERIVED, true) || in_array($r['doc_key'], self::LOCAL_ONLY, true)) {
                continue;
            }
            $vals[(string) $r['doc_key']] = (string) $r['content'];
            $vers[(string) $r['doc_key']] = (int) $r['version'];
        }
        foreach ($this->db->all('SELECT pref_key, pref_value FROM user_prefs WHERE user_id = ?', [$userId]) as $r) {
            if (in_array($r['pref_key'], self::USER_PREFS, true)) {
                $vals[(string) $r['pref_key']] = (string) $r['pref_value'];
            }
        }
        $vals['agora_fin_pagos_v1'] = json_encode($this->payments->forClient($orgId), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $vals['agora_fin_audit'] = json_encode($this->auditForClient($orgId), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $vals['agora_fin_tasas_v1'] = json_encode($this->mergeAutoRates(json_decode($vals['agora_fin_tasas_v1'] ?? '{}', true) ?: []), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        return ['datos' => $vals, 'versiones' => $vers];
    }

    /**
     * Guarda un lote de cambios (todo o nada).
     * @param array<string,mixed> $changes clave → texto JSON (o null para borrar)
     * @param array<string,int> $bases versión que tenía el navegador al editar
     * @return array{versiones:array<string,int>,actualizados:array<string,string>}
     */
    public function save(Request $req, array $s, array $changes, array $bases): array
    {
        $orgId = (int) $s['org_id'];
        $role = $s['role'] ?? null;
        if (count($changes) > 60) {
            throw HttpError::badRequest('Demasiados cambios en una sola solicitud.');
        }
        $parsed = [];
        foreach ($changes as $key => $raw) {
            $key = (string) $key;
            if (!self::validKey($key)) {
                throw HttpError::badRequest('Clave de datos no válida.');
            }
            if (in_array($key, self::LOCAL_ONLY, true) || in_array($key, self::DERIVED, true)) {
                continue;
            }
            if ($raw !== null && !is_string($raw)) {
                throw HttpError::badRequest("El dato {$key} debe enviarse como texto JSON.");
            }
            if ($raw !== null && strlen($raw) > self::MAX_BYTES) {
                throw new HttpError(413, 'DATO_MUY_GRANDE', "El dato {$key} supera el tamaño permitido.");
            }
            $val = $raw === null ? null : json_decode($raw, true);
            if ($raw !== null && $val === null && trim($raw) !== 'null') {
                throw HttpError::badRequest("El dato {$key} no es un JSON válido.");
            }
            if ($key === 'agora_fin_tasas_v1' && is_array($val)) {
                // la app devuelve también las tasas que el servidor agregó solo (BCV y Binance): no se guardan como escritas a mano
                $val = $this->stripAutoRates($val);
                $raw = json_encode($val, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            }
            if (in_array($key, self::USER_PREFS, true)) {
                $parsed[$key] = ['kind' => 'pref', 'raw' => $raw];
            } elseif ($key === 'agora_fin_pagos_v1') {
                $parsed[$key] = ['kind' => 'pagos', 'val' => $val];
            } elseif ($key === 'agora_fin_audit') {
                $parsed[$key] = ['kind' => 'audit', 'val' => $val];
            } else {
                $perm = in_array($key, self::AGENDA, true) ? 'agenda.escribir' : 'datos.escribir';
                if (!Roles::can($role, $perm)) {
                    throw HttpError::forbidden('Tu rol no permite cambiar estos datos.');
                }
                $parsed[$key] = ['kind' => 'doc', 'raw' => $raw, 'val' => $val];
            }
        }

        return $this->db->transaction(function () use ($req, $s, $orgId, $parsed, $bases) {
            $locks = [];
            $plans = [];
            $grantUsed = null;
            foreach ($parsed as $key => $p) {
                if ($p['kind'] === 'pagos') {
                    $plans['pagos'] = $this->payments->plan($req, $s, $p['val'], $locks);
                    continue;
                }
                if ($p['kind'] !== 'doc') {
                    continue;
                }
                $cur = $this->db->one('SELECT content, version FROM org_documents WHERE org_id = ? AND doc_key = ?' . $this->db->forUpdate(), [$orgId, $key]);
                $curVal = $cur ? json_decode((string) $cur['content'], true) : null;
                $curVer = $cur ? (int) $cur['version'] : 0;
                $base = isset($bases[$key]) ? (int) $bases[$key] : null;
                $final = $p['val'];
                if ($cur && $base !== null && $base !== $curVer) {
                    $baseRow = $base > 0 ? $this->db->value('SELECT content FROM org_document_history WHERE org_id = ? AND doc_key = ? AND version = ?', [$orgId, $key, $base]) : null;
                    $final = JsonDiff::merge3($baseRow !== null ? json_decode((string) $baseRow, true) : null, $curVal, $p['val']);
                }
                if (in_array($key, self::GUARDED, true)) {
                    $closedSet = $this->periods->closed($orgId);
                    $touched = array_values(array_intersect(JsonDiff::changedPeriods($curVal, $final), $closedSet));
                    if ($touched) {
                        $scope = 'periodo:' . implode(',', $touched);
                        $g = $this->stepUp->find($req, $s, 'DATOS_CERRADOS', $scope);
                        if (!$g) {
                            $locks[] = ['accion' => 'DATOS_CERRADOS', 'alcance' => $scope, 'motivo' => true];
                        } else {
                            $grantUsed = $g;
                            $p['closed'] = $touched;
                        }
                    }
                }
                if ($key === 'agora_fin_receipts_v1') {
                    $changedIds = self::changedExistingIds($curVal, $final);
                    if ($changedIds) {
                        $scope = 'recibo:' . implode(',', $changedIds);
                        $g = $this->stepUp->find($req, $s, 'RECIBO_CAMBIAR', $scope);
                        if (!$g) {
                            $locks[] = ['accion' => 'RECIBO_CAMBIAR', 'alcance' => $scope, 'motivo' => true];
                        } else {
                            $grantUsed = $g;
                        }
                    }
                }
                $plans[$key] = ['final' => $final, 'curVer' => $curVer, 'exists' => (bool) $cur, 'merged' => $final !== $p['val'], 'closed' => $p['closed'] ?? []];
            }
            if ($locks) {
                $first = $locks[0];
                throw new HttpError(423, 'VERIFICACION_REQUERIDA', StepUp::ACTIONS[$first['accion']] . ': confirma con el código que te enviaremos.', [
                    'accion' => $first['accion'], 'alcance' => $first['alcance'], 'descripcion' => StepUp::ACTIONS[$first['accion']], 'motivo_requerido' => $first['motivo'], 'pendientes' => count($locks),
                ]);
            }
            $versions = [];
            $updated = [];
            $actor = ['user_id' => (int) $s['user_id'], 'email' => $s['email'], 'role' => $s['role'], 'ip' => $req->ip];
            foreach ($parsed as $key => $p) {
                if ($p['kind'] === 'pref') {
                    if ($p['raw'] === null) {
                        $this->db->exec('DELETE FROM user_prefs WHERE user_id = ? AND pref_key = ?', [(int) $s['user_id'], $key]);
                    } else {
                        $this->db->upsert('user_prefs', ['user_id' => (int) $s['user_id'], 'pref_key' => $key, 'pref_value' => mb_substr((string) $p['raw'], 0, 20000), 'updated_at' => Clock::ts()], ['user_id', 'pref_key'], ['pref_value', 'updated_at']);
                    }
                } elseif ($p['kind'] === 'audit') {
                    $this->clientAuditEvents($orgId, $actor, $p['val']);
                    $updated[$key] = json_encode($this->auditForClient($orgId), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                } elseif ($p['kind'] === 'pagos') {
                    if ($this->payments->apply($s + ['ip' => $req->ip], $plans['pagos'] ?? [])) {
                        $updated[$key] = json_encode($this->payments->forClient($orgId), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                    }
                } else {
                    $plan = $plans[$key];
                    $json = json_encode($plan['final'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                    $ver = $plan['curVer'] + 1;
                    if ($plan['exists']) {
                        $this->db->update('org_documents', ['content' => $json, 'version' => $ver, 'size_bytes' => strlen($json), 'updated_at' => Clock::ts(), 'updated_by' => (int) $s['user_id']], ['org_id' => $orgId, 'doc_key' => $key]);
                    } else {
                        $this->db->insert('org_documents', ['org_id' => $orgId, 'doc_key' => $key, 'content' => $json, 'version' => $ver, 'size_bytes' => strlen($json), 'updated_at' => Clock::ts(), 'updated_by' => (int) $s['user_id']]);
                    }
                    $this->db->insert('org_document_history', ['org_id' => $orgId, 'doc_key' => $key, 'version' => $ver, 'content' => $json, 'changed_by' => (int) $s['user_id'], 'grant_id' => $plan['closed'] && $grantUsed ? $grantUsed['id'] : null, 'changed_at' => Clock::ts()]);
                    $versions[$key] = $ver;
                    if ($plan['merged']) {
                        $updated[$key] = $json;
                    }
                    if ($plan['closed']) {
                        $this->audit->log($orgId, $actor, 'periodos', 'cambió datos de mes cerrado (' . implode(', ', $plan['closed']) . ') en ' . self::label($key) . ' · motivo: ' . ($grantUsed['reason'] ?? ''), 'documento', $key, null, 'SERVIDOR', $grantUsed['id'] ?? null);
                    }
                    if ($key === 'agora_fin_clients_v2') {
                        $this->projectClients($orgId, $plan['final']);
                    } elseif ($key === 'agora_fin_expenses_v2') {
                        $this->projectExpenses($orgId, $plan['final']);
                    }
                }
            }
            $this->db->exec('UPDATE organizations SET data_version = data_version + 1, updated_at = ? WHERE id = ?', [Clock::ts(), $orgId]);
            return ['versiones' => $versions, 'actualizados' => $updated];
        });
    }

    /** @return list<string> ids de elementos que ya existían y cambiaron o se borraron */
    private static function changedExistingIds(mixed $old, mixed $new): array
    {
        if (!is_array($old) || !array_is_list($old)) {
            return [];
        }
        $newById = [];
        foreach (is_array($new) ? $new : [] as $it) {
            if (is_array($it) && isset($it['id'])) {
                $newById[(string) $it['id']] = $it;
            }
        }
        $out = [];
        foreach ($old as $it) {
            if (is_array($it) && isset($it['id']) && (!isset($newById[(string) $it['id']]) || $newById[(string) $it['id']] !== $it)) {
                $out[] = preg_replace('/[^A-Za-z0-9_.-]/', '', (string) $it['id']);
            }
        }
        return array_slice(array_filter($out), 0, 20);
    }

    private static function label(string $key): string
    {
        return [
            'agora_fin_expenses_v2' => 'Gastos', 'agora_fin_investments_v2' => 'Inversión', 'agora_fin_aportes_v1' => 'Aportes', 'agora_fin_receipts_v1' => 'Recibos',
            'agora_fin_tasas_v1' => 'Tasas del día', 'agora_fin_rates_v1' => 'Tasas por mes', 'agora_fin_cash_v1' => 'Caja', 'agora_fin_budget_over_v1' => 'Presupuesto',
            'agora_fin_goals_v1' => 'Metas', 'agora_fin_matrix_v1' => 'Matriz económica', 'agora_fin_com_paid_v1' => 'Comisiones', 'agora_fin_decisions' => 'Cobranza',
        ][$key] ?? $key;
    }

    /** Auditoría del servidor en el formato que muestra la app (las últimas 1.000 acciones) */
    public function auditForClient(int $orgId): array
    {
        $tz = new \DateTimeZone('America/Caracas');
        $out = [];
        foreach ($this->db->all('SELECT id, user_email, role, module, action, origin, created_at FROM audit_log WHERE org_id = ? ORDER BY id DESC LIMIT 1000', [$orgId]) as $r) {
            $d = (new \DateTimeImmutable((string) $r['created_at'], new \DateTimeZone('UTC')))->setTimezone($tz);
            $out[] = [
                'id' => 's' . $r['id'], 'ts' => str_replace(' ', 'T', (string) $r['created_at']) . 'Z', 'date' => $d->format('Y-m-d'), 'time' => $d->format('H:i:s'),
                'user' => (string) $r['user_email'] ?: 'Sistema', 'role' => Roles::LABELS[$r['role']] ?? (string) $r['role'], 'module' => (string) $r['module'],
                'action' => (string) $r['action'] . ($r['origin'] === 'CLIENTE' ? '' : ''), 'srv' => true,
            ];
        }
        return $out;
    }

    /** Acciones que la app registra por su cuenta (abrió la edición, descargó un informe…) */
    private function clientAuditEvents(int $orgId, array $actor, mixed $list): void
    {
        if (!is_array($list)) {
            return;
        }
        $known = [];
        foreach ($this->db->all("SELECT entity_id FROM audit_log WHERE org_id = ? AND origin = 'CLIENTE' AND created_at >= ?", [$orgId, Clock::ts(-7 * 86400)]) as $r) {
            $known[(string) $r['entity_id']] = true;
        }
        $n = 0;
        foreach ($list as $e) {
            if (!is_array($e) || !empty($e['srv']) || !isset($e['id'], $e['action']) || isset($known[(string) $e['id']])) {
                continue;
            }
            if (++$n > 30) {
                break;
            }
            $module = preg_match('/^[a-z0-9_-]{1,40}$/', (string) ($e['module'] ?? '')) ? (string) $e['module'] : 'sistema';
            $this->audit->log($orgId, $actor, $module, Validator::clean($e['action'], 500), 'cliente', mb_substr(preg_replace('/[^A-Za-z0-9_.-]/', '', (string) $e['id']) ?? '', 0, 64), null, 'CLIENTE');
        }
    }

    /** Quita de lo que manda la app las tasas automáticas que no cambió (marcadas con "auto") */
    private function stripAutoRates(array $val): array
    {
        $days = array_values(array_filter(array_keys($val), fn ($d) => is_string($d) && !empty($val[$d]['auto'])));
        if (!$days) {
            return $val;
        }
        $auto = [];
        $in = implode(',', array_fill(0, count($days), '?'));
        foreach ($this->db->all("SELECT day, source, rate_last, rate_avg FROM fx_daily WHERE source IN ('BCV','BINANCE_BUY') AND day IN ({$in})", $days) as $r) {
            $auto[(string) $r['day']][$r['source'] === 'BCV' ? 'BCV' : 'BINANCE'] = round((float) ($r['source'] === 'BCV' ? $r['rate_last'] : $r['rate_avg']), 2);
        }
        foreach ($days as $d) {
            unset($val[$d]['auto']);
            foreach (['BCV', 'BINANCE'] as $k) {
                if (isset($val[$d][$k], $auto[$d][$k]) && abs((float) $val[$d][$k] - $auto[$d][$k]) < 0.005) {
                    unset($val[$d][$k]);
                }
            }
            if (!$val[$d]) {
                unset($val[$d]);
            }
        }
        return $val;
    }

    /** Agrega a las tasas del día las que el servidor trae solo (BCV y Binance), sin pisar lo escrito a mano */
    private function mergeAutoRates(array $manual): array
    {
        foreach ($this->db->all("SELECT day, source, rate_last, rate_avg FROM fx_daily WHERE day >= ? AND source IN ('BCV','BINANCE_BUY')", [date('Y-m-d', strtotime('-400 days'))]) as $r) {
            $k = $r['source'] === 'BCV' ? 'BCV' : 'BINANCE';
            $day = (string) $r['day'];
            if (!isset($manual[$day][$k]) || !($manual[$day][$k] > 0)) {
                $manual[$day][$k] = round((float) ($k === 'BCV' ? $r['rate_last'] : $r['rate_avg']), 2);
                $manual[$day]['auto'] = true;
            }
        }
        ksort($manual);
        return $manual;
    }

    /** Vuelve a armar las tablas de clientes y gastos desde los datos guardados (después de importar) */
    public function reproject(int $orgId): void
    {
        foreach (['agora_fin_clients_v2' => 'projectClients', 'agora_fin_expenses_v2' => 'projectExpenses'] as $key => $fn) {
            $raw = $this->db->value('SELECT content FROM org_documents WHERE org_id = ? AND doc_key = ?', [$orgId, $key]);
            if ($raw !== null) {
                $this->{$fn}($orgId, json_decode((string) $raw, true));
            }
        }
    }

    private function projectClients(int $orgId, mixed $list): void
    {
        if (!is_array($list)) {
            return;
        }
        $seen = [];
        foreach ($list as $c) {
            if (!is_array($c) || empty($c['id']) || !is_scalar($c['id'])) {
                continue;
            }
            $appId = mb_substr((string) $c['id'], 0, 40);
            $opt = is_array($c['opt'] ?? null) ? $c['opt'] : [];
            $rif = isset($opt['rif']) ? Validator::rif($opt['rif']) : null;
            $seen[$appId] = true;
            $this->db->upsert('clients', [
                'org_id' => $orgId, 'app_id' => $appId, 'code' => isset($opt['cliCode']) ? mb_substr((string) $opt['cliCode'], 0, 40) : null,
                'name' => Validator::clean($c['name'] ?? 'Sin nombre', 200) ?: 'Sin nombre', 'rif' => $rif, 'rif_norm' => $rif ? str_replace('-', '', $rif) : null,
                'address' => isset($opt['dir']) ? Validator::clean($opt['dir'], 400) : null, 'email' => isset($opt['email']) ? Validator::email($opt['email']) : null,
                'phone' => isset($opt['tel']) ? Validator::clean($opt['tel'], 40) : null, 'sector' => isset($c['sector']) ? Validator::clean($c['sector'], 80) : null,
                'special_taxpayer' => !empty($opt['especial']) ? 1 : 0, 'status' => 'ACTIVO', 'created_at' => Clock::ts(), 'updated_at' => Clock::ts(), 'deleted_at' => null,
            ], ['org_id', 'app_id'], ['code', 'name', 'rif', 'rif_norm', 'address', 'email', 'phone', 'sector', 'special_taxpayer', 'updated_at', 'deleted_at']);
        }
        foreach ($this->db->all('SELECT app_id FROM clients WHERE org_id = ? AND deleted_at IS NULL', [$orgId]) as $r) {
            if (!isset($seen[(string) $r['app_id']])) {
                $this->db->update('clients', ['deleted_at' => Clock::ts(), 'status' => 'BAJA'], ['org_id' => $orgId, 'app_id' => $r['app_id']]);
            }
        }
    }

    private function projectExpenses(int $orgId, mixed $list): void
    {
        if (!is_array($list)) {
            return;
        }
        $seen = [];
        foreach ($list as $e) {
            if (!is_array($e) || empty($e['id']) || !is_scalar($e['id'])) {
                continue;
            }
            $period = Validator::period($e['period'] ?? substr((string) ($e['date'] ?? ''), 0, 7));
            $amount = Validator::cents($e['amount'] ?? null);
            if (!$period || $amount === null) {
                continue;
            }
            $appId = mb_substr((string) $e['id'], 0, 60);
            $seen[$appId] = true;
            $cur = strtoupper((string) ($e['currency'] ?? 'USD'));
            $this->db->upsert('expenses', [
                'org_id' => $orgId, 'app_id' => $appId, 'period' => $period, 'spent_on' => Validator::date($e['date'] ?? ''), 'category' => mb_substr(Validator::clean($e['category'] ?? 'otros', 40), 0, 40) ?: 'otros',
                'concept' => Validator::clean($e['concept'] ?? '', 200), 'amount_cents' => $amount, 'currency' => in_array($cur, ['USD', 'USDT', 'VES', 'EUR'], true) ? $cur : 'USD',
                'payee' => isset($e['payee']) ? Validator::clean($e['payee'], 160) : null, 'source' => isset($e['source']) ? mb_substr((string) $e['source'], 0, 20) : null, 'updated_at' => Clock::ts(),
            ], ['org_id', 'app_id'], ['period', 'spent_on', 'category', 'concept', 'amount_cents', 'currency', 'payee', 'source', 'updated_at']);
        }
        $rows = $this->db->all('SELECT app_id FROM expenses WHERE org_id = ?', [$orgId]);
        foreach ($rows as $r) {
            if (!isset($seen[(string) $r['app_id']])) {
                $this->db->exec('DELETE FROM expenses WHERE org_id = ? AND app_id = ?', [$orgId, $r['app_id']]);
            }
        }
    }
}
