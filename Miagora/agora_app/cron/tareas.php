<?php
/**
 * Agora Digital App · tareas programadas.
 *
 * En Hostinger (hPanel → Avanzado → Tareas Cron) basta UNA línea que corra cada minuto:
 *     * * * * *  /usr/bin/php /home/uXXXXXXX/domains/TU-DOMINIO/agora_app/cron/tareas.php
 * Esta tarea decide sola qué toca (las horas de Hostinger están en UTC; aquí se usa la hora de Venezuela):
 *   salida      cada minuto      correos pendientes
 *   tasas       cada 5 minutos   BCV y Binance P2P (y publica fx/actual.json)
 *   integridad  cada 15 minutos  archivos del sistema contra el manifiesto firmado (avisa si cambian)
 *   limpieza    cada hora        sesiones, códigos y límites vencidos; historial de datos
 *   respaldo    1 vez al día     a partir de las 3:00 (base cifrada + archivos críticos, con rotación)
 *   resumen     1 vez al día     a partir de las 7:00 (resumen de seguridad a los administradores)
 * También se puede correr una sola: php tareas.php tasas
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require __DIR__ . '/../bootstrap.php';

use Agora\App;
use Agora\Core\Clock;
use Agora\Core\Env;
use Agora\Core\Log;
use Agora\Services\Backup;

$only = $argv[1] ?? 'todo';
$storage = Env::str('STORAGE_DIR', AGORA_APP . '/storage');
@mkdir($storage, 0750, true);
$lock = fopen($storage . '/cron.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
    exit(0); // ya hay una corriendo
}
$stateFile = $storage . '/cron-estado.json';
$state = is_file($stateFile) ? (json_decode((string) file_get_contents($stateFile), true) ?: []) : [];
$now = Clock::unix();
$local = Clock::localNow();
$today = $local->format('Y-m-d');

$app = new App();

$tasks = [
    'salida' => ['every' => 60, 'fn' => fn () => $app->outbox->process(50)],
    'tasas' => ['every' => max(60, Env::int('FX_EVERY_MIN', 5) * 60), 'fn' => fn () => $app->fx()->refresh()],
    'integridad' => ['every' => 900, 'fn' => fn () => array_intersect_key($app->integrity->verify(true), array_flip(['status', 'total']))],
    'limpieza' => ['every' => 3600, 'fn' => fn () => limpieza($app)],
    'respaldo' => ['daily' => Env::int('BACKUP_HOUR', 3), 'fn' => fn () => $app->backup()->run(Backup::kindForToday())],
    'resumen' => ['daily' => 7, 'fn' => fn () => ['eventos' => $app->alerts->dailyDigest()]],
];

$ran = [];
foreach ($tasks as $name => $t) {
    if ($only !== 'todo' && $only !== $name) {
        continue;
    }
    $last = (int) ($state[$name]['ts'] ?? 0);
    $due = $only === $name
        || (isset($t['every']) && $now - $last >= $t['every'] - 5)
        || (isset($t['daily']) && (int) $local->format('G') >= $t['daily'] && ($state[$name]['dia'] ?? '') !== $today);
    if (!$due) {
        continue;
    }
    $t0 = microtime(true);
    try {
        $out = ($t['fn'])();
        $state[$name] = ['ts' => $now, 'dia' => $today, 'ok' => true, 'ms' => (int) ((microtime(true) - $t0) * 1000)];
        $ran[$name] = $out;
    } catch (\Throwable $e) {
        $state[$name] = ['ts' => $now, 'dia' => isset($t['daily']) ? ($state[$name]['dia'] ?? '') : $today, 'ok' => false, 'error' => mb_substr($e->getMessage(), 0, 300)];
        Log::error('Tarea programada con error', ['tarea' => $name, 'error' => $e->getMessage()]);
        if ($name === 'respaldo') {
            try {
                $app->alerts->event('RESPALDO', 'ALTA', '127.0.0.1', 'CRON', 'respaldo', 'cron', ['error' => mb_substr($e->getMessage(), 0, 300)]);
            } catch (\Throwable) {
            }
        }
    }
}
$state['_ultima'] = Clock::ts();
file_put_contents($stateFile, json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
flock($lock, LOCK_UN);
if ($only !== 'todo' || getenv('AGORA_CRON_VERBOSE')) {
    echo json_encode($ran, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), "\n";
}

/** Borra lo vencido y recorta el historial de datos (se conservan siempre los cambios hechos con código) */
function limpieza(App $app): array
{
    $db = $app->db;
    $out = [];
    $out['limites'] = $db->exec('DELETE FROM rate_limits WHERE expires_at < ?', [Clock::unix()]);
    $out['sesiones'] = $db->exec('DELETE FROM sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)', [Clock::ts(-7 * 86400), Clock::ts(-30 * 86400)]);
    $out['bloqueos'] = $db->exec('DELETE FROM ip_blocks WHERE blocked_until < ?', [Clock::ts(-30 * 86400)]);
    $out['tasas'] = $db->exec('DELETE FROM fx_snapshots WHERE fetched_at < ?', [Clock::ts(-90 * 86400)]);
    $out['cotizaciones'] = $db->exec('DELETE FROM fx_quotes WHERE expires_at < ?', [Clock::ts(-180 * 86400)]);
    $out['correos'] = $db->exec("DELETE FROM outbox WHERE status IN ('ENVIADO','REGISTRO','FALLIDO') AND created_at < ?", [Clock::ts(-90 * 86400)]);
    $out['eventos'] = $db->exec("DELETE FROM security_events WHERE severity IN ('BAJA','MEDIA') AND created_at < ?", [Clock::ts(-365 * 86400)]);
    $keep = max(20, Env::int('DOC_HISTORY_KEEP', 50));
    $pruned = 0;
    foreach ($db->all('SELECT org_id, doc_key, MAX(version) AS mv, COUNT(*) AS n FROM org_document_history GROUP BY org_id, doc_key') as $r) {
        if ((int) $r['n'] > $keep + 10) {
            $pruned += $db->exec('DELETE FROM org_document_history WHERE org_id = ? AND doc_key = ? AND version < ? AND grant_id IS NULL AND changed_at < ?', [(int) $r['org_id'], (string) $r['doc_key'], (int) $r['mv'] - $keep, Clock::ts(-30 * 86400)]);
        }
    }
    $out['historial'] = $pruned;
    return $out;
}
