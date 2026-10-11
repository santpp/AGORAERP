/* Agora Digital App · Configuración de la landing.
   Edita solo este archivo para conectar GoHighLevel, WhatsApp y la disponibilidad. */
window.AGORA_CONFIG = {
  // Número de WhatsApp del equipo, solo dígitos con código de país (ej. "584121234567").
  whatsapp: "",

  // GoHighLevel · Chat widget
  // En GHL: Sites → Chat Widget → (tu widget) → Get Code. Copia el valor de data-widget-id.
  ghlWidgetId: "",
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

  // Precio anual = mensual × 10 (dos meses gratis).
  annualMonths: 10
};
