<?php
declare(strict_types=1);

namespace Agora\Security;

use Agora\Core\Env;
use Agora\Http\HttpError;
use Agora\Http\Request;

/**
 * Protección contra la falsificación de peticiones (CSRF), en tres capas:
 *  1) cookie SameSite=Strict, 2) el origen de la petición debe ser el propio dominio,
 *  3) token por sesión en la cabecera X-CSRF-Token (un formulario de otro sitio no puede ponerla).
 */
final class Csrf
{
    public static function checkOrigin(Request $req): void
    {
        $allowed = self::allowedOrigins();
        $origin = $req->header('origin');
        if ($origin === '' || $origin === 'null') {
            $ref = $req->header('referer');
            $origin = $ref !== '' ? self::originOf($ref) : '';
        }
        if ($origin === '' || !in_array(strtolower(rtrim($origin, '/')), $allowed, true)) {
            throw new HttpError(403, 'ORIGEN_NO_PERMITIDO', 'La solicitud no viene de la aplicación.');
        }
    }

    public static function verify(Request $req, array $session): void
    {
        self::checkOrigin($req);
        $sent = $req->header('x-csrf-token');
        if ($sent === '' || !hash_equals((string) $session['csrf_token'], $sent)) {
            throw new HttpError(403, 'CSRF', 'Tu sesión cambió. Recarga la página e inténtalo de nuevo.');
        }
    }

    /** @return list<string> */
    public static function allowedOrigins(): array
    {
        $list = [self::originOf(Env::str('APP_URL', 'https://agoradigital.app'))];
        foreach (array_filter(array_map('trim', explode(',', Env::str('APP_EXTRA_ORIGINS')))) as $o) {
            $list[] = self::originOf($o);
        }
        return array_values(array_unique(array_filter($list)));
    }

    public static function originOf(string $url): string
    {
        $p = parse_url($url);
        if (!$p || empty($p['scheme']) || empty($p['host'])) {
            return '';
        }
        $port = isset($p['port']) && !in_array([$p['scheme'], $p['port']], [['https', 443], ['http', 80]], true) ? ':' . $p['port'] : '';
        return strtolower($p['scheme'] . '://' . $p['host'] . $port);
    }
}
