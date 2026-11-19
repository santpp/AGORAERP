<?php
declare(strict_types=1);

namespace Agora\Security;

use Agora\Core\Clock;
use Agora\Core\Db;
use Agora\Core\Env;
use Agora\Core\Log;
use Agora\Notify\Outbox;
use Agora\Notify\Templates;

/**
 * Avisos por correo a los administradores.
 *  · Plataforma (intentos de leer código, integridad, bloqueos): ALERT_EMAILS + personas con is_platform_admin.
 *  · Empresa (mes reabierto, dato cerrado cambiado, factura anulada): sus Superadministradores.
 * Se agrupan para no inundar el correo: como máximo un aviso por IP y tipo cada 30 minutos y 30 por hora en total.
 */
final class Alerts
{
    public function __construct(private Db $db, private Outbox $outbox, private RateLimiter $rate)
    {
    }

    /** @return list<string> */
    public function platformRecipients(): array
    {
        $list = array_filter(array_map('trim', explode(',', Env::str('ALERT_EMAILS'))), fn ($e) => filter_var($e, FILTER_VALIDATE_EMAIL));
        foreach ($this->db->all("SELECT email FROM users WHERE is_platform_admin = 1 AND status = 'ACTIVO'") as $r) {
            $list[] = (string) $r['email'];
        }
        return array_values(array_unique(array_map('strtolower', $list)));
    }

    /** @return list<string> */
    public function orgAdmins(int $orgId): array
    {
        return array_map(fn ($r) => (string) $r['email'], $this->db->all(
            "SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND m.role = 'SUPERADMIN' AND m.status = 'ACTIVA' AND u.status = 'ACTIVO'",
            [$orgId]
        ));
    }

    /** Registra un evento de seguridad y avisa si es grave. */
    public function event(string $type, string $severity, string $ip, string $method, string $path, string $ua, array $detail = [], ?int $orgId = null, ?int $userId = null, bool $notify = true): int
    {
        $id = $this->db->insert('security_events', [
            'org_id' => $orgId, 'user_id' => $userId, 'event_type' => $type, 'severity' => $severity, 'ip' => $ip, 'http_method' => mb_substr($method, 0, 8),
            'path' => mb_substr($path, 0, 255), 'user_agent' => mb_substr($ua, 0, 255), 'detail' => $detail ? json_encode($detail, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR) : null,
            'notified_at' => null, 'created_at' => Clock::ts(),
        ]);
        if ($notify && in_array($severity, ['ALTA', 'CRITICA'], true)) {
            $this->notifyPlatform($id);
        }
        return $id;
    }

    private function notifyPlatform(int $eventId): void
    {
        $e = $this->db->one('SELECT * FROM security_events WHERE id = ?', [$eventId]);
        if (!$e) {
            return;
        }
        $recent = $this->db->value('SELECT COUNT(*) FROM security_events WHERE ip = ? AND event_type = ? AND notified_at IS NOT NULL AND created_at >= ?', [$e['ip'], $e['event_type'], Clock::ts(-1800)]);
        if ($e['severity'] !== 'CRITICA' && (int) $recent > 0) {
            return; // ya se avisó por esta IP y tipo hace menos de 30 minutos (lo demás va en el resumen diario)
        }
        if (!$this->rate->hit('alert:global', 30, 3600)['allowed']) {
            return;
        }
        $to = $this->platformRecipients();
        if ($e['org_id'] !== null) {
            // si la persona tenía sesión, también se avisa a los superadministradores de su empresa
            $to = array_values(array_unique(array_merge($to, array_map('strtolower', $this->orgAdmins((int) $e['org_id'])))));
        }
        if (!$to) {
            Log::warn('Evento de seguridad sin destinatarios (configura ALERT_EMAILS)', ['evento' => $eventId]);
            return;
        }
        $burst = $this->db->all('SELECT * FROM security_events WHERE ip = ? AND created_at >= ? ORDER BY id DESC LIMIT 25', [$e['ip'], Clock::ts(-3600)]);
        $title = match ($e['event_type']) {
            'TRAMPA' => 'Intento de acceder al código o a archivos privados',
            'INTEGRIDAD' => 'Archivos del sistema modificados',
            'WAF' => 'Ataque bloqueado en la API',
            'BLOQUEO_IP' => 'Dirección IP bloqueada',
            'LOGIN_FUERZA' => 'Intentos repetidos de entrar a una cuenta',
            'OTP_ABUSO' => 'Intentos repetidos de adivinar códigos',
            default => 'Evento de seguridad',
        };
        $summary = "Se registró un evento de gravedad {$e['severity']} desde la IP {$e['ip']} ({$e['http_method']} {$e['path']}). En la última hora esa IP generó " . count($burst) . ' evento(s).';
        [$subject, $text, $html] = Templates::securityAlert($title, $burst, $summary);
        foreach ($to as $email) {
            $this->outbox->email($email, $subject, $text, $html, 'alerta_seguridad', null, 1);
        }
        $this->db->update('security_events', ['notified_at' => Clock::ts()], ['id' => $eventId]);
    }

    /** Aviso a los superadministradores de una empresa */
    public function org(int $orgId, string $subject, string $title, string $htmlParagraphs): void
    {
        [$s, $t, $h] = Templates::simple($subject, $title, $htmlParagraphs);
        foreach ($this->orgAdmins($orgId) as $email) {
            $this->outbox->email($email, $s, $t, $h, 'aviso_empresa', $orgId, 3);
        }
    }

    /** Resumen diario de eventos medios y bajos (tarea programada) */
    public function dailyDigest(): int
    {
        $rows = $this->db->all("SELECT * FROM security_events WHERE created_at >= ? AND severity IN ('BAJA','MEDIA') ORDER BY id DESC LIMIT 200", [Clock::ts(-86400)]);
        if (!$rows) {
            return 0;
        }
        $ips = count(array_unique(array_column($rows, 'ip')));
        [$s, $t, $h] = Templates::securityAlert('Resumen de seguridad de las últimas 24 horas', $rows, count($rows) . " eventos de gravedad baja o media desde {$ips} dirección(es) IP (rastreos automáticos de internet, en su mayoría). No requieren acción si no hay eventos graves.");
        foreach ($this->platformRecipients() as $email) {
            $this->outbox->email($email, $s, $t, $h, 'resumen_seguridad', null, 6);
        }
        return count($rows);
    }
}
