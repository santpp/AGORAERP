<?php
declare(strict_types=1);

namespace Agora\Core;

/** Registro en storage/logs/AAAA-MM-DD.log (una línea JSON por evento). Nunca guarda claves ni códigos. */
final class Log
{
    private static string $requestId = '';

    public static function requestId(): string
    {
        return self::$requestId !== '' ? self::$requestId : (self::$requestId = substr(Ids::token(9), 0, 12));
    }

    public static function info(string $msg, array $ctx = []): void
    {
        self::write('info', $msg, $ctx);
    }

    public static function warn(string $msg, array $ctx = []): void
    {
        self::write('warn', $msg, $ctx);
    }

    public static function error(string $msg, array $ctx = []): void
    {
        self::write('error', $msg, $ctx);
    }

    private static function write(string $level, string $msg, array $ctx): void
    {
        $dir = Env::str('LOG_DIR', Env::str('STORAGE_DIR', AGORA_APP . '/storage') . '/logs');
        if (!is_dir($dir)) {
            @mkdir($dir, 0750, true);
        }
        $line = json_encode([
            't' => Clock::ts(), 'lvl' => $level, 'rid' => self::requestId(), 'msg' => $msg, 'ctx' => self::redact($ctx),
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
        @file_put_contents($dir . '/' . gmdate('Y-m-d') . '.log', $line . "\n", FILE_APPEND | LOCK_EX);
    }

    private static function redact(array $ctx): array
    {
        foreach ($ctx as $k => $v) {
            if (is_string($k) && preg_match('/clave|password|codigo|code|token|secret|grant|autorizacion/i', $k)) {
                $ctx[$k] = '[oculto]';
            } elseif (is_array($v)) {
                $ctx[$k] = self::redact($v);
            }
        }
        return $ctx;
    }
}
