<?php

declare(strict_types=1);

namespace Asocim\Contratos\Servicio;

/** Error que se muestra tal cual al personal o al cliente (con código HTTP sugerido). */
final class ErrorContrato extends \RuntimeException
{
    public function __construct(string $mensaje, public readonly int $http = 422)
    {
        parent::__construct($mensaje);
    }
}
