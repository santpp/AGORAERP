<?php
declare(strict_types=1);

namespace Agora\Api;

use Agora\App;
use Agora\Fiscal\LibroVentas;
use Agora\Http\HttpError;
use Agora\Http\Response;
use Agora\Http\Router;
use Agora\Notify\Templates;
use Agora\Security\Headers;
use Agora\Security\Validator;

/** Facturación fiscal: datos fiscales, números de control, borradores, emisión, anulación, notas y libro de ventas. */
final class FiscalApi
{
    public static function routes(Router $r, App $app): void
    {
        $r->add('GET', '/api/v1/fiscal/perfil', fn (Ctx $c) => $c->app->fiscal()->profileOut($c->orgId()), ['perm' => 'facturas.ver']);
        $r->add('PUT', '/api/v1/fiscal/perfil', fn (Ctx $c) => self::saveProfile($c), ['perm' => 'fiscal.configurar']);
        $r->add('GET', '/api/v1/fiscal/rangos', fn (Ctx $c) => ['rangos' => $c->app->fiscal()->ranges($c->orgId())], ['perm' => 'facturas.ver']);
        $r->add('POST', '/api/v1/fiscal/rangos', fn (Ctx $c) => self::addRange($c), ['perm' => 'fiscal.configurar']);
        $r->add('POST', '/api/v1/fiscal/rangos/{id}/anular', fn (Ctx $c) => self::annulRange($c), ['perm' => 'fiscal.configurar']);
        $r->add('GET', '/api/v1/fiscal/verificar', fn (Ctx $c) => $c->app->fiscal()->verifyChain($c->orgId()), ['perm' => 'facturas.ver', 'rate' => ['fiscal:verificar:{user}', 20, 3600]]);
        $r->add('GET', '/api/v1/facturas', fn (Ctx $c) => $c->app->fiscal()->list($c->orgId(), $c->req->query), ['perm' => 'facturas.ver']);
        $r->add('POST', '/api/v1/facturas', fn (Ctx $c) => self::create($c), ['perm' => 'facturas.emitir', 'rate' => ['facturas:crear:{user}', 120, 3600]]);
        $r->add('GET', '/api/v1/facturas/{uid}', fn (Ctx $c) => $c->app->fiscal()->get($c->orgId(), $c->param('uid')), ['perm' => 'facturas.ver']);
        $r->add('PUT', '/api/v1/facturas/{uid}', fn (Ctx $c) => $c->app->fiscal()->updateDraft($c->orgId(), $c->param('uid'), $c->json()), ['perm' => 'facturas.emitir']);
        $r->add('DELETE', '/api/v1/facturas/{uid}', fn (Ctx $c) => self::delete($c), ['perm' => 'facturas.emitir']);
        $r->add('POST', '/api/v1/facturas/{uid}/emitir', fn (Ctx $c) => self::emit($c), ['perm' => 'facturas.emitir', 'rate' => ['facturas:emitir:{user}', 60, 300]]);
        $r->add('POST', '/api/v1/facturas/{uid}/control', fn (Ctx $c) => self::control($c), ['perm' => 'facturas.emitir']);
        $r->add('POST', '/api/v1/facturas/{uid}/anular', fn (Ctx $c) => self::annul($c), ['perm' => 'facturas.anular']);
        $r->add('POST', '/api/v1/facturas/{uid}/nota', fn (Ctx $c) => self::note($c), ['perm' => 'facturas.emitir']);
        $r->add('GET', '/api/v1/facturas/{uid}/representacion', fn (Ctx $c) => self::representation($c), ['perm' => 'facturas.ver']);
        $r->add('GET', '/api/v1/libro-ventas', fn (Ctx $c) => self::book($c), ['perm' => 'libro.ventas']);
    }

    private static function saveProfile(Ctx $c): array
    {
        $orgId = $c->orgId();
        $f = $c->app->fiscal();
        $before = $f->profile($orgId);
        $g = null;
        // con documentos ya emitidos, los datos fiscales solo cambian con código
        if ($before && (int) $c->app->db->value("SELECT COUNT(*) FROM fiscal_documents WHERE org_id = ? AND status <> 'BORRADOR' AND legacy = 0", [$orgId]) > 0) {
            $g = $c->app->stepUp->require($c->req, $c->s(), 'PERFIL_FISCAL', 'fiscal:perfil');
        }
        $out = $f->saveProfile($orgId, $c->json(), $c->userId());
        $changed = [];
        if ($before) {
            foreach (['legal_name' => 'razón social', 'rif' => 'RIF', 'fiscal_address' => 'domicilio', 'issuance_mode' => 'modo de emisión', 'series' => 'serie', 'printer_name' => 'imprenta', 'iva_general_bp' => 'IVA general', 'igtf_enabled' => 'IGTF'] as $k => $label) {
                $now = $f->profile($orgId)[$k] ?? null;
                if ((string) ($before[$k] ?? '') !== (string) $now) {
                    $changed[] = $label;
                }
            }
        }
        $c->audit('facturacion', $before ? 'cambió los datos fiscales de la empresa' . ($changed ? ' (' . implode(', ', $changed) . ')' : '') : 'configuró los datos fiscales de la empresa', 'perfil_fiscal', null, null, $g ? (string) $g['id'] : null);
        if ($before && $changed) {
            $c->app->alerts->org($orgId, 'Cambiaron los datos fiscales', 'Se cambiaron los datos fiscales de la empresa', '<p>' . Templates::e((string) $c->s()['name']) . ' cambió: ' . Templates::e(implode(', ', $changed)) . '. Los documentos ya emitidos no cambian; aplica a los nuevos.</p>');
        }
        return $out;
    }

    private static function addRange(Ctx $c): array
    {
        $g = $c->app->stepUp->require($c->req, $c->s(), 'RANGO_CONTROL', 'fiscal:rangos');
        $d = $c->json();
        $res = $c->app->fiscal()->addRange($c->orgId(), $d, $c->userId());
        $c->audit('facturacion', sprintf('registró números de control de la imprenta: %s-%s al %s-%s', $d['prefijo'] ?? '00', str_pad((string) ($d['desde'] ?? ''), 8, '0', STR_PAD_LEFT), $d['prefijo'] ?? '00', str_pad((string) ($d['hasta'] ?? ''), 8, '0', STR_PAD_LEFT)), 'rango_control', (string) $res['id'], null, (string) $g['id']);
        return $res;
    }

    private static function annulRange(Ctx $c): array
    {
        $g = $c->app->stepUp->require($c->req, $c->s(), 'RANGO_CONTROL', 'fiscal:rangos');
        $c->app->fiscal()->annulRange($c->orgId(), (int) $c->param('id'));
        $c->audit('facturacion', 'anuló un rango de números de control sin usar', 'rango_control', $c->param('id'), null, (string) $g['id']);
        return ['rangos' => $c->app->fiscal()->ranges($c->orgId())];
    }

    private static function create(Ctx $c): array
    {
        $doc = $c->app->fiscal()->createDraft($c->orgId(), $c->json(), $c->userId());
        $c->audit('facturacion', 'creó un borrador de factura para ' . ($doc['cliente']['nombre'] ?: 'un cliente'), 'documento_fiscal', (string) $doc['uid']);
        return $doc;
    }

    private static function delete(Ctx $c): array
    {
        $c->app->fiscal()->deleteDraft($c->orgId(), $c->param('uid'));
        $c->audit('facturacion', 'borró un borrador de factura', 'documento_fiscal', $c->param('uid'));
        return ['ok' => true];
    }

    private static function emit(Ctx $c): array
    {
        return $c->app->fiscal()->emit($c->orgId(), $c->param('uid'), $c->actor());
    }

    private static function control(Ctx $c): array
    {
        $d = $c->json();
        return $c->app->fiscal()->assignControl($c->orgId(), $c->param('uid'), (string) ($d['numero_control'] ?? ''), isset($d['asignado']) && $d['asignado'] !== '' ? (string) $d['asignado'] : null, $c->actor());
    }

    private static function annul(Ctx $c): array
    {
        $uid = $c->param('uid');
        $g = $c->app->stepUp->require($c->req, $c->s(), 'FACTURA_ANULAR', 'documento:' . $uid, true);
        $doc = $c->app->fiscal()->annul($c->orgId(), $uid, (string) $g['reason'], $c->actor(), (string) $g['id']);
        $c->app->alerts->org($c->orgId(), 'Documento fiscal anulado', 'Se anuló un documento fiscal', '<p>' . Templates::e((string) $c->s()['name']) . ' anuló ' . Templates::e(mb_strtolower((string) $doc['titulo'])) . ' N.° <b>' . Templates::e((string) $doc['numero_texto']) . '</b> (' . Templates::e((string) $doc['cliente']['nombre']) . ').</p><p>Motivo: ' . Templates::e((string) $g['reason']) . '</p>');
        return $doc;
    }

    private static function note(Ctx $c): array
    {
        $uid = $c->param('uid');
        $d = $c->json();
        $type = strtoupper((string) ($d['tipo'] ?? 'NC'));
        if (!in_array($type, ['NC', 'ND'], true)) {
            throw HttpError::badRequest('Indica si es nota de crédito (NC) o de débito (ND).');
        }
        $g = $c->app->stepUp->require($c->req, $c->s(), 'NOTA_EMITIR', 'documento:' . $uid, true);
        return $c->app->fiscal()->note($c->orgId(), $uid, $type, $d, (string) $g['reason'], $c->actor(), (string) $g['id']);
    }

    private static function representation(Ctx $c): Response
    {
        $html = $c->app->fiscal()->representation($c->orgId(), $c->param('uid'), !empty($c->req->query['copia']));
        $r = Response::html($html);
        Headers::document($r);
        $r->header('X-Frame-Options', 'SAMEORIGIN');
        return $r;
    }

    private static function book(Ctx $c): Response|array
    {
        $p = Validator::period($c->req->query['periodo'] ?? '');
        if (!$p) {
            throw HttpError::badRequest('Indica el mes (AAAA-MM).');
        }
        $orgId = $c->orgId();
        $book = LibroVentas::build($c->app->db, $orgId, $p);
        if (($c->req->query['formato'] ?? 'json') === 'csv') {
            $c->audit('facturacion', 'descargó el libro de ventas de ' . $p);
            $prof = $c->app->fiscal()->profile($orgId) ?? [];
            return Response::text(LibroVentas::csv($book, $prof), 200, 'text/csv; charset=utf-8')
                ->header('Content-Disposition', 'attachment; filename="libro-de-ventas-' . $p . '.csv"');
        }
        return $book + ['columnas' => LibroVentas::COLUMNS];
    }
}
