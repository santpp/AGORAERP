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
