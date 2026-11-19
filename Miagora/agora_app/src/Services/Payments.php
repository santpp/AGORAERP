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
 * Cobros. La app manda su lista de pagos (pagos_v1); el servidor compara contra lo registrado:
 *  · nuevos → se validan (factura existente, fecha, montos, tasa, referencia única) y se registran;
 *  · quitados → se REVIERTEN, solo con verificación OTP (COBRO_REVERTIR) y permiso;
 *  · modificados → se rechazan (un cobro registrado no se edita).
 * Si el mes del cobro está cerrado, hace falta además la verificación DATOS_CERRADOS.
 */
final class Payments
{
    private const METHODS = ['BINANCE' => 'USDT', 'PAYPAL' => 'USD', 'ZELLE' => 'USD', 'CASH' => 'USD', 'VES' => 'VES', 'RET_IVA' => 'VES'];
    private const CORE = ['invId', 'date', 'method', 'amount', 'fee', 'rate', 'ref'];

    public function __construct(private Db $db, private Periods $periods, private StepUp $stepUp, private Audit $audit)
    {
    }

    /** Lista para la app (solo cobros vigentes), con los campos que agrega el servidor */
    public function forClient(int $orgId): array
    {
        $out = [];
        foreach ($this->db->all("SELECT payload, igtf_cents, rate_bcv FROM payments WHERE org_id = ? AND status = 'REGISTRADO' ORDER BY paid_on, id", [$orgId]) as $r) {
            $p = json_decode((string) $r['payload'], true) ?: [];
            $p['igtf'] = round((int) $r['igtf_cents'] / 100, 2);
            $out[] = $p;
        }
        return $out;
    }

    /**
     * @param list<array{accion:string,alcance:list<string>,motivo:bool}> $locks se agregan los bloqueos que exigen OTP
     * @return list<array<string,mixed>> cambios a aplicar (se ejecutan después si no hay bloqueos)
     */
    public function plan(Request $req, array $s, mixed $incoming, array &$locks): array
    {
        if (!is_array($incoming) || !array_is_list($incoming)) {
            throw HttpError::badRequest('La lista de cobros no tiene el formato esperado.');
        }
        $orgId = (int) $s['org_id'];
        $current = [];
        foreach ($this->db->all('SELECT id, app_id, status, payload, paid_on, period FROM payments WHERE org_id = ?', [$orgId]) as $r) {
            $current[(string) $r['app_id']] = $r;
        }
        $inc = [];
        foreach ($incoming as $p) {
            if (!is_array($p) || !isset($p['id']) || !is_string($p['id']) || !preg_match('/^[A-Za-z0-9_.-]{3,40}$/', $p['id'])) {
                throw HttpError::badRequest('Hay un cobro sin identificador válido.');
            }
            $inc[$p['id']] = $p;
        }
        $ops = [];
        $closed = [];
        $removed = [];
        foreach ($current as $appId => $row) {
            if ($row['status'] !== 'REGISTRADO') {
                continue;
            }
            if (!isset($inc[$appId])) {
                $removed[] = $appId;
                if ($this->periods->isClosed($orgId, (string) $row['period'])) {
                    $closed[(string) $row['period']] = true;
                }
                continue;
            }
            $old = json_decode((string) $row['payload'], true) ?: [];
            foreach (self::CORE as $f) {
                if (self::norm($f, $old[$f] ?? null) !== self::norm($f, $inc[$appId][$f] ?? null)) {
                    throw new HttpError(409, 'COBRO_INMUTABLE', 'Un cobro registrado no se modifica. Reviértelo (con verificación) y regístralo de nuevo.', ['cobro' => $appId]);
                }
            }
        }
        foreach ($inc as $appId => $p) {
            if (isset($current[$appId])) {
                if ($current[$appId]['status'] === 'REVERTIDO') {
                    throw new HttpError(409, 'COBRO_REVERTIDO', 'Ese cobro ya fue revertido. Recarga la página.', ['cobro' => $appId]);
                }
                continue;
            }
            $op = $this->validateNew($orgId, $p);
            if ($this->periods->isClosed($orgId, $op['period'])) {
                $closed[$op['period']] = true;
            }
            $ops[] = ['type' => 'add', 'data' => $op];
        }
        if ($removed) {
            if (!Roles::can($s['role'] ?? null, 'pagos.revertir')) {
                throw HttpError::forbidden('Solo Dirección o un Superadministrador pueden revertir cobros.');
            }
            $scope = 'cobro:' . implode(',', $removed);
            $g = $this->stepUp->find($req, $s, 'COBRO_REVERTIR', $scope);
            if (!$g) {
                $locks[] = ['accion' => 'COBRO_REVERTIR', 'alcance' => $scope, 'motivo' => true];
            } else {
                foreach ($removed as $appId) {
                    $ops[] = ['type' => 'revert', 'app_id' => $appId, 'reason' => (string) ($g['reason'] ?: 'Revertido desde la app'), 'grant' => (string) $g['id']];
                }
            }
        }
        if ($ops && !Roles::can($s['role'] ?? null, 'pagos.registrar')) {
            throw HttpError::forbidden('Tu rol no permite registrar cobros.');
        }
        if ($closed) {
            $scope = 'periodo:' . implode(',', array_keys($closed));
            if (!$this->stepUp->find($req, $s, 'DATOS_CERRADOS', $scope)) {
                $locks[] = ['accion' => 'DATOS_CERRADOS', 'alcance' => $scope, 'motivo' => true];
            }
        }
        return $ops;
    }

    /** Ejecuta lo planificado (dentro de la transacción de guardado) */
    public function apply(array $s, array $ops): int
    {
        $orgId = (int) $s['org_id'];
        $actor = ['user_id' => (int) $s['user_id'], 'email' => $s['email'], 'role' => $s['role'], 'ip' => $s['ip'] ?? ''];
        $n = 0;
        foreach ($ops as $op) {
            if ($op['type'] === 'add') {
                $d = $op['data'];
                try {
                    $this->db->insert('payments', $d + ['org_id' => $orgId, 'created_by' => (int) $s['user_id'], 'created_at' => Clock::ts(), 'status' => 'REGISTRADO', 'reverted_by' => null, 'reverted_at' => null, 'revert_reason' => null]);
                } catch (\PDOException $e) {
                    if (Db::isDuplicate($e)) {
                        throw new HttpError(409, 'REFERENCIA_REPETIDA', 'Esa referencia de pago ya está registrada en otro cobro.', ['referencia' => $d['reference']]);
                    }
                    throw $e;
                }
                if ($d['fx_quote_id'] !== null) {
                    // la cotización se usa una sola vez y queda ligada al cobro
                    $this->db->exec("UPDATE fx_quotes SET used_at = ?, used_entity = 'cobro', used_entity_id = ? WHERE id = ? AND used_at IS NULL", [Clock::ts(), $d['app_id'], $d['fx_quote_id']]);
                }
                $rateTxt = $d['rate'] !== null ? ' a ' . number_format((float) $d['rate'], 2, ',', '.') . ' Bs/US$' . ($d['fx_quote_id'] !== null ? ' (tasa congelada, cotización ' . substr($d['fx_quote_id'], -8) . ')' : ' (tasa escrita a mano)') : '';
                $this->audit->log($orgId, $actor, 'facturacion', sprintf('registró un cobro de %s por %s (%s%s) · ref. %s', $d['invoice_ref'], number_format($d['usd_cents'] / 100, 2, ',', '.') . ' US$', $d['method'], $rateTxt, $d['reference']), 'cobro', $d['app_id'], ['monto' => $d['amount_cents'], 'moneda' => $d['currency'], 'igtf' => $d['igtf_cents'], 'cotizacion' => $d['fx_quote_id']]);
            } else {
                $row = $this->db->one('SELECT id, invoice_ref, reference, usd_cents FROM payments WHERE org_id = ? AND app_id = ?', [$orgId, $op['app_id']]);
                $this->db->exec("UPDATE payments SET status = 'REVERTIDO', reference_active = NULL, reverted_by = ?, reverted_at = ?, revert_reason = ? WHERE org_id = ? AND app_id = ? AND status = 'REGISTRADO'", [(int) $s['user_id'], Clock::ts(), mb_substr($op['reason'], 0, 400), $orgId, $op['app_id']]);
                $this->audit->log($orgId, $actor, 'facturacion', sprintf('revirtió el cobro de %s · ref. %s · motivo: %s', $row['invoice_ref'] ?? '', $row['reference'] ?? '', $op['reason']), 'cobro', $op['app_id'], null, 'SERVIDOR', $op['grant']);
            }
            $n++;
        }
        return $n;
    }

    /**
     * Importa cobros de la edición local (respaldo). Cada uno pasa las mismas validaciones que un cobro nuevo;
     * los que no cuadran se informan y no se cargan.
     * @return array{agregados:int,omitidos:list<string>}
     */
    public function importList(int $orgId, array $list, array $actor): array
    {
        $added = 0;
        $skipped = [];
        foreach ($list as $p) {
            if (!is_array($p) || !isset($p['id']) || !is_string($p['id']) || !preg_match('/^[A-Za-z0-9_.-]{3,40}$/', $p['id'])) {
                $skipped[] = 'cobro sin identificador válido';
                continue;
            }
            if ($this->db->value('SELECT 1 FROM payments WHERE org_id = ? AND app_id = ?', [$orgId, $p['id']])) {
                continue; // ya importado
            }
            try {
                $d = $this->validateNew($orgId, $p);
                $this->db->transaction(fn () => $this->db->insert('payments', $d + ['org_id' => $orgId, 'created_by' => $actor['user_id'] ?? null, 'created_at' => Clock::ts(), 'status' => 'REGISTRADO', 'reverted_by' => null, 'reverted_at' => null, 'revert_reason' => null]));
                $added++;
            } catch (HttpError $e) {
                $skipped[] = ($p['invId'] ?? '?') . ' · ' . ($p['ref'] ?? '') . ': ' . $e->getMessage();
            } catch (\PDOException $e) {
                if (!Db::isDuplicate($e)) {
                    throw $e;
                }
                $skipped[] = ($p['invId'] ?? '?') . ': referencia repetida (' . ($p['ref'] ?? '') . ')';
            }
        }
        return ['agregados' => $added, 'omitidos' => $skipped];
    }

    /** @return array<string,mixed> fila para la tabla payments */
    private function validateNew(int $orgId, array $p): array
    {
        $method = strtoupper((string) ($p['method'] ?? ''));
        if (!isset(self::METHODS[$method])) {
            throw HttpError::badRequest('Método de cobro no válido.');
        }
        $date = Validator::date($p['date'] ?? '');
        if (!$date) {
            throw HttpError::badRequest('La fecha del cobro no es válida.');
        }
        if (strcmp($date, Clock::today()) > 0) {
            throw HttpError::badRequest('La fecha del cobro no puede ser futura.');
        }
        $invId = Validator::clean($p['invId'] ?? '', 40);
        $doc = $this->findInvoice($orgId, $invId);
        if ($doc === false) {
            throw HttpError::badRequest("No existe la factura {$invId}.");
        }
        if (is_array($doc) && $doc['issue_date'] && strcmp($date, (string) $doc['issue_date']) < 0) {
            throw HttpError::badRequest('El cobro no puede ser anterior a la emisión de la factura.');
        }
        if (is_array($doc) && $doc['status'] === 'ANULADA') {
            throw HttpError::badRequest('Esa factura está anulada.');
        }
        $amount = Validator::cents($p['amount'] ?? null);
        if (!$amount || $amount <= 0) {
            throw HttpError::badRequest('El monto del cobro debe ser mayor que cero.');
        }
        $rate = null;
        if ($method === 'VES' || $method === 'RET_IVA') {
            $rate = Validator::rate($p['rate'] ?? null);
            if (!$rate) {
                throw HttpError::badRequest('Indica la tasa (Bs por US$) del cobro en bolívares.');
            }
            $usd = (int) round($amount / $rate);
        } else {
            $usd = $amount;
        }
        $clientUsd = Validator::cents($p['usd'] ?? null);
        if ($clientUsd !== null && abs($clientUsd - $usd) > 2) {
            throw HttpError::badRequest('El equivalente en US$ no cuadra con el monto y la tasa. Recarga la página.');
        }
        $fee = Validator::cents($p['fee'] ?? 0) ?? 0;
        if ($fee < 0 || $fee >= $usd) {
            throw HttpError::badRequest('La comisión debe ser menor que el monto recibido.');
        }
        $ref = Validator::clean($p['ref'] ?? '', 80);
        if (mb_strlen($ref) < 3) {
            throw HttpError::badRequest('La referencia del pago es obligatoria (mínimo 3 caracteres).');
        }
        // cotización congelada (POST /tasas/cotizar): vale solo si es de esta empresa, no se usó, no venció y la tasa es la misma
        $quoteId = null;
        if ($rate !== null && isset($p['fxQuote']) && is_string($p['fxQuote']) && preg_match('/^[0-9A-Z]{26}$/', $p['fxQuote'])) {
            $q = $this->db->one('SELECT rate, expires_at, used_at FROM fx_quotes WHERE id = ? AND org_id = ?', [$p['fxQuote'], $orgId]);
            if ($q && $q['used_at'] === null && strcmp((string) $q['expires_at'], Clock::ts()) >= 0 && abs((float) $q['rate'] - $rate) < 0.00005) {
                $quoteId = $p['fxQuote'];
            }
        }
        $prof = $this->db->one('SELECT igtf_enabled, igtf_bp FROM fiscal_profiles WHERE org_id = ?', [$orgId]);
        $igtf = ($prof && (int) $prof['igtf_enabled'] === 1 && !in_array($method, ['VES', 'RET_IVA'], true)) ? (int) round($usd * (int) $prof['igtf_bp'] / 10000) : 0;
        $payload = $p;
        if ($quoteId === null) {
            unset($payload['fxQuote']);
        }
        $payload['usd'] = round($usd / 100, 2);
        $payload['igtf'] = round($igtf / 100, 2);
        return [
            'app_id' => (string) $p['id'], 'document_id' => is_array($doc) ? (int) $doc['id'] : null, 'invoice_ref' => $invId, 'paid_on' => $date, 'period' => substr($date, 0, 7),
            'method' => $method, 'currency' => self::METHODS[$method], 'amount_cents' => $amount, 'usd_cents' => $usd, 'fee_cents' => $fee, 'rate' => $rate,
            'rate_type' => isset($p['rateType']) ? mb_substr(strtoupper((string) $p['rateType']), 0, 10) : null, 'rate_bcv' => Validator::rate($p['rateBcv'] ?? null),
            'fx_quote_id' => $quoteId,
            'igtf_cents' => $igtf, 'reference' => $ref, 'reference_active' => self::normRef($ref), 'payer' => isset($p['payer']) ? Validator::clean($p['payer'], 160) : null,
            'settle' => !empty($p['settle']) ? 1 : 0, 'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ];
    }

    /** @return array<string,mixed>|null|false documento fiscal, null si es factura histórica de la app, false si no existe */
    private function findInvoice(int $orgId, string $invId): array|null|false
    {
        if (preg_match('/^(FAC|NC|ND)-(?:([A-Z]{1,4})-)?(\d{1,12})$/', $invId, $m)) {
            $d = $this->db->one('SELECT id, issue_date, status FROM fiscal_documents WHERE org_id = ? AND doc_type = ? AND series = ? AND number = ? ORDER BY legacy LIMIT 1', [$orgId, $m[1], $m[2], (int) $m[3]]);
            if ($d) {
                return $d;
            }
        }
        $raw = $this->db->value('SELECT content FROM org_documents WHERE org_id = ? AND doc_key = ?', [$orgId, 'agora_fin_imported_v1']);
        foreach (json_decode((string) $raw, true) ?: [] as $inv) {
            if (is_array($inv) && ($inv['id'] ?? null) === $invId) {
                return null;
            }
        }
        return false;
    }

    private static function norm(string $field, mixed $v): mixed
    {
        return match ($field) {
            'amount', 'fee' => Validator::cents($v ?? 0) ?? 0,
            'rate' => $v === null || $v === '' ? null : Validator::rate($v),
            default => is_scalar($v) ? (string) $v : null,
        };
    }

    public static function normRef(string $ref): string
    {
        $s = mb_strtolower($ref);
        if (class_exists(\Normalizer::class)) {
            $s = (string) preg_replace('/\p{Mn}/u', '', \Normalizer::normalize($s, \Normalizer::FORM_D) ?: $s);
        }
        return mb_substr(trim((string) preg_replace('/\s+/', ' ', $s)), 0, 80);
    }
}
