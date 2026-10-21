# Informe técnico: Contratos ASOCIM

Estado al 20/10/2026. Rama: `claude/code-hostinger-readiness-am8csx` (45 commits en la rama de trabajo).

## 1. Resumen

Sistema de convenios de pago con ciclo completo: creación desde contactos de GoHighLevel (GHL), cálculo de cuotas, PDF oficial a partir del convenio original del cliente, envío con enlace de firma cifrado, firma manuscrita en el navegador, copia firmada y avisos por correo. Un solo cliente (ASOCIM) y un solo tenant.

## 2. Arquitectura

| Capa | Tecnología | Tamaño | Notas |
|---|---|---|---|
| Backend | PHP ≥ 8.1 (probado en 8.3), PSR-4 `Asocim\Contratos\` | 25 archivos, ~3.500 líneas | Sin framework. Front controller en `public/index.php` y `src/Web/Aplicacion.php` (router por expresiones regulares). |
| Persistencia | PDO con SQLite o MySQL/MariaDB | 11 tablas | Al escribir este informe: solo SQLite, con el esquema aplicado en cada conexión. Desde la fase 1: migraciones versionadas por motor (`src/Persistencia/migraciones/`) y soporte de MySQL/MariaDB (`docs/mysql.md`). |
| PDF | Python 3 + PyMuPDF (`tools/pdf/llenar_convenio.py`, 337 líneas) | 1 script | Invocado desde PHP con `exec` y `escapeshellarg`. Edita el PDF original: redacción, inserción de texto con Inter, firma PNG, justificación de párrafos. |
| Panel | Angular 21, Angular Material, signals, control flow nuevo | ~2.900 líneas (ts/html/scss) | Build estático en `public/panel/`. Rutas perezosas, guards (`sesionActiva`, `soloAdmin`), View Transitions. |
| Integración | API REST de GHL (LeadConnector), versión `2021-07-28` | `ClienteGhl.php` | Contactos (upsert, búsqueda, actualización de correo), usuarios, campos personalizados (`contact.cedula`), conversaciones (envío de correo). |
| Firma | Página pública `/firmar` (PHP + JS, canvas) | `public/firmar.php` | Token de un solo uso, 7 días de validez. |

Dependencias de producción: PHP (curl, pdo, openssl), Python 3 con `pymupdf`, navegador moderno para el panel. Dependencias de desarrollo: `phpunit/phpunit ^11` declarado en `composer.json`, pero las pruebas se ejecutan con un ejecutor propio (`tests/run.php` + `ShimPHPUnit.php`), porque no hay Composer en el servidor.

## 3. Modelo de datos

- `contratos` (cliente, `clave_webhook` único, responsable).
- `versiones` (una por cambio, `terminos` en JSON, estados BORRADOR, ENVIADO, FIRMADO, REVOCADA). Una versión enviada es inmutable.
- `tokens_firma` (hash SHA-256 del token, expiración, uso, revocación).
- `enlaces_firma` (token cifrado con AES-256-GCM para mostrarlo de nuevo en el panel).
- `descargas_firma` (hash del token de descarga de 30 días).
- `firmas` (PNG, nombre, IP, user agent, hash del documento).
- `documentos`, `documentos_firmados` (rutas y SHA-256 de los PDF).
- `eventos` (historial, base del registro de actividad).
- `usuarios`, `sesiones` (contraseña con `password_hash`, bloqueo tras 5 fallos durante 15 min, sesiones de 12 h con token hasheado).

Roles: ADMIN, REMITENTE, VISOR, con permisos (`ver`, `editar`, `enviar`, `revocar`, `usuarios`) en `Seguridad/Roles.php`.

## 4. Superficie de la API

Públicas: `POST /api/login`, `POST /api/logout`, `GET /api/firmar/{token}`, `POST /api/firmar/{token}`, `POST /webhook.php` (cabecera `X-Webhook-Secret`, comparación con `hash_equals`), `GET /firmar` (página).

Autenticadas (con cookie de sesión): `GET /api/yo`, `GET/POST /api/contratos`, `GET /api/contratos/{uid}`, `POST .../editar|enviar|revocar|cliente`, `POST /api/contratos/calculo`, `GET .../pdf/previa|enviado|firmado`, `POST /api/ghl/contactos/buscar`, `GET /api/registro`, gestión de usuarios (`/api/usuarios/*`).

Los identificadores de contrato son 24 caracteres hexadecimales (`random_bytes(12)`) y se validan con regex en cada ruta.

## 5. Seguridad: lo que existe

- Cookie `HttpOnly; Secure; SameSite=Strict`.
- Contraseñas con `password_hash`, bloqueo por intentos fallidos.
- Tokens de firma y de descarga aleatorios, guardados solo como hash, de un solo uso.
- Enlace de firma cifrado en reposo (AES-256-GCM; claves con versión en `storage/claves`, subclave por uso con HKDF).
- Comparación de secretos con `hash_equals`.
- Validación de correo, cédula y PNG de firma (`validarPng`).
- Escapado de argumentos de shell para el script de PDF.
- Registro de eventos y de IP/user agent en la firma.

## 6. Deuda técnica y riesgos (por prioridad)

1. **Clase dios.** `ContratoServicio.php` tiene 980 líneas y 49 métodos mezclando reglas de negocio, persistencia, correo, PDF y firma. Es el punto más difícil de cambiar y de probar.
2. **Un tenant y configuración global.** Token GHL, `location_id`, secreto de webhook y `APP_CLAVE` viven en `.env`. Ver sección 7.
3. ~~**Clave derivada sin KDF.**~~ Resuelto en la fase 1 (A4): claves aleatorias con versión, HKDF por uso y `scripts/rotar-claves.php`.
4. **Webhook con secreto compartido estático.** Sin HMAC del cuerpo, sin marca de tiempo, sin protección contra repetición. Basta con filtrar la cabecera para inyectar eventos.
5. **Sin protección CSRF explícita.** Se apoya en `SameSite=Strict`. Es razonable hoy, pero no cubre todos los casos (subdominios, navegadores antiguos).
6. **Esquema sin migraciones.** `esquema.sql` se ejecuta en cada conexión. No hay versionado de cambios de esquema; cualquier `ALTER` manual se pierde o rompe.
7. **Llamadas síncronas a GHL y al script de PDF dentro de la petición.** Sin colas, sin reintentos, sin tiempo límite explícito en `exec`. Un fallo de GHL deja al usuario esperando o con error.
8. **Despliegue manual.** Se sube un zip al servidor. No hay CI, ni entorno de pruebas, ni copia de seguridad documentada, ni rollback.
9. **Sin pruebas de extremo a extremo en el repositorio.** Las pruebas de navegador (Playwright) están fuera del repositorio. Hay 54 pruebas unitarias.
10. **Panel sin cabeceras de seguridad.** No hay Content-Security-Policy. Las fuentes se cargan desde Google Fonts.
11. **Correo a través de GHL.** Depende de la cuenta de GHL para entregabilidad. No hay SPF/DKIM propios documentados.
12. **Ejecutor de pruebas propio.** Desacopla el proyecto de PHPUnit real; se pierden funciones como cobertura y mocks estándar.

## 7. Qué cambia para ser multi-tenant

Ver el análisis previo. Resumen técnico:

- Añadir `tenants` y `memberships` (usuario ↔ tenant ↔ rol). Añadir `tenant_id` a las 11 tablas y migrar los datos actuales al tenant 1.
- Repositorios que reciban `tenant_id` en el constructor y lo añadan a cada consulta. Pruebas de aislamiento que intenten leer contratos de otro tenant.
- Resolución de tenant por host o por ruta, en el front controller.
- Credenciales de GHL por tenant, cifradas en base de datos. Webhook enrutado por `locationId`, con secreto por tenant.
- Branding (logos, colores, pie, RIF, dirección) desde datos. Plantilla de correo y de PDF por tenant.
- PDF: decidir entre plantillas calibradas por cliente (manifiesto de coordenadas) o una generación desde HTML. La primera exige calibrar cada PDF; la segunda reescribe el documento actual.
- Panel con contexto de tenant (`/api/yo` devuelve tenant y tema).
- Consola de agencia: alta de tenant, conexión con GHL, invitaciones, carga de branding.

Esfuerzo: es una reescritura pesada por el modelo de datos, el PDF y la integración con GHL, no por el resto. Antes de empezar conviene resolver los puntos 1, 2, 6 y 8, o cada cambio multi-tenant se apoyará sobre la deuda.

## 8. Líneas de trabajo futuras

**A. Endurecimiento (corto plazo, sin cambiar el producto):**
- Dividir `ContratoServicio` en casos de uso: crear, enviar, firmar, revocar, eliminar borrador, notificar.
- Migraciones versionadas (archivos numerados) y un comando de migración.
- Webhook con HMAC-SHA256 sobre el cuerpo y marca de tiempo.
- HKDF para derivar claves de cifrado, con identificador de versión de clave.
- Tokens CSRF para las acciones del panel, además de `SameSite=Strict`.
- CI mínimo: `php tests/run.php`, `ng build`, y prueba de humo del PDF con datos de ejemplo.
- Copia de seguridad diaria de la base y de `storage/documentos`, con prueba de restauración.

**B. Confiabilidad:**
- Cola de trabajos para correo y PDF (tabla `trabajos` con reintentos; un cron cada minuto).
- Tiempo límite explícito para `exec` del PDF y para las llamadas HTTP a GHL.
- Idempotencia en el webhook (ya existe por `clave_webhook`; documentar el contrato).

**C. Producto (sobre el mismo núcleo):**
- Seguimiento de pagos: conciliación de cuotas pagadas (transferencia, Pago Móvil, Zelle) con el cronograma, y mora automática según la cláusula de recargo.
- Plantillas de convenio adicionales (cursos distintos, descuentos por pronto pago) sin tocar código.
- Renovación o adenda, que hoy se hace creando una versión nueva.
- Reportes de cartera: cuotas vencidas, firmas pendientes, enlaces por vencer.

**D. Plataforma (multi-tenant, sección 7):** sustenta el modelo de agencia tipo GHL. Requiere el punto A completo antes de empezar.

## 9. Recomendación

1. Antes de cualquier venta o cliente nuevo: punto A (migraciones, webhook firmado, CI, copias de seguridad).
2. Después: seguimiento de pagos (C), que aporta más valor al cliente actual que la multi-tenencia.
3. La multi-tenencia se decide cuando haya demanda real de un segundo cliente, con un contrato o un piloto que la justifique.
