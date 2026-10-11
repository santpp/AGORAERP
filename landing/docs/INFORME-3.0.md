# Informe · Landing 3.0 (fusión v4 + versión publicada)

## 1 · Embudo (AIDA) y por qué vende

| Etapa | Sección | Qué hace por la venta |
|---|---|---|
| Atención | Hero | Gancho "Quizá no perdiste la venta. Perdiste el momento." + propuesta unificada (CRM, Athena, Finanzas) + CTA dorado único + microgarantías (sin costo, 6 horarios/día, confirmación por WhatsApp). |
| Atención | Vitrina del producto | 5 vistas reales en HTML (Bandeja, Tablero, Automatización, Embudo, Reportes) que rotan solas con barra de progreso: el visitante ve el producto antes de leer. |
| Interés | Prueba social | Cinta de clientes (ASOCIM, UBA, Streamingnet, Bajo la Mática, C.I.A.C.O) con ficha al pasar o tocar. |
| Interés | El costo de no responder | Historia en burbujas (martes → jueves → ya habían comprado) + 3 datos de autoridad (HBR) con contadores. |
| Deseo | Módulos (bento) | 6 módulos con interruptor **Sin Agora / Con Agora**: la primera vez se demuestra solo (antes → después). Sello "Firmado ✓", mini chat de las 11:40 p. m. |
| Deseo | Finanzas | Capturas reales (Resumen y Cobranza) + 3 beneficios concretos. |
| Deseo | Integraciones | 48 integraciones + conexión oficial de Meta en doble cinta. |
| Deseo | Athena | Conversación que se escribe sola + Athena animada (gestos, mirada, tarjetas) + "Habla con Athena ahora" (chat GHL o WhatsApp). |
| Acción | Precios | Banda oscura, mensual/anual (−2 meses, ahorro en USD), Oro recomendado y centrado en móvil. "Elegir plan" precarga el formulario. Objeciones resueltas aquí (sin contratos largos, USD/bolívares/Binance, acompañamiento). |
| Acción | Confianza | API oficial de WhatsApp, datos cifrados, nube, acompañamiento. |
| Acción | Diagnóstico gratis | Formulario con progreso dotado (arranca en 20 %), validación inmediata con ✓, escasez real (horarios ocupados del servidor), plan sugerido por tamaño de equipo y confeti al reservar. |
| Acción | Cierre | Repite la promesa y ofrece dos caminos: diagnóstico o WhatsApp. |

La sección de Preguntas Frecuentes se eliminó: cada objeción se responde en el punto exacto donde aparece.

## 2 · Qué se tomó de cada versión

- **Versión publicada:** paleta de superficies (#F6F4F1, bordes #E6E2DC, radio 18 px), cuadrícula y foco de luz del hero,
  bento con luz que sigue al cursor, banda oscura de precios con facturación anual, cinta de clientes con ficha,
  pestañas que rotan solas, chat de GoHighLevel con respaldo por WhatsApp, eventos de `dataLayer`, textos de Athena,
  inicio de sesión CRM y Finanzas como enlaces. **Sus imágenes no se usaron.**
- **v4:** capturas propias (mockups del CRM en HTML, Finanzas, Athena 2x), botones con labio que se hunden, resortes,
  revelado elástico, historia en burbujas, contadores, indicadores elásticos, Athena articulada, validación con ✓,
  sacudida en errores, confeti, seguridad cliente/servidor, API PHP y SQL.

## 3 · Calidad medida (Chromium, Playwright)

- LCP: 0,28 s escritorio · 1,9 s móvil con CPU ×4 y 1,6 Mbps. CLS: 0,003 recorriendo toda la página.
- Sin errores de consola ni violaciones de CSP (probado con la CSP estricta, sin `unsafe-inline`).
- 1440, 1280, 820, 390 y 360 px sin desborde horizontal; tema oscuro y movimiento reducido revisados.
- Imágenes a 2x–4x de su tamaño en pantalla; vistas del CRM vectoriales (nítidas en cualquier densidad).

## 4 · Seguridad

Guardia de la API ordenada de lo barato a lo caro: método → origen → tipo y tamaño → límite por IP y global
(sin base de datos) → sesión y CSRF de doble envío con trampa de tiempo → honeypot → reCAPTCHA v3 → validación
por lista blanca → MySQL con consultas preparadas y usuario de mínimo privilegio. Índice único contra dobles
reservas. IP solo como HMAC. Reenvío a GHL solo a dominios de GoHighLevel (sin SSRF) y después de responder.
En el borde: `.htaccess` filtra métodos, escáneres y archivos sensibles, y aplica HSTS, CSP, X-Frame-Options,
nosniff, Referrer-Policy y Permissions-Policy. Frente a ataques volumétricos (miles de bots) la primera línea
debe ser Cloudflare/WAF: ningún código en hosting compartido lo absorbe solo.

## 5 · Pendientes del lado del negocio

- Claves de reCAPTCHA v3 (pública en `js/config.js`, secreta en `agora-config.php`).
- Credenciales de MySQL y URL del webhook de entrada de GHL en `agora-config.php`.
- `assetlinks.json` real al generar la APK.
- Logos en archivo de Bajo la Mática y C.I.A.C.O (hoy se muestran como nombre) y frases de resultado de cada cliente.
