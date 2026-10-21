<?php

declare(strict_types=1);

namespace Agora\Plataforma\Calculo;

/** Un pago del plan: número, fecha de vencimiento y monto. */
final class Cuota
{
    public function __construct(
        public readonly int $numero,
        public readonly string $vencimiento,
        public readonly Dinero $monto,
        public readonly int $mesNumero,
    ) {
    }
}
