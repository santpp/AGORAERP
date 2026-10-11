/* Agora Digital App · Landing. Sin dependencias. */
(() => {
  const C = window.AGORA_CONFIG || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const track = (event, data = {}) => { (window.dataLayer = window.dataLayer || []).push({ event, ...data }); };
  const waLink = (text) => C.whatsapp ? `https://wa.me/${C.whatsapp}?text=${encodeURIComponent(text)}` : null;

  /* Tema */
  $('[data-theme-toggle]').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('agora-theme', next); } catch (e) {}
  });

  /* Nav: fondo al hacer scroll, menús y menú móvil */
  const nav = $('[data-nav]');
  const onScroll = () => nav.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  $$('.dd').forEach(dd => {
    const btn = $('.dd-btn', dd);
    const set = (o) => { dd.classList.toggle('open', o); btn.setAttribute('aria-expanded', o); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); const o = !dd.classList.contains('open'); $$('.dd.open').forEach(d => d.classList.remove('open')); set(o); });
    if (matchMedia('(hover: hover)').matches) { dd.addEventListener('mouseenter', () => set(true)); dd.addEventListener('mouseleave', () => set(false)); }
  });
  document.addEventListener('click', () => $$('.dd.open').forEach(d => d.classList.remove('open')));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('.dd.open').forEach(d => d.classList.remove('open')); });

  const mBtn = $('[data-menu]'), mMenu = $('[data-mobile-menu]');
  mBtn.addEventListener('click', () => { mMenu.hidden = !mMenu.hidden; mBtn.setAttribute('aria-expanded', !mMenu.hidden); });
  $$('a', mMenu).forEach(a => a.addEventListener('click', () => { mMenu.hidden = true; }));

  /* Sección activa en la nav */
  const spy = $$('[data-spy]');
  const spyObs = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) spy.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  spy.forEach(a => { const t = $(a.getAttribute('href')); if (t) spyObs.observe(t); });

  /* Aparición al hacer scroll */
  const rev = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); rev.unobserve(e.target); } }), { threshold: .12 });
  $$('.reveal').forEach(el => rev.observe(el));

  /* WhatsApp en la barra social */
  $$('[data-whatsapp]').forEach(a => { const l = waLink('Hola, quiero saber más de Agora Digital App.'); if (l) a.href = l; else a.remove(); });

  /* Athena: conversación escrita al entrar en pantalla */
  const chat = $('[data-athena-chat]');
  const lines = ['Hola, soy Athena.', 'Cuando alguien pregunta, está prestando atención.', 'No tienes que vivir pegado al teléfono.', '¿Te muestro, sin costo, cómo podría funcionar en tu negocio?'];
  const play = async () => {
    for (const l of lines) {
      const t = document.createElement('p'); t.className = 'typing'; t.innerHTML = '<i></i><i></i><i></i>'; chat.append(t);
      await new Promise(r => setTimeout(r, 900));
      t.className = ''; t.textContent = l;
      await new Promise(r => setTimeout(r, 500));
    }
  };
  const aObs = new IntersectionObserver(es => { if (es[0].isIntersecting) { aObs.disconnect(); play(); } }, { threshold: .4 });
  aObs.observe(chat);

  /* Precios: mensual / anual */
  $$('[data-billing]').forEach(b => b.addEventListener('click', () => {
    const yearly = b.dataset.billing === 'y';
    $$('[data-billing]').forEach(x => x.setAttribute('aria-pressed', x === b));
    $$('.plan').forEach(p => {
      const m = +p.dataset.price;
      $('[data-amount]', p).textContent = yearly ? m * (C.annualMonths || 10) : m;
      $('.price span', p).textContent = yearly ? '/año' : '/mes';
    });
  }));

  /* ---------- Formulario de diagnóstico ---------- */
  const form = $('[data-booking]');
  const slotsBox = $('[data-slots]'), note = $('[data-slot-note]'), date = form.fecha;
  const SLOTS = C.slots || ['9:00', '10:00', '11:00', '14:00', '15:00', '16:00'];
  const WORK = C.workdays || [1, 2, 3, 4, 5];
  let busy = {};

  // Fecha mínima: el próximo día hábil, en hora de Caracas
  const iso = (d) => d.toISOString().slice(0, 10);
  const nextWorkday = () => { const d = new Date(Date.now() - 4 * 3600e3); do d.setUTCDate(d.getUTCDate() + 1); while (!WORK.includes(d.getUTCDay())); return d; };
  date.min = iso(nextWorkday()); date.value = date.min;

  const renderSlots = () => {
    const day = new Date(date.value + 'T12:00:00Z').getUTCDay();
    slotsBox.innerHTML = '';
    if (!date.value || !WORK.includes(day)) { note.textContent = 'Ese día no atendemos. Elige de lunes a viernes.'; return; }
    const taken = busy[date.value] || [];
    SLOTS.forEach(s => {
      const off = taken.includes(s);
      slotsBox.insertAdjacentHTML('beforeend', `<label><input type="radio" name="hora" value="${s}" ${off ? 'disabled' : ''}><span>${s}</span></label>`);
    });
    const free = SLOTS.length - taken.length;
    // Solo mostramos escasez cuando viene de datos reales
    note.textContent = C.busySlotsUrl && taken.length ? `Quedan ${free} horarios para ese día` : '';
  };
  date.addEventListener('change', renderSlots);
  renderSlots();
  if (C.busySlotsUrl) fetch(C.busySlotsUrl).then(r => r.json()).then(j => { busy = j || {}; renderSlots(); }).catch(() => {});

  // Plan sugerido según el tamaño del equipo
  const suggest = $('[data-suggest]');
  const planFor = { '1 a 3': 'Bronce', '4 a 10': 'Plata', '11 a 20': 'Oro', 'Más de 20': 'Diamante' };
  form.equipo.addEventListener('change', () => {
    if (form.plan.value) return;
    suggest.hidden = false;
    suggest.textContent = `Para tu equipo te sugerimos el Plan ${planFor[form.equipo.value]}. Lo confirmamos en el diagnóstico.`;
  });

  // Elegir un plan precarga el formulario
  $$('[data-choose]').forEach(b => b.addEventListener('click', () => {
    form.plan.value = b.dataset.choose; suggest.hidden = false;
    suggest.textContent = `Elegiste el Plan ${b.dataset.choose}. En el diagnóstico confirmamos que sea el adecuado.`;
    track('plan_click', { plan: b.dataset.choose });
  }));

  // Validación en vivo + barra de progreso
  const req = $$('[data-req]', form);
  const validField = (el) => el.value.trim() !== '' && el.checkValidity();
  const update = () => {
    let done = req.filter(validField).length + (form.hora && $('input[name=hora]:checked', form) ? 1 : 0);
    const total = req.length + 1, pct = Math.round(done / total * 100);
    $('[data-progress-bar]').style.width = pct + '%';
    $('[data-progress-pct]').textContent = pct + ' %';
    $('[data-progress-label]').textContent = pct === 100 ? '¡Listo! Solo pulsa el botón' : pct ? 'Vas muy bien' : 'Empecemos';
  };
  req.forEach(el => {
    const f = el.closest('.field');
    const check = () => { f.classList.toggle('valid', validField(el)); f.classList.remove('invalid'); update(); };
    el.addEventListener('input', check); el.addEventListener('change', check);
    el.addEventListener('blur', () => { if (el.value && !validField(el)) f.classList.add('invalid'); });
  });
  form.addEventListener('change', update);
  let started = false;
  form.addEventListener('focusin', () => { if (!started) { started = true; track('form_start'); } });
  update();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('[data-form-msg]'); msg.className = 'form-msg';
    if (form.website.value) return; // bot
    const bad = req.filter(el => !validField(el));
    bad.forEach(el => el.closest('.field').classList.add('invalid'));
    const hora = $('input[name=hora]:checked', form);
    if (bad.length || !hora) { msg.classList.add('err'); msg.textContent = bad.length ? 'Revisa los campos marcados.' : 'Elige una hora.'; (bad[0] || slotsBox).scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }

    const data = Object.fromEntries(new FormData(form)); delete data.website;
    data.zona = 'America/Caracas'; data.origen = 'landing'; data.pagina = location.href;
    const btn = $('button[type=submit]', form); btn.disabled = true;

    const text = `Hola, quiero mi diagnóstico gratis.\nNombre: ${data.nombre}\nEmpresa: ${data.empresa || '-'}\nWhatsApp: ${data.whatsapp}\nEquipo: ${data.equipo}\nFecha: ${data.fecha} ${data.hora} (Caracas)\nObjetivo: ${data.objetivo}${data.plan ? '\nPlan: ' + data.plan : ''}${data.nota ? '\nNota: ' + data.nota : ''}`;
    try {
      if (C.ghlWebhookUrl) {
        const r = await fetch(C.ghlWebhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (!r.ok) throw new Error(r.status);
        msg.classList.add('ok'); msg.textContent = '¡Listo! Te confirmamos por WhatsApp en breve.';
        form.reset(); date.value = date.min; renderSlots(); req.forEach(el => el.closest('.field').classList.remove('valid')); update();
      } else {
        const l = waLink(text) || `mailto:info@agoradigital.app?subject=${encodeURIComponent('Quiero mi diagnóstico gratis')}&body=${encodeURIComponent(text)}`;
        location.href = l;
        msg.classList.add('ok'); msg.textContent = 'Abrimos tu WhatsApp/correo con los datos listos. Solo envía el mensaje.';
      }
      track('form_submit', { plan: data.plan || planFor[data.equipo], equipo: data.equipo });
    } catch (err) {
      msg.classList.add('err'); msg.textContent = 'No pudimos enviar tu solicitud. Escríbenos a info@agoradigital.app.';
    } finally { btn.disabled = false; }
  });

  /* ---------- Chat de GoHighLevel ---------- */
  let ghlLoading = null;
  const loadGHL = () => {
    if (!C.ghlWidgetId) return Promise.resolve(false);
    if (ghlLoading) return ghlLoading;
    ghlLoading = new Promise(res => {
      const s = document.createElement('script');
      s.src = C.ghlLoaderSrc; s.async = true;
      s.dataset.resourcesUrl = C.ghlResourcesUrl; s.dataset.widgetId = C.ghlWidgetId;
      s.onload = () => res(true); s.onerror = () => res(false);
      document.body.append(s);
    });
    return ghlLoading;
  };
  const waitFor = (fn, ms = 6000) => new Promise(res => { const t0 = Date.now(); (function p() { const v = fn(); if (v || Date.now() - t0 > ms) return res(v); setTimeout(p, 150); })(); });
  const openChat = async () => {
    track('chat_open');
    if (await loadGHL()) {
      const api = await waitFor(() => window.leadConnector && window.leadConnector.chatWidget);
      if (api && api.openWidget) { api.openWidget(); document.body.classList.add('chat-ready'); return; }
      // Respaldo: pulsar el botón del widget dentro de su shadow DOM
      const host = await waitFor(() => document.querySelector('chat-widget'));
      const b = host && host.shadowRoot && host.shadowRoot.querySelector('button');
      if (b) { b.click(); document.body.classList.add('chat-ready'); return; }
    }
    const l = waLink('Hola Athena, tengo una pregunta.');
    if (l) open(l, '_blank', 'noopener'); else location.hash = '#diagnostico';
  };
  $$('[data-open-chat]').forEach(b => b.addEventListener('click', openChat));
  // Carga diferida: no frena la primera pintura
  if (C.ghlWidgetId) {
    const idle = () => loadGHL().then(ok => ok && waitFor(() => document.querySelector('chat-widget')).then(h => h && document.body.classList.add('chat-ready')));
    ['scroll', 'pointerdown', 'keydown'].forEach(ev => addEventListener(ev, idle, { once: true, passive: true }));
    setTimeout(idle, 8000);
  }

  /* ---------- Clientes ---------- */
  const clients = (C.clients || []).filter(c => c.name);
  const cSec = $('[data-clients]');
  if (clients.length) {
    cSec.hidden = false;
    const trackEl = $('[data-mtrack]', cSec), tip = $('[data-tip]', cSec);
    const esc = (t) => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const item = (c, i, dup) => {
      const b = document.createElement('button');
      b.className = 'client'; b.type = 'button'; b.dataset.i = i;
      if (dup) { b.setAttribute('aria-hidden', 'true'); b.tabIndex = -1; } else b.setAttribute('aria-label', c.name);
      const word = `<span class="word">${esc(c.name)}</span>`;
      if (c.logo) {
        const img = new Image(); img.alt = ''; img.loading = 'lazy'; img.src = c.logo;
        img.onerror = () => { b.innerHTML = word; };
        b.append(img);
      } else b.innerHTML = word;
      return b;
    };
    // Repetimos la lista hasta llenar el ancho y la duplicamos para un bucle sin saltos
    const base = []; while (base.length < 8) base.push(...clients.map((c, i) => [c, i]));
    [false, true].forEach(dup => base.forEach(([c, i], k) => trackEl.append(item(c, i, dup || k >= clients.length))));
    trackEl.style.setProperty('--dur', base.length * 5 + 's');

    const showTip = (b) => {
      const c = clients[b.dataset.i];
      $$('.client.on', trackEl).forEach(x => x.classList.remove('on')); b.classList.add('on');
      tip.innerHTML = `<b>${esc(c.name)}</b><span class="h">@${esc(c.handle)}</span>` +
        (c.about ? `<p>${esc(c.about)}</p>` : '') + (c.result ? `<p class="res">${esc(c.result)}</p>` : '');
      tip.hidden = false;
      const r = b.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      const left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2));
      tip.style.left = left + 'px'; tip.style.top = (r.top - h - 12) + 'px';
      tip.style.setProperty('--ax', (r.left + r.width / 2 - left) + 'px');
      track('client_hover', { client: c.handle });
    };
    const hideTip = () => { tip.hidden = true; $$('.client.on', trackEl).forEach(x => x.classList.remove('on')); };
    trackEl.addEventListener('pointerover', e => { const b = e.target.closest('.client'); if (b) showTip(b); });
    trackEl.addEventListener('focusin', e => { const b = e.target.closest('.client'); if (b) showTip(b); });
    trackEl.addEventListener('click', e => { const b = e.target.closest('.client'); if (b) showTip(b); }); // táctil
    $('[data-marquee]', cSec).addEventListener('pointerleave', hideTip);
    trackEl.addEventListener('focusout', hideTip);
    addEventListener('scroll', hideTip, { passive: true });
  }

  $$('[data-track]').forEach(a => a.addEventListener('click', () => track(a.dataset.track)));
})();
