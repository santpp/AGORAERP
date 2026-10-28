<?php

declare(strict_types=1);

namespace Agora\Plataforma\Documento;

use Agora\Plataforma\Calculo\Dinero;

/** Formato en español: palabras, montos y meses, como aparecen en el convenio. */
final class Formato
{
    private const UNIDADES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
        'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
        'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
    private const DECENAS = [3 => 'treinta', 4 => 'cuarenta', 5 => 'cincuenta', 6 => 'sesenta', 7 => 'setenta', 8 => 'ochenta', 9 => 'noventa'];
    private const MESES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

    /** Número entero en palabras (1 a 99). "doce", "veintitrés", "treinta y uno". */
    public static function palabras(int $n): string
    {
        if ($n < 0 || $n > 99) {
            throw new \InvalidArgumentException('Solo se convierten números de 0 a 99.');
        }
        if ($n <= 29) {
            return self::UNIDADES[$n];
        }
        $d = intdiv($n, 10);
        $u = $n % 10;
        return self::DECENAS[$d] . ($u === 0 ? '' : ' y ' . self::UNIDADES[$u]);
    }

    /** "(12)" → "doce (12)" en el estilo del convenio: palabras y cifra entre paréntesis. */
    public static function conCifra(int $n): string
    {
        return self::palabras($n) . ' (' . $n . ')';
    }

    /** Monto en el estilo del convenio: "1.260", "105", "52,50". Sin decimales si son cero. */
    public static function dinero(Dinero $d): string
    {
        $c = $d->centavos;
        $entero = intdiv($c, 100);
        $decimales = $c % 100;
        $txt = number_format($entero, 0, '', '.');
        return $decimales === 0 ? $txt : $txt . ',' . str_pad((string) $decimales, 2, '0', STR_PAD_LEFT);
    }

    /** Monto entero en mayúsculas para cláusulas: "DIEZ DÓLARES AMERICANOS". */
    public static function dolaresEnPalabras(int $n): string
    {
        return mb_strtoupper(self::palabras($n)) . ' DÓLARES AMERICANOS';
    }

    public static function mes(int $m): string
    {
        if ($m < 1 || $m > 12) {
            throw new \InvalidArgumentException('Mes no válido.');
        }
        return self::MESES[$m];
    }

    public static function modalidad(int $cuotasPorMes): string
    {
        return match ($cuotasPorMes) {
            1 => '1 Cuota Mensual',
            2 => '2 Cuotas Mensuales',
            4 => '4 Cuotas Mensuales',
            default => throw new \InvalidArgumentException('Cuotas por mes no válidas.'),
        };
    }
}
