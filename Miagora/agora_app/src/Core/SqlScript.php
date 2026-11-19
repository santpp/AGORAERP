<?php
declare(strict_types=1);

namespace Agora\Core;

/**
 * Lee los scripts .sql de los módulos (compatibles con phpMyAdmin: usan DELIMITER $$ en los disparadores)
 * y los parte en sentencias. También los convierte a SQLite para las pruebas automáticas.
 */
final class SqlScript
{
    /** @return list<string> sentencias sin el delimitador final */
    public static function split(string $sql): array
    {
        $out = [];
        $delim = ';';
        $buf = '';
        $lines = preg_split("/\r\n|\n|\r/", $sql) ?: [];
        foreach ($lines as $line) {
            $trim = trim($line);
            if (preg_match('/^DELIMITER\s+(\S+)\s*$/i', $trim, $m)) {
                if (trim($buf) !== '') {
                    $out[] = trim($buf);
                    $buf = '';
                }
                $delim = $m[1];
                continue;
            }
            if ($buf === '' && ($trim === '' || str_starts_with($trim, '--'))) {
                continue;
            }
            $buf .= $line . "\n";
            if (self::endsWithDelimiter($buf, $delim)) {
                $stmt = trim(substr(rtrim($buf), 0, -strlen($delim)));
                if ($stmt !== '') {
                    $out[] = $stmt;
                }
                $buf = '';
            }
        }
        if (trim($buf) !== '') {
            $out[] = trim($buf);
        }
        return array_values(array_filter($out, fn ($s) => trim(self::stripComments($s)) !== ''));
    }

    private static function endsWithDelimiter(string $buf, string $delim): bool
    {
        $t = rtrim($buf);
        if (!str_ends_with($t, $delim)) {
            return false;
        }
        // que el delimitador no esté dentro de una cadena o comentario
        $code = self::stripComments($t);
        return (substr_count(preg_replace("/\\\\'/", '', $code) ?? '', "'") % 2) === 0 && str_ends_with(rtrim($code), $delim);
    }

    public static function stripComments(string $s): string
    {
        $s = preg_replace('#/\*.*?\*/#s', '', $s) ?? $s;
        return preg_replace('/^\s*--.*$/m', '', $s) ?? $s;
    }

    /** Convierte una sentencia MySQL de los módulos a SQLite (solo el subconjunto que usan los módulos) */
    public static function toSqlite(string $stmt): array
    {
        $s = trim(self::stripComments($stmt));
        if ($s === '' || preg_match('/^SET\s+NAMES/i', $s)) {
            return [];
        }
        if (preg_match('/^DROP\s+TRIGGER/i', $s)) {
            return [$s];
        }
        if (preg_match('/^CREATE\s+TRIGGER\s+(\w+)\s+(BEFORE|AFTER)\s+(INSERT|UPDATE|DELETE)\s+ON\s+(\w+)\s+FOR\s+EACH\s+ROW\s+BEGIN(.*)END$/is', $s, $m)) {
            return [self::triggerToSqlite($m[1], $m[2], $m[3], $m[4], $m[5])];
        }
        if (preg_match('/^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)\s*\((.*)\)\s*ENGINE=.*$/is', $s, $m)) {
            return self::tableToSqlite($m[1], $m[2]);
        }
        return [$s];
    }

    /** @return list<string> */
    private static function tableToSqlite(string $table, string $body): array
    {
        $parts = self::splitTopLevel($body);
        $cols = [];
        $after = [];
        $pk = null;
        $autoinc = null;
        foreach ($parts as $p) {
            $p = trim($p);
            if (preg_match('/^PRIMARY KEY\s*\((.+)\)$/i', $p, $m)) {
                $pk = trim($m[1]);
                continue;
            }
            if (preg_match('/^UNIQUE KEY\s+(\w+)\s*\((.+)\)$/i', $p, $m)) {
                $after[] = "CREATE UNIQUE INDEX IF NOT EXISTS {$m[1]} ON {$table} ({$m[2]})";
                continue;
            }
            if (preg_match('/^KEY\s+(\w+)\s*\((.+)\)$/i', $p, $m)) {
                $after[] = "CREATE INDEX IF NOT EXISTS {$m[1]} ON {$table} ({$m[2]})";
                continue;
            }
            if (preg_match('/^CONSTRAINT\s+\w+\s+(FOREIGN KEY|CHECK)/i', $p)) {
                $cols[] = $p;
                continue;
            }
            // columna
            if (preg_match('/^(\w+)\s+(.+)$/s', $p, $m)) {
                $name = $m[1];
                $def = $m[2];
                if (stripos($def, 'AUTO_INCREMENT') !== false) {
                    $autoinc = $name;
                    $cols[] = "{$name} INTEGER PRIMARY KEY AUTOINCREMENT";
                    continue;
                }
                $def = preg_replace('/\bBIGINT\s+UNSIGNED\b|\bINT\s+UNSIGNED\b|\bBIGINT\b|\bTINYINT\(\d+\)\s+UNSIGNED|\bTINYINT\(\d+\)|\bTINYINT\s+UNSIGNED|\bINT\b/i', 'INTEGER', $def) ?? $def;
                $def = preg_replace('/\b(VARCHAR|CHAR)\(\d+\)|\bMEDIUMTEXT\b|\bLONGTEXT\b/i', 'TEXT', $def) ?? $def;
                $def = preg_replace('/\bDATETIME\(\d\)|\bDATETIME\b|\bDATE\b/i', 'TEXT', $def) ?? $def;
                $def = preg_replace('/\bDECIMAL\(\d+,\d+\)/i', 'NUMERIC', $def) ?? $def;
                $cols[] = "{$name} {$def}";
            }
        }
        if ($pk !== null && $autoinc === null) {
            $cols[] = "PRIMARY KEY ({$pk})";
        }
        $sql = "CREATE TABLE IF NOT EXISTS {$table} (\n  " . implode(",\n  ", $cols) . "\n)";
        return [$sql, ...$after];
    }

    private static function triggerToSqlite(string $name, string $timing, string $event, string $table, string $body): string
    {
        $stmts = [];
        // IF cond THEN SIGNAL ... MESSAGE_TEXT = 'msg'; END IF;
        $rest = preg_replace_callback(
            "/IF\s+(.*?)\s+THEN\s+SIGNAL\s+SQLSTATE\s+'45000'\s+SET\s+MESSAGE_TEXT\s*=\s*'([^']+)'\s*;\s*END\s+IF\s*;/is",
            function ($m) use (&$stmts) {
                $stmts[] = "SELECT RAISE(ABORT, '{$m[2]}') WHERE " . self::condToSqlite($m[1]) . ';';
                return '';
            },
            $body
        ) ?? $body;
        $rest = preg_replace_callback(
            "/SIGNAL\s+SQLSTATE\s+'45000'\s+SET\s+MESSAGE_TEXT\s*=\s*'([^']+)'\s*;/is",
            function ($m) use (&$stmts) {
                $stmts[] = "SELECT RAISE(ABORT, '{$m[1]}');";
                return '';
            },
            $rest
        ) ?? $rest;
        if (trim($rest) !== '') {
            throw new \RuntimeException("Disparador {$name}: cuerpo no convertible a SQLite: " . trim($rest));
        }
        return "CREATE TRIGGER IF NOT EXISTS {$name} {$timing} {$event} ON {$table} FOR EACH ROW BEGIN " . implode(' ', $stmts) . ' END';
    }

    private static function condToSqlite(string $c): string
    {
        // NOT (A <=> B)  →  (A IS NOT B)
        return preg_replace('/NOT\s*\(\s*([\w.]+)\s*<=>\s*([\w.]+)\s*\)/i', '($1 IS NOT $2)', $c) ?? $c;
    }

    /** @return list<string> partes separadas por comas de primer nivel */
    private static function splitTopLevel(string $body): array
    {
        $out = [];
        $depth = 0;
        $buf = '';
        $inStr = false;
        $len = strlen($body);
        for ($i = 0; $i < $len; $i++) {
            $ch = $body[$i];
            if ($ch === "'" && ($i === 0 || $body[$i - 1] !== '\\')) {
                $inStr = !$inStr;
            }
            if (!$inStr) {
                if ($ch === '(') {
                    $depth++;
                } elseif ($ch === ')') {
                    $depth--;
                } elseif ($ch === ',' && $depth === 0) {
                    $out[] = $buf;
                    $buf = '';
                    continue;
                }
            }
            $buf .= $ch;
        }
        if (trim($buf) !== '') {
            $out[] = $buf;
        }
        return $out;
    }
}
