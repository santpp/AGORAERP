<?php
declare(strict_types=1);

namespace Agora\Services;

use Agora\Core\Clock;
use Agora\Core\Db;
use Agora\Core\Env;
use Agora\Core\HttpClient;
use Agora\Core\Log;
use Agora\Security\Crypto;

/**
 * Memoria de respaldo automática:
 *  · volcado completo de la base (estructura, datos y disparadores) comprimido y CIFRADO (XChaCha20-Poly1305);
 *  · archivos críticos (.env y manifiesto de integridad) en un segundo archivo cifrado;
 *  · rotación: 7 diarios, 4 semanales (domingo), 12 mensuales (día 1) y 10 manuales;
 *  · copia fuera del servidor opcional en un almacenamiento compatible con S3 (firma AWS v4).
 * La clave (BACKUP_KEY) debe guardarse también FUERA del servidor: sin ella no se puede restaurar.
 */
final class Backup
{
    private const KEEP = ['DIARIO' => 7, 'SEMANAL' => 4, 'MENSUAL' => 12, 'MANUAL' => 10];

    public function __construct(private Db $db)
    {
    }

    public static function dir(): string
    {
        $d = Env::str('BACKUP_DIR', Env::str('STORAGE_DIR', AGORA_APP . '/storage') . '/respaldos');
        if (!is_dir($d)) {
            @mkdir($d, 0700, true);
        }
        return $d;
    }

    public static function kindForToday(): string
    {
        $d = Clock::localNow();
        return $d->format('j') === '1' ? 'MENSUAL' : ($d->format('w') === '0' ? 'SEMANAL' : 'DIARIO');
    }

    /** @return array<string,mixed> */
    public function run(string $kind = 'DIARIO', ?int $userId = null): array
    {
        $kind = isset(self::KEEP[$kind]) ? $kind : 'DIARIO';
        $runId = $this->db->insert('backup_runs', ['kind' => $kind, 'file_name' => null, 'size_bytes' => null, 'sha256' => null, 'tables_count' => null, 'rows_count' => null, 'offsite_status' => 'NO', 'status' => 'EN_CURSO', 'error' => null, 'started_at' => Clock::ts(), 'finished_at' => null, 'created_by' => $userId]);
        $dir = self::dir();
        $stamp = Clock::now()->format('Ymd-His');
        $base = "agora-{$stamp}-" . strtolower($kind);
        $tmp = $dir . '/.' . $base . '.sql.gz.tmp';
        try {
            $gz = gzopen($tmp, 'wb6');
            if (!$gz) {
                throw new \RuntimeException('No se pudo crear el archivo temporal del respaldo');
            }
            [$tables, $rows] = $this->dump(fn (string $s) => gzwrite($gz, $s));
            gzclose($gz);
            $final = $dir . '/' . $base . '.sql.gz.agbk';
            Crypto::encryptFile($tmp, $final);
            @unlink($tmp);
            @chmod($final, 0600);
            $files = $this->filesArchive($dir . '/' . $base . '-archivos.json.agbk');
            $sha = hash_file('sha256', $final) ?: '';
            $offsite = 'NO';
            if (self::s3Configured()) {
                try {
                    $this->s3Put(basename($final), $final);
                    if ($files) {
                        $this->s3Put(basename($files), $files);
                    }
                    $offsite = 'OK';
                } catch (\Throwable $e) {
                    $offsite = 'ERROR';
                    Log::warn('No se pudo copiar el respaldo fuera del servidor', ['error' => $e->getMessage()]);
                }
            }
            $this->db->update('backup_runs', ['file_name' => basename($final), 'size_bytes' => filesize($final), 'sha256' => $sha, 'tables_count' => $tables, 'rows_count' => $rows, 'offsite_status' => $offsite, 'status' => 'OK', 'finished_at' => Clock::ts()], ['id' => $runId]);
            $removed = $this->rotate();
            return ['ok' => true, 'archivo' => basename($final), 'tamano' => filesize($final), 'tablas' => $tables, 'filas' => $rows, 'fuera_del_servidor' => $offsite, 'rotados' => $removed];
        } catch (\Throwable $e) {
            @unlink($tmp);
            $this->db->update('backup_runs', ['status' => 'ERROR', 'error' => mb_substr($e->getMessage(), 0, 2000), 'finished_at' => Clock::ts()], ['id' => $runId]);
            Log::error('El respaldo falló', ['error' => $e->getMessage()]);
            throw $e;
        }
    }

    /**
     * Escribe el volcado con $write dentro de una lectura con FOTO CONSISTENTE de la base
     * (InnoDB: START TRANSACTION WITH CONSISTENT SNAPSHOT; SQLite: transacción de lectura):
     * aunque la gente siga trabajando mientras corre, todas las tablas quedan del mismo instante.
     * @return array{0:int,1:int} tablas y filas
     */
    public function dump(callable $write): array
    {
        $pdo = $this->db->pdo();
        if ($this->db->isSqlite()) {
            $pdo->exec('BEGIN');
        } else {
            $pdo->exec('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
            $pdo->exec('START TRANSACTION WITH CONSISTENT SNAPSHOT');
        }
        try {
            return $this->dumpTables($write);
        } finally {
            try {
                $pdo->exec('COMMIT');
            } catch (\Throwable) {
            }
        }
    }

    /** @return array{0:int,1:int} */
    private function dumpTables(callable $write): array
    {
        $sqlite = $this->db->isSqlite();
        $pdo = $this->db->pdo();
        $write("-- Agora Digital App · respaldo de la base de datos\n-- Creado: " . Clock::ts() . " UTC · motor: " . $this->db->driver() . "\n\n");
        if ($sqlite) {
            $write("PRAGMA foreign_keys = OFF;\nBEGIN;\n");
            $tables = array_column($this->db->all("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"), 'sql', 'name');
        } else {
            $write("SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\nSET UNIQUE_CHECKS = 0;\nSET time_zone = '+00:00';\n\n");
            $tables = [];
            foreach ($this->db->all("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'") as $r) {
                $name = (string) array_values($r)[0];
                $tables[$name] = (string) ($this->db->one('SHOW CREATE TABLE `' . str_replace('`', '', $name) . '`')['Create Table'] ?? '');
            }
            ksort($tables);
        }
        $rowsTotal = 0;
        foreach ($tables as $name => $create) {
            $q = $sqlite ? '"' . str_replace('"', '""', $name) . '"' : '`' . str_replace('`', '', $name) . '`';
            $write("\n-- Tabla {$name}\nDROP TABLE IF EXISTS {$q};\n" . rtrim((string) $create, "; \n") . ";\n");
            if (!$sqlite) {
                $pdo->setAttribute(\PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, false);
            }
            $st = $pdo->query('SELECT * FROM ' . $q);
            $batch = [];
            $cols = null;
            while ($row = $st->fetch(\PDO::FETCH_ASSOC)) {
                $cols ??= '(' . implode(', ', array_map(fn ($c) => $sqlite ? '"' . $c . '"' : '`' . $c . '`', array_keys($row))) . ')';
                $batch[] = '(' . implode(', ', array_map(fn ($v) => self::literal($v, $sqlite, $pdo), $row)) . ')';
                $rowsTotal++;
                if (count($batch) >= 200) {
                    $write("INSERT INTO {$q} {$cols} VALUES\n" . implode(",\n", $batch) . ";\n");
                    $batch = [];
                }
            }
            if ($batch) {
                $write("INSERT INTO {$q} {$cols} VALUES\n" . implode(",\n", $batch) . ";\n");
            }
            $st->closeCursor();
            if (!$sqlite) {
                $pdo->setAttribute(\PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, true);
            }
        }
        // disparadores al final (así los datos se cargan sin que los frenen)
        if ($sqlite) {
            foreach ($this->db->all("SELECT sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name") as $ix) {
                $write(rtrim((string) $ix['sql'], "; \n") . ";\n");
            }
            $write("DELIMITER $$\n");
            foreach ($this->db->all("SELECT sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name") as $t) {
                $write(rtrim((string) $t['sql'], "; \n") . "$$\n");
            }
            $write("DELIMITER ;\nCOMMIT;\nPRAGMA foreign_keys = ON;\n");
        } else {
            $write("\nDELIMITER $$\n");
            foreach ($this->db->all('SHOW TRIGGERS') as $t) {
                $tr = $this->db->one('SHOW CREATE TRIGGER `' . str_replace('`', '', (string) $t['Trigger']) . '`');
                $sql = (string) ($tr['SQL Original Statement'] ?? '');
                $sql = (string) preg_replace('/^CREATE\s+DEFINER\s*=\s*\S+\s+TRIGGER/i', 'CREATE TRIGGER', $sql);
                $write('DROP TRIGGER IF EXISTS `' . $t['Trigger'] . "`$$\n" . $sql . "$$\n");
            }
            $write("DELIMITER ;\nSET FOREIGN_KEY_CHECKS = 1;\nSET UNIQUE_CHECKS = 1;\n");
        }
        return [count($tables), $rowsTotal];
    }

    /** Valor SQL seguro para el volcado (sin saltos de línea sueltos que confundan al restaurar) */
    private static function literal(mixed $v, bool $sqlite, \PDO $pdo): string
    {
        if ($v === null) {
            return 'NULL';
        }
        if (is_int($v) || is_float($v)) {
            return (string) $v;
        }
        $s = (string) $v;
        if ($sqlite && preg_match('/[\r\n]/', $s)) {
            return "CAST(X'" . bin2hex($s) . "' AS TEXT)";
        }
        return (string) $pdo->quote($s);
    }

    /** Archivos críticos (configuración y manifiesto de integridad), cifrados aparte */
    private function filesArchive(string $out): ?string
    {
        $files = [];
        foreach (['.env' => AGORA_APP . '/.env', 'storage/integridad/manifiesto.json' => \Agora\Security\Integrity::manifestPath()] as $k => $path) {
            if (is_file($path)) {
                $files[$k] = base64_encode((string) file_get_contents($path));
            }
        }
        if (!$files) {
            return null;
        }
        $tmp = $out . '.tmp';
        file_put_contents($tmp, json_encode(['creado' => Clock::ts(), 'archivos' => $files], JSON_UNESCAPED_SLASHES));
        Crypto::encryptFile($tmp, $out);
        @unlink($tmp);
        @chmod($out, 0600);
        return $out;
    }

    /** @return int archivos borrados por la rotación */
    public function rotate(): int
    {
        $dir = self::dir();
        $removed = 0;
        foreach (self::KEEP as $kind => $keep) {
            $list = glob($dir . '/agora-*-' . strtolower($kind) . '.sql.gz.agbk') ?: [];
            rsort($list);
            foreach (array_slice($list, $keep) as $f) {
                @unlink($f);
                @unlink(preg_replace('/\.sql\.gz\.agbk$/', '-archivos.json.agbk', $f));
                $removed++;
            }
        }
        return $removed;
    }

    /**
     * Restaura un respaldo cifrado en la base configurada (borra y recrea todas las tablas).
     * @return array{sentencias:int}
     */
    public function restore(string $file): array
    {
        $tmp = sys_get_temp_dir() . '/agora-restaurar-' . bin2hex(random_bytes(6)) . '.sql.gz';
        Crypto::decryptFile($file, $tmp);
        $n = 0;
        try {
            $gz = gzopen($tmp, 'rb');
            $delim = ';';
            $buf = '';
            while (($line = gzgets($gz, 1 << 20)) !== false) {
                $trim = rtrim($line, "\r\n");
                if (preg_match('/^DELIMITER\s+(\S+)\s*$/', $trim, $m)) {
                    $delim = $m[1];
                    continue;
                }
                if ($buf === '' && (str_starts_with(ltrim($trim), '--') || trim($trim) === '')) {
                    continue;
                }
                $buf .= $line;
                if (str_ends_with(rtrim($trim), $delim)) {
                    $stmt = substr(rtrim($buf), 0, -strlen($delim));
                    if (trim($stmt) !== '') {
                        $this->db->pdo()->exec($stmt);
                        $n++;
                    }
                    $buf = '';
                }
            }
            gzclose($gz);
        } finally {
            @unlink($tmp);
        }
        return ['sentencias' => $n];
    }

    // ------------------------------------------------------------------ copia fuera del servidor (S3 compatible)
    public static function s3Configured(): bool
    {
        return Env::str('S3_ENDPOINT') !== '' && Env::str('S3_BUCKET') !== '' && Env::str('S3_KEY') !== '' && Env::str('S3_SECRET') !== '';
    }

    private function s3Put(string $name, string $path): void
    {
        $endpoint = rtrim(Env::str('S3_ENDPOINT'), '/');
        $host = (string) parse_url($endpoint, PHP_URL_HOST);
        $key = trim(Env::str('S3_PREFIX', 'agora'), '/') . '/' . $name;
        $uri = '/' . rawurlencode(Env::str('S3_BUCKET')) . '/' . implode('/', array_map('rawurlencode', explode('/', $key)));
        $body = (string) file_get_contents($path);
        $hash = hash('sha256', $body);
        $amzDate = gmdate('Ymd\THis\Z', Clock::unix());
        $headers = ['host' => $host, 'x-amz-content-sha256' => $hash, 'x-amz-date' => $amzDate];
        $auth = self::sigV4('PUT', $uri, '', $headers, $hash, Env::str('S3_KEY'), Env::str('S3_SECRET'), Env::str('S3_REGION', 'us-east-1'), 's3', $amzDate);
        $r = HttpClient::request('PUT', $endpoint . $uri, ['Authorization' => $auth, 'x-amz-content-sha256' => $hash, 'x-amz-date' => $amzDate, 'Content-Type' => 'application/octet-stream'], $body, 120);
        if ($r['status'] < 200 || $r['status'] >= 300) {
            throw new \RuntimeException('S3 respondió ' . $r['status'] . ' ' . mb_substr($r['body'], 0, 200));
        }
    }

    /**
     * Firma AWS Signature Version 4 (encabezado Authorization).
     * @param array<string,string> $headers en minúsculas, incluidos host y x-amz-date
     */
    public static function sigV4(string $method, string $uri, string $query, array $headers, string $payloadHash, string $accessKey, string $secret, string $region, string $service, string $amzDate): string
    {
        ksort($headers);
        $canonHeaders = '';
        foreach ($headers as $k => $v) {
            $canonHeaders .= strtolower($k) . ':' . trim((string) preg_replace('/\s+/', ' ', $v)) . "\n";
        }
        $signed = implode(';', array_map('strtolower', array_keys($headers)));
        $canonical = implode("\n", [$method, $uri, $query, $canonHeaders, $signed, $payloadHash]);
        $date = substr($amzDate, 0, 8);
        $scope = "{$date}/{$region}/{$service}/aws4_request";
        $toSign = implode("\n", ['AWS4-HMAC-SHA256', $amzDate, $scope, hash('sha256', $canonical)]);
        $k = hash_hmac('sha256', $date, 'AWS4' . $secret, true);
        $k = hash_hmac('sha256', $region, $k, true);
        $k = hash_hmac('sha256', $service, $k, true);
        $k = hash_hmac('sha256', 'aws4_request', $k, true);
        $sig = hash_hmac('sha256', $toSign, $k);
        return "AWS4-HMAC-SHA256 Credential={$accessKey}/{$scope}, SignedHeaders={$signed}, Signature={$sig}";
    }
}
