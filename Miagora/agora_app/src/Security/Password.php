<?php
declare(strict_types=1);

namespace Agora\Security;

use Agora\Http\HttpError;

/** Claves: Argon2id (parámetros mínimos de OWASP: 19 MiB, 2 pasadas) y política de calidad. */
final class Password
{
    private const COMMON = ['12345678', '123456789', '1234567890', '0123456789', 'password', 'password1', 'contraseña', 'contrasena', 'qwerty123', 'qwertyuiop', 'abc12345', 'abcd1234', '11111111', '00000000', 'iloveyou', 'admin123', 'administrador', 'superadmin', 'venezuela', 'venezuela1', 'caracas123', 'agora123', 'agoradigital', 'agora2026', 'bolivares', 'binance123', 'dolar1234', 'clave1234', 'clave12345', 'micontraseña', 'mipassword', 'bienvenido', 'bienvenido1', 'cambiame', 'sinclave', 'teamo1234', 'q1w2e3r4t5', '1q2w3e4r5t', 'zaq12wsx', 'passw0rd', 'p@ssw0rd', 'p@ssword', 'letmein123', 'welcome123', 'football1', 'monkey123', 'dragon123', 'master123', 'sunshine1', 'princess1'];

    public static function hash(string $plain): string
    {
        if (defined('PASSWORD_ARGON2ID')) {
            return password_hash($plain, PASSWORD_ARGON2ID, ['memory_cost' => 19456, 'time_cost' => 2, 'threads' => 1]);
        }
        return password_hash($plain, PASSWORD_BCRYPT, ['cost' => 12]);
    }

    public static function verify(string $plain, ?string $hash): bool
    {
        if ($hash === null || $hash === '') {
            // mismo tiempo aunque el usuario no exista (evita adivinar correos por el tiempo de respuesta)
            static $dummy = null;
            $dummy ??= self::hash(bin2hex(random_bytes(16)));
            password_verify($plain, $dummy);
            return false;
        }
        return password_verify($plain, $hash);
    }

    public static function needsRehash(string $hash): bool
    {
        return defined('PASSWORD_ARGON2ID')
            ? password_needs_rehash($hash, PASSWORD_ARGON2ID, ['memory_cost' => 19456, 'time_cost' => 2, 'threads' => 1])
            : password_needs_rehash($hash, PASSWORD_BCRYPT, ['cost' => 12]);
    }

    /** Lanza un error con el motivo si la clave no cumple la política */
    public static function assertPolicy(string $plain, string $email = '', string $name = ''): void
    {
        $len = mb_strlen($plain);
        if ($len < 10) {
            throw HttpError::badRequest('La clave debe tener al menos 10 caracteres. Una frase corta es más fácil de recordar y más segura.', ['campo' => 'clave']);
        }
        if ($len > 128) {
            throw HttpError::badRequest('La clave es demasiado larga (máximo 128 caracteres).', ['campo' => 'clave']);
        }
        $low = mb_strtolower($plain);
        if (in_array($low, self::COMMON, true) || preg_match('/^(.)\1+$/u', $plain) || preg_match('/^(0123456789|1234567890|abcdefghij)/', $low)) {
            throw HttpError::badRequest('Esa clave es muy común. Elige otra.', ['campo' => 'clave']);
        }
        $local = strtolower(strstr($email, '@', true) ?: '');
        if (strlen($local) >= 4 && str_contains($low, $local)) {
            throw HttpError::badRequest('La clave no puede contener tu correo.', ['campo' => 'clave']);
        }
        foreach (preg_split('/\s+/', mb_strtolower($name)) ?: [] as $part) {
            if (mb_strlen($part) >= 4 && str_contains($low, $part)) {
                throw HttpError::badRequest('La clave no puede contener tu nombre.', ['campo' => 'clave']);
            }
        }
    }
}
