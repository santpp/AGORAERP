<?php
declare(strict_types=1);

namespace Agora\Notify;

use Agora\Core\Env;

/** Textos de los correos (español venezolano, tuteo). Todo dato variable se escapa. */
final class Templates
{
    private const PURPOSE = [
        'LOGIN' => 'entrar a Agora Digital App',
        'RECUPERACION' => 'crear una clave nueva',
        'VERIFICACION' => 'autorizar una acción protegida',
        'CONTACTO' => 'verificar este canal',
    ];

    /** @return array{0:string,1:string,2:string} asunto, texto, html */
    public static function otp(string $code, string $purpose, int $minutes, string $ip, string $detail = ''): array
    {
        $what = self::PURPOSE[$purpose] ?? 'verificar tu identidad';
        $pretty = substr($code, 0, 3) . ' ' . substr($code, 3);
        $subject = 'Tu código de verificación de Agora Digital App';
        $text = "Tu código para {$what} es: {$pretty}\n\n"
            . ($detail !== '' ? "Acción: {$detail}\n" : '')
            . "Vence en {$minutes} minutos y solo sirve una vez.\nSolicitado desde la IP {$ip}.\n\n"
            . "Si no fuiste tú, no compartas este código con nadie y avisa a tu administrador: alguien podría estar intentando entrar a tu cuenta.\n"
            . "Agora Digital nunca te pedirá este código por teléfono ni por chat.";
        $html = self::layout('Código de verificación', '<p>Tu código para <b>' . self::e($what) . '</b> es:</p>'
            . '<p style="font:700 34px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:6px;margin:18px 0;color:#1D1D1F">' . self::e($pretty) . '</p>'
            . ($detail !== '' ? '<p><b>Acción:</b> ' . self::e($detail) . '</p>' : '')
            . '<p>Vence en ' . $minutes . ' minutos y solo sirve una vez. Solicitado desde la IP ' . self::e($ip) . '.</p>'
            . '<p style="color:#6E6E73">Si no fuiste tú, no compartas este código y avisa a tu administrador. Agora Digital nunca te pedirá este código por teléfono ni por chat.</p>');
        return [$subject, $text, $html];
    }

    /** @param list<array<string,mixed>> $events */
    public static function securityAlert(string $title, array $events, string $summary): array
    {
        $rows = '';
        $text = $summary . "\n\n";
        foreach (array_slice($events, 0, 25) as $e) {
            $line = ($e['created_at'] ?? '') . ' UTC · ' . ($e['severity'] ?? '') . ' · ' . ($e['event_type'] ?? '') . ' · IP ' . ($e['ip'] ?? '') . ' · ' . ($e['http_method'] ?? '') . ' ' . ($e['path'] ?? '');
            $text .= '- ' . $line . "\n";
            $rows .= '<tr><td style="padding:6px 8px;border-top:1px solid #E5E5EA">' . self::e((string) ($e['created_at'] ?? '')) . '</td><td style="padding:6px 8px;border-top:1px solid #E5E5EA"><b>' . self::e((string) ($e['severity'] ?? '')) . '</b></td><td style="padding:6px 8px;border-top:1px solid #E5E5EA">' . self::e((string) ($e['event_type'] ?? '')) . '</td><td style="padding:6px 8px;border-top:1px solid #E5E5EA">' . self::e((string) ($e['ip'] ?? '')) . '</td><td style="padding:6px 8px;border-top:1px solid #E5E5EA;word-break:break-all">' . self::e(($e['http_method'] ?? '') . ' ' . ($e['path'] ?? '')) . '</td></tr>';
        }
        $text .= "\nRevisa Ajustes → Seguridad en la app. Las direcciones que insisten se bloquean solas.";
        $html = self::layout($title, '<p>' . self::e($summary) . '</p><table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="text-align:left;color:#6E6E73"><th style="padding:6px 8px">Hora (UTC)</th><th style="padding:6px 8px">Gravedad</th><th style="padding:6px 8px">Tipo</th><th style="padding:6px 8px">IP</th><th style="padding:6px 8px">Solicitud</th></tr>' . $rows . '</table><p style="color:#6E6E73">Revisa <b>Ajustes → Seguridad</b> en la app. Las direcciones que insisten se bloquean solas.</p>');
        return ['[Seguridad] ' . $title, $text, $html];
    }

    public static function simple(string $subject, string $title, string $paragraphs): array
    {
        $text = trim(strip_tags(str_replace(['</p>', '<br>'], ["\n\n", "\n"], $paragraphs)));
        return [$subject, html_entity_decode($text, ENT_QUOTES, 'UTF-8'), self::layout($title, $paragraphs)];
    }

    public static function invitation(string $orgName, string $role, string $link, string $inviter, int $days = 7): array
    {
        return self::simple(
            'Te invitaron a ' . $orgName . ' en Agora Digital App',
            'Tienes una invitación',
            '<p>' . self::e($inviter) . ' te invitó a <b>' . self::e($orgName) . '</b> en Agora Digital App con el rol <b>' . self::e($role) . '</b>.</p>'
            . '<p><a href="' . self::e($link) . '" style="display:inline-block;background:#AD103C;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">Aceptar la invitación</a></p>'
            . '<p style="color:#6E6E73;font-size:13px">Si el botón no abre, copia este enlace en tu navegador:<br>' . self::e($link) . '</p>'
            . '<p style="color:#6E6E73">El enlace vence en ' . $days . ' día' . ($days === 1 ? '' : 's') . ' y solo sirve una vez. Si no esperabas esta invitación, ignora este correo.</p>'
        );
    }

    public static function e(string $s): string
    {
        return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    private static function layout(string $title, string $inner): string
    {
        $app = self::e(Env::str('APP_URL', 'https://agoradigital.app'));
        return '<!doctype html><html lang="es"><body style="margin:0;background:#F5F5F7;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;color:#1D1D1F">'
            . '<div style="max-width:560px;margin:0 auto;padding:28px 16px"><div style="background:#fff;border-radius:22px;padding:28px 26px">'
            . '<p style="margin:0 0 6px;color:#AD103C;font-weight:700;font-size:13px">Agora Digital App</p>'
            . '<h1 style="margin:0 0 14px;font-size:22px;letter-spacing:-.02em">' . self::e($title) . '</h1>'
            . '<div style="font-size:15px;line-height:1.5">' . $inner . '</div></div>'
            . '<p style="color:#86868B;font-size:12px;text-align:center;margin-top:16px">Agora Digital · <a href="' . $app . '" style="color:#86868B">' . $app . '</a> · Cada conversación, una oportunidad.</p>'
            . '</div></body></html>';
    }
}
