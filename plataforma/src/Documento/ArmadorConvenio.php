<?php

declare(strict_types=1);

namespace Agora\Plataforma\Documento;

use Agora\Plataforma\Calculo\Resultado;
use Agora\Plataforma\Calculo\Terminos;
use Agora\Plataforma\Calculo\Dinero;

/** Convierte los datos del contrato en las variables de la plantilla convenio.html. */
final class ArmadorConvenio
{
    private const DIAS_FIRMA = 13;

    /**
     * @param array{nombre:string,cedula:string,telefono:string,staff:string,fecha:string,descuento_primera:string} $persona
     */
    public function variables(array $persona, Terminos $t, Resultado $r): array
    {
        $cuotasPorMes = $t->cuotasPorMes;
        $fecha = new \DateTimeImmutable($persona['fecha']);
        $mora = Dinero::desde('10');
        $cronograma = [];
        $numero = 0;
        for ($mes = 0; $mes < $t->meses; $mes++) {
            $numero++;
            $f = (new \DateTimeImmutable(sprintf('%04d-%02d-01', $t->anioInicio, $t->mesInicio)))->modify("+{$mes} months");
            $cronograma[] = [
                'n' => (string) $numero,
                'mes' => ucfirst(Formato::mes((int) $f->format('n'))),
                'anio' => $f->format('Y'),
                'modalidad_mes' => Formato::modalidad($cuotasPorMes),
            ];
        }

        $inscripcion = array_values(array_filter($t->cargos, fn ($c) => stripos($c->concepto, 'inscrip') !== false));
        $inscripcionTexto = $inscripcion === [] ? '0' : Formato::dinero($inscripcion[0]->monto);

        return [
            'estudiante_nombre' => mb_strtoupper($persona['nombre']),
            'estudiante_cedula' => preg_replace('/\D/', '', $persona['cedula']),
            'estudiante_telefono' => $persona['telefono'],
            'meses' => (string) $t->meses,
            'meses_texto' => Formato::palabras($t->meses),
            'precio_curso' => Formato::dinero($r->precioCurso),
            'cuota_mensual' => Formato::dinero($t->cuotaMensual),
            'inscripcion' => $inscripcionTexto,
            'mora' => '10,00',
            'mora_palabras' => Formato::dolaresEnPalabras(10),
            'descuento_primera' => $persona['descuento_primera'],
            'modalidad' => Formato::modalidad($cuotasPorMes),
            'staff_nombre' => $persona['staff'],
            'fecha_dia' => (string) (int) $fecha->format('j'),
            'fecha_mes' => Formato::mes((int) $fecha->format('n')),
            'fecha_anio' => $fecha->format('Y'),
            'cronograma' => $cronograma,
        ];
    }
}
