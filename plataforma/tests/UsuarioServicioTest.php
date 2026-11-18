<?php

declare(strict_types=1);

namespace Agora\Plataforma\Tests;

use Agora\Plataforma\Seguridad\Roles;
use Agora\Plataforma\Servicio\ErrorContrato;
use Agora\Plataforma\Servicio\UsuarioServicio;
use PDO;
use PHPUnit\Framework\TestCase;

final class UsuarioServicioTest extends TestCase
{
    private PDO $pdo;
    private string $hora = '2026-10-16 12:00:00';
    private UsuarioServicio $usuarios;

    protected function setUp(): void
    {
        $this->pdo = BasePrueba::conectar();
        $this->usuarios = new UsuarioServicio($this->pdo, fn () => $this->hora);
    }

    public function test_inicio_de_sesion_correcto_devuelve_token_y_usuario(): void
    {
        $this->usuarios->crear('admin@asocim.com', 'Admin', 'clave-segura-1', Roles::ADMIN);
        $r = $this->usuarios->iniciarSesion('ADMIN@asocim.com', 'clave-segura-1');
        $this->assertSame('ADMIN', $r['usuario']['rol']);
        $this->assertSame('admin@asocim.com', $r['usuario']['correo']);
        $this->assertSame('admin@asocim.com', $this->usuarios->usuarioDeSesion($r['token'])['correo']);
    }

    public function test_el_token_no_se_guarda_en_claro(): void
    {
        $this->usuarios->crear('a@asocim.com', 'A', 'clave-segura-1', Roles::VISOR);
        $token = $this->usuarios->iniciarSesion('a@asocim.com', 'clave-segura-1')['token'];
        $guardados = $this->pdo->query('SELECT hash FROM sesiones')->fetchAll(PDO::FETCH_COLUMN);
        $this->assertTrue(!in_array($token, $guardados, true), 'el token aparece en claro');
    }

    public function test_clave_incorrecta_no_entra(): void
    {
        $this->usuarios->crear('a@asocim.com', 'A', 'clave-segura-1', Roles::VISOR);
        $this->expectException(ErrorContrato::class);
        $this->usuarios->iniciarSesion('a@asocim.com', 'otra-clave-mala');
    }

    public function test_cinco_fallos_bloquean_la_cuenta(): void
    {
        $this->usuarios->crear('a@asocim.com', 'A', 'clave-segura-1', Roles::VISOR);
        for ($i = 0; $i < 5; $i++) {
            try {
                $this->usuarios->iniciarSesion('a@asocim.com', 'mala-clave-xx');
            } catch (ErrorContrato) {
            }
        }
        $this->expectException(ErrorContrato::class);
        $this->usuarios->iniciarSesion('a@asocim.com', 'clave-segura-1'); // ni la clave correcta entra durante el bloqueo
    }

    public function test_usuario_desactivado_no_entra_ni_tiene_sesion(): void
    {
        $id = $this->usuarios->crear('a@asocim.com', 'A', 'clave-segura-1', Roles::REMITENTE);
        $token = $this->usuarios->iniciarSesion('a@asocim.com', 'clave-segura-1')['token'];
        $this->usuarios->desactivar($id, 999);
        $this->assertTrue($this->usuarios->usuarioDeSesion($token) === null);
    }

    public function test_cambiar_rol_cierra_las_sesiones_de_esa_persona(): void
    {
        $id = $this->usuarios->crear('a@asocim.com', 'A', 'clave-segura-1', Roles::REMITENTE);
        $token = $this->usuarios->iniciarSesion('a@asocim.com', 'clave-segura-1')['token'];
        $this->usuarios->cambiarRol($id, Roles::VISOR, 999);
        $this->assertTrue($this->usuarios->usuarioDeSesion($token) === null);
    }

    public function test_el_administrador_no_puede_quitarse_su_propio_rol(): void
    {
        $id = $this->usuarios->crear('admin@asocim.com', 'Admin', 'clave-segura-1', Roles::ADMIN);
        $this->expectException(ErrorContrato::class);
        $this->usuarios->cambiarRol($id, Roles::VISOR, $id);
    }

    public function test_sesion_vencida_no_sirve(): void
    {
        $this->usuarios->crear('a@asocim.com', 'A', 'clave-segura-1', Roles::VISOR);
        $token = $this->usuarios->iniciarSesion('a@asocim.com', 'clave-segura-1')['token'];
        $this->hora = '2026-10-17 01:00:00'; // más de 12 horas después
        $this->assertTrue($this->usuarios->usuarioDeSesion($token) === null);
    }

    public function test_correo_repetido_falla(): void
    {
        $this->usuarios->crear('a@asocim.com', 'A', 'clave-segura-1', Roles::VISOR);
        $this->expectException(ErrorContrato::class);
        $this->usuarios->crear('A@asocim.com', 'B', 'clave-segura-2', Roles::VISOR);
    }

    public function test_clave_corta_falla(): void
    {
        $this->expectException(ErrorContrato::class);
        $this->usuarios->crear('a@asocim.com', 'A', 'corta', Roles::VISOR);
    }

    public function test_permisos_por_rol(): void
    {
        $this->assertTrue(Roles::puede(Roles::ADMIN, 'usuarios'));
        $this->assertTrue(!Roles::puede(Roles::REMITENTE, 'usuarios'));
        $this->assertTrue(Roles::puede(Roles::REMITENTE, 'enviar'));
        $this->assertTrue(!Roles::puede(Roles::VISOR, 'enviar'));
        $this->assertTrue(Roles::puede(Roles::VISOR, 'ver'));
    }

    public function test_cambiar_clave_exige_la_actual_y_cierra_otras_sesiones(): void
    {
        $id = $this->usuarios->crear('a@asocim.com', 'A', 'clave-segura-1', Roles::REMITENTE);
        $t1 = $this->usuarios->iniciarSesion('a@asocim.com', 'clave-segura-1')['token'];
        $t2 = $this->usuarios->iniciarSesion('a@asocim.com', 'clave-segura-1')['token'];
        try {
            $this->usuarios->cambiarClave($id, 'mala-clave-xx', 'clave-nueva-22', $t1);
            $this->fail('debió rechazar la clave actual incorrecta');
        } catch (ErrorContrato) {
        }
        $this->usuarios->cambiarClave($id, 'clave-segura-1', 'clave-nueva-22', $t1);
        $this->assertTrue($this->usuarios->usuarioDeSesion($t1) !== null);
        $this->assertTrue($this->usuarios->usuarioDeSesion($t2) === null);
        $this->assertSame('A', $this->usuarios->iniciarSesion('a@asocim.com', 'clave-nueva-22')['usuario']['nombre']);
    }
}
