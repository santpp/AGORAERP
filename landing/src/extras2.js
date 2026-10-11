/* Costo, integraciones e infraestructura */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const io = (el, fn, threshold = 0.35) => {
    if (!el) return;
    if (!('IntersectionObserver' in window)) return fn();
    const o = new IntersectionObserver((en) => { if (en[0].isIntersecting) { o.disconnect(); fn(); } }, { threshold });
    o.observe(el);
  };

  /* Burbujas y contadores de la sección del costo */
  const chat = $('[data-costo-chat]');
  io(chat, () => chat.classList.add('in'));
  $$('[data-count]').forEach(b => io(b, () => {
    const fin = +b.dataset.count, t0 = performance.now(), dur = 1200;
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      b.textContent = Math.round(fin * e);
      if (k < 1) requestAnimationFrame(paso);
    };
    b.textContent = '0'; requestAnimationFrame(paso);
  }, 0.6));

  /* Integraciones: [nombre, descripción, categoría, siglas, color, logo] · logos de Simple Icons (CC0) */
  const LISTA = [
    ['Calendario de Google', 'Sincroniza tus citas y eventos.', 'Agenda', '31', '#1a73e8', 'googlecalendar'],
    ['Google', 'Drive, Hojas de cálculo, Gmail y Analytics.', 'Productividad', 'G', '#ea4335', 'google'],
    ['Facebook', 'Prospectos de anuncios, mensajes y reseñas.', 'Redes y mensajería', 'f', '#1877f2', 'facebook'],
    ['LinkedIn', 'Prospectos de tus anuncios de LinkedIn.', 'Publicidad y marketing', 'in', '#0a66c2', 'linkedin'],
    ['Mensajería de TikTok', 'Mensajes de TikTok en tu bandeja.', 'Redes y mensajería', 'TT', '#111111', 'tiktok'],
    ['Anuncios de TikTok', 'Prospectos de tus anuncios de TikTok.', 'Publicidad y marketing', 'TT', '#111111', 'tiktok'],
    ['WhatsApp', 'Conversa con más de 2 mil millones de personas.', 'Redes y mensajería', 'WA', '#1f9e4a', 'whatsapp'],
    ['Instagram', 'Mensajes y automatizaciones de Instagram.', 'Redes y mensajería', 'IG', '#c4306e', 'instagram'],
    ['Anuncios de Google', 'Conversiones y prospectos de Google Ads.', 'Publicidad y marketing', 'Ads', '#fbbc04', 'googleads'],
    ['Perfil de Empresa de Google', 'Reseñas y mensajes de tu ficha en Google.', 'Publicidad y marketing', 'GBP', '#34a853', 'googlebusinessprofile'],
    ['Stripe', 'Cobros con tarjeta y suscripciones.', 'Pagos y contabilidad', 'S', '#635bff', 'stripe'],
    ['PayPal', 'Pagos internacionales en línea.', 'Pagos y contabilidad', 'PP', '#003087', 'paypal'],
    ['QuickBooks', 'Facturas y contabilidad sincronizadas.', 'Pagos y contabilidad', 'QB', '#2ca01c', 'quickbooks'],
    ['Xero', 'Contabilidad en la nube.', 'Pagos y contabilidad', 'X', '#13b5ea', 'xero'],
    ['Shopify', 'Pedidos y clientes de tu tienda.', 'Comercio electrónico', 'S', '#5e8e3e', 'shopify'],
    ['WooCommerce', 'Ventas de tu tienda en WordPress.', 'Comercio electrónico', 'Woo', '#7f54b3', 'woocommerce'],
    ['WordPress', 'Formularios y chat en tu sitio web.', 'Comercio electrónico', 'W', '#21759b', 'wordpress'],
    ['Outlook', 'Calendario y correo de Microsoft 365.', 'Agenda', 'O', '#0078d4', 'outlook'],
    ['Zoom', 'Enlace de videollamada en cada cita.', 'Agenda', 'Z', '#2d8cff', 'zoom'],
    ['Google Meet', 'Reuniones automáticas al agendar.', 'Agenda', 'M', '#00897b', 'googlemeet'],
    ['Typeform', 'Respuestas que crean contactos.', 'Formularios', 'T', '#262627', 'typeform'],
    ['Jotform', 'Formularios conectados a tu embudo.', 'Formularios', 'J', '#ff6100', ''],
    ['Formularios nativos', 'Encuestas y formularios con tu marca.', 'Formularios', 'F', '#ad103c', 'agora'],
    ['Slack', 'Avisos de ventas para tu equipo.', 'Productividad', '#', '#4a154b', 'slack'],
    ['Zapier', 'Conecta miles de aplicaciones.', 'Productividad', 'Z', '#ff4f00', 'zapier'],
    ['Webhooks', 'Envía y recibe datos de cualquier sistema.', 'Productividad', '{ }', '#282e49', 'webhooks'],
    ['Correo (SMTP)', 'Envía desde tu propio dominio.', 'Redes y mensajería', '@', '#282e49', 'mail'],
    ['SMS', 'Mensajes de texto y recordatorios.', 'Redes y mensajería', 'SMS', '#5b6170', 'sms'],
    ['OpenAI', 'Modelos de lenguaje para tus agentes.', 'Inteligencia artificial', 'AI', '#10a37f', 'openai'],
    ['Athena', 'Agente de IA que responde y agenda.', 'Inteligencia artificial', 'A', '#ad103c', 'img:assets/athena-mini.webp'],
    ['Agentes de voz', 'Atiende llamadas con IA.', 'Inteligencia artificial', 'V', '#282e49', 'voice'],
  ];
  const grid = $('[data-integra-grid]');
  if (grid) {
    const filtros = $('[data-integra-filtros]'), buscar = $('[data-integra-buscar]');
    const vacio = $('[data-integra-vacio]'), mas = $('[data-integra-mas]');
    $('[data-integra-total]').textContent = LISTA.length;
    const cats = ['Todas', ...new Set(LISTA.map(x => x[2]))];
    filtros.innerHTML = cats.map((c, i) => `<label><input type="radio" name="integra-cat" value="${c}" ${i ? '' : 'checked'}><span>${c}</span></label>`).join('');
    let todas = false;
    const LIM = 12;
    const pintar = () => {
      const cat = $('input[name=integra-cat]:checked', filtros).value;
      const q = buscar.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const res = LISTA.filter(x => (cat === 'Todas' || x[2] === cat) && (!q || norm(x[0] + ' ' + x[1]).includes(q)));
      const ver = todas || q || cat !== 'Todas' ? res : res.slice(0, LIM);
      grid.innerHTML = ver.map((x, i) => `<li class="integra" style="animation-delay:${Math.min(i, 12) * 30}ms"><span class="integra-logo" style="--c:${x[4]}">${x[5].startsWith('img:') ? `<img class="integra-foto" src="${x[5].slice(4)}" alt="">` : x[5] ? `<i class="marca" style="--m:url(assets/brands/${x[5]}.svg)"></i>` : x[3]}</span><span><b>${x[0]}</b><span>${x[1]}</span></span></li>`).join('');
      vacio.hidden = res.length > 0;
      mas.hidden = ver.length >= res.length;
    };
    filtros.addEventListener('change', pintar);
    buscar.addEventListener('input', pintar);
    mas.addEventListener('click', () => { todas = true; pintar(); });
    pintar();
  }

  /* Infraestructura: pestañas */
  const URLS = { auto: 'go.agoradigital.app/automatizaciones', embudo: 'go.agoradigital.app/oportunidades', reportes: 'go.agoradigital.app/reportes' };
  const tabs = $$('[data-infra-tab]');
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => x.setAttribute('aria-selected', x === t));
    $$('[data-infra-view]').forEach(v => {
      const on = v.dataset.infraView === t.dataset.infraTab;
      v.hidden = !on; v.classList.toggle('is-on', on);
    });
    $('[data-infra-url]').textContent = URLS[t.dataset.infraTab];
  }));
})();
