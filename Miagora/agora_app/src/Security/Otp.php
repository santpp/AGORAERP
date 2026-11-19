<?php
declare(strict_types=1);

namespace Agora\Security;

use Agora\Core\Clock;
use Agora\Core\Db;
use Agora\Core\Env;
use Agora\Core\Ids;
use Agora\Http\HttpError;
use Agora\Notify\Outbox;
use Agora\Notify\WhatsApp;

/**
 * Códigos de un solo uso (OTP) por correo o WhatsApp.
 *  · 6 dígitos al azar; se guarda solo HMAC-SHA256(pimienta, desafío|código).
 *  · Vencen (10 min, 5 min en verificaciones), 5 intentos por desafío, máximo 3 envíos y 45 s entre envíos.
 *  · Cada reenvío invalida el código anterior.
 *  · Los desafíos para correos inexistentes son señuelos: responden igual, pero nunca validan (no se revela si la cuenta existe).
 */
final class Otp
{
    public const TTL = ['LOGIN' => 600, 'RECUPERACION' => 600, 'VERIFICACION' => 300, 'CONTACTO' => 600];

    public function __construct(private Db $db, private Outbox $outbox, private RateLimiter $rate)
    {
    }

    /** @param array<string,mixed> $extra action, scope, reason, channel, destination, org_id, session_id */
    public function create(string $purpose, ?int $userId, string $ip, array $extra = []): string
    {
        $id = Ids::ulid();
        $this->db->insert('otp_challenges', [
            'id' => $id, 'user_id' => $userId, 'org_id' => $extra['org_id'] ?? null, 'session_id' => $extra['session_id'] ?? null,
            'purpose' => $purpose, 'action' => $extra['action'] ?? null, 'scope' => $extra['scope'] ?? null, 'reason' => isset($extra['reason']) ? mb_substr((string) $extra['reason'], 0, 255) : null,
            'channel' => $extra['channel'] ?? null, 'destination' => $extra['destination'] ?? null, 'code_hash' => null, 'attempts' => 0, 'max_attempts' => 5,
            'sends' => 0, 'last_sent_at' => null, 'expires_at' => Clock::ts(self::TTL[$purpose] ?? 600), 'verified_at' => null, 'consumed_at' => null,
            'ip' => $ip, 'created_at' => Clock::ts(),
        ]);
        return $id;
    }

    /** Canales disponibles para una persona: [['canal'=>'EMAIL','destino'=>'e***@x.com'], …] */
    public function channelsFor(int $userId): array
    {
        $out = [];
        foreach ($this->db->all('SELECT channel, contact_value FROM user_contacts WHERE user_id = ? AND verified_at IS NOT NULL ORDER BY is_primary DESC, id', [$userId]) as $c) {
            if ($c['channel'] === 'WHATSAPP' && !WhatsApp::configured()) {
                continue;
            }
            if (!isset($out[$c['channel']])) {
                $out[$c['channel']] = ['canal' => $c['channel'], 'destino' => self::mask($c['channel'], (string) $c['contact_value'])];
            }
        }
        return array_values($out);
    }

    /** @var list<callable> envíos diferidos (se hacen después de responder, para que el tiempo de respuesta no delate si la cuenta existe) */
    public static array $deferred = [];

    /**
     * Envía (o reenvía) el código por el canal elegido.
     * Si el desafío trae destino (recuperación o contacto nuevo), el código va SOLO a ese destino.
     * @return array{canal:string,destino:string,vence:string,minutos:int}
     */
    public function send(string $challengeId, string $channel, string $ip, bool $defer = false): array
    {
        $channel = strtoupper($channel);
        if (!in_array($channel, ['EMAIL', 'WHATSAPP'], true)) {
            throw HttpError::badRequest('Elige correo o WhatsApp.');
        }
        $c = $this->load($challengeId);
        $this->rate->enforce('otp:send:ip:' . $ip, 20, 3600, 'Se enviaron demasiados códigos desde esta conexión. Espera un rato.');
        if ((int) $c['sends'] >= 3) {
            throw new HttpError(429, 'DEMASIADOS_ENVIOS', 'Ya se enviaron 3 códigos para esta solicitud. Empieza de nuevo.');
        }
        if ($c['last_sent_at'] && Clock::unix() - strtotime($c['last_sent_at'] . ' UTC') < 45) {
            throw new HttpError(429, 'ESPERA', 'Espera unos segundos antes de pedir otro código.', ['reintentar_en' => 45 - (Clock::unix() - strtotime($c['last_sent_at'] . ' UTC'))]);
        }
        $fixed = $c['destination'] !== null && $c['destination'] !== '';
        if ($fixed && $c['channel'] !== null && $c['channel'] !== $channel) {
            throw HttpError::badRequest($channel === 'WHATSAPP' ? 'Este código se envía al correo que escribiste.' : 'Este código se envía al WhatsApp que escribiste.');
        }
        if ($channel === 'WHATSAPP' && !WhatsApp::configured()) {
            throw new HttpError(503, 'CANAL_NO_DISPONIBLE', 'El envío por WhatsApp no está disponible en este momento. Usa el correo.');
        }
        $code = Ids::numericCode(6);
        $dest = null;
        if ($c['user_id'] !== null) {
            $dest = $fixed ? (string) $c['destination'] : $this->db->value('SELECT contact_value FROM user_contacts WHERE user_id = ? AND channel = ? AND verified_at IS NOT NULL ORDER BY is_primary DESC, id LIMIT 1', [(int) $c['user_id'], $channel]);
            if (!$dest) {
                throw HttpError::badRequest($channel === 'WHATSAPP' ? 'No tienes un WhatsApp verificado. Usa el correo.' : 'No tienes un correo verificado.');
            }
            $this->rate->enforce('otp:send:user:' . $c['user_id'], 10, 3600, 'Pediste demasiados códigos en la última hora. Espera un rato.');
        }
        $this->db->update('otp_challenges', [
            'code_hash' => self::hash($challengeId, $code), 'sends' => (int) $c['sends'] + 1, 'last_sent_at' => Clock::ts(), 'channel' => $channel, 'attempts' => 0,
        ], ['id' => $challengeId]);
        $minutes = intdiv(self::TTL[$c['purpose']] ?? 600, 60);
        if ($dest) {
            $detail = $c['purpose'] === 'VERIFICACION' ? (StepUp::ACTIONS[$c['action']] ?? (string) $c['action']) . ($c['scope'] ? ' (' . $c['scope'] . ')' : '') : '';
            $orgId = $c['org_id'] !== null ? (int) $c['org_id'] : null;
            $job = function () use ($channel, $dest, $code, $c, $minutes, $ip, $detail, $orgId): void {
                $this->outbox->sendOtp($channel, (string) $dest, $code, (string) $c['purpose'], $minutes, $ip, $detail, $orgId);
            };
            if ($defer) {
                self::$deferred[] = static function () use ($job, $channel): void {
                    try {
                        $job();
                    } catch (\Throwable $e) {
                        \Agora\Core\Log::warn('Fallo al enviar OTP (diferido)', ['canal' => $channel, 'error' => $e->getMessage()]);
                    }
                };
            } else {
                try {
                    $job();
                } catch (\Throwable $e) {
                    \Agora\Core\Log::warn('Fallo al enviar OTP', ['canal' => $channel, 'error' => $e->getMessage()]);
                    throw new HttpError(502, 'ENVIO_FALLIDO', $channel === 'WHATSAPP'
                        ? 'No se pudo enviar el código por WhatsApp. Prueba con el correo.'
                        : 'No se pudo enviar el correo con el código. Intenta de nuevo en unos minutos o usa WhatsApp.');
                }
            }
        }
        $shown = $fixed ? (string) $c['destination'] : (string) ($dest ?? '');
        return ['canal' => $channel, 'destino' => $shown !== '' ? self::mask($channel, $shown) : 'el canal registrado', 'vence' => \Agora\App::iso((string) $c['expires_at']), 'minutos' => $minutes];
    }

    /** Ejecuta los envíos diferidos (la app lo llama después de entregar la respuesta) */
    public static function runDeferred(): void
    {
        $jobs = self::$deferred;
        self::$deferred = [];
        foreach ($jobs as $j) {
            $j();
        }
    }

    /** Valida y consume el código. @return array<string,mixed> el desafío (ya consumido) */
    public function verify(string $challengeId, string $code, string $purpose, ?string $sessionId = null): array
    {
        $c = $this->check($challengeId, $code, $purpose, $sessionId);
        return $this->consume($c);
    }

    /** Valida el código sin consumirlo (cuenta el intento). @return array<string,mixed> */
    public function check(string $challengeId, string $code, string $purpose, ?string $sessionId = null): array
    {
        $code = preg_replace('/\D/', '', $code) ?? '';
        $c = $this->load($challengeId);
        if ($c['purpose'] !== $purpose || ($sessionId !== null && $c['session_id'] !== null && $c['session_id'] !== $sessionId)) {
            throw new HttpError(422, 'CODIGO_INVALIDO', 'El código no es válido.');
        }
        if ((int) $c['attempts'] >= (int) $c['max_attempts']) {
            throw new HttpError(429, 'CODIGO_BLOQUEADO', 'Agotaste los intentos de este código. Pide uno nuevo.');
        }
        // el intento se cuenta ANTES de comparar
        $this->db->exec('UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?', [$challengeId]);
        $ok = $c['user_id'] !== null && $c['code_hash'] !== null && strlen($code) === 6 && hash_equals((string) $c['code_hash'], self::hash($challengeId, $code));
        if (!$ok) {
            $left = max(0, (int) $c['max_attempts'] - (int) $c['attempts'] - 1);
            throw new HttpError(422, 'CODIGO_INCORRECTO', $left > 0 ? "Código incorrecto. Te quedan {$left} intento" . ($left === 1 ? '' : 's') . '.' : 'Código incorrecto. Agotaste los intentos: pide uno nuevo.', ['intentos_restantes' => $left]);
        }
        return $c;
    }

    /** @param array<string,mixed> $c desafío validado con check() */
    public function consume(array $c): array
    {
        $n = $this->db->exec('UPDATE otp_challenges SET verified_at = ?, consumed_at = ? WHERE id = ? AND consumed_at IS NULL', [Clock::ts(), Clock::ts(), $c['id']]);
        if ($n !== 1) {
            throw new HttpError(422, 'CODIGO_USADO', 'Este código ya se usó.');
        }
        $c['consumed_at'] = Clock::ts();
        return $c;
    }

    /** Desafío vigente (sin validar código), para comprobar su propósito antes de reenviar */
    public function peek(string $challengeId): array
    {
        return $this->load($challengeId);
    }

    /** @return array<string,mixed> */
    private function load(string $id): array
    {
        if (!preg_match('/^[0-9A-HJKMNP-TV-Z]{26}$/', $id)) {
            throw new HttpError(422, 'DESAFIO_INVALIDO', 'La solicitud de código no es válida. Empieza de nuevo.');
        }
        $c = $this->db->one('SELECT * FROM otp_challenges WHERE id = ?', [$id]);
        if (!$c || $c['consumed_at'] !== null || strcmp((string) $c['expires_at'], Clock::ts()) < 0) {
            throw new HttpError(410, 'DESAFIO_VENCIDO', 'El código venció o ya se usó. Pide uno nuevo.');
        }
        return $c;
    }

    public static function hash(string $challengeId, string $code): string
    {
        return hash_hmac('sha256', $challengeId . '|' . $code, Env::secret('OTP_PEPPER'));
    }

    public static function mask(string $channel, string $v): string
    {
        if ($channel === 'EMAIL') {
            [$u, $d] = array_pad(explode('@', $v, 2), 2, '');
            $show = mb_substr($u, 0, 1) . str_repeat('•', max(2, min(6, mb_strlen($u) - 2))) . (mb_strlen($u) > 2 ? mb_substr($u, -1) : '');
            return $show . '@' . $d;
        }
        $digits = preg_replace('/\D/', '', $v) ?? '';
        return '+' . substr($digits, 0, 2) . ' ••• •••-••' . substr($digits, -2);
    }
}
