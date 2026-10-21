<?php

declare(strict_types=1);

namespace Agora\Plataforma\Web;

use Agora\Plataforma\Ghl\ClienteGhl;
use Agora\Plataforma\Seguridad\Roles;
use Agora\Plataforma\Servicio\ContratoServicio;
use Agora\Plataforma\Servicio\ErrorContrato;
use Agora\Plataforma\Servicio\UsuarioServicio;
use JsonException;

/** Entrada HTTP: enruta las peticiones y responde en JSON. */
final class Aplicacion
{
    public const COOKIE = 'contratos_sesion';
    /** Cookie legible por el panel; Angular la devuelve en la cabecera X-XSRF-TOKEN. */
    public const COOKIE_CSRF = 'XSRF-TOKEN';

    public function __construct(
        private readonly ContratoServicio $servicio,
        private readonly UsuarioServicio $usuarios,
        private readonly string $secretoWebhook,
        private readonly ?ClienteGhl $ghl = null,
    ) {
    }

    /** @return array{0:int,1:array<string,mixed>} código HTTP y cuerpo */
    public function responder(string $metodo, string $ruta, array $cabeceras, string $cuerpo): array
    {
        try {
            if ($metodo === 'POST' && $ruta === '/webhook.php') {
                return $this->webhookGhl($cabeceras, $cuerpo);
            }
            // CSRF: toda acción con sesión debe traer la cabecera X-XSRF-TOKEN. Se exceptúan el login (aún no hay
            // sesión) y la firma del cliente (pública; su acceso es el token del enlace).
            if (!in_array($metodo, ['GET', 'HEAD'], true) && str_starts_with($ruta, '/api/')
                && $ruta !== '/api/login' && !str_starts_with($ruta, '/api/firmar/')) {
                $this->comprobarCsrf($cabeceras);
            }
            if ($metodo === 'POST' && $ruta === '/api/login') {
                return $this->login($cuerpo);
            }
            if ($metodo === 'POST' && $ruta === '/api/logout') {
                return $this->logout($cabeceras);
            }
            if ($metodo === 'GET' && $ruta === '/api/yo') {
                $u = $this->sesionDe($cabeceras);
                // También aquí: las sesiones abiertas antes de existir el token CSRF lo reciben al cargar el panel.
                return [200, ['usuario' => $u, 'cookies' => [$this->cookieCsrf((string) $this->tokenDe($cabeceras))]]];
            }
            if (str_starts_with($ruta, '/api/usuarios')) {
                return $this->usuariosApi($metodo, $ruta, $cabeceras, $cuerpo);
            }
            if ($metodo === 'POST' && $ruta === '/api/clave') {
                $u = $this->sesionDe($cabeceras);
                $d = $this->json($cuerpo);
                $this->usuarios->cambiarClave($u['id'], (string) ($d['clave_actual'] ?? ''), (string) ($d['clave_nueva'] ?? ''), (string) $this->tokenDe($cabeceras));
                return [200, ['ok' => true]];
            }
            if (preg_match('#^/api/firmar/([A-Za-z0-9_-]{40,50})$#', $ruta, $m)) {
                // Público: el enlace del cliente es el único acceso (token de un solo uso).
                if ($metodo === 'GET') {
                    return [200, $this->servicio->paraFirmar($m[1])];
                }
                if ($metodo === 'POST') {
                    $d = $this->json($cuerpo);
                    $this->servicio->firmar($m[1], [
                        'firma_png' => $this->decodificarFirma((string) ($d['firma'] ?? '')),
                        'nombre' => (string) ($d['nombre'] ?? ''),
                        'ip' => $cabeceras['cf-connecting-ip'] ?? $cabeceras['ip-cliente'] ?? '',
                        'user_agent' => $cabeceras['user-agent'] ?? '',
                    ]);
                    return [200, ['ok' => true]];
                }
            }
            if ($metodo === 'POST' && $ruta === '/api/ghl/contactos/buscar') {
                $u = $this->sesionDe($cabeceras, 'editar');
                if ($this->ghl === null) {
                    throw new ErrorContrato('La conexión con AGORA no está configurada en el servidor.', 500);
                }
                $consulta = trim((string) ($this->json($cuerpo)['consulta'] ?? ''));
                if (mb_strlen($consulta) < 2) {
                    return [200, ['contactos' => []]];
                }
                // La administración ve todos los contactos de la subcuenta, aunque su usuario no esté en GHL.
                if ($u['rol'] === 'ADMIN') {
                    return [200, ['contactos' => $this->ghl->buscarContactos($consulta)]];
                }
                // Quien no es administración solo ve los contactos asignados a su usuario de AGORA en GHL.
                $idGhl = $this->ghl->usuarioPorCorreo((string) $u['correo']);
                if ($idGhl === null) {
                    return [200, ['contactos' => [], 'aviso' => 'No encontramos el correo ' . $u['correo'] . ' entre los usuarios de AGORA. Revisa que sea el mismo de tu cuenta en AGORA o pide a la administración que te agregue.']];
                }
                $propios = array_values(array_filter($this->ghl->buscarContactos($consulta), fn (array $c) => $c['asignado'] === $idGhl));
                return [200, ['contactos' => $propios]];
            }
            if ($metodo === 'GET' && $ruta === '/api/registro') {
                $this->sesionDe($cabeceras, 'usuarios');
                return [200, ['eventos' => $this->servicio->eventos()]];
            }
            // Quien no es administración solo puede abrir los contratos que tiene asignados.
            if (preg_match('#^/api/contratos/([a-f0-9]{24})(?:/|$)#', $ruta, $mc)) {
                $this->accesoAContrato($this->sesionDe($cabeceras), $mc[1]);
            }
            if ($metodo === 'POST' && preg_match('#^/api/contratos/([a-f0-9]{24})/cliente$#', $ruta, $m)) {
                $this->sesionDe($cabeceras, 'editar');
                $this->servicio->actualizarCliente($m[1], $this->json($cuerpo));
                return [200, ['ok' => true]];
            }
            if (str_starts_with($ruta, '/api/contratos')) {
                return $this->contratosApi($metodo, $ruta, $cabeceras, $cuerpo);
            }
            return [404, ['error' => 'No existe esta ruta.']];
        } catch (ErrorContrato $e) {
            return [$e->http, ['error' => $e->getMessage()]];
        } catch (\Throwable $e) {
            error_log('[contratos] ' . $e->getMessage());
            return [500, ['error' => 'Ocurrió un error inesperado.']];
        }
    }

    /** @return array{0:int,1:array<string,mixed>} */
    private function login(string $cuerpo): array
    {
        $d = $this->json($cuerpo);
        $r = $this->usuarios->iniciarSesion((string) ($d['correo'] ?? ''), (string) ($d['clave'] ?? ''));
        return [200, ['usuario' => $r['usuario'], 'cookies' => [$this->cookie($r['token']), $this->cookieCsrf($r['token'])]]];
    }

    /** @return array{0:int,1:array<string,mixed>} */
    private function logout(array $cabeceras): array
    {
        $token = $this->tokenDe($cabeceras);
        if ($token !== null) {
            $this->usuarios->cerrarSesion($token);
        }
        return [200, ['ok' => true, 'cookies' => [$this->cookie('', true), $this->cookieCsrf('', true)]]];
    }

    /** @return array{0:int,1:array<string,mixed>} */
    private function usuariosApi(string $metodo, string $ruta, array $cabeceras, string $cuerpo): array
    {
        $admin = $this->sesionDe($cabeceras, 'usuarios');
        if ($metodo === 'GET' && $ruta === '/api/usuarios') {
            return [200, ['usuarios' => $this->usuarios->listar()]];
        }
        if ($metodo === 'POST' && $ruta === '/api/usuarios') {
            $d = $this->json($cuerpo);
            $id = $this->usuarios->crear((string) ($d['correo'] ?? ''), (string) ($d['nombre'] ?? ''), (string) ($d['clave'] ?? ''), (string) ($d['rol'] ?? ''));
            return [201, ['id' => $id]];
        }
        if ($metodo === 'POST' && $ruta === '/api/usuarios/rol') {
            $d = $this->json($cuerpo);
            $this->usuarios->cambiarRol((int) ($d['id'] ?? 0), (string) ($d['rol'] ?? ''), $admin['id']);
            return [200, ['ok' => true]];
        }
        if ($metodo === 'POST' && $ruta === '/api/usuarios/activar') {
            $this->usuarios->reactivar((int) ($this->json($cuerpo)['id'] ?? 0));
            return [200, ['ok' => true]];
        }
        if ($metodo === 'POST' && $ruta === '/api/usuarios/clave') {
            $d = $this->json($cuerpo);
            $this->usuarios->restablecerClave((int) ($d['id'] ?? 0), (string) ($d['clave'] ?? ''));
            return [200, ['ok' => true]];
        }
        if ($metodo === 'POST' && $ruta === '/api/usuarios/desactivar') {
            $d = $this->json($cuerpo);
            $this->usuarios->desactivar((int) ($d['id'] ?? 0), $admin['id']);
            return [200, ['ok' => true]];
        }
        return [404, ['error' => 'No existe esta ruta.']];
    }

    /**
     * Devuelve la persona con sesión. Si se pide un rol, exige que tenga ese permiso.
     * @return array<string,mixed>
     */
    private function sesionDe(array $cabeceras, ?string $permiso = null): array
    {
        $u = $this->usuarios->usuarioDeSesion($this->tokenDe($cabeceras));
        if ($u === null) {
            throw new ErrorContrato('Inicia sesión para continuar.', 401);
        }
        if ($permiso !== null && !Roles::puede($u['rol'], $permiso)) {
            throw new ErrorContrato('No tienes permiso para hacer esto.', 403);
        }
        return $u;
    }

    /** @param array<string,mixed> $u */
    private function accesoAContrato(array $u, string $uid): void
    {
        if ($u['rol'] !== 'ADMIN' && !$this->servicio->esResponsable($uid, (string) $u['correo'])) {
            // 404 y no 403: no se revela que el contrato existe.
            throw new ErrorContrato('Contrato no encontrado.', 404);
        }
    }

    /** @return array{0:int,1:array<string,mixed>} */
    private function contratosApi(string $metodo, string $ruta, array $cabeceras, string $cuerpo): array
    {
        if ($metodo === 'POST' && $ruta === '/api/contratos') {
            $this->sesionDe($cabeceras, 'editar');
            $p = $this->json($cuerpo);
            $contacto = trim((string) ($p['cliente']['contact_id'] ?? ''));
            if ($contacto === '') {
                throw new ErrorContrato('Elige un contacto de GHL antes de crear el convenio.');
            }
            // Un contrato por cada vez que se crea: la clave lleva el id del contacto para poder avisarle.
            $p['clave'] = $contacto . ':panel:' . bin2hex(random_bytes(6));
            unset($p['cliente']['contact_id']);
            $correoAgora = (string) ($p['cliente']['correo_agora'] ?? '');
            unset($p['cliente']['correo_agora']);
            $p['cliente']['correo'] = $this->servicio->guardarCorreoEnAgora($contacto, $correoAgora, (string) ($p['cliente']['correo'] ?? ''));
            $p['sub_cuenta'] = $p['sub_cuenta'] ?? 'panel';
            return [201, ['uid' => $this->servicio->crearDesdeWebhook($p)['uid']]];
        }
        if ($metodo === 'GET' && preg_match('#^/api/contratos/([a-f0-9]{24})/pdf/previa$#', $ruta, $m)) {
            $u = $this->sesionDe($cabeceras, 'ver');
            return [200, ['__archivo' => $this->servicio->previaPdf($m[1], (string) $u['nombre']), '__nombre' => 'vista-previa.pdf']];
        }
        if ($metodo === 'GET' && preg_match('#^/api/contratos/([a-f0-9]{24})/pdf/(enviado|firmado)$#', $ruta, $m)) {
            $this->sesionDe($cabeceras, 'ver');
            return [200, ['__archivo' => $this->servicio->archivoDeContrato($m[1], $m[2]), '__nombre' => $m[2] . '-convenio.pdf']];
        }
        if ($metodo === 'GET' && $ruta === '/api/contratos') {
            $u = $this->sesionDe($cabeceras, 'ver');
            return [200, ['contratos' => $this->servicio->listar($u['rol'] === 'ADMIN' ? null : (string) $u['correo'])]];
        }
        if ($metodo === 'POST' && preg_match('#^/api/contratos/([a-f0-9]{24})/enlace$#', $ruta, $m)) {
            $this->sesionDe($cabeceras, 'enviar');
            return [200, $this->servicio->nuevoEnlace($m[1])];
        }
        if ($metodo === 'DELETE' && preg_match('#^/api/contratos/([a-f0-9]{24})$#', $ruta, $m)) {
            $this->sesionDe($cabeceras, 'editar');
            $this->servicio->eliminarBorrador($m[1]);
            return [200, ['ok' => true]];
        }
        if ($metodo === 'GET' && preg_match('#^/api/contratos/([a-f0-9]{24})$#', $ruta, $m)) {
            $this->sesionDe($cabeceras, 'ver');
            return [200, $this->servicio->ver($m[1])];
        }
        if ($metodo === 'POST' && $ruta === '/api/contratos/calculo') {
            $this->sesionDe($cabeceras, 'ver');
            $r = $this->servicio->previsualizar($this->json($cuerpo));
            return [200, ['precio_curso' => $r->precioCurso->aTexto(), 'total_a_pagar' => $r->totalAPagar->aTexto(), 'cuotas' => count($r->cuotas)]];
        }
        if ($metodo === 'POST' && preg_match('#^/api/contratos/([a-f0-9]{24})/(editar|enviar|revocar)$#', $ruta, $m)) {
            $permiso = $m[2] === 'editar' ? 'editar' : ($m[2] === 'enviar' ? 'enviar' : 'revocar');
            $u = $this->sesionDe($cabeceras, $permiso);
            if ($m[2] === 'editar') {
                $numero = $this->servicio->editar($m[1], $this->json($cuerpo));
                return [200, ['version' => $numero]];
            }
            if ($m[2] === 'enviar') {
                $envio = $this->servicio->enviar($m[1], $u['nombre']);
                $base = rtrim((string) getenv('APP_URL') ?: 'https://tests.agoradigital.app', '/');
                return [200, ['version' => $envio['version'], 'enlace' => $base . '/firmar?t=' . $envio['token'], 'vence' => $envio['vence']]];
            }
            $this->servicio->revocar($m[1]);
            return [200, ['ok' => true]];
        }
        return [404, ['error' => 'No existe esta ruta.']];
    }

    /** Acepta la firma como data URL (lo que entrega el canvas) o como base64 simple. */
    private function decodificarFirma(string $firma): string
    {
        $base64 = preg_replace('#^data:image/png;base64,#', '', $firma) ?? '';
        $png = base64_decode($base64, true);
        return $png === false ? '' : $png;
    }

    private function tokenDe(array $cabeceras): ?string
    {
        foreach (explode(';', $cabeceras['cookie'] ?? '') as $par) {
            [$clave, $valor] = array_pad(explode('=', trim($par), 2), 2, '');
            if ($clave === self::COOKIE) {
                return $valor;
            }
        }
        return null;
    }

    private function cookie(string $valor, bool $borrar = false): string
    {
        return self::COOKIE . '=' . $valor . '; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=' . $this->expiracion($borrar);
    }

    /** Sin HttpOnly: el panel la lee para copiarla en la cabecera. */
    private function cookieCsrf(string $sesion, bool $borrar = false): string
    {
        $valor = $borrar ? '' : self::csrfDe($sesion);
        return self::COOKIE_CSRF . '=' . $valor . '; Path=/; Secure; SameSite=Strict; Expires=' . $this->expiracion($borrar);
    }

    private function expiracion(bool $borrar): string
    {
        return $borrar ? 'Thu, 01 Jan 1970 00:00:00 GMT' : gmdate('D, d M Y H:i:s', time() + UsuarioServicio::HORAS_SESION * 3600) . ' GMT';
    }

    /** Token CSRF derivado del token de sesión: no se guarda nada y cambia con cada sesión. */
    public static function csrfDe(string $sesion): string
    {
        return hash_hmac('sha256', 'csrf', $sesion);
    }

    /** Sin cookie de sesión no hay nada que proteger: la ruta responderá 401 si la necesita. */
    private function comprobarCsrf(array $cabeceras): void
    {
        $sesion = (string) $this->tokenDe($cabeceras);
        if ($sesion !== '' && !hash_equals(self::csrfDe($sesion), (string) ($cabeceras['x-xsrf-token'] ?? ''))) {
            throw new ErrorContrato('La sesión no es válida. Recarga la página e inténtalo de nuevo.', 403);
        }
    }

    /** @return array<string,mixed> */
    private function json(string $cuerpo): array
    {
        try {
            $d = json_decode($cuerpo, true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new ErrorContrato('El cuerpo no es JSON válido.', 400);
        }
        return is_array($d) ? $d : [];
    }

    /** @return array{0:int,1:array<string,mixed>} */
    private function webhookGhl(array $cabeceras, string $cuerpo): array
    {
        $recibido = $cabeceras['x-webhook-secret'] ?? '';
        if ($this->secretoWebhook === '' || !hash_equals($this->secretoWebhook, $recibido)) {
            return [401, ['error' => 'No autorizado.']];
        }
        try {
            $datos = json_decode($cuerpo, true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return [400, ['error' => 'El cuerpo no es JSON válido.']];
        }
        if (!is_array($datos)) {
            return [400, ['error' => 'Se esperaba un objeto JSON.']];
        }
        $this->registrarRecepcion($datos);
        $resultado = $this->servicio->crearDesdeWebhook($datos);
        return [$resultado['duplicado'] ? 200 : 201, $resultado];
    }

    /**
     * Diagnóstico: guarda solo los NOMBRES de los campos recibidos y si vienen vacíos.
     * @param array<string,mixed> $datos
     */
    private function registrarRecepcion(array $datos): void
    {
        $ruta = dirname(__DIR__, 2) . '/storage/webhook-recibidos.log';
        $lineas = [];
        foreach ($datos as $clave => $valor) {
            if (is_array($valor)) {
                $lineas[] = $clave . '=[seccion]';
                continue;
            }
            $lineas[] = $clave . '=' . (trim((string) $valor) === '' ? 'VACIO' : 'con valor');
        }
        @file_put_contents($ruta, date('Y-m-d H:i:s') . ' ' . implode(' | ', $lineas) . "\n", FILE_APPEND);
    }
}
