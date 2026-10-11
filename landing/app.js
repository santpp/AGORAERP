/* Agora Digital · Landing
   JavaScript sin dependencias. Sin él, la página, los dos accesos y todos los textos siguen funcionando.
   1. Selector «Iniciar sesión»
   2. Revelado al hacer scroll
   3. Carrusel de módulos: un único punto de entrada, goTo(i), para gestos, botones, teclado e historial
   4. Athena: mensajes escritos letra por letra. Sin audio, sin voz y sin llamadas de red. */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var CURVA = 'cubic-bezier(0.32, 0.72, 0, 1)';

  /* Movimiento reducido: se lee al cargar y se respeta si cambia con la página abierta */
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reducido = false; // animaciones siempre activas (pedido del cliente)
  var alCambiarMovimiento = [];
  root.classList.toggle('movimiento-reducido', reducido);
  if (mq) {
    var cambioMq = function (e) {
      root.classList.toggle('movimiento-reducido', reducido);
      alCambiarMovimiento.forEach(function (fn) { fn(reducido); });
    };
    if (mq.addEventListener) mq.addEventListener('change', cambioMq);
    else if (mq.addListener) mq.addListener(cambioMq);
  }

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /* Resistencia tipo «rubber band»: cuanto más se estira, menos avanza */
  function goma(d, dim) {
    var c = 0.55;
    return (1 - 1 / ((Math.abs(d) * c / dim) + 1)) * dim * (d < 0 ? -1 : 1);
  }

  /* iOS solo aplica :active (escala 0,97) si existe un oyente táctil */
  doc.addEventListener('touchstart', function () {}, { passive: true });

  /* ===== 1. Selector «Iniciar sesión»: se cierra con Escape, al tocar fuera o al elegir un ancla ===== */
  var acceso = doc.querySelector('[data-acceso]');
  if (acceso) {
    var resumen = acceso.querySelector('summary');
    doc.addEventListener('click', function (e) {
      if (acceso.open && !acceso.contains(e.target)) acceso.open = false;
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && acceso.open) {
        acceso.open = false;
        if (resumen) resumen.focus();
      }
    });
    Array.prototype.forEach.call(acceso.querySelectorAll('.acceso-anclas a'), function (a) {
      a.addEventListener('click', function () { acceso.open = false; });
    });
  }

  /* ===== 2. Revelado al hacer scroll: solo lo que está debajo de la primera pantalla ===== */
  (function () {
    if (reducido || !('IntersectionObserver' in window)) return;
    var vh = window.innerHeight || root.clientHeight;
    var items = Array.prototype.filter.call(doc.querySelectorAll('.reveal'), function (el) {
      return el.getBoundingClientRect().top > vh * 0.92;
    });
    if (!items.length) return;
    items.forEach(function (el) { el.classList.add('is-pendiente'); });
    var io = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.remove('is-pendiente');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  })();

  /* ===== 3. Carrusel de módulos ===== */
  var carrusel = doc.querySelector('[data-carrusel]');
  if (carrusel) iniciarCarrusel(carrusel);

  function iniciarCarrusel(car) {
    var seccion = car.closest('section') || car;
    var ventana = car.querySelector('[data-ventana]');
    var pista = car.querySelector('[data-pista]');
    var mods = Array.prototype.slice.call(pista.children);
    var segs = Array.prototype.slice.call(car.querySelectorAll('[data-ir]'));
    var rellenos = segs.map(function (s) { return s.querySelector('.seg-relleno'); });
    var btnAnt = car.querySelector('[data-anterior]');
    var btnSig = car.querySelector('[data-siguiente]');
    var anuncio = car.querySelector('[data-anuncio]');
    var actual = car.querySelector('[data-actual]');
    var slugs = mods.map(function (m) { return m.getAttribute('data-slug'); });
    var nombres = mods.map(function (m) { return m.getAttribute('data-nombre'); });
    var n = mods.length;
    var ultimo = n - 1;

    var i = 0;            // módulo activo
    var paso = 1;         // ancho de un módulo más la separación, en px
    var x = 0;            // posición actual de la pista, en px
    var animando = false;
    var visible = false;  // el carrusel ocupa al menos la mitad de la pantalla

    // Sin JavaScript la ventana es una zona con scroll y necesita foco; con JavaScript se usan los controles.
    ventana.removeAttribute('tabindex');

    function medir() {
      if (reducido) {
        paso = mods[0].getBoundingClientRect().width || ventana.clientWidth || 1;
        return;
      }
      paso = n > 1 ? mods[1].offsetLeft - mods[0].offsetLeft : mods[0].offsetWidth;
      if (!paso) paso = ventana.clientWidth || 1;
    }
    function posicion(k) { return -k * paso; }

    /* Progreso segmentado al estilo de las historias: el segmento siguiente se llena mientras arrastras */
    function pintarProgreso(p, ms) {
      for (var k = 0; k < n; k++) {
        var r = rellenos[k];
        if (!r) continue;
        r.style.transition = ms ? 'transform ' + ms + 'ms ' + CURVA : 'none';
        r.style.transform = 'scaleX(' + clamp(p - k + 1, 0, 1).toFixed(4) + ')';
      }
    }

    /* Solo transform. ms = 0: sigue al dedo 1:1. ms > 0: transición con la curva de la marca. */
    function pintar(px, ms) {
      x = px;
      if (reducido) {
        pista.style.transition = 'none';
        pista.style.transform = '';
      } else {
        pista.style.transition = ms ? 'transform ' + ms + 'ms ' + CURVA : 'none';
        pista.style.transform = 'translate3d(' + px.toFixed(2) + 'px,0,0)';
      }
      pintarProgreso(-px / paso, ms);
    }

    /* Un gesto nuevo interrumpe la animación en curso desde donde va */
    function leerPosicion() {
      var t = getComputedStyle(pista).transform;
      if (!t || t === 'none') return x;
      var m = t.match(/^matrix3d\((.+)\)$/);
      if (m) return parseFloat(m[1].split(',')[12]);
      m = t.match(/^matrix\((.+)\)$/);
      return m ? parseFloat(m[1].split(',')[4]) : x;
    }
    function detener() {
      if (!animando) return;
      animando = false;
      pintar(leerPosicion(), 0);
    }
    /* Si un toque detuvo la pista entre dos módulos, la lleva al módulo activo */
    function asentar() {
      if (Math.abs(x - posicion(i)) > 0.5) goTo(i, { origen: 'gesto' });
    }
    pista.addEventListener('transitionend', function (e) {
      if (e.target === pista && e.propertyName === 'transform') animando = false;
    });

    function actualizarEstado(anunciar) {
      mods.forEach(function (m, k) {
        var activo = k === i;
        m.classList.toggle('is-activo', activo);
        if (activo) m.removeAttribute('inert');
        else m.setAttribute('inert', '');
      });
      segs.forEach(function (s, k) {
        if (k === i) s.setAttribute('aria-current', 'true');
        else s.removeAttribute('aria-current');
      });
      if (btnAnt) btnAnt.setAttribute('aria-disabled', String(i === 0));
      if (btnSig) btnSig.setAttribute('aria-disabled', String(i === ultimo));
      if (actual) actual.textContent = String(i + 1);
      if (anunciar && anuncio) anuncio.textContent = 'Módulo ' + (i + 1) + ' de ' + n + ': ' + nombres[i];
    }

    /* Historial: cada cambio crea una entrada, así el gesto o el botón de volver del navegador también funciona */
    function indiceDeUrl() {
      var s = null;
      try { s = new URLSearchParams(location.search).get('modulo'); } catch (e) { s = null; }
      var k = slugs.indexOf(s);
      return k < 0 ? 0 : k;
    }
    function guardarEnHistorial(k) {
      try {
        var u = new URL(location.href);
        u.searchParams.set('modulo', slugs[k]);
        history.pushState({ agoraModulo: k }, '', u.pathname + u.search + u.hash);
      } catch (e) { /* vista previa sin historial (archivo local o marco aislado): se navega igual */ }
    }

    /* ===== Punto de entrada único ===== */
    function goTo(k, o) {
      o = o || {};
      k = clamp(k, 0, ultimo);
      var antes = i;
      var cambio = k !== antes;
      i = k;
      var ms = 0;
      if (o.origen !== 'inicio' && !reducido) {
        ms = o.origen === 'gesto' ? 420 : (Math.abs(k - antes) > 1 ? 520 : 480);
      }
      animando = ms > 0 && Math.abs(posicion(k) - x) > 0.5;
      pintar(posicion(k), animando ? ms : 0);
      actualizarEstado(cambio && o.origen !== 'inicio');
      if (cambio && o.origen !== 'historial' && o.origen !== 'inicio') guardarEnHistorial(k);
      return k;
    }
    car.goTo = goTo;

    window.addEventListener('popstate', function () {
      var k = indiceDeUrl();
      if (k !== i) { detener(); goTo(k, { origen: 'historial' }); }
    });

    /* ===== Arrastre con dedo o cursor (Pointer Events) ===== */
    var g = null;
    var suprimirClic = false;

    function registrar(gesto, t, cx) {
      gesto.muestras.push({ t: t, x: cx });
      while (gesto.muestras.length > 2 && t - gesto.muestras[0].t > 100) gesto.muestras.shift();
    }
    function velocidad(gesto, tFin) {
      var m = gesto.muestras;
      if (m.length < 2) return 0;
      var a = m[0], b = m[m.length - 1];
      if (tFin - b.t > 80) return 0; // se detuvo antes de soltar
      var dt = b.t - a.t;
      return dt > 0 ? (b.x - a.x) / dt : 0;
    }

    ventana.addEventListener('pointerdown', function (e) {
      if (g || (e.pointerType === 'mouse' && e.button !== 0)) return;
      suprimirClic = false;
      detener();
      g = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        base: x,
        borde: e.pointerType !== 'mouse' && e.clientX <= 24, // deslizar desde el borde izquierdo para volver
        activo: false,
        capturado: false,
        muestras: []
      };
      registrar(g, e.timeStamp, e.clientX);
    });

    ventana.addEventListener('pointermove', function (e) {
      if (!g || e.pointerId !== g.id) return;
      var dx = e.clientX - g.x0;
      var dy = e.clientY - g.y0;
      if (!g.activo) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dy) >= Math.abs(dx)) { g = null; asentar(); return; } // gesto vertical: es el scroll de la página
        g.activo = true;
        car.classList.add('is-arrastrando');
        try { ventana.setPointerCapture(e.pointerId); g.capturado = true; } catch (err) { /* sin captura */ }
        var sel = window.getSelection ? window.getSelection() : null;
        if (sel && sel.removeAllRanges) sel.removeAllRanges();
      }
      if (e.cancelable) e.preventDefault();
      registrar(g, e.timeStamp, e.clientX);
      if (reducido) return; // en modo fundido no hay seguimiento: solo se decide al soltar
      var objetivo = g.base + dx;
      var limite = posicion(ultimo);
      var dim = ventana.clientWidth || paso;
      if (objetivo > 0) objetivo = goma(objetivo, dim);
      else if (objetivo < limite) objetivo = limite + goma(objetivo - limite, dim);
      pintar(objetivo, 0);
    });

    function soltar(e, cancelado) {
      if (!g || e.pointerId !== g.id) return;
      var gesto = g;
      g = null;
      car.classList.remove('is-arrastrando');
      try {
        if (ventana.hasPointerCapture && ventana.hasPointerCapture(e.pointerId)) ventana.releasePointerCapture(e.pointerId);
      } catch (err) { /* nada */ }
      if (!gesto.activo) { asentar(); return; } // toque sin arrastre: termina el movimiento que se interrumpió
      suprimirClic = true;
      var dx = e.clientX - gesto.x0;
      var v = velocidad(gesto, e.timeStamp);
      var frac = dx / paso;
      var destino = i;
      if (!cancelado) {
        if (Math.abs(frac) > 1.3) destino = i - Math.round(frac);  // arrastre largo: puede saltar más de uno
        else if (frac <= -0.3) destino = i + 1;                     // pasó el 30 % del ancho
        else if (frac >= 0.3) destino = i - 1;
        else if (v <= -0.45 && dx < -8) destino = i + 1;            // velocidad alta
        else if (v >= 0.45 && dx > 8) destino = i - 1;
        if (gesto.borde && dx > 40) destino = Math.min(destino, i - 1);
      }
      goTo(destino, { origen: 'gesto' }); // si no cambia, regresa con la curva suave
    }
    ventana.addEventListener('pointerup', function (e) { soltar(e, false); });
    ventana.addEventListener('pointercancel', function (e) { soltar(e, true); });
    ventana.addEventListener('lostpointercapture', function (e) {
      // Solo cuenta si la ventana pierde su propia captura (en touch, el hijo pierde la captura implícita al tomarla la ventana)
      if (g && g.capturado && e.pointerId === g.id && e.target === ventana) soltar(e, false);
    });
    ventana.addEventListener('click', function (e) {
      if (!suprimirClic) return;
      suprimirClic = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);
    ventana.addEventListener('dragstart', function (e) { e.preventDefault(); });

    /* ===== Trackpad de dos dedos (y Mayús + rueda) ===== */
    var rueda = null;
    var finRueda = 0;
    var bloqueo = 0;
    function liberarBloqueo() { bloqueo = 0; }
    ventana.addEventListener('wheel', function (e) {
      var dx = e.deltaX;
      var dy = e.deltaY;
      if (e.deltaMode === 1) { dx *= 16; dy *= 16; }
      else if (e.deltaMode === 2) { dx *= ventana.clientWidth; dy *= ventana.clientHeight; }
      if (Math.abs(dx) <= Math.abs(dy)) return; // vertical: la página hace su scroll
      e.preventDefault();
      if (bloqueo) { clearTimeout(bloqueo); bloqueo = setTimeout(liberarBloqueo, 240); return; } // inercia del gesto anterior
      if (!rueda) { detener(); rueda = { base: x, acum: 0 }; }
      rueda.acum -= dx;
      var frac = rueda.acum / paso;
      if (Math.abs(frac) >= 0.3) {
        rueda = null;
        clearTimeout(finRueda);
        goTo(i + (frac < 0 ? 1 : -1), { origen: 'gesto' });
        bloqueo = setTimeout(liberarBloqueo, 240);
        return;
      }
      if (!reducido) {
        var objetivo = rueda.base + rueda.acum;
        var limite = posicion(ultimo);
        var dim = ventana.clientWidth || paso;
        if (objetivo > 0) objetivo = goma(objetivo, dim);
        else if (objetivo < limite) objetivo = limite + goma(objetivo - limite, dim);
        pintar(objetivo, 0);
      }
      clearTimeout(finRueda);
      finRueda = setTimeout(function () {
        if (!rueda) return;
        rueda = null;
        goTo(i, { origen: 'gesto' });
      }, 160);
    }, { passive: false });

    /* ===== Teclado: ← y → (Inicio y Fin dentro del carrusel) ===== */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        visible = en[0].isIntersecting && en[0].intersectionRatio >= 0.5;
      }, { threshold: [0, 0.5, 1] }).observe(ventana);
    } else {
      visible = true;
    }
    doc.addEventListener('keydown', function (e) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      var k = e.key;
      if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'Home' && k !== 'End') return;
      var t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (!car.contains(t)) {
        // Fuera del carrusel solo si nada tiene el foco y el carrusel está a la vista
        if (k === 'Home' || k === 'End') return;
        if (!(t === doc.body || t === root || !t) || !visible) return;
      }
      e.preventDefault();
      detener();
      if (k === 'ArrowLeft') goTo(i - 1, { origen: 'teclado' });
      else if (k === 'ArrowRight') goTo(i + 1, { origen: 'teclado' });
      else if (k === 'Home') goTo(0, { origen: 'teclado' });
      else goTo(ultimo, { origen: 'teclado' });
    });

    /* ===== Botones visibles y segmentos ===== */
    segs.forEach(function (s, k) {
      s.addEventListener('click', function () { detener(); goTo(k, { origen: 'segmento' }); });
    });
    if (btnAnt) btnAnt.addEventListener('click', function () {
      if (i > 0) { detener(); goTo(i - 1, { origen: 'boton' }); }
    });
    if (btnSig) btnSig.addEventListener('click', function () {
      if (i < ultimo) { detener(); goTo(i + 1, { origen: 'boton' }); }
    });

    /* ===== Tamaño de pantalla ===== */
    function recolocar() {
      medir();
      if (g) return;
      animando = false;
      pintar(posicion(i), 0);
    }
    if ('ResizeObserver' in window) new ResizeObserver(recolocar).observe(ventana);
    else window.addEventListener('resize', recolocar);
    alCambiarMovimiento.push(recolocar);

    /* ===== Arranque: el módulo de la URL, sin animación ===== */
    medir();
    var inicial = indiceDeUrl();
    goTo(inicial, { origen: 'inicio' });
    try { history.replaceState({ agoraModulo: inicial }, ''); } catch (e) { /* nada */ }
    var conModulo = false;
    try { conModulo = new URLSearchParams(location.search).has('modulo'); } catch (e) { conModulo = false; }
    if (conModulo && !location.hash) {
      var nav = window.performance && performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
      if (!nav || nav.type === 'navigate') seccion.scrollIntoView({ block: 'start' });
    }
  }

  /* ===== 4. Athena ===== */
  var athena = doc.querySelector('[data-athena]');
  if (athena) iniciarAthena(athena);

  function iniciarAthena(chat) {
    var seccion = chat.closest('section') || chat;
    var figura = seccion.querySelector('[data-athena-figura]');
    var lista = chat.querySelector('[data-mensajes]');
    var items = Array.prototype.slice.call(chat.querySelectorAll('.msg'));
    var textos = items.map(function (li) { return li.querySelector('.msg-medida').textContent; });
    var escritos = items.map(function (li) { return li.querySelector('.msg-escrito'); });
    var anuncio = chat.querySelector('[data-athena-anuncio]');
    var controles = chat.querySelector('[data-athena-controles]');
    var btnSig = chat.querySelector('[data-athena-siguiente]');
    var btnOmitir = chat.querySelector('[data-athena-omitir]');
    var cta = chat.querySelector('[data-athena-cta]');
    var POR_LETRA = 34;   // ms por carácter (30 a 40)
    var PAUSA = 1500;     // ms entre mensajes
    var m = -1;
    var c = 0;
    var reloj = 0;
    var estado = 'espera'; // espera · escribiendo · pausa · fin
    var iniciado = false;
    var anunciado = false;

    function anunciar() {
      // El texto completo ya está en el DOM; se anuncia una sola vez
      if (anunciado || !anuncio) return;
      anunciado = true;
      anuncio.textContent = 'Athena dice: ' + textos.join(' ');
    }
    function terminar() {
      clearTimeout(reloj);
      estado = 'fin';
      seccion.classList.add('athena-fin');
      if (controles && cta && controles.contains(doc.activeElement)) cta.focus();
    }
    function mostrarTodo() {
      clearTimeout(reloj);
      iniciado = true;
      items.forEach(function (li, k) {
        li.classList.add('is-visible');
        li.classList.remove('is-escribiendo');
        escritos[k].textContent = textos[k];
      });
      m = items.length - 1;
      seccion.classList.add('athena-entra');
      if (figura) figura.classList.add('is-dentro');
      terminar();
    }
    function escribir() {
      c += 1;
      escritos[m].textContent = textos[m].slice(0, c);
      if (c < textos[m].length) reloj = setTimeout(escribir, POR_LETRA);
      else completar();
    }
    function siguiente() {
      m += 1;
      if (m >= items.length) { terminar(); return; }
      c = 0;
      estado = 'escribiendo';
      items[m].classList.add('is-visible', 'is-escribiendo');
      reloj = setTimeout(escribir, 160);
    }
    function completar() {
      clearTimeout(reloj);
      escritos[m].textContent = textos[m];
      items[m].classList.remove('is-escribiendo');
      if (m >= items.length - 1) { terminar(); return; }
      estado = 'pausa';
      reloj = setTimeout(siguiente, PAUSA);
    }
    function empezar() {
      if (iniciado) return;
      iniciado = true;
      anunciar();
      seccion.classList.add('athena-entra');
      reloj = setTimeout(siguiente, 420);
    }
    function avanzar() {
      if (!iniciado) { empezar(); return; }
      if (estado === 'escribiendo') completar();
      else if (estado === 'pausa') { clearTimeout(reloj); siguiente(); }
    }

    lista.addEventListener('click', avanzar);
    if (btnSig) btnSig.addEventListener('click', avanzar);
    if (btnOmitir) btnOmitir.addEventListener('click', function () { anunciar(); mostrarTodo(); });

    if (reducido) { mostrarTodo(); return; }
    alCambiarMovimiento.push(function (r) { if (r && estado !== 'fin') mostrarTodo(); });

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (en) {
        if (!en[0].isIntersecting) return;
        io.disconnect();
        empezar();
      }, { threshold: 0.35 });
      io.observe(chat);
      if (figura) {
        var ioFig = new IntersectionObserver(function (en) {
          if (!en[0].isIntersecting) return;
          ioFig.disconnect();
          figura.classList.add('is-dentro');
        }, { threshold: 0.25 });
        ioFig.observe(figura);
      }
    } else {
      if (figura) figura.classList.add('is-dentro');
      empezar();
    }
  }
})();
/* Agora Digital App · Landing. Sin dependencias. */
(() => {
  const C = window.AGORA_CONFIG || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const track = (event, data = {}) => { (window.dataLayer = window.dataLayer || []).push({ event, ...data }); };
  const waLink = (text) => C.whatsapp ? `https://wa.me/${C.whatsapp}?text=${encodeURIComponent(text)}` : null;

  /* Menús desplegables */
  $$('.dd').forEach(dd => {
    const btn = $('.dd-btn', dd);
    const set = (o) => { dd.classList.toggle('open', o); btn.setAttribute('aria-expanded', o); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); const o = !dd.classList.contains('open'); $$('.dd.open').forEach(d => d.classList.remove('open')); set(o); });
    if (matchMedia('(hover: hover)').matches) { dd.addEventListener('mouseenter', () => set(true)); dd.addEventListener('mouseleave', () => set(false)); }
    $$('a', dd).forEach(l => l.addEventListener('click', () => set(false)));
  });
  document.addEventListener('click', () => $$('.dd.open').forEach(d => d.classList.remove('open')));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('.dd.open').forEach(d => d.classList.remove('open')); });

  /* Enlaces a un módulo concreto: mueven el carrusel sin recargar */
  $$('[data-modulo]').forEach(l => l.addEventListener('click', (e) => {
    const car = $('[data-carrusel]');
    if (!car || !car.goTo) return;
    e.preventDefault();
    car.goTo(+l.dataset.modulo, { origen: 'boton' });
    $('#modulos').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  /* WhatsApp en la barra social */
  $$('[data-whatsapp]').forEach(a => { const l = waLink('Hola, quiero saber más de Agora Digital App.'); if (l) a.href = l; else a.remove(); });

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
    $('[data-progress-bar]').style.transform = `scaleX(${pct / 100})`;
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
    ['Perfil de Empresa de Google', 'Reseñas y mensajes de tu ficha en Google.', 'Publicidad y marketing', 'GBP', '#34a853', ''],
    ['Stripe', 'Cobros con tarjeta y suscripciones.', 'Pagos y contabilidad', 'S', '#635bff', 'stripe'],
    ['PayPal', 'Pagos internacionales en línea.', 'Pagos y contabilidad', 'PP', '#003087', 'paypal'],
    ['QuickBooks', 'Facturas y contabilidad sincronizadas.', 'Pagos y contabilidad', 'QB', '#2ca01c', 'quickbooks'],
    ['Xero', 'Contabilidad en la nube.', 'Pagos y contabilidad', 'X', '#13b5ea', 'xero'],
    ['Shopify', 'Pedidos y clientes de tu tienda.', 'Comercio electrónico', 'S', '#5e8e3e', 'shopify'],
    ['WooCommerce', 'Ventas de tu tienda en WordPress.', 'Comercio electrónico', 'Woo', '#7f54b3', 'woocommerce'],
    ['WordPress', 'Formularios y chat en tu sitio web.', 'Comercio electrónico', 'W', '#21759b', 'wordpress'],
    ['Outlook', 'Calendario y correo de Microsoft 365.', 'Agenda', 'O', '#0078d4', ''],
    ['Zoom', 'Enlace de videollamada en cada cita.', 'Agenda', 'Z', '#2d8cff', 'zoom'],
    ['Google Meet', 'Reuniones automáticas al agendar.', 'Agenda', 'M', '#00897b', 'googlemeet'],
    ['Typeform', 'Respuestas que crean contactos.', 'Formularios', 'T', '#262627', 'typeform'],
    ['Jotform', 'Formularios conectados a tu embudo.', 'Formularios', 'J', '#ff6100', ''],
    ['Formularios nativos', 'Encuestas y formularios con tu marca.', 'Formularios', 'F', '#ad103c', ''],
    ['Slack', 'Avisos de ventas para tu equipo.', 'Productividad', '#', '#4a154b', 'slack'],
    ['Zapier', 'Conecta miles de aplicaciones.', 'Productividad', 'Z', '#ff4f00', 'zapier'],
    ['Webhooks', 'Envía y recibe datos de cualquier sistema.', 'Productividad', '{ }', '#282e49', ''],
    ['Correo (SMTP)', 'Envía desde tu propio dominio.', 'Redes y mensajería', '@', '#282e49', ''],
    ['SMS', 'Mensajes de texto y recordatorios.', 'Redes y mensajería', 'SMS', '#5b6170', ''],
    ['OpenAI', 'Modelos de lenguaje para tus agentes.', 'Inteligencia artificial', 'AI', '#10a37f', 'openai'],
    ['Athena', 'Agente de IA que responde y agenda.', 'Inteligencia artificial', 'A', '#ad103c', ''],
    ['Agentes de voz', 'Atiende llamadas con IA.', 'Inteligencia artificial', 'V', '#282e49', ''],
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
      grid.innerHTML = ver.map((x, i) => `<li class="integra" style="animation-delay:${Math.min(i, 12) * 30}ms"><span class="integra-logo" style="--c:${x[4]}">${x[5] ? `<i class="marca" style="--m:url(assets/brands/${x[5]}.svg)"></i>` : x[3]}</span><span><b>${x[0]}</b><span>${x[1]}</span></span></li>`).join('');
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
