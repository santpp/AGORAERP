<?php
declare(strict_types=1);

namespace Agora\Notify;

use Agora\Core\Clock;
use Agora\Core\Db;
use Agora\Core\Env;
use Agora\Core\Log;

/**
 * Envío de correos y WhatsApp. Los códigos OTP salen al instante. Los avisos quedan en la cola (tabla outbox):
 * en una petición web se intentan DESPUÉS de responder (así un servidor de correo lento o caído nunca demora
 * ni bloquea la respuesta, ni siquiera en la trampa del código fuente); lo que no salga lo reintenta la tarea
 * programada cada minuto. Desde la línea de comandos (tareas, herramientas) se envían al momento.
 * MAIL_DRIVER: smtp (producción) · archivo (pruebas: storage/correo/*.jsonl) · nulo
 */
final class Outbox
{
    /** @var list<array<string,mixed>> mensajes enviados en esta ejecución (pruebas) */
    public static array $sent = [];
    /** @var list<array{0:self,1:int}> avisos de esta petición que se intentan después de responder */
    private static array $afterResponse = [];
    /** Si el servidor de correo no respondió en esta ejecución, el resto queda para la tarea programada */
    private static bool $smtpDown = false;

    public function __construct(private Db $db)
    {
    }

    public static function mailConfigured(): bool
    {
        $d = Env::str('MAIL_DRIVER', 'nulo');
        return $d === 'archivo' || ($d === 'smtp' && Env::str('MAIL_HOST') !== '');
    }

    /** Envía ya mismo (lanza excepción si falla). $timeout: segundos para conectar con el servidor de correo. */
    public static function deliverEmail(string $to, string $subject, string $text, ?string $html, int $timeout = 15): void
    {
        $driver = Env::str('MAIL_DRIVER', 'nulo');
        if ($driver === 'archivo') {
            self::devFile('correo', ['to' => $to, 'subject' => $subject, 'text' => $text]);
            return;
        }
        if ($driver !== 'smtp') {
            throw new \RuntimeException('El correo no está configurado en este servidor (MAIL_DRIVER).');
        }
        (new SmtpMailer(
            Env::str('MAIL_HOST', 'smtp.hostinger.com'),
            Env::int('MAIL_PORT', 465),
            Env::str('MAIL_SECURE', 'ssl'),
            Env::str('MAIL_USERNAME'),
            Env::str('MAIL_PASSWORD'),
            Env::str('MAIL_FROM', Env::str('MAIL_USERNAME')),
            Env::str('MAIL_FROM_NAME', 'Agora Digital App'),
            $timeout,
        ))->send($to, $subject, $text, $html);
    }

    /** Código de un solo uso: se envía al instante. En la cola solo queda el registro con el código oculto. */
    public function sendOtp(string $channel, string $dest, string $code, string $purpose, int $minutes, string $ip, string $detail, ?int $orgId): void
    {
        if ($channel === 'WHATSAPP') {
            WhatsApp::sendOtp($dest, $code);
            $logBody = 'Código de verificación enviado por WhatsApp (plantilla de autenticación).';
            $subject = null;
        } else {
            [$subject, $text, $html] = Templates::otp($code, $purpose, $minutes, $ip, $detail);
            self::deliverEmail($dest, $subject, $text, $html);
            $logBody = str_replace(substr($code, 0, 3) . ' ' . substr($code, 3), '••• •••', $text);
        }
        self::$sent[] = ['channel' => $channel, 'to' => $dest, 'code' => Env::isTest() ? $code : null, 'purpose' => $purpose];
        $this->db->insert('outbox', [
            'org_id' => $orgId, 'channel' => $channel, 'destination' => $dest, 'subject' => $subject, 'body' => $logBody, 'template' => 'otp',
            'priority' => 1, 'status' => 'REGISTRO', 'attempts' => 1, 'last_error' => null, 'send_after' => Clock::ts(), 'sent_at' => Clock::ts(), 'created_at' => Clock::ts(),
        ]);
    }

    /** Aviso por correo: queda en la cola; en la web se intenta después de responder, en la terminal al momento. */
    public function email(string $to, string $subject, string $text, ?string $html, string $template, ?int $orgId = null, int $priority = 5): void
    {
        $id = $this->db->insert('outbox', [
            'org_id' => $orgId, 'channel' => 'EMAIL', 'destination' => $to, 'subject' => mb_substr($subject, 0, 200), 'body' => json_encode(['text' => $text, 'html' => $html], JSON_UNESCAPED_UNICODE),
            'template' => $template, 'priority' => $priority, 'status' => 'PENDIENTE', 'attempts' => 0, 'last_error' => null, 'send_after' => Clock::ts(), 'sent_at' => null, 'created_at' => Clock::ts(),
        ]);
        if (PHP_SAPI === 'cli' || Env::isTest()) {
            $this->trySend($id);
            return;
        }
        self::$afterResponse[] = [$this, $id];
    }

    /**
     * Después de responder (App::runDeferred): intenta los avisos de esta petición, como máximo 5 y con
     * 6 segundos para conectar; si el servidor de correo no responde, para y deja el resto a la tarea programada.
     */
    public static function runDeferred(): void
    {
        $jobs = self::$afterResponse;
        self::$afterResponse = [];
        foreach (array_slice($jobs, 0, 5) as [$box, $id]) {
            if (self::$smtpDown) {
                break;
            }
            $box->trySend($id, 6);
        }
    }

    private function trySend(int $id, int $timeout = 15): bool
    {
        $m = $this->db->one('SELECT * FROM outbox WHERE id = ?', [$id]);
        if (!$m || $m['status'] !== 'PENDIENTE') {
            return false;
        }
        $body = json_decode((string) $m['body'], true) ?: ['text' => (string) $m['body'], 'html' => null];
        try {
            self::deliverEmail((string) $m['destination'], (string) $m['subject'], (string) $body['text'], $body['html'] ?? null, $timeout);
            $this->db->update('outbox', ['status' => 'ENVIADO', 'attempts' => (int) $m['attempts'] + 1, 'sent_at' => Clock::ts(), 'last_error' => null], ['id' => $id]);
            self::$sent[] = ['channel' => 'EMAIL', 'to' => $m['destination'], 'subject' => $m['subject'], 'template' => $m['template']];
            return true;
        } catch (\Throwable $e) {
            $att = (int) $m['attempts'] + 1;
            $this->db->update('outbox', [
                'attempts' => $att, 'last_error' => mb_substr($e->getMessage(), 0, 500),
                'status' => $att >= 8 ? 'FALLIDO' : 'PENDIENTE', 'send_after' => Clock::ts(min(3600, 60 * 2 ** $att)),
            ], ['id' => $id]);
            if (str_contains($e->getMessage(), 'No se pudo conectar')) {
                self::$smtpDown = true;
            }
            Log::warn('No se pudo enviar un correo', ['template' => $m['template'], 'error' => $e->getMessage()]);
            return false;
        }
    }

    /** Tarea programada: reintenta lo pendiente */
    public function process(int $limit = 30): array
    {
        $ok = 0;
        $fail = 0;
        foreach ($this->db->all("SELECT id FROM outbox WHERE status = 'PENDIENTE' AND send_after <= ? ORDER BY priority, id LIMIT {$limit}", [Clock::ts()]) as $r) {
            $this->trySend((int) $r['id']) ? $ok++ : $fail++;
        }
        return ['enviados' => $ok, 'fallidos' => $fail];
    }

    /** Solo desarrollo/pruebas: deja el mensaje en storage/correo/ (nunca en producción) */
    public static function devFile(string $kind, array $data): void
    {
        if (Env::isProduction()) {
            throw new \RuntimeException('El modo archivo no se permite en producción.');
        }
        $dir = Env::str('STORAGE_DIR', AGORA_APP . '/storage') . '/correo';
        if (!is_dir($dir)) {
            @mkdir($dir, 0750, true);
        }
        file_put_contents($dir . '/' . $kind . '.jsonl', json_encode($data + ['t' => Clock::ts()], JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
        self::$sent[] = ['channel' => strtoupper($kind)] + $data;
    }
}
