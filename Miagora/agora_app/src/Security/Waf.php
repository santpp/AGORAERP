<?php
declare(strict_types=1);

namespace Agora\Security;

use Agora\Http\Request;

/**
 * Cortafuegos de aplicación (WAF) ligero: detecta firmas claras de ataque en la ruta, la consulta,
 * el agente y el cuerpo. Es una capa extra: la protección real son las consultas preparadas, el escape
 * de HTML y la validación. Ante una firma ALTA se rechaza la petición y se registra el evento.
 */
final class Waf
{
    private const PATH = [
        '#\.\./|\.\.\\\\|%2e%2e|%252e#i' => ['ALTA', 'recorrido de carpetas'],
        '#\x00|%00#' => ['ALTA', 'byte nulo'],
        '#(php|file|expect|zip|phar|data|glob)://#i' => ['ALTA', 'envoltura de PHP'],
        '#/etc/(passwd|shadow)|/proc/self#i' => ['ALTA', 'archivos del sistema'],
        '#\.(env|git|svn|htaccess|htpasswd|bak|old|orig|swp|sql|phps)(\b|/|$)#i' => ['ALTA', 'archivo privado'],
        '#(wp-admin|wp-login|xmlrpc\.php|phpmyadmin|adminer|cgi-bin|\.aws|actuator)#i' => ['MEDIA', 'rastreo automático'],
    ];

    private const BODY = [
        '/union(\s|\/\*.*?\*\/|%20)+(all(\s|%20)+)?select/i' => ['ALTA', 'inyección SQL (UNION)'],
        '/\b(information_schema|sys\.user_|pg_sleep|xp_cmdshell|load_file\s*\(|into\s+(out|dump)file)\b/i' => ['ALTA', 'inyección SQL'],
        '/\b(sleep|benchmark)\s*\(\s*\d+/i' => ['ALTA', 'inyección SQL (tiempo)'],
        "/'\s*(or|and)\s*'?\d+'?\s*=\s*'?\d+/i" => ['ALTA', 'inyección SQL (tautología)'],
        '/<\s*script\b|javascript\s*:|\bon(error|load|mouseover|focus)\s*=/i' => ['ALTA', 'inyección de código (XSS)'],
        '/\$\{\s*jndi\s*:/i' => ['ALTA', 'Log4Shell'],
        '/<\?php|\beval\s*\(\s*\$_|base64_decode\s*\(\s*\$_/i' => ['ALTA', 'código PHP'],
    ];

    private const AGENTS = '/(sqlmap|nikto|nmap|masscan|acunetix|nessus|wpscan|dirbuster|gobuster|ffuf|nuclei|zgrab|havij|w3af|openvas)/i';

    /** @return array{severity:string,rule:string,where:string}|null */
    public static function inspect(Request $req, bool $scanBody = true): ?array
    {
        $uri = $req->rawUri !== '' ? $req->rawUri : $req->path;
        foreach (self::PATH as $re => [$sev, $rule]) {
            if (preg_match($re, $uri) || preg_match($re, rawurldecode($uri))) {
                return ['severity' => $sev, 'rule' => $rule, 'where' => 'ruta'];
            }
        }
        $qs = rawurldecode((string) parse_url($uri, PHP_URL_QUERY));
        if ($qs !== '' && ($hit = self::scan($qs))) {
            return $hit + ['where' => 'consulta'];
        }
        if (preg_match(self::AGENTS, $req->userAgent())) {
            return ['severity' => 'MEDIA', 'rule' => 'herramienta de ataque', 'where' => 'agente'];
        }
        if ($scanBody && $req->body !== '' && strlen($req->body) < 4 * 1024 * 1024 && ($hit = self::scan($req->body))) {
            return $hit + ['where' => 'cuerpo'];
        }
        return null;
    }

    private static function scan(string $s): ?array
    {
        foreach (self::BODY as $re => [$sev, $rule]) {
            if (preg_match($re, $s)) {
                return ['severity' => $sev, 'rule' => $rule];
            }
        }
        return null;
    }
}
