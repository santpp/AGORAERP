# Inventario de valores propios de ASOCIM (fase 0)

Todo lo que hoy está escrito en el código para ASOCIM y que, en la versión multi-empresa, debe salir de
los datos de cada empresa (tenant) o de su formato de PDF. Revisado el 21/10/2026 sobre la rama
`claude/code-hostinger-readiness-am8csx`. Las líneas pueden moverse; el archivo y el texto sirven de referencia.

Destino: **T** = tabla `tenants` (o su configuración), **F** = formato de PDF de la empresa (`tools/pdf/formatos/`),
**R** = reglas del contrato (configuración por empresa o por tipo de contrato), **G** = integración GHL por empresa,
**P** = plataforma (igual para todos; se queda en el código).

## 1. Identidad legal y contacto
| Valor | Dónde | Destino |
|---|---|---|
| Razón social, RIF J-50207138-5 | `src/Correo/Plantilla.php` (pie, línea ~88) | T |
| Dirección (Av. Las Delicias, Qta. Nro. 02, urb. La Soledad, Maracay, Aragua) | `src/Correo/Plantilla.php` (~89) | T |
| Teléfono, sitio web, Instagram | `src/Correo/Plantilla.php` (~90) | T |
| Nombre «ASOCIM» en asuntos de correo | `src/Servicio/ContratoServicio.php` (asuntos «Tu convenio de pago · ASOCIM», «Tu convenio firmado · ASOCIM») | T |
| Nombre «ASOCIM» en textos de correo | `src/Correo/Plantilla.php` (~29) | T |
| Título y cabecera de la página de firma | `public/firmar.php` (~63, ~127) | T |
| Título del panel | `frontend/src/index.html` («ASOCIM · Contratos») | T |

## 2. Marca
| Valor | Dónde | Destino |
|---|---|---|
| Azul #1A1070 y naranja #F86000 | `src/Correo/Plantilla.php` (constantes), `public/firmar.php` (variables CSS y trazo de firma), `frontend/src/styles.scss` (tokens), `frontend/src/app/features/login/login.scss` | T |
| Logo a color | `public/logo.png`; usado en `frontend/src/app/app.html` | T |
| Logos en blanco | `public/asocim-blanco.png` (correo), `frontend/public/asocim-blanco.png` y `agora-blanco.png` (entrada) | T (el de Agora es de la plataforma: P) |
| Atmósferas de la pantalla de entrada (degradados azul/naranja) | `frontend/src/app/features/login/login.scss` | T (colores) |

## 3. Contrato y PDF
| Valor | Dónde | Destino |
|---|---|---|
| PDF original y sus coordenadas, textos de ejemplo, cajas de firma, tabla de cuotas | `tools/pdf/formatos/asocim_convenio.py`, `plantillas/convenio_original.pdf` | F |
| Formato por defecto `asocim_convenio` | `tools/pdf/llenar_convenio.py` | F (el tenant elige su formato) |
| Fuentes Inter | `plantillas/fuentes/` | P |
| Datos que recibe el PDF (claves de `datosPdf`) | `src/Servicio/ContratoServicio.php::datosPdf` | P, con campos extra por formato |

## 4. Reglas del contrato
| Valor | Dónde | Destino |
|---|---|---|
| Vencimientos: día 30 (1 cuota), 15 y 30 (2 cuotas), viernes (4 cuotas); último día si el mes no tiene 30 | `src/Calculo/CalculadoraContrato.php` | R |
| Modalidades permitidas 1, 2, 4 cuotas por mes | `src/Calculo/Terminos.php` (`CUOTAS_POR_MES`) | R |
| Máximo 20 meses | `src/Servicio/ContratoServicio.php::enviar` y `FILAS_TABLA` del formato | R / F |
| Validez del enlace de firma: 7 días | `ContratoServicio::DIAS_VALIDEZ_ENLACE` | R |
| Validez de la descarga del firmado: 30 días | `ContratoServicio::DIAS_DESCARGA` | R |
| Zona horaria America/Caracas | `ContratoServicio.php` (fecha del contrato y de envío) | T |
| Formato de montos «1.260,00» y fechas MM/DD/YYYY | `frontend/src/app/core/formato.ts`, `src/Documento/Formato.php` | T (configuración regional) |

## 5. Integración con GHL
| Valor | Dónde | Destino |
|---|---|---|
| Token y location ID (una sola subcuenta) | `.env` (`GHL_TOKEN`, `GHL_LOCATION_ID`), `src/Web/arranque.php` | G |
| Secreto del webhook (uno solo) | `.env` (`GHL_WEBHOOK_SECRET`) | G |
| Campo de cédula `contact.cedula` | `src/Ghl/ClienteGhl.php` (búsqueda y definición del campo) | G (clave configurable) |
| Nombre de la plataforma «AGORA» en mensajes al personal | `src/Ghl/ClienteGhl.php`, `src/Web/Aplicacion.php`, `frontend/.../nuevo.html`, `lista.html` | P (marca de la agencia) |

## 6. Plataforma (se queda en el código)
| Valor | Dónde |
|---|---|
| URL por defecto `https://contratos.agoradigital.app` | `src/Web/arranque.php`, `src/Web/Aplicacion.php`, `ContratoServicio` (pasará a ser el dominio de cada tenant) |
| Roles ADMIN, REMITENTE, VISOR y permisos | `src/Seguridad/Roles.php` |
| Sesión 12 h, 5 intentos, bloqueo 15 min, clave mínima 10 | `src/Servicio/UsuarioServicio.php` (podrían ser política por tenant más adelante) |
| Espacio de nombres `Asocim\Contratos` | todo `src/` (renombrar es opcional y puramente cosmético) |

## 7. Observaciones
- Corregido en la fase 0: el correo de la copia firmada usaba un HTML en línea sin marca en
  `ContratoServicio::avisarCliente`; ahora usa `Plantilla::convenioFirmado`, como los otros dos correos.
- El parámetro `$personalAsocim` de `ContratoServicio::enviar` es el nombre de quien envía; solo cambia el nombre.
