<?php
declare(strict_types=1);

namespace Agora\Core;

/** Aplica database/modules/*.sql (y database/migrations/*.sql) en orden, registrando su huella. */
final class Migrator
{
    /** @return list<string> */
    public static function files(): array
    {
        $files = array_merge(glob(AGORA_APP . '/database/modules/*.sql') ?: [], glob(AGORA_APP . '/database/migrations/*.sql') ?: []);
        usort($files, fn ($a, $b) => strcmp(basename(dirname($a)) . '/' . basename($a), basename(dirname($b)) . '/' . basename($b)));
        // los módulos van antes que las migraciones posteriores
        usort($files, fn ($a, $b) => [str_contains($a, '/migrations/') ? 1 : 0, basename($a)] <=> [str_contains($b, '/migrations/') ? 1 : 0, basename($b)]);
        return $files;
    }

    public static function run(Db $db, bool $statusOnly = false, bool $quiet = false): int
    {
        $say = function (string $m) use ($quiet) {
            if (!$quiet) {
                fwrite(STDOUT, $m . PHP_EOL);
            }
        };
        self::ensureTable($db);
        $applied = [];
        foreach ($db->all('SELECT version, checksum FROM schema_migrations') as $r) {
            $applied[$r['version']] = $r['checksum'];
        }
        $pending = 0;
        foreach (self::files() as $file) {
            $version = basename($file, '.sql');
            $sql = (string) file_get_contents($file);
            $sum = hash('sha256', $sql);
            if (isset($applied[$version])) {
                $say(($applied[$version] === $sum ? '  ✓ ' : '  ! ') . $version . ($applied[$version] === $sum ? '' : '  (el archivo cambió después de aplicarse: crea una migración nueva en database/migrations/)'));
                continue;
            }
            $pending++;
            if ($statusOnly) {
                $say('  · ' . $version . '  (pendiente)');
                continue;
            }
            foreach (SqlScript::split($sql) as $stmt) {
                foreach ($db->isSqlite() ? SqlScript::toSqlite($stmt) : [$stmt] as $s) {
                    $db->pdo()->exec($s);
                }
            }
            $db->insert('schema_migrations', ['version' => $version, 'checksum' => $sum, 'applied_at' => Clock::ts()]);
            $say('  + ' . $version);
        }
        $say($pending ? ($statusOnly ? "{$pending} módulo(s) pendiente(s)." : "Listo: {$pending} módulo(s) aplicado(s).") : 'La base de datos está al día.');
        return $pending;
    }

    private static function ensureTable(Db $db): void
    {
        $db->pdo()->exec('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(64) NOT NULL, checksum CHAR(64) NOT NULL, applied_at ' . ($db->isSqlite() ? 'TEXT' : 'DATETIME(3)') . ' NOT NULL, PRIMARY KEY (version))');
    }
}
