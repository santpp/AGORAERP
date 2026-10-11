# Agora Digital App · Landing

Página de presentación de Agora Digital App en `landing.agoradigital.app`.
Es un sitio estático: HTML, CSS y JavaScript. No usa base de datos, PHP ni dependencias;
basta con subir la carpeta `public_html` a cualquier hosting Apache o LiteSpeed.

## Archivos

```
public_html/        ← lo que se sube al servidor
├── index.html      ← página en español (la fuente de todos los textos)
├── en.html         ← página en inglés, GENERADA desde index.html (no editar a mano)
├── privacidad.html · 404.html
├── css/  js/  assets/
├── .htaccess       ← HTTPS, cabeceras de seguridad y caché
└── robots.txt · sitemap.xml
tools/              ← solo para generar en.html (no se sube)
├── build-en.py     ← script que crea en.html
└── en.json         ← traducciones: "texto en español": "texto en inglés"
```

## Ver la página en tu computadora

```
python3 -m http.server -d public_html 8000
```

Abre http://localhost:8000 (español) y http://localhost:8000/en.html (inglés).

## Editar

- **WhatsApp, correo, chat de GoHighLevel y clientes:** `public_html/js/config.js`.
  Nada de ese archivo es secreto: cualquier navegador lo ve.
- **Formulario:** no usa servidor; al enviarse abre WhatsApp con los datos ya escritos
  (o el correo si no hay WhatsApp).
- **Textos:** solo en `index.html`. Después, genera la versión en inglés (siguiente sección).
- **CSS o JS:** sube el número de versión `?v=3.1.0` en `index.html` (aparece varias veces)
  y vuelve a generar `en.html`, para que los navegadores no usen la copia vieja.

## Generar la versión en inglés

`en.html` se crea a partir de `index.html`. El script recorre cada texto visible y los atributos
`alt`, `aria-label`, `placeholder`, `title`, `data-say` y `data-label`, y los cambia por su
traducción en `tools/en.json`. También ajusta el idioma, los metadatos, la URL canónica y el
botón EN / ES.

1. Si cambiaste o agregaste textos en `index.html`, añade cada uno a `tools/en.json`,
   copiando el texto en español exactamente igual (sin espacios al inicio ni al final):
   ```json
   "Responde y agenda por ti": "Replies and books for you"
   ```
2. Desde la carpeta `landing/`, ejecuta:
   ```
   python3 tools/build-en.py
   ```
3. Si todo está traducido, responde `en.html generado`. Si falta algo, escribe
   `Sin traducir (N):` con la lista de textos en español que no encontró en `en.json`;
   `en.html` se genera igual, pero con esos textos en español. Agrégalos y repite.
4. Revisa `en.html` en el navegador y súbelo junto con `index.html`.

Solo necesita Python 3, sin instalar nada más.

## Publicar (CyberPanel)

1. Crea el zip con el contenido de `public_html` (no la carpeta en sí). Desde `landing/`:
   ```
   cd public_html && zip -r ../landing.zip . -x '.DS_Store' && cd ..
   ```
   Así se incluye `.htaccess`, que al ser un archivo oculto suele quedar fuera si comprimes
   desde el explorador de archivos. Los `.zip` están en `.gitignore` y no se suben al repositorio.
2. En el administrador de archivos de CyberPanel, sube `landing.zip` a
   `/home/landing.agoradigital.app/public_html` y descomprímelo **ahí mismo**:
   `index.html` debe quedar directamente dentro de `public_html`, no en una subcarpeta.
3. Borra el `index.html` de bienvenida de CyberPanel si sigue ahí, y el zip una vez descomprimido.
4. Solo la primera vez, activa SSL:
   `sudo cyberpanel issueSSL --domainName landing.agoradigital.app`
5. Comprueba https://landing.agoradigital.app y https://landing.agoradigital.app/en.html
   (si ves la versión anterior, recarga sin caché con Ctrl + Shift + R).
