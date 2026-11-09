<?php

declare(strict_types=1);

namespace Agora\Plataforma\Calculo;

/** Un cargo fijo además del curso (inscripción, mora, constancias…). Editable por el personal. */
final class Cargo
{
    public function __construct(
        public readonly string $concepto,
        public readonly Dinero $monto,
    ) {
    }
}
