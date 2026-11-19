<?php
declare(strict_types=1);

namespace Agora\Api;

use Agora\App;
use Agora\Core\Clock;
use Agora\Http\HttpError;
use Agora\Http\Router;
use Agora\Notify\Templates;
use Agora\Security\Roles;

/** Panel de seguridad: eventos, IP bloqueadas, integridad de archivos y prueba de avisos. */
final class SecurityApi
{
    public static function routes(Router $r, App $app): void
    {
        $o = ['org' => false];
        $r->add('GET', '/api/v1/seguridad/eventos', fn (Ctx $c) => self::events($c), ['perm' => 'seguridad.ver']);
        $r->add('GET', '/api/v1/seguridad/resumen', fn (Ctx $c) => self::summary($c), ['perm' => 'seguridad.ver']);
        $r->add('POST', '/api/v1/seguridad/prueba', fn (Ctx $c) => self::testAlert($c), ['perm' => 'seguridad.gestionar', 'rate' => ['seguridad:prueba:{user}', 3, 3600]]);
        $r->add('GET', '/api/v1/plataforma/eventos', fn (Ctx $c) => self::events($c, true), ['org' => false, 'platform' => true]);
        $r->add('GET', '/api/v1/plataforma/bloqueos', fn (Ctx $c) => self::blocks($c), ['org' => false, 'platform' => true]);
        $r->add('POST', '/api/v1/plataforma/bloqueos/{ip}/quitar', fn (Ctx $c) => self::unblock($c), ['org' => false, 'platform' => true]);
        $r->add('GET', '/api/v1/plataforma/integridad', fn (Ctx $c) => self::integrity($c), ['org' => false, 'platform' => true]);
        $r->add('POST', '/api/v1/plataforma/integridad/verificar', fn (Ctx $c) => self::integrityRun($c), ['org' => false, 'platform' => true, 'rate' => ['integridad:{user}', 6, 3600]]);
    }

    // ------------------------------------------------------------------ panel de seguridad
    private static function events(Ctx $c, bool $platform = false): array
    {
        $q = $c->req->query;
        $where = [];
        $params = [];
        if (!$platform) {
            $where[] = 'org_id = ?';
            $params[] = $c->orgId();
        }
        if (!empty($q['severidad']) && in_array($q['severidad'], ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'], true)) {
            $where[] = 'severity = ?';
            $params[] = $q['severidad'];
        }
        $days = max(1, min(90, (int) ($q['dias'] ?? 7)));
        $where[] = 'created_at >= ?';
        $params[] = Clock::ts(-$days * 86400);
        $rows = $c->app->db->all('SELECT id, event_type, severity, ip, http_method, path, user_agent, detail, notified_at, created_at, user_id FROM security_events WHERE ' . implode(' AND ', $where) . ' ORDER BY id DESC LIMIT 300', $params);
        return ['eventos' => array_map(fn ($r) => [
            'id' => (int) $r['id'], 'tipo' => $r['event_type'], 'gravedad' => $r['severity'], 'ip' => $r['ip'], 'ruta' => trim($r['http_method'] . ' ' . $r['path']),
            'agente' => mb_substr((string) $r['user_agent'], 0, 120), 'detalle' => json_decode((string) $r['detail'], true), 'avisado' => $r['notified_at'] !== null, 'fecha' => App::iso((string) $r['created_at']),
        ], $rows)];
    }

    private static function summary(Ctx $c): array
    {
        $orgId = $c->orgId();
        $by = [];
        foreach ($c->app->db->all('SELECT severity, COUNT(*) AS n FROM security_events WHERE org_id = ? AND created_at >= ? GROUP BY severity', [$orgId, Clock::ts(-7 * 86400)]) as $r) {
            $by[$r['severity']] = (int) $r['n'];
        }
        $last = $c->app->db->one('SELECT status, checked_at, changed_count, added_count, removed_count FROM integrity_checks ORDER BY id DESC LIMIT 1');
        $audit = $c->app->audit->verify($orgId);
        return [
            'eventos_7_dias' => $by + ['BAJA' => 0, 'MEDIA' => 0, 'ALTA' => 0, 'CRITICA' => 0],
            'integridad' => $last ? ['estado' => $last['status'], 'revisado' => App::iso((string) $last['checked_at']), 'cambiados' => (int) $last['changed_count'] + (int) $last['added_count'] + (int) $last['removed_count']] : null,
            'auditoria' => ['integra' => $audit['ok'], 'registros' => $audit['total']],
            'superadministradores' => $c->app->alerts->orgAdmins($orgId),
        ];
    }

    private static function testAlert(Ctx $c): array
    {
        $orgId = $c->orgId();
        $c->app->alerts->org($orgId, 'Prueba de avisos de seguridad', 'Los avisos de seguridad funcionan', '<p>' . Templates::e((string) $c->s()['name']) . ' pidió esta prueba. Si la recibes, los avisos de seguridad de tu empresa llegan a este correo.</p>');
        $c->audit('seguridad', 'envió una prueba de avisos de seguridad');
        return ['ok' => true, 'destinatarios' => count($c->app->alerts->orgAdmins($orgId))];
    }

    private static function blocks(Ctx $c): array
    {
        return ['bloqueos' => array_map(fn ($r) => ['ip' => $r['ip'], 'motivo' => $r['reason'], 'gravedad' => $r['severity'], 'veces' => (int) $r['hits'], 'hasta' => App::iso((string) $r['blocked_until']), 'desde' => App::iso((string) $r['created_at'])],
            $c->app->db->all('SELECT * FROM ip_blocks WHERE blocked_until > ? ORDER BY blocked_until DESC LIMIT 500', [Clock::ts()]))];
    }

    private static function unblock(Ctx $c): array
    {
        $ip = $c->param('ip');
        if (!filter_var($ip, FILTER_VALIDATE_IP)) {
            throw HttpError::badRequest('IP no válida.');
        }
        $c->app->ipGuard->unblock($ip);
        $c->app->audit->log(null, $c->actor(), 'seguridad', 'desbloqueó la IP ' . $ip, 'ip', $ip, null, 'SERVIDOR', null);
        return ['ok' => true];
    }

    private static function integrity(Ctx $c): array
    {
        return ['revisiones' => array_map(fn ($r) => ['fecha' => App::iso((string) $r['checked_at']), 'estado' => $r['status'], 'archivos' => (int) $r['files_total'], 'cambiados' => (int) $r['changed_count'], 'nuevos' => (int) $r['added_count'], 'faltantes' => (int) $r['removed_count'], 'detalle' => json_decode((string) $r['detail'], true)],
            $c->app->db->all('SELECT * FROM integrity_checks ORDER BY id DESC LIMIT 30'))];
    }

    private static function integrityRun(Ctx $c): array
    {
        return $c->app->integrity->verify(true);
    }

    public static function roleLabel(?string $r): string
    {
        return $r ? (Roles::LABELS[$r] ?? $r) : '';
    }
}
