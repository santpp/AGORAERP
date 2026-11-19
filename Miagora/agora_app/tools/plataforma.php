<?php
/**
 * Agora Digital App · administración de la plataforma (empresas clientes del CRM).
 *
 *   php plataforma.php empresas
 *   php plataforma.php crear-empresa --nombre="Empresa C.A." --plan=PLATA [--superadmin=correo]
 *   php plataforma.php invitar --empresa=UID --correo=persona@x.com --rol=DIRECCION
 *   php plataforma.php plan --empresa=UID --plan=ORO
 *   php plataforma.php suspender --empresa=UID      |  activar --empresa=UID
 *   php plataforma.php admin --correo=... --nombre="..."      (administrador de la plataforma)
 *   php plataforma.php desbloquear-ip --ip=1.2.3.4
 *   php plataforma.php cerrar-sesiones --correo=persona@x.com
 *   php plataforma.php verificar --empresa=UID       (auditoría encadenada y sellos fiscales)
 *   php plataforma.php respaldo                      (respaldo manual ahora)
 *   php plataforma.php tasas                         (actualiza BCV y Binance ahora)
 *   php plataforma.php carga-preparar --personas=300 --salida=/home/uXXX/carga.csv   (prueba de carga, ver docs/CAPACIDAD.md)
 *   php plataforma.php carga-limpiar --empresa=UID   (cierra las sesiones de la prueba y suspende su empresa)
 * Planes: BRONCE (3 personas), PLATA (10), ORO (20), DIAMANTE (sin límite).
 */
declare(strict_types=1);
require __DIR__ . '/_cli.php';

use Agora\App;
use Agora\Core\Clock;
use Agora\Core\Ids;
use Agora\Security\Password;
use Agora\Security\SessionManager;
use Agora\Services\Platform;

cli_run(function () use ($argv): void {
    $a = cli_args($argv);
    $cmd = $a['_'][0] ?? 'ayuda';
    $app = new App();
    $p = new Platform($app);
    $org = function () use ($a, $app): array {
        $k = (string) ($a['empresa'] ?? '');
        $o = $app->db->one('SELECT * FROM organizations WHERE uid = ? OR slug = ?', [$k, $k]);
        if (!$o) {
            throw new RuntimeException('No encontré esa empresa (usa su UID o su identificador corto).');
        }
        return $o;
    };
    switch ($cmd) {
        case 'empresas':
            foreach ($app->db->all("SELECT o.uid, o.slug, o.name, o.plan, o.status, o.max_users, (SELECT COUNT(*) FROM memberships m WHERE m.org_id = o.id AND m.status = 'ACTIVA') AS n FROM organizations o ORDER BY o.name") as $r) {
                cli_out(sprintf('%s  %-28s %-9s %-10s %s/%s  %s', $r['uid'], mb_substr($r['name'], 0, 28), $r['plan'], $r['status'], $r['n'], (int) $r['max_users'] ?: '∞', $r['slug']));
            }
            break;
        case 'crear-empresa':
            $o = $p->createOrg((string) ($a['nombre'] ?? ''), (string) ($a['plan'] ?? 'BRONCE'));
            cli_ok("Empresa creada: {$o['nombre']} · {$o['plan']} · {$o['uid']}");
            if (!empty($a['superadmin'])) {
                $inv = $p->createInvitation((int) $o['id'], (string) $a['superadmin'], 'SUPERADMIN', null, 'Agora Digital');
                cli_ok('Invitación enviada a ' . $a['superadmin'] . ' (vence ' . $inv['vence'] . ')');
            }
            break;
        case 'invitar':
            $o = $org();
            $inv = $p->createInvitation((int) $o['id'], (string) ($a['correo'] ?? ''), strtoupper((string) ($a['rol'] ?? 'ADMIN')), null, 'Agora Digital');
            cli_ok('Invitación enviada (vence ' . $inv['vence'] . ')');
            break;
        case 'plan':
            $o = $org();
            $p->setPlan((string) $o['uid'], (string) ($a['plan'] ?? ''));
            cli_ok('Plan actualizado');
            break;
        case 'suspender':
        case 'activar':
            $o = $org();
            $p->setStatus((string) $o['uid'], $cmd === 'suspender' ? 'SUSPENDIDA' : 'ACTIVA');
            cli_ok($cmd === 'suspender' ? 'Empresa suspendida (se cerraron sus sesiones)' : 'Empresa activa');
            break;
        case 'admin':
            $pass = cli_secret('Clave (mínimo 10 caracteres)');
            if ($pass !== cli_secret('Repite la clave')) {
                throw new RuntimeException('Las claves no coinciden.');
            }
            $p->createPlatformAdmin((string) ($a['correo'] ?? ''), (string) ($a['nombre'] ?? 'Administración Agora'), $pass);
            cli_ok('Administrador de la plataforma listo');
            break;
        case 'desbloquear-ip':
            $app->ipGuard->unblock((string) ($a['ip'] ?? ''));
            cli_ok('IP desbloqueada');
            break;
        case 'cerrar-sesiones':
            $uid = $app->db->value('SELECT id FROM users WHERE email = ?', [strtolower((string) ($a['correo'] ?? ''))]);
            if (!$uid) {
                throw new RuntimeException('No existe esa cuenta.');
            }
            cli_ok('Sesiones cerradas: ' . $app->sessions->revokeAllForUser((int) $uid, 'plataforma'));
            $app->sessions->revokeDevices((int) $uid);
            break;
        case 'verificar':
            $o = $org();
            $au = $app->audit->verify((int) $o['id']);
            $fi = $app->fiscal()->verifyChain((int) $o['id']);
            ($au['ok'] ? 'cli_ok' : 'cli_err')('Auditoría: ' . ($au['ok'] ? 'íntegra' : 'ROTA en el registro ' . $au['primer_error']) . " ({$au['total']} registros)");
            ($fi['integro'] ? 'cli_ok' : 'cli_err')('Documentos fiscales: ' . ($fi['integro'] ? 'sellos y numeración correctos' : count($fi['problemas']) . ' problema(s)') . " ({$fi['documentos']} documentos)");
            foreach ($fi['problemas'] as $x) {
                cli_out("   · {$x['tipo']} {$x['documento']}: {$x['problema']}");
            }
            break;
        case 'respaldo':
            $r = $app->backup()->run(strtoupper((string) ($a['tipo'] ?? 'MANUAL')));
            cli_ok('Respaldo: ' . $r['archivo'] . ' (' . round($r['tamano'] / 1048576, 2) . ' MB, ' . $r['filas'] . ' filas)');
            break;
        case 'tasas':
            cli_out(json_encode($app->fx()->refresh(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            break;
        case 'carga-preparar':
            // Empresa aparte con N personas y una sesión abierta para cada una (sin pasar por el acceso ni sus límites):
            // el archivo CSV lo usa qa/carga-k6.js. Úsalo en un servidor de prueba o en horas de poco uso.
            $n = max(1, min(5000, (int) ($a['personas'] ?? 300)));
            $out = (string) ($a['salida'] ?? (getcwd() . '/carga-sesiones.csv'));
            $o = !empty($a['empresa']) ? $org() : $p->createOrg('Prueba de carga ' . Clock::today(), 'DIAMANTE');
            $orgId = (int) $o['id'];
            $hash = Password::hash(Ids::token(24)); // nadie entra con clave a estas cuentas
            $fh = fopen($out, 'wb');
            if (!$fh) {
                throw new RuntimeException('No se pudo escribir ' . $out);
            }
            fwrite($fh, "cookie,token,csrf\n");
            $now = Clock::ts();
            for ($i = 1; $i <= $n; $i++) {
                $email = sprintf('carga-%s-%04d@carga.invalid', strtolower(substr((string) $o['uid'], -6)), $i);
                $uid = $app->db->value('SELECT id FROM users WHERE email = ?', [$email]);
                if (!$uid) {
                    $uid = $app->db->insert('users', ['uid' => Ids::ulid(), 'email' => $email, 'name' => 'Prueba de carga ' . $i, 'password_hash' => $hash, 'password_changed_at' => $now, 'status' => 'ACTIVO', 'is_platform_admin' => 0, 'mfa_enabled' => 0, 'mfa_channel' => 'EMAIL', 'failed_logins' => 0, 'locked_until' => null, 'last_login_at' => null, 'last_login_ip' => null, 'created_at' => $now, 'updated_at' => $now]);
                    $app->db->insert('memberships', ['org_id' => $orgId, 'user_id' => $uid, 'role' => 'ADMIN', 'status' => 'ACTIVA', 'created_at' => $now, 'created_by' => null, 'updated_at' => $now]);
                }
                $token = Ids::token(32);
                $csrf = bin2hex(random_bytes(32));
                $app->db->insert('sessions', ['id' => Ids::sha256($token), 'user_id' => (int) $uid, 'org_id' => $orgId, 'csrf_token' => $csrf, 'mfa_passed' => 0, 'elevated_until' => null, 'ip' => 'carga', 'user_agent' => 'prueba de carga', 'created_at' => $now, 'last_seen_at' => $now, 'idle_expires_at' => Clock::ts(86400), 'expires_at' => Clock::ts(86400), 'revoked_at' => null, 'revoke_reason' => null]);
                fwrite($fh, SessionManager::cookieName() . ',' . $token . ',' . $csrf . "\n");
            }
            fclose($fh);
            @chmod($out, 0600);
            cli_ok("Listas {$n} sesiones de prueba (24 h) en la empresa {$o['uid']} → {$out}");
            cli_out('  Mientras dure la prueba, sube RATE_IP_LIMIT y RATE_SESSION_LIMIT en el .env (todo sale de pocas IP).');
            cli_out("  Al terminar: php agora_app/tools/plataforma.php carga-limpiar --empresa={$o['uid']}  y borra el CSV.");
            break;
        case 'carga-limpiar':
            $o = $org();
            $ids = array_map('intval', array_column($app->db->all("SELECT u.id FROM users u JOIN memberships m ON m.user_id = u.id WHERE m.org_id = ? AND u.email LIKE '%@carga.invalid'", [(int) $o['id']]), 'id'));
            $closed = 0;
            foreach ($ids as $uid) {
                $closed += $app->sessions->revokeAllForUser($uid, 'prueba de carga');
                $app->db->update('users', ['status' => 'DESACTIVADO', 'updated_at' => Clock::ts()], ['id' => $uid]);
            }
            if (str_starts_with((string) $o['name'], 'Prueba de carga')) {
                $p->setStatus((string) $o['uid'], 'SUSPENDIDA');
            }
            cli_ok('Prueba de carga limpia: ' . count($ids) . " cuentas desactivadas y {$closed} sesiones cerradas.");
            break;
        default:
            cli_out((string) preg_replace('/^.*?\/\*\*|\*\/.*$/s', '', (string) file_get_contents(__FILE__)));
    }
    unset($a['_']);
    Clock::ts();
});
