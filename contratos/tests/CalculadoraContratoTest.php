<?php

declare(strict_types=1);

namespace Asocim\Contratos\Tests;

use Asocim\Contratos\Calculo\Cargo;
use Asocim\Contratos\Calculo\CalculadoraContrato;
use Asocim\Contratos\Calculo\DatosInvalidos;
use Asocim\Contratos\Calculo\Dinero;
use Asocim\Contratos\Calculo\Terminos;
use PHPUnit\Framework\TestCase;

final class CalculadoraContratoTest extends TestCase
{
    private CalculadoraContrato $calc;

    protected function setUp(): void
    {
        $this->calc = new CalculadoraContrato();
    }

    /** Caso del convenio real: 105 USD × 12 meses, empezando en noviembre 2026. */
    public function test_convenio_real_doce_cuotas_desde_noviembre(): void
    {
        $r = $this->calc->calcular(new Terminos(Dinero::desde('105'), 12, 2026, 11));

        $this->assertSame('1260.00', $r->precioCurso->aTexto());
        $this->assertSame('1260.00', $r->totalAPagar->aTexto());
        $this->assertCount(12, $r->cuotas);
        $this->assertSame('2026-11-30', $r->cuotas[0]->vencimiento);
        $this->assertSame('2027-10-30', $r->cuotas[11]->vencimiento);
        $this->assertSame('105.00', $r->cuotas[0]->monto->aTexto());
    }

    public function test_febrero_vence_el_ultimo_dia_del_mes(): void
    {
        $r = $this->calc->calcular(new Terminos(Dinero::desde('105'), 2, 2027, 1));

        $this->assertSame('2027-01-30', $r->cuotas[0]->vencimiento);
        $this->assertSame('2027-02-28', $r->cuotas[1]->vencimiento);
    }

    public function test_febrero_bisiesto(): void
    {
        $r = $this->calc->calcular(new Terminos(Dinero::desde('105'), 2, 2028, 1));

        $this->assertSame('2028-02-29', $r->cuotas[1]->vencimiento);
    }

    public function test_dos_cuotas_al_mes_el_total_no_cambia(): void
    {
        $r = $this->calc->calcular(new Terminos(Dinero::desde('105'), 12, 2026, 11, 2));

        $this->assertSame('1260.00', $r->totalAPagar->aTexto());
        $this->assertCount(24, $r->cuotas);
        $this->assertSame('52.50', $r->cuotas[0]->monto->aTexto());
        $this->assertSame('2026-11-15', $r->cuotas[0]->vencimiento);
        $this->assertSame('2026-11-30', $r->cuotas[1]->vencimiento);
    }

    public function test_cuatro_cuotas_caen_en_viernes(): void
    {
        $r = $this->calc->calcular(new Terminos(Dinero::desde('105'), 3, 2026, 11, 4));

        $this->assertCount(12, $r->cuotas);
        foreach ($r->cuotas as $cuota) {
            $this->assertSame(5, (int) date('N', strtotime($cuota->vencimiento)), "{$cuota->vencimiento} no es viernes");
        }
        // Cada mes tiene exactamente 4 pagos y todos son distintos
        $porMes = array_count_values(array_map(fn ($c) => $c->mesNumero, $r->cuotas));
        $this->assertSame([4, 4, 4], array_values($porMes));
    }

    public function test_redondeo_sin_perder_centavos(): void
    {
        $r = $this->calc->calcular(new Terminos(Dinero::desde('100'), 1, 2026, 11, 4));

        $montos = array_map(fn ($c) => $c->monto->centavos, $r->cuotas);
        $this->assertSame(10000, array_sum($montos));
        $this->assertSame([2500, 2500, 2500, 2500], $montos);
    }

    public function test_redondeo_tres_partes_en_centavos(): void
    {
        $r = $this->calc->calcular(new Terminos(Dinero::desde('100'), 1, 2026, 11, 2));
        $this->assertSame(10000, array_sum(array_map(fn ($c) => $c->monto->centavos, $r->cuotas)));

        $mensual = Dinero::desde('100.01');
        $r = $this->calc->calcular(new Terminos($mensual, 1, 2026, 11, 2));
        $this->assertSame(10001, array_sum(array_map(fn ($c) => $c->monto->centavos, $r->cuotas)));
    }

    public function test_cargos_se_suman_al_total_sin_cambiar_el_curso(): void
    {
        $cargos = [
            new Cargo('Inscripción', Dinero::desde('20')),
            new Cargo('Recargo por mora (por evento)', Dinero::desde('10')),
        ];
        $r = $this->calc->calcular(new Terminos(Dinero::desde('105'), 12, 2026, 11, 1, $cargos));

        $this->assertSame('1260.00', $r->precioCurso->aTexto());
        $this->assertSame('30.00', $r->totalCargos->aTexto());
        $this->assertSame('1290.00', $r->totalAPagar->aTexto());
    }

    public function test_cargo_cero_es_valido(): void
    {
        $r = $this->calc->calcular(new Terminos(Dinero::desde('105'), 12, 2026, 11, 1, [new Cargo('Inscripción', Dinero::desde('0'))]));

        $this->assertSame('1260.00', $r->totalAPagar->aTexto());
    }

    public function test_los_numeros_de_cuota_son_consecutivos(): void
    {
        $r = $this->calc->calcular(new Terminos(Dinero::desde('105'), 12, 2026, 11, 2));

        $this->assertSame(range(1, 24), array_map(fn ($c) => $c->numero, $r->cuotas));
    }

    public function test_duracion_fuera_de_rango_falla(): void
    {
        $this->expectException(DatosInvalidos::class);
        new Terminos(Dinero::desde('105'), 25, 2026, 11);
    }

    public function test_cero_meses_falla(): void
    {
        $this->expectException(DatosInvalidos::class);
        new Terminos(Dinero::desde('105'), 0, 2026, 11);
    }

    public function test_cuotas_por_mes_no_permitidas_fallan(): void
    {
        $this->expectException(DatosInvalidos::class);
        new Terminos(Dinero::desde('105'), 12, 2026, 11, 3);
    }

    public function test_mes_de_inicio_invalido_falla(): void
    {
        $this->expectException(DatosInvalidos::class);
        new Terminos(Dinero::desde('105'), 12, 2026, 13);
    }

    public function test_cuota_cero_falla(): void
    {
        $this->expectException(DatosInvalidos::class);
        new Terminos(Dinero::desde('0'), 12, 2026, 11);
    }

    public function test_cargo_negativo_falla(): void
    {
        $this->expectException(DatosInvalidos::class);
        new Terminos(Dinero::desde('105'), 12, 2026, 11, 1, [new Cargo('Descuento', Dinero::desdeCentavos(-500))]);
    }

    public function test_dinero_acepta_coma_y_punto(): void
    {
        $this->assertSame(10550, Dinero::desde('105,50')->centavos);
        $this->assertSame(10550, Dinero::desde('105.5')->centavos);
        $this->assertSame(10500, Dinero::desde(105)->centavos);
    }

    public function test_dinero_rechaza_formatos_ambiguos(): void
    {
        $this->expectException(DatosInvalidos::class);
        Dinero::desde('1.234,56');
    }
}
