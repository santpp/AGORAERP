<?php

declare(strict_types=1);

namespace Asocim\Contratos\Calculo;

/**
 * Calcula el plan de pagos completo a partir de los términos.
 *
 * Reglas (convenio ASOCIM):
 *  - Precio del curso = cuota mensual × número de meses. Las cuotas por mes no lo cambian.
 *  - 1 cuota al mes: vence el día 30. 2 cuotas: días 15 y 30. 4 cuotas: viernes indicados.
 *  - Si el mes no tiene día 30 (febrero, etc.), vence el último día del mes.
 *  - Cada mes se divide en partes iguales en centavos; la última parte absorbe el redondeo.
 *  - Total a pagar = precio del curso + cargos.
 */
final class CalculadoraContrato
{
    public function calcular(Terminos $t): Resultado
    {
        $precioCurso = $t->cuotaMensual->por($t->meses);
        $cuotas = [];
        $numero = 1;

        for ($mes = 0; $mes < $t->meses; $mes++) {
            $anio = (int) date('Y', mktime(0, 0, 0, $t->mesInicio + $mes, 1, $t->anioInicio));
            $mesCalendario = (int) date('n', mktime(0, 0, 0, $t->mesInicio + $mes, 1, $t->anioInicio));

            $fechas = $this->fechasDelMes($anio, $mesCalendario, $t->cuotasPorMes, $t->viernes);
            $partes = $this->repartir($t->cuotaMensual->centavos, $t->cuotasPorMes);

            foreach ($fechas as $i => $fecha) {
                $cuotas[] = new Cuota($numero++, $fecha, Dinero::desdeCentavos($partes[$i]), $mes + 1);
            }
        }

        $totalCargos = array_reduce(
            $t->cargos,
            fn (Dinero $acum, Cargo $c) => $acum->mas($c->monto),
            Dinero::desdeCentavos(0),
        );

        return new Resultado(
            precioCurso: $precioCurso,
            cargos: $t->cargos,
            totalCargos: $totalCargos,
            totalAPagar: $precioCurso->mas($totalCargos),
            cuotas: $cuotas,
        );
    }

    /** @return list<string> fechas Y-m-d de los pagos de un mes, en orden */
    private function fechasDelMes(int $anio, int $mes, int $cuotasPorMes, array $viernes): array
    {
        $ultimoDia = (int) date('t', mktime(0, 0, 0, $mes, 1, $anio));

        if ($cuotasPorMes === 4) {
            $dias = [];
            $primerDia = (int) date('w', mktime(0, 0, 0, $mes, 1, $anio));
            $primerViernes = 1 + (5 - $primerDia + 7) % 7;
            foreach (array_values($viernes) as $ordinal) {
                $dias[] = $primerViernes + 7 * ($ordinal - 1);
            }
            sort($dias);
        } elseif ($cuotasPorMes === 2) {
            $dias = [15, 30];
        } else {
            $dias = [30];
        }

        return array_map(
            fn (int $dia) => sprintf('%04d-%02d-%02d', $anio, $mes, min($dia, $ultimoDia)),
            $dias,
        );
    }

    /**
     * Reparte un monto en partes iguales en centavos. La última parte absorbe el sobrante.
     * @return list<int>
     */
    private function repartir(int $centavos, int $partes): array
    {
        $base = intdiv($centavos, $partes);
        $resto = $centavos - $base * $partes;
        $salida = array_fill(0, $partes, $base);
        $salida[$partes - 1] += $resto;
        return $salida;
    }
}
