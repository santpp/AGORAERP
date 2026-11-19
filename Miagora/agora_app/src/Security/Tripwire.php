<?php
declare(strict_types=1);

namespace Agora\Security;

use Agora\Core\Clock;
use Agora\Core\Db;
use Agora\Http\Request;
use Agora\Http\Response;

/**
 * Trampa de código fuente. El .htaccess envía aquí toda petición a archivos privados (.env, .git, código PHP
 * del servidor, carpetas internas, respaldos, .sql…) y a rutas típicas de escáneres.
 *  · ALTA (rutas propias de Agora o archivos privados): correo inmediato a los administradores.
 *  · MEDIA (escáneres genéricos de internet): se cuentan y van en el resumen diario.
 *  · Bloqueo automático de la IP (en una hora): 2 intentos graves en la trampa → 24 horas;
 *    5 ataques graves frenados por el cortafuegos o 15 rastreos medios → 2 horas.
 * Siempre responde 404, sin pistas.
 */
final class Tripwire
{
    private const HIGH = '#(^|/)(\.env|\.git|\.svn|\.htaccess|\.htpasswd|agora_app|storage|database|tools|cron|src|templates|vendor|node_modules|composer\.(json|lock)|bootstrap\.php|migrate\.php)|\.(sql|bak|old|orig|swp|zip|tar|gz|7z|agbk|log|ini|phps|php~|inc)$|phpinfo|\.\./|php://#i';

    public function __construct(private Db $db, private Alerts $alerts, private IpGuard $ip)
    {
    }

    /** @param array<string,mixed>|null $s sesión de quien hizo la petición (si tenía una) */
    public function handle(Request $req, ?array $s = null): Response
    {
        $uri = $req->rawUri !== '' ? $req->rawUri : $req->path;
        $severity = self::severityOf($uri);
        $this->record($req, $severity, 'TRAMPA', ['ruta' => mb_substr($uri, 0, 255)] + ($s ? ['usuario' => (string) $s['email']] : []), $s);
        $r = Response::html('<!doctype html><html lang="es"><meta charset="utf-8"><title>No encontrado</title><body style="font-family:system-ui;padding:40px;color:#1D1D1F"><h1>404</h1><p>No encontrado.</p></body></html>', 404);
        Headers::document($r);
        return $r;
    }

    public static function severityOf(string $uri): string
    {
        return preg_match(self::HIGH, rawurldecode($uri)) ? 'ALTA' : 'MEDIA';
    }

    /** @param array<string,mixed>|null $s */
    public function record(Request $req, string $severity, string $type, array $detail, ?array $s = null): void
    {
        $orgId = $s && $s['org_id'] !== null ? (int) $s['org_id'] : null;
        $userId = $s ? (int) $s['user_id'] : null;
        $this->alerts->event($type, $severity, $req->ip, $req->method, $req->rawUri !== '' ? $req->rawUri : $req->path, $req->userAgent(), $detail, $orgId, $userId);
        $since = Clock::ts(-3600);
        // la trampa (pedir .env, código o respaldos) no tiene falsos positivos: 2 intentos graves bastan.
        // El cortafuegos puede confundirse con un texto raro, así que es más tolerante (5 graves).
        $trapHigh = (int) $this->db->value("SELECT COUNT(*) FROM security_events WHERE ip = ? AND created_at >= ? AND severity IN ('ALTA','CRITICA') AND event_type = 'TRAMPA'", [$req->ip, $since]);
        $wafHigh = (int) $this->db->value("SELECT COUNT(*) FROM security_events WHERE ip = ? AND created_at >= ? AND severity IN ('ALTA','CRITICA') AND event_type = 'WAF'", [$req->ip, $since]);
        $med = (int) $this->db->value("SELECT COUNT(*) FROM security_events WHERE ip = ? AND created_at >= ? AND severity = 'MEDIA'", [$req->ip, $since]);
        $block = $trapHigh >= 2 || $wafHigh >= 5 || $med >= 15;
        if ($block && !$this->ip->isBlocked($req->ip)) {
            $hours = $trapHigh >= 2 ? 24 : 2;
            $this->ip->block($req->ip, "Bloqueo automático: {$trapHigh} intento(s) de leer archivos privados, {$wafHigh} ataque(s) frenados y {$med} rastreo(s) en una hora", 'ALTA', $hours * 60);
            $this->alerts->event('BLOQUEO_IP', 'ALTA', $req->ip, $req->method, $req->path, $req->userAgent(), ['motivo' => $type === 'TRAMPA' ? 'trampa de código fuente' : 'cortafuegos', 'horas' => $hours, 'trampa' => $trapHigh, 'waf' => $wafHigh, 'medios' => $med], $orgId, $userId);
        }
    }
}
