/* Agora Digital App · v11 · modo servidor
   ---------------------------------------------------------------------------------------------
   En la edición con servidor (Hostinger) los datos viven en la base de datos y no en el navegador.
   Este archivo se carga ANTES que app.js y:
   · muestra el acceso (correo y clave) y las invitaciones;
   · trae los datos del servidor y conecta un "localStorage" en memoria que guarda en el servidor (por lotes, con versión);
   · pide un motivo escrito para anular, emitir notas y reabrir un mes;
   · deja a app.js el puente window.AGORA_SRV (facturación fiscal, cuenta, personas, cierres, seguridad, exportar).
   Todo el texto va escapado con esc(); los scripts solo corren con el nonce de la página (CSP). */
(function () {
  'use strict';

  // ================================================================== 0. arranque
  const bootEl = document.getElementById('agora-arranque');
  let BOOT = {};
  try { BOOT = JSON.parse((bootEl && bootEl.textContent) || '{}') || {}; } catch (e) { BOOT = {}; }
  const NONCE = (document.currentScript && document.currentScript.nonce) || '';
  window.AGORA_NONCE = NONCE;
  const API = BOOT.api || '/api/v1';
  let S = BOOT.sesion || null; // sesión del servidor (usuario, empresa, csrf, permisos…)
  let realLS = null;
  try { realLS = window.localStorage; } catch (e) { realLS = null; }

  // ================================================================== 1. utilidades
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const mesTxt = p => { const [y, m] = String(p).split('-'); return (MESES[+m - 1] || p) + ' ' + y; };
  const dmy = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
  const fmtN = (n, d = 2) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const usd = n => 'US$ ' + fmtN(n);
  const bs = n => 'Bs. ' + fmtN(n);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const can = p => !!(S && S.usuario && (S.usuario.permisos || []).includes(p));
  // estado de app.js (const global de otro script: se lee por nombre cuando ya cargó)
  const appState = () => { try { return typeof state !== 'undefined' ? state : null; } catch (e) { return null; } };
  const reduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const tap = (ms = 8) => { try { if (window.agoraHaptic) window.agoraHaptic(ms); else if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };
  function say(msg, tone) {
    if (typeof window.toast === 'function') { window.toast(msg, tone); return; }
    const t = document.getElementById('toast'); if (!t) return;
    t.textContent = msg; t.classList.toggle('is-bad', tone === 'bad'); t.classList.add('show'); clearTimeout(say.t); say.t = setTimeout(() => t.classList.remove('show'), 4200);
  }
  const ICO = {
    mail: '<path d="M4 6h16v12H4z"/><path d="M4 7l8 6 8-6"/>',
    wa: '<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/><path d="M9.5 9.5c.4 1.8 1.7 3.2 3.5 3.9l1.2-1.1 1.8.8-.4 1.6c-3 .4-6.7-3.1-6.8-6.4l1.6-.4.8 1.8z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    arrow: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  };
  const ic = (k, s = 18) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[k] || ''}</svg>`;

  // ================================================================== 2. API
  class ApiError extends Error {
    constructor(status, data) { super((data && data.mensaje) || (status ? 'El servidor respondió ' + status : 'Sin conexión con el servidor.')); this.status = status; this.code = (data && data.error) || (status ? 'ERROR' : 'SIN_CONEXION'); this.data = data || {}; }
  }
  async function rawFetch(method, path, body, o) {
    const h = { Accept: 'application/json' };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (S && S.csrf) h['X-CSRF-Token'] = S.csrf;
    if (o.etag) h['If-None-Match'] = o.etag;
    let res;
    try {
      res = await fetch(API + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: 'same-origin', cache: 'no-store', redirect: 'error', keepalive: !!o.keepalive });
    } catch (e) { return { status: 0, data: null, headers: null }; }
    if (res.status === 304) return { status: 304, data: null, headers: res.headers };
    const ct = res.headers.get('content-type') || '';
    let data = null;
    if (o.raw && !ct.includes('application/json')) data = await res.text();
    else if (ct.includes('application/json')) data = await res.json().catch(() => null);
    else data = await res.text().catch(() => '');
    return { status: res.status, data, headers: res.headers };
  }
  /** Llama a la API. Si está ocupado (503/429 en horas pico), las lecturas esperan lo que pide Retry-After y reintentan solas. */
  async function api(method, path, body, o = {}) {
    let busy = 0;
    for (let i = 0; i < 7; i++) {
      const r = await rawFetch(method, path, body, o);
      const wait = r.headers ? Math.min(30, +r.headers.get('retry-after') || 0) : 0;
      if ((r.status === 503 || r.status === 429) && method === 'GET' && !o.keepalive && busy < 2 && wait > 0 && wait <= 6) { busy++; await sleep(wait * 1000 + Math.random() * 800); continue; }
      if (r.status === 401 && !o.public) { onSessionLost(); throw new ApiError(401, r.data); }
      if (r.status === 0 || r.status >= 400) { const err = new ApiError(r.status, r.data); err.retryAfter = wait; throw err; }
      return r;
    }
    throw new ApiError(503, { mensaje: 'El servidor está ocupado. Intenta de nuevo.' });
  }
  const get = (p, o) => api('GET', p, undefined, o).then(r => r.data);
  const post = (p, b = {}, o) => api('POST', p, b, o).then(r => r.data);
  const put = (p, b = {}, o) => api('PUT', p, b, o).then(r => r.data);
  const del = (p, o) => api('DELETE', p, undefined, o).then(r => r.data);
  window.agoraApi = { get, post, put, del };

  // ================================================================== 3. hoja propia (motivo, avisos) sobre todo lo demás
  function sheet(html, { wide = false, onClose } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'srv-sheet'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML = `<div class="srv-sheet-card${wide ? ' is-wide' : ''}"><button type="button" class="icon-btn srv-x" aria-label="Cerrar">${ic('x', 18)}</button><div class="srv-sheet-b">${html}</div></div>`;
    document.body.appendChild(wrap);
    const prev = document.activeElement;
    requestAnimationFrame(() => wrap.classList.add('is-open'));
    const close = (why) => { wrap.classList.remove('is-open'); setTimeout(() => wrap.remove(), reduce() ? 0 : 180); if (prev && prev.isConnected) try { prev.focus({ preventScroll: true }); } catch (e) {} if (onClose) onClose(why); };
    wrap.querySelector('.srv-x').addEventListener('click', () => close('x'));
    wrap.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close('esc'); } });
    const f = wrap.querySelector('input:not([type=hidden]):not([disabled]),textarea,select,button.btn-cta'); if (f) setTimeout(() => f.focus(), 30);
    return { el: wrap, body: wrap.querySelector('.srv-sheet-b'), close };
  }


  // ================================================================== 4. almacenamiento: localStorage en memoria que guarda en el servidor
  const LOCAL_ONLY = new Set(['agora_fin_sess', 'agora_fin_acc_v1', 'agora_fin_key_hash', 'agora_fin_key_kdf_v1', 'agora_fin_login_tries', 'agora_fin_audit_anchor_v1', 'agora-facturas-v1', 'agora-factura-v2', 'agora-correlativos-v1', 'agora-formato-v1', 'agora-facturacion', 'agora_fin_fact_sig', 'agora_fin_role']);
  const DERIVED = new Set(['agora_fin_imported_v1']);
  const MIRROR = new Set(['agora_fin_theme', 'agora_fin_accent', 'agora_fin_nav_v1']); // también en el navegador (para pintar el tema antes de cargar)
  const mem = new Map();
  let versions = {};
  let FACT = []; // facturas emitidas (para la app)
  let closed = new Set();
  let etag = '';
  const dirty = new Map();
  let auditQ = [];
  const auditSent = new Set();
  let flushT = 0, flushing = null, backoff = 0, offline = false;
  const pendKey = () => S && S.usuario && S.empresa ? `agora_srv_pend_${S.empresa.uid}_${S.usuario.uid}` : null;

  const shim = {
    getItem(k) { k = String(k); return mem.has(k) ? mem.get(k) : null; },
    setItem(k, v) { k = String(k); v = String(v); if (mem.get(k) === v) return; mem.set(k, v); track(k, v); },
    removeItem(k) { k = String(k); if (!mem.has(k)) return; mem.delete(k); track(k, null); },
    key(i) { return Array.from(mem.keys())[i] ?? null; },
    get length() { return mem.size; },
    clear() { Array.from(mem.keys()).forEach(k => shim.removeItem(k)); },
  };
  function track(k, v) {
    if (!(k.startsWith('agora_fin_') || k.startsWith('agora-'))) return;
    if (MIRROR.has(k) && realLS) { try { if (v === null) realLS.removeItem(k); else realLS.setItem(k, v); } catch (e) {} }
    if (LOCAL_ONLY.has(k) || DERIVED.has(k)) return;
    if (k === 'agora_fin_audit') { queueAudit(v); return; }
    dirty.set(k, v); persistPending(); schedule();
  }
  function queueAudit(raw) {
    let list = []; try { list = JSON.parse(raw || '[]') || []; } catch (e) { return; }
    for (const a of list) { if (!a || a.srv || !a.id || auditSent.has(a.id)) continue; auditSent.add(a.id); auditQ.push({ id: a.id, module: a.module, action: a.action || a.text }); }
    if (auditQ.length) schedule();
  }
  function schedule(ms = 450) { clearTimeout(flushT); flushT = setTimeout(() => flush(), ms); }
  function persistPending() {
    const k = pendKey(); if (!k || !realLS) return;
    try { if (dirty.size) realLS.setItem(k, JSON.stringify({ t: Date.now(), cambios: Object.fromEntries(dirty), versiones: versions })); else realLS.removeItem(k); } catch (e) {}
  }
  /** Envía los cambios pendientes en un solo lote (todo o nada en el servidor) */
  function flush(o = {}) {
    if (flushing) { schedule(300); return flushing; }
    if (!dirty.size && !auditQ.length) return Promise.resolve();
    const changes = {}; const bases = {};
    for (const [k, v] of dirty) { changes[k] = v; if (versions[k] != null) bases[k] = versions[k]; }
    const sentA = auditQ.splice(0, 30);
    if (sentA.length) changes.agora_fin_audit = JSON.stringify(sentA);
    const sentKeys = [...dirty.keys()];
    dirty.clear();
    setSync('guardando');
    flushing = api('PUT', '/datos', { cambios: changes, versiones: bases }, { keepalive: !!o.keepalive }).then(r => {
      const d = r.data || {};
      Object.assign(versions, d.versiones || {});
      if (d.etag) etag = d.etag;
      const merged = [];
      for (const [k, v] of Object.entries(d.actualizados || {})) {
        if (k === 'agora_fin_audit') continue; // la app ya tiene sus acciones; la lista del servidor llega al recargar
        if (!dirty.has(k)) { mem.set(k, v); if (k !== 'agora_fin_pagos_v1') merged.push(k); }
      }
      backoff = 0; offline = false; persistPending(); setSync('ok');
      if (merged.length) banner('Otra persona cambió estos datos al mismo tiempo: se combinaron los cambios.', 'Ver lo actualizado', () => location.reload());
    }).catch(e => {
      // sin conexión, servidor ocupado (503/429) o falla pasajera (5xx): el servidor no guardó nada (todo o nada),
      // así que los cambios vuelven a la cola y se reintenta con espera creciente; no se pierde nada
      if ((e.status === 0 || e.status === 429 || e.status >= 500)) {
        for (const k of sentKeys) if (!dirty.has(k)) dirty.set(k, changes[k]);
        auditQ.unshift(...sentA); offline = e.status === 0; persistPending(); setSync(e.status === 0 ? 'sin-conexion' : 'ocupado');
        backoff = Math.min(60000, Math.max((backoff || 2000) * 2, (e.retryAfter || 0) * 1000)); schedule(backoff + Math.round(Math.random() * 1500)); return;
      }
      if (e.status === 401) { for (const k of sentKeys) if (!dirty.has(k)) dirty.set(k, changes[k]); auditQ.unshift(...sentA); persistPending(); return; }
      // el servidor rechazó el lote (mes cerrado, cobro inmutable, dato inválido…): se vuelve a lo guardado
      dirty.clear(); persistPending(); setSync('ok');
      flash('No se guardó: ' + e.message);
      setTimeout(() => location.reload(), 60);
    }).finally(() => { flushing = null; if (dirty.size || auditQ.length) schedule(800); });
    return flushing;
  }
  /** Mensaje que se muestra después de recargar */
  function flash(msg) { try { sessionStorage.setItem('agora_srv_flash', msg); } catch (e) { say(msg, 'bad'); } }
  function showFlash() { try { const m = sessionStorage.getItem('agora_srv_flash'); if (m) { sessionStorage.removeItem('agora_srv_flash'); setTimeout(() => say(m, 'bad'), 700); } } catch (e) {} }

  /** Trae los datos. Devuelve las claves que cambiaron (null si nada cambió). */
  async function pull(first = false) {
    const r = await api('GET', '/datos', undefined, { etag: first ? '' : etag });
    if (r.status === 304) return null;
    const d = r.data || {};
    etag = (r.headers && r.headers.get('etag')) || etag;
    const changed = [];
    for (const [k, v] of Object.entries(d.datos || {})) { if (dirty.has(k)) continue; if (mem.get(k) !== v) { changed.push(k); mem.set(k, v); if (MIRROR.has(k) && realLS) { try { realLS.setItem(k, v); } catch (e) {} } } }
    if (!first) for (const k of Array.from(mem.keys())) { if (!(k in (d.datos || {})) && !LOCAL_ONLY.has(k) && !DERIVED.has(k) && !dirty.has(k) && versions[k] != null) { mem.delete(k); changed.push(k); } }
    versions = Object.assign(versions, d.versiones || {});
    const factSig = JSON.stringify(d.facturas || []);
    if (factSig !== JSON.stringify(FACT)) { FACT = d.facturas || []; changed.push('facturas'); }
    closed = new Set(d.cerrados || []);
    if (S) { S.cerrados = d.cerrados || []; if (d.edicion_hasta !== undefined) S.edicion_hasta = d.edicion_hasta; }
    return changed;
  }

  // ================================================================== 5. aviso discreto (arriba) y estado de guardado
  function banner(msg, action, fn) {
    let b = $('.srv-banner'); if (!b) { b = document.createElement('div'); b.className = 'srv-banner'; b.setAttribute('role', 'status'); document.body.appendChild(b); }
    b.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button" class="btn btn-sm">${esc(action)}</button>` : ''}<button type="button" class="icon-btn" aria-label="Cerrar">${ic('x', 14)}</button>`;
    if (action) b.querySelector('.btn').addEventListener('click', () => { b.classList.remove('show'); fn && fn(); });
    b.querySelector('.icon-btn').addEventListener('click', () => b.classList.remove('show'));
    requestAnimationFrame(() => b.classList.add('show'));
  }
  function setSync(st) {
    document.documentElement.dataset.srvSync = st;
    if (st === 'sin-conexion') banner('Sin conexión con el servidor. Tus cambios se guardarán apenas vuelva.', '', null);
    else if (st === 'ocupado') banner('El servidor está muy ocupado. Tus cambios están a salvo y se guardan en unos segundos.', '', null);
    else if (st === 'ok') { const b = $('.srv-banner'); if (b && /Sin conexión|muy ocupado/.test(b.textContent)) b.classList.remove('show'); }
  }

  // ================================================================== 6. acceso: entrar e invitación
  const docCache = {};
  const LOGO = '<svg viewBox="0 0 60 80" width="26" height="34" aria-hidden="true"><path fill="var(--iso,#AD103C)" d="M30 4 4 76h12l14-40 14 40h12z"/></svg>';
  function loginShell(title, sub, inner, foot = '') {
    const L = document.getElementById('login'); const A = document.getElementById('app');
    if (A) A.hidden = true;
    L.hidden = false; L.className = 'login v10';
    L.innerHTML = `<div class="lg2">
      <header class="lg2-top"><span class="lg2-logo">${LOGO}<b>Agora</b><small>Digital App</small></span></header>
      <main class="lg2-main">
        <section class="lg2-hero" aria-hidden="true"><div class="lg2-halo"></div><img class="lg2-athena" src="assets/img/athena-busto.webp" alt="" width="720" height="756" decoding="async"><div class="lg2-bubble"><span class="lg2-bn">Athena</span><b>Hola, soy Athena.</b> <span>Tus datos están protegidos en el servidor: clave y auditoría firmada.</span></div></section>
        <section class="lg2-card" aria-labelledby="lg-t"><p class="lg2-k">Finanzas y Operaciones</p><h1 id="lg-t">${title}</h1><p class="lg2-sub">${sub}</p>${inner}<p class="lg2-switch">${foot}</p></section>
      </main>
      <footer class="lg2-foot"><span>© ${new Date().getFullYear()} Agora Digital App · <b>Cada conversación, una oportunidad.</b></span><span>Conexión cifrada · Versión ${esc(BOOT.version_texto || BOOT.version || '')}</span></footer></div>`;
    const f = L.querySelector('input'); if (f) setTimeout(() => f.focus(), 40);
    return L;
  }
  const lgErr = (f, m) => { const p = f.querySelector('.lg-err'); if (!p) return; p.textContent = m || ''; p.hidden = !m; if (m && !reduce()) { const c = f.closest('.lg2-card'); if (c) { c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); } } };
  const busy = (f, on) => { const b = f.querySelector('button[type=submit]'); if (b) b.disabled = on; f.classList.toggle('is-busy', on); };
  const eyeBtn = '<button type="button" class="lg-eye" data-srv-eye aria-label="Mostrar la clave"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button>';
  document.addEventListener('click', e => { const b = e.target.closest('[data-srv-eye]'); if (!b) return; const i = b.closest('.lg-in').querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; b.setAttribute('aria-label', i.type === 'password' ? 'Mostrar la clave' : 'Ocultar la clave'); });

  function showLogin(msg = '', email = '') {
    const L = loginShell('Inicia sesión', 'Entra a las finanzas y operaciones de tu empresa.', `<form class="lg2-form" data-srv-login="clave" novalidate>
      <div class="lg2-group">
        <label class="lg2-f"><input name="correo" type="email" autocomplete="username" inputmode="email" placeholder=" " value="${esc(email)}"><span>Correo</span></label>
        <label class="lg2-f lg-in"><input name="clave" type="password" autocomplete="current-password" placeholder=" "><span>Clave</span>${eyeBtn}</label>
      </div>
      <label class="lg-rem"><input type="checkbox" name="recordar"> Recuérdame en este equipo (7 días)</label>
      <p class="lg-err" role="alert" ${msg ? '' : 'hidden'}>${esc(msg)}</p>
      <button class="lg2-btn" type="submit">Continuar<span class="lg2-arrow">${ic('arrow', 18)}</span></button></form>`, 'Tu acceso lo crea el administrador de tu empresa con una invitación.');
    if (email) { const k = L.querySelector('[name=clave]'); if (k) k.focus(); }
  }

  async function showInvitation(token) {
    let inv;
    try { inv = await get('/invitacion/' + encodeURIComponent(token), { public: true }); }
    catch (e) { history.replaceState(null, '', location.pathname); return showLogin(e.message); }
    loginShell('Te invitaron a ' + esc(inv.empresa), `Entrarás como <b>${esc(inv.rol_nombre)}</b> con el correo <b>${esc(inv.correo)}</b>.`, `<form class="lg2-form" data-srv-login="invitacion" novalidate>
      <div class="lg2-group">
        ${inv.existe ? '' : `<label class="lg2-f"><input name="nombre" autocomplete="name" placeholder=" "><span>Tu nombre y apellido</span></label>`}
        <label class="lg2-f lg-in"><input name="k1" type="password" autocomplete="${inv.existe ? 'current-password' : 'new-password'}" placeholder=" "><span>${inv.existe ? 'Tu clave actual de Agora' : 'Crea tu clave (mínimo 10 caracteres)'}</span>${eyeBtn}</label>
        ${inv.existe ? '' : '<label class="lg2-f"><input name="k2" type="password" autocomplete="new-password" placeholder=" "><span>Repite la clave</span></label>'}
      </div>
      <p class="lg-note">${inv.existe ? 'Ya tienes una cuenta con este correo: confirma tu clave para sumarte a esta empresa.' : 'Tu correo queda verificado con este enlace.'}</p>
      <p class="lg-err" role="alert" hidden></p>
      <button class="lg2-btn" type="submit">${inv.existe ? 'Unirme' : 'Crear mi acceso'}<span class="lg2-arrow">${ic('arrow', 18)}</span></button></form>`, '');
    $('[data-srv-login="invitacion"]').dataset.token = token;
  }

  document.addEventListener('submit', async e => {
    const f = e.target; const mode = f.dataset && f.dataset.srvLogin; if (!mode) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const fd = new FormData(f); const v = k => (fd.get(k) || '').toString();
    lgErr(f, ''); busy(f, true);
    try {
      if (mode === 'clave') {
        const correo = v('correo').trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo) || !v('clave')) { busy(f, false); return lgErr(f, 'Escribe tu correo y tu clave.'); }
        const r = await post('/acceso', { correo, clave: v('clave'), recordar: !!fd.get('recordar') }, { public: true });
        return afterLogin(r.sesion);
      }
      if (mode === 'invitacion') {
        const body = { token: f.dataset.token, clave: v('k1') };
        if (fd.has('nombre')) {
          if (v('nombre').trim().length < 2) { busy(f, false); return lgErr(f, 'Escribe tu nombre.'); }
          if (v('k1').length < 10) { busy(f, false); return lgErr(f, 'La clave debe tener al menos 10 caracteres.'); }
          if (v('k1') !== v('k2')) { busy(f, false); return lgErr(f, 'Las dos claves no coinciden.'); }
          body.nombre = v('nombre').trim();
        }
        const r = await post('/invitacion/aceptar', body, { public: true });
        history.replaceState(null, '', location.pathname + '#/resumen');
        if (r.paso === 'entrar') return showLogin(r.mensaje || '');
        return afterLogin(r.sesion);
      }
    } catch (x) {
      busy(f, false); lgErr(f, x.message);
    }
  }, true);

  // ================================================================== 7. sesión y carga de la app
  let appLoaded = false, lostShown = false;
  function afterLogin(sess) {
    if (appLoaded && S && sess && (sess.usuario.uid !== S.usuario.uid || (sess.empresa || {}).uid !== (S.empresa || {}).uid)) { S = sess; location.reload(); return; }
    S = sess; lostShown = false;
    if (appLoaded) { // la sesión había vencido con la app abierta: se sigue donde iba
      const L = document.getElementById('login'); L.hidden = true; L.innerHTML = ''; document.getElementById('app').hidden = false;
      $$('.srv-relogin').forEach(x => x.remove()); schedule(50); return;
    }
    start();
  }
  function onSessionLost() {
    if (lostShown) return; lostShown = true;
    if (!appLoaded) return showLogin('Tu sesión terminó. Vuelve a entrar.');
    persistPending();
    const email = S && S.usuario ? S.usuario.correo : '';
    showLogin('Tu sesión terminó (por inactividad o porque se cerró en otro equipo). Vuelve a entrar: tus cambios pendientes se guardan después.', email);
  }
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = false; if (NONCE) s.nonce = NONCE; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar ' + src)); document.body.appendChild(s); });
  }
  async function start() {
    const L = document.getElementById('login');
    L.hidden = false; L.className = 'login v10'; L.innerHTML = '<div class="srv-loading"><span class="srv-spin" aria-hidden="true"></span><p>Cargando tus datos…</p></div>';
    try { await pull(true); } catch (e) { if (e.status === 401) return showLogin('Tu sesión terminó. Vuelve a entrar.'); L.innerHTML = `<div class="srv-loading"><p>${esc(e.message)}</p><button class="btn" type="button">Reintentar</button></div>`; L.querySelector('button').addEventListener('click', () => start()); return; }
    // cambios que no alcanzaron a guardarse (sin conexión o sesión vencida) en este equipo
    const pk = pendKey();
    if (pk && realLS) { try { const p = JSON.parse(realLS.getItem(pk) || 'null'); if (p && p.cambios && Date.now() - p.t < 7 * 864e5) { for (const [k, v] of Object.entries(p.cambios)) { if (v === null) mem.delete(k); else mem.set(k, v); dirty.set(k, v); } schedule(1500); } } catch (e) {} }
    mem.set('agora_fin_role', JSON.stringify(S.usuario.rol || 'VENTAS'));
    mem.set('agora_fin_acc_v1', JSON.stringify({ email: S.usuario.correo, name: S.usuario.nombre, srv: true }));
    mem.set('agora_fin_imported_v1', JSON.stringify(FACT.map(f => ({ id: f.id, num: f.num, clientId: f.clientAppId, code: null, issueDate: f.issueDate, dueDate: f.dueDate, subtotal: f.subtotal, ivaRate: f.ivaRate, iva: f.iva, paidDate: null, lines: (f.lines || []).map(l => ({ productId: l.productId, amount: l.amount, rec: false, title: l.title })), updatedAt: f.updatedAt, src: 'srv', uid: f.uid }))));
    try { Object.defineProperty(window, 'localStorage', { configurable: true, get: () => shim }); } catch (e) { console.error('No se pudo conectar el almacenamiento del servidor', e); }
    window.AGORA_SRV = bridge;
    const ver = BOOT.version || '';
    try {
      let list = BOOT.scripts;
      if (!list) { try { list = JSON.parse(($('#agora-scripts') || {}).textContent || 'null'); } catch (e) { list = null; } }
      for (const src of (list || ['assets/js/app.js', 'assets/js/ecosistema.js', 'assets/js/athena.js'])) await loadScript(src + (src.includes('?') || /\.[0-9a-f]{8,}\.js$/.test(src) || !ver ? '' : '?v=' + ver));
      appLoaded = true;
    } catch (e) { L.innerHTML = `<div class="srv-loading"><p>${esc(e.message)}. Revisa tu conexión y recarga la página.</p></div>`; }
  }

  // ================================================================== 8. puente para app.js
  let auditState = { ok: true, n: 0, genesis: false, srv: true };
  async function refreshAudit() {
    if (!can('auditoria.ver')) return;
    try { const r = await get('/auditoria/verificar'); auditState = { ok: !!r.integra, n: r.registros || 0, genesis: false, srv: true }; if (appState() && appState().module === 'auditoria' && typeof window.render === 'function') window.render(); } catch (e) {}
  }
  async function logout() {
    try { await flush(); } catch (e) {}
    try { await post('/salir', {}); } catch (e) {}
    const pk = pendKey(); if (pk && realLS) try { realLS.removeItem(pk); } catch (e) {}
    location.replace(location.pathname + '#/resumen'); location.reload();
  }
  async function refresh() {
    try {
      await flush(); const ch = await pull();
      if (!ch || !ch.length) return say('Todo al día con el servidor');
      if (ch.every(k => k === 'facturas' || k === 'agora_fin_audit' || k === 'agora_fin_tasas_v1')) { if (window.agoraSrvSync) window.agoraSrvSync(); return say('Actualizado'); }
      location.reload();
    } catch (e) { say(e.message, 'bad'); }
  }
  const editUntil = () => (S && S.edicion_hasta ? Date.parse(S.edicion_hasta) : 0);
  function editModal() {
    if (!can('datos.escribir') && !can('agenda.escribir')) {
      return window.openModal(`<h2 id="modal-t">Solo lectura</h2><p class="muted">Tu rol (${esc(S.usuario.rol_nombre)}) puede ver la información, pero no cambiarla. Si necesitas editar, pídele el acceso a un Superadministrador.</p><div class="modal-acts"><button type="button" class="btn btn-cta" data-act="close">Entendido</button></div>`);
    }
    window.openModal(`<h2 id="modal-t">Abrir la edición</h2><p class="muted">Este cambio mueve los indicadores. Confirma con tu <b>clave de acceso</b>: la edición queda abierta 15 minutos y queda en la auditoría.</p>
      <form data-srv-form="edicion" novalidate><label class="fld"><span>Tu clave de acceso</span><input type="password" name="k" autocomplete="current-password"></label><p class="form-err" hidden></p>
      <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Abrir edición</button></div></form>`);
  }
  function exportData() {
    if (!can('exportar')) return say('Tu rol no permite exportar los datos de la empresa.', 'bad');
    (async () => {
      try {
        const r = await post('/exportar', {});
        const blob = new Blob([JSON.stringify(r, null, 1)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `agora-exportacion-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
        say('Exportación descargada (se avisó por correo a los administradores)');
      } catch (e) { say(e.message, 'bad'); }
    })();
  }
  function importModal() {
    if (!can('importar')) return say('Solo un Superadministrador puede importar datos.', 'bad');
    window.openModal(`<h2 id="modal-t">Importar la edición local</h2><p class="muted">Carga el respaldo (.json) que descargaste en la edición local (HTML o PC). Las facturas entran como documentos <b>históricos</b> (no se vuelven a emitir) y el correlativo sigue desde la última. Los cobros pasan las mismas validaciones. </p>
      <form data-srv-form="importar" novalidate><label class="fld"><span>Archivo de respaldo</span><input type="file" name="f" accept=".json,application/json"></label><p class="form-err" hidden></p>
      <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Importar</button></div></form>`);
  }

  // ---------- Ajustes: cuenta, seguridad y empresa (reemplaza "Datos y seguridad" de la edición local)
  function ajustesGroup(card, g) {
    const u = S.usuario, e = S.empresa || {};
    const nClosed = closed.size, lastClosed = [...closed].sort().pop();
    const cards = [
      card('user', 'Tu cuenta', `${esc(u.nombre)} · ${esc(u.correo)} · ${esc(u.rol_nombre)}.`, '<span class="acts"><button class="btn btn-cta" data-srv-act="cuenta">Mi cuenta</button></span>'),
      card('lock', 'Modo edición', 'Los cambios que mueven los indicadores se abren con tu clave de acceso durante 15 minutos. El servidor valida la clave y lo registra.', '<button class="btn" data-srv-act="edicion">Abrir edición</button>'),
      card('calendar', 'Cierre de mes', `${nClosed ? `${nClosed} mes${nClosed === 1 ? '' : 'es'} cerrado${nClosed === 1 ? '' : 's'} (el último: ${esc(mesTxt(lastClosed))}).` : 'Todavía no hay meses cerrados.'} Un mes cerrado queda marcado y sus cambios quedan en la auditoría.`, '<button class="btn" data-srv-act="periodos">Cierre de mes</button>'),
    ];
    if (can('usuarios.gestionar')) cards.push(card('users', 'Personas y permisos', `Plan ${esc(e.plan || '')}${e.max_usuarios ? `: hasta ${esc(e.max_usuarios)} personas` : ': sin límite de personas'}. Invita, cambia roles o suspende accesos.`, '<button class="btn" data-srv-act="usuarios">Gestionar</button>'));
    if (can('facturas.ver')) cards.push(card('invoice', 'Facturación fiscal', 'Correlativo sin saltos, número de control de la imprenta, tasa BCV, notas de crédito y débito y libro de ventas.', '<a class="btn" href="#/facturero">Ir a Facturación fiscal</a>'));
    if (can('seguridad.ver')) cards.push(card('shield', 'Seguridad', 'Intentos de acceso, ataques frenados, archivos vigilados y avisos por correo a los administradores.', '<button class="btn" data-srv-act="seguridad">Ver seguridad</button>'));
    if (can('exportar')) cards.push(card('upload', 'Exportar e importar', 'Descarga todos los datos (también sirve para la edición local) o importa un respaldo de la edición local. ', `<span class="acts"><button class="btn" data-act="backup-dl">Exportar</button>${can('importar') ? '<button class="btn" data-act="backup-up">Importar</button>' : ''}</span>`));
    cards.push(card('invoice', 'Productos y servicios', 'El catálogo con el precio de lista y el tipo de ingreso de cada producto.', '<a class="btn" href="#/productos">Ir a Productos</a>'));
    cards.push(card('team', 'Asesores e implementadores', 'Quién cobra comisión por venta y quién cobra por implementación, con sus porcentajes y tarifas.', '<a class="btn" href="#/comisiones">Ir a Comisiones</a>'));
    cards.push(card('upload', 'Importar gastos', 'Pega la tabla de tu hoja de cálculo para cargar gastos de una vez.', '<button class="btn" data-act="sheet">Gastos</button>'));
    if ((S.empresas || []).length > 1) cards.push(card('users', 'Cambiar de empresa', `Tienes acceso a ${S.empresas.length} empresas. Ahora estás en ${esc(e.nombre || '')}.`, '<button class="btn" data-srv-act="empresas">Cambiar</button>'));
    return g('Cuenta, seguridad y empresa', cards.join(''));
  }

  // ---------- Mi cuenta
  async function accountModal(note = '') {
    let p;
    try { p = await get('/perfil'); } catch (e) { return say(e.message, 'bad'); }
    const sesion = x => `<li><span><b>${esc(x.actual ? 'Este equipo' : (x.equipo || 'Equipo').replace(/\(.*?\)/g, '').slice(0, 60))}</b><small class="muted">IP ${esc(x.ip)} · última actividad ${esc(dmy(x.ultima))} ${esc(String(x.ultima || '').slice(11, 16))}</small></span>${x.actual ? '<span class="sc sc-ok">actual</span>' : `<button class="btn btn-sm btn-ghost" data-srv-act="sesion-cerrar" data-id="${esc(x.id)}">Cerrar</button>`}</li>`;
    window.openModal(`<h2 id="modal-t">Mi cuenta</h2>${note ? `<p class="srv-ok">${esc(note)}</p>` : ''}
      <section class="srv-sec"><h3>Datos</h3><form data-srv-form="nombre" class="srv-inline" novalidate><label class="fld fld-grow"><span>Nombre</span><input name="nombre" value="${esc(p.nombre)}" maxlength="120"></label><button class="btn" type="submit">Guardar</button></form><p class="muted small">Correo de acceso: <b>${esc(p.correo)}</b> · cuenta desde ${esc(dmy(p.desde))}</p></section>
      <section class="srv-sec"><h3>Cambiar la clave</h3><form data-srv-form="clave" novalidate><div class="fgrid"><label class="fld"><span>Clave actual</span><input type="password" name="actual" autocomplete="current-password"></label><label class="fld"><span>Clave nueva (mínimo 10)</span><input type="password" name="nueva" autocomplete="new-password"></label><label class="fld"><span>Repite la nueva</span><input type="password" name="nueva2" autocomplete="new-password"></label></div><p class="form-err" hidden></p><div class="modal-acts"><button class="btn" type="submit">Cambiar clave</button></div></form></section>
      <section class="srv-sec"><h3>Sesiones abiertas</h3><ul class="srv-list">${p.sesiones.map(sesion).join('')}</ul><div class="acts"><button class="btn btn-sm" data-srv-act="sesiones-otras">Cerrar las demás</button></div></section>
      <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cerrar</button></div>`);
    $('#modal .modal-card').classList.add('modal-wide');
  }

  // ---------- Personas
  async function usersModal() {
    let d; try { d = await get('/usuarios'); } catch (e) { return say(e.message, 'bad'); }
    const roleSel = u => `<select data-srv-rol="${esc(u.uid)}" ${u.tu ? 'disabled' : ''}>${d.roles.map(r => `<option value="${esc(r.rol)}" ${r.rol === u.rol ? 'selected' : ''}>${esc(r.nombre)}</option>`).join('')}${d.roles.some(r => r.rol === u.rol) ? '' : `<option selected>${esc(u.rol_nombre)}</option>`}</select>`;
    window.openModal(`<h2 id="modal-t">Personas y permisos</h2><p class="muted">Plan <b>${esc(d.plan.nombre)}</b>: ${esc(d.plan.usados)} de ${d.plan.maximo ? esc(d.plan.maximo) : 'personas sin límite'} cupos usados (incluye invitaciones pendientes).</p>
      <div class="bt-wrap"><table class="bt"><thead><tr><th>Persona</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th></th></tr></thead><tbody>${d.usuarios.map(u => `<tr><td><b>${esc(u.nombre)}</b>${u.tu ? ' <span class="sc sc-blue">tú</span>' : ''}<small class="muted" style="display:block">${esc(u.correo)}</small></td><td>${roleSel(u)}</td><td>${u.estado === 'ACTIVA' ? '<span class="sc sc-ok">activa</span>' : '<span class="sc sc-bad">suspendida</span>'}</td><td>${esc(u.ultimo_acceso ? dmy(u.ultimo_acceso) : 'nunca')}</td><td>${u.tu ? '' : `<button class="btn btn-sm btn-ghost" data-srv-act="usuario-estado" data-uid="${esc(u.uid)}" data-estado="${u.estado === 'ACTIVA' ? 'SUSPENDIDA' : 'ACTIVA'}">${u.estado === 'ACTIVA' ? 'Suspender' : 'Reactivar'}</button>`}</td></tr>`).join('')}</tbody></table></div>
      ${d.invitaciones.length ? `<h3 class="srv-h3">Invitaciones pendientes</h3><ul class="srv-list">${d.invitaciones.map(i => `<li><span><b>${esc(i.correo)}</b><small class="muted">${esc(i.rol_nombre)} · vence ${esc(dmy(i.vence))}</small></span><button class="btn btn-sm btn-ghost" data-srv-act="invitacion-revocar" data-uid="${esc(i.uid)}">Revocar</button></li>`).join('')}</ul>` : ''}
      <h3 class="srv-h3">Invitar a alguien</h3><form data-srv-form="invitar" class="srv-inline" novalidate><label class="fld fld-grow"><span>Correo</span><input name="correo" type="email" autocomplete="off"></label><label class="fld"><span>Rol</span><select name="rol">${d.roles.map(r => `<option value="${esc(r.rol)}" ${r.rol === 'ADMIN' ? 'selected' : ''}>${esc(r.nombre)}</option>`).join('')}</select></label><button class="btn btn-cta" type="submit">Invitar</button></form>
      <p class="muted small">La invitación llega por correo y vence en 7 días.</p>
      <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cerrar</button></div>`);
    $('#modal .modal-card').classList.add('modal-wide');
  }

  // ---------- Cierre de mes
  async function periodsModal() {
    let d; try { d = await get('/periodos'); } catch (e) { return say(e.message, 'bad'); }
    closed = new Set(d.cerrados || []); if (S) S.cerrados = d.cerrados;
    const months = []; let [y, m] = d.mes_actual.split('-').map(Number);
    for (let i = 0; i < 15; i++) { months.push(`${y}-${String(m).padStart(2, '0')}`); m--; if (!m) { m = 12; y--; } }
    const info = Object.fromEntries((d.periodos || []).map(p => [p.periodo, p]));
    window.openModal(`<h2 id="modal-t">Cierre de mes</h2><p class="muted">Cierra un mes cuando ya cuadraste sus cifras. Después, cualquier cambio en sus gastos, cobros, recibos, tasas o caja queda en la auditoría. ${can('periodos.reabrir') ? 'Como Superadministrador puedes reabrirlo (con motivo y aviso por correo).' : ''}</p>
      <ul class="srv-list srv-months">${months.map(p => { const c = closed.has(p), cur = p === d.mes_actual, inf = info[p]; return `<li><span><b>${esc(mesTxt(p))}</b><small class="muted">${cur ? 'mes en curso' : c ? `cerrado el ${esc(dmy(inf && inf.cerrado_en))}` : inf && inf.reabierto_en ? `reabierto el ${esc(dmy(inf.reabierto_en))}: ${esc(inf.motivo_reapertura || '')}` : 'abierto'}</small></span>${c ? `<span class="sc sc-blue">${ic('lock', 12)} cerrado</span>${can('periodos.reabrir') ? `<button class="btn btn-sm btn-ghost" data-srv-act="periodo-reabrir" data-p="${esc(p)}">Reabrir</button>` : ''}` : cur ? '' : can('periodos.cerrar') ? `<button class="btn btn-sm" data-srv-act="periodo-cerrar" data-p="${esc(p)}">Cerrar mes</button>` : ''}</li>`; }).join('')}</ul>
      <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cerrar</button></div>`);
  }

  // ---------- Seguridad
  async function securityModal() {
    let r, ev; try { [r, ev] = await Promise.all([get('/seguridad/resumen'), get('/seguridad/eventos?dias=7')]); } catch (e) { return say(e.message, 'bad'); }
    const sev = { BAJA: 'sc-blue', MEDIA: 'sc-gold', ALTA: 'sc-bad', CRITICA: 'sc-bad' };
    const TIPOS = { ACCESO_FALLIDO: 'Clave incorrecta', LOGIN_FUERZA: 'Muchos intentos de entrar', CSRF: 'Solicitud de otro sitio', WAF: 'Ataque frenado', TRAMPA: 'Intento de leer el código', BLOQUEO_IP: 'IP bloqueada', INMUTABLE: 'Intento de cambiar datos sellados', MES_REABIERTO: 'Mes reabierto', CLAVE_RESTABLECIDA: 'Clave restablecida', RECUPERACION: 'Pidió recuperar la clave', EDICION_FALLIDA: 'Clave de edición incorrecta', AUDITORIA_ROTA: 'Auditoría alterada', INTEGRIDAD: 'Archivos modificados' };
    window.openModal(`<h2 id="modal-t">Seguridad</h2>
      <div class="micro-grid" style="--cols:4">${['CRITICA', 'ALTA', 'MEDIA', 'BAJA'].map(k => `<article class="micro"><header class="mm-h"><h3>${esc({ CRITICA: 'Críticos', ALTA: 'Graves', MEDIA: 'Medios', BAJA: 'Leves' }[k])}</h3></header><div class="mm-row"><p class="mm-v">${esc(r.eventos_7_dias[k] || 0)}</p></div><p class="mm-foot">últimos 7 días</p></article>`).join('')}</div>
      <ul class="srv-list"><li><span><b>Auditoría encadenada</b><small class="muted">${esc(r.auditoria.registros)} registros firmados</small></span>${r.auditoria.integra ? '<span class="sc sc-ok">íntegra</span>' : '<span class="sc sc-bad">alterada</span>'}</li>
      <li><span><b>Archivos del sistema</b><small class="muted">${r.integridad ? `revisados ${esc(dmy(r.integridad.revisado))} ${esc(String(r.integridad.revisado).slice(11, 16))}` : 'sin revisiones todavía'}</small></span>${r.integridad ? (r.integridad.estado === 'OK' ? '<span class="sc sc-ok">sin cambios</span>' : '<span class="sc sc-bad">revisar</span>') : ''}</li>
      <li><span><b>Avisos por correo</b><small class="muted">${esc((r.superadministradores || []).join(', ') || 'sin destinatarios')}</small></span><button class="btn btn-sm" data-srv-act="seguridad-prueba">Enviar prueba</button></li></ul>
      <h3 class="srv-h3">Eventos recientes</h3>${ev.eventos.length ? `<div class="bt-wrap"><table class="bt"><thead><tr><th>Fecha</th><th>Qué pasó</th><th>Gravedad</th><th>IP</th></tr></thead><tbody>${ev.eventos.slice(0, 80).map(x => `<tr><td class="nw">${esc(dmy(x.fecha))} ${esc(String(x.fecha).slice(11, 16))}</td><td>${esc(TIPOS[x.tipo] || x.tipo)}<small class="muted" style="display:block">${esc(x.ruta)}</small></td><td><span class="sc ${sev[x.gravedad]}">${esc(x.gravedad.toLowerCase())}</span></td><td class="nw">${esc(x.ip)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sin eventos en los últimos 7 días.</p>'}
      <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cerrar</button></div>`);
    $('#modal .modal-card').classList.add('modal-wide');
  }

  // ---------- Tasas en vivo: BCV y Binance P2P (USDT/VES), la regla "según la operación" y la cotización congelada
  const OPS = { COBRO_BS: ['Cobrar en bolívares', 'Cobras en Bs una factura en divisas'], VENTA_USDT: ['Vender USDT', 'Cambias USDT por bolívares'], COMPRA_USDT: ['Comprar USDT', 'Cambias bolívares por USDT'], FISCAL: ['Facturas', 'Equivalente en Bs de la factura'] };
  const FUENTE = { BCV: 'BCV', BINANCE_BUY: 'Binance compra', BINANCE_SELL: 'Binance venta' };
  const fmtT = v => (v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const hhmm = iso => { try { return new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Caracas' }); } catch (e) { return ''; } };
  /** Cotización congelada en el servidor (15 min, queda registrada con todas las candidatas) */
  async function quote(op, montoUsd) {
    const q = await post('/tasas/cotizar', { operacion: op, monto_usd: montoUsd > 0 ? Math.round(montoUsd * 100) / 100 : undefined });
    q.exp = Date.now() + (q.minutos || 15) * 60000 - 20000;
    return q;
  }
  const quoteHtml = q => `<div class="srv-quote"><div class="srv-quote-main"><span>${esc((OPS[q.operacion] || [q.operacion])[0])}</span><b>Bs. ${esc(fmtT(q.tasa))}</b><small class="muted">por US$ · ${esc(FUENTE[q.fuente] || q.fuente)} · congelada hasta las ${esc(hhmm(q.vence))}</small></div>
    ${q.monto_usd ? `<p class="srv-quote-amt">${esc(usd(q.monto_usd))} = <b>${esc(bs(q.monto_bs))}</b></p>` : ''}
    <p class="muted small">${esc(q.regla)}. Candidatas: ${q.candidatas.map(c => `${esc(c.nombre)} ${esc(fmtT(c.tasa))}`).join(' · ')}. Cotización ${esc(q.cotizacion.slice(-8))} (queda en el registro).</p></div>`;
  async function ratesModal(note = '') {
    let t, h;
    try { [t, h] = await Promise.all([get('/tasas'), get('/tasas/historial?dias=14').catch(() => ({ dias: [] }))]); } catch (e) { return say(e.message, 'bad'); }
    const tile = (name, x, foot) => `<article class="micro"><header class="mm-h"><h3>${esc(name)}</h3></header><div class="mm-row"><p class="mm-v">${x ? esc(fmtT(x.tasa)) : '—'}</p></div><p class="mm-foot">${x ? `${x.vigente ? '' : '<b class="txt-bad">desactualizada</b> · '}${esc(dmy(x.actualizado))} ${esc(hhmm(x.actualizado))}${foot ? ' · ' + esc(foot(x)) : ''}` : 'sin datos todavía'}</p></article>`;
    const b = t.binance || {}; const pol = t.politica_empresa || 'SEGUN_OPERACION';
    const days = (h.dias || []).slice(-14).reverse();
    window.openModal(`<h2 id="modal-t">Tasas en vivo</h2>
      <p class="muted">El servidor consulta el BCV y el mercado P2P de Binance (USDT/VES) cada pocos minutos. En Binance se toma la mediana de los 5 mejores anuncios de comerciantes con historial (no un anuncio suelto).</p>
      ${note ? `<p class="srv-ok">${esc(note)}</p>` : ''}${t.estado !== 'OK' ? `<p class="fis-alert">${t.estado === 'SIN_DATOS' ? 'Todavía no hay tasas del servidor: escríbelas a mano en "Registrar tasas de hoy".' : 'Alguna fuente no respondió a tiempo: se muestra el último dato bueno.'}</p>` : ''}
      <div class="micro-grid" style="--cols:3">${tile('BCV (oficial)', t.bcv, x => x.fecha_valor ? 'valor del ' + dmy(x.fecha_valor) : 'oficial')}${tile('Binance compra', b.compra, x => `${x.anuncios} anuncios`)}${tile('Binance venta', b.venta, x => `${x.anuncios} anuncios`)}</div>
      <h3 class="srv-h3">La tasa de cada operación</h3>
      <ul class="srv-list">${Object.entries(OPS).map(([op, [n, d]]) => { const x = (t.por_operacion || {})[op] || {}; return `<li><span><b>${esc(n)}</b><small class="muted">${esc(d)} · ${esc(x.regla || '')}</small></span><span class="srv-rate"><b>${esc(fmtT(x.tasa))}</b><small class="muted">${esc(FUENTE[x.fuente] || 'sin dato')}</small></span></li>`; }).join('')}</ul>
      ${can('tasas.cotizar') ? `<h3 class="srv-h3">Congelar una tasa para operar</h3><p class="muted small">La tasa queda fija 15 minutos y registrada con todas las candidatas, para que nadie la cambie después.</p>
      <form data-srv-form="cotizar" class="srv-inline" novalidate><label class="fld"><span>Operación</span><select name="operacion">${Object.entries(OPS).map(([k, [n]]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select></label><label class="fld"><span>Monto en US$ (opcional)</span><input name="monto" inputmode="decimal" autocomplete="off" placeholder="Ej. 150,00"></label><button class="btn btn-cta" type="submit">Congelar</button><p class="form-err" hidden></p></form><div data-srv-quote aria-live="polite"></div>` : ''}
      ${can('fiscal.configurar') ? `<h3 class="srv-h3">Regla de la empresa</h3><div class="srv-seg" role="radiogroup" aria-label="Regla de tasas"><label><input type="radio" name="tpol" value="SEGUN_OPERACION" data-srv-pol ${pol === 'SEGUN_OPERACION' ? 'checked' : ''}><span>Según la operación</span></label><label><input type="radio" name="tpol" value="SIEMPRE_ALTA" data-srv-pol ${pol === 'SIEMPRE_ALTA' ? 'checked' : ''}><span>Siempre la más alta</span></label></div><p class="muted small">Las facturas usan siempre la tasa oficial del BCV, como exige la norma. El cambio de regla queda en la auditoría.</p>` : `<p class="muted small">Regla de la empresa: <b>${pol === 'SIEMPRE_ALTA' ? 'siempre la más alta' : 'según la operación'}</b>. Las facturas usan siempre la tasa oficial del BCV.</p>`}
      ${days.length ? `<h3 class="srv-h3">Últimos días</h3><div class="bt-wrap"><table class="bt"><thead><tr><th>Día</th><th class="num">BCV</th><th class="num">Binance compra</th><th class="num">Binance venta</th></tr></thead><tbody>${days.map(d => `<tr><td class="nw">${esc(dmy(d.fecha))}</td>${['BCV', 'BINANCE_BUY', 'BINANCE_SELL'].map(s => `<td class="num">${d[s] ? esc(fmtT(d[s].ultima)) + (d[s].muestras > 1 && d[s].maxima !== d[s].minima ? `<small class="muted" style="display:block">${esc(fmtT(d[s].minima))} – ${esc(fmtT(d[s].maxima))}</small>` : '') : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
      <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cerrar</button></div>`);
    $('#modal .modal-card').classList.add('modal-wide');
  }

  // ---------- acciones de los modales (clics y formularios con data-srv-*)
  const formErr = (f, m) => { const p = f.querySelector('.form-err'); if (p) { p.textContent = m || ''; p.hidden = !m; } else if (m) say(m, 'bad'); };
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-srv-act]'); if (!b) return;
    const a = b.dataset.srvAct; e.preventDefault();
    try {
      if (a === 'cuenta') return accountModal();
      if (a === 'edicion') { const lb = document.getElementById('lockBtn'); if (lb) lb.click(); else editModal(); return; }
      if (a === 'usuarios') return usersModal();
      if (a === 'periodos') return periodsModal();
      if (a === 'seguridad') return securityModal();
      if (a === 'tasas-vivo') return ratesModal();
      if (a === 'empresas') return window.openModal(`<h2 id="modal-t">Cambiar de empresa</h2><ul class="srv-list">${S.empresas.map(x => `<li><span><b>${esc(x.nombre)}</b><small class="muted">${esc(x.rol_nombre)} · plan ${esc(x.plan)}</small></span>${S.empresa && x.uid === S.empresa.uid ? '<span class="sc sc-ok">actual</span>' : `<button class="btn btn-sm" data-srv-act="empresa-ir" data-uid="${esc(x.uid)}">Entrar</button>`}</li>`).join('')}</ul>`);
      if (a === 'empresa-ir') { await flush(); await post('/sesion/empresa', { empresa: b.dataset.uid }); location.reload(); return; }
      if (a === 'sesion-cerrar') { const r = await post('/perfil/sesiones/' + encodeURIComponent(b.dataset.id) + '/cerrar', {}); if (r.actual) return location.reload(); return accountModal('Sesión cerrada.'); }
      if (a === 'sesiones-otras') { const r = await post('/perfil/sesiones/cerrar-otras', {}); return accountModal(`Se cerraron ${r.cerradas} sesión(es) en otros equipos.`); }
      if (a === 'usuario-estado') { await post(`/usuarios/${encodeURIComponent(b.dataset.uid)}/estado`, { estado: b.dataset.estado }); say(b.dataset.estado === 'ACTIVA' ? 'Acceso reactivado' : 'Acceso suspendido: se cerraron sus sesiones'); return usersModal(); }
      if (a === 'invitacion-revocar') { await post(`/invitaciones/${encodeURIComponent(b.dataset.uid)}/revocar`, {}); say('Invitación revocada'); return usersModal(); }
      if (a === 'periodo-cerrar' || a === 'periodo-reabrir') {
        const p = b.dataset.p;
        const motivo = a === 'periodo-reabrir' ? await reasonSheet('Reabrir el mes', `Reabrir ${esc(mesTxt(p))} permite cambiar sus datos. Queda en la auditoría y se avisa por correo.`, 'Reabrir', true) : null;
        if (a === 'periodo-reabrir' && !motivo) return;
        b.disabled = true;
        const r = await post(`/periodos/${encodeURIComponent(p)}/${a === 'periodo-cerrar' ? 'cerrar' : 'reabrir'}`, a === 'periodo-reabrir' ? { motivo } : {});
        closed = new Set(r.cerrados || []); if (S) S.cerrados = r.cerrados; tap(12);
        say(a === 'periodo-cerrar' ? `Mes cerrado: ${mesTxt(p)}` : `Mes reabierto: ${mesTxt(p)} (se avisó por correo)`);
        if (typeof window.render === 'function') window.render();
        return periodsModal();
      }
      if (a === 'seguridad-prueba') { const r = await post('/seguridad/prueba', {}); return say(`Aviso de prueba enviado a ${r.destinatarios} correo(s)`); }
    } catch (x) { b.disabled = false; say(x.message, 'bad'); }
  });
  document.addEventListener('change', async e => {
    const pol = e.target.closest('[data-srv-pol]');
    if (pol) {
      try { await post('/tasas/politica', { politica: pol.value }); tap(10); return ratesModal(pol.value === 'SIEMPRE_ALTA' ? 'Listo: toda operación interna usa la tasa más alta disponible.' : 'Listo: cada operación usa su tasa.'); }
      catch (x) { say(x.message, 'bad'); return ratesModal(); }
    }
    const sel = e.target.closest('[data-srv-rol]'); if (!sel) return;
    try { await post(`/usuarios/${encodeURIComponent(sel.dataset.srvRol)}/rol`, { rol: sel.value }); say('Rol cambiado: esa persona debe volver a entrar'); usersModal(); }
    catch (x) { say(x.message, 'bad'); usersModal(); }
  });
  document.addEventListener('submit', async e => {
    const f = e.target; const k = f.dataset && f.dataset.srvForm; if (!k) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const fd = new FormData(f); const v = n => (fd.get(n) || '').toString().trim(); const btn = f.querySelector('button[type=submit]');
    formErr(f, ''); if (btn) btn.disabled = true;
    try {
      if (k === 'edicion') {
        const r = await post('/sesion/edicion', { clave: fd.get('k') || '' });
        S.edicion_hasta = r.edicion_hasta; tap(10);
        if (typeof window.unlock === 'function') window.unlock(); else window.closeModal();
        return;
      }
      if (k === 'nombre') { await post('/perfil/nombre', { nombre: v('nombre') }); S.usuario.nombre = v('nombre'); return accountModal('Nombre guardado.'); }
      if (k === 'clave') {
        if (v('nueva').length < 10) throw new Error('La clave nueva debe tener al menos 10 caracteres.');
        if (v('nueva') !== v('nueva2')) throw new Error('Las dos claves nuevas no coinciden.');
        const r = await post('/perfil/clave', { actual: fd.get('actual'), nueva: fd.get('nueva') });
        return accountModal(`Clave cambiada. Cerramos ${r.sesiones_cerradas} sesión(es) en otros equipos y te avisamos por correo.`);
      }
      if (k === 'cotizar') {
        const raw = v('monto'); const m = raw ? Number(raw.replace(/\./g, '').replace(',', '.')) : 0;
        if (raw && !(m > 0)) throw new Error('Escribe el monto en US$ (por ejemplo 150,00).');
        const q = await quote(v('operacion'), m); tap(10);
        const box = $('#modal [data-srv-quote]'); if (box) box.innerHTML = quoteHtml(q);
        if (btn) btn.disabled = false;
        return;
      }
      if (k === 'invitar') { if (!v('correo')) throw new Error('Escribe el correo.'); await post('/usuarios/invitar', { correo: v('correo'), rol: v('rol') }); say('Invitación enviada a ' + v('correo')); return usersModal(); }
      if (k === 'importar') {
        const file = f.querySelector('input[type=file]').files[0]; if (!file) throw new Error('Elige el archivo de respaldo (.json).');
        if (file.size > 7.5 * 1024 * 1024) throw new Error('El archivo es muy grande (máximo 7,5 MB).');
        let j; try { j = JSON.parse(await file.text()); } catch (x) { throw new Error('Ese archivo no es un respaldo válido.'); }
        if (!j || j.app !== 'agora-digital-app' || !j.data) throw new Error('Ese archivo no es un respaldo de Agora Digital App.');
        await flush();
        const r = await post('/importar', { respaldo: j });
        flash(`Importación lista: ${r.datos} dato(s), ${r.facturas} factura(s) histórica(s) y ${r.cobros} cobro(s).` + ((r.facturas_omitidas || []).length + (r.cobros_omitidos || []).length ? ` Se omitieron ${(r.facturas_omitidas || []).length + (r.cobros_omitidos || []).length} (ver auditoría).` : ''));
        return location.reload();
      }
      if (fiscalForms[k]) return await fiscalForms[k](f, fd, v);
    } catch (x) { if (btn) btn.disabled = false; formErr(f, x.message); }
  }, true);

  // ================================================================== 9. facturación fiscal (norma venezolana)
  const F = { filtro: { estado: '', tipo: '', periodo: '', buscar: '' }, data: null, at: 0, busy: false, err: '' };
  const EST = { BORRADOR: ['Borrador', 'sc-gold'], EMITIDA: ['Emitida', 'sc-ok'], ANULADA: ['Anulada', 'sc-bad'] };
  const TIPO = { FAC: 'Factura', NC: 'Nota de crédito', ND: 'Nota de débito' };
  const IMP = { G: 'General', R: 'Reducida', A: 'General + lujo', E: 'Exento (E)' };
  function fiscalView() { return '<div id="fis-root" class="fis"><p class="muted">Cargando la facturación fiscal…</p></div>'; }
  function mountFiscal() { paintFiscal(); if (!F.data || Date.now() - F.at > 20000) loadFiscal(); }
  async function loadFiscal() {
    if (F.busy) return; F.busy = true;
    try {
      const q = new URLSearchParams(Object.entries(F.filtro).filter(([, v]) => v)).toString();
      const [perfil, lista, tasas] = await Promise.all([get('/fiscal/perfil'), get('/facturas?limite=200' + (q ? '&' + q : '')), get('/tasas').catch(() => null)]);
      const rangos = perfil.modo === 'FORMA_LIBRE' ? (await get('/fiscal/rangos').catch(() => ({ rangos: [] }))).rangos : [];
      const pend = perfil.modo === 'IMPRENTA_DIGITAL' ? (await get('/facturas?control_pendiente=1&limite=1').catch(() => ({ total: 0 }))).total : 0;
      F.data = { perfil, lista, tasas, rangos, pend }; F.at = Date.now(); F.err = '';
      (lista.documentos || []).forEach(d => { docCache[d.uid] = d; });
    } catch (e) { F.err = e.message; }
    F.busy = false; paintFiscal();
  }
  function paintFiscal() {
    const root = document.getElementById('fis-root'); if (!root) return;
    if (F.err && !F.data) { root.innerHTML = `<div class="panel"><p class="form-err">${esc(F.err)}</p><button class="btn" data-fis="recargar">Reintentar</button></div>`; return; }
    if (!F.data) return;
    const { perfil: p, lista, tasas, rangos, pend } = F.data;
    const bcv = tasas && tasas.bcv; const disp = (rangos || []).filter(r => r.estado === 'ACTIVO').reduce((a, r) => a + r.disponibles, 0);
    const alerts = [];
    if (!p.completo) alerts.push(`<div class="fis-alert"><b>Faltan datos fiscales para emitir:</b> ${esc(p.faltan.join(', '))}.${can('fiscal.configurar') ? ' <button class="btn btn-sm btn-cta" data-fis="perfil">Completar datos fiscales</button>' : ' Pídeselo a Dirección.'}</div>`);
    if (p.modo === 'FORMA_LIBRE' && disp < 20) alerts.push(`<div class="fis-alert">${disp ? `Quedan <b>${esc(disp)}</b> números de control.` : '<b>No quedan números de control.</b>'} Registra el siguiente rango que te asigne la imprenta.${can('fiscal.configurar') ? ' <button class="btn btn-sm" data-fis="rangos">Números de control</button>' : ''}</div>`);
    if (pend) alerts.push(`<div class="fis-alert"><b>${esc(pend)}</b> documento(s) esperan el número de control de la imprenta digital. <button class="btn btn-sm" data-fis="ver-pendientes">Ver</button></div>`);
    if (!bcv || !bcv.vigente) alerts.push('<div class="fis-alert">No hay una tasa BCV vigente: sin ella no se puede emitir (la norma exige el equivalente en bolívares). Escríbela en Ajustes → Tasas del día.</div>');
    const micro = (t, v, s) => `<article class="micro"><header class="mm-h"><h3>${t}</h3></header><div class="mm-row"><p class="mm-v">${v}</p></div>${s ? `<p class="mm-foot">${s}</p>` : ''}</article>`;
    const stats = `<div class="micro-grid" style="--cols:4">${micro('Emisión', p.modo === 'FORMA_LIBRE' ? 'Forma libre' : 'Imprenta digital', p.modo === 'FORMA_LIBRE' ? 'Control preimpreso por la imprenta' : 'Control lo asigna la imprenta (Prov. 0102)')}${micro('Tasa BCV', bcv ? 'Bs. ' + fmtN(bcv.tasa, 4) : '—', bcv ? (bcv.vigente ? 'oficial, se usa al emitir' : 'desactualizada') : 'sin dato')}${micro('Documentos emitidos', esc(p.emitidos), 'con sello verificable')}${micro(p.modo === 'FORMA_LIBRE' ? 'Controles disponibles' : 'Controles pendientes', p.modo === 'FORMA_LIBRE' ? esc(disp) : esc(pend), p.modo === 'FORMA_LIBRE' ? 'del rango de la imprenta' : 'por registrar')}</div>`;
    const f = F.filtro;
    const tools = `<div class="toolbar" role="search"><label class="fld fld-grow"><span>Buscar</span><input type="search" data-fis-f="buscar" value="${esc(f.buscar)}" placeholder="Cliente, número, control o RIF"></label>
      <label class="fld"><span>Estado</span><select data-fis-f="estado"><option value="">Todos</option>${Object.entries(EST).map(([k, [t]]) => `<option value="${k}" ${f.estado === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="fld"><span>Tipo</span><select data-fis-f="tipo"><option value="">Todos</option>${Object.entries(TIPO).map(([k, t]) => `<option value="${k}" ${f.tipo === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="fld"><span>Mes</span><input type="month" data-fis-f="periodo" value="${esc(f.periodo)}"></label></div>`;
    const rows = (lista.documentos || []).map(d => {
      const [et, ec] = EST[d.estado] || [d.estado, ''];
      const sym = d.moneda === 'VES' ? 'Bs.' : 'US$';
      const acts = [`<button class="btn btn-sm" data-fis="ver" data-uid="${esc(d.uid)}">Ver</button>`];
      if (d.estado === 'BORRADOR' && can('facturas.emitir')) acts.push(`<button class="btn btn-sm btn-cta" data-fis="emitir" data-uid="${esc(d.uid)}">Emitir</button>`, `<button class="btn btn-sm btn-ghost" data-fis="editar" data-uid="${esc(d.uid)}">Editar</button>`);
      if (d.control_pendiente && can('facturas.emitir')) acts.push(`<button class="btn btn-sm" data-fis="control" data-uid="${esc(d.uid)}">Registrar control</button>`);
      return `<tr><td class="nw"><b>${esc(d.numero_texto || '—')}</b><small class="muted" style="display:block">${esc(TIPO[d.tipo] || d.tipo)}${d.legado ? ' · importada' : ''}</small></td><td class="nw">${d.control ? esc(d.control) : d.control_pendiente ? '<span class="sc sc-gold">pendiente</span>' : '—'}</td><td class="nw">${esc(d.fecha ? dmy(d.fecha) : 'sin emitir')}</td><td>${esc(d.cliente.nombre || '—')}<small class="muted" style="display:block">${esc(d.cliente.rif || '')}</small></td><td class="num nw">${esc(sym)} ${esc(fmtN(d.totales.total))}</td><td class="num nw">${d.totales.total_bs != null ? esc(bs(d.totales.total_bs)) : '—'}</td><td><span class="sc ${ec}">${esc(et)}</span></td><td><span class="acts">${acts.join('')}</span></td></tr>`;
    }).join('');
    const head = [can('facturas.emitir') ? `<button class="btn btn-cta" data-fis="nueva" ${p.completo ? '' : 'title="Primero completa los datos fiscales"'}>Nueva factura</button>` : '', can('libro.ventas') ? '<button class="btn" data-fis="libro">Libro de ventas</button>' : '', can('fiscal.configurar') ? '<button class="btn" data-fis="perfil">Datos fiscales</button>' : '', can('fiscal.configurar') && p.modo === 'FORMA_LIBRE' ? '<button class="btn" data-fis="rangos">Números de control</button>' : '', '<button class="btn btn-ghost" data-fis="verificar">Verificar sellos</button>'].filter(Boolean).join('');
    root.innerHTML = `${alerts.join('')}<section class="panel"><header class="pn-h"><h2>Documentos fiscales</h2><div class="pn-a"><span class="acts">${head}</span></div></header>${stats}${tools}
      <div class="bt-wrap"><table class="bt fis-t"><thead><tr><th>N.°</th><th>Control</th><th>Fecha</th><th>Cliente</th><th class="num">Total</th><th class="num">Equivalente</th><th>Estado</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="8"><p class="muted">${F.filtro.estado || F.filtro.buscar || F.filtro.tipo || F.filtro.periodo ? 'No hay documentos con estos filtros.' : 'Todavía no hay documentos. Crea la primera factura con «Nueva factura».'}</p></td></tr>`}</tbody></table></div>
      <p class="note">${esc(lista.total)} documento(s). El número correlativo y el de control se asignan al emitir; lo emitido no se edita ni se borra: se anula o se corrige con una nota de crédito o débito. Equivalente en bolívares a la tasa oficial del BCV del día de emisión.</p></section>`;
  }
  let fisT = 0;
  document.addEventListener('input', e => { const i = e.target.closest('[data-fis-f]'); if (!i) return; F.filtro[i.dataset.fisF] = i.value; clearTimeout(fisT); fisT = setTimeout(() => { F.at = 0; loadFiscal(); }, i.type === 'search' ? 350 : 0); });

  // --- borrador: editor de factura
  const r2 = n => Math.round((+n || 0) * 100) / 100;
  function lineRow(l = {}, i = 0) {
    const cat = (typeof catalog !== 'undefined' ? catalog : []) || [];
    return `<tr data-line="${i}"><td><select data-l="producto" aria-label="Producto"><option value="">Libre</option>${cat.map(P => `<option value="${esc(P.id)}" ${l.codigo === P.id ? 'selected' : ''}>${esc(P.short || P.name)}</option>`).join('')}</select></td>
      <td><input data-l="descripcion" value="${esc(l.descripcion || '')}" maxlength="500" aria-label="Descripción" placeholder="Descripción"></td>
      <td><input data-l="cantidad" type="number" min="0.001" step="0.001" value="${esc(l.cantidad ?? 1)}" aria-label="Cantidad"></td>
      <td><input data-l="precio" type="number" min="0" step="0.01" value="${esc(l.precio ?? '')}" aria-label="Precio"></td>
      <td><input data-l="descuento" type="number" min="0" step="0.01" value="${esc(l.descuento || '')}" aria-label="Descuento" placeholder="0"></td>
      <td><select data-l="impuesto" aria-label="Impuesto">${Object.entries(IMP).map(([k, t]) => `<option value="${k}" ${(l.impuesto || 'G') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
      <td class="num nw" data-l="monto">—</td><td><button type="button" class="icon-btn" data-fis="quitar-linea" aria-label="Quitar línea">${ic('x', 14)}</button></td></tr>`;
  }
  function draftModal(doc) {
    const p = F.data ? F.data.perfil : { iva: { general: 16, reducida: 8, adicional_lujo: 15 }, igtf: { activo: false } };
    const cl = (typeof clientDefs !== 'undefined' ? clientDefs : []) || [];
    const d = doc || { moneda: 'USD', cliente: {}, lineas: [{ cantidad: 1, impuesto: 'G' }], condiciones: 'Contado' };
    window.openModal(`<h2 id="modal-t">${doc ? 'Editar borrador' : 'Nueva factura'}</h2><p class="muted">Se guarda como borrador. El número correlativo, el de control y la tasa BCV se asignan al emitir (con la fecha de hoy).</p>
      <form data-srv-form="factura" data-uid="${esc(doc ? doc.uid : '')}" novalidate>
        <div class="fgrid">
          <label class="fld span2"><span>Cliente</span><select name="cliente_id"><option value="">Otro (escribir los datos)</option>${cl.map(c => `<option value="${esc(c.id)}" ${d.cliente.app_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
          <label class="fld span2"><span>Nombre o razón social</span><input name="nombre" value="${esc(d.cliente.nombre || '')}" maxlength="200"></label>
          <label class="fld"><span>RIF o C.I.</span><input name="rif" value="${esc(d.cliente.rif || '')}" placeholder="J-12345678-9" maxlength="20"></label>
          <label class="fld span2"><span>Domicilio fiscal</span><input name="direccion" value="${esc(d.cliente.direccion || '')}" maxlength="400"></label>
          <label class="fld"><span>Correo</span><input name="correo" type="email" value="${esc(d.cliente.correo || '')}"></label>
          <label class="fld"><span>Teléfono</span><input name="telefono" value="${esc(d.cliente.telefono || '')}"></label>
          <label class="fld"><span>Moneda</span><select name="moneda"><option value="USD" ${d.moneda === 'USD' ? 'selected' : ''}>Dólares (US$)</option><option value="VES" ${d.moneda === 'VES' ? 'selected' : ''}>Bolívares (Bs.)</option></select></label>
          <label class="fld"><span>Condiciones de pago</span><input name="condiciones" value="${esc(d.condiciones || '')}" maxlength="120" placeholder="Contado"></label>
          <label class="fld"><span>Vence</span><input name="vence" type="date" value="${esc(d.vence || '')}"></label>
          ${p.igtf && p.igtf.activo ? `<label class="fld sw-row span2"><input type="checkbox" name="pago_divisas" ${d.pago_divisas ? 'checked' : ''}> El cliente paga en divisas (se percibe IGTF ${esc(p.igtf.alicuota)} %)</label>` : ''}
        </div>
        <div class="bt-wrap"><table class="bt fis-lines"><thead><tr><th>Producto</th><th>Descripción</th><th>Cant.</th><th>Precio</th><th>Desc.</th><th>Impuesto</th><th class="num">Monto</th><th></th></tr></thead><tbody>${(d.lineas || []).map(lineRow).join('')}</tbody></table></div>
        <button type="button" class="btn btn-sm" data-fis="linea">Agregar línea</button>
        <label class="fld"><span>Observaciones (salen en la factura)</span><textarea name="notas" rows="2" maxlength="600">${esc(d.notas || '')}</textarea></label>
        <div class="fis-sum" data-fis-sum></div>
        <p class="form-err" hidden></p>
        <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn" name="accion" value="guardar">Guardar borrador</button><button type="submit" class="btn btn-cta" name="accion" value="emitir">Guardar y emitir</button></div>
      </form>`);
    $('#modal .modal-card').classList.add('modal-wide');
    draftCalc();
  }
  function draftLines(form) {
    return $$('tr[data-line]', form).map(tr => { const g = k => tr.querySelector(`[data-l="${k}"]`); return { codigo: g('producto').value || undefined, descripcion: g('descripcion').value.trim(), cantidad: +g('cantidad').value || 0, precio: g('precio').value === '' ? null : +g('precio').value, descuento: +g('descuento').value || 0, impuesto: g('impuesto').value }; });
  }
  function draftCalc() {
    const form = $('form[data-srv-form="factura"]'); if (!form) return;
    const p = F.data ? F.data.perfil : { iva: { general: 16, reducida: 8, adicional_lujo: 15 }, igtf: { alicuota: 3 } };
    const rate = { G: p.iva.general, R: p.iva.reducida, A: p.iva.general + p.iva.adicional_lujo, E: 0 };
    const base = { G: 0, R: 0, A: 0, E: 0 };
    $$('tr[data-line]', form).forEach(tr => { const g = k => tr.querySelector(`[data-l="${k}"]`); const m = r2(r2((+g('cantidad').value || 0) * (+g('precio').value || 0)) - (+g('descuento').value || 0)); g('monto').textContent = fmtN(m); base[g('impuesto').value] += m; });
    const iva = { G: r2(base.G * rate.G / 100), R: r2(base.R * rate.R / 100), A: r2(base.A * rate.A / 100) };
    const sub = r2(base.G + base.R + base.A + base.E), tot = r2(sub + iva.G + iva.R + iva.A);
    const cur = form.moneda.value, sym = cur === 'VES' ? 'Bs.' : 'US$';
    const igtf = form.pago_divisas && form.pago_divisas.checked && cur !== 'VES' ? r2(tot * (p.igtf.alicuota || 3) / 100) : 0;
    const bcv = F.data && F.data.tasas && F.data.tasas.bcv ? F.data.tasas.bcv.tasa : null;
    const row = (t, v, cls = '') => `<div class="${cls}"><span>${t}</span><b>${sym} ${fmtN(v)}</b></div>`;
    $('[data-fis-sum]', form).innerHTML = row('Subtotal', sub) + (base.E ? row('Exento', base.E) : '') + (['G', 'R', 'A'].filter(k => base[k]).map(k => row(`IVA ${fmtN(rate[k], 0)} %`, iva[k])).join('')) + row('Total', tot, 'is-total') + (igtf ? row(`IGTF ${fmtN(p.igtf.alicuota, 0)} %`, igtf) : '') + (cur !== 'VES' && bcv ? `<div class="muted"><span>Equivalente aprox. a tasa BCV de hoy (${esc(fmtN(bcv, 4))})</span><b>${esc(bs(tot * bcv))}</b></div>` : '') + '<p class="muted small">El servidor recalcula todo al guardar.</p>';
  }
  document.addEventListener('input', e => { if (e.target.closest('form[data-srv-form="factura"]')) draftCalc(); });
  document.addEventListener('change', e => {
    const form = e.target.closest('form[data-srv-form="factura"]'); if (!form) return;
    if (e.target.name === 'cliente_id') { const c = ((typeof clientDefs !== 'undefined' && clientDefs) || []).find(x => x.id === e.target.value); if (c) { const o = c.opt || {}; form.nombre.value = c.name || ''; form.rif.value = o.rif || ''; form.direccion.value = o.dir || ''; form.correo.value = o.email || ''; form.telefono.value = o.tel || ''; } }
    if (e.target.dataset.l === 'producto') { const P = ((typeof catalog !== 'undefined' && catalog) || []).find(x => x.id === e.target.value); const tr = e.target.closest('tr'); if (P) { const dsc = tr.querySelector('[data-l="descripcion"]'); if (!dsc.value) dsc.value = P.name || P.short; const pr = tr.querySelector('[data-l="precio"]'); if (!pr.value) pr.value = P.price != null ? P.price : ''; } }
    draftCalc();
  });

  // --- detalle, PDF y acciones
  async function repHtml(uid, copy) { const r = await api('GET', `/facturas/${encodeURIComponent(uid)}/representacion${copy ? '?copia=1' : ''}`, undefined, { raw: true }); return String(r.data || ''); }
  function pdfFrom(html, name) {
    if (typeof agoraPdfEngine !== 'function') return Promise.reject(new Error('El motor de PDF no está disponible.'));
    const doc = html.replace(/<\/body>(?![\s\S]*<\/body>)/, `<script nonce="${esc(NONCE)}">${agoraPdfEngine.toString()}\nagoraPdfEngine(${JSON.stringify({ sel: '#page', name, orient: 'portrait', single: true, width: 794 })});<\/script></body>`);
    return new Promise((res, rej) => {
      const fr = document.createElement('iframe'); fr.setAttribute('aria-hidden', 'true'); fr.tabIndex = -1; fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:820px;height:1180px;border:0;visibility:hidden';
      fr.onload = async () => { try { const r = await fr.contentWindow.makePdf(); if (typeof downloadBlob === 'function') downloadBlob(r.blob, r.name); res(); } catch (e) { rej(e); } finally { setTimeout(() => fr.remove(), 1500); } };
      fr.srcdoc = doc; document.body.appendChild(fr);
    });
  }
  async function detailModal(uid, note = '') {
    let d; try { d = await get('/facturas/' + encodeURIComponent(uid)); } catch (e) { return say(e.message, 'bad'); }
    docCache[uid] = d;
    const html = await repHtml(uid).catch(e => `<p>${esc(e.message)}</p>`);
    const sym = d.moneda === 'VES' ? 'Bs.' : 'US$';
    const acts = [`<button class="btn" data-fis="pdf" data-uid="${esc(uid)}">Descargar PDF</button>`];
    if (d.estado !== 'BORRADOR') acts.push(`<button class="btn btn-ghost" data-fis="pdf-copia" data-uid="${esc(uid)}">PDF de la copia</button>`);
    if (d.estado === 'BORRADOR' && can('facturas.emitir')) acts.push(`<button class="btn btn-cta" data-fis="emitir" data-uid="${esc(uid)}">Emitir</button>`, `<button class="btn" data-fis="editar" data-uid="${esc(uid)}">Editar</button>`, `<button class="btn btn-ghost btn-danger" data-fis="borrar" data-uid="${esc(uid)}">Borrar borrador</button>`);
    if (d.control_pendiente && can('facturas.emitir')) acts.push(`<button class="btn" data-fis="control" data-uid="${esc(uid)}">Registrar control</button>`);
    if (d.estado === 'EMITIDA' && d.tipo === 'FAC' && can('facturas.emitir')) acts.push(`<button class="btn" data-fis="nota" data-tipo="NC" data-uid="${esc(uid)}">Nota de crédito</button>`, `<button class="btn" data-fis="nota" data-tipo="ND" data-uid="${esc(uid)}">Nota de débito</button>`);
    if (d.estado === 'EMITIDA' && !d.legado && can('facturas.anular')) acts.push(`<button class="btn btn-danger" data-fis="anular" data-uid="${esc(uid)}">Anular</button>`);
    window.openModal(`<h2 id="modal-t">${esc(d.titulo)} ${esc(d.numero_texto || '(borrador)')}</h2>${note ? `<p class="srv-ok">${esc(note)}</p>` : ''}
      <p class="muted">${esc(d.cliente.nombre)} · ${esc(d.cliente.rif)} · ${d.fecha ? 'emitida el ' + esc(dmy(d.fecha)) + (d.hora ? ' a las ' + esc(d.hora.slice(0, 5)) : '') : 'sin emitir'} · <b>${esc(sym)} ${esc(fmtN(d.totales.total))}</b>${d.totales.total_bs != null ? ' · ' + esc(bs(d.totales.total_bs)) + ' a tasa BCV ' + esc(fmtN(d.tasa_bcv, 4)) : ''}${d.estado === 'ANULADA' ? ` · <b class="txt-bad">anulada</b>: ${esc(d.motivo_anulacion || '')}` : ''}</p>
      ${(d.notas_emitidas || []).length ? `<p class="muted small">Notas: ${d.notas_emitidas.map(n => `${esc(TIPO[n.tipo])} ${esc(n.numero)} (${esc(sym)} ${esc(fmtN(n.total))})`).join(' · ')}</p>` : ''}
      <div class="acts fis-acts">${acts.join('')}</div>
      <iframe class="fis-frame" title="Vista del documento fiscal"></iframe>
      <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cerrar</button></div>`);
    $('#modal .modal-card').classList.add('modal-wide');
    const fr = $('#modal .fis-frame'); if (fr) fr.srcdoc = html;
  }
  function reasonSheet(title, text, okLabel, danger = false) {
    return new Promise(res => {
      let val = null;
      const sh = sheet(`<div class="srv-hoja"><h2>${esc(title)}</h2><p class="muted">${text}</p><form data-srv-reason novalidate><label class="fld"><span>Motivo (queda en la auditoría)</span><textarea name="motivo" rows="2" maxlength="255" required></textarea></label><p class="form-err" hidden></p><div class="modal-acts"><button type="button" class="btn btn-ghost" data-n>Cancelar</button><button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-cta'}">${esc(okLabel)}</button></div></form></div>`, { onClose: () => res(val) });
      const f = sh.body.querySelector('form');
      sh.body.querySelector('[data-n]').addEventListener('click', () => sh.close('n'));
      f.addEventListener('submit', e => {
        e.preventDefault(); const m = f.querySelector('textarea').value.trim();
        if (m.length < 5) { const p = f.querySelector('.form-err'); p.textContent = 'Escribe el motivo (mínimo 5 caracteres).'; p.hidden = false; return; }
        val = m; sh.close('y');
      });
      setTimeout(() => f.querySelector('textarea').focus(), 40);
    });
  }
  function confirmSheet(title, text, okLabel, danger = false) {
    return new Promise(res => {
      let ok = false;
      const sh = sheet(`<div class="srv-hoja"><h2>${esc(title)}</h2><p class="muted">${text}</p><div class="modal-acts"><button type="button" class="btn btn-ghost" data-n>Cancelar</button><button type="button" class="btn ${danger ? 'btn-danger' : 'btn-cta'}" data-y>${esc(okLabel)}</button></div></div>`, { onClose: () => res(ok) });
      sh.body.querySelector('[data-n]').addEventListener('click', () => sh.close('n'));
      sh.body.querySelector('[data-y]').addEventListener('click', () => { ok = true; sh.close('y'); });
      setTimeout(() => sh.body.querySelector('[data-y]').focus(), 40);
    });
  }
  async function afterFiscalChange(uid, note) {
    F.at = 0; loadFiscal();
    try { await flush(); const ch = await pull(); if (ch && ch.includes('facturas') && window.agoraSrvSync) window.agoraSrvSync(); } catch (e) {}
    if (uid) detailModal(uid, note);
  }
  async function emit(uid) {
    const d = docCache[uid];
    const p = F.data && F.data.perfil;
    const ok = await confirmSheet('Emitir el documento', `Se le asigna el <b>siguiente número correlativo</b>${p && p.modo === 'FORMA_LIBRE' ? ' y el <b>siguiente número de control</b> de la imprenta' : ' (el número de control lo registras cuando te lo dé la imprenta digital)'}, con la fecha de <b>hoy</b> y la tasa BCV vigente.${d ? ` Cliente: <b>${esc(d.cliente.nombre)}</b>.` : ''} Después de emitido <b>no se puede editar ni borrar</b>: solo anular o corregir con una nota.`, 'Emitir');
    if (!ok) return;
    try { const r = await post(`/facturas/${encodeURIComponent(uid)}/emitir`, {}); tap(14); say(`${r.titulo} N.° ${r.numero_texto} emitida${r.control ? ' · control ' + r.control : ''}`); await afterFiscalChange(uid, `Emitida con el N.° ${r.numero_texto}${r.control ? ' y el control ' + r.control : ''}.`); }
    catch (e) { say(e.message, 'bad'); }
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-fis]'); if (!b) return;
    const a = b.dataset.fis, uid = b.dataset.uid; e.preventDefault();
    try {
      if (a === 'recargar') { F.at = 0; return loadFiscal(); }
      if (a === 'nueva') { if (F.data && !F.data.perfil.completo) return say('Primero completa los datos fiscales de la empresa.', 'bad'); if (typeof withKey === 'function') return withKey(() => draftModal(null)); return draftModal(null); }
      if (a === 'ver') return detailModal(uid);
      if (a === 'editar') { const d = await get('/facturas/' + encodeURIComponent(uid)); return draftModal(d); }
      if (a === 'emitir') return emit(uid);
      if (a === 'borrar') { if (!(await confirmSheet('Borrar el borrador', 'El borrador no tiene número todavía, así que se puede borrar sin dejar saltos en el correlativo.', 'Borrar', true))) return; await del('/facturas/' + encodeURIComponent(uid)); window.closeModal(); F.at = 0; loadFiscal(); return say('Borrador borrado'); }
      if (a === 'linea') { const tb = $('form[data-srv-form="factura"] .fis-lines tbody'); tb.insertAdjacentHTML('beforeend', lineRow({ cantidad: 1, impuesto: 'G' }, tb.children.length)); return draftCalc(); }
      if (a === 'quitar-linea') { const tr = b.closest('tr'); const tb = tr.parentElement; if (tb.children.length > 1) tr.remove(); return draftCalc(); }
      if (a === 'pdf' || a === 'pdf-copia') { b.disabled = true; const d = docCache[uid]; const html = await repHtml(uid, a === 'pdf-copia'); await pdfFrom(html, `${d && d.tipo || 'DOC'}-${d && d.numero_texto || 'borrador'}${a === 'pdf-copia' ? '-copia' : ''}.pdf`); b.disabled = false; return say('PDF descargado'); }
      if (a === 'anular') {
        const d = docCache[uid];
        const motivo = await reasonSheet('Anular el documento', `${esc(d ? d.titulo + ' N.° ' + d.numero_texto : 'El documento')} queda marcado como <b>ANULADO</b> (conserva su número, no se reutiliza) y se avisa por correo a los administradores. Si tiene cobros o su mes está cerrado, corrígelo con una nota de crédito.`, 'Anular', true);
        if (!motivo) return;
        await post(`/facturas/${encodeURIComponent(uid)}/anular`, { motivo }); tap(14); say('Documento anulado'); return afterFiscalChange(uid, 'Documento anulado.');
      }
      if (a === 'nota') return noteModal(uid, b.dataset.tipo);
      if (a === 'control') return controlModal(uid);
      if (a === 'perfil') return profileModal();
      if (a === 'rangos') return rangesModal();
      if (a === 'rango-anular') { await post(`/fiscal/rangos/${encodeURIComponent(b.dataset.id)}/anular`, {}); say('Rango anulado'); F.at = 0; loadFiscal(); return rangesModal(); }
      if (a === 'libro') return bookModal();
      if (a === 'libro-csv') { const r = await api('GET', '/libro-ventas?periodo=' + encodeURIComponent(b.dataset.p) + '&formato=csv', undefined, { raw: true }); const blob = new Blob([r.data], { type: 'text/csv;charset=utf-8' }); if (typeof downloadBlob === 'function') downloadBlob(blob, `libro-de-ventas-${b.dataset.p}.csv`); return say('Libro de ventas descargado'); }
      if (a === 'verificar') { const r = await get('/fiscal/verificar'); return window.openModal(`<h2 id="modal-t">Verificación de sellos</h2><p class="${r.integro ? 'srv-ok' : 'form-err'}">${r.integro ? `Los ${esc(r.documentos)} documentos emitidos conservan su sello y la numeración no tiene saltos.` : `Hay ${esc(r.problemas.length)} problema(s):`}</p>${r.problemas.length ? `<ul class="srv-list">${r.problemas.map(x => `<li><span><b>${esc(TIPO[x.tipo] || x.tipo)} ${esc(x.documento)}</b><small class="muted">${esc(x.problema)}</small></span></li>`).join('')}</ul>` : ''}<div class="modal-acts"><button type="button" class="btn btn-cta" data-act="close">Entendido</button></div>`); }
      if (a === 'ver-pendientes') { F.filtro = { estado: 'EMITIDA', tipo: '', periodo: '', buscar: '' }; F.at = 0; return loadFiscal(); }
    } catch (x) { b.disabled = false; say(x.message, 'bad'); }
  });

  function noteModal(uid, tipo) {
    const d = docCache[uid]; if (!d) return;
    const sym = d.moneda === 'VES' ? 'Bs.' : 'US$';
    window.openModal(`<h2 id="modal-t">${tipo === 'NC' ? 'Nota de crédito' : 'Nota de débito'} sobre la factura ${esc(d.numero_texto)}</h2>
      <p class="muted">${tipo === 'NC' ? 'Resta de la factura (descuento, devolución, servicio no prestado). No puede superar lo que queda de la factura.' : 'Suma a la factura (intereses, recargos, diferencias).'} Cita el número, la fecha y el monto de la factura (art. 23) y lleva su propio correlativo. Pide el motivo.</p>
      <p class="muted small">Factura: ${esc(sym)} ${esc(fmtN(d.totales.total))} del ${esc(dmy(d.fecha))} · ${esc(d.cliente.nombre)}</p>
      <form data-srv-form="nota" data-uid="${esc(uid)}" data-tipo="${esc(tipo)}" novalidate>
        <div class="bt-wrap"><table class="bt fis-lines"><thead><tr><th>Producto</th><th>Descripción</th><th>Cant.</th><th>Precio</th><th>Desc.</th><th>Impuesto</th><th class="num">Monto</th><th></th></tr></thead><tbody>${lineRow({ descripcion: tipo === 'NC' ? 'Ajuste a la factura ' + d.numero_texto : 'Recargo sobre la factura ' + d.numero_texto, cantidad: 1, impuesto: 'G' }, 0)}</tbody></table></div>
        <p class="form-err" hidden></p>
        <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Emitir la nota</button></div></form>`);
    $('#modal .modal-card').classList.add('modal-wide');
  }
  function controlModal(uid) {
    const d = docCache[uid]; const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    window.openModal(`<h2 id="modal-t">Número de control de la imprenta digital</h2><p class="muted">Escribe el número de control que asignó la imprenta digital autorizada a ${esc(d ? 'la ' + d.titulo.toLowerCase() + ' N.° ' + d.numero_texto : 'este documento')}, con la fecha y hora de asignación (Prov. SNAT/2024/000102). Una vez registrado no se cambia.</p>
      <form data-srv-form="control" data-uid="${esc(uid)}" novalidate><div class="fgrid"><label class="fld"><span>N.° de control</span><input name="numero_control" placeholder="00-00000123" maxlength="12" autocomplete="off"></label><label class="fld"><span>Fecha y hora de asignación</span><input name="asignado" type="datetime-local" value="${esc(now.toISOString().slice(0, 16))}"></label></div>
      <p class="form-err" hidden></p><div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Registrar</button></div></form>`);
  }
  async function profileModal() {
    let p; try { p = await get('/fiscal/perfil'); } catch (e) { return say(e.message, 'bad'); }
    window.openModal(`<h2 id="modal-t">Datos fiscales de la empresa</h2><p class="muted">Salen en cada documento (Prov. SNAT/2011/00071, art. 13). ${p.emitidos ? 'Ya hay documentos emitidos: cambiar estos datos solo afecta a los nuevos.' : ''}</p>
      <form data-srv-form="perfil" novalidate><div class="fgrid">
        <label class="fld span2"><span>Razón social</span><input name="razon_social" value="${esc(p.razon_social)}" maxlength="200"></label>
        <label class="fld"><span>RIF</span><input name="rif" value="${esc(p.rif)}" placeholder="J-12345678-9"></label>
        <label class="fld sw-row"><input type="checkbox" name="contribuyente_especial" ${p.contribuyente_especial ? 'checked' : ''}> Contribuyente especial</label>
        <label class="fld span2"><span>Domicilio fiscal</span><input name="domicilio" value="${esc(p.domicilio)}" maxlength="400"></label>
        <label class="fld"><span>Teléfono</span><input name="telefono" value="${esc(p.telefono)}"></label>
        <label class="fld"><span>Correo</span><input name="correo" type="email" value="${esc(p.correo)}"></label>
        <label class="fld"><span>Modo de emisión</span><select name="modo"><option value="IMPRENTA_DIGITAL" ${p.modo === 'IMPRENTA_DIGITAL' ? 'selected' : ''}>Imprenta digital (Prov. 0102)</option><option value="FORMA_LIBRE" ${p.modo === 'FORMA_LIBRE' ? 'selected' : ''}>Forma libre (control preimpreso)</option></select></label>
        <label class="fld"><span>Serie (opcional)</span><input name="serie" value="${esc(p.serie)}" maxlength="4" placeholder="Ej. A"></label>
        <label class="fld span2"><span>Imprenta autorizada: nombre</span><input name="imp_nombre" value="${esc(p.imprenta.nombre)}"></label>
        <label class="fld"><span>RIF de la imprenta</span><input name="imp_rif" value="${esc(p.imprenta.rif)}"></label>
        <label class="fld"><span>Providencia de autorización</span><input name="imp_prov" value="${esc(p.imprenta.providencia)}"></label>
        <label class="fld"><span>Fecha de la providencia</span><input name="imp_fecha" type="date" value="${esc(p.imprenta.fecha || '')}"></label>
        <label class="fld"><span>IVA general (%)</span><input name="iva_g" type="number" step="0.01" value="${esc(p.iva.general)}"></label>
        <label class="fld"><span>IVA reducido (%)</span><input name="iva_r" type="number" step="0.01" value="${esc(p.iva.reducida)}"></label>
        <label class="fld"><span>Alícuota adicional de lujo (%)</span><input name="iva_a" type="number" step="0.01" value="${esc(p.iva.adicional_lujo)}"></label>
        <label class="fld sw-row"><input type="checkbox" name="igtf_on" ${p.igtf.activo ? 'checked' : ''}> Percibo IGTF (pagos en divisas)</label>
        <label class="fld"><span>IGTF (%)</span><input name="igtf" type="number" step="0.01" value="${esc(p.igtf.alicuota)}"></label>
        <label class="fld span2"><span>Leyendas (una por línea)</span><textarea name="leyendas" rows="2" maxlength="600">${esc(p.leyendas)}</textarea></label>
      </div><p class="muted small">Confirma las alícuotas y si eres agente de percepción del IGTF con tu contador: las normas cambian.</p><p class="form-err" hidden></p>
      <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Guardar</button></div></form>`);
    $('#modal .modal-card').classList.add('modal-wide');
  }
  async function rangesModal() {
    let r; try { r = await get('/fiscal/rangos'); } catch (e) { return say(e.message, 'bad'); }
    window.openModal(`<h2 id="modal-t">Números de control (forma libre)</h2><p class="muted">Registra los rangos que te asignó la imprenta autorizada. Al emitir se usa el siguiente número, en orden, para todos los documentos. Registrar o anular un rango queda en la auditoría.</p>
      ${r.rangos.length ? `<ul class="srv-list">${r.rangos.map(x => `<li><span><b>${esc(x.prefijo)}-${esc(String(x.desde).padStart(8, '0'))} al ${esc(x.prefijo)}-${esc(String(x.hasta).padStart(8, '0'))}</b><small class="muted">${esc(x.imprenta)} · ${esc(x.providencia)} · ${esc(x.disponibles)} disponibles</small></span><span class="sc ${x.estado === 'ACTIVO' ? 'sc-ok' : x.estado === 'AGOTADO' ? 'sc-blue' : 'sc-bad'}">${esc(x.estado.toLowerCase())}</span>${x.estado === 'ACTIVO' && x.siguiente === x.desde ? `<button class="btn btn-sm btn-ghost" data-fis="rango-anular" data-id="${esc(x.id)}">Anular</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Todavía no hay rangos registrados.</p>'}
      <form data-srv-form="rango" novalidate><h3 class="srv-h3">Nuevo rango</h3><div class="fgrid"><label class="fld"><span>Prefijo</span><input name="prefijo" value="00" maxlength="2"></label><label class="fld"><span>Desde</span><input name="desde" type="number" min="1"></label><label class="fld"><span>Hasta</span><input name="hasta" type="number" min="1"></label><label class="fld span2"><span>Imprenta</span><input name="imprenta"></label><label class="fld"><span>RIF de la imprenta</span><input name="rif_imprenta"></label><label class="fld"><span>Providencia</span><input name="providencia"></label><label class="fld"><span>Fecha de asignación</span><input name="fecha" type="date"></label></div>
      <p class="form-err" hidden></p><div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cerrar</button><button type="submit" class="btn btn-cta">Registrar rango</button></div></form>`);
    $('#modal .modal-card').classList.add('modal-wide');
  }
  async function bookModal(period) {
    const now = new Date(); const def = period || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let b; try { b = await get('/libro-ventas?periodo=' + encodeURIComponent(def)); } catch (e) { return say(e.message, 'bad'); }
    const t = b.totales;
    window.openModal(`<h2 id="modal-t">Libro de ventas · ${esc(mesTxt(def))}</h2><p class="muted">Un renglón por documento emitido en el mes, en bolívares (las notas de crédito restan; las anuladas van en cero). Descárgalo para tu contador.</p>
      <form data-srv-form="libro" class="srv-inline" novalidate><label class="fld"><span>Mes</span><input name="p" type="month" value="${esc(def)}"></label><button class="btn" type="submit">Ver</button><button class="btn btn-cta" type="button" data-fis="libro-csv" data-p="${esc(def)}">Descargar (Excel)</button></form>
      <div class="bt-wrap"><table class="bt"><thead><tr><th>N.°</th><th>Fecha</th><th>Cliente</th><th>Documento</th><th>Control</th><th>Tipo</th><th class="num">Total con IVA</th><th class="num">Base 16 %</th><th class="num">IVA</th></tr></thead><tbody>${b.filas.slice(0, 300).map(r => `<tr><td>${esc(r.n)}</td><td class="nw">${esc(r.fecha)}</td><td>${esc(r.nombre)}<small class="muted" style="display:block">${esc(r.rif)}</small></td><td class="nw">${esc(r.tipo)} ${esc(r.numero)}</td><td class="nw">${esc(r.control)}</td><td>${esc(r.transaccion)}</td><td class="num nw">${esc(fmtN(r.total_bs / 100))}</td><td class="num nw">${esc(fmtN(r.base_g_bs / 100))}</td><td class="num nw">${esc(fmtN((r.iva_g_bs + r.iva_r_bs + r.iva_a_bs) / 100))}</td></tr>`).join('') || '<tr><td colspan="9"><p class="muted">Sin documentos en este mes.</p></td></tr>'}</tbody>
      <tfoot><tr><td colspan="6"><b>Totales (Bs.)</b></td><td class="num nw"><b>${esc(fmtN(t.total_bs / 100))}</b></td><td class="num nw"><b>${esc(fmtN(t.base_g_bs / 100))}</b></td><td class="num nw"><b>${esc(fmtN((t.iva_g_bs + t.iva_r_bs + t.iva_a_bs) / 100))}</b></td></tr></tfoot></table></div>
      <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cerrar</button></div>`);
    $('#modal .modal-card').classList.add('modal-wide');
  }

  const fiscalForms = {
    async factura(f, fd, v) {
      const lineas = draftLines(f).filter(l => l.descripcion || l.precio);
      if (!lineas.length) throw new Error('Agrega al menos una línea.');
      if (lineas.some(l => !l.descripcion || l.precio == null)) throw new Error('Cada línea necesita descripción y precio.');
      const body = { moneda: v('moneda'), cliente: { app_id: v('cliente_id') || undefined, nombre: v('nombre'), rif: v('rif'), direccion: v('direccion'), correo: v('correo'), telefono: v('telefono') }, condiciones: v('condiciones'), vence: v('vence') || null, notas: v('notas'), pago_divisas: !!fd.get('pago_divisas'), lineas };
      const uid = f.dataset.uid;
      const doc = uid ? await put('/facturas/' + encodeURIComponent(uid), body) : await post('/facturas', body);
      docCache[doc.uid] = doc; F.at = 0; loadFiscal();
      const accion = f.dataset.submitter || 'guardar'; f.dataset.submitter = '';
      if (accion === 'emitir') { window.closeModal(); return emit(doc.uid); }
      return detailModal(doc.uid, 'Borrador guardado.');
    },
    async nota(f) {
      const lineas = draftLines(f).filter(l => l.descripcion || l.precio);
      if (!lineas.length || lineas.some(l => !l.descripcion || l.precio == null)) throw new Error('Cada línea necesita descripción y precio.');
      const motivo = await reasonSheet('Emitir la nota', 'Explica por qué se emite la nota. Queda en la auditoría.', 'Emitir la nota', true);
      if (!motivo) return;
      const r = await post(`/facturas/${encodeURIComponent(f.dataset.uid)}/nota`, { tipo: f.dataset.tipo, lineas, motivo });
      tap(14); say(`${r.titulo} N.° ${r.numero_texto} emitida`); docCache[r.uid] = r; return afterFiscalChange(r.uid, `${r.titulo} emitida con el N.° ${r.numero_texto}.`);
    },
    async control(f, fd, v) { const r = await post(`/facturas/${encodeURIComponent(f.dataset.uid)}/control`, { numero_control: v('numero_control'), asignado: v('asignado') }); say('Número de control registrado: ' + r.control); return afterFiscalChange(r.uid, 'Número de control registrado.'); },
    async perfil(f, fd, v) {
      await put('/fiscal/perfil', { razon_social: v('razon_social'), rif: v('rif'), domicilio: v('domicilio'), telefono: v('telefono'), correo: v('correo'), contribuyente_especial: !!fd.get('contribuyente_especial'), modo: v('modo'), serie: v('serie'), imprenta: { nombre: v('imp_nombre'), rif: v('imp_rif'), providencia: v('imp_prov'), fecha: v('imp_fecha') || null }, iva: { general: v('iva_g'), reducida: v('iva_r'), adicional_lujo: v('iva_a') }, igtf: { activo: !!fd.get('igtf_on'), alicuota: v('igtf') }, leyendas: v('leyendas') });
      window.closeModal(); say('Datos fiscales guardados'); F.at = 0; return loadFiscal();
    },
    async rango(f, fd, v) { await post('/fiscal/rangos', { prefijo: v('prefijo'), desde: +v('desde'), hasta: +v('hasta'), imprenta: v('imprenta'), rif_imprenta: v('rif_imprenta'), providencia: v('providencia'), fecha: v('fecha') }); say('Rango registrado'); F.at = 0; loadFiscal(); return rangesModal(); },
    async libro(f, fd, v) { return bookModal(v('p')); },
  };
  // qué botón envió el formulario de factura (guardar o emitir)
  document.addEventListener('click', e => { const b = e.target.closest('form[data-srv-form="factura"] button[type=submit]'); if (b) b.form.dataset.submitter = b.value; }, true);

  // ================================================================== 10. puente, sincronización y arranque
  const bridge = {
    facturas: () => FACT,
    isClosed: p => closed.has(p),
    can,
    session: () => S,
    editUntil,
    editModal,
    closeEdit: () => { if (S) S.edicion_hasta = null; post('/sesion/edicion/cerrar', {}).catch(() => {}); },
    auditIntegrity: () => auditState,
    entered() { showFlash(); refreshAudit(); setTimeout(notices, 1200); },
    logout,
    refresh,
    fiscalView,
    mountFiscal,
    ajustesGroup,
    exportData,
    importModal,
    ratesModal,
    quote,
    flush,
  };
  /** Avisos al entrar (según el rol) */
  async function notices() {
    if (!can('facturas.emitir')) return;
    try {
      const p = await get('/fiscal/perfil');
      if (!p.configurado && can('fiscal.configurar')) banner('Para emitir facturas fiscales, primero completa los datos fiscales de la empresa.', 'Completar', () => { location.hash = '#/facturero'; setTimeout(profileModal, 400); });
    } catch (e) {}
  }
  // cambios del equipo: se revisa cada 45 s con la pestaña visible (respuesta 304 si no hay nada nuevo)
  let hiddenAt = 0;
  async function poll() {
    if (!appLoaded || !S || document.hidden || dirty.size || flushing || $('.srv-sheet')) return;
    try {
      const ch = await pull(); if (!ch || !ch.length) return;
      const soft = ch.every(k => k === 'facturas' || k === 'agora_fin_audit' || k === 'agora_fin_tasas_v1' || k === 'agora_fin_pagos_v1');
      if (ch.includes('facturas') && window.agoraSrvSync) window.agoraSrvSync();
      const st = appState(); if (st && st.module === 'facturero') { F.at = 0; loadFiscal(); }
      if (!soft) banner('Tu equipo actualizó datos del tablero.', 'Actualizar', () => location.reload());
      else if (ch.includes('agora_fin_pagos_v1')) banner('Se registraron cobros nuevos.', 'Actualizar', () => location.reload());
    } catch (e) { /* sin conexión: se reintenta en la próxima vuelta */ }
  }
  // Ritmo de la revisión: 45 s mientras usas la app, 2 min si llevas 5 min sin tocarla y 5 min si pasas de 30;
  // con un ±20 % al azar para que miles de equipos no pregunten en el mismo segundo (15.000 personas a la vez).
  let lastAct = Date.now();
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => window.addEventListener(ev, () => { lastAct = Date.now(); }, { passive: true, capture: true }));
  const pollEvery = () => { const idle = Date.now() - lastAct; const base = idle > 1800000 ? 300000 : idle > 300000 ? 120000 : 45000; return Math.round(base * (0.8 + Math.random() * 0.4)); };
  (function loop() { setTimeout(() => { poll().finally(loop); }, pollEvery()); })();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); if (dirty.size || auditQ.length) flush({ keepalive: true }); return; }
    if (hiddenAt && Date.now() - hiddenAt > 120000 && appLoaded && !dirty.size) poll();
  });
  window.addEventListener('pagehide', () => { if (dirty.size || auditQ.length) flush({ keepalive: true }); });
  window.addEventListener('beforeunload', e => { if (offline && dirty.size) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('online', () => { if (dirty.size || auditQ.length) schedule(200); });

  // arranque: invitación (enlace del correo), sesión vigente o pantalla de acceso
  const inv = (location.hash.match(/invitacion=([A-Za-z0-9_-]{30,80})/) || [])[1];
  if (inv) { S = null; showInvitation(inv); }
  else if (S) start();
  else showLogin();
})();
