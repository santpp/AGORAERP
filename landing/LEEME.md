# Agora Digital App · Landing

Landing estática: HTML, CSS y JavaScript. No necesita base de datos, PHP ni instalar nada.

## Archivos

```
public_html/        ← lo que se sube al servidor
├── index.html      ← página en español
├── en.html         ← página en inglés (botón EN / ES en la cabecera)
├── privacidad.html · 404.html
├── css/  js/  assets/
├── .htaccess       ← HTTPS, cabeceras de seguridad y caché
└── robots.txt · sitemap.xml
tools/              ← solo para generar en.html (no se sube)
```

## Publicar (CyberPanel)

1. Sube el zip a `/home/landing.agoradigital.app/public_html` y descomprímelo **ahí mismo**:
   `index.html` debe quedar directamente dentro de `public_html`, no en una subcarpeta.
2. Borra el `index.html` de bienvenida de CyberPanel si sigue ahí.
3. Activa SSL: `sudo cyberpanel issueSSL --domainName landing.agoradigital.app`

## Editar

- **WhatsApp, chat de GoHighLevel y clientes:** `public_html/js/config.js`.
- **Formulario:** al enviarse abre WhatsApp con los datos ya escritos.
- **Textos:** en `index.html`. Para actualizar el inglés, agrega la traducción en `tools/en.json`
  y ejecuta `python3 tools/build-en.py` (avisa si falta alguna).
- Al cambiar CSS o JS, sube el número de `?v=3.1.0` en `index.html` y vuelve a generar `en.html`
  para que los navegadores no usen la copia vieja.
