<?php

declare(strict_types=1);

namespace Agora\Plataforma\Tests;

use Agora\Plataforma\Seguridad\Roles;
use Agora\Plataforma\Servicio\ContratoServicio;
use Agora\Plataforma\Servicio\UsuarioServicio;
use Agora\Plataforma\Web\Aplicacion;
use PHPUnit\Framework\TestCase;

/** Capa HTTP: protección CSRF de las acciones con sesión. */
final class AplicacionTest extends TestCase
{
    private const ERROR_CSRF = 'La sesión no es válida. Recarga la página e inténtalo de nuevo.';
    private Aplicacion $app;
    private string $sesion;
    /** @var list<string> */
    private array $cookiesLogin;

    protected function setUp(): void
    {
        $pdo = BasePrueba::conectar();
        $usuarios = new UsuarioServicio($pdo);
        $usuarios->crear('admin@asocim.com', 'Admin', 'clave-segura-1', Roles::ADMIN);
        $this->app = new Aplicacion(new ContratoServicio($pdo), $usuarios, 'secreto');
        [, $r] = $this->app->responder('POST', '/api/login', [], '{"correo":"admin@asocim.com","clave":"clave-segura-1"}');
        $this->cookiesLogin = $r['cookies'];
        preg_match('/^' . Aplicacion::COOKIE . '=([^;]+)/', $r['cookies'][0], $m);
        $this->sesion = $m[1];
    }

    /** @return array{0:int,1:array<string,mixed>} */
    private function post(string $ruta, ?string $csrf, string $cuerpo = '{}'): array
    {
        $cabeceras = ['cookie' => Aplicacion::COOKIE . '=' . $this->sesion];
        if ($csrf !== null) {
            $cabeceras['x-xsrf-token'] = $csrf;
        }
        return $this->app->responder('POST', $ruta, $cabeceras, $cuerpo);
    }

    public function test_el_login_entrega_el_token_csrf_en_una_cookie_legible(): void
    {
        $csrf = $this->cookiesLogin[1];
        $this->assertTrue(str_starts_with($csrf, 'XSRF-TOKEN=' . Aplicacion::csrfDe($this->sesion) . ';'), $csrf);
        $this->assertTrue(!str_contains($csrf, 'HttpOnly') && str_contains($csrf, 'SameSite=Strict'), $csrf);
        $this->assertTrue(str_contains($this->cookiesLogin[0], 'HttpOnly'), 'la cookie de sesión debe seguir siendo HttpOnly');
    }

    public function test_una_accion_sin_token_csrf_o_con_uno_ajeno_se_rechaza(): void
    {
        foreach ([null, '', Aplicacion::csrfDe('otra-sesion')] as $csrf) {
            [$codigo, $r] = $this->post('/api/clave', $csrf);
            $this->assertSame(403, $codigo);
            $this->assertSame(self::ERROR_CSRF, $r['error']);
        }
    }

    public function test_con_el_token_csrf_correcto_la_accion_llega_a_su_ruta(): void
    {
        [, $r] = $this->post('/api/clave', Aplicacion::csrfDe($this->sesion), '{"clave_actual":"incorrecta","clave_nueva":"otra-clave-segura"}');
        $this->assertTrue(($r['error'] ?? '') !== self::ERROR_CSRF, 'no debió fallar por CSRF');
    }

    public function test_las_lecturas_la_firma_publica_y_el_login_no_piden_token(): void
    {
        [$codigo, $r] = $this->app->responder('GET', '/api/yo', ['cookie' => Aplicacion::COOKIE . '=' . $this->sesion], '');
        $this->assertSame(200, $codigo);
        // /api/yo repone la cookie CSRF a las sesiones abiertas antes de que existiera.
        $this->assertTrue(str_starts_with($r['cookies'][0], 'XSRF-TOKEN=' . Aplicacion::csrfDe($this->sesion)));
        [, $r] = $this->post('/api/firmar/' . str_repeat('a', 43), null, '{"firma":"","nombre":"X"}');
        $this->assertTrue(($r['error'] ?? '') !== self::ERROR_CSRF, 'la firma pública no usa CSRF');
        [$codigo] = $this->post('/api/login', null, '{"correo":"admin@asocim.com","clave":"clave-segura-1"}');
        $this->assertSame(200, $codigo);
    }

    public function test_sin_sesion_responde_401_y_no_403(): void
    {
        [$codigo] = $this->app->responder('POST', '/api/contratos', [], '{}');
        $this->assertSame(401, $codigo);
    }

    public function test_cerrar_sesion_borra_las_dos_cookies(): void
    {
        [$codigo, $r] = $this->post('/api/logout', Aplicacion::csrfDe($this->sesion));
        $this->assertSame(200, $codigo);
        $this->assertTrue(str_starts_with($r['cookies'][0], Aplicacion::COOKIE . '=;') && str_starts_with($r['cookies'][1], 'XSRF-TOKEN=;'));
    }
}
