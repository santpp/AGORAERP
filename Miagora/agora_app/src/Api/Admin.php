<?php
declare(strict_types=1);

namespace Agora\Api;

use Agora\App;
use Agora\Http\Response;
use Agora\Http\Router;
use Agora\Notify\Templates;
use Agora\Services\Transfer;

/** Exportar e importar datos de la empresa (con código) y tareas de la plataforma (respaldos, empresas). */
final class Admin
{
    public static function routes(Router $r, App $app): void
    {
        $r->add('POST', '/api/v1/exportar', fn (Ctx $c) => self::export($c), ['perm' => 'exportar', 'rate' => ['exportar:{user}', 6, 3600]]);
        $r->add('POST', '/api/v1/importar', fn (Ctx $c) => self::import($c), ['perm' => 'importar', 'rate' => ['importar:{user}', 6, 3600]]);
        $r->add('GET', '/api/v1/plataforma/respaldos', fn (Ctx $c) => self::backups($c), ['org' => false, 'platform' => true]);
        $r->add('POST', '/api/v1/plataforma/respaldos', fn (Ctx $c) => $c->app->backup()->run('MANUAL', $c->userId()), ['org' => false, 'platform' => true, 'rate' => ['respaldo:manual', 6, 3600]]);
        $r->add('GET', '/api/v1/plataforma/empresas', fn (Ctx $c) => self::orgs($c), ['org' => false, 'platform' => true]);
    }

    private static function orgUid(Ctx $c): string
    {
        return (string) $c->app->db->value('SELECT uid FROM organizations WHERE id = ?', [$c->orgId()]);
    }

    private static function export(Ctx $c): Response
    {
        $g = $c->app->stepUp->require($c->req, $c->s(), 'EXPORTAR', 'empresa:' . self::orgUid($c));
        $data = (new Transfer($c->app))->export($c->orgId());
        $c->audit('ajustes', 'exportó todos los datos de la empresa', 'exportacion', null, null, (string) $g['id']);
        $c->app->alerts->org($c->orgId(), 'Se exportaron los datos de tu empresa', 'Exportación completa de datos', '<p>' . Templates::e((string) $c->s()['name']) . ' descargó una copia completa de los datos de la empresa (IP ' . Templates::e($c->req->ip) . ').</p><p>Si no lo autorizaste, revisa la auditoría y los accesos.</p>');
        return Response::json($data)->header('Content-Disposition', 'attachment; filename="agora-exportacion-' . date('Y-m-d') . '.json"');
    }

    private static function import(Ctx $c): array
    {
        $g = $c->app->stepUp->require($c->req, $c->s(), 'IMPORTAR', 'empresa:' . self::orgUid($c));
        $d = $c->json();
        $backup = is_array($d['respaldo'] ?? null) ? $d['respaldo'] : $d;
        return (new Transfer($c->app))->import($c->orgId(), $backup, $c->actor(), (string) $g['id']);
    }

    private static function backups(Ctx $c): array
    {
        return ['respaldos' => array_map(fn ($r) => [
            'id' => (int) $r['id'], 'tipo' => $r['kind'], 'archivo' => $r['file_name'], 'tamano' => $r['size_bytes'] !== null ? (int) $r['size_bytes'] : null, 'sha256' => $r['sha256'],
            'tablas' => $r['tables_count'], 'filas' => $r['rows_count'], 'fuera_del_servidor' => $r['offsite_status'], 'estado' => $r['status'], 'error' => $r['error'],
            'inicio' => App::iso((string) $r['started_at']), 'fin' => App::iso($r['finished_at']),
        ], $c->app->db->all('SELECT * FROM backup_runs ORDER BY id DESC LIMIT 60'))];
    }

    private static function orgs(Ctx $c): array
    {
        return ['empresas' => array_map(fn ($r) => [
            'uid' => $r['uid'], 'nombre' => $r['name'], 'plan' => $r['plan'], 'estado' => $r['status'], 'max_usuarios' => (int) $r['max_users'], 'usuarios' => (int) $r['n'], 'creada' => App::iso((string) $r['created_at']),
        ], $c->app->db->all("SELECT o.*, (SELECT COUNT(*) FROM memberships m WHERE m.org_id = o.id AND m.status = 'ACTIVA') AS n FROM organizations o ORDER BY o.name LIMIT 2000"))];
    }
}
