# Hoja de ruta: de convenio único a plataforma multi-empresa

Base: informe técnico de Contratos ASOCIM (20/10/2026). Este documento organiza el trabajo en fases, con criterios de salida, y en vías que se pueden seguir en paralelo.

**Dónde se construye (21/10/2026):** la plataforma es una aplicación nueva en `plataforma/`, en el mismo
repositorio, a partir del código de `contratos/`. `contratos/` sigue atendiendo a ASOCIM en producción sin cambios
de plataforma; ASOCIM pasará a la plataforma como su primera empresa cuando esta esté lista. Entorno: `tests.agoradigital.app`.

## 0. Principios de ejecución

- **Una fase no empieza hasta que la anterior cumple su criterio de salida.** Los criterios son verificables (pruebas, despliegue, métricas), no "casi listo".
- **ASOCIM sigue en producción durante todo el proceso.** Cada cambio que toque datos se despliega con copia previa y plan de vuelta atrás.
- **Ramas y revisión.** Una rama por fase o por entrega, fusión solo con pruebas en verde (`php tests/run.php`, `ng build`, prueba de humo del PDF).
- **Entorno de pruebas separado** del de producción (subdominio `pruebas.`), con datos ficticios.
- **Decisiones registradas** en `docs/decisiones/` (una página por decisión: contexto, opción elegida, consecuencias).

## 1. Vías de trabajo

| Vía | Qué cubre | Depende de |
|---|---|---|
| **A. Fundamentos** | MySQL, migraciones, CI, copias de seguridad, entorno de pruebas, webhook firmado, claves de cifrado con KDF | Nada. Empieza ya. |
| **B. Núcleo** | Dividir `ContratoServicio`, repositorios, casos de uso, cola de trabajos | A1, A2 |
| **C. Plataforma** | Tenants, membresías, aislamiento, resolución de dominio, credenciales por tenant | B |
| **D. Documentos** | Plantillas de PDF por tenant, editor de campos, motor alternativo si se decide | C1 (para multi-tenant), o nada si se mantiene ASOCIM |
| **E. Producto** | Seguimiento de pagos, mora, reportes, adendas | B (para no construirlo dos veces) |
| **F. Comercial y operación** | Alta de empresas, facturación de la plataforma, soporte, documentación | C y D |

Pueden avanzar en paralelo: A con E1 (diseño de pagos), y D1 (inventario de plantillas) con C.

## 2. Fases

### Fase 0: Preparación (1–2 semanas)
- Entorno de pruebas y copia de seguridad diaria verificada con una restauración real.
- Inventario de todo lo que hoy es constante de ASOCIM (RIF, dirección, colores, textos, rutas de logos) en una sola tabla.
- Decisión sobre el modelo de negocio (agencia tipo GHL, o empresas independientes) y sobre la generación de PDF.
- **Salida:** restauración probada; inventario aprobado; decisiones D-001 y D-002 cerradas.

### Fase 1: Fundamentos (A) (3–4 semanas)
Estado (21/10/2026): **A0, A1, A2, A5 y A6 hechos** (MySQL/MariaDB, migraciones, integración continua en GitHub Actions:
`.github/workflows/plataforma.yml`, y cabeceras de seguridad con Inter servida desde el propio panel). Falta el traspaso
real a MySQL en tests. Pendientes: A3 y A4.

A6 en detalle: CSP del panel en `public/.htaccess` (sin scripts en línea; `style-src 'unsafe-inline'` porque Angular
Material inyecta estilos), CSP con nonce por petición en `firmar.php`, `default-src 'none'` en las respuestas JSON de la
API y `frame-ancestors 'self'` en los PDF. Además `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` y HSTS.
Comprobado en Chromium: entrar, lista, detalle con el PDF y firma completa sin ninguna violación de CSP.

A5 en detalle: el token CSRF es `HMAC-SHA256(token de sesión)`, sin guardar nada. Se entrega en la cookie
`XSRF-TOKEN` (legible, `SameSite=Strict`) al entrar y en `/api/yo`; Angular lo devuelve en `X-XSRF-TOKEN`. Toda
petición que no sea GET a `/api/` con cookie de sesión lo exige (403 si falta o no coincide), salvo `/api/login` y la
firma pública `/api/firmar/…`. Pruebas en `tests/AplicacionTest.php`.
- A0 **MySQL** como base de producción, para poder consultarla de forma remota. Cambios: esquema con
  `AUTO_INCREMENT`, `VARCHAR` en las columnas únicas y `LONGBLOB` para la firma; conexión con usuario y clave
  (`CONTRATOS_BD_USUARIO`, `CONTRATOS_BD_CLAVE`); `INSERT OR REPLACE` y `PRAGMA` sustituidos por SQL válido en
  ambos motores; respaldos con `mysqldump`. SQLite se mantiene para las pruebas automáticas. Script de traspaso
  de los datos actuales de SQLite a MySQL, con verificación de filas y ensayo en el entorno de pruebas.
  Acceso remoto seguro: puerto 3306 cerrado al público; acceso por túnel SSH (recomendado) o por phpMyAdmin
  de CyberPanel, con un usuario de solo lectura para consultas y otro para la aplicación.
- A1 Migraciones versionadas (`migraciones/001_inicial.sql`, …) y tabla `schema_migrations`, para SQLite y MySQL.
- A2 Pruebas en CI con cada cambio: PHP, Angular, PDF de ejemplo.
- A3 Webhook con HMAC-SHA256 del cuerpo, marca de tiempo y rechazo de repeticiones.
- A4 Claves: HKDF para cifrado, identificador de versión de clave en `enlaces_firma`, procedimiento de rotación.
- A5 Tokens CSRF en las acciones del panel.
- A6 Cabeceras de seguridad (CSP, `X-Content-Type-Options`, `Referrer-Policy`) y fuentes servidas localmente.
- **Salida:** producción en MySQL con los datos traspasados y verificados; CI en verde en cada fusión (pruebas en SQLite y MySQL); webhook firmado en producción; rotación de clave ensayada en pruebas.

### Fase 2: Núcleo (B) (3–4 semanas)
- B1 Separar `ContratoServicio` en casos de uso: `CrearConvenio`, `EnviarConvenio`, `FirmarConvenio`, `RevocarEnlace`, `EliminarBorrador`, `NotificarPersonal`.
- B2 Repositorios por tabla con la conexión inyectada. Nada de SQL fuera de ellos.
- B3 Cola de trabajos (`trabajos` con estado, intentos, reintentos) para correo y PDF; cron cada minuto.
- B4 Tiempo límite en `exec` del PDF y en las llamadas HTTP a GHL.
- **Salida:** `ContratoServicio` eliminado; cada caso de uso con sus pruebas; un fallo de GHL no bloquea la petición del usuario.

### Fase 3: Plataforma (C) (4–6 semanas)
- C1 Tablas `tenants`, `membresias`; `tenant_id` en todas las tablas; migración de los datos actuales al tenant 1.
- C2 Contexto de tenant por petición, inyectado desde el front controller. Ninguna consulta sin tenant.
- C3 Resolución de dominio (`asocim.` y dominios propios) y certificado comodín.
- C4 Credenciales de GHL por tenant, cifradas en base de datos. Webhook enrutado por `locationId`.
- C5 Pruebas de aislamiento: cada endpoint probado con un usuario de otro tenant (debe devolver 404, no 403).
- C6 Panel con tema y nombre del tenant desde `/api/yo`.
- **Salida:** dos tenants de prueba operando a la vez sin ver datos del otro; ASOCIM funcionando como tenant 1.

### Fase 4: Documentos (D) (3–5 semanas, según la decisión D-002)
- Opción 1 (calibrar por cliente): manifiesto JSON por tenant con coordenadas de campos; herramienta de calibración que muestra el PDF y permite arrastrar campos.
- Opción 2 (HTML a PDF): plantilla HTML por tenant, renderizado con un motor de PDF, y migración del diseño de ASOCIM con comparación píxel a píxel frente al original.
- D-x Pruebas de regresión: el PDF generado para un conjunto fijo de datos debe coincidir con el aprobado.
- **Salida:** un tenant nuevo puede tener su convenio propio sin cambios de código.

### Fase 5: Onboarding y agencia (F1) (3–4 semanas)
- Consola de agencia: crear tenant, conectar GHL (con prueba de conexión), invitar usuarios, subir branding, activar tenant.
- Lista de verificación de activación (sección de requisitos) con bloqueo de activación si falta algo obligatorio.
- Plantillas de correo por tenant con vista previa.
- **Salida:** una empresa nueva se activa sin intervención de desarrollo, en menos de un día.

### Fase 6: Producto (E) (en paralelo a partir de la fase 2)
- E1 Diseño de pagos: qué métodos (transferencia, Pago Móvil, Zelle), cómo se registra un pago, quién lo concilia.
- E2 Conciliación: registrar pagos, asociarlos a cuotas, estado de la cuota (pagada, parcial, vencida).
- E3 Mora automática según la cláusula de recargo, con aviso al cliente.
- E4 Reportes de cartera: vencidas, firmas pendientes, enlaces por vencer, exportación a CSV.
- E5 Adendas y cambios de cronograma como versión nueva con historial.
- E6 Enlace de firma por WhatsApp con la plantilla aprobada de la cuenta WABA del cliente en GHL. Vía recomendada: el sistema guarda el enlace en un campo personalizado del contacto (p. ej., `contact.enlace_convenio`) y añade una etiqueta (p. ej., `convenio-enviado`); un workflow de GHL disparado por la etiqueta envía la plantilla con la variable del enlace. Al generar un enlace nuevo, se actualiza el campo y se vuelve a poner la etiqueta. Alternativa: envío directo por `/conversations/messages` con tipo WhatsApp y `templateId`, a validar contra la cuenta (formato de variables no confirmado). Requiere: clave del campo, nombre de la etiqueta, variables de la plantilla y el workflow creado en GHL.
- E7 Estado de entrega del correo según GHL. Guardar el `messageId` que devuelve `/conversations/messages` en cada envío (enlace, copia firmada, aviso al personal) y consultar o recibir su estado (entregado, rebotado, fallido). Mostrarlo en el detalle del convenio («Entregado», «Rebotado: revisa el correo del cliente») y en el registro. Un rebote dispara un aviso a la persona responsable. Antes de construirlo: confirmar con la cuenta de ASOCIM los campos de estado de la API (consulta del mensaje o webhook de estadísticas de correo). Encaja con B3 (cola de trabajos) para consultar el estado sin bloquear la petición.

### Fase 7: Operación y comercial (F2) (continuo)
- Facturación de la plataforma por tenant (plan, límites de contratos y usuarios, uso mensual).
- Documentación de usuario por rol y de administración de tenant.
- Soporte: canal, horario, tiempos de respuesta, registro de incidentes.
- Monitoreo: errores de PHP, fallos de GHL, cola de trabajos atascada, certificados por vencer.

## 3. Rutas posibles

**Ruta 1: segura (recomendada).** Fase 0 → 1 → 2 → 3 → 4 → 5. Plataforma completa antes de vender a terceros. Tiempo estimado total: 5–7 meses con un desarrollador. Riesgo bajo; el cliente actual no se ve afectado.

**Ruta 2: ingresos primero.** Fase 0 → 1 → E1–E4 sobre el sistema actual → 2 → 3. Aporta valor a ASOCIM antes, pero E se construye sobre un modelo que luego cambia; hay que reescribir parte de E al entrar en la fase 3.

**Ruta 3: piloto controlado.** Fase 0 → 1 → 2, luego un segundo tenant creado a mano (sin consola) para validar el aislamiento y el PDF. La consola (fase 5) se construye después. Sirve para comprobar la demanda antes de invertir en la fase 4 completa.

Recomendación: **Ruta 3 con las fases 0–2 como base común a cualquiera de las tres rutas.** Es la que menos supuestos hace y la que obliga a validar demanda antes de la parte más cara.

## 4. Criterios transversales

- **Pruebas:** cada fase añade pruebas; la cobertura de los casos de uso nuevos es obligatoria.
- **Datos:** ninguna migración destructiva sin copia verificada; migraciones con prueba en el entorno de pruebas.
- **Seguridad:** revisión externa antes de la fase 3 (aislamiento y secretos son el riesgo principal).
- **Documentación:** cada fase cierra con su documentación de operación actualizada.

## 5. Riesgos principales

| Riesgo | Mitigación |
|---|---|
| Fuga de datos entre tenants | Pruebas de aislamiento obligatorias (C5) y revisión externa |
| Pérdida de datos al migrar ASOCIM | Copia verificada, migración ensayada, plan de vuelta atrás |
| Calibración de PDF por cliente demasiado lenta | Decidir D-002 antes; plantilla HTML si el volumen lo justifica |
| Dependencia de GHL (límites de API, cambios de versión) | Cliente de GHL aislado, versión de API fijada, reintentos |
| Dependencia de una sola persona | Documentación de operación y decisiones; código con pruebas |
