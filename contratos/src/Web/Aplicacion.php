<?php

declare(strict_types=1);

namespace Asocim\Contratos\Web;

use Asocim\Contratos\Seguridad\Roles;
use Asocim\Contratos\Servicio\ContratoServicio;
use Asocim\Contratos\Servicio\ErrorContrato;
use Asocim\Contratos\Servicio\UsuarioServicio;
use JsonException;

/** Entrada HTTP: enruta las peticiones y responde en JSON. */
final class Aplicacion
{
    public const COOKIE = 'contratos_sesion';

    public function __construct(
        private readonly ContratoServicio $servicio,
        private readonly UsuarioServicio $usuarios,
        private readonly string $secretoWebhook,
    ) {
    }

    /** @return array{0:int,1:array<string,mixed>} código HTTP y cuerpo */
    public function responder(string $metodo, string $ruta, array $cabeceras, string $cuerpo): array
    {
        try {
            if ($metodo === 'POST' && $ruta === '/webhook.php') {
                return $this->webhookGhl($cabeceras, $cuerpo);
            }
            if ($metodo === 'POST' && $ruta === '/api/login') {
                return $this->login($cuerpo);
            }
            if ($metodo === 'POST' && $ruta === '/api/logout') {
                return $this->logout($cabeceras);
            }
            if ($metodo === 'GET' && $ruta === '/api/yo') {
                $u = $this->sesionDe($cabeceras);
                return [200, ['usuario' => $u]];
            }
            if (str_starts_with($ruta, '/api/usuarios')) {
                return $this->usuariosApi($metodo, $ruta, $cabeceras, $cuerpo);
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
        return [200, ['usuario' => $r['usuario'], 'cookie' => $this->cookie($r['token'])]];
    }

    /** @return array{0:int,1:array<string,mixed>} */
    private function logout(array $cabeceras): array
    {
        $token = $this->tokenDe($cabeceras);
        if ($token !== null) {
            $this->usuarios->cerrarSesion($token);
        }
        return [200, ['ok' => true, 'cookie' => $this->cookie('', true)]];
    }

    /** @return array{0:int,1:array<string,mixed>} */
    private function usuariosApi(string $metodo, string $ruta, array $cabeceras, string $cuerpo): array
    {
        $admin = $this->sesionDe($cabeceras, Roles::ADMIN);
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
        if ($permiso !== null && !Roles::puede($u['rol'], 'usuarios')) {
            throw new ErrorContrato('Solo el administrador puede hacer esto.', 403);
        }
        return $u;
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
        $expira = $borrar ? 'Thu, 01 Jan 1970 00:00:00 GMT' : gmdate('D, d M Y H:i:s', time() + UsuarioServicio::HORAS_SESION * 3600) . ' GMT';
        return self::COOKIE . '=' . $valor . '; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=' . $expira;
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
