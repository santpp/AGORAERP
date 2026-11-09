<?php

declare(strict_types=1);

namespace Asocim\Contratos\Calculo;

/** Resultado del cálculo: lo que se muestra en el contrato y se guarda con la versión. */
final class Resultado
{
    /** @param list<Cargo> $cargos @param list<Cuota> $cuotas */
    public function __construct(
        public readonly Dinero $precioCurso,
        public readonly array $cargos,
        public readonly Dinero $totalCargos,
        public readonly Dinero $totalAPagar,
        public readonly array $cuotas,
    ) {
    }
}
