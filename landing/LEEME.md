# Agora Digital App · Landing 3.0

Landing de ventas (embudo AIDA) de **Agora Digital App**: CRM con WhatsApp, Athena (IA) y Finanzas.
HTML + CSS + JavaScript sin dependencias, API en PHP 8 + MySQL, lista para hosting compartido
(Hostinger), CDN y empaquetado como app Android (APK/AAB).

## 1 · Estructura del ZIP

```
agora-landing-3.0/
├── public_html/                  ← TODO lo que va al servidor (raíz del dominio)
│   ├── index.html                ← la landing en español (HTML semántico, SEO, JSON-LD)
│   ├── en.html                   ← la misma landing en inglés (se sirve en /en)
│   ├── privacidad.html           ← aviso de privacidad
│   ├── 404.html                  ← página de error con CTA
│   ├── manifest.webmanifest      ← app instalable (PWA / APK)
│   ├── sw.js                     ← service worker (funciona sin conexión)
│   ├── robots.txt · sitemap.xml
│   ├── .htaccess                 ← HTTPS, filtros anti-bots, cabeceras de seguridad, caché
│   ├── .well-known/security.txt
│   ├── css/
│   │   └── styles.css            ← todo el diseño (19 secciones, tema claro y oscuro)
│   ├── js/
│   │   ├── boot.js               ← tema sin parpadeo (se carga primero, < 1 KB)
│   │   ├── config.js             ← ÚNICO archivo que editas: WhatsApp, GHL, API, clientes
│   │   └── app.js                ← animaciones, vitrina, precios, formulario, chat
│   ├── assets/
│   │   ├── fonts/                ← Author Variable (woff2)
│   │   ├── img/                  ← capturas reales de Finanzas y Athena (1x y 2x)
│   │   ├── logos/                ← logos oficiales, clientes/ e integraciones/ (48)
│   │   └── icons/                ← favicon, apple-touch-icon e íconos de la app
│   └── api/                      ← PHP 8: csrf, diagnostico, disponibilidad (+ .htaccess)
│       └── config.example.php    ← plantilla: cópiala como agora-config.php FUERA de public_html
├── database/                     ← SQL por módulos (NO se sube a public_html)
│   ├── 00_usuario_y_permisos.sql
│   ├── 01_captacion.sql
│   └── 02_mantenimiento.sql
├── docs/
│   ├── INFORME-3.0.md            ← decisiones de diseño, conversión y seguridad
│   └── assetlinks.example.json   ← plantilla para verificar la APK (TWA)
├── tools/                        ← build-en.py + en.json: generan la versión en inglés (en.html)
├── AGENTS.md                     ← reglas para Antigravity / agentes de IA
└── LEEME.md                      ← este archivo
```

## 2 · Subir a producción (Hostinger u otro hosting con Apache/LiteSpeed)

1. **Archivos:** sube el *contenido* de `public_html/` a la raíz del dominio
   (`landing.agoradigital.app`). Activa "mostrar archivos ocultos" para que suban `.htaccess` y `.well-known/`.
2. **Base de datos:** en hPanel → Bases de datos, crea la base y el usuario. En phpMyAdmin ejecuta
   `database/01_captacion.sql`. Con acceso root, ejecuta también `00_usuario_y_permisos.sql`
   (la web solo podrá leer horarios e insertar reservas).
3. **Configuración del servidor:** copia `api/config.example.php` como
   `/home/TU_USUARIO/agora-config.php` (fuera de public_html) y completa: datos de MySQL,
   `ip_secret` (64 caracteres), `allowed_origins`, `mail_to` y, si quieres, `ghl_webhook_url`.
4. **Configuración pública:** revisa `js/config.js` (WhatsApp `584220446222`, widget de GHL, horarios,
   clientes). Si cambias horarios, cámbialos igual en `agora-config.php`.
5. **SSL:** activa el certificado (Let's Encrypt) antes de subir: `.htaccess` fuerza HTTPS.
6. **CDN/WAF (recomendado):** pon el dominio detrás de Cloudflare (o la CDN de Hostinger) y en
   `agora-config.php` usa `'trust_proxy' => 'cloudflare'`.
7. **Prueba:** abre la página, envía el formulario y confirma que la reserva llega a MySQL, al correo y a GHL.

**Al editar CSS o JS** cambia `?v=3.0.0` por `?v=3.0.1` en `index.html` y la constante `VERSION` de `sw.js`:
así todos los navegadores (y la app instalada) reciben la versión nueva al instante.

### Sin API todavía
La landing funciona igual: si `api/` no responde, el formulario abre WhatsApp con todos los datos
ya escritos (y si no hay WhatsApp configurado, el correo). Nunca se pierde un prospecto.

### Chat de Athena (GoHighLevel)
El widget se carga solo cuando alguien pulsa "Habla con Athena ahora" o el botón flotante
(no frena la carga inicial). Si GHL no responde, se abre WhatsApp. La política CSP de `.htaccess`
ya abre los dominios de LeadConnector; si en la consola ves "Refused to load…", agrega ese dominio
a la directiva indicada. Si no usas el chat, cambia a la CSP estricta comentada en `.htaccess`.

### reCAPTCHA v3 (opcional)
Clave pública en `js/config.js` (`recaptchaSiteKey`) y secreta en `agora-config.php` (`recaptcha_secret`).
Sin claves, el formulario sigue protegido por honeypot, trampa de tiempo, CSRF y límites por IP y globales.

## 3 · Empaquetar como app Android (APK / AAB)

La landing ya es una **PWA instalable** (manifest + service worker + íconos maskable). Para la Play Store
se envuelve como **TWA** (Trusted Web Activity): la app abre la web real a pantalla completa, con las
mismas animaciones, íconos y funciones, sin duplicar código.

1. Publica la web en HTTPS (paso 2).
2. Entra a **https://www.pwabuilder.com**, escribe `https://landing.agoradigital.app` y elige
   **Android → Generate package** (o usa `npx @bubblewrap/cli init --manifest https://landing.agoradigital.app/manifest.webmanifest`).
   Nombre del paquete sugerido: `app.agoradigital.landing`.
3. Descarga el paquete: trae el `.aab` (Play Store), un `.apk` de prueba y `assetlinks.json`.
4. Sube ese `assetlinks.json` a `public_html/.well-known/assetlinks.json` (plantilla en `docs/`).
   Sin este archivo la app muestra la barra del navegador.
5. Instala el `.apk` en un teléfono para probar; sube el `.aab` a Google Play Console.

La interfaz ya respeta las zonas seguras (`viewport-fit=cover`, `env(safe-area-inset-*)`) y el modo
`standalone`, así que no hay que ajustar nada para la app.

## 4 · Probar en local

- **Como en producción:** desde `public_html/` ejecuta `php -S localhost:8000` y abre
  `http://localhost:8000`. (La cookie de sesión `__Host-` exige HTTPS: el envío real a la API
  se prueba en el servidor; en local el formulario usa el respaldo por WhatsApp.)

Lista de revisión: escritorio, tablet y móvil; tema oscuro; pestañas de la vitrina; Antes/Después;
precios mensual/anual; "Elegir plan" → formulario precargado; formulario completo; consola sin errores.

## 5 · Versión en inglés

- `public_html/en.html` es la landing en inglés; `.htaccess` la sirve en `https://landing.agoradigital.app/en`.
  El botón **EN / ES** de la cabecera cambia de idioma.
- No se edita a mano: se genera desde `index.html` con `python3 tools/build-en.py`, usando las traducciones de
  `tools/en.json`. Si cambias un texto en español, agrega su traducción a `en.json` y vuelve a ejecutar el script
  (avisa de los textos que falten).
- Los textos que pone JavaScript (Athena, errores del formulario, precios anuales) se traducen en `js/app.js`
  con `L('español', 'english')` según el `lang` de la página.
