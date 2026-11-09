<?php

declare(strict_types=1);

namespace Asocim\Contratos\Calculo;

/**
 * Lo que acuerdan el cliente y el personal para un contrato. Es la única entrada del motor.
 */
final class Terminos
{
    /** Días de pago permitidos por número de cuotas al mes (cláusula 2 del convenio). */
    public const CUOTAS_POR_MES = [1, 2, 4];

    /**
     * @param list<Cargo> $cargos
     * @param list<int>   $viernes ordinales de los viernes para pagos de 4 cuotas (1 = primer viernes)
     */
    public function __construct(
        public readonly Dinero $cuotaMensual,
        public readonly int $meses,
        public readonly int $anioInicio,
        public readonly int $mesInicio,
        public readonly int $cuotasPorMes = 1,
        public readonly array $cargos = [],
        public readonly array $viernes = [1, 2, 3, 4],
    ) {
        if ($meses < 1 || $meses > 24) {
            throw new DatosInvalidos('La duración debe estar entre 1 y 24 meses.');
        }
        if (!checkdate($mesInicio, 1, $anioInicio)) {
            throw new DatosInvalidos("Mes de inicio no válido: {$anioInicio}-{$mesInicio}.");
        }
        if (!in_array($cuotasPorMes, self::CUOTAS_POR_MES, true)) {
            throw new DatosInvalidos('Las cuotas por mes deben ser 1, 2 o 4.');
        }
        if ($cuotasPorMes === 4 && ($viernes === [] || array_diff($viernes, [1, 2, 3, 4]) !== [])) {
            throw new DatosInvalidos('Los viernes de pago deben ser ordinales entre 1 y 4.');
        }
        if ($cuotaMensual->esNegativo() || $cuotaMensual->centavos === 0) {
            throw new DatosInvalidos('La cuota mensual debe ser mayor que cero.');
        }
        foreach ($cargos as $cargo) {
            if (!$cargo instanceof Cargo || $cargo->monto->esNegativo()) {
                throw new DatosInvalidos('Cada cargo debe tener un monto que no sea negativo.');
            }
        }
    }
}
