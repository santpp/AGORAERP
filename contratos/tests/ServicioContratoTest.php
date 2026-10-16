<?php

declare(strict_types=1);

namespace Asocim\Contratos\Tests;

use Asocim\Contratos\Persistencia\Base;
use Asocim\Contratos\Servicio\ContratoServicio;
use Asocim\Contratos\Servicio\ErrorContrato;
use PDO;
use PHPUnit\Framework\TestCase;

final class ServicioContratoTest extends TestCase
{
    private PDO $pdo;
    private string $hora = '2026-10-14 10:00:00';
    private ContratoServicio $servicio;

    protected function setUp(): void
    {
        $this->pdo = Base::conectar('sqlite::memory:');
        $this->servicio = new ContratoServicio($this->pdo, fn () => $this->hora);
    }

    /** @return array<string,mixed> */
    private function webhook(array $cambios = [], string $clave = 'evt-1'): array
    {
        $p = [
            'clave' => $clave,
            'sub_cuenta' => 'loc-asocim',
            'cliente' => ['nombre' => 'Yuly Eunice Navas Callaspo', 'cedula' => '14943155', 'telefono' => '0412-5063751', 'correo' => 'cliente@example.com'],
            'curso' => ['cuota_mensual' => '105', 'meses' => 12, 'mes_inicio' => '2026-11', 'cuotas_por_mes' => 1, 'cargos' => [['concepto' => 'Inscripción', 'monto' => '20']]],
            'responsable' => ['nombre' => 'Vendedor', 'correo' => 'vendedor@example.com'],
        ];
        return array_replace_recursive($p, $cambios);
    }

    private function firma(): array
    {
        return ['firma_png' => 'PNG-DE-PRUEBA', 'nombre' => 'Yuly Eunice Navas Callaspo', 'ip' => '190.0.0.1', 'user_agent' => 'prueba'];
    }

    public function test_camino_completo_webhook_envio_firma(): void
    {
        $uid = $this->servicio->crearDesdeWebhook($this->webhook())['uid'];
        $envio = $this->servicio->enviar($uid);
        $this->assertSame(1, $envio['version']);

        $datos = $this->servicio->paraFirmar($envio['token']);
        $this->assertSame('1260.00', $datos['resultado']['precio_curso']);
        $this->assertSame('1280.00', $datos['resultado']['total_a_pagar']);
        $this->assertSame('2026-11-30', $datos['resultado']['cuotas'][0]['vencimiento']);

        $this->servicio->firmar($envio['token'], $this->firma());
        $ver = $this->servicio->ver($uid);
        $this->assertSame('FIRMADO', $ver['estado']);
    }

    public function test_webhook_repetido_no_crea_otro_contrato(): void
    {
        $a = $this->servicio->crearDesdeWebhook($this->webhook());
        $b = $this->servicio->crearDesdeWebhook($this->webhook());
        $this->assertSame($a['uid'], $b['uid']);
        $this->assertTrue($b['duplicado']);
    }

    public function test_mes_de_inicio_distinto_cambia_el_calendario(): void
    {
        $uid = $this->servicio->crearDesdeWebhook($this->webhook(['curso' => ['mes_inicio' => '2027-01', 'meses' => 6]], 'evt-2'))['uid'];
        $ver = $this->servicio->ver($uid);
        $this->assertCount(6, $ver['calculo']['cuotas']);
        $this->assertSame('2027-01-30', $ver['calculo']['cuotas'][0]['vencimiento']);
    }

    public function test_no_se_puede_enviar_dos_veces_la_misma_version(): void
    {
        $uid = $this->servicio->crearDesdeWebhook($this->webhook())['uid'];
        $this->servicio->enviar($uid);
        $this->expectException(ErrorContrato::class);
        $this->servicio->enviar($uid);
    }

    public function test_editar_despues_de_enviar_crea_version_nueva_y_revoca_el_enlace(): void
    {
        $uid = $this->servicio->crearDesdeWebhook($this->webhook())['uid'];
        $viejo = $this->servicio->enviar($uid)['token'];

        $numero = $this->servicio->editar($uid, ['cuota' => '110']);
        $this->assertSame(2, $numero);

        $this->expectException(ErrorContrato::class);
        $this->servicio->paraFirmar($viejo);
    }

    public function test_la_version_nueva_trae_el_monto_corregido(): void
    {
        $uid = $this->servicio->crearDesdeWebhook($this->webhook())['uid'];
        $this->servicio->enviar($uid);
        $this->servicio->editar($uid, ['cuota' => '110', 'meses' => 10]);
        $ver = $this->servicio->ver($uid);
        $this->assertSame('1100.00', $ver['calculo']['precio_curso']);
        $this->assertSame(2, $ver['version']);
    }

    public function test_el_enlace_solo_sirve_una_vez(): void
    {
        $uid = $this->servicio->crearDesdeWebhook($this->webhook())['uid'];
        $token = $this->servicio->enviar($uid)['token'];
        $this->servicio->firmar($token, $this->firma());

        $this->expectException(ErrorContrato::class);
        $this->servicio->firmar($token, $this->firma());
    }

    public function test_enlace_vencido_no_firma(): void
    {
        $uid = $this->servicio->crearDesdeWebhook($this->webhook())['uid'];
        $token = $this->servicio->enviar($uid)['token'];
        $this->hora = '2026-10-30 10:00:00';

        $this->expectException(ErrorContrato::class);
        $this->servicio->firmar($token, $this->firma());
    }

    public function test_revocar_impide_firmar(): void
    {
        $uid = $this->servicio->crearDesdeWebhook($this->webhook())['uid'];
        $token = $this->servicio->enviar($uid)['token'];
        $this->servicio->revocar($uid);

        $this->expectException(ErrorContrato::class);
        $this->servicio->firmar($token, $this->firma());
    }

    public function test_firma_sin_nombre_falla(): void
    {
        $uid = $this->servicio->crearDesdeWebhook($this->webhook())['uid'];
        $token = $this->servicio->enviar($uid)['token'];

        $this->expectException(ErrorContrato::class);
        $this->servicio->firmar($token, ['firma_png' => 'x', 'nombre' => '  ', 'ip' => '1.1.1.1', 'user_agent' => 'x']);
    }

    public function test_mes_de_inicio_mal_escrito_falla(): void
    {
        $this->expectException(ErrorContrato::class);
        $this->servicio->crearDesdeWebhook($this->webhook(['curso' => ['mes_inicio' => 'noviembre']], 'evt-3'));
    }

    public function test_correo_invalido_falla(): void
    {
        $this->expectException(ErrorContrato::class);
        $this->servicio->crearDesdeWebhook($this->webhook(['cliente' => ['correo' => 'no-es-correo']], 'evt-4'));
    }

    public function test_token_no_se_guarda_en_claro(): void
    {
        $uid = $this->servicio->crearDesdeWebhook($this->webhook())['uid'];
        $token = $this->servicio->enviar($uid)['token'];
        $guardado = $this->pdo->query('SELECT hash FROM tokens_firma')->fetchAll(PDO::FETCH_COLUMN);
        $this->assertTrue(!in_array($token, $guardado, true), 'el token aparece en claro en la base');
    }

    public function test_fecha_de_ghl_se_convierte_a_anio_y_mes(): void
    {
        $this->assertSame([2026, 10], ContratoServicio::mesDeInicio('Oct 6, 2026'));
        $this->assertSame([2026, 10], ContratoServicio::mesDeInicio('10/06/2026'));
        $this->assertSame([2026, 10], ContratoServicio::mesDeInicio('2026-10-06'));
        $this->assertSame([2026, 11], ContratoServicio::mesDeInicio('2026-11'));
        $this->assertSame([2027, 1], ContratoServicio::mesDeInicio('January 15, 2027'));
    }

    public function test_fecha_de_inicio_no_reconocida_falla(): void
    {
        $this->expectException(ErrorContrato::class);
        ContratoServicio::mesDeInicio('noviembre');
    }

    public function test_payload_plano_de_custom_data_de_ghl(): void
    {
        $uid = $this->servicio->crearDesdeWebhook([
            'clave' => 'plano-1',
            'sub_cuenta' => 'loc-asocim',
            'nombre_cliente' => 'Yuly Eunice Navas Callaspo',
            'cedula' => '14943155',
            'telefono' => '0412-5063751',
            'correo_cliente' => 'cliente@example.com',
            'cuota_mensual' => '105',
            'meses' => '12',
            'mes_inicio' => 'Oct 6, 2026',
            'cuotas_por_mes' => '1',
            'responsable_nombre' => 'Vendedor',
            'responsable_correo' => 'vendedor@example.com',
        ])['uid'];
        $ver = $this->servicio->ver($uid);
        $this->assertSame('1260.00', $ver['calculo']['precio_curso']);
        $this->assertSame('2026-10-30', $ver['calculo']['cuotas'][0]['vencimiento']);
    }

    public function test_formato_estandar_de_ghl(): void
    {
        $uid = $this->servicio->crearDesdeWebhook([
            'contact_id' => 'c-1', 'first_name' => 'Yuly', 'last_name' => 'Navas', 'email' => 'cliente@example.com',
            'phone' => '0412-5063751', 'Cédula' => '14943155', 'cuota mensual' => '105', 'meses' => '12',
            'mes inicio' => 'Oct 26, 2026', 'cuotas por mes' => '1',
            'location' => ['id' => 'loc-asocim'], 'user' => ['name' => 'Vendedor', 'email' => 'v@example.com'],
            'workflow' => ['id' => 'wf-1'],
        ])['uid'];
        $ver = $this->servicio->ver($uid);
        $this->assertSame('1260.00', $ver['calculo']['precio_curso']);
        $this->assertSame('2026-10-30', $ver['calculo']['cuotas'][0]['vencimiento']);
    }

    public function test_listar_muestra_la_ultima_version_de_cada_contrato(): void
    {
        $a = $this->servicio->crearDesdeWebhook($this->webhook([], 'lista-a'))['uid'];
        $this->servicio->crearDesdeWebhook($this->webhook(['cliente' => ['nombre' => 'Otra', 'cedula' => '2', 'telefono' => '0', 'correo' => 'otra@example.com']], 'lista-b'));
        $this->servicio->enviar($a);
        $this->servicio->editar($a, ['cuota' => '110']);
        $lista = $this->servicio->listar();
        $this->assertCount(2, $lista);
        $fila = array_values(array_filter($lista, fn ($f) => $f['uid'] === $a))[0];
        $this->assertSame(2, $fila['version']);
        $this->assertSame('BORRADOR', $fila['estado']);
    }
}
