<?php

declare(strict_types=1);

namespace Agora\Plataforma\Calculo;

/**
 * Montos en centavos (enteros). Evita los errores de redondeo de los decimales de PHP.
 * 105.00 USD se guarda como 10500.
 */
final class Dinero
{
    private function __construct(public readonly int $centavos)
    {
    }

    public static function desdeCentavos(int $centavos): self
    {
        return new self($centavos);
    }

    /** Acepta "105", "105.5", "105,50" o 105.5; rechaza más de 2 decimales. */
    public static function desde(string|int|float $valor): self
    {
        $texto = str_replace(',', '.', trim((string) $valor));
        if (!preg_match('/^\d+(\.\d{1,2})?$/', $texto)) {
            throw new DatosInvalidos("Monto no válido: {$valor}");
        }
        [$entero, $decimales] = array_pad(explode('.', $texto, 2), 2, '0');
        return new self((int) $entero * 100 + (int) str_pad($decimales, 2, '0'));
    }

    public function mas(self $otro): self
    {
        return new self($this->centavos + $otro->centavos);
    }

    public function por(int $factor): self
    {
        return new self($this->centavos * $factor);
    }

    public function esNegativo(): bool
    {
        return $this->centavos < 0;
    }

    public function aTexto(): string
    {
        return number_format($this->centavos / 100, 2, '.', '');
    }
}
