<?php
declare(strict_types=1);

namespace Agora\Notify;

use Agora\Core\Env;
use Agora\Core\HttpClient;

/**
 * Códigos por WhatsApp con la API oficial de Meta (WhatsApp Business Cloud API).
 * Requiere una plantilla de categoría AUTENTICACIÓN aprobada con botón "Copiar código"
 * (ver docs/SEGURIDAD.md → "Plantilla de WhatsApp"). El código va en el cuerpo y en el botón.
 */
final class WhatsApp
{
    public static function configured(): bool
    {
        $d = Env::str('WHATSAPP_DRIVER', 'nulo');
        return $d === 'archivo' || ($d === 'cloud' && Env::str('WHATSAPP_TOKEN') !== '' && Env::str('WHATSAPP_PHONE_ID') !== '');
    }

    public static function sendOtp(string $toE164, string $code): string
    {
        $driver = Env::str('WHATSAPP_DRIVER', 'nulo');
        if ($driver === 'archivo') {
            Outbox::devFile('whatsapp', ['to' => $toE164, 'code' => $code]);
            return 'archivo-' . bin2hex(random_bytes(4));
        }
        if ($driver !== 'cloud') {
            throw new \RuntimeException('WhatsApp no está configurado en este servidor.');
        }
        $version = Env::str('WHATSAPP_API_VERSION', 'v25.0');
        if (!preg_match('/^v\d{1,2}\.\d$/', $version)) {
            $version = 'v25.0';
        }
        $url = 'https://graph.facebook.com/' . $version . '/' . rawurlencode(Env::str('WHATSAPP_PHONE_ID')) . '/messages';
        $payload = [
            'messaging_product' => 'whatsapp',
            'recipient_type' => 'individual',
            'to' => ltrim($toE164, '+'),
            'type' => 'template',
            'template' => [
                'name' => Env::str('WHATSAPP_TEMPLATE_OTP', 'agora_codigo_verificacion'),
                'language' => ['code' => Env::str('WHATSAPP_TEMPLATE_LANG', 'es')],
                'components' => [
                    ['type' => 'body', 'parameters' => [['type' => 'text', 'text' => $code]]],
                    ['type' => 'button', 'sub_type' => 'url', 'index' => '0', 'parameters' => [['type' => 'text', 'text' => $code]]],
                ],
            ],
        ];
        $r = HttpClient::json('POST', $url, $payload, ['Authorization' => 'Bearer ' . Env::str('WHATSAPP_TOKEN')], 12);
        if ($r['status'] < 200 || $r['status'] >= 300 || empty($r['json']['messages'][0]['id'])) {
            $err = $r['json']['error']['message'] ?? $r['error'] ?? ('HTTP ' . $r['status']);
            throw new \RuntimeException('WhatsApp no aceptó el mensaje: ' . mb_substr((string) $err, 0, 200));
        }
        return (string) $r['json']['messages'][0]['id'];
    }
}
