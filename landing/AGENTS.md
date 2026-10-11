# Reglas para agentes (Antigravity, Gemini, Claude…) · Landing 3.0

## No negociable
1. **Marca intacta:** vino `#AD103C`, azul profundo `#282E49`, oro `#FABD4B` (solo resaltes), blanco `#EFEFEF`;
   tipografía Author Variable; logos oficiales de `assets/logos/` sin alterar. Lema: "Cada conversación, una oportunidad."
2. **Objetivo de la página: cerrar ventas.** Embudo AIDA: Hero (atención) → Problema (interés) → Módulos con
   Antes/Después, Finanzas, Integraciones y Athena (deseo) → Precios, Confianza, Diagnóstico y Cierre (acción).
   No agregues secciones que distraigan (no hay FAQ: las objeciones se responden dentro de cada sección).
3. **Imágenes:** solo las capturas propias de `assets/img/` (Finanzas y Athena). Las vistas del CRM son HTML
   escalado (nítido a cualquier densidad). Toda imagen nueva: WebP a 2x de su tamaño en pantalla, con `width`/`height`.
4. **CSP:** prohibido `<script>` en línea, `style="…"` y `onclick=`. Estilos en `css/styles.css`; comportamiento en
   `js/app.js`. Desde JS se permite `el.style.setProperty()`. Nunca `innerHTML` con datos: usa `textContent`.
5. **Sin dependencias** en tiempo de ejecución. Terceros permitidos: chat de GoHighLevel (bajo demanda) y reCAPTCHA.
6. **Español neutro, tuteo.** Sin anglicismos sueltos. Sin referencias a un país ni a monedas locales. Versión en inglés: `en.html`, generada con `tools/build-en.py`.
7. **Proporciones:** tamaños con `clamp()`, `rem`, grid/flex. Nada de alturas que cambien al animar (CLS 0):
   la vitrina tiene alto fijo calculado en JS, el chat de Athena reserva su espacio.
8. **Movimiento:** animar solo `transform`, `opacity`, `scale`, `rotate`, `translate`. Respetar `prefers-reduced-motion`.
   El texto del hero nunca arranca invisible.
9. **API:** consultas preparadas siempre; validar por lista blanca en cliente **y** servidor; nuevos endpoints con
   `guard_post()` y agregados a `.htaccess` y `api/.htaccess`.

## Mapa
- `index.html` — página. `privacidad.html`, `404.html` — secundarias.
- `css/styles.css` — 1 tokens · 2 base · 3 componentes · 4 cabecera · 5 hero y vitrina · 6 prueba social · 7 problema ·
  8 módulos · 9 integraciones · 10 Athena · 11 precios · 12 confianza · 13 diagnóstico · 14 cierre y pie · 15 flotantes ·
  16 capturas · 17 movimiento · 18 responsive · 19 tema oscuro · 20 páginas secundarias.
- `js/config.js` — datos editables. `js/app.js` — 12 módulos numerados. `js/boot.js` — tema sin parpadeo.
- `api/` — PHP 8 (`_bootstrap.php` = núcleo). `database/` — SQL por módulos.

## Antes de entregar
Revisar escritorio (1440), tablet (820) y móvil (390 y 360), tema oscuro, movimiento reducido, formulario
(con y sin API) y consola sin errores ni avisos de CSP. Subir `?v=` en `index.html` y `VERSION` en `sw.js`.
