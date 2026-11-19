<?php
declare(strict_types=1);

namespace Agora\Security;

use Agora\Core\Clock;
use Agora\Core\Db;
use Agora\Core\Env;

/**
 * Vigilancia de integridad: al publicar se genera un manifiesto firmado (HMAC) con la huella SHA-256 de cada
 * archivo del sistema; la tarea programada lo compara cada pocos minutos y avisa por correo si algo cambió,
 * apareció o desapareció (por ejemplo, un archivo malicioso subido por FTP o una página alterada).
 */
final class Integrity
{
    public function __construct(private Db $db, private Alerts $alerts)
    {
    }

    /** @return array<string,string> carpeta lógica → ruta real */
    public static function roots(): array
    {
        $roots = ['app' => AGORA_APP];
        $pub = Env::str('PUBLIC_DIR', dirname(AGORA_APP) . '/public_html');
        if (is_dir($pub)) {
            $roots['public'] = $pub;
        }
        return $roots;
    }

    private static function excluded(string $logical): bool
    {
        return (bool) preg_match('#^app/(storage|\.env$|tests/)|^public/(fx/actual\.json$|fx/\.actual\.[^/]*\.tmp$|\.well-known/|\.user\.ini$|error_log$)|(^|/)error_log$|(^|/)\.DS_Store$#', $logical);
    }

    /** @return array<string,string> ruta lógica → sha256 */
    public static function scan(): array
    {
        $out = [];
        foreach (self::roots() as $name => $dir) {
            $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS));
            foreach ($it as $f) {
                if (!$f->isFile()) {
                    continue;
                }
                $logical = $name . '/' . ltrim(str_replace('\\', '/', substr($f->getPathname(), strlen($dir))), '/');
                if (self::excluded($logical)) {
                    continue;
                }
                $out[$logical] = hash_file('sha256', $f->getPathname()) ?: '';
            }
        }
        ksort($out);
        return $out;
    }

    public static function manifestPath(): string
    {
        return \Agora\Core\Env::str('STORAGE_DIR', AGORA_APP . '/storage') . '/integridad/manifiesto.json';
    }

    public static function build(): array
    {
        $files = self::scan();
        $m = ['creado' => Clock::ts(), 'archivos' => $files];
        $m['firma'] = hash_hmac('sha256', json_encode($files, JSON_UNESCAPED_SLASHES), Env::secret('INTEGRITY_KEY'));
        @mkdir(dirname(self::manifestPath()), 0750, true);
        file_put_contents(self::manifestPath(), json_encode($m, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
        return ['archivos' => count($files)];
    }

    /** @return array{status:string,changed:list<string>,added:list<string>,removed:list<string>,total:int} */
    public function verify(bool $notify = true): array
    {
        $raw = @file_get_contents(self::manifestPath());
        $m = $raw ? json_decode($raw, true) : null;
        if (!is_array($m) || !isset($m['archivos'], $m['firma']) || !hash_equals(hash_hmac('sha256', json_encode($m['archivos'], JSON_UNESCAPED_SLASHES), Env::secret('INTEGRITY_KEY')), (string) $m['firma'])) {
            $res = ['status' => 'ERROR', 'changed' => [], 'added' => [], 'removed' => [], 'total' => 0, 'error' => 'Manifiesto ausente o con firma inválida'];
            $this->save($res);
            if ($notify) {
                $this->alerts->event('INTEGRIDAD', 'CRITICA', '127.0.0.1', 'CRON', 'manifiesto', 'integridad', ['error' => $res['error']]);
            }
            return $res;
        }
        $now = self::scan();
        $old = $m['archivos'];
        $changed = [];
        foreach ($now as $f => $h) {
            if (isset($old[$f]) && $old[$f] !== $h) {
                $changed[] = $f;
            }
        }
        $added = array_values(array_diff(array_keys($now), array_keys($old)));
        $removed = array_values(array_diff(array_keys($old), array_keys($now)));
        $status = ($changed || $added || $removed) ? 'ALERTA' : 'OK';
        $res = ['status' => $status, 'changed' => $changed, 'added' => $added, 'removed' => $removed, 'total' => count($now)];
        // si el problema es el mismo de la revisión anterior, se vuelve a avisar solo cada 6 horas (no un correo cada 15 minutos)
        $prev = $this->db->one('SELECT status, detail, checked_at FROM integrity_checks ORDER BY id DESC LIMIT 1');
        $same = $prev && $prev['status'] === 'ALERTA' && hash('sha256', (string) json_encode([$changed, $added, $removed])) === hash('sha256', (string) json_encode([
            (json_decode((string) $prev['detail'], true)['cambiados'] ?? []), (json_decode((string) $prev['detail'], true)['nuevos'] ?? []), (json_decode((string) $prev['detail'], true)['eliminados'] ?? []),
        ]));
        $recentAlert = (int) $this->db->value("SELECT COUNT(*) FROM security_events WHERE event_type = 'INTEGRIDAD' AND notified_at IS NOT NULL AND created_at >= ?", [Clock::ts(-6 * 3600)]) > 0;
        $this->save($res);
        if ($status === 'ALERTA' && $notify && !($same && $recentAlert)) {
            $this->alerts->event('INTEGRIDAD', 'CRITICA', '127.0.0.1', 'CRON', 'archivos', 'integridad', [
                'cambiados' => array_slice($changed, 0, 50), 'nuevos' => array_slice($added, 0, 50), 'eliminados' => array_slice($removed, 0, 50),
            ]);
        }
        return $res;
    }

    private function save(array $r): void
    {
        $this->db->insert('integrity_checks', [
            'checked_at' => Clock::ts(), 'files_total' => $r['total'], 'changed_count' => count($r['changed']), 'added_count' => count($r['added']),
            'removed_count' => count($r['removed']), 'status' => $r['status'],
            'detail' => json_encode(['cambiados' => array_slice($r['changed'], 0, 200), 'nuevos' => array_slice($r['added'], 0, 200), 'eliminados' => array_slice($r['removed'], 0, 200), 'error' => $r['error'] ?? null], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        ]);
    }
}
