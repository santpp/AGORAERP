<?php
declare(strict_types=1);

namespace Agora\Security;

use Agora\Core\Clock;
use Agora\Core\Db;
use Agora\Core\Env;
use Agora\Core\Ids;
use Agora\Http\HttpError;
use Agora\Http\Request;

/**
 * Verificación reforzada: para tocar datos cerrados o hacer acciones sensibles hace falta un OTP reciente.
 * El OTP correcto entrega una autorización (token) limitada a la acción, al alcance (p. ej. "periodo:2026-09"),
 * a la sesión y a 10 minutos. El navegador la envía en la cabecera X-Agora-Autorizacion.
 */
final class StepUp
{
    public const ACTIONS = [
        'DATOS_CERRADOS' => 'Cambiar datos de un mes cerrado',
        'PERIODO_CERRAR' => 'Cerrar un mes',
        'PERIODO_REABRIR' => 'Reabrir un mes cerrado',
        'FACTURA_ANULAR' => 'Anular un documento fiscal emitido',
        'NOTA_EMITIR' => 'Emitir una nota de crédito o débito',
        'COBRO_REVERTIR' => 'Revertir un cobro registrado',
        'RECIBO_CAMBIAR' => 'Cambiar o anular un recibo emitido',
        'PERFIL_FISCAL' => 'Cambiar los datos fiscales de la empresa',
        'RANGO_CONTROL' => 'Registrar números de control de la imprenta',
        'USUARIO_ROL' => 'Cambiar el rol o el acceso de una persona',
        'USUARIO_INVITAR' => 'Invitar a una persona con rol de dirección',
        'CONTACTO' => 'Cambiar tu correo o WhatsApp de verificación',
        'MFA' => 'Cambiar tu verificación en dos pasos',
        'EXPORTAR' => 'Exportar todos los datos de la empresa',
        'IMPORTAR' => 'Importar datos de la edición local',
        'IP_DESBLOQUEAR' => 'Desbloquear una dirección IP',
    ];

    public function __construct(private Db $db, private Otp $otp)
    {
    }

    public static function minutes(): int
    {
        return max(2, min(30, Env::int('STEPUP_MINUTES', 10)));
    }

    /** Crea el desafío y envía el código. @return array<string,mixed> */
    public function request(array $session, Request $req, string $action, string $scope, ?string $reason, ?string $channel): array
    {
        if (!isset(self::ACTIONS[$action])) {
            throw HttpError::badRequest('Acción no reconocida.');
        }
        if (!preg_match('/^[a-z_]+:[A-Za-z0-9,:_.-]{1,100}$/', $scope)) {
            throw HttpError::badRequest('Alcance no válido.');
        }
        $channels = $this->otp->channelsFor((int) $session['user_id']);
        if (!$channels) {
            throw new HttpError(409, 'SIN_CANAL', 'No tienes un correo ni un WhatsApp verificado para recibir el código.');
        }
        $ch = $channel ? strtoupper($channel) : null;
        if (!$ch || !in_array($ch, array_column($channels, 'canal'), true)) {
            $pref = $this->db->value('SELECT mfa_channel FROM users WHERE id = ?', [(int) $session['user_id']]);
            $ch = $pref && in_array($pref, array_column($channels, 'canal'), true) ? (string) $pref : $channels[0]['canal'];
        }
        $id = $this->otp->create('VERIFICACION', (int) $session['user_id'], $req->ip, [
            'org_id' => $session['org_id'], 'session_id' => $session['id'], 'action' => $action, 'scope' => $scope, 'reason' => $reason,
        ]);
        $sent = $this->otp->send($id, $ch, $req->ip);
        return ['desafio' => $id, 'accion' => $action, 'descripcion' => self::ACTIONS[$action], 'alcance' => $scope, 'canales' => $channels] + $sent;
    }

    /** @return array{autorizacion:string,vence:string,accion:string,alcance:string} */
    public function confirm(array $session, string $challengeId, string $code): array
    {
        $c = $this->otp->verify($challengeId, $code, 'VERIFICACION', (string) $session['id']);
        if ((int) $c['user_id'] !== (int) $session['user_id']) {
            throw new HttpError(422, 'CODIGO_INVALIDO', 'El código no es válido.');
        }
        $token = Ids::token(32);
        $exp = Clock::ts(self::minutes() * 60);
        $this->db->insert('step_up_grants', [
            'id' => Ids::sha256($token), 'user_id' => (int) $session['user_id'], 'org_id' => (int) $session['org_id'], 'session_id' => (string) $session['id'],
            'challenge_id' => $challengeId, 'action' => (string) $c['action'], 'scope' => (string) $c['scope'], 'reason' => $c['reason'], 'uses' => 0,
            'created_at' => Clock::ts(), 'expires_at' => $exp,
        ]);
        return ['autorizacion' => $token, 'vence' => \Agora\App::iso($exp), 'accion' => (string) $c['action'], 'alcance' => (string) $c['scope'], 'minutos' => self::minutes()];
    }

    /**
     * Devuelve la autorización vigente que cubre la acción y TODO el alcance pedido, o null.
     * $scope puede ser "periodo:2026-08,2026-09": la autorización debe incluir cada valor.
     * @return array<string,mixed>|null
     */
    public function find(Request $req, array $session, string $action, string $scope): ?array
    {
        // la app puede mandar varias autorizaciones separadas por coma (p. ej. mes cerrado + revertir un cobro)
        $raw = $req->header('x-agora-autorizacion');
        if ($raw === '' || strlen($raw) > 400) {
            return null;
        }
        foreach (array_slice(array_filter(array_map('trim', explode(',', $raw))), 0, 5) as $tok) {
            if (strlen($tok) > 64) {
                continue;
            }
            $g = $this->db->one('SELECT * FROM step_up_grants WHERE id = ?', [Ids::sha256($tok)]);
            if (!$g || $g['session_id'] !== $session['id'] || (int) $g['user_id'] !== (int) $session['user_id'] || $g['action'] !== $action || strcmp((string) $g['expires_at'], Clock::ts()) < 0) {
                continue;
            }
            if (!self::covers((string) $g['scope'], $scope)) {
                continue;
            }
            $this->db->exec('UPDATE step_up_grants SET uses = uses + 1 WHERE id = ?', [$g['id']]);
            return $g;
        }
        return null;
    }

    /** Exige autorización; si no hay, responde 423 para que la app pida el código. */
    public function require(Request $req, array $session, string $action, string $scope, bool $needsReason = false): array
    {
        $g = $this->find($req, $session, $action, $scope);
        if ($g) {
            if ($needsReason && trim((string) $g['reason']) === '') {
                throw HttpError::badRequest('Indica el motivo en la verificación.');
            }
            return $g;
        }
        throw new HttpError(423, 'VERIFICACION_REQUERIDA', self::ACTIONS[$action] . ': confirma con el código que te enviaremos.', [
            'accion' => $action, 'alcance' => $scope, 'descripcion' => self::ACTIONS[$action], 'motivo_requerido' => $needsReason,
        ]);
    }

    public static function covers(string $granted, string $wanted): bool
    {
        [$gk, $gv] = array_pad(explode(':', $granted, 2), 2, '');
        [$wk, $wv] = array_pad(explode(':', $wanted, 2), 2, '');
        if ($gk !== $wk) {
            return false;
        }
        $g = array_filter(explode(',', $gv));
        foreach (array_filter(explode(',', $wv)) as $w) {
            if (!in_array($w, $g, true) && !in_array('*', $g, true)) {
                return false;
            }
        }
        return true;
    }
}
