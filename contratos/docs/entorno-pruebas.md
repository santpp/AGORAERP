# Entorno de pruebas

Objetivo: probar cada cambio en un sitio idéntico al de producción, con datos ficticios, antes de subirlo a producción.

## 1. Crear el sitio (CyberPanel)
1. **Websites → Create Website** (o dominio hijo) con `pruebas.contratos.agoradigital.app`.
2. **SSL → Manage SSL**: emitir el certificado.
3. En el DNS: registro A de `pruebas.contratos` a la IP del VPS.
4. Estructura igual a producción, en otra carpeta:
   - código: `/home/<usuario>/contratos-pruebas/` (`src/`, `tools/`, `plantillas/`, `scripts/`, `storage/`)
   - público: el `public_html` del sitio de pruebas con `index.php`, `firmar.php`, `webhook.php`, `.htaccess`, logos y `panel/`.
5. Copiar `plantillas/convenio_original.pdf` y las fuentes (el PDF no está en Git).

## 2. Configuración (`.env` propio)
```
CONTRATOS_BD=sqlite:/home/<usuario>/contratos-pruebas/storage/contratos.sqlite
APP_URL=https://pruebas.contratos.agoradigital.app
GHL_WEBHOOK_SECRET=<distinto del de producción>
GHL_TOKEN=<token de la subcuenta de pruebas>
GHL_LOCATION_ID=<location de la subcuenta de pruebas>
PDF_PYTHON=/opt/agora-pdf/bin/python
```
- **GHL:** lo ideal es una subcuenta de pruebas. Si no hay, usar la misma subcuenta solo con contactos de
  prueba (correo propio del equipo) y sin workflows de WhatsApp activos para esos contactos.
- Nunca copiar la base de producción a pruebas: tiene datos personales. Si hace falta, anonimizarla antes.

## 3. Acceso restringido
El sitio de pruebas no debe ser público:
- `.htaccess` con usuario y clave (autenticación básica) o restricción por IP, y
- `<meta name="robots" content="noindex">` (el panel ya lo tiene).

## 4. Usuario administrador
```
php tools/crear_admin.php correo@ejemplo.com "Nombre Apellido"
```
desde la carpeta del código de pruebas. Pide la clave (mínimo 10 caracteres) sin mostrarla en pantalla.

## 5. Flujo de cada cambio
1. Subir el cambio a pruebas.
2. En pruebas: `php tests/run.php` y `python3 tools/pdf/regresion.py` (todo en verde).
3. Probar a mano el flujo afectado: crear borrador, vista previa, enviar, firmar (desde el móvil), descargar.
4. Solo entonces subir a producción, con un respaldo hecho justo antes (`php scripts/respaldo.php`).

**Criterio de salida de la fase 0:** el sitio de pruebas funciona con su propio `.env` y su base, con un convenio
de prueba enviado y firmado de punta a punta.
