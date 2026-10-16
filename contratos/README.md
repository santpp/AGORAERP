# Contratos ASOCIM · motor de cálculo

Primera pieza del sistema de firma de contratos: calcula el plan de pagos a partir de los términos acordados.

## Ejecutar las pruebas

```bash
php tests/run.php          # sin dependencias
```

Con Composer y PHPUnit instalados (en tu equipo):

```bash
composer install
vendor/bin/phpunit
```

## Reglas del cálculo

| Regla | Detalle |
|---|---|
| Precio del curso | cuota mensual × número de meses |
| Cuotas por mes | 1, 2 o 4. No cambian el precio del curso; cada pago es una parte de la cuota mensual |
| Días de pago | 1 cuota: día 30 · 2 cuotas: días 15 y 30 · 4 cuotas: viernes |
| Mes sin día 30 | Vence el último día del mes (febrero: 28 o 29) |
| Redondeo | Todo en centavos. La última parte de cada mes absorbe el sobrante |
| Total a pagar | precio del curso + cargos (inscripción, mora, constancias…) |
| Duración | de 1 a 24 meses, definida por contrato |

## Supuestos que hay que confirmar

- **Viernes para 4 cuotas:** el convenio dice "viernes de cada mes" sin indicar cuáles. Por defecto se usan el 1.º, 2.º, 3.º y 4.º viernes del mes (`Terminos::$viernes`). Si ASOCIM prefiere otros, se cambia ahí.
- **Mora:** el motor no calcula la mora. Solo registra el cargo que el personal escriba.

## Estructura

```
src/Calculo/
  Dinero.php                 montos en centavos
  Cargo.php                  inscripción, mora, otros (editables)
  Terminos.php               entradas del contrato, con validaciones
  CalculadoraContrato.php    calcula cuotas, fechas y totales
  Cuota.php, Resultado.php   salidas
  DatosInvalidos.php         error de datos no válidos
tests/
  CalculadoraContratoTest.php
  ShimPHPUnit.php            base mínima para correr sin PHPUnit
  run.php                    ejecutor sin dependencias
```
