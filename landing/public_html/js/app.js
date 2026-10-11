/* =============================================================================
   Agora Digital App · Landing 3.0 — comportamiento
   Sin dependencias. Compatible con CSP estricta (sin innerHTML con datos,
   sin estilos en línea en el HTML: solo propiedades CSS desde JS).
   Índice: 1 utilidades · 2 seguridad · 3 tema y cabecera · 4 movimiento ·
   5 vitrina · 6 clientes · 7 módulos · 8 Athena y chat · 9 precios ·
   10 diagnóstico · 11 flotantes · 12 app instalable
   ============================================================================= */
(function () {
  'use strict';
  var A = window.Agora = window.Agora || {};
  var cfg = A.config || {};
  var doc = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var hasIO = 'IntersectionObserver' in window;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  /* Idioma: la página en inglés (en.html) lleva lang="en"; L(es, en) elige el texto */
  var EN = /^en/i.test(doc.lang || '');
  var L = function (es, en) { return EN ? en : es; };
  var PLAN_LABEL = EN ? { Bronce: 'Bronze', Plata: 'Silver', Oro: 'Gold', Diamante: 'Diamond' } : {};
  var planName = function (p) { return PLAN_LABEL[p] || p; };

  /* ======================= 1 · UTILIDADES ======================= */
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* no disponible */ } }
  };
  function track(event, data) {
    var payload = { event: event };
    if (data) Object.keys(data).forEach(function (k) { payload[k] = data[k]; });
    (window.dataLayer = window.dataLayer || []).push(payload);
  }
  function waUrl(text) {
    var n = String(cfg.whatsapp || '').replace(/\D/g, '');
    return n ? 'https://wa.me/' + n + (text ? '?text=' + encodeURIComponent(text) : '') : '';
  }
  function onView(el, cb, opts) {
    if (!el) return;
    if (!hasIO) { cb(true); return; }
    new IntersectionObserver(function (es) { es.forEach(function (en) { cb(en.isIntersecting, en); }); }, opts || { threshold: 0.3 }).observe(el);
  }
  function once(el, cb, threshold) {
    if (!el) return;
    if (!hasIO) { cb(); return; }
    var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); cb(); } }, { threshold: threshold == null ? 0.35 : threshold });
    io.observe(el);
  }
  /* Indicador elástico para controles segmentados (finanzas, antes/después, facturación) */
  function segIndicator(group, buttons, isOn) {
    var ind = document.createElement('span');
    ind.className = 'seg-ind';
    ind.setAttribute('aria-hidden', 'true');
    group.insertBefore(ind, group.firstChild);
    group.classList.add('has-ind');
    function place() {
      var on = buttons.filter(isOn)[0];
      if (!on) return;
      group.style.setProperty('--x', on.offsetLeft + 'px');
      group.style.setProperty('--w', on.offsetWidth + 'px');
    }
    place();
    if ('ResizeObserver' in window) new ResizeObserver(place).observe(group);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
    return place;
  }

  $$('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
  $$('[data-wa-link]').forEach(function (a) {
    var u = waUrl(a.getAttribute('data-wa-link'));
    if (u) a.href = u; else { a.href = 'mailto:' + cfg.email; a.removeAttribute('target'); }
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-track]');
    if (t) track(t.getAttribute('data-track'));
  });

  /* ======================= 2 · SEGURIDAD (cliente) =======================
     El navegador nunca es la barrera final: el servidor (api/) vuelve a
     validar, limitar y verificar. Esto reduce ruido y mejora la experiencia. */
  var S = (function () {
    var csrfToken = null, recaptchaReady = null;
    var CONTROL = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u200B-\\u200F\\u2028-\\u202E\\u2060-\\u206F\\uFEFF]', 'g');
    function sanitize(value, max) {
      var s = String(value == null ? '' : value);
      if (s.normalize) s = s.normalize('NFKC');
      s = s.replace(CONTROL, '').replace(/<[^>]*>?/g, '').replace(/[<>`]/g, '').replace(/javascript:|data:|vbscript:/gi, '').replace(/\s+/g, ' ').trim();
      return s.slice(0, max || 200);
    }
    function sanitizeMultiline(value, max) {
      return String(value == null ? '' : value).split(/\r?\n/).map(function (l) { return sanitize(l, max); }).join('\n').trim().slice(0, max || 500);
    }
    var rules = {
      name: function (v) { return /^[\p{L}][\p{L}\p{M}' .-]{1,79}$/u.test(v); },
      company: function (v) { return /^[\p{L}\p{N}][\p{L}\p{M}\p{N}&'.,() -]{1,79}$/u.test(v); },
      email: function (v) { return v.length <= 120 && /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,180}\.[A-Za-z]{2,24}$/.test(v); },
      phone: function (v) { var d = v.replace(/\D/g, ''); return d.length >= 7 && d.length <= 15 && /^[+\d][\d ()-]{6,19}$/.test(v); },
      date: function (v) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
        var d = new Date(v + 'T12:00:00');
        var today = new Date(); today.setHours(0, 0, 0, 0);
        return !isNaN(d) && d >= today && (cfg.workdays || [1, 2, 3, 4, 5]).indexOf(d.getDay()) > -1;
      },
      time: function (v) { return (cfg.slots || []).indexOf(v) > -1; }
    };
    function rateCheck(action, max, windowMs, cooldownMs) {
      var now = Date.now(), hits = [];
      try { hits = JSON.parse(store.get('agora-rl-' + action) || '[]').filter(function (t) { return typeof t === 'number' && now - t < windowMs; }); } catch (e) { hits = []; }
      var last = hits.length ? hits[hits.length - 1] : 0;
      if (cooldownMs && last && now - last < cooldownMs) return { ok: false, retryMs: cooldownMs - (now - last) };
      if (hits.length >= max) return { ok: false, retryMs: windowMs - (now - hits[0]) };
      return { ok: true, hits: hits };
    }
    function rateHit(action, hits) { hits.push(Date.now()); store.set('agora-rl-' + action, JSON.stringify(hits.slice(-20))); }
    function isHuman(form) {
      var hp = form.querySelector('input[name="website"]');
      if (hp && hp.value) return false;
      var opened = Number(form.getAttribute('data-opened') || 0);
      return !opened || Date.now() - opened >= (cfg.minFillMs || 2500);
    }
    function online() { return /^https?:$/.test(window.location.protocol); }
    function sameOrigin(url) { try { return new URL(url, window.location.href).origin === window.location.origin; } catch (e) { return false; } }
    function withTimeout(ms) {
      var ctrl = 'AbortController' in window ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms);
      return { signal: ctrl ? ctrl.signal : undefined, done: function () { clearTimeout(timer); } };
    }
    function fetchCsrf() {
      if (csrfToken) return Promise.resolve(csrfToken);
      if (!online()) return Promise.reject(new Error('offline'));
      var to = withTimeout(6000);
      return fetch(cfg.api.csrf, { method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: to.signal, headers: { Accept: 'application/json' } })
        .then(function (r) { to.done(); if (!r.ok) throw new Error('csrf'); return r.json(); })
        .then(function (j) {
          if (!j || typeof j.token !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(j.token)) throw new Error('csrf');
          csrfToken = j.token;
          return csrfToken;
        });
    }
    function loadRecaptcha() {
      if (!cfg.recaptchaSiteKey || !online()) return Promise.resolve(null);
      if (recaptchaReady) return recaptchaReady;
      recaptchaReady = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = 'https://www.google.com/recaptcha/api.js?render=' + encodeURIComponent(cfg.recaptchaSiteKey);
        s.async = true;
        s.onload = function () { window.grecaptcha.ready(function () { resolve(window.grecaptcha); }); };
        s.onerror = function () { reject(new Error('recaptcha')); };
        document.head.appendChild(s);
      });
      return recaptchaReady;
    }
    function recaptchaToken(action) {
      return loadRecaptcha().then(function (g) { return g ? g.execute(cfg.recaptchaSiteKey, { action: action }) : ''; }).catch(function () { return ''; });
    }
    function securePost(url, action, payload) {
      if (!online() || !sameOrigin(url)) return Promise.reject(new Error('offline'));
      return Promise.all([fetchCsrf(), recaptchaToken(action)]).then(function (res) {
        var body = Object.assign({}, payload, { csrf: res[0], recaptcha: res[1], action: action });
        var to = withTimeout(12000);
        return fetch(url, {
          method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: to.signal,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': res[0], 'X-Requested-With': 'fetch' },
          body: JSON.stringify(body)
        }).then(function (r) {
          to.done();
          return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, ok: r.ok, data: j }; });
        });
      });
    }
    function getJson(url) {
      if (!online() || !sameOrigin(url)) return Promise.reject(new Error('offline'));
      var to = withTimeout(6000);
      return fetch(url, { method: 'GET', credentials: 'same-origin', redirect: 'error', signal: to.signal, headers: { Accept: 'application/json' } })
        .then(function (r) { to.done(); if (!r.ok) throw new Error('http ' + r.status); return r.json(); });
    }
    return {
      sanitize: sanitize, sanitizeMultiline: sanitizeMultiline, rules: rules, rateCheck: rateCheck, rateHit: rateHit, isHuman: isHuman,
      securePost: securePost, getJson: getJson, prefetch: function () { fetchCsrf().catch(function () {}); loadRecaptcha().catch(function () {}); }
    };
  })();
  A.security = S;

  /* ======================= 3 · TEMA Y CABECERA ======================= */
  (function theme() {
    var btn = $('#theme-btn');
    var metas = $$('meta[name="theme-color"]');
    var swaps = $$('[data-src-dark]');
    swaps.forEach(function (img) { img.setAttribute('data-src-light', img.getAttribute('src')); });
    function set(mode, save) {
      var dark = mode === 'dark';
      doc.setAttribute('data-theme', dark ? 'dark' : 'light');
      swaps.forEach(function (img) { img.src = img.getAttribute(dark ? 'data-src-dark' : 'data-src-light'); });
      metas.forEach(function (m) { m.setAttribute('content', dark ? '#12152A' : '#F6F4F1'); });
      if (btn) {
        btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
        btn.setAttribute('aria-label', dark ? L('Activar modo claro', 'Switch to light mode') : L('Activar modo oscuro', 'Switch to dark mode'));
      }
      if (save) store.set('agora-theme', dark ? 'dark' : 'light');
    }
    if (btn) btn.addEventListener('click', function () { set(doc.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true); });
    set(doc.getAttribute('data-theme'), false);
  })();

  (function header() {
    var nav = $('#nav');
    if (nav) {
      var onScroll = function () { nav.classList.toggle('is-scrolled', window.scrollY > 6); };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
    /* Menús desplegables: clic, hover con mouse y teclado */
    var dds = $$('.dd');
    var closeTimer = null;
    function setDd(dd, open) {
      dd.classList.toggle('is-open', open);
      $('.dd-btn', dd).setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    function closeAll(except) { dds.forEach(function (d) { if (d !== except) setDd(d, false); }); }
    dds.forEach(function (dd) {
      var btn = $('.dd-btn', dd);
      var menu = $('.dd-menu', dd);
      btn.addEventListener('click', function (e) { e.stopPropagation(); var open = !dd.classList.contains('is-open'); closeAll(dd); setDd(dd, open); });
      if (finePointer) {
        dd.addEventListener('mouseenter', function () { clearTimeout(closeTimer); closeAll(dd); setDd(dd, true); });
        dd.addEventListener('mouseleave', function () { closeTimer = setTimeout(function () { setDd(dd, false); }, 160); });
      }
      btn.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowDown') return;
        e.preventDefault(); setDd(dd, true);
        var first = $('a', menu); if (first) first.focus();
      });
      menu.addEventListener('keydown', function (e) {
        var links = $$('a', menu), i = links.indexOf(document.activeElement);
        var n = e.key === 'ArrowDown' ? links[(i + 1) % links.length] : e.key === 'ArrowUp' ? links[(i - 1 + links.length) % links.length] : null;
        if (n) { e.preventDefault(); n.focus(); }
      });
      menu.addEventListener('click', function (e) { if (e.target.closest('a')) setDd(dd, false); });
      dd.addEventListener('focusout', function (e) { if (!dd.contains(e.relatedTarget)) setDd(dd, false); });
    });
    document.addEventListener('click', function () { closeAll(); });

    /* Menú móvil */
    var mBtn = $('.menu-btn');
    var mMenu = $('#m-menu');
    function setMenu(open) {
      if (!mMenu) return;
      mMenu.hidden = !open;
      mBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      mBtn.setAttribute('aria-label', open ? L('Cerrar menú', 'Close menu') : L('Abrir menú', 'Open menu'));
      doc.classList.toggle('has-menu', open);
    }
    if (mBtn && mMenu) {
      mBtn.addEventListener('click', function () { setMenu(mMenu.hidden); });
      mMenu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
      window.matchMedia('(min-width: 961px)').addEventListener('change', function (m) { if (m.matches) setMenu(false); });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var open = dds.filter(function (d) { return d.classList.contains('is-open'); })[0];
      closeAll();
      if (open) $('.dd-btn', open).focus();
      if (mMenu && !mMenu.hidden) { setMenu(false); mBtn.focus(); }
    });

    /* Sección activa en la barra */
    var links = $$('[data-spy]');
    if (hasIO && links.length) {
      var spy = new IntersectionObserver(function (es) {
        es.forEach(function (en) {
          var href = '#' + en.target.id;
          links.forEach(function (a) {
            if (a.getAttribute('href') !== href) { if (en.isIntersecting) a.classList.remove('is-current'); return; }
            a.classList.toggle('is-current', en.isIntersecting);
          });
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      links.forEach(function (a) { var s = $(a.getAttribute('href')); if (s) spy.observe(s); });
    }
  })();

  /* ======================= 4 · MOVIMIENTO ======================= */
  if (reduce) doc.classList.add('reduce');

  /* Revelado elástico: solo lo que está debajo del primer pantallazo */
  (function reveal() {
    if (reduce || !hasIO) return;
    var vh = window.innerHeight;
    var pending = $$('.reveal').filter(function (el) { return el.getBoundingClientRect().top > vh * 0.92; });
    pending.forEach(function (el) { el.classList.add('is-pending'); });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        var sibs = el.parentElement ? $$(':scope > .reveal.is-pending', el.parentElement) : [];
        el.style.transitionDelay = Math.min(Math.max(sibs.indexOf(el), 0), 4) * 70 + 'ms';
        el.classList.remove('is-pending');
        io.unobserve(el);
        setTimeout(function () { el.style.transitionDelay = ''; }, 1200);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });
    pending.forEach(function (el) { io.observe(el); });
    window.addEventListener('beforeprint', function () { $$('.reveal.is-pending').forEach(function (el) { el.classList.remove('is-pending'); }); });
  })();

  /* Contadores (42 horas, 23 %, 7 veces) */
  (function counters() {
    if (reduce || !hasIO) return;
    $$('[data-count]').forEach(function (el) {
      if (el.getBoundingClientRect().top < window.innerHeight) return;
      once(el, function () {
        var end = Number(el.getAttribute('data-count'));
        var start = performance.now(), dur = 1300;
        el.textContent = '0';
        (function frame(now) {
          var p = Math.min(1, (now - start) / dur);
          el.textContent = String(Math.round(end * (p === 1 ? 1 : 1 - Math.pow(2, -10 * p))));
          if (p < 1) requestAnimationFrame(frame);
          else {
            el.classList.add('is-done');
            if (el.animate) el.animate([{ scale: 1 }, { scale: 1.12 }, { scale: 1 }], { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' });
          }
        })(start);
      }, 0.6);
    });
  })();

  /* Historia: "Te escribieron el martes…" se arma burbuja a burbuja */
  (function story() {
    var st = $('[data-story]');
    if (!st || reduce || !hasIO) return;
    var bubs = $$('.bub', st), timers = [], playing = false;
    function clear() { timers.forEach(clearTimeout); timers = []; }
    function play() {
      if (playing) return;
      playing = true;
      bubs.forEach(function (b, i) { timers.push(setTimeout(function () { b.classList.add('is-in'); }, 250 + i * 750)); });
      timers.push(setTimeout(function () {
        bubs.forEach(function (b) { b.classList.remove('is-in'); });
        playing = false;
        timers.push(setTimeout(play, 600));
      }, 250 + bubs.length * 750 + 5200));
    }
    st.classList.add('is-armed');
    onView(st, function (vis) {
      if (vis) play();
      else { clear(); playing = false; bubs.forEach(function (b) { b.classList.add('is-in'); }); }
    }, { threshold: 0.45 });
  })();

  /* Las cintas en bucle solo se mueven cuando están en pantalla */
  function pauseOffscreen(el) {
    onView(el, function (vis) { el.classList.toggle('is-off', !vis); }, { threshold: 0 });
  }

  /* ======================= 5 · VITRINA DEL PRODUCTO =======================
     Capturas en HTML (no imágenes): nítidas en cualquier pantalla. El CRM se
     dibuja a 1280 × 720 reales y se escala; el alto del escenario es fijo
     para que nada salte (CLS 0) al rotar las pestañas. */
  (function showcase() {
    var tabsBox = $('.sc-tabs');
    var stage = $('.sc-stage');
    if (!tabsBox || !stage) return;
    var tabs = $$('.sc-tab', tabsBox);
    var url = $('#sc-url');
    var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute('aria-controls')); });
    var scaled = $$('[data-scale], .cx-scale', stage).filter(function (v, i, a) { return a.indexOf(v) === i; });
    var flows = panels.filter(function (p) { return p.classList.contains('sc-panel--flow'); });
    var current = 0, auto = !reduce, inView = false, hover = false;

    /* Barras del embudo y reportes: se llenan cada vez que se muestran */
    function fillBars(scope, on) {
      $$('[data-w]', scope).forEach(function (el) { el.style.setProperty('--w', on ? el.getAttribute('data-w') + '%' : '0%'); });
    }
    panels.forEach(function (p) { fillBars(p, false); });

    /* Flujo de automatización: el paso activo "late" */
    var nodes = $$('.wfx-canvas .node', stage);
    var step = 0, flowTimer = null;
    var lastStep = nodes.reduce(function (m, n) { return Math.max(m, Number(n.getAttribute('data-step')) || 0); }, 0);
    function flowTick() {
      nodes.forEach(function (n) { n.classList.toggle('is-live', Number(n.getAttribute('data-step')) === step); });
      step = step >= lastStep ? 0 : step + 1;
    }
    function flowRun(on) {
      clearInterval(flowTimer); flowTimer = null;
      if (on && !reduce && nodes.length) { flowTick(); flowTimer = setInterval(flowTick, 1300); }
    }

    function layout() {
      var W = stage.clientWidth;
      if (!W) return;
      var compact = W < 640;
      var H;
      /* Alto natural de cada panel fluido (medido sin pintar) */
      var natural = flows.map(function (p) {
        var child = p.firstElementChild;
        var wasHidden = p.hidden;
        p.hidden = false;
        p.classList.add('is-measure');
        child.style.setProperty('--fs', '1');
        child.style.height = 'auto';
        var h = child.scrollHeight;
        child.style.height = '';
        p.classList.remove('is-measure');
        p.hidden = wasHidden;
        return h;
      });
      var maxFlow = Math.max.apply(null, natural.concat([0]));
      if (compact) H = Math.min(Math.max(maxFlow, 400), 470);
      else H = Math.round(720 * W / 1280);
      var s = compact ? H / 720 : W / 1280;
      stage.style.setProperty('--sc-h', H + 'px');
      scaled.forEach(function (box) {
        box.style.setProperty('--s', s.toFixed(4));
        var panel = box.closest('.sc-panel');
        if (panel) panel.classList.toggle('is-wide', 1280 * s > W + 1);
      });
      /* Si un panel fluido no cabe, se reduce con escala (nunca se recorta) */
      flows.forEach(function (p, i) {
        var child = p.firstElementChild;
        var fs = natural[i] > H ? H / natural[i] : 1;
        child.style.setProperty('--fs', fs.toFixed(4));
        p.classList.toggle('is-fit', fs < 1);
      });
      var hint = $('.swipe-hint');
      if (hint) hint.hidden = !compact;
    }

    function show(i, user) {
      current = i;
      tabs.forEach(function (t, k) {
        var on = k === i;
        t.classList.toggle('is-on', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        panels[k].hidden = !on;
        panels[k].classList.toggle('is-on', on);
        if (on) {
          fillBars(panels[k], false);
          requestAnimationFrame(function () { requestAnimationFrame(function () { fillBars(panels[k], true); }); });
          if (panels[k].classList.contains('is-wide')) panels[k].scrollLeft = 0;
        }
      });
      flowRun(panels[i].querySelector('.wfx-canvas') !== null && inView);
      if (url) {
        url.classList.add('is-swap');
        setTimeout(function () { url.textContent = tabs[i].getAttribute('data-url'); url.classList.remove('is-swap'); }, 150);
      }
      if (user) {
        auto = false;
        tabsBox.classList.remove('is-auto');
        track('showcase_tab', { tab: tabs[i].id });
      } else restartProgress();
      /* La pestaña activa siempre visible en la tira (móvil) */
      var t = tabs[i];
      var left = t.offsetLeft - (tabsBox.clientWidth - t.offsetWidth) / 2;
      if (tabsBox.scrollWidth > tabsBox.clientWidth) tabsBox.scrollTo({ left: left, behavior: reduce ? 'auto' : 'smooth' });
    }
    function restartProgress() {
      var p = $('.sc-tab.is-on .sc-prog', tabsBox);
      if (!p) return;
      p.style.animation = 'none';
      void p.offsetWidth;
      p.style.animation = '';
    }
    function syncPause() { tabsBox.classList.toggle('is-paused', !inView || hover || document.hidden); }

    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { show(i, true); });
      t.addEventListener('keydown', function (e) {
        var n = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
        if (n !== null) { e.preventDefault(); show(n, true); tabs[n].focus(); }
      });
      $('.sc-prog', t).addEventListener('animationend', function () { if (auto) show((i + 1) % tabs.length, false); });
    });
    if (auto) tabsBox.classList.add('is-auto');
    if (finePointer) {
      stage.addEventListener('mouseenter', function () { hover = true; syncPause(); });
      stage.addEventListener('mouseleave', function () { hover = false; syncPause(); });
    }
    /* Tocar o deslizar la captura en móvil también la "toma" el usuario */
    stage.addEventListener('touchstart', function () { if (auto) { auto = false; tabsBox.classList.remove('is-auto'); } }, { passive: true });
    document.addEventListener('visibilitychange', syncPause);
    onView(stage, function (vis) {
      inView = vis; syncPause();
      flowRun(vis && panels[current].querySelector('.wfx-canvas') !== null);
      if (vis) fillBars(panels[current], true);
    }, { threshold: 0.25 });
    layout();
    if ('ResizeObserver' in window) {
      var lastW = 0;
      new ResizeObserver(function () { if (stage.clientWidth !== lastW) { lastW = stage.clientWidth; layout(); } }).observe(stage);
    } else window.addEventListener('resize', layout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    syncPause();
  })();

  /* ======================= 6 · CLIENTES (cinta + ficha) ======================= */
  (function clients() {
    var list = (cfg.clients || []).filter(function (c) { return c && c.name; });
    var about = function (c) { return (EN && c.about_en) || c.about || ''; };
    var box = $('[data-clients]');
    var trackEl = $('[data-mtrack]');
    var tip = $('#client-tip');
    if (!box || !trackEl || !list.length) { if (box) box.closest('section').hidden = true; return; }
    function item(c, i, dup) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'client';
      b.setAttribute('data-i', String(i));
      if (dup) { b.setAttribute('aria-hidden', 'true'); b.tabIndex = -1; } else b.setAttribute('aria-label', c.name + (about(c) ? ': ' + about(c) : ''));
      var word = function () { var w = document.createElement('span'); w.className = 'word'; w.textContent = c.name; return w; };
      if (c.logo) {
        var img = new Image();
        img.alt = '';
        img.decoding = 'async';
        if (c.w && c.h) { img.width = c.w; img.height = c.h; }
        img.addEventListener('error', function () { b.replaceChildren(word()); });
        img.src = c.logo;
        b.appendChild(img);
      } else b.appendChild(word());
      var li = document.createElement('li');
      li.appendChild(b);
      return li;
    }
    /* Se repite la lista hasta llenar el ancho y se duplica para un bucle sin saltos */
    var base = [];
    while (base.length < 10) list.forEach(function (c, i) { base.push([c, i]); });
    [false, true].forEach(function (dup) { base.forEach(function (p, k) { trackEl.appendChild(item(p[0], p[1], dup || k >= list.length)); }); });
    trackEl.style.setProperty('--dur', base.length * 4.5 + 's');
    pauseOffscreen(box);

    function showTip(b) {
      var c = list[Number(b.getAttribute('data-i'))];
      $$('.client.is-on', trackEl).forEach(function (x) { x.classList.remove('is-on'); });
      b.classList.add('is-on');
      var name = document.createElement('b'); name.textContent = c.name;
      var parts = [name];
      if (c.handle) { var h = document.createElement('span'); h.className = 'h'; h.textContent = '@' + c.handle; parts.push(h); }
      var p = document.createElement('p'); p.textContent = about(c) || L('Cliente de Agora Digital App.', 'Agora Digital App client.'); parts.push(p);
      tip.replaceChildren.apply(tip, parts);
      tip.hidden = false;
      var r = b.getBoundingClientRect(), w = tip.offsetWidth, hgt = tip.offsetHeight;
      var left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
      tip.style.left = left + 'px';
      tip.style.top = (r.top - hgt - 12) + 'px';
      tip.style.setProperty('--ax', (r.left + r.width / 2 - left) + 'px');
      box.classList.add('is-hold');
    }
    function hideTip() { tip.hidden = true; box.classList.remove('is-hold'); $$('.client.is-on', trackEl).forEach(function (x) { x.classList.remove('is-on'); }); }
    trackEl.addEventListener('pointerover', function (e) { var b = e.target.closest('.client'); if (b && e.pointerType === 'mouse') showTip(b); });
    trackEl.addEventListener('focusin', function (e) { var b = e.target.closest('.client'); if (b) showTip(b); });
    trackEl.addEventListener('click', function (e) { var b = e.target.closest('.client'); if (b) { if (b.classList.contains('is-on') && e.pointerType !== 'mouse') hideTip(); else showTip(b); } });
    box.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hideTip(); });
    trackEl.addEventListener('focusout', hideTip);
    window.addEventListener('scroll', function () { if (!tip.hidden) hideTip(); }, { passive: true });
  })();

  /* ======================= 7 · MÓDULOS ======================= */
  /* Luz que sigue al cursor en las tarjetas */
  if (finePointer) $$('.b-card').forEach(function (c) {
    c.addEventListener('pointermove', function (e) {
      var r = c.getBoundingClientRect();
      c.style.setProperty('--mx', e.clientX - r.left + 'px');
      c.style.setProperty('--my', e.clientY - r.top + 'px');
    });
  });
  $$('.b-card').forEach(function (c) { once(c, function () { c.classList.add('is-seen'); }, 0.5); });

  /* Antes / Después: el contraste se demuestra solo la primera vez */
  (function beforeAfter() {
    var sw = $('.ba-switch');
    var root = $('[data-ba-root]');
    if (!sw || !root) return;
    var btns = $$('button', sw), touched = false;
    var place = segIndicator(sw, btns, function (b) { return b.getAttribute('aria-pressed') === 'true'; });
    function set(mode) {
      btns.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-ba') === mode ? 'true' : 'false'); });
      sw.setAttribute('data-mode', mode);
      root.setAttribute('data-mode', mode);
      place();
    }
    btns.forEach(function (b) { b.addEventListener('click', function () { touched = true; set(b.getAttribute('data-ba')); track('before_after', { mode: b.getAttribute('data-ba') }); }); });
    set('despues');
    if (reduce) return;
    once(root, function () {
      if (touched) return;
      set('antes');
      setTimeout(function () { if (!touched) set('despues'); }, 1900);
    }, 0.25);
  })();

  /* Mini chat "Responde aunque no estés conectado" */
  (function chatMini() {
    var box = $('[data-chat-mini]');
    if (!box || reduce || !hasIO) return;
    var items = Array.prototype.slice.call(box.children);
    var timers = [];
    box.classList.add('is-armed');
    onView(box, function (vis) {
      timers.forEach(clearTimeout); timers = [];
      if (!vis) { items.forEach(function (it) { it.classList.add('is-in'); }); return; }
      items.forEach(function (it) { it.classList.remove('is-in'); });
      items.forEach(function (it, i) { timers.push(setTimeout(function () { it.classList.add('is-in'); }, 200 + i * 650)); });
    }, { threshold: 0.6 });
  })();

  /* Finanzas: Resumen / Cobranza */
  (function finance() {
    var seg = $('.fin-shot .seg');
    if (!seg) return;
    var tabs = $$('[role="tab"]', seg);
    var place = segIndicator(seg, tabs, function (t) { return t.classList.contains('is-on'); });
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.classList.toggle('is-on', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        var img = document.getElementById(t.getAttribute('aria-controls'));
        if (img) { img.classList.toggle('is-on', on); img.setAttribute('aria-hidden', on ? 'false' : 'true'); }
      });
      place();
      if (focus) tab.focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t); });
      t.addEventListener('keydown', function (e) {
        var n = e.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length] : e.key === 'ArrowLeft' ? tabs[(i - 1 + tabs.length) % tabs.length] : null;
        if (n) { e.preventDefault(); select(n, true); }
      });
    });
    select(tabs[0]);
  })();

  /* Integraciones */
  $$('.ix-marquee').forEach(pauseOffscreen);

  /* ======================= 8 · ATHENA Y CHAT ======================= */
  /* Conversación que se escribe sola al entrar en pantalla. Las burbujas ya
     ocupan su lugar desde el inicio (invisibles): nada se mueve al aparecer. */
  (function athenaChat() {
    var chat = $('[data-athena-chat]');
    if (!chat) return;
    var lines = EN
      ? ['Hi, I’m Athena. 👋', 'When someone asks, they’re paying attention.', 'You don’t have to live glued to your phone.', 'Want me to show you, free, how this could work for your business?']
      : ['Hola, soy Athena. 👋', 'Cuando alguien pregunta, está prestando atención.', 'No tienes que vivir pegado al teléfono.', '¿Te muestro, sin costo, cómo podría funcionar en tu negocio?'];
    var bubbles = lines.map(function (text) { var p = document.createElement('p'); p.textContent = text; chat.appendChild(p); return p; });
    if (reduce || !hasIO) return;
    bubbles.forEach(function (p) { p.classList.add('is-wait'); });
    once(chat, function () {
      var dots = document.createElement('p');
      dots.className = 'is-typing';
      dots.setAttribute('aria-hidden', 'true');
      for (var k = 0; k < 3; k++) dots.appendChild(document.createElement('i'));
      bubbles.reduce(function (chain, p) {
        return chain.then(function () {
          dots.style.setProperty('--ty', p.offsetTop + 'px');
          chat.appendChild(dots);
          return wait(850).then(function () { dots.remove(); p.classList.remove('is-wait'); return wait(420); });
        });
      }, Promise.resolve());
    }, 0.4);
  })();

  /* Athena en escena: gestos guionados y mirada que sigue el cursor */
  var GESTURES = ['g-happy', 'g-tilt-r', 'g-tilt-l', 'g-nod', 'g-look-l', 'g-look-ru', 'g-look-rd', 'g-look-up'];
  function setGesture(rig, g) {
    GESTURES.forEach(function (c) { rig.classList.remove(c); });
    if (g) g.split(' ').forEach(function (c) { rig.classList.add(c); });
  }
  (function athenaStage() {
    var stage = $('#ath-stage');
    var btn = $('#ath-toggle');
    if (!stage || !btn) return;
    var rig = $('.rig', stage), bubble = $('#ath-bubble'), cards = $$('.scard', stage);
    var SCRIPT = [
      { g: 'g-happy g-tilt-r', say: L('¡Hola! Soy Athena.', 'Hi! I’m Athena.'), card: 0, ms: 2600 },
      { g: 'g-look-l', say: L('Respondo a cualquier hora.', 'I reply at any hour.'), card: 1, ms: 2700 },
      { g: 'g-look-ru g-nod', say: L('Te recuerdo los cobros.', 'I remind you about payments.'), card: 2, ms: 2900 },
      { g: 'g-look-rd g-tilt-l', say: L('Y agendo tus citas.', 'And I book your appointments.'), card: 3, ms: 2700 },
      { g: 'g-happy g-look-up', say: L('¿Empezamos?', 'Shall we start?'), card: 0, ms: 2600 },
      { g: '', say: '', card: 0, ms: 1400 }
    ];
    var step = 0, timer = null, visible = false, userPaused = reduce, follow = null;
    function show(n) {
      var s = SCRIPT[n];
      setGesture(rig, s.g);
      cards.forEach(function (c) { c.classList.toggle('is-on', Number(c.getAttribute('data-card')) === s.card); });
      bubble.classList.remove('is-in');
      if (s.say) setTimeout(function () { bubble.textContent = s.say; bubble.classList.add('is-in'); }, 160);
    }
    function tick() { show(step); timer = setTimeout(function () { step = (step + 1) % SCRIPT.length; tick(); }, SCRIPT[step].ms); }
    function paint() {
      var paused = !timer;
      btn.classList.toggle('is-paused', paused);
      btn.setAttribute('aria-label', paused ? L('Reproducir animación', 'Play animation') : L('Pausar animación', 'Pause animation'));
    }
    function play() { if (timer || userPaused || !visible) return; stage.classList.remove('is-paused'); tick(); paint(); }
    function stop() { clearTimeout(timer); timer = null; stage.classList.add('is-paused'); paint(); }
    btn.addEventListener('click', function () { userPaused = !!timer; if (timer) stop(); else { visible = true; userPaused = false; play(); } });
    onView(stage, function (vis) { visible = vis; if (vis) play(); else stop(); }, { threshold: 0.35 });
    if (reduce) { show(0); stop(); }
    if (finePointer) stage.addEventListener('pointermove', function (e) {
      if (!timer) return;
      var r = rig.getBoundingClientRect();
      var dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width * 0.56)) / (r.width * 0.8)));
      var dy = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height * 0.33)) / (r.height * 0.8)));
      rig.style.setProperty('--lx', (dx * 1.8).toFixed(2) + 'cqw');
      rig.style.setProperty('--ly', (dy * 1.2).toFixed(2) + 'cqw');
      clearTimeout(follow);
      follow = setTimeout(function () { rig.style.removeProperty('--lx'); rig.style.removeProperty('--ly'); }, 1200);
    });
    paint();
  })();

  /* Botón flotante de Athena: saluda cada tanto */
  (function fabRig() {
    var rig = $('.rig--fab');
    if (!rig || reduce) return;
    setInterval(function () {
      if (document.hidden) return;
      setGesture(rig, 'g-happy g-tilt-r');
      setTimeout(function () { setGesture(rig, ''); }, 1700);
    }, 7000);
  })();

  /* Chat de GoHighLevel: se carga al pedirlo (no frena la primera pintura).
     Si no carga, se abre WhatsApp; si no hay WhatsApp, el diagnóstico. */
  (function chat() {
    var g = cfg.ghl || {};
    var loading = null;
    var fab = $('#ath-fab');
    function load() {
      if (!g.widgetId || !/^https?:$/.test(window.location.protocol)) return Promise.resolve(false);
      if (loading) return loading;
      loading = new Promise(function (res) {
        var s = document.createElement('script');
        s.src = g.loaderSrc;
        s.async = true;
        s.setAttribute('data-resources-url', g.resourcesUrl);
        s.setAttribute('data-widget-id', g.widgetId);
        s.onload = function () { res(true); };
        s.onerror = function () { res(false); };
        document.body.appendChild(s);
      });
      return loading;
    }
    function waitFor(fn, ms) {
      return new Promise(function (res) {
        var t0 = Date.now();
        (function poll() { var v = fn(); if (v || Date.now() - t0 > (ms || 6000)) return res(v); setTimeout(poll, 150); })();
      });
    }
    function ready() { document.body.classList.add('chat-ready'); if (fab) fab.classList.add('is-hidden'); }
    function open(trigger) {
      track('chat_open');
      if (trigger) trigger.setAttribute('aria-busy', 'true');
      return load().then(function (ok) {
        if (!ok) return false;
        return waitFor(function () { return window.leadConnector && window.leadConnector.chatWidget; }).then(function (api) {
          if (api && typeof api.openWidget === 'function') { api.openWidget(); ready(); return true; }
          return waitFor(function () { return document.querySelector('chat-widget'); }).then(function (host) {
            var b = host && host.shadowRoot && host.shadowRoot.querySelector('button');
            if (b) { b.click(); ready(); return true; }
            return false;
          });
        });
      }).then(function (done) {
        if (trigger) trigger.removeAttribute('aria-busy');
        if (done) return;
        var u = waUrl(L('Hola Athena, tengo una pregunta sobre Agora Digital App.', 'Hi Athena, I have a question about Agora Digital App.'));
        if (u) window.open(u, '_blank', 'noopener');
        else { var d = $('#diagnostico'); if (d) d.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); }
      });
    }
    $$('[data-open-chat]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); open(b); });
      /* Calienta la conexión cuando hay intención (cursor encima o foco) */
      ['pointerenter', 'focus'].forEach(function (ev) { b.addEventListener(ev, function () { load(); }, { once: true }); });
    });
    A.openChat = open;
  })();

  /* ======================= 9 · PRECIOS ======================= */
  (function pricing() {
    var box = $('.billing');
    var plans = $$('.plan[data-price]');
    if (!box || !plans.length) return;
    var btns = $$('[data-billing]', box);
    var place = segIndicator(box, btns, function (b) { return b.getAttribute('aria-pressed') === 'true'; });
    var months = cfg.annualMonths || 10;
    function tween(el, from, to) {
      if (reduce || from === to) { el.textContent = String(to); return; }
      var t0 = performance.now(), dur = 520;
      (function f(now) {
        var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        el.textContent = String(Math.round(from + (to - from) * e));
        if (p < 1) requestAnimationFrame(f);
      })(t0);
    }
    function set(yearly) {
      btns.forEach(function (b) { b.setAttribute('aria-pressed', (b.getAttribute('data-billing') === 'y') === yearly ? 'true' : 'false'); });
      place();
      plans.forEach(function (p) {
        var m = Number(p.getAttribute('data-price'));
        var amount = $('[data-amount]', p);
        tween(amount, Number(amount.textContent) || m, yearly ? m * months : m);
        $('[data-per]', p).textContent = yearly ? L('/año', '/yr') : L('/mes', '/mo');
        $('[data-save]', p).textContent = yearly ? L('Ahorras USD ' + m * (12 - months) + ' al año', 'You save USD ' + m * (12 - months) + ' a year') : '';
      });
    }
    btns.forEach(function (b) { b.addEventListener('click', function () { set(b.getAttribute('data-billing') === 'y'); track('billing', { mode: b.getAttribute('data-billing') }); }); });
    set(false);

    /* Carrusel en móvil: arranca centrado en el plan recomendado + puntos */
    var rail = $('[data-rail]');
    var dots = $$('[data-rail-dots] i');
    if (rail) {
      var center = function () {
        var rec = $('.plan--rec', rail);
        if (rec && rail.scrollWidth > rail.clientWidth + 2) rail.scrollLeft = rec.offsetLeft - (rail.clientWidth - rec.offsetWidth) / 2;
      };
      var syncDots = function () {
        if (!dots.length) return;
        var mid = rail.scrollLeft + rail.clientWidth / 2, best = 0, bestD = Infinity;
        plans.forEach(function (p, i) { var d = Math.abs(p.offsetLeft + p.offsetWidth / 2 - mid); if (d < bestD) { bestD = d; best = i; } });
        dots.forEach(function (d, i) { d.classList.toggle('is-on', i === best); });
      };
      center(); syncDots();
      rail.addEventListener('scroll', function () { window.requestAnimationFrame(syncDots); }, { passive: true });
      window.matchMedia('(max-width: 640px)').addEventListener('change', function () { center(); syncDots(); });
    }
  })();

  /* ======================= 10 · DIAGNÓSTICO GRATIS ======================= */
  (function diagnostico() {
    var form = $('#f-diag');
    if (!form) return;
    var okBox = $('#form-ok'), okP = $('#form-ok-p');
    var progress = $('#f-progress'), fill = progress && $('.progress-fill', progress), bar = progress && $('[role="progressbar"]', progress);
    var pText = $('#f-progress-t'), pNum = $('#f-progress-n');
    var dateInput = $('#f-date'), slotsLeft = $('#f-slots-left'), team = $('#f-team'), hint = $('[data-hint]');
    var submit = $('[type="submit"]', form);
    var OK_TEXT = okP ? okP.textContent : '';
    var PLAN_BY_TEAM = { '1-3': 'Bronce', '4-10': 'Plata', '11-20': 'Oro', '21+': 'Diamante' };
    var SCHEMA = {
      objetivo: { oneOf: ['crm', 'finanzas', 'ambos'], required: true },
      nombre: { rule: 'name', required: true, max: 80, err: L('Escribe tu nombre y apellido, solo con letras.', 'Enter your first and last name, letters only.') },
      telefono: { rule: 'phone', required: true, max: 20, err: L('Escribe un número de WhatsApp válido, entre 7 y 15 dígitos.', 'Enter a valid WhatsApp number, 7 to 15 digits.') },
      equipo: { oneOf: ['1-3', '4-10', '11-20', '21+'], required: true, err: L('Elige cuántas personas son en tu equipo.', 'Choose how many people are on your team.') },
      fecha: { rule: 'date', required: true, max: 10, err: L('Elige un día hábil (lunes a viernes) a partir de hoy.', 'Choose a weekday (Monday to Friday) from today on.') },
      hora: { rule: 'time', required: true, max: 5, err: L('Elige una hora disponible.', 'Choose an available time.') },
      empresa: { rule: 'company', required: false, max: 80, err: L('Revisa el nombre de la empresa.', 'Check the company name.') },
      correo: { rule: 'email', required: false, max: 120, err: L('Revisa el correo: debe tener el formato nombre@empresa.com.', 'Check the email: it should look like name@company.com.') },
      mensaje: { multiline: true, required: false, max: 500 },
      plan: { oneOf: ['', 'Bronce', 'Plata', 'Oro', 'Diamante'], required: false }
    };
    var PROGRESS = ['nombre', 'telefono', 'equipo', 'fecha', 'hora'];
    var M = {
      shake: function (el) {
        if (reduce || !el) return;
        el.classList.remove('is-shake'); void el.offsetWidth; el.classList.add('is-shake');
        el.addEventListener('animationend', function done() { el.classList.remove('is-shake'); el.removeEventListener('animationend', done); });
      },
      celebrate: function (host) {
        if (reduce || !host) return;
        var COLORS = ['#AD103C', '#FABD4B', '#282E49', '#1E7A45', '#F7C96B', '#D9446C'];
        var frag = document.createDocumentFragment();
        for (var i = 0; i < 30; i++) {
          var p = document.createElement('i');
          p.className = 'confetti';
          p.setAttribute('aria-hidden', 'true');
          var ang = (Math.random() * 300 - 150) * Math.PI / 180, dist = 90 + Math.random() * 130;
          p.style.setProperty('--dx', Math.round(Math.sin(ang) * dist * 1.3) + 'px');
          p.style.setProperty('--dy', Math.round(-Math.cos(ang) * dist + 60 + Math.random() * 80) + 'px');
          p.style.setProperty('--r', Math.round(Math.random() * 720 - 360) + 'deg');
          p.style.setProperty('--c', COLORS[i % COLORS.length]);
          p.style.animationDelay = Math.round(Math.random() * 120) + 'ms';
          if (i % 3 === 0) p.style.borderRadius = '50%';
          frag.appendChild(p);
        }
        host.appendChild(frag);
        setTimeout(function () { $$('.confetti', host).forEach(function (c) { c.remove(); }); }, 1800);
      }
    };

    function raw(name) {
      var el = form.elements[name];
      return el ? (el.value || '') : '';
    }
    function clean(spec, v) { return spec.multiline ? S.sanitizeMultiline(v, spec.max) : S.sanitize(v, spec.max || 120); }
    function valid(spec, v) {
      if (!v) return !spec.required;
      if (spec.rule) return S.rules[spec.rule](v);
      if (spec.oneOf) return spec.oneOf.indexOf(v) > -1;
      return true;
    }
    function paint(name, state, msg) {
      var el = form.elements[name];
      if (!el) return;
      if (typeof RadioNodeList !== 'undefined' && el instanceof RadioNodeList) {
        var fs = el[0] && el[0].closest('fieldset');
        if (fs) { fs.classList.toggle('is-invalid', state === 'bad'); if (state === 'bad') M.shake(fs); }
        return;
      }
      var field = el.closest('.field');
      var box = field && $('.field-msg', field);
      el.setAttribute('aria-invalid', state === 'bad' ? 'true' : 'false');
      if (field) field.classList.toggle('is-ok', state === 'ok' && !!$('.field-ok', field));
      if (box) box.textContent = state === 'bad' ? (msg || '') : '';
      if (state === 'bad') M.shake(el);
    }
    function liveCheck(name, strict) {
      var spec = SCHEMA[name];
      var v = clean(spec, raw(name));
      if (!v) { paint(name, strict && spec.required ? 'bad' : 'idle', spec.err); return; }
      if (valid(spec, v)) paint(name, 'ok'); else if (strict) paint(name, 'bad', spec.err);
    }
    var lastPct = -1;
    function updateProgress() {
      if (!progress) return;
      var done = PROGRESS.filter(function (n) { var v = clean(SCHEMA[n], raw(n)); return v && valid(SCHEMA[n], v); }).length;
      var pct = Math.round(done / PROGRESS.length * 100), left = PROGRESS.length - done;
      fill.style.setProperty('--p', pct + '%');
      bar.setAttribute('aria-valuenow', String(pct));
      pNum.textContent = pct + ' %';
      pText.textContent = left === 0 ? L('¡Listo! Solo pulsa el botón', 'All set! Just press the button') : left === 1 ? L('¡Vas muy bien! Te falta 1 dato', 'Almost there! 1 field left') : L('Te faltan ' + left + ' datos', left + ' fields left');
      progress.classList.toggle('is-done', left === 0);
      if (pct === 100 && lastPct !== 100 && lastPct !== -1 && !reduce) {
        if (fill.animate) fill.animate([{ scale: '1 1' }, { scale: '1 1.5' }, { scale: '1 1' }], { duration: 500, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        submit.classList.remove('is-shine'); void submit.offsetWidth; submit.classList.add('is-shine');
      }
      lastPct = pct;
    }
    function setHint(text) { if (!hint) return; hint.textContent = ''; if (!text) { hint.hidden = true; return; } hint.hidden = false; hint.append.apply(hint, text); }
    function paintHint() {
      var chosen = form.elements.plan.value;
      if (chosen) { var b = document.createElement('b'); b.textContent = L('Plan ' + chosen, planName(chosen) + ' plan'); setHint(EN ? ['You chose the ', b, '. We’ll confirm it’s the right fit on the call.'] : ['Elegiste el ', b, '. En el diagnóstico confirmamos que sea el adecuado para ti.']); return; }
      var p = PLAN_BY_TEAM[team.value];
      if (!p) { setHint(null); return; }
      var bb = document.createElement('b'); bb.textContent = L('Plan ' + p, planName(p) + ' plan');
      setHint(EN ? ['For your team we suggest the ', bb, '. We’ll confirm it on the call.'] : ['Para tu equipo te sugerimos el ', bb, '. Lo confirmamos en el diagnóstico.']);
    }

    /* Hora actual en UTC−4 (zona de los horarios del diagnóstico) */
    function tzNow() {
      var o = {};
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Etc/GMT+4', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
        .formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; });
      return { date: o.year + '-' + o.month + '-' + o.day, minutes: (Number(o.hour) % 24) * 60 + Number(o.minute) };
    }
    var iso = function (x) { return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    var WORK = cfg.workdays || [1, 2, 3, 4, 5];
    var radios = $$('input[name="hora"]', form);
    var slotReq = 0;
    /* Escasez real: se apagan los horarios pasados u ocupados en el servidor (nunca se inventan) */
    function refreshSlots() {
      var date = dateInput.value, now = tzNow();
      function past(v) { var hm = v.split(':'); return date === now.date && Number(hm[0]) * 60 + Number(hm[1]) <= now.minutes + 60; }
      function apply(taken) {
        radios.forEach(function (r) {
          var off = past(r.value) || taken.indexOf(r.value) > -1;
          r.disabled = off;
          if (off && r.checked) r.checked = false;
        });
        updateProgress();
      }
      apply([]);
      slotsLeft.textContent = '';
      if (!S.rules.date(date)) { if (date) paint('fecha', 'bad', SCHEMA.fecha.err); return; }
      paint('fecha', 'idle');
      var id = ++slotReq;
      if (!(cfg.api && cfg.api.disponibilidad)) return;
      S.getJson(cfg.api.disponibilidad + '?fecha=' + encodeURIComponent(date)).then(function (j) {
        if (id !== slotReq || !j || !Array.isArray(j.taken)) return;
        apply(j.taken.filter(function (v) { return (cfg.slots || []).indexOf(v) > -1; }));
        var free = radios.filter(function (r) { return !r.disabled; }).length;
        slotsLeft.textContent = free === 0 ? L('Ese día ya está lleno. Elige otra fecha.', 'That day is full. Pick another date.') : free === 1 ? L('Queda 1 horario para ese día. ¡Apártalo!', '1 time left that day. Grab it!') : L('Quedan ' + free + ' horarios para ese día', free + ' times left that day');
      }).catch(function () { /* sin servidor: no se muestran cupos inventados */ });
    }
    function initDate() {
      var now = tzNow();
      var d = new Date(now.date + 'T12:00:00');
      var lastSlot = (cfg.slots || ['16:00']).slice(-1)[0].split(':');
      if (WORK.indexOf(d.getDay()) < 0 || now.minutes + 60 >= Number(lastSlot[0]) * 60 + Number(lastSlot[1])) {
        do { d.setDate(d.getDate() + 1); } while (WORK.indexOf(d.getDay()) < 0);
      }
      var minD = new Date(now.date + 'T12:00:00'), maxD = new Date(now.date + 'T12:00:00');
      maxD.setDate(maxD.getDate() + 60);
      dateInput.min = iso(minD);
      dateInput.max = iso(maxD);
      dateInput.value = iso(d);
    }

    /* Atribución de campañas (utm_*) */
    var UTM = ['utm_source', 'utm_medium', 'utm_campaign'];
    try {
      var q = new URLSearchParams(window.location.search), got = {};
      UTM.forEach(function (k) { var v = q.get(k); if (v && /^[A-Za-z0-9._-]{1,60}$/.test(v)) got[k] = v; });
      if (Object.keys(got).length) window.sessionStorage.setItem('agora-utm', JSON.stringify(got));
    } catch (e) { /* sin almacenamiento */ }
    function utm() { try { var u = JSON.parse(window.sessionStorage.getItem('agora-utm') || '{}'); return u && typeof u === 'object' ? u : {}; } catch (e) { return {}; } }

    function trackOpen() {
      var mark = function () { if (!form.getAttribute('data-opened')) { form.setAttribute('data-opened', String(Date.now())); track('form_start'); } };
      form.addEventListener('focusin', mark, { once: true });
      form.addEventListener('pointerdown', mark, { once: true });
      form.addEventListener('focusin', function () { S.prefetch(); }, { once: true });
    }
    function showError(msg, focusName) {
      var box = $('.form-err', form);
      box.textContent = msg || '';
      if (msg) M.shake(submit);
      if (focusName && form.elements[focusName]) {
        var el = form.elements[focusName];
        el = typeof RadioNodeList !== 'undefined' && el instanceof RadioNodeList ? el[0] : el;
        if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); }
      }
    }
    function setBusy(b) { submit.disabled = b; submit.setAttribute('aria-busy', b ? 'true' : 'false'); }
    function success(text) {
      form.hidden = true;
      if (progress) progress.hidden = true;
      okP.textContent = text || OK_TEXT;
      okBox.hidden = false;
      okBox.focus({ preventScroll: true });
      $('#form-card').scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      M.celebrate(okBox);
    }
    function summary(d) {
      var obj = (EN ? { crm: 'Sell more', finanzas: 'My numbers', ambos: 'Both' } : { crm: 'Vender más', finanzas: 'Mis números', ambos: 'Ambos' })[d.objetivo] || d.objetivo;
      if (EN) return ['Hi, I’d like my free Agora Digital App sales diagnosis.',
        'Name: ' + d.nombre, 'WhatsApp: ' + d.telefono, d.empresa ? 'Company: ' + d.empresa : '',
        'Team: ' + d.equipo + ' people', 'Date: ' + d.fecha + ' at ' + d.hora + ' (UTC−4)',
        'I want to improve: ' + obj, d.plan ? 'Plan of interest: ' + planName(d.plan) : '', d.correo ? 'Email: ' + d.correo : '', d.mensaje ? 'Details: ' + d.mensaje : '']
      return ['Hola, quiero mi diagnóstico gratis de Agora Digital App.',
        'Nombre: ' + d.nombre, 'WhatsApp: ' + d.telefono, d.empresa ? 'Empresa: ' + d.empresa : '',
        'Equipo: ' + d.equipo + ' personas', 'Fecha: ' + d.fecha + ' a las ' + d.hora + ' (UTC−4)',
        'Quiero mejorar: ' + obj, d.plan ? 'Plan de interés: ' + d.plan : '', d.correo ? 'Correo: ' + d.correo : '', d.mensaje ? 'Detalle: ' + d.mensaje : '']
        .filter(Boolean).join('\n');
    }

    trackOpen();
    ['nombre', 'telefono', 'empresa', 'correo'].forEach(function (name) {
      var el = form.elements[name];
      if (!el) return;
      el.addEventListener('blur', function () { liveCheck(name, !!el.value); });
      el.addEventListener('input', function () {
        if (el.getAttribute('aria-invalid') === 'true' || el.closest('.field').classList.contains('is-ok')) liveCheck(name, false);
        updateProgress();
      });
    });
    form.addEventListener('change', function (e) {
      if (e.target.name === 'hora') paint('hora', 'idle');
      if (e.target.name === 'equipo') { liveCheck('equipo', true); paintHint(); }
      updateProgress();
    });
    dateInput.addEventListener('change', refreshSlots);
    initDate();
    refreshSlots();
    paintHint();
    updateProgress();

    /* "Elegir plan": precarga el formulario y lleva al diagnóstico */
    $$('[data-choose]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var plan = a.getAttribute('data-choose'), t = a.getAttribute('data-team');
        form.elements.plan.value = plan;
        if (t && team) { team.value = t; liveCheck('equipo', false); }
        if (okBox && !okBox.hidden) $('#form-again').click();
        paintHint();
        updateProgress();
        track('plan_click', { plan: plan });
        var card = $('#form-card');
        card.classList.remove('is-pending');
        card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        if (window.history && window.history.replaceState) window.history.replaceState(null, '', '#diagnostico');
        setTimeout(function () { var n = form.elements.nombre; if (n && !n.value) n.focus({ preventScroll: true }); }, reduce ? 0 : 650);
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      showError('');
      var data = {}, first = null;
      Object.keys(SCHEMA).forEach(function (name) {
        var spec = SCHEMA[name], v = clean(spec, raw(name)), ok = valid(spec, v);
        var el = form.elements[name];
        var radio = typeof RadioNodeList !== 'undefined' && el instanceof RadioNodeList;
        if (!ok) paint(name, 'bad', spec.err || L('Completa este dato.', 'Fill in this field.'));
        else if (el && el.type !== 'hidden') paint(name, v && !radio ? 'ok' : 'idle');
        if (!ok && !first) first = { name: name, msg: spec.err || L('Completa los campos marcados.', 'Fill in the highlighted fields.') };
        data[name] = v;
      });
      if (first) { if (first.name === 'empresa' || first.name === 'correo') $('.more', form).open = true; showError(first.msg, first.name); return; }
      if (!S.isHuman(form)) { showError(L('No pudimos verificar el envío. Espera unos segundos e inténtalo de nuevo.', 'We couldn’t verify the submission. Wait a few seconds and try again.')); return; }
      var rl = S.rateCheck('diagnostico', cfg.rateLimit.maxPerHour, 3600000, cfg.rateLimit.cooldownMs);
      if (!rl.ok) { showError(L('Ya recibimos una solicitud. Inténtalo de nuevo en ' + Math.ceil(rl.retryMs / 1000) + ' segundos.', 'We already received a request. Try again in ' + Math.ceil(rl.retryMs / 1000) + ' seconds.')); return; }
      setBusy(true);
      data.website = form.elements.website ? form.elements.website.value : '';
      data.pagina = window.location.href.split('#')[0].slice(0, 300);
      var u = utm();
      UTM.forEach(function (k) { if (u[k]) data[k] = u[k]; });
      var planKey = data.plan || PLAN_BY_TEAM[data.equipo];

      var api = cfg.api || {};
      (api.diagnostico ? S.securePost(api.diagnostico, 'diagnostico', data) : Promise.reject(new Error('sin api')))
        .then(function (res) {
          if (!res.ok && res.status === 400 && res.data && res.data.error === 'too_fast') {
            return wait(1400).then(function () { return S.securePost(cfg.api.diagnostico, 'diagnostico', data); });
          }
          return res;
        })
        .then(function (res) {
          if (res.ok) {
            S.rateHit('diagnostico', rl.hits);
            track('form_submit', { plan: planKey, equipo: data.equipo, via: 'api' });
            success();
            return;
          }
          if (res.status === 429) { showError(L('Recibimos muchas solicitudes desde tu conexión. Inténtalo en un minuto.', 'Too many requests from your connection. Try again in a minute.')); return; }
          if (res.status === 409) { showError(L('Ese horario se acaba de ocupar. Elige otra hora.', 'That time was just taken. Choose another.'), 'hora'); refreshSlots(); return; }
          if (res.status === 400 || res.status === 422) { showError(L('Revisa los datos marcados e inténtalo de nuevo.', 'Check the highlighted fields and try again.')); return; }
          throw new Error('server');
        })
        .catch(function () {
          /* Sin API (archivo local o servidor caído): WhatsApp con los datos ya escritos */
          S.rateHit('diagnostico', rl.hits);
          track('form_submit', { plan: planKey, equipo: data.equipo, via: 'whatsapp' });
          var text = summary(data);
          var wa = waUrl(text);
          if (wa) {
            /* Con 'noopener' window.open siempre devuelve null: se corta el vínculo a mano */
            var w = window.open(wa, '_blank');
            if (w) { try { w.opener = null; } catch (err) { /* sin acceso */ } } else window.location.href = wa;
            success(L('Abrimos WhatsApp con tu solicitud lista: solo pulsa enviar y te confirmamos la hora.', 'We opened WhatsApp with your request ready: just press send and we’ll confirm the time.'));
          } else {
            window.location.href = 'mailto:' + cfg.email + '?subject=' + encodeURIComponent(L('Diagnóstico de ventas gratis', 'Free sales diagnosis')) + '&body=' + encodeURIComponent(text);
            success(L('Abrimos tu correo con la solicitud lista: solo pulsa enviar.', 'We opened your email with the request ready: just press send.'));
          }
        })
        .then(function () { setBusy(false); });
    });

    $('#form-again').addEventListener('click', function () {
      okBox.hidden = true;
      okP.textContent = OK_TEXT;
      form.reset();
      $$('.field.is-ok', form).forEach(function (f) { f.classList.remove('is-ok'); });
      form.elements.plan.value = '';
      form.hidden = false;
      if (progress) progress.hidden = false;
      form.removeAttribute('data-opened');
      trackOpen();
      initDate();
      refreshSlots();
      paintHint();
      lastPct = -1;
      updateProgress();
      var n = form.elements.nombre; if (n) n.focus();
    });
  })();

  /* ======================= 11 · FLOTANTES ======================= */
  (function floating() {
    var bar = $('#m-cta');
    var heroCta = $('[data-hero-cta]');
    var formCard = $('#form-card');
    var footer = $('.footer');
    var final = $('.final');
    var plans = $('[data-rail]');
    if (!bar || !heroCta || !hasIO) return;
    var link = $('a', bar);
    /* La barra se oculta donde ya hay un botón de acción a la vista (hero, planes, formulario, cierre) */
    var state = { hero: true, form: false, foot: false, fin: false, plans: false };
    function sync() {
      var show = !state.hero && !state.form && !state.foot && !state.fin && !state.plans;
      bar.classList.toggle('is-shown', show);
      bar.setAttribute('aria-hidden', show ? 'false' : 'true');
      link.tabIndex = show ? 0 : -1;
    }
    [[heroCta, 'hero'], [formCard, 'form'], [footer, 'foot'], [final, 'fin'], [plans, 'plans']].forEach(function (p) {
      if (!p[0]) return;
      new IntersectionObserver(function (es) { state[p[1]] = es[0].isIntersecting; sync(); }, { threshold: 0 }).observe(p[0]);
    });
  })();

  /* La landing ya no es app instalable: se retira cualquier service worker de versiones anteriores */
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); }).catch(function () {});

})();
