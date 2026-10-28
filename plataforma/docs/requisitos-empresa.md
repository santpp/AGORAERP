# Requisitos de una empresa dentro de la plataforma

Lista de todo lo que hace falta para activar una empresa (tenant). Cada ítem indica quién lo aporta (E = empresa, A = agencia), si es obligatorio para activar (O) u opcional (P), y en qué fase del sistema se necesita.

## 1. Identidad legal y fiscal
| Dato | Responsable | Obl. | Fase |
|---|---|---|---|
| Razón social completa | E | O | 3 |
| RIF o identificación fiscal | E | O | 3 |
| Dirección fiscal (calle, ciudad, estado, código postal) | E | O | 3 |
| Teléfono de atención y correo de contacto | E | O | 3 |
| Sitio web y redes sociales (para el pie de correo y de contrato) | E | P | 4 |
| Representante legal (nombre, cédula, cargo) | E | O | 4 |
| Sello o firma institucional para el convenio (imagen PNG) | E | P | 4 |
| Zona horaria (p. ej., America/Caracas) y moneda principal | E | O | 3 |

## 2. Marca
| Dato | Responsable | Obl. | Fase |
|---|---|---|---|
| Logo completo a color (PNG o SVG, fondo transparente) | E | O | 5 |
| Logo en blanco (para fondos oscuros) | E | O | 5 |
| Colores de marca: principal, secundario, acento (códigos hex) | E | O | 5 |
| Nombre corto para el panel y los correos (p. ej., «ASOCIM Contratos») | E | O | 5 |
| Remitente de correo: nombre visible y correo de respuesta | E | O | 5 |
| Dominio propio para el panel (opcional) | E | P | 3 |

## 3. Integración con GoHighLevel
| Dato | Responsable | Obl. | Fase |
|---|---|---|---|
| Location ID de la subcuenta | E | O | 3 |
| Token de API (Private Integration) con permisos de contactos, usuarios, conversaciones y campos personalizados | E (la agencia lo carga) | O | 3 |
| Campo personalizado de cédula: clave `contact.cedula` (o equivalente) | E | O | 3 |
| Usuarios de GHL que representan al personal (correo igual al del panel) | E | O | 3 |
| Canal de correo habilitado en la subcuenta | E | O | 3 |
| Prueba de conexión superada (búsqueda de contactos y envío de correo de prueba) | A | O | 5 |

## 4. Contenido del convenio
| Dato | Responsable | Obl. | Fase |
|---|---|---|---|
| Convenio base en PDF (el original, sin firmar) | E | O | 4 |
| Mapa de campos: dónde va cada dato variable | A (con E) | O | 4 |
| Texto de cláusulas, con versión y fecha de vigencia | E | O | 4 |
| Métodos de pago y datos bancarios que aparecen en el convenio | E | O | 4 |
| Texto legal de cada cláusula sensible (mora, rescisión, congelación) | E (revisado por su asesor legal) | O | 4 |
| Regla de tipo de cambio (p. ej., tasa BCV del día de pago) | E | O | 4 |
| Texto del anexo de control de pagos | E | P | 4 |

## 5. Condiciones comerciales
| Dato | Responsable | Obl. | Fase |
|---|---|---|---|
| Lista de programas o cursos, con precio base | E | O | 4 |
| Modalidades de pago (contado, 1, 2, 4 cuotas u otras) | E | O | 4 |
| Regla de vencimiento (día del mes, o días de la semana) | E | O | 4 |
| Regla de días feriados y fines de semana | E | O | 4 |
| Inscripción: monto y cuándo se cobra | E | O | 4 |
| Descuentos permitidos y quién los aprueba | E | O | 4 |
| Plazo de gracia y monto de recargo por mora | E | O | 4 |
| Redondeo de montos (decimales y criterio) | E | O | 4 |

## 6. Usuarios y roles
| Dato | Responsable | Obl. | Fase |
|---|---|---|---|
| Al menos una persona con rol ADMIN (dueña de la cuenta) | E | O | 3 |
| Personas con REMITENTE (preparan y envían) | E | P | 3 |
| Personas con VISOR (solo consulta) | E | P | 3 |
| Política de claves (longitud mínima, caducidad) | E | O | 3 |
| Política de desactivación al salir una persona | E | O | 3 |
| Autenticación de dos factores (cuando exista) | E | P | 2 |

## 7. Notificaciones
| Dato | Responsable | Obl. | Fase |
|---|---|---|---|
| Personal que recibe el aviso al firmar (responsable) | E | O | 3 |
| Texto del correo de envío del enlace (aprobado) | E | O | 4 |
| Texto del correo de firma y de descarga (aprobado) | E | O | 4 |
| Horario en que se envían avisos (si se restringe) | E | P | 5 |

## 8. Datos personales y cumplimiento
| Dato | Responsable | Obl. | Fase |
|---|---|---|---|
| Aviso de privacidad visible antes de firmar | E (texto), A (publicación) | O | 3 |
| Consentimiento explícito del tratamiento de datos en la firma | E | O | 3 |
| Plazo de conservación de convenios firmados y de datos de contacto | E | O | 3 |
| Procedimiento para atender solicitudes de acceso, corrección y eliminación | E | O | 3 |
| Lugar de alojamiento de los datos (país) y encargado del tratamiento | A | O | 3 |
| Acuerdo de tratamiento de datos entre agencia y empresa | A y E | O | 3 |
| Política de copias de seguridad y retención de copias | A | O | 3 |
| Registro de auditoría: quién hizo qué y cuándo | A | O | 2 |

## 9. Operación y soporte
| Dato | Responsable | Obl. | Fase |
|---|---|---|---|
| Subdominio o dominio propio | A | O | 3 |
| Certificado SSL válido para ese dominio | A | O | 3 |
| Persona de contacto técnico y de negocio | E | O | 5 |
| Horario de soporte y canal (correo, WhatsApp, otro) | A | O | 7 |
| Tiempo máximo de respuesta a incidentes | A | P | 7 |
| Plan contratado y límites (contratos y usuarios por mes) | A | O | 7 |
| Datos de facturación (razón social, RIF, correo) | E | O | 7 |

## 10. Pagos (si el módulo de seguimiento se activa)
| Dato | Responsable | Obl. | Fase |
|---|---|---|---|
| Cuentas bancarias receptoras (banco, tipo, número, titular) | E | O | 6 |
| Pago Móvil: banco, teléfono, RIF | E | P | 6 |
| Otros medios (Zelle, PayPal): titular y dato de cobro | E | P | 6 |
| Quién concilia los pagos y con qué frecuencia | E | O | 6 |
| Tratamiento de pagos parciales y de pagos fuera de fecha | E | O | 6 |

## 11. Activación: condiciones mínimas
Una empresa se activa solo cuando cumple todo lo marcado como **O** en las secciones 1 a 9, la prueba de conexión con GHL está aprobada, y la persona ADMIN ha entrado y firmado un convenio de prueba.

Los módulos de la sección 10 se activan por separado, cuando la empresa los contrate.
