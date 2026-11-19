<?php
declare(strict_types=1);

namespace Agora\Api;

use Agora\App;
use Agora\Http\HttpError;
use Agora\Http\Response;
use Agora\Http\Router;
use Agora\Security\Roles;
use Agora\Security\SessionManager;

/** Datos de la app (lo que la edición local guardaba en el navegador) y la auditoría. */
final class Data
{
    public static function routes(Router $r, App $app): void
    {
        $r->add('GET', '/api/v1/datos', fn (Ctx $c) => self::get($c), ['perm' => 'datos.leer']);
        $r->add('PUT', '/api/v1/datos', fn (Ctx $c) => self::put($c), ['perm' => 'datos.leer']);
        $r->add('GET', '/api/v1/auditoria', fn (Ctx $c) => self::audit($c), ['perm' => 'auditoria.ver']);
        $r->add('GET', '/api/v1/auditoria/verificar', fn (Ctx $c) => self::auditVerify($c), ['perm' => 'auditoria.ver', 'rate' => ['auditoria:verificar:{user}', 20, 3600]]);
    }

    private static function etag(Ctx $c): string
    {
        $orgId = $c->orgId();
        $ver = (int) $c->app->db->value('SELECT data_version FROM organizations WHERE id = ?', [$orgId]);
        $prefs = (string) $c->app->db->value('SELECT MAX(updated_at) FROM user_prefs WHERE user_id = ?', [$c->userId()]);
        return 'W/"d' . $orgId . '-' . $ver . '-' . substr(hash('sha256', $prefs . '|' . ($c->role() ?? '')), 0, 10) . '"';
    }

    private static function get(Ctx $c): Response
    {
        $etag = self::etag($c);
        if ($c->req->header('if-none-match') === $etag) {
            $r = new Response('', 304);
            $r->header('ETag', $etag);
            return $r;
        }
        $orgId = $c->orgId();
        $loaded = $c->app->docs->load($orgId, $c->userId());
        if (!$c->can('auditoria.ver')) {
            $loaded['datos']['agora_fin_audit'] = '[]';
        }
        $body = [
            'datos' => $loaded['datos'],
            'versiones' => $loaded['versiones'],
            'facturas' => $c->can('facturas.ver') ? $c->app->fiscal()->forClient($orgId) : [],
            'cerrados' => $c->app->periods->closed($orgId),
            'version_datos' => (int) $c->app->db->value('SELECT data_version FROM organizations WHERE id = ?', [$orgId]),
            'edicion_hasta' => SessionManager::isElevated($c->s()) ? App::iso((string) $c->s()['elevated_until']) : null,
            'permisos' => Roles::permsOf($c->role()),
        ];
        return Response::json($body)->header('ETag', $etag);
    }

    private static function put(Ctx $c): array
    {
        $d = $c->json();
        $changes = $d['cambios'] ?? null;
        $bases = $d['versiones'] ?? [];
        if (!is_array($changes) || array_is_list($changes) && $changes !== []) {
            throw HttpError::badRequest('Formato de cambios no válido.');
        }
        if (!is_array($bases)) {
            $bases = [];
        }
        $res = $c->app->docs->save($c->req, $c->s(), $changes, array_map('intval', array_filter($bases, 'is_numeric')));
        $res['version_datos'] = (int) $c->app->db->value('SELECT data_version FROM organizations WHERE id = ?', [$c->orgId()]);
        $res['etag'] = self::etag($c);
        return $res;
    }

    private static function audit(Ctx $c): array
    {
        $orgId = $c->orgId();
        $limit = max(1, min(500, (int) ($c->req->query['limite'] ?? 200)));
        $before = (int) ($c->req->query['antes'] ?? 0);
        $module = (string) ($c->req->query['modulo'] ?? '');
        $sql = 'SELECT id, user_email, role, ip, module, action, entity, entity_id, origin, grant_id, created_at FROM audit_log WHERE org_id = ?';
        $params = [$orgId];
        if ($before > 0) {
            $sql .= ' AND id < ?';
            $params[] = $before;
        }
        if ($module !== '' && preg_match('/^[a-z0-9_-]{1,40}$/', $module)) {
            $sql .= ' AND module = ?';
            $params[] = $module;
        }
        $rows = $c->app->db->all($sql . ' ORDER BY id DESC LIMIT ' . $limit, $params);
        return ['registros' => array_map(fn ($r) => [
            'id' => (int) $r['id'], 'fecha' => App::iso((string) $r['created_at']), 'usuario' => $r['user_email'] ?: 'Sistema', 'rol' => Roles::LABELS[$r['role']] ?? $r['role'], 'ip' => $r['ip'],
            'modulo' => $r['module'], 'accion' => $r['action'], 'origen' => $r['origin'], 'con_codigo' => $r['grant_id'] !== null,
        ], $rows), 'siguiente' => count($rows) === $limit ? (int) end($rows)['id'] : null];
    }

    private static function auditVerify(Ctx $c): array
    {
        $r = $c->app->audit->verify($c->orgId());
        if (!$r['ok']) {
            $c->app->alerts->event('AUDITORIA_ROTA', 'CRITICA', $c->req->ip, $c->req->method, $c->req->path, $c->req->userAgent(), $r, $c->orgId(), $c->userId());
        }
        return ['integra' => $r['ok'], 'registros' => $r['total'], 'primer_error' => $r['primer_error']];
    }
}
