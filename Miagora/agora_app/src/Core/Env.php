<?php
declare(strict_types=1);

namespace Agora\Core;

/** Lee agora_app/.env (CLAVE=valor). Las claves secretas nunca salen de aquí hacia el navegador. */
final class Env
{
    /** @var array<string,string> */
    private static array $vars = [];

    public static function load(string $file): void
    {
        if (!is_file($file) || !is_readable($file)) {
            return;
        }
        foreach (file($file, FILE_IGNORE_NEW_LINES) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') {
                continue;
            }
            if (!preg_match('/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/', $line, $m)) {
                continue;
            }
            $v = $m[2];
            $q = $v[0] ?? '';
            if (($q === '"' || $q === "'") && strlen($v) >= 2 && substr($v, -1) === $q) {
                $v = substr($v, 1, -1);
                if ($q === '"') {
                    $v = str_replace(['\\n', '\\"', '\\\\'], ["\n", '"', '\\'], $v);
                }
            } else {
                $v = rtrim((string) preg_replace('/\s+#.*$/', '', $v));
            }
            self::$vars[$m[1]] = $v;
        }
    }

    public static function set(string $key, ?string $value): void
    {
        if ($value === null) {
            unset(self::$vars[$key]);
        } else {
            self::$vars[$key] = $value;
        }
    }

    public static function get(string $key, ?string $default = null): ?string
    {
        if (array_key_exists($key, self::$vars)) {
            return self::$vars[$key];
        }
        $v = getenv($key);
        return $v === false ? $default : $v;
    }

    /** Texto; un valor vacío en el .env (CLAVE=) cuenta como no escrito y usa el valor por defecto */
    public static function str(string $key, string $default = ''): string
    {
        $v = self::get($key);
        return ($v === null || $v === '') ? $default : $v;
    }

    public static function int(string $key, int $default = 0): int
    {
        $v = self::get($key);
        return ($v === null || $v === '' || !is_numeric($v)) ? $default : (int) $v;
    }

    public static function bool(string $key, bool $default = false): bool
    {
        $v = self::get($key);
        if ($v === null || $v === '') {
            return $default;
        }
        return in_array(strtolower($v), ['1', 'true', 'si', 'sí', 'yes', 'on'], true);
    }

    /** Secreto obligatorio de al menos 32 caracteres (APP_KEY, AUDIT_KEY, BACKUP_KEY…) */
    public static function secret(string $key): string
    {
        $v = (string) self::get($key, '');
        if (strlen($v) < 32) {
            throw new \RuntimeException("Falta el secreto {$key} en el .env (mínimo 32 caracteres). Ejecuta tools/instalar.php.");
        }
        return $v;
    }

    public static function isProduction(): bool
    {
        // solo "development" y "test" relajan algo; cualquier otro valor (o vacío) es producción
        return !in_array(self::str('APP_ENV', 'production'), ['development', 'test'], true);
    }

    public static function isTest(): bool
    {
        return self::str('APP_ENV') === 'test';
    }
}
