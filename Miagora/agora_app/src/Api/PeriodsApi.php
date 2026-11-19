<?php
declare(strict_types=1);

namespace Agora\Api;

use Agora\App;
use Agora\Core\Clock;
use Agora\Http\HttpError;
use Agora\Http\Router;
use Agora\Notify\Templates;
use Agora\Security\Validator;

/**
 * Cierre de mes. Un mes cerrado no se puede cambiar sin un código (OTP) y queda una "foto" de cómo estaba.
 * Reabrir es solo del Superadministrador, con código, motivo y aviso por correo a los administradores.
 */
final class PeriodsApi
{
    public static function routes(Router $r, App $app): void
    {
        $r->add('GET', '/api/v1/periodos', fn (Ctx $c) => self::list($c), ['perm' => 'datos.leer']);
        $r->add('POST', '/api/v1/periodos/{periodo}/cerrar', fn (Ctx $c) => self::close($c), ['perm' => 'periodos.cerrar']);
        $r->add('POST', '/api/v1/periodos/{periodo}/reabrir', fn (Ctx $c) => self::reopen($c), ['perm' => 'periodos.reabrir']);
    }

    private static function period(Ctx $c): string
    {
        $p = Validator::period($c->param('periodo'));
        if (!$p) {
            throw HttpError::badRequest('Mes no válido (usa AAAA-MM).');
        }
        return $p;
    }

    private static function list(Ctx $c): array
    {
        $orgId = $c->orgId();
        $cur = substr(Clock::today(), 0, 7);
        return [
            'periodos' => array_map(fn ($r) => [
                'periodo' => $r['period'], 'estado' => $r['status'], 'cerrado_en' => App::iso($r['closed_at']), 'reabierto_en' => App::iso($r['reopened_at']), 'motivo_reapertura' => $r['reopen_reason'],
            ], $c->app->periods->list($orgId)),
            'cerrados' => $c->app->periods->closed($orgId),
            'mes_actual' => $cur,
        ];
    }

    /** Foto del mes al cerrarlo: huellas de los datos y totales de lo fiscal y lo cobrado */
    private static function snapshot(Ctx $c, int $orgId, string $p): array
    {
        $docs = [];
        foreach ($c->app->db->all('SELECT doc_key, content, version FROM org_documents WHERE org_id = ? ORDER BY doc_key', [$orgId]) as $r) {
            $docs[(string) $r['doc_key']] = ['version' => (int) $r['version'], 'sha256' => hash('sha256', (string) $r['content'])];
        }
        $like = $p . '%';
        $fis = $c->app->db->one("SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN doc_type = 'NC' THEN -total_cents ELSE total_cents END), 0) AS t FROM fiscal_documents WHERE org_id = ? AND status = 'EMITIDA' AND issue_date LIKE ?", [$orgId, $like]) ?? ['n' => 0, 't' => 0];
        $pay = $c->app->db->one("SELECT COUNT(*) AS n, COALESCE(SUM(usd_cents), 0) AS t FROM payments WHERE org_id = ? AND status = 'REGISTRADO' AND period = ?", [$orgId, $p]) ?? ['n' => 0, 't' => 0];
        return ['periodo' => $p, 'tomada' => Clock::ts(), 'documentos' => $docs, 'fiscal' => ['documentos' => (int) $fis['n'], 'total_cents' => (int) $fis['t']], 'cobros' => ['cantidad' => (int) $pay['n'], 'usd_cents' => (int) $pay['t']]];
    }

    private static function close(Ctx $c): array
    {
        $orgId = $c->orgId();
        $p = self::period($c);
        if (strcmp($p, substr(Clock::today(), 0, 7)) >= 0) {
            throw HttpError::badRequest('Solo se pueden cerrar meses que ya terminaron.');
        }
        if ($c->app->periods->isClosed($orgId, $p)) {
            throw new HttpError(409, 'YA_CERRADO', 'Ese mes ya está cerrado.');
        }
        $drafts = (int) $c->app->db->value("SELECT COUNT(*) FROM fiscal_documents WHERE org_id = ? AND status = 'BORRADOR' AND created_at LIKE ?", [$orgId, $p . '%']);
        $pendingCtrl = (int) $c->app->db->value("SELECT COUNT(*) FROM fiscal_documents WHERE org_id = ? AND status = 'EMITIDA' AND legacy = 0 AND control_number IS NULL AND issue_date LIKE ?", [$orgId, $p . '%']);
        if ($pendingCtrl > 0) {
            throw new HttpError(409, 'CONTROL_PENDIENTE', "Hay {$pendingCtrl} documento(s) de ese mes sin número de control de la imprenta digital. Regístralos antes de cerrar.");
        }
        $g = $c->app->stepUp->require($c->req, $c->s(), 'PERIODO_CERRAR', 'periodo:' . $p);
        $c->app->db->transaction(function () use ($c, $orgId, $p, $g) {
            $c->app->periods->close($orgId, $p, $c->userId(), self::snapshot($c, $orgId, $p));
            $c->app->db->exec('UPDATE organizations SET data_version = data_version + 1, updated_at = ? WHERE id = ?', [Clock::ts(), $orgId]);
            $c->audit('periodos', 'cerró el mes ' . $p . ' (desde ahora, cambiarlo exige código)', 'periodo', $p, null, (string) $g['id']);
        });
        $c->app->alerts->org($orgId, 'Mes cerrado: ' . $p, 'Se cerró el mes ' . $p, '<p>' . Templates::e((string) $c->s()['name']) . ' cerró el mes <b>' . Templates::e($p) . '</b>. Desde ahora, cualquier cambio en sus datos exige un código de verificación y queda en la auditoría.</p>');
        return ['ok' => true, 'periodo' => $p, 'borradores' => $drafts, 'cerrados' => $c->app->periods->closed($orgId)];
    }

    private static function reopen(Ctx $c): array
    {
        $orgId = $c->orgId();
        $p = self::period($c);
        if (!$c->app->periods->isClosed($orgId, $p)) {
            throw new HttpError(409, 'NO_CERRADO', 'Ese mes no está cerrado.');
        }
        $g = $c->app->stepUp->require($c->req, $c->s(), 'PERIODO_REABRIR', 'periodo:' . $p, true);
        $reason = (string) $g['reason'];
        $c->app->db->transaction(function () use ($c, $orgId, $p, $g, $reason) {
            $c->app->periods->reopen($orgId, $p, $c->userId(), $reason);
            $c->app->db->exec('UPDATE organizations SET data_version = data_version + 1, updated_at = ? WHERE id = ?', [Clock::ts(), $orgId]);
            $c->audit('periodos', 'reabrió el mes ' . $p . ' · motivo: ' . $reason, 'periodo', $p, null, (string) $g['id']);
        });
        $c->app->alerts->event('MES_REABIERTO', 'MEDIA', $c->req->ip, $c->req->method, $c->req->path, $c->req->userAgent(), ['periodo' => $p, 'motivo' => $reason], $orgId, $c->userId(), false);
        $c->app->alerts->org($orgId, 'Atención: se reabrió el mes ' . $p, 'Se reabrió un mes cerrado', '<p>' . Templates::e((string) $c->s()['name']) . ' reabrió el mes <b>' . Templates::e($p) . '</b>.</p><p>Motivo: ' . Templates::e($reason) . '</p><p>Si no lo autorizaste, revisa la auditoría y ciérralo de nuevo.</p>');
        return ['ok' => true, 'periodo' => $p, 'cerrados' => $c->app->periods->closed($orgId)];
    }
}
