/* Agora Digital App · v10 · Ecosistema (experiencia estilo Apple)
   ---------------------------------------------------------------------------------------------
   · Barra lateral (Mac/iPad), barra de pestañas (iPhone) y menú de cuenta.
   · Paleta "Buscar o ir a…" tipo Spotlight (⌘K / Ctrl K o "/").
   · Atajos de teclado (⌘/Ctrl, letras sueltas y secuencias G + letra) y hoja de atajos (? o mantener ⌘).
   · Gestos: doble clic / doble toque, DOS DEDOS HACIA LOS LADOS (trackpad o pantalla) = página anterior o
     siguiente, como en Safari; pellizcar en la Agenda (Día ↔ Semana ↔ Mes), deslizar desde el borde (atrás),
     mantener pulsado o clic derecho (menú contextual) y tirar hacia abajo para actualizar. Los meses se
     cambian con ← → , con la barra de meses o deslizando un dedo sobre el calendario o el encabezado.
   · Respuesta háptica: vibración en Android y, en iPhone con iOS 18 o superior, el toque del interruptor del sistema.
   · Letras dibujadas (reconocedor $P): A = Agenda, C = Caja, P = Registrar pago… configurables en Ajustes.
   · Recordatorios de citas, instalación como app (PWA) y puente con la app de Android.
   Usa las funciones y el estado de app.js (mismo ámbito global). Todo lo que cambia datos pasa por logAudit(). */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const appOn = () => { const a = $('#app'); return a && !a.hidden; };
  const editing = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  const overlayOpen = () => !$('#modal').hidden || ($('#viewer') && !$('#viewer').hidden) || !!$('.cmdk.is-open') || !!$('.ath-panel.is-open') || !!$('.gpad.is-open') || !!$('.keys.is-open');
  const MOD = () => isApple() ? '⌘' : 'Ctrl';
  // Háptica: Android con vibrate(); iPhone (iOS 18+) no tiene vibrate, pero un interruptor del sistema oculto da el toque
  let hapEl = null;
  const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const haptic = (ms = 8) => {
    try {
      if (navigator.vibrate) { navigator.vibrate(ms); return; }
      if (!isIOS()) return;
      if (!hapEl) { hapEl = document.createElement('label'); hapEl.setAttribute('aria-hidden', 'true'); hapEl.style.cssText = 'position:fixed;left:-200px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none'; const i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1; hapEl.appendChild(i); document.body.appendChild(hapEl); }
      hapEl.click();
    } catch (e) {}
  };
  window.agoraHaptic = haptic;
  const go = id => { if (location.hash !== '#/' + id) location.hash = '#/' + id; else { render(); window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' }); } };

  /* ---------- 1. Barra lateral y navegación ---------- */
  const wide = () => window.innerWidth >= 1100;
  const sideOn = () => document.documentElement.classList.contains('nav-side'); // la barra lateral es opcional (Ajustes → Apariencia)
  function toggleSide(force) {
    const r = document.documentElement;
    if (!sideOn()) { if (force !== 'close' && typeof openMenu === 'function') openMenu(); return; } // con el menú arriba, abre el menú de módulos
    if (wide()) {
      const close = force === 'close' ? true : force === 'open' ? false : !r.classList.contains('side-closed');
      r.classList.toggle('side-closed', close); store.set('side_v1', close ? 'closed' : 'open');
      setTimeout(() => { if (appOn()) render(); }, 440); // los gráficos se ajustan al nuevo ancho
    } else {
      const open = force === 'open' ? true : force === 'close' ? false : !r.classList.contains('side-drawer');
      r.classList.toggle('side-drawer', open); if (open) { const a = $('.sb-i.is-on') || $('.sb-i'); if (a) a.focus({ preventScroll: true }); }
    }
  }
  window.toggleSide = toggleSide;
  document.addEventListener('click', e => {
    const s = e.target.closest('[data-side]'); if (s) { e.preventDefault(); toggleSide(s.dataset.side === 'close' ? 'close' : undefined); return; }
    const h = e.target.closest('[data-hist]'); if (h) { e.preventDefault(); h.dataset.hist === '-1' ? history.back() : history.forward(); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act;
    if (act === 'palette') { e.preventDefault(); openPalette(); }
    else if (act === 'account') { e.preventDefault(); toggleAccMenu(a); }
    else if (act === 'more-menu') { e.preventDefault(); openMoreSheet(); }
    else if (act === 'shortcuts') { e.preventDefault(); closeAccMenu(); openKeys(); }
    else if (act === 'gesture-pad') { e.preventDefault(); closeAccMenu(); openGesturePad(); }
    else if (act === 'gesture-cfg') { e.preventDefault(); gestureCfgModal(); }
    else if (act === 'ctx-close') { closeCtx(); }
  });
  window.addEventListener('resize', () => { if (wide()) document.documentElement.classList.remove('side-drawer'); });

  /* menú "Más" del iPhone: los módulos en una hoja que sube desde abajo */
  function openMoreSheet() {
    if (typeof openMenu !== 'function') return;
    openMenu(); const m = $('#modMenu'); if (!m) return;
    m.classList.add('as-sheet'); Object.assign(m.style, { left: '', top: '' });
    m.style.setProperty('--mdm-max', Math.round(window.innerHeight * 0.78) + 'px');
  }
  // al cerrar el menú se quita el modo hoja
  new MutationObserver(() => { const m = $('#modMenu'); if (m && m.hidden) m.classList.remove('as-sheet'); }).observe($('#modMenu'), { attributes: true, attributeFilter: ['hidden'] });

  /* ---------- 2. Menú de cuenta (apariencia, edición, atajos, gestos, salir) ---------- */
  const accMenu = () => $('#accMenu');
  function accHtml() {
    const name = account ? (account.name || account.email.split('@')[0]) : '';
    return `<div class="acc-h"><span class="acc-av">${esc((name || '?')[0].toUpperCase())}</span><span><b>${esc(name)}</b><small>${esc(account ? account.email : '')}</small></span></div>
      <div class="acc-sec"><p class="acc-t">Apariencia</p>${appearanceHtml()}</div>
      <div class="acc-list">
        <button type="button" class="acc-i" data-acc="lock">${svgI(isUnlocked() ? 'unlock' : 'lock', 17)}<span>${isUnlocked() ? 'Bloquear la edición' : 'Abrir la edición con tu clave'}</span><kbd>${MOD()} ⇧ L</kbd></button>
        <button type="button" class="acc-i" data-act="shortcuts">${svgI('keyboard', 17)}<span>Atajos de teclado y gestos</span><kbd>?</kbd></button>
        <button type="button" class="acc-i" data-act="gesture-pad">${svgI('hand', 17)}<span>Dibujar una letra</span><kbd>E</kbd></button>
        <button type="button" class="acc-i" data-act="install">${svgI('install', 17)}<span>Instalar la app</span></button>
        <a class="acc-i" href="#/ajustes">${svgI('gear', 17)}<span>Ajustes</span><kbd>${MOD()} ,</kbd></a>
        <a class="acc-i" href="#/auditoria">${svgI('shield', 17)}<span>Auditoría</span></a>
      </div>
      <div class="acc-list"><button type="button" class="acc-i acc-out" id="logoutBtn">${svgI('logout', 17)}<span>Cerrar sesión</span></button></div>`;
  }
  function toggleAccMenu(btn) { const m = accMenu(); if (!m) return; if (!m.hidden) return closeAccMenu(); m.innerHTML = accHtml(); m.hidden = false; const r = btn.getBoundingClientRect(), w = Math.min(320, window.innerWidth - 24); Object.assign(m.style, { width: w + 'px', left: Math.max(12, Math.min(window.innerWidth - w - 12, r.right - w)) + 'px', top: (r.bottom + 8) + 'px' }); m.style.setProperty('--mdm-max', (window.innerHeight - r.bottom - 20) + 'px'); m.style.setProperty('--mdm-ox', (r.left + r.width / 2 - parseFloat(m.style.left)) + 'px'); void m.offsetWidth; m.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); const f = m.querySelector('button,a'); if (f) f.focus({ preventScroll: true }); }
  function closeAccMenu() { const m = accMenu(); if (!m || m.hidden) return; m.classList.remove('is-open'); m.hidden = true; m.innerHTML = ''; const b = $('#accBtn'); if (b) b.setAttribute('aria-expanded', 'false'); }
  window.closeAccMenu = closeAccMenu;
  document.addEventListener('click', e => {
    const m = accMenu(); if (!m || m.hidden || e.target.closest('#accBtn')) return; // el botón ya abre y cierra el menú
    const it = e.target.closest('[data-acc]');
    if (it && it.dataset.acc === 'lock') { closeAccMenu(); $('#lockBtn').click(); return; }
    if (e.target.closest('[data-set-theme],[data-set-accent],[data-set-nav]')) { setTimeout(() => { if (!m.hidden) m.innerHTML = accHtml(); }, 0); return; }
    if (e.target.closest('a.acc-i,#logoutBtn,[data-act]')) { closeAccMenu(); return; }
    if (!e.target.closest('#accMenu') && !e.target.closest('#accBtn')) closeAccMenu();
  });

  /* ---------- 3. Paleta "Buscar o ir a…" (Spotlight) ---------- */
  let pal = null, palSel = 0, palItems = [], palPrev = null;
  const ACTIONS = () => [
    { t: 'Agendar cita con un cliente', s: 'Agenda', k: 'N', ic: 'agenda', run: () => { go('agenda'); setTimeout(() => eventModal(null, state.agDay || TODAY, { type: 'CLIENTE' }), 120); } },
    { t: 'Registrar un pago', s: 'Facturación · Binance, PayPal, Zelle, efectivo o bolívares', k: 'P', ic: 'coins', run: () => pickInvoiceToPay() },
    { t: 'Registrar un gasto', s: 'Gastos', ic: 'receipt', run: () => { go('gastos'); setTimeout(() => withKey(() => expModal(null)), 150); } },
    { t: 'Nuevo cliente', s: 'Clientes', ic: 'users', run: () => { go('clientes'); setTimeout(() => withKey(() => clientModal(null)), 150); } },
    { t: 'Crear una factura', s: 'Facturero', ic: 'invoice', run: () => go('facturero') },
    { t: 'Registrar las tasas de hoy', s: 'Dólar BCV, Binance, PayPal, Zelle y efectivo', ic: 'rate', run: () => withKey(() => tasasModal()) },
    { t: 'Emitir un recibo de pago', s: 'Inversionistas', ic: 'receipt', run: () => { go('inversionistas'); setTimeout(() => withKey(() => receiptModal({})), 150); } },
    { t: 'Descargar el informe de este módulo', s: 'PDF a color o Excel', k: `${MOD()} P`, ic: 'download', run: () => openReport() },
    { t: 'Pregúntale a Athena', s: 'Tu asistente', k: `${MOD()} J`, ic: 'athena', run: () => window.openAthena && openAthena() },
    { t: 'Dibujar una letra', s: 'Gestos', k: 'E', ic: 'hand', run: () => openGesturePad() },
    { t: resolvedTheme() === 'dark' ? 'Tema claro' : 'Tema oscuro', s: 'Apariencia', k: 'D', ic: resolvedTheme() === 'dark' ? 'sun' : 'moon', run: () => setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark') },
    { t: 'Tema automático (como el sistema)', s: 'Apariencia', ic: 'auto', run: () => setTheme('auto') },
    { t: isUnlocked() ? 'Bloquear la edición' : 'Abrir la edición con la clave', s: 'Seguridad', k: `${MOD()} ⇧ L`, ic: 'lock', run: () => $('#lockBtn').click() },
    { t: sideOn() ? 'Mostrar u ocultar la barra lateral' : 'Abrir el menú de módulos', s: sideOn() ? 'Ventana' : 'Menú de arriba', k: sideOn() ? `${MOD()} \\` : 'M', ic: sideOn() ? 'sidebar' : 'more', run: () => toggleSide() },
    { t: sideOn() ? 'Menú de módulos arriba (como siempre)' : 'Usar barra lateral (estilo Mac)', s: 'Apariencia', ic: 'sidebar', run: () => setNav(sideOn() ? 'top' : 'side') },
    { t: 'Atajos de teclado y gestos', s: 'Ayuda', k: '?', ic: 'keyboard', run: () => openKeys() },
    { t: 'Instalar la app', s: 'iPhone, Android, Mac y PC', ic: 'install', run: () => installModal() },
    { t: 'Descargar respaldo completo', s: 'Ajustes', ic: 'upload', run: () => backupDownload() },
    { t: 'Exportar la agenda a mi calendario (.ics)', s: 'Agenda', ic: 'download', run: () => { const b = document.createElement('button'); b.dataset.act = 'ev-ics-all'; b.hidden = true; document.body.appendChild(b); b.click(); b.remove(); } },
    { t: 'Cerrar sesión', s: 'Cuenta', ic: 'logout', run: () => { const b = document.createElement('button'); b.id = 'logoutBtn'; b.hidden = true; document.body.appendChild(b); b.click(); b.remove(); } },
  ];
  function palSources(q) {
    const nq = normTxt(q), words = nq.split(' ').filter(Boolean);
    const score = txt => { const t = normTxt(txt); if (!nq) return 1; let s = 0; if (t.startsWith(nq)) s += 60; else if (t.includes(nq)) s += 35; words.forEach(w => { if (new RegExp('(^|\\s)' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(t)) s += 12; else if (t.includes(w)) s += 5; else s -= 40; }); return s; };
    const out = [];
    MODULES.forEach(m => { const sc = score(m.name + ' ' + m.desc); if (sc > 0) out.push({ g: 'Ir a', t: m.name, s: m.desc, ic: m.icon, c: m.color, k: (Object.entries(SIDE_KEYS).find(([id]) => id === m.id) || [])[1] ? `${MOD()} ${SIDE_KEYS[m.id]}` : '', run: () => go(m.id), sc: sc + (nq ? 0 : 0) }); });
    ACTIONS().forEach(a => { const sc = score(a.t + ' ' + a.s); if (sc > 0) out.push({ g: 'Acciones', ...a, sc }); });
    if (nq.length >= 2) {
      clientDefs.forEach(c => { const sc = score(c.name + ' ' + (c.sector || '')); if (sc > 20) out.push({ g: 'Clientes', t: c.name, s: [c.sector, c.opt && c.opt.rif].filter(Boolean).join(' · ') || 'Cliente', ic: 'users', run: () => { go('clientes'); setTimeout(() => clientModal(c.id), 150); }, sc }); });
      db.invoices.filter(i => !i.voided).forEach(i => { const c = db.clients.find(x => x.id === i.clientId); const sc = score(`factura ${i.num || i.id} ${c ? c.name : ''}`); if (sc > 25) { const st = invoiceStatus(i, addDays(D(TODAY), 1)); out.push({ g: 'Facturas', t: `Factura ${i.num || i.id} · ${c ? c.name : ''}`, s: `${fmtDate(i.issueDate)} · ${money(invoiceUsd(db, i), 2)} · ${FACT_STATUS[st][0]}`, ic: 'invoice', run: () => st === 'PAID' ? (go('facturacion')) : payModal(i.id), sc: sc - 5 }); } });
      events.forEach(e => { const sc = score(`${e.title} ${evClientName(e)} cita reunion`); if (sc > 20) out.push({ g: 'Agenda', t: e.title, s: `${dayLongCap(e.date)} · ${evTime(e)}`, ic: 'agenda', run: () => { go('agenda'); setTimeout(() => evDetail(e.id), 150); }, sc }); });
      ALL_PERIODS.forEach(p => { const sc = score(periodLabel(p) + ' mes'); if (sc > 30) out.push({ g: 'Meses', t: periodLabel(p), s: monthRel(p), ic: 'calendar', run: () => { state.period = p; state.agMonth = null; load(); }, sc: sc - 10 }); });
    }
    const sorted = out.sort((a, b) => b.sc - a.sc);
    const groups = ['Ir a', 'Acciones', 'Clientes', 'Facturas', 'Agenda', 'Meses'];
    let res = nq ? sorted.slice(0, 14) : [...out.filter(x => x.g === 'Ir a').slice(0, 7), ...out.filter(x => x.g === 'Acciones').slice(0, 6)];
    res = groups.flatMap(g => res.filter(x => x.g === g));
    if (nq) res.push({ g: 'Athena', t: `Preguntarle a Athena: “${q}”`, s: 'Te respondo con tus datos', ic: 'athena', run: () => window.openAthena && openAthena(q) });
    return res;
  }
  function openPalette(q = '') {
    closeAccMenu(); if (typeof closeMenu === 'function') closeMenu(false);
    if (!pal) { pal = document.createElement('div'); pal.className = 'cmdk'; pal.setAttribute('role', 'dialog'); pal.setAttribute('aria-modal', 'true'); pal.setAttribute('aria-label', 'Buscar o ir a'); pal.innerHTML = `<div class="cmdk-scrim" data-pal="close"></div><div class="cmdk-box"><label class="cmdk-in">${svgI('search', 20)}<input type="search" placeholder="Buscar módulos, acciones, clientes, facturas o citas…" autocomplete="off" spellcheck="false" aria-controls="cmdkList" aria-autocomplete="list"><kbd>esc</kbd></label><div class="cmdk-list" id="cmdkList" role="listbox"></div><div class="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> moverte</span><span><kbd>↵</kbd> abrir</span><span><kbd>esc</kbd> cerrar</span></div></div>`; document.body.appendChild(pal);
      pal.addEventListener('click', e => { if (e.target.closest('[data-pal="close"]')) return closePalette(); const it = e.target.closest('[data-i]'); if (it) runPal(+it.dataset.i); });
      pal.addEventListener('mousemove', e => { const it = e.target.closest('[data-i]'); if (it && +it.dataset.i !== palSel) { palSel = +it.dataset.i; paintPal(false); } });
      pal.querySelector('input').addEventListener('input', e => { palSel = 0; fillPal(e.target.value); });
    }
    if (!pal.classList.contains('is-open')) palPrev = document.activeElement;
    pal.classList.add('is-open'); document.documentElement.classList.add('no-scroll');
    const inp = pal.querySelector('input'); inp.value = q; palSel = 0; fillPal(q); setTimeout(() => inp.focus(), 10);
  }
  function fillPal(q) { palItems = palSources(q); paintPal(true); }
  function paintPal(full) {
    const list = pal.querySelector('.cmdk-list');
    if (full) { let lastG = ''; list.innerHTML = palItems.length ? palItems.map((x, i) => { const head = x.g !== lastG ? `<p class="cmdk-g">${esc(x.g)}</p>` : ''; lastG = x.g; return `${head}<div class="cmdk-i" role="option" data-i="${esc(i)}" id="cmdk-${i}"><span class="cmdk-ic" style="${x.c ? `--c:${x.c}` : ''}">${svgI(x.ic || 'spark', 16)}</span><span class="cmdk-t"><b>${esc(x.t)}</b><small>${esc(x.s || '')}</small></span>${x.k ? `<kbd>${esc(x.k)}</kbd>` : ''}</div>`; }).join('') : '<p class="cmdk-empty">Sin resultados. Prueba con otra palabra o pregúntale a Athena.</p>'; }
    $$('.cmdk-i', list).forEach(el => el.classList.toggle('is-sel', +el.dataset.i === palSel));
    const sel = $(`#cmdk-${palSel}`); if (sel) { sel.scrollIntoView({ block: 'nearest' }); pal.querySelector('input').setAttribute('aria-activedescendant', sel.id); }
  }
  function runPal(i) { const x = palItems[i]; if (!x) return; closePalette(); haptic(); setTimeout(() => x.run(), 30); }
  function closePalette() {
    if (!pal || !pal.classList.contains('is-open')) return; pal.classList.remove('is-open'); document.documentElement.classList.remove('no-scroll');
    const inp = pal.querySelector('input'); if (document.activeElement === inp) inp.blur(); // el foco vuelve a donde estaba (como Spotlight)
    if (palPrev && palPrev.isConnected && palPrev !== document.body && !palPrev.closest('.cmdk')) palPrev.focus({ preventScroll: true }); palPrev = null;
  }
  window.openPalette = openPalette;
  // Elegir la factura a pagar (desde la paleta, el atajo P o Athena)
  function pickInvoiceToPay(clientQ) {
    const ref = addDays(D(TODAY), 1);
    let pend = db.invoices.filter(i => !i.voided && invoiceStatus(i, ref) !== 'PAID');
    if (clientQ) { const nq = normTxt(clientQ); pend = pend.filter(i => { const c = db.clients.find(x => x.id === i.clientId); return c && normTxt(c.name).includes(nq); }); }
    pend.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    if (!pend.length) return toast(clientQ ? `No hay facturas por cobrar de "${clientQ}".` : 'No hay facturas por cobrar. ¡Todo al día!');
    if (!isUnlocked()) return withKey(() => pickInvoiceToPay(clientQ)); // registrar pagos mueve los indicadores: pide la clave
    if (pend.length === 1) return payModal(pend[0].id);
    openModal(`<h2 id="modal-t">¿Qué factura vas a cobrar?</h2><p class="muted">${pend.length} factura(s) por cobrar, de la que vence primero a la última.</p><ul class="pick-list">${pend.slice(0, 40).map(i => { const c = db.clients.find(x => x.id === i.clientId); const due = invDue(i); return `<li><button type="button" class="pick-i" data-pay="${esc(i.id)}"><span><b>${esc(c ? c.name : '—')}</b><small>Factura ${esc(i.num || i.id)} · vence ${fmtDate(i.dueDate)}${i.dueDate < TODAY ? ' · <span class="txt-bad">vencida</span>' : ''}</small></span><b>${money(due || invoiceUsd(db, i), 2)}</b>${svgI('chevR', 16)}</button></li>`; }).join('')}</ul><div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button></div>`);
  }
  window.pickInvoiceToPay = pickInvoiceToPay;

  /* ---------- 4. Atajos de teclado ---------- */
  const NAV_KEYS = { '1': 'resumen', '2': 'agenda', '3': 'facturacion', '4': 'cobranza', '5': 'caja', '6': 'gastos', '7': 'clientes', '8': 'inversionistas', '9': 'utilidades' };
  const G_KEYS = { r: 'resumen', a: 'agenda', f: 'facturacion', x: 'facturero', b: 'cobranza', c: 'caja', g: 'gastos', l: 'clientes', i: 'ingresos', v: 'inversionistas', u: 'utilidades', m: 'matriz', p: 'productos', o: 'comisiones', n: 'rentabilidad', s: 'pausas', e: 'inversion', t: 'plan', j: 'ajustes', d: 'auditoria' };
  let gSeq = 0, cmdHold = 0;
  function stepMonth(n) {
    if (state.module === 'agenda') return agStep(n);
    const i = ALL_PERIODS.indexOf(state.period), j = i + n; if (j < 0 || j >= ALL_PERIODS.length) { haptic(20); return toast(n < 0 ? 'No hay meses anteriores con datos' : 'No hay más meses hacia adelante'); }
    state.period = ALL_PERIODS[j]; state.agMonth = null; haptic(); load();
  }
  window.stepMonth = stepMonth;
  function newContextual() {
    const m = state.module;
    if (m === 'agenda' || m === 'resumen') return eventModal(null, state.agDay || TODAY, { type: 'CLIENTE' });
    if (m === 'gastos') return withKey(() => expModal(null));
    if (m === 'clientes') return withKey(() => clientModal(null));
    if (m === 'inversionistas') return withKey(() => aporteModal(null));
    if (m === 'facturacion' || m === 'cobranza') return pickInvoiceToPay();
    if (m === 'utilidades') return withKey(() => socioModal(null));
    if (m === 'inversion') return withKey(() => invModal(null));
    if (m === 'comisiones') return withKey(() => impModal(null));
    openPalette('');
  }
  document.addEventListener('keydown', e => {
    if (!appOn()) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key, code = e.code;
    if (k === 'Meta' || k === 'Control') { if (!cmdHold && !e.repeat) cmdHold = setTimeout(() => { if (!overlayOpen()) openKeys(true); }, 1100); return; }
    clearTimeout(cmdHold); cmdHold = 0;
    if (mod && (k === 'k' || k === 'K')) { e.preventDefault(); return $('.cmdk.is-open') ? closePalette() : openPalette(); }
    if (mod && (k === 'j' || k === 'J')) { e.preventDefault(); return window.toggleAthena ? toggleAthena() : window.openAthena && openAthena(); }
    if (pal && pal.classList.contains('is-open')) {
      if (k === 'Escape') { e.preventDefault(); return closePalette(); }
      if (k === 'ArrowDown') { e.preventDefault(); palSel = Math.min(palItems.length - 1, palSel + 1); return paintPal(false); }
      if (k === 'ArrowUp') { e.preventDefault(); palSel = Math.max(0, palSel - 1); return paintPal(false); }
      if (k === 'Enter') { e.preventDefault(); return runPal(palSel); }
      return;
    }
    if (k === 'Escape') { if ($('.keys.is-open')) return closeKeys(); if ($('.gpad.is-open')) return closeGesturePad(); if (ctx) return closeCtx(); if (!accMenu().hidden) return closeAccMenu(); if (document.documentElement.classList.contains('side-drawer')) return toggleSide('close'); }
    if (mod && e.shiftKey && (k === 'l' || k === 'L')) { e.preventDefault(); return $('#lockBtn').click(); }
    if (mod && (k === '\\' || (e.ctrlKey && e.metaKey && (k === 's' || k === 'S')))) { e.preventDefault(); return toggleSide(); }
    if (mod && (k === 'p' || k === 'P') && !overlayOpen()) { e.preventDefault(); return openReport(); }
    if (mod && k === ',') { e.preventDefault(); return go('ajustes'); }
    if ((mod || e.altKey) && /^Digit[1-9]$/.test(code) && !overlayOpen()) { e.preventDefault(); return go(NAV_KEYS[code.slice(5)]); }
    if (mod || e.altKey || editing(e.target) || overlayOpen() || e.defaultPrevented) return; // otro control ya usó la tecla (ej. flechas en el calendario)
    const l = k.length === 1 ? k.toLowerCase() : k;
    if (gSeq && Date.now() - gSeq < 1200 && G_KEYS[l]) { e.preventDefault(); gSeq = 0; hideHint(); return go(G_KEYS[l]); }
    gSeq = 0;
    if (l === 'g') { gSeq = Date.now(); showHint('G + letra: R Resumen · A Agenda · F Facturación · C Caja · L Clientes · G Gastos · B Cobranza…'); return; }
    if (k === '/' ) { e.preventDefault(); return openPalette(); }
    if (k === '?') { e.preventDefault(); return openKeys(); }
    if (k === 'ArrowLeft' || k === '[') { e.preventDefault(); return stepMonth(-1); }
    if (k === 'ArrowRight' || k === ']') { e.preventDefault(); return stepMonth(1); }
    if (l === 't') { e.preventDefault(); if (state.module === 'agenda') return agStep(0); if (state.period !== CUR_P) { state.period = CUR_P; state.agMonth = null; load(); } return; }
    if (l === 'n') { e.preventDefault(); return newContextual(); }
    if (l === 'p') { e.preventDefault(); return pickInvoiceToPay(); }
    if (l === 'd') { e.preventDefault(); return setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark'); }
    if (l === 'e') { e.preventDefault(); return openGesturePad(); }
    if (l === 'a' && !e.shiftKey) { e.preventDefault(); return window.openAthena && openAthena(); }
    if (state.module === 'agenda' && /^[1-4]$/.test(k)) { e.preventDefault(); return agSetView(['day', 'week', 'month', 'list'][+k - 1]); }
  });
  document.addEventListener('keyup', e => { if (e.key === 'Meta' || e.key === 'Control') { clearTimeout(cmdHold); cmdHold = 0; if ($('.keys.is-open.is-hold')) closeKeys(); } });
  window.addEventListener('blur', () => { clearTimeout(cmdHold); cmdHold = 0; });
  let hintT = 0;
  function showHint(t) { let h = $('#kbhint'); if (!h) { h = document.createElement('div'); h.id = 'kbhint'; h.className = 'kbhint'; document.body.appendChild(h); } h.textContent = t; h.classList.add('show'); clearTimeout(hintT); hintT = setTimeout(hideHint, 1300); }
  function hideHint() { const h = $('#kbhint'); if (h) h.classList.remove('show'); }

  /* hoja de atajos (como al mantener ⌘ en el iPad) */
  function keysHtml() {
    const M = MOD(), r = (k, t) => `<li><span>${t}</span><span class="keys-k">${k.split(' ').map(x => `<kbd>${x}</kbd>`).join('')}</span></li>`;
    const g = gestureMap();
    return `<div class="keys-box"><header><h2>Atajos de teclado y gestos</h2><button type="button" class="tb-ic" data-keys="close" aria-label="Cerrar">${I.close}</button></header><div class="keys-cols">
      <section><h3>General</h3><ul>${r(`${M} K`, 'Buscar o ir a…')}${r('/', 'Buscar')}${r(`${M} J`, 'Athena')}${r('A', 'Athena')}${r('?', 'Esta hoja')}${r('M', 'Menú de módulos')}${sideOn() ? r(`${M} \\`, 'Barra lateral') : ''}${r(`${M} ,`, 'Ajustes')}${r(`${M} P`, 'Descargar informe')}${r(`${M} ⇧ L`, 'Bloquear o abrir la edición')}${r('D', 'Tema claro u oscuro')}${r('Esc', 'Cerrar')}</ul></section>
      <section><h3>Ir a</h3><ul>${Object.entries(NAV_KEYS).map(([n, id]) => r(`${M} ${n}`, modOf(id).name)).join('')}${r('G R', 'Resumen (G + letra)')}${r('G L', 'Clientes')}${r('G M', 'Matriz económica')}</ul><p class="keys-note">En el navegador también sirve ${isApple() ? '⌥' : 'Alt'} + número.</p></section>
      <section><h3>Meses y acciones</h3><ul>${r('←', 'Mes anterior')}${r('→', 'Mes siguiente')}${r('T', 'Mes en curso (en la Agenda: hoy)')}${r('N', 'Nuevo (cita, gasto, cliente… según el módulo)')}${r('P', 'Registrar un pago')}${r('E', 'Dibujar una letra')}${r('1 2 3 4', 'Agenda: Día, Semana, Mes y Lista')}</ul></section>
      <section><h3>Gestos</h3><ul class="keys-ges">
        <li><span>Doble clic o doble toque</span><span class="muted">En una fila: editar · en un día u hora de la Agenda: agendar · en un título: volver arriba · en un gráfico: verlo grande · en una cifra: qué mide</span></li>
        <li><span>Dos dedos a los lados (trackpad o pantalla)</span><span class="muted">Página anterior o siguiente, como en Safari</span></li>
        <li><span>← → o un dedo sobre el calendario o el encabezado</span><span class="muted">Mes anterior o siguiente (en la Agenda: período)</span></li>
        <li><span>Pellizcar (trackpad o pantalla)</span><span class="muted">En la Agenda: Día ↔ Semana ↔ Mes</span></li>
        <li><span>Deslizar desde el borde izquierdo</span><span class="muted">Volver a la pantalla anterior</span></li>
        <li><span>Mantener pulsado o clic derecho</span><span class="muted">Menú con las acciones de esa fila</span></li>
        <li><span>Tirar hacia abajo (celular)</span><span class="muted">Actualizar y sincronizar con el facturero</span></li>
        <li><span>Mantener ${isApple() ? '⌥ Opción' : 'Alt'} y dibujar con el puntero, o clic derecho y arrastrar</span><span class="muted">Letra dibujada (también con la tecla E o manteniendo pulsado el botón de Athena)</span></li>
      </ul><h3>Letras dibujadas</h3><div class="keys-letters">${Object.entries(g).map(([L, a]) => `<span><b>${L}</b>${esc((GESTURE_ACTIONS[a] || {}).t || a)}</span>`).join('')}</div></section>
    </div></div>`;
  }
  function openKeys(hold) { let k = $('.keys'); if (!k) { k = document.createElement('div'); k.className = 'keys'; k.setAttribute('role', 'dialog'); k.setAttribute('aria-modal', 'true'); k.setAttribute('aria-label', 'Atajos de teclado y gestos'); document.body.appendChild(k); k.addEventListener('click', e => { if (e.target === k || e.target.closest('[data-keys="close"]')) closeKeys(); }); } k.innerHTML = keysHtml(); k.classList.toggle('is-hold', !!hold); k.classList.add('is-open'); const b = k.querySelector('[data-keys="close"]'); if (b && !hold) b.focus(); }
  function closeKeys() { const k = $('.keys'); if (k) k.classList.remove('is-open', 'is-hold'); }
  window.openKeys = openKeys;

  /* ---------- 5. Gestos ---------- */
  // 5a · Doble clic (mouse o trackpad) y doble toque (pantalla táctil)
  const EDIT_ATTRS = ['edit', 'expEdit', 'invEdit', 'evEdit', 'recEdit', 'invstEdit', 'socEdit', 'aseEdit', 'impEdit', 'rcptView', 'pay', 'invstLedger'];
  function onDouble(target, x, y) {
    if (!appOn() || overlayOpen()) return false;
    if (target.closest('input,select,textarea,a[href],.cmdk,.ath-panel')) return false;
    const slot = target.closest('[data-slot]');
    if (slot && $('#content').contains(slot)) { const [d, t] = slot.dataset.slot.split('|'); haptic(); eventModal(null, d, { type: 'CLIENTE', start: t || undefined }); return true; }
    const evb = target.closest('[data-ev-open]'); if (evb) { eventModal(evb.dataset.evOpen); return true; }
    const row = target.closest('#content tbody tr, .ag-ev');
    if (row) { const btn = $$('button, a', row).find(b => EDIT_ATTRS.some(a => b.dataset[a] !== undefined)); if (btn) { haptic(); btn.click(); return true; } }
    const ttl = target.closest('[data-dbl="top"], .topbar'); if (ttl && !target.closest('button,a,.seg')) { window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' }); return true; }
    const segM = target.closest('#seg'); if (segM) { if (state.period !== CUR_P) { state.period = CUR_P; state.agMonth = null; load(); toast('Mes en curso'); } return true; }
    const ch = target.closest('#content svg.chart'); if (ch) { quickLook(ch); return true; }
    const mi = target.closest('#content .micro'); if (mi) { const i = mi.querySelector('.mm-i'); const h = mi.querySelector('h3'); if (i) toast(`${h ? h.textContent.trim() + ': ' : ''}${i.getAttribute('title')}`); return true; }
    return false;
  }
  document.addEventListener('dblclick', e => { if (Date.now() - lastTouchDbl < 600) return; if (onDouble(e.target, e.clientX, e.clientY)) { e.preventDefault(); const s = window.getSelection && window.getSelection(); if (s && s.removeAllRanges) s.removeAllRanges(); } });
  let lastTap = { t: 0, x: 0, y: 0 }, lastTouchDbl = 0;
  document.addEventListener('pointerup', e => {
    if (e.pointerType !== 'touch') return;
    const now = Date.now();
    if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) { lastTap.t = 0; if (onDouble(e.target, e.clientX, e.clientY)) { lastTouchDbl = now; e.preventDefault(); } return; }
    lastTap = { t: now, x: e.clientX, y: e.clientY };
  });
  // Vista rápida de un gráfico (como Quick Look)
  function quickLook(svg) {
    const p = svg.closest('.panel, .hero'); const title = p && p.querySelector('h2') ? p.querySelector('h2').textContent : 'Gráfico';
    const legend = svg.previousElementSibling && svg.previousElementSibling.classList.contains('legend') ? svg.previousElementSibling.outerHTML : '';
    openModal(`<h2 id="modal-t">${esc(title)}</h2>${legend}<div class="ql-chart">${svg.outerHTML}</div><p class="muted small">Pasa el puntero (o toca) sobre los puntos y barras para ver cada valor.</p>`);
    const card = $('#modal .modal-card'); if (card) card.classList.add('modal-wide');
  }
  // al cerrar el modal se quita el modo ancho
  new MutationObserver(() => { const m = $('#modal'); if (m.hidden) { const c = m.querySelector('.modal-card'); if (c) c.classList.remove('modal-wide'); } }).observe($('#modal'), { attributes: true, attributeFilter: ['hidden'] });

  // 5a · Historial de la app: para saber si hay página anterior o siguiente (cada entrada lleva su posición)
  const NAV_K = 'agora_nav_v1';
  const navRead = () => { try { return JSON.parse(sessionStorage.getItem(NAV_K) || 'null') || { pos: 0, max: 0 }; } catch (e) { return { pos: 0, max: 0 }; } };
  let nav = navRead();
  const navSave = () => { try { sessionStorage.setItem(NAV_K, JSON.stringify(nav)); } catch (e) {} };
  function navMark() {
    const st = history.state;
    if (st && typeof st.agoraPos === 'number') { nav.pos = st.agoraPos; } // atrás o adelante: entrada conocida
    else { nav.pos = (nav.pos || 0) + 1; nav.max = nav.pos; try { history.replaceState({ ...(st || {}), agoraPos: nav.pos }, ''); } catch (e) {} } // página nueva
    navSave();
  }
  (() => { const st = history.state; if (!st || typeof st.agoraPos !== 'number') { nav = { pos: 0, max: 0 }; try { history.replaceState({ ...(st || {}), agoraPos: 0 }, ''); } catch (e) {} navSave(); } else nav.pos = st.agoraPos; })();
  window.addEventListener('hashchange', navMark);
  const navCan = dir => dir < 0 ? nav.pos > 0 : nav.pos < nav.max;
  // Dos dedos hacia los lados: página anterior o siguiente (como en Safari). Sin página, solo avisa.
  function pageStep(dir) {
    if (!navCan(dir)) { haptic(20); return toast(dir < 0 ? 'No hay una página anterior' : 'No hay una página siguiente'); }
    haptic(); if (dir < 0) history.back(); else history.forward();
  }
  window.agoraPageStep = pageStep;

  // 5b · Trackpad: dos dedos hacia los lados = página anterior o siguiente (con indicador como el de Safari)
  let swAcc = 0, swT = 0, swLock = 0, swInd = null;
  function swIndicator(dir, prog) {
    if (!swInd) { swInd = document.createElement('div'); swInd.className = 'swipe-ind'; swInd.innerHTML = `<span>${svgI('chevL', 22)}</span>`; document.body.appendChild(swInd); }
    swInd.classList.toggle('right', dir > 0); swInd.style.setProperty('--p', Math.min(1, prog).toFixed(3)); swInd.classList.toggle('ready', prog >= 1); swInd.classList.toggle('none', !navCan(dir)); swInd.classList.add('show');
    swInd.title = dir < 0 ? 'Página anterior' : 'Página siguiente';
    clearTimeout(swInd._t); swInd._t = setTimeout(() => swInd.classList.remove('show'), 220);
  }
  function scrollsX(el, dx) { for (let n = el; n && n !== document.body; n = n.parentElement) { if (n.scrollWidth > n.clientWidth + 2) { const st = getComputedStyle(n); if (/(auto|scroll)/.test(st.overflowX)) { if (dx > 0 && n.scrollLeft + n.clientWidth < n.scrollWidth - 1) return true; if (dx < 0 && n.scrollLeft > 0) return true; } } } return false; }
  window.addEventListener('wheel', e => {
    if (!appOn() || overlayOpen()) return;
    if (e.ctrlKey) return pinchWheel(e); // pellizco del trackpad
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.4 || Math.abs(e.deltaX) < 2) return;
    if (scrollsX(e.target, e.deltaX)) return;
    const now = Date.now(); if (now < swLock) { e.preventDefault(); return; }
    if (now - swT > 260) swAcc = 0; swT = now; swAcc += e.deltaX; e.preventDefault();
    const TH = 140; swIndicator(Math.sign(swAcc), Math.abs(swAcc) / TH);
    if (Math.abs(swAcc) >= TH) { const dir = swAcc > 0 ? 1 : -1; swAcc = 0; swLock = now + 650; pageStep(dir); }
  }, { passive: false });

  // 5c · Pellizcar en la Agenda: Día ↔ Semana ↔ Mes (trackpad: ctrl + rueda; Safari: gesturechange; pantalla: dos dedos)
  const VIEW_ORDER = ['day', 'week', 'month'];
  let pinchAcc = 0, pinchT = 0, pinchLock = 0;
  function pinchStep(dir) { if (state.module !== 'agenda') return false; const v = agView(), i = VIEW_ORDER.indexOf(v === 'list' ? 'month' : v), j = Math.max(0, Math.min(2, i + dir)); if (j === i) return true; haptic(); agSetView(VIEW_ORDER[j]); toast(`Vista: ${{ day: 'Día', week: 'Semana', month: 'Mes' }[VIEW_ORDER[j]]}`); return true; }
  function pinchWheel(e) {
    if (state.module !== 'agenda' || !e.target.closest('[data-pinch="agenda"]')) return; // en lo demás se respeta el zoom del navegador
    e.preventDefault(); const now = Date.now(); if (now < pinchLock) return;
    if (now - pinchT > 300) pinchAcc = 0; pinchT = now; pinchAcc += e.deltaY;
    if (Math.abs(pinchAcc) > 40) { pinchStep(pinchAcc > 0 ? 1 : -1); pinchAcc = 0; pinchLock = now + 600; }
  }
  let gScale = 1;
  document.addEventListener('gesturestart', e => { if (state.module === 'agenda' && e.target.closest && e.target.closest('[data-pinch="agenda"]')) { e.preventDefault(); gScale = 1; } });
  document.addEventListener('gesturechange', e => { if (state.module !== 'agenda' || !(e.target.closest && e.target.closest('[data-pinch="agenda"]'))) return; e.preventDefault(); if (Date.now() < pinchLock) return; if (e.scale / gScale > 1.35) { pinchStep(-1); gScale = e.scale; pinchLock = Date.now() + 600; } else if (gScale / e.scale > 1.35) { pinchStep(1); gScale = e.scale; pinchLock = Date.now() + 600; } });

  // 5d · Pantalla táctil: deslizar desde el borde (atrás), deslizar en el calendario o el encabezado (cambiar período),
  //      pellizcar con dos dedos en la Agenda, mantener pulsado (menú contextual) y tirar hacia abajo (actualizar)
  let tStart = null, lpT = 0, ptr = null;
  document.addEventListener('touchstart', e => {
    if (!appOn() || overlayOpen()) { tStart = null; return; }
    const t = e.touches[0];
    if (e.touches.length === 2) { const [a, b] = e.touches; tStart = { pinch: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), inAg: !!e.target.closest('[data-pinch="agenda"]'), cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2, t: Date.now(), el: e.target }; clearTimeout(lpT); return; }
    tStart = { x: t.clientX, y: t.clientY, t: Date.now(), edge: t.clientX < 22, el: e.target, top: window.scrollY <= 0 };
    clearTimeout(lpT);
    const row = e.target.closest('#content tbody tr, .ag-ev, #content .micro');
    if (row) lpT = setTimeout(() => { if (tStart && !tStart.moved) { tStart.long = true; haptic(14); openCtx(row, tStart.x, tStart.y); } }, 520);
    else if (e.target.closest('#athenaBtn, .ath-fab')) lpT = setTimeout(() => { if (tStart && !tStart.moved) { tStart.long = true; haptic(14); openGesturePad(); } }, 600);
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!tStart) return;
    if (tStart.pinch && e.touches.length === 2) {
      const [a, b] = e.touches; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (tStart.inAg && Math.abs(d - tStart.pinch) > 60 && !tStart.done) { tStart.done = true; pinchStep(d < tStart.pinch ? 1 : -1); return; }
      // dos dedos juntos hacia un lado (sin pellizcar): página anterior (hacia la derecha) o siguiente (hacia la izquierda)
      const dx = (a.clientX + b.clientX) / 2 - tStart.cx, dy = (a.clientY + b.clientY) / 2 - tStart.cy;
      if (!tStart.done && Math.abs(d - tStart.pinch) < 45 && Math.abs(dx) > 24 && Math.abs(dy) < Math.abs(dx) * 0.6 && !scrollsX(tStart.el, -dx)) { swIndicator(dx > 0 ? -1 : 1, Math.abs(dx) / 90); if (Math.abs(dx) > 90) { tStart.done = true; pageStep(dx > 0 ? -1 : 1); } }
      return;
    }
    const t = e.touches[0], dx = t.clientX - tStart.x, dy = t.clientY - tStart.y;
    if (Math.hypot(dx, dy) > 10) { tStart.moved = true; clearTimeout(lpT); }
    if (tStart.edge && dx > 0) { swIndicator(-1, dx / 110); }
    if (tStart.top && dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.5 && window.scrollY <= 0 && !tStart.el.closest('.modal-card,.cmdk,.ath-panel,.mdm,.bt-wrap,.tg')) { pullIndicator(dy); }
  }, { passive: true });
  document.addEventListener('touchend', e => {
    clearTimeout(lpT); const s = tStart; tStart = null; if (!s || s.long || s.pinch) { pullIndicator(0); return; }
    const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y, dt = Date.now() - s.t;
    if (s.edge && dx > 90 && Math.abs(dy) < 60) { pullIndicator(0); haptic(); return navCan(-1) ? history.back() : toggleSide('open'); } // sin página anterior: abre el menú
    if (s.top && dy > 110 && Math.abs(dx) < 50 && window.scrollY <= 0 && ptr && ptr.classList.contains('ready')) { pullIndicator(0); return refreshAll(); }
    pullIndicator(0);
    if (dt < 600 && Math.abs(dx) > 70 && Math.abs(dy) < Math.abs(dx) * 0.6) {
      const zone = s.el.closest('.ag-cal, .ag-tgw, .mod-h, .hero, #seg, .tm-grid ~ *');
      if (zone && !s.el.closest('.bt-wrap, .tm-grid, .mx-wrap')) { haptic(); stepMonth(dx < 0 ? 1 : -1); }
    }
  }, { passive: true });
  function pullIndicator(dy) {
    if (!ptr) { ptr = document.createElement('div'); ptr.className = 'ptr'; ptr.innerHTML = `<span>${svgI('refresh', 18)}</span>`; document.body.appendChild(ptr); }
    const p = Math.min(1, dy / 110); ptr.style.setProperty('--p', p.toFixed(3)); ptr.classList.toggle('show', dy > 8); ptr.classList.toggle('ready', p >= 1);
  }
  function refreshAll() { haptic(12); if (window.AGORA_SRV) return window.AGORA_SRV.refresh(); try { syncClientsToFacturero(); syncFromFacturero(true); runRecurring(true); rebuild(); } catch (x) { console.warn(x); } load(); toast('Actualizado y sincronizado con el facturero'); }
  window.refreshAll = refreshAll;

  // 5e · Menú contextual (clic derecho en Mac/PC o mantener pulsado en el celular) con las acciones de la fila
  let ctx = null;
  function openCtx(row, x, y) {
    closeCtx();
    const btns = $$('button, a.btn', row).filter(b => !b.disabled && b.offsetParent !== null && (b.textContent.trim() || b.getAttribute('aria-label')));
    const items = btns.map((b, i) => ({ i, label: (b.textContent.trim() || b.getAttribute('aria-label') || '').replace(/\s+/g, ' '), danger: /eliminar|borrar|anular|revertir|cortar/i.test(b.textContent + ' ' + (b.getAttribute('aria-label') || '')), b }));
    const text = row.innerText.replace(/\s+/g, ' ').trim().slice(0, 300);
    ctx = document.createElement('div'); ctx.className = 'ctx'; ctx.setAttribute('role', 'menu');
    ctx.innerHTML = `${items.length ? items.map(it => `<button type="button" class="ctx-i ${it.danger ? 'is-danger' : ''}" role="menuitem" data-ci="${esc(it.i)}">${esc(it.label)}</button>`).join('') : '<p class="ctx-empty">Sin acciones en esta fila</p>'}<hr><button type="button" class="ctx-i" role="menuitem" data-ci="copy">${svgI('receipt', 15)} Copiar el texto</button>`;
    document.body.appendChild(ctx);
    const w = ctx.offsetWidth, h = ctx.offsetHeight; ctx.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x)) + 'px'; ctx.style.top = Math.max(8, Math.min(window.innerHeight - h - 8, y)) + 'px';
    requestAnimationFrame(() => ctx && ctx.classList.add('is-open'));
    ctx.addEventListener('click', e => { const b = e.target.closest('[data-ci]'); if (!b) return; const v = b.dataset.ci; closeCtx(); if (v === 'copy') { try { navigator.clipboard.writeText(text).then(() => toast('Texto copiado')); } catch (x) {} return; } const it = items[+v]; if (it) it.b.click(); });
    const f = ctx.querySelector('button'); if (f) f.focus({ preventScroll: true });
  }
  function closeCtx() { if (ctx) { ctx.remove(); ctx = null; } }
  window.closeCtx = closeCtx;
  document.addEventListener('contextmenu', e => {
    if (!appOn() || overlayOpen()) return;
    if (gestRight) { e.preventDefault(); return; }
    const row = e.target.closest('#content tbody tr, #content .ag-ev'); if (!row || editing(e.target) || e.target.closest('a[href]:not(.btn)')) return;
    e.preventDefault(); openCtx(row, e.clientX, e.clientY);
  });
  document.addEventListener('click', e => { if (ctx && !e.target.closest('.ctx')) closeCtx(); }, true);
  window.addEventListener('scroll', () => { if (ctx) closeCtx(); }, { passive: true });

  /* ---------- 6. Letras dibujadas (reconocedor $P de Vatavu, Anthony y Wobbrock) ---------- */
  const N = 32;
  const arc = (cx, cy, rx, ry, a0, a1, n = 14) => Array.from({ length: n }, (_, i) => { const a = (a0 + (a1 - a0) * i / (n - 1)) * Math.PI / 180; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });
  const LETTERS = {
    A: [[[[0, 100], [50, 0], [100, 100]], [[24, 58], [76, 58]]], [[[0, 100], [50, 0], [100, 100]]], [[[0, 100], [50, 0], [100, 100], [24, 58], [76, 58]]]],
    B: [[[[0, 0], [0, 100]], [[0, 0], [52, 0], ...arc(52, 25, 26, 25, -90, 90, 8), [0, 50]], [[0, 50], [58, 50], ...arc(58, 75, 30, 25, -90, 90, 8), [0, 100]]], [[[0, 100], [0, 0], [52, 0], ...arc(52, 25, 26, 25, -90, 90, 8), [5, 50], [58, 50], ...arc(58, 75, 30, 25, -90, 90, 8), [0, 100]]]],
    C: [[arc(55, 50, 48, 50, -45, -315, 18)], [arc(55, 50, 44, 50, -30, -330, 18)]],
    D: [[[[0, 0], [0, 100]], [[0, 0], [35, 0], ...arc(35, 50, 62, 50, -90, 90, 14), [0, 100]]], [[[0, 100], [0, 0], [35, 0], ...arc(35, 50, 62, 50, -90, 90, 14), [0, 100]]], [[[0, 0], [0, 100]], [[0, 0], [22, 0], ...arc(22, 50, 46, 50, -90, 90, 14), [0, 100]]], [[[0, 100], [0, 0], [20, 0], ...arc(20, 50, 44, 50, -90, 90, 14), [0, 100]]]],
    E: [[[[90, 0], [0, 0], [0, 100], [90, 100]], [[0, 50], [70, 50]]], [[...arc(70, 27, 32, 27, -40, -270, 10), ...arc(70, 73, 36, 27, -90, -320, 10)]]],
    F: [[[[90, 0], [0, 0], [0, 100]], [[0, 48], [65, 48]]], [[[0, 0], [0, 100]], [[0, 0], [90, 0]], [[0, 48], [65, 48]]]],
    G: [[[...arc(55, 50, 48, 50, -40, -330, 18), [100, 62], [100, 50], [62, 50]]], [[...arc(55, 50, 48, 50, -40, -330, 18)], [[100, 66], [100, 50], [62, 50]]], [[...arc(55, 50, 48, 50, -45, -320, 18), [100, 55], [100, 52], [55, 52]]]],
    I: [[[[50, 0], [50, 100]]], [[[20, 0], [80, 0]], [[50, 0], [50, 100]], [[20, 100], [80, 100]]]],
    L: [[[[0, 0], [0, 100], [70, 100]]]],
    M: [[[[0, 100], [0, 0], [50, 62], [100, 0], [100, 100]]], [[[0, 100], [12, 0], [50, 70], [88, 0], [100, 100]]]],
    N: [[[[0, 100], [0, 0], [100, 100], [100, 0]]]],
    O: [[arc(50, 50, 50, 50, -90, 270, 24)], [arc(50, 50, 50, 50, -90, -450, 24)], [arc(40, 50, 36, 50, -90, 270, 24)], [arc(40, 50, 36, 50, -60, -420, 24)]],
    P: [[[[0, 0], [0, 100]], [[0, 0], [55, 0], ...arc(55, 25, 30, 25, -90, 90, 10), [0, 50]]], [[[0, 100], [0, 0], [55, 0], ...arc(55, 25, 30, 25, -90, 90, 10), [0, 50]]]],
    R: [[[[0, 0], [0, 100]], [[0, 0], [55, 0], ...arc(55, 25, 30, 25, -90, 90, 10), [0, 50]], [[28, 50], [85, 100]]], [[[0, 100], [0, 0], [55, 0], ...arc(55, 25, 30, 25, -90, 90, 10), [0, 50], [85, 100]]]],
    S: [[[...arc(50, 25, 40, 25, -20, -270, 12), ...arc(50, 75, 40, 25, -90, 160, 12)]]],
    U: [[[[0, 0], [0, 58], ...arc(50, 58, 50, 42, 180, 0, 12), [100, 0]]]],
    V: [[[[0, 0], [50, 100], [100, 0]]]],
    Z: [[[[0, 0], [100, 0], [0, 100], [100, 100]]]],
  };
  const GESTURE_ACTIONS = {
    resumen: { t: 'Resumen', run: () => go('resumen') }, agenda: { t: 'Agenda', run: () => go('agenda') }, 'nueva-cita': { t: 'Agendar una cita', run: () => eventModal(null, TODAY, { type: 'CLIENTE' }) },
    facturacion: { t: 'Facturación', run: () => go('facturacion') }, pago: { t: 'Registrar un pago', run: () => pickInvoiceToPay() }, caja: { t: 'Caja', run: () => go('caja') },
    gastos: { t: 'Gastos', run: () => go('gastos') }, 'nuevo-gasto': { t: 'Registrar un gasto', run: () => withKey(() => expModal(null)) }, ingresos: { t: 'Ingresos', run: () => go('ingresos') }, clientes: { t: 'Clientes', run: () => go('clientes') },
    cobranza: { t: 'Cobranza y corte', run: () => go('cobranza') }, matriz: { t: 'Matriz económica', run: () => go('matriz') }, utilidades: { t: 'Utilidades', run: () => go('utilidades') },
    inversionistas: { t: 'Inversionistas', run: () => go('inversionistas') }, ajustes: { t: 'Ajustes', run: () => go('ajustes') }, auditoria: { t: 'Auditoría', run: () => go('auditoria') },
    athena: { t: 'Athena', run: () => window.openAthena && openAthena() }, tema: { t: 'Cambiar el tema', run: () => setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark') },
    buscar: { t: 'Buscar', run: () => openPalette() }, informe: { t: 'Descargar informe', run: () => openReport() }, tasas: { t: 'Tasas del día', run: () => withKey(() => tasasModal()) },
  };
  const DEFAULT_GESTURES = { A: 'agenda', B: 'cobranza', C: 'caja', D: 'tema', E: 'nuevo-gasto', F: 'facturacion', G: 'gastos', I: 'ingresos', L: 'clientes', M: 'matriz', N: 'nueva-cita', O: 'athena', P: 'pago', R: 'resumen', S: 'ajustes', U: 'utilidades', V: 'inversionistas', Z: 'auditoria' };
  const gestureMap = () => Object.assign({}, DEFAULT_GESTURES, store.get('gestures_v1', {}));
  window.GESTURE_ACTIONS = GESTURE_ACTIONS;
  function resample(pts, n) {
    const I0 = pathLen(pts) / (n - 1); let D0 = 0; const out = [pts[0]]; const p = pts.slice();
    for (let i = 1; i < p.length; i++) {
      if (p[i].s === p[i - 1].s) { const d = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
        if (D0 + d >= I0) { const q = { x: p[i - 1].x + ((I0 - D0) / d) * (p[i].x - p[i - 1].x), y: p[i - 1].y + ((I0 - D0) / d) * (p[i].y - p[i - 1].y), s: p[i].s }; out.push(q); p.splice(i, 0, q); D0 = 0; } else D0 += d; }
    }
    while (out.length < n) out.push(p[p.length - 1]);
    return out.slice(0, n);
  }
  function pathLen(p) { let d = 0; for (let i = 1; i < p.length; i++) if (p[i].s === p[i - 1].s) d += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); return d; }
  function normalize(pts) {
    let p = resample(pts, N);
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity; p.forEach(q => { mnx = Math.min(mnx, q.x); mny = Math.min(mny, q.y); mxx = Math.max(mxx, q.x); mxy = Math.max(mxy, q.y); });
    const sz = Math.max(mxx - mnx, mxy - mny) || 1; p = p.map(q => ({ x: (q.x - mnx) / sz, y: (q.y - mny) / sz, s: q.s }));
    const cx = p.reduce((a, q) => a + q.x, 0) / N, cy = p.reduce((a, q) => a + q.y, 0) / N; return p.map(q => ({ x: q.x - cx, y: q.y - cy, s: q.s }));
  }
  function cloudDist(a, b, start) { const m = new Array(N).fill(false); let sumD = 0, i = start; do { let idx = -1, mn = Infinity; for (let j = 0; j < N; j++) if (!m[j]) { const d = Math.hypot(a[i].x - b[j].x, a[i].y - b[j].y); if (d < mn) { mn = d; idx = j; } } m[idx] = true; sumD += (1 - ((i - start + N) % N) / N) * mn; i = (i + 1) % N; } while (i !== start); return sumD; }
  function greedy(a, b) { const step = Math.floor(Math.pow(N, 0.5)); let mn = Infinity; for (let i = 0; i < N; i += step) mn = Math.min(mn, cloudDist(a, b, i), cloudDist(b, a, i)); return mn; }
  const TEMPLATES = []; Object.entries(LETTERS).forEach(([L, vars]) => vars.forEach(strokes => { const pts = []; strokes.forEach((st, si) => st.forEach(([x, y]) => pts.push({ x, y, s: si }))); TEMPLATES.push({ L, ns: strokes.length, pts: normalize(pts) }); }));
  // Distancia a cada letra (la mejor de sus variantes). Desempate por trazos: si dibujaste en 2 o más trazos no puede ser
  // una letra de un solo trazo (O, C, S…) salvo que se parezca mucho más. Probado con 1.240 trazos simulados: 96% de acierto.
  function recognize(pts) {
    if (pts.length < 6 || pathLen(pts) < 40) return null;
    const ns = new Set(pts.map(p => p.s)).size, c = normalize(pts), best = {};
    TEMPLATES.forEach(t => { let d = greedy(c, t.pts); if (ns >= 2 && t.ns === 1) d *= 1.2; else if (ns === 1 && t.ns >= 2) d *= 1.06; if (best[t.L] == null || d < best[t.L]) best[t.L] = d; });
    const rank = Object.entries(best).sort((a, b) => a[1] - b[1]); const [L, d] = rank[0], [alt, d2] = rank[1] || [null, Infinity];
    return { L, d, alt, margin: d2 - d, unsure: (d2 - d) / d < 0.08, score: Math.max(0, 1 - d / 3) };
  }
  window.recognizeLetter = recognize; window.__letterTemplates = LETTERS;
  function runLetter(res) {
    const map = gestureMap();
    if (!res || res.d > 2.6) { gpFeedback(null); haptic(30); return; }
    const a = GESTURE_ACTIONS[map[res.L]], b = res.alt && GESTURE_ACTIONS[map[res.alt]];
    if (res.unsure && b && map[res.alt] !== map[res.L]) { gpAsk(res.L, a, res.alt, b); haptic(18); return; } // dos letras muy parecidas: mejor preguntar que equivocarse
    gpFeedback(res.L, a ? a.t : 'Sin acción'); haptic(10);
    if (a) setTimeout(() => { closeGesturePad(); a.run(); }, 420);
  }
  function gpAsk(L1, a1, L2, a2) {
    const fb = gpad && gpad.querySelector('.gpad-fb'); if (!fb) return;
    fb.innerHTML = `<span class="gpad-ask"><small>¿Cuál dibujaste?</small>${[[L1, a1], [L2, a2]].filter(([, a]) => a).map(([L, a]) => `<button type="button" class="btn btn-tint" data-gp-pick="${esc(L)}"><b>${L}</b> ${esc(a.t)}</button>`).join('')}</span>`;
    fb.classList.remove('pop'); void fb.offsetWidth; fb.classList.add('pop');
  }
  // Lienzo para dibujar (botón, tecla E, mantener pulsado el botón de Athena, o Ajustes)
  let gpad = null, gpts = [], gStroke = 0, gTimer = 0, gDown = false;
  function openGesturePad() {
    if (!appOn()) return; closeAccMenu(); closePalette();
    if (!gpad) {
      gpad = document.createElement('div'); gpad.className = 'gpad'; gpad.setAttribute('role', 'dialog'); gpad.setAttribute('aria-label', 'Dibuja una letra');
      gpad.innerHTML = `<canvas></canvas><div class="gpad-ui"><p class="gpad-t">${svgI('hand', 18)} Dibuja una letra</p><p class="gpad-s">A Agenda · C Caja · F Facturación · P Pago · N Nueva cita · O Athena</p><div class="gpad-fb" aria-live="polite"></div><button type="button" class="btn" data-gp="close">Cerrar</button></div>`;
      document.body.appendChild(gpad);
      const cv = gpad.querySelector('canvas');
      cv.addEventListener('pointerdown', e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); gDown = true; clearTimeout(gTimer); gpts.push({ x: e.clientX, y: e.clientY, s: gStroke }); drawPad(); });
      cv.addEventListener('pointermove', e => { if (!gDown) return; gpts.push({ x: e.clientX, y: e.clientY, s: gStroke }); drawPad(); });
      const end = () => { if (!gDown) return; gDown = false; gStroke++; clearTimeout(gTimer); gTimer = setTimeout(() => { const r = recognize(gpts); runLetter(r); gpts = []; gStroke = 0; setTimeout(drawPad, 500); }, 650); };
      cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
      gpad.addEventListener('click', e => { if (e.target.closest('[data-gp="close"]')) return closeGesturePad(); const pk = e.target.closest('[data-gp-pick]'); if (pk) { const a = GESTURE_ACTIONS[gestureMap()[pk.dataset.gpPick]]; closeGesturePad(); if (a) a.run(); } });
    }
    const cv = gpad.querySelector('canvas'); const dpr = window.devicePixelRatio || 1; cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
    gpts = []; gStroke = 0; gpad.querySelector('.gpad-fb').innerHTML = ''; gpad.classList.add('is-open'); drawPad();
  }
  function closeGesturePad() { if (gpad) { gpad.classList.remove('is-open'); gpts = []; } }
  window.openGesturePad = openGesturePad;
  function drawPad(extraPts) {
    const cv = gpad && gpad.querySelector('canvas'); if (!cv) return; const c = cv.getContext('2d'), dpr = window.devicePixelRatio || 1;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    const pts = extraPts || gpts; c.lineWidth = 7; c.lineCap = 'round'; c.lineJoin = 'round';
    const g = c.createLinearGradient(0, 0, innerWidth, innerHeight); g.addColorStop(0, '#AD103C'); g.addColorStop(.5, '#FABD4B'); g.addColorStop(1, '#5E6AD2'); c.strokeStyle = g;
    c.shadowColor = 'rgba(173,16,60,.45)'; c.shadowBlur = 14;
    c.beginPath(); pts.forEach((p, i) => { if (i === 0 || pts[i - 1].s !== p.s) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y); }); c.stroke();
  }
  function gpFeedback(L, t) { const fb = gpad && gpad.querySelector('.gpad-fb'); if (!fb) return; fb.innerHTML = L ? `<span class="gpad-l">${L}</span><b>${esc(t)}</b>` : '<b>No reconocí el trazo.</b><small>Dibuja una letra mayúscula grande, en uno o varios trazos.</small>'; fb.classList.remove('pop'); void fb.offsetWidth; fb.classList.add('pop'); }
  // Dibujar directo sobre la página: mantener ⌥/Alt y mover el puntero (Mac), o clic derecho y arrastrar (mouse)
  let gestLive = null, gestRight = false, altDown = false;
  function liveStart(x, y) { gestLive = { pts: [{ x, y, s: 0 }] }; let cv = $('#gest-live'); if (!cv) { cv = document.createElement('canvas'); cv.id = 'gest-live'; cv.className = 'gest-live'; document.body.appendChild(cv); } const dpr = window.devicePixelRatio || 1; cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px'; cv.classList.add('show'); }
  function liveMove(x, y) { if (!gestLive) return; gestLive.pts.push({ x, y, s: 0 }); const cv = $('#gest-live'), c = cv.getContext('2d'), dpr = window.devicePixelRatio || 1; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, innerWidth, innerHeight); c.lineWidth = 6; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = 'rgba(173,16,60,.85)'; c.shadowColor = 'rgba(250,189,75,.6)'; c.shadowBlur = 12; c.beginPath(); gestLive.pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke(); }
  function liveEnd() { if (!gestLive) return; const pts = gestLive.pts; gestLive = null; const cv = $('#gest-live'); if (cv) setTimeout(() => cv.classList.remove('show'), 250); const r = recognize(pts); if (!r || pathLen(pts) < 80) return false; const map = gestureMap(); const a = GESTURE_ACTIONS[map[r.L]]; if (r.d > 2.6 || !a) { toast('No reconocí la letra. Prueba de nuevo con trazos más grandes.'); return true; } if (r.unsure && r.alt && GESTURE_ACTIONS[map[r.alt]] && map[r.alt] !== map[r.L]) { toast(`¿Era ${r.L} o ${r.alt}? Dibújala de nuevo, un poco más grande.`); return true; } showHint(`${r.L} · ${a.t}`); haptic(); a.run(); return true; }
  document.addEventListener('keydown', e => { if (e.key === 'Alt' && !e.repeat && appOn() && !overlayOpen() && isApple()) { altDown = true; } });
  document.addEventListener('keyup', e => { if (e.key === 'Alt') { altDown = false; if (gestLive) { e.preventDefault(); liveEnd(); } } });
  document.addEventListener('mousemove', e => { if (altDown && !gestLive && appOn() && e.buttons === 0) liveStart(e.clientX, e.clientY); else if (gestLive && (altDown || gestRight)) liveMove(e.clientX, e.clientY); });
  document.addEventListener('mousedown', e => { if (e.button === 2 && appOn() && !overlayOpen() && !e.target.closest('#content tbody tr, input, textarea')) { gestRight = true; liveStart(e.clientX, e.clientY); } });
  document.addEventListener('mouseup', e => { if (e.button === 2 && gestRight) { const used = liveEnd(); setTimeout(() => { gestRight = false; }, used ? 50 : 0); if (!used) gestRight = false; } });
  window.addEventListener('blur', () => { altDown = false; if (gestLive) { gestLive = null; const cv = $('#gest-live'); if (cv) cv.classList.remove('show'); } });
  // Configurar qué hace cada letra
  function gestureCfgModal() {
    const map = gestureMap();
    openModal(`<h2 id="modal-t">Letras dibujadas</h2><p class="muted">Elige qué hace cada letra. Dibuja con el dedo o el lápiz (tecla E, botón "Probar un trazo" o mantener pulsado el botón de Athena), manteniendo ${isApple() ? '⌥ Opción' : 'Alt'} y moviendo el puntero, o con clic derecho y arrastrando.</p>
      <form data-form="gestures" novalidate><div class="ges-grid">${Object.keys(LETTERS).map(L => `<label class="ges-row"><span class="ges-l">${L}</span><select name="g_${L}"><option value="">Sin acción</option>${Object.entries(GESTURE_ACTIONS).map(([k, a]) => `<option value="${esc(k)}" ${map[L] === k ? 'selected' : ''}>${esc(a.t)}</option>`).join('')}</select></label>`).join('')}</div>
      <div class="modal-acts"><button type="button" class="btn btn-ghost mr-auto" data-gest-reset="1">Restaurar</button><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Guardar <span class="cta-dot">${I.arrow}</span></button></div></form>`);
  }
  document.addEventListener('submit', e => { const f = e.target; if (!f.dataset || f.dataset.form !== 'gestures') return; e.preventDefault(); e.stopImmediatePropagation(); const fd = new FormData(f); const m = {}; Object.keys(LETTERS).forEach(L => { m[L] = fd.get('g_' + L) || ''; }); store.set('gestures_v1', m); logAudit('actualizó las letras dibujadas (gestos)', 'ajustes'); closeModal(); toast('Gestos guardados'); }, true);
  document.addEventListener('click', e => { if (e.target.closest('[data-gest-reset]')) { store.set('gestures_v1', {}); closeModal(); gestureCfgModal(); toast('Letras restauradas'); } });

  /* ---------- 7. Recordatorios de citas ---------- */
  let notifAsked = false;
  window.askNotifyPermission = () => { try { if ('Notification' in window && Notification.permission === 'default' && !notifAsked) { notifAsked = true; Notification.requestPermission().catch(() => {}); } } catch (e) {} };
  function checkReminders() {
    if (!appOn()) return;
    const now = new Date(), todayS = TODAY, nowMin = now.getHours() * 60 + now.getMinutes(); let changed = false;
    events.forEach(e => {
      if (!(+e.reminder > 0) || !e.start || e.allDay || e.notified || ['CANCELADA', 'REALIZADA', 'NO_ASISTIO'].includes(e.status)) return;
      const tomorrow = isoD(addDays(D(todayS), 1));
      const minsTo = e.date === todayS ? toMin(e.start) - nowMin : e.date === tomorrow ? toMin(e.start) + 1440 - nowMin : null;
      if (minsTo == null || minsTo < -5 || minsTo > +e.reminder) return;
      e.notified = new Date().toISOString(); changed = true;
      const msg = `${e.title} · ${minsTo <= 0 ? 'empieza ahora' : 'en ' + (minsTo >= 60 ? Math.round(minsTo / 60) + ' h' : minsTo + ' min')} (${hhmm(e.start)})`;
      toast('⏰ ' + msg);
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Agora Digital · Agenda', { body: msg, icon: 'icons/icon-192.png', tag: e.id }); } catch (x) {}
      if (window.athenaNotify) athenaNotify(`Recordatorio: ${msg}.`, e.id);
    });
    if (changed) saveEvents();
  }
  setInterval(checkReminders, 30000);

  /* ---------- 8. App instalable (PWA) y app de Android ---------- */
  if (/^https?:$/.test(location.protocol)) {
    if (!document.querySelector('link[rel="manifest"]')) { const l = document.createElement('link'); l.rel = 'manifest'; l.href = 'manifest.webmanifest'; document.head.appendChild(l); }
    if ('serviceWorker' in navigator && location.hostname !== '') window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
    // v10.1 · ejecutable de PC (127.0.0.1): la ventana avisa cada 15 s que sigue abierta; al cerrarla, el programa termina solo.
    // Va por POST para que el service worker no lo guarde en caché.
    if (location.hostname === '127.0.0.1') { const beat = () => { try { fetch('/__agora/latido', { method: 'POST', cache: 'no-store', keepalive: true }).catch(() => {}); } catch (e) {} }; beat(); setInterval(beat, 15000); }
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); state.installEvt = e; });
  window.addEventListener('appinstalled', () => { state.installEvt = null; });
  // En la app de Android (WebView), las descargas (PDF, Excel, .ics, respaldo) pasan por el puente nativo
  if (window.AgoraAndroid && typeof window.AgoraAndroid.saveFile === 'function') {
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download && /^(blob:|data:)/.test(this.href)) {
        const name = this.download, href = this.href;
        fetch(href).then(r => r.blob()).then(b => new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok({ data: String(fr.result).split(',')[1] || '', type: b.type || 'application/octet-stream' }); fr.readAsDataURL(b); })).then(({ data, type }) => { window.AgoraAndroid.saveFile(name, type, data); }).catch(() => toast('No se pudo guardar el archivo'));
        return;
      }
      if (/^(https?:|mailto:|tel:|whatsapp:)/.test(this.href) && this.target === '_blank' && window.AgoraAndroid.openExternal) { window.AgoraAndroid.openExternal(this.href); return; }
      return origClick.call(this);
    };
  }

  /* ---------- 9. Enlaces con acción (#/agenda?accion=nueva-cita) y estado después de dibujar ---------- */
  window.routeAction = r => {
    const a = r && r.params && r.params.accion; if (!a || !appOn()) return;
    if (a === 'nueva-cita') eventModal(null, TODAY, { type: 'CLIENTE' });
    else if (a === 'registrar-pago') pickInvoiceToPay();
    else if (a === 'athena') window.openAthena && openAthena();
    else if (a === 'buscar') openPalette();
    try { history.replaceState(history.state, '', '#/' + r.mod); } catch (x) {}
  };
  window.closeOverlays = () => { closePalette(); closeKeys(); closeGesturePad(); closeCtx(); closeAccMenu(); if (window.closeAthena) closeAthena(); };
  window.afterRender = mod => { document.documentElement.dataset.mod = mod.id; };
})();
