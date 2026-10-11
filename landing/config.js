/* Agora Digital App · Configuración de la landing.
   Edita solo este archivo para conectar GoHighLevel, WhatsApp y la disponibilidad. */
window.AGORA_CONFIG = {
  // Número de WhatsApp del equipo, solo dígitos con código de país (ej. "584121234567").
  whatsapp: "",

  // GoHighLevel · Chat widget
  // En GHL: Sites → Chat Widget → (tu widget) → Get Code. Copia el valor de data-widget-id.
  ghlWidgetId: "6acb6b600c1163d8968defdc",
  ghlLoaderSrc: "https://widgets.leadconnectorhq.com/loader.js",
  ghlResourcesUrl: "https://widgets.leadconnectorhq.com/chat-widget/loader.js",

  // GoHighLevel · Webhook de entrada para el formulario de diagnóstico.
  // En GHL: Automation → Workflow → Trigger "Inbound Webhook" → copia la URL.
  // Vacío = el formulario abre WhatsApp (o correo) con los datos ya escritos.
  ghlWebhookUrl: "",

  // Horarios del diagnóstico (Caracas, UTC−4) y días hábiles (0 = domingo).
  slots: ["9:00", "10:00", "11:00", "14:00", "15:00", "16:00"],
  workdays: [1, 2, 3, 4, 5],

  // Opcional: URL que devuelve los horarios ocupados, ej. {"2026-10-12": ["10:00","15:00"]}.
  // Sin esto, todos los horarios se muestran libres (nunca inventamos escasez).
  busySlotsUrl: "",

  // Clientes (cinta animada). logo: archivo PNG/SVG con fondo transparente en assets/clientes/.
  // Si el logo no existe, se muestra el nombre como texto. Completa "about" y "result" con datos reales.
  clients: [
    { handle: "asocim_",      name: "ASOCIM",         logo: "assets/clientes/asocim_.png",      about: "", result: "" },
    { handle: "ubalinepro",   name: "UBA",            logo: "assets/clientes/ubalinepro.png",   about: "", result: "" },
    { handle: "bajolamatica", name: "Bajo la Mática", logo: "assets/clientes/bajolamatica.png", about: "", result: "" },
    { handle: "ciaco_araure", name: "C.I.A.C.O",      logo: "assets/clientes/ciaco_araure.png", about: "Centro de Instrucción de Aviación Civil de Occidente · Grupo Sosavenca.", result: "" }
  ],

  // Precio anual = mensual × 10 (dos meses gratis).
  annualMonths: 10
};
