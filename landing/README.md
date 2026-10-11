# Agora Digital App · Landing

Sitio estático sin dependencias. Se edita en `src/` y se arma con `sh build.sh`, que genera `index.html`, `styles.css` y `app.js` (con `?v=` para evitar caché). Para el servidor solo hacen falta esos tres, `config.js` y `assets/`.
Lenguaje visual inspirado en shadcn/ui (tokens, tarjetas, botones) y Aceternity UI (spotlight, grid, mockup con pestañas, bento).

## Configurar (`config.js`)
| Clave | Qué es |
|---|---|
| `whatsapp` | Número del equipo, solo dígitos (`584121234567`). Activa el botón de WhatsApp y el respaldo del formulario. |
| `ghlWidgetId` | ID del Chat Widget de GoHighLevel. |
| `ghlWebhookUrl` | URL de un *Inbound Webhook* de un Workflow de GHL que recibe el formulario. |
| `busySlotsUrl` | (Opcional) JSON con horarios ocupados `{"2026-10-12":["10:00"]}`. Sin él no se muestra escasez. |

### Chat de GoHighLevel
1. GHL → **Sites → Chat Widget** → crea o edita el widget (nombre "Athena", color `#AD103C`, avatar `assets/athena-mini.webp`).
2. **Get Code** → copia el valor de `data-widget-id="..."` en `ghlWidgetId`.
3. En el widget, agrega `agoradigital.app` a los dominios permitidos si tu cuenta lo pide.

La landing carga el widget en diferido (primer scroll/toque u 8 s), y los botones "¿Te ayudo?" y "Habla con Athena" lo abren con `window.leadConnector.chatWidget.openWidget()`. Si el widget no está configurado, abren WhatsApp.

### Formulario → GHL
Workflow con trigger **Inbound Webhook** → pega la URL en `ghlWebhookUrl` → mapea `nombre`, `whatsapp`, `correo`, `empresa`, `equipo`, `fecha`, `hora`, `objetivo`, `plan`, `nota` a un contacto y crea la cita / envía la confirmación por WhatsApp.

## Publicar en el VPS (Nginx)
```bash
rsync -av --delete landing/ usuario@TU_VPS:/var/www/agoradigital.app/
```
```nginx
server {
  server_name agoradigital.app www.agoradigital.app;
  root /var/www/agoradigital.app;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
  location ~* \.(woff2|webp|svg|css|js)$ { expires 30d; add_header Cache-Control "public"; }
  gzip on; gzip_types text/css application/javascript image/svg+xml;
}
```
Luego `sudo certbot --nginx -d agoradigital.app -d www.agoradigital.app`. Si cambias `styles.css`/`app.js`, sube el número en `?v=` o limpia caché.

## Pendiente antes de producción
- Sección de prueba social (`<section class="proof" hidden>`): actívala solo con logos, testimonios y cifras reales.
- Confirmar textos de planes, el descuento anual y el FAQ con la política real.
