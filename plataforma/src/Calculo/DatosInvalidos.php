<?php

declare(strict_types=1);

namespace Agora\Plataforma\Calculo;

/** Se lanza cuando los datos del contrato no permiten calcular el plan de pagos. */
final class DatosInvalidos extends \InvalidArgumentException
{
}
