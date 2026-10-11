/* =============================================================================
   Agora Digital App · Landing 3.0 — configuración pública
   Edita SOLO este archivo para conectar WhatsApp, GoHighLevel, la API y los
   clientes. Nada de aquí es secreto: lo ve cualquier navegador.
   ============================================================================= */
window.Agora = window.Agora || {};
window.Agora.config = Object.freeze({
  // WhatsApp del equipo: solo dígitos con código de país.
  whatsapp: '584220446222',
  email: 'info@agoradigital.app',

  // Aplicaciones (enlaces de "Iniciar sesión")
  apps: Object.freeze({ crm: 'https://go.agoradigital.app/', fin: 'https://mi.agoradigital.app/' }),

  // GoHighLevel · chat (Sites → Chat Widget → Get Code → data-widget-id)
  ghl: Object.freeze({
    widgetId: '6acb6b600c1163d8968defdc',
    loaderSrc: 'https://widgets.leadconnectorhq.com/loader.js',
    resourcesUrl: 'https://widgets.leadconnectorhq.com/chat-widget/loader.js'
  }),

  // Formulario: sin servidor propio, al enviar se abre WhatsApp con los datos ya escritos
  // (y si no hay WhatsApp, el correo). Deja estas rutas vacías.
  api: Object.freeze({ csrf: '', diagnostico: '', disponibilidad: '' }),

  // reCAPTCHA v3: clave PÚBLICA (la secreta va solo en api/config.php). Vacío = desactivado.
  recaptchaSiteKey: '',

  // Diagnóstico: horarios (UTC−4) y días hábiles (0 = domingo)
  slots: Object.freeze(['09:00', '10:00', '11:00', '14:00', '15:00', '16:00']),
  workdays: Object.freeze([1, 2, 3, 4, 5]),
  minFillMs: 2500,
  rateLimit: Object.freeze({ cooldownMs: 30000, maxPerHour: 5 }),

  // Precio anual = mensual × 10 (dos meses gratis)
  annualMonths: 10,

  // Cinta de clientes. logo: imagen propia en assets/logos/clientes/ (sin logo = nombre como texto).
  clients: Object.freeze([
    { name: 'ASOCIM', handle: 'asocim_', logo: 'assets/logos/clientes/asocim.webp', w: 89, h: 72, about: '' },
    { name: 'UBA', handle: 'ubalinepro', logo: 'assets/logos/clientes/uba.webp', w: 66, h: 72, about: 'Universidad Bicentenaria de Aragua.' },
    { name: 'Streamingnet', handle: '', logo: 'assets/logos/clientes/streamingnet.webp', w: 171, h: 40, about: '' },
    { name: 'Bajo la Mática', handle: 'bajolamatica', logo: 'assets/logos/clientes/bajolamatica.webp', w: 84, h: 72, about: '' },
    { name: 'C.I.A.C.O', handle: 'ciaco_araure', logo: 'assets/logos/clientes/ciaco.webp', w: 136, h: 72, about: 'Centro de Instrucción de Aviación Civil de Occidente · Grupo Sosavenca.' }
  ])
});
