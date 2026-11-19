<?php
declare(strict_types=1);

namespace Agora\Security;

use Agora\Core\Env;
use Agora\Http\Response;

/** Cabeceras de seguridad para la API y para la página de la app (CSP estricta con nonce). */
final class Headers
{
    public static function common(Response $r): void
    {
        $r->headers += [
            'X-Content-Type-Options' => 'nosniff',
            'Referrer-Policy' => 'strict-origin-when-cross-origin',
            'Cross-Origin-Opener-Policy' => 'same-origin',
            'Cross-Origin-Resource-Policy' => 'same-origin',
            'Permissions-Policy' => 'camera=(), geolocation=(), payment=(), usb=(), microphone=(self)',
            'X-Robots-Tag' => 'noindex, nofollow',
        ];
        if (Env::bool('COOKIE_SECURE', true)) {
            $r->headers += ['Strict-Transport-Security' => 'max-age=' . Env::int('HSTS_MAX_AGE', 31536000) . (Env::bool('HSTS_SUBDOMAINS') ? '; includeSubDomains' : '')];
        }
    }

    public static function api(Response $r): void
    {
        self::common($r);
        $r->headers += [
            'Cache-Control' => 'no-store',
            'Pragma' => 'no-cache',
            'X-Frame-Options' => 'DENY',
            'Content-Security-Policy' => "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        ];
    }

    /** Página principal: los scripts solo corren si traen el nonce de esta respuesta. */
    public static function page(Response $r, string $nonce): void
    {
        self::common($r);
        $r->headers += [
            'Cache-Control' => 'no-store',
            'X-Frame-Options' => 'SAMEORIGIN',
            'Content-Security-Policy' => implode('; ', [
                "default-src 'self'",
                "script-src 'nonce-{$nonce}' 'strict-dynamic'",
                "style-src 'self' 'unsafe-inline'",
                "img-src 'self' data: blob:",
                "font-src 'self' data:",
                "connect-src 'self'",
                "media-src 'self' data: blob:",
                "frame-src 'self' blob: data:",
                "worker-src 'self' blob:",
                "manifest-src 'self'",
                "object-src 'none'",
                "base-uri 'none'",
                "form-action 'self'",
                "frame-ancestors 'self'",
            ]),
        ];
    }

    /** Representación imprimible de una factura (sin scripts) */
    public static function document(Response $r): void
    {
        self::common($r);
        $r->headers += [
            'Cache-Control' => 'no-store',
            'Content-Security-Policy' => "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'",
        ];
    }
}
