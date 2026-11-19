/* Agora Digital App · v10 · Athena, la asistente de Agora Digital
   ---------------------------------------------------------------------------------------------
   · Panel de conversación: botón de la barra superior o de la barra lateral, ⌘J / Ctrl J o la tecla A.
   · Entiende español de Venezuela (neutro) y funciona SIN internet, con los datos de este equipo:
     cifras del mes, cobranza, caja, tasas del dólar y conversiones, agenda (consultar, horario libre y
     agendar citas), registrar pagos, ir a un módulo y comandos (tema, bloqueo, informe, respaldo, atajos).
   · Voz: dictado (Web Speech API, es-VE) y respuesta en voz alta opcional.
   · Opcional: conectar tu agente de IA (un servicio https) para lo que Athena no entienda.
   · Todo lo que cambia datos usa las mismas funciones de la app: pide la clave cuando toca y queda en la auditoría. */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const appOn = () => { const a = $('#app'); return a && !a.hidden; };
  const IMG = 'assets/img/athena-cabeza.webp';
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const sheet = () => window.matchMedia && matchMedia('(max-width: 760px)').matches;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const escRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hasW = (t, w) => new RegExp('(^|\\s)' + escRe(w) + '(?=\\s|$)').test(t);
  const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
  const addD = n => isoD(addDays(D(TODAY), n));
  const byWhen = (a, b) => (a.date + ' ' + (a.start || '00:00')).localeCompare(b.date + ' ' + (b.start || '00:00'));
  const OFF = ['CANCELADA', 'NO_ASISTIO'];
  const DONE = ['CANCELADA', 'REALIZADA', 'NO_ASISTIO'];
  const goMod = id => { if (location.hash !== '#/' + id) location.hash = '#/' + id; else render(); };
  const cap = s => String(s || '').replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());

  /* ---------- 1. Opciones ---------- */
  const CFG_DEF = { greet: true, voice: false, sugg: true, endpoint: '' };
  const cfg = () => Object.assign({}, CFG_DEF, store.get('athena_cfg_v1', {}));
  const firstName = () => { const n = (typeof account !== 'undefined' && account && account.name) || ''; return n.trim().split(/\s+/)[0] || ''; };
  const saludo = () => { const h = new Date().getHours(); return h >= 5 && h < 12 ? 'Buenos días' : h >= 12 && h < 19 ? 'Buenas tardes' : 'Buenas noches'; };
  const hola = () => `${saludo()}${firstName() ? ', ' + esc(firstName()) : ''}`;

  /* ---------- 2. Lectura del texto (español de Venezuela) ---------- */
  function prep(s) {
    return normTxt(s)
      .replace(/\ba\.?\s?m\.?(?=\s|$)/g, ' am ').replace(/\bp\.?\s?m\.?(?=\s|$)/g, ' pm ')
      .replace(/[¿?¡!;"“”«»()]/g, ' ').replace(/(\D),/g, '$1 ').replace(/,(\D)/g, ' $1').replace(/(\D)\.(?=\s|$)/g, '$1 ')
      .replace(/\s+/g, ' ').trim();
  }
  const NUMW = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30 };
  const numOf = w => (/^\d+$/.test(w) ? +w : NUMW[w] != null ? NUMW[w] : null);
  const HW = '(\\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)';
  const MON = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11 };
  const monthIdx = w => MON[String(w).slice(0, 3)];
  const MONTH_RE = '(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sept?|oct|nov|dic)';
  const mkDate = (y, mi, d) => { if (!(mi >= 0 && mi <= 11) || !(d >= 1)) return null; const p = `${y}-${String(mi + 1).padStart(2, '0')}`; if (d > daysIn(p)) return null; return `${p}-${String(d).padStart(2, '0')}`; };
  // Número escrito como en Venezuela: 46.400 = 46 mil 400; 46,40 = 46 con 40
  function numVE(s) { s = String(s).trim(); if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.')); if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return parseFloat(s.replace(/,/g, '')); return parseFloat(s.replace(',', '.')); }

  // Fecha y hora: "mañana a las 3", "el jueves 10 y media", "15 de octubre 4 pm", "en 3 días", "hoy al mediodía"…
  function parseWhen(t0) {
    const t = ' ' + t0 + ' ';
    let ampm = null;
    if (/\b(de|en|por) la manana\b|\bam\b/.test(t)) ampm = 'am';
    if (/\b(de|en|por) la (tarde|noche)\b|\besta (tarde|noche)\b|\bpm\b/.test(t)) ampm = 'pm';
    const tn = t.replace(/\b(de|en|por) la (manana|tarde|noche)\b/g, ' ').replace(/\besta (manana|tarde|noche)\b/g, ' hoy ');
    const today = D(TODAY), dow = today.getUTCDay();
    let date = null, m;
    if (/\bpasado manana\b/.test(tn)) date = addD(2);
    else if (/\bmanana\b/.test(tn)) date = addD(1);
    else if (/\bhoy\b/.test(tn)) date = TODAY;
    else if (/\bayer\b/.test(tn)) date = addD(-1);
    if (!date && (m = tn.match(new RegExp('\\b(\\d{1,2})\\s*(?:de\\s+)?' + MONTH_RE + '\\b(?:\\s*(?:de|del)?\\s*(\\d{4}))?')))) {
      const y = m[3] ? +m[3] : +TODAY.slice(0, 4); let iso = mkDate(y, monthIdx(m[2]), +m[1]);
      if (iso && !m[3] && iso < addD(-1)) iso = mkDate(y + 1, monthIdx(m[2]), +m[1]); date = iso;
    }
    if (!date && (m = tn.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/))) {
      let y = m[3] ? +m[3] : +TODAY.slice(0, 4); if (y < 100) y += 2000; let iso = mkDate(y, +m[2] - 1, +m[1]);
      if (iso && !m[3] && iso < addD(-1)) iso = mkDate(y + 1, +m[2] - 1, +m[1]); date = iso;
    }
    if (!date && (m = tn.match(/\b(?:el\s+|este\s+|esta\s+|(?:el\s+)?proximo\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)(\s+que viene|\s+proximo)?\b/))) {
      const target = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'].indexOf(m[1]);
      let d = (target - dow + 7) % 7; if (d === 0 && !/\b(este|esta)\s/.test(m[0])) d = 7; date = addD(d);
    }
    if (!date && (m = tn.match(/\b(?:en|dentro de)\s+(\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince|veinte|treinta)\s+(dias?|semanas?|mes|meses)\b/))) {
      const n = numOf(m[1]) || 1; date = /^dia/.test(m[2]) ? addD(n) : /^semana/.test(m[2]) ? addD(7 * n) : (() => { let p = CUR_P; for (let i = 0; i < n; i++) p = ymNext(p); return `${p}-${String(Math.min(+TODAY.slice(8), daysIn(p))).padStart(2, '0')}`; })();
    }
    if (!date && /\b(la )?(proxima semana|semana que viene)\b/.test(tn)) date = addD(((1 - dow + 7) % 7) || 7);
    if (!date && /\bfin de mes\b/.test(tn)) date = isoD(addDays(monthEnd(CUR_P), -1));
    if (!date && (m = tn.match(/\bel(?: dia)? (\d{1,2})\b(?!\s*(?::|h\b|hrs?\b|horas|y media|y cuarto|am\b|pm\b|de la))/))) {
      const d = +m[1]; let iso = mkDate(+TODAY.slice(0, 4), +TODAY.slice(5, 7) - 1, d);
      if (iso && iso < TODAY) { const np = ymNext(CUR_P); iso = mkDate(+np.slice(0, 4), +np.slice(5) - 1, d); } date = iso;
    }
    // hora
    const tt = tn.replace(/\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b/g, ' ');
    let start = null, h = null, mi = 0, ap = ampm;
    if (/\bmediodia\b/.test(tt)) { h = 12; ap = 'x'; }
    if (h == null && (m = tt.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?/))) { h = +m[1]; mi = +m[2]; if (m[3]) ap = m[3]; }
    if (h == null && (m = tt.match(new RegExp('\\b(?:a las|a la|las|desde las|tipo|como a las|para las|sobre las)\\s+' + HW + '(?:\\s+y\\s+(media|cuarto|\\d{1,2}))?(\\s+menos\\s+cuarto)?(?:\\s*(am|pm|en punto|hrs?|horas))?')))) {
      h = numOf(m[1]); mi = m[2] === 'media' ? 30 : m[2] === 'cuarto' ? 15 : m[2] ? +m[2] : 0; if (m[3]) { h -= 1; mi = 45; } if (m[4] === 'am' || m[4] === 'pm') ap = m[4]; if (/^h/.test(m[4] || '') && h > 12) ap = 'x';
    }
    if (h == null && (m = tt.match(/\b(\d{1,2})\s*(am|pm)\b/))) { h = +m[1]; ap = m[2]; }
    if (h == null && (m = t.match(new RegExp('\\b' + HW + '(?:\\s+y\\s+(media|cuarto))?\\s+de la (manana|tarde|noche)\\b')))) { h = numOf(m[1]); mi = m[2] === 'media' ? 30 : m[2] === 'cuarto' ? 15 : 0; ap = m[3] === 'manana' ? 'am' : 'pm'; }
    if (h != null && h >= 0 && h <= 23 && mi >= 0 && mi <= 59) {
      if (ap === 'pm' && h < 12) h += 12; else if (ap === 'am' && h === 12) h = 0; else if (!ap && h >= 1 && h <= 6) h += 12; // sin am/pm: 1 a 6 se entiende de la tarde (horario de oficina)
      start = fromMin(h * 60 + mi);
    }
    return { date, start };
  }
  function parseDur(t) {
    if (/\bhora y media\b/.test(t)) return 90;
    if (/\bmedia hora\b/.test(t)) return 30;
    const m = t.match(/\b(?:de|por|durante|dura|que dure)\s+(\d+|una|un|dos|tres)\s*(horas?|h|hrs?|min|mins|minutos)\b/) || t.match(/\b(\d+)\s*(min|mins|minutos)\b/);
    if (m) { const n = numOf(m[1]); if (n) return /^h/.test(m[2]) ? n * 60 : n; }
    return null;
  }
  const SERVICES = [['DEMO', /\b(demo|demostracion|presentacion)\b/], ['VENTA', /\b(venta|reunion de venta|cierre|propuesta|cotizacion|negociacion)\b/], ['IMPLEMENTACION', /\b(implementacion|instalacion|configuracion|onboarding|arranque)\b/], ['CAPACITACION', /\b(capacitacion|entrenamiento|formacion|taller|induccion)\b/], ['SEGUIMIENTO', /\b(seguimiento|revision|chequeo)\b/], ['SOPORTE', /\b(soporte|falla|problema|incidencia|ayuda tecnica)\b/], ['COBRO', /\b(cobro|cobranza|cobrar)\b/], ['RENOVACION', /\b(renovacion|renovar|cambio de plan|subir de plan)\b/]];
  const parseService = t => (SERVICES.find(([, re]) => re.test(t)) || [])[0] || null;
  const parseModality = t => /\b(presencial|en persona|en la oficina|en su oficina|visita)\b/.test(t) ? 'PRESENCIAL' : /\bwhatsapp|wasap|guasap\b/.test(t) ? 'WHATSAPP' : /\b(videollamada|video|meet|zoom|teams|virtual)\b/.test(t) ? 'VIDEO' : /\b(llamada|telefon|por telefono|llamar)\b/.test(t) ? 'LLAMADA' : null;
  // Método de pago
  function parseMethod(t) {
    if (/\b(bolivares|bolos|bs|ves|pago movil|pagomovil|transferencia|punto de venta|punto)\b/.test(t)) return 'VES';
    if (/\b(binance|usdt|tether|cripto)\b/.test(t)) return 'BINANCE';
    if (/\bpaypal\b/.test(t)) return 'PAYPAL';
    if (/\bzelle\b/.test(t)) return 'ZELLE';
    if (/\b(efectivo|cash|billetes|en fisico)\b/.test(t)) return 'CASH';
    return null;
  }
  // Tipo de dólar al que se cambiaron los bolívares
  function parseRateType(t) {
    const m = t.match(/\b(?:dolar|tasa|a|al|cambio|precio)\s+(?:del?\s+)?(bcv|oficial|binance|usdt|paypal|zelle|efectivo|cash|paralelo)\b/) || t.match(/\b(bcv|oficial)\b/);
    if (!m) return null; return { bcv: 'BCV', oficial: 'BCV', binance: 'BINANCE', usdt: 'BINANCE', paralelo: 'BINANCE', paypal: 'PAYPAL', zelle: 'ZELLE', efectivo: 'EFECTIVO', cash: 'EFECTIVO' }[m[1]] || null;
  }
  function parseRateValue(t) {
    const k = t.match(/\b(?:tasa|dolar|cambio|precio)\s+(?:del?\s+)?(?:bcv|oficial|binance|usdt|paypal|zelle|efectivo|cash|paralelo)\s+(?:de\s+|a\s+|en\s+|=\s*)?(\d{1,4}(?:[.,]\d{1,4})?)(?!\s*(?:bs\b|bolivares|usd|dolares|\$|mil))/); // "tasa binance 205", "dólar bcv a 196,5"
    if (k) { const v = numVE(k[1]); if (v > 0 && v < 100000) return v; }
    const m = t.match(/\b(?:a una tasa de|tasa de|a la tasa de|a razon de|cambiad[oa]s? a|cambie a|lo cambie a|al cambio de|cambio de|tasa|a)\s+(\d{1,4}(?:[.,]\d{1,4})?)\s*(?:bs)?\b(?!\s*(?::|de la|am|pm|horas|dias|usd|dolares|\$))/);
    if (!m) return null; const v = numVE(m[1]); return v > 0 && v < 100000 ? v : null;
  }
  // Montos: "46.400 Bs", "Bs 46.400,50", "US$ 100", "100 dólares", "5 mil bolívares", "120 usdt"
  function parseMoney(t) {
    const out = { usd: null, bs: null, any: null };
    const re = /(us\$|\$|usd|bs\.?|bsf|ves)?\s?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s?(k|mil|millones?)?\s?(us\$|\$|usd|usdt|dolares|dolar|verdes|bs\.?|bolivares|bolos|ves|soberanos)?/g;
    let m;
    while ((m = re.exec(t))) {
      if (!m[2]) { re.lastIndex++; continue; }
      const pre = m[1] || '', post = m[4] || '', end = m.index + m[0].length;
      const before = t.slice(Math.max(0, m.index - 9), m.index), after = t.slice(end, end + 3);
      const isBs = /^(bs|bsf|ves)/.test(pre) || /^(bs|bolivares|bolos|ves|soberanos)/.test(post);
      const isUsd = /(us\$|\$|usd)/.test(pre) || /^(us\$|\$|usd|usdt|dolar|verdes)/.test(post);
      if (!isBs && !isUsd && (/\b(las|la|el|dia|del|de las)\s*$/.test(before) || /^\s?[:/-]\d/.test(after) || /^\s?(am|pm|de la|y media|y cuarto|horas?|min|dias?|semanas?)\b/.test(t.slice(end, end + 10)))) continue;
      const v = numVE(m[2]) * (m[3] ? (/^(k|mil)/.test(m[3]) ? 1000 : 1e6) : 1); if (!(v > 0)) continue;
      if (isBs) { if (out.bs == null) out.bs = v; } else if (isUsd) { if (out.usd == null) out.usd = v; } else if (out.any == null) out.any = v;
    }
    return out;
  }
  // Mes del que se habla: "en septiembre", "el mes pasado", "este mes", "el próximo mes"
  function parsePeriod(t) {
    if (/\b(mes pasado|mes anterior|ultimo mes)\b/.test(t)) return PREV_P;
    if (/\b(proximo mes|mes que viene|siguiente mes)\b/.test(t)) return NEXT_P;
    if (/\b(este mes|mes en curso|mes actual)\b/.test(t)) return CUR_P;
    const m = t.match(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b(?:\s+(?:de|del)?\s*(\d{4}))?/);
    if (!m) return null;
    const mm = String(monthIdx(m[1]) + 1).padStart(2, '0');
    if (m[2]) return `${m[2]}-${mm}`;
    const c = ALL_PERIODS.filter(p => p.slice(5) === mm && p <= NEXT_P); return c.length ? c[c.length - 1] : `${TODAY.slice(0, 4)}-${mm}`;
  }
  // Clientes mencionados (nombre completo o palabras distintivas del nombre)
  const STOP = new Set('de del la las el los y e c a ca sa srl s compania cia grupo inversiones corporacion empresa servicios soluciones tienda the and co cliente clienta'.split(' '));
  const CMD = new Set('agenda agendar cita citas reunion pago pagos caja gastos factura facturas dolar dolares tasa hoy manana binance paypal zelle efectivo bolivares demo llamada video registrar registra cobro cobrar oficina digital app agora mes semana'.split(' '));
  function findClients(t) {
    const out = [];
    clientDefs.forEach(c => {
      const n = prep(c.name); if (!n) return;
      let sc = 0;
      if (hasW(t, n)) sc = 100 + n.length;
      else {
        const toks = n.split(' ').filter(w => w.length >= 3 && !STOP.has(w) && !CMD.has(w));
        const hit = toks.filter(w => hasW(t, w));
        if (hit.length) sc = hit.reduce((a, w) => a + w.length, 0) * (hit.length === toks.length ? 2 : 1);
      }
      if (sc >= 4) out.push({ c, sc });
    });
    return out.sort((a, b) => b.sc - a.sc);
  }
  // Nombre de un prospecto que todavía no es cliente: "con María Pérez", "con la Panadería La Esquina"
  function prospectName(raw) {
    const m = String(raw).match(/\bcon\s+(?:el|la)?\s*(?:cliente|clienta|prospecto|prospecta|señor|señora|senor|senora|sr\.?|sra\.?|lic\.?|ing\.?|dr\.?|dra\.?)?\s*([^\s,.;:!?¿¡]+(?:\s+[^\s,.;:!?¿¡]+){0,5})/i);
    if (!m) return '';
    const HARD = /^(para|a|al|por|en|via|vía|sobre|que|hoy|mañana|manana|pasado|ayer|este|esta|próximo|proximo|próxima|proxima|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo|demo|demostración|demostracion|reunión|reunion|cita|llamada|videollamada|presencial|whatsapp|zoom|meet|las|semana|mes|desde|tipo|como|sobre|\d.*)$/i;
    const SOFT = /^(el|la|los|las|de|del|y)$/i;
    const words = m[1].split(/\s+/); const out = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i], up = /^[A-ZÁÉÍÓÚÑÜ]/.test(w);
      if (HARD.test(w)) break;
      if (SOFT.test(w) && !up && !(/^(de|del|y)$/i.test(w) && /^[A-ZÁÉÍÓÚÑÜ]/.test(words[i + 1] || ''))) break;
      out.push(w);
    }
    return cap(out.join(' ').replace(/[.,;:]+$/, '')).slice(0, 60);
  }

  /* ---------- 3. Datos que Athena consulta ---------- */
  function pendingInvoices(clientId) {
    const ref = addDays(D(TODAY), 1);
    return db.invoices.filter(i => !i.voided && i.issueDate <= TODAY && (!clientId || i.clientId === clientId) && invoiceStatus(i, ref) !== 'PAID')
      .map(i => ({ i, c: db.clients.find(x => x.id === i.clientId), due: invDue(i) || 0 })).filter(x => x.due > 0.004)
      .sort((a, b) => a.i.dueDate.localeCompare(b.i.dueDate));
  }
  const userEvents = (from, to) => events.filter(e => e.date >= from && e.date <= to && !OFF.includes(e.status)).sort(byWhen);
  function briefData() {
    const todayEv = userEvents(TODAY, TODAY);
    const nm = nowMin(); const nextToday = todayEv.find(e => !e.allDay && e.start && toMin(e.start) >= nm - 5) || null;
    const in7 = addD(7);
    const porConf = events.filter(e => e.type === 'CLIENTE' && e.date >= TODAY && e.date <= in7 && (e.status || 'PROGRAMADA') === 'PROGRAMADA');
    const pend = pendingInvoices(); const vencidas = pend.filter(x => x.i.dueDate < TODAY);
    let k = null; try { k = KP(CUR_P); } catch (e) { k = null; }
    const tasaHoy = !!(tasas[TODAY] && Object.keys(tasas[TODAY]).length);
    return { todayEv, nextToday, porConf, pend, vencidas, k, tasaHoy, pendUsd: sum(pend, x => x.due), vencUsd: sum(vencidas, x => x.due) };
  }
  function briefLine() {
    const b = briefData(); const p = [];
    p.push(b.todayEv.length ? `Hoy tienes ${b.todayEv.length} ${b.todayEv.length === 1 ? 'cita' : 'citas'}${b.nextToday ? `, la próxima a las ${hhmm(b.nextToday.start)}` : ''}` : 'Hoy no tienes citas');
    if (b.vencidas.length) p.push(`${b.vencidas.length} ${b.vencidas.length === 1 ? 'factura vencida' : 'facturas vencidas'} por ${money(b.vencUsd)}`);
    else if (b.pend.length) p.push(`${money(b.pendUsd)} por cobrar`);
    return p.join(' y ') + '.' + (b.tasaHoy ? '' : ' Recuerda registrar la tasa de hoy.');
  }

  /* ---------- 4. Piezas de las respuestas ---------- */
  let RUNS = new Map(), runSeq = 0;
  const act = (label, fn, cls = '', ic = '', once = false) => { const id = ++runSeq; RUNS.set(id, fn); return `<button type="button" class="btn btn-sm ${cls}" data-ath-run="${esc(id)}"${once ? ' data-once="1"' : ''}>${ic ? svgI(ic, 14) : ''}<span>${esc(label)}</span></button>`; };
  const acts = arr => `<div class="ath-acts">${arr.filter(Boolean).join('')}</div>`;
  const kpi = (label, value, sub, tone) => `<div class="ak ${tone ? 'ak-' + tone : ''}"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const kpis = arr => `<div class="ath-kpis">${arr.filter(Boolean).join('')}</div>`;
  const row = (title, sub, right, btn, tone) => `<li class="ath-row ${tone ? 'is-' + tone : ''}"><span class="ar-t"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span>${right != null && right !== '' ? `<span class="ar-v">${right}</span>` : ''}${btn || ''}</li>`;
  const list = rows => `<ul class="ath-list">${rows.join('')}</ul>`;
  const qchip = (label, q, ic) => `<button type="button" class="ath-chip" data-ath-q="${esc(q)}">${ic ? svgI(ic, 13) : ''}<span>${esc(label)}</span></button>`;
  const stripHtml = h => { const d = document.createElement('div'); d.innerHTML = String(h || '').replace(/<(br|\/p|\/li|\/div)>/gi, '. '); d.querySelectorAll('.ath-acts,button').forEach(x => x.remove()); return d.textContent.replace(/\s+/g, ' ').replace(/([.!?:])\s*(\.\s*)+/g, '$1 ').trim(); };
  const fixDots = t => String(t).replace(/([ap]\. m\.)\./g, '$1'); // "3:00 p. m.." → "3:00 p. m."
  const R = (html, extra = {}) => Object.assign({}, extra, { html: fixDots(html) }, extra.plain ? { plain: fixDots(extra.plain) } : {});
  const perName = p => `${monthYear(p)}${p === CUR_P ? ' (mes en curso)' : isProj(p) ? ' (proyección)' : ''}`;
  const modLink = (id, label) => act(label || `Ver ${modOf(id).name}`, () => goMod(id), '', modOf(id).icon);

  /* ---------- 5. Respuestas ---------- */
  function greetReply() {
    const b = briefData();
    const items = [];
    items.push(`<li>${svgI('agenda', 15)}<span>${b.todayEv.length ? `Hoy tienes <b>${b.todayEv.length} ${b.todayEv.length === 1 ? 'cita' : 'citas'}</b>${b.nextToday ? `; la próxima es <b>${esc(b.nextToday.title)}</b> a las ${hhmm(b.nextToday.start)}` : ''}.` : 'Hoy no tienes citas agendadas.'}</span></li>`);
    if (b.porConf.length) items.push(`<li>${svgI('chat', 15)}<span><b>${b.porConf.length}</b> ${b.porConf.length === 1 ? 'cita está' : 'citas están'} por confirmar esta semana.</span></li>`);
    items.push(`<li>${svgI('coins', 15)}<span>${b.pend.length ? `Por cobrar: <b>${money(b.pendUsd)}</b> en ${b.pend.length} ${b.pend.length === 1 ? 'factura' : 'facturas'}${b.vencidas.length ? `, <b class="txt-bad">${b.vencidas.length} ${b.vencidas.length === 1 ? 'vencida' : 'vencidas'}</b>` : ''}.` : 'La cobranza está al día.'}</span></li>`);
    if (b.k && b.k.cash != null) items.push(`<li>${svgI('wallet', 15)}<span>Saldo de caja: <b>${money(b.k.cash)}</b>.</span></li>`);
    if (b.k && b.k.goal) items.push(`<li>${svgI('trend', 15)}<span>Vas al <b>${pct(b.k.revenueGoal, 0)}</b> de la meta del mes (${money(b.k.goal)}).</span></li>`);
    if (!b.tasaHoy) items.push(`<li>${svgI('rate', 15)}<span>Todavía no registras la tasa del dólar de hoy.</span></li>`);
    return R(`<p><b>${hola()}.</b> Te cuento cómo va todo:</p><ul class="ath-brief">${items.join('')}</ul><p>¿En qué te ayudo?</p>`, { plain: `${saludo()}${firstName() ? ', ' + firstName() : ''}. ${briefLine()} ¿En qué te ayudo?` });
  }
  function helpReply() {
    const c = clientDefs[0] ? clientDefs[0].name.split(' ').slice(0, 2).join(' ') : 'Juan Pérez';
    const sec = (t, chips) => `<div class="ath-help"><p>${t}</p><div class="ath-chips">${chips.join('')}</div></div>`;
    return R(`<p>Esto es lo que puedo hacer por ti, sin internet y con los datos de este equipo:</p>
      ${sec('Cifras del negocio', [qchip('¿Cómo va el mes?', '¿Cómo va el mes?'), qchip('¿Cuánto cobré en el mes?', '¿Cuánto cobré este mes?'), qchip('¿Cuánto gasté?', '¿Cuánto gasté este mes?'), qchip('¿Cómo está la caja?', '¿Cómo está la caja?')])}
      ${sec('Cobranza y pagos', [qchip('¿Quién me debe?', '¿Quién me debe?'), qchip(`${c} pagó 46.400 Bs a tasa Binance`, `${c} pagó 46.400 Bs a tasa Binance`), qchip('Registrar un pago', 'Registrar un pago')])}
      ${sec('Dólar y bolívares', [qchip('¿A cuánto está el dólar?', '¿A cuánto está el dólar?'), qchip('Convierte 5.000 Bs a dólares', 'Convierte 5.000 Bs a dólares'), qchip('¿Cuánto es 50 dólares en bolívares?', '¿Cuánto es 50 dólares en bolívares?')])}
      ${sec('Agenda', [qchip('¿Qué tengo mañana?', '¿Qué tengo mañana?'), qchip(`Agenda una demo con ${c} el jueves a las 3 pm`, `Agenda una demo con ${c} el jueves a las 3 pm`), qchip('¿Cuándo tengo un horario libre?', '¿Cuándo tengo un horario libre?'), qchip('Citas por confirmar', 'Citas por confirmar')])}
      ${sec('Ir y hacer', [qchip('Abre la Caja', 'Abre la Caja'), qchip('Tema oscuro', 'Tema oscuro'), qchip('Descarga el informe', 'Descarga el informe'), qchip('IGTF', '¿Qué es el IGTF?')])}
      <p class="muted small">También puedes dictarme con el micrófono y abrirme con ${isApple() ? '⌘J' : 'Ctrl J'} o la tecla A.</p>`, { plain: 'Puedo darte las cifras del mes, decirte quién te debe, registrar pagos en Binance, PayPal, Zelle, efectivo o bolívares, convertir con la tasa del día y manejar tu agenda.' });
  }

  // 5a · Cifras
  function metricReply(kind, p) {
    const k = KP(p); if (!k) return R(`No tengo datos de ${monthYear(p)} todavía.`);
    const pn = perName(p);
    if (kind === 'revenue') return R(`<p>En ${pn} ${k.projected ? 'se proyecta facturar' : 'facturaste'} <b>${money(k.revenue)}</b> sin IVA: ${money(k.mrr)} recurrentes y ${money(k.nonMrr)} por única vez.${k.goal ? ` Eso es el <b>${pct(k.revenueGoal, 0)}</b> de la meta (${money(k.goal)}).` : ''}</p>${acts([modLink('ingresos'), modLink('facturacion')])}`);
    if (kind === 'collected') {
      const ps = pagos.filter(x => x.date && inPeriod(x.date, p) && x.date <= TODAY);
      const rows = Object.keys(PM).map(m => { const l = ps.filter(x => x.method === m); return l.length ? row(`<span class="pm-chip" style="--pm:${PM[m].color}">${pmIcon(m, 12)}${PM[m].label}</span>`, `${l.length} pago${l.length === 1 ? '' : 's'}${m === 'VES' ? ' · ' + moneyBs(sum(l, x => +x.amount)) : m === 'BINANCE' ? ' · ' + num(sum(l, x => +x.amount), 2) + ' USDT' : ''}${sum(l, x => +x.fee) ? ' · comisión ' + money(sum(l, x => +x.fee), 2) : ''}`, money(sum(l, x => +x.usd), 2)) : ''; }).filter(Boolean);
      return R(`<p>En ${pn} ${k.projected ? 'se espera cobrar' : 'cobraste'} <b>${money(k.cashCollected)}</b> (con IVA).</p>${rows.length ? list(rows) : '<p class="muted small">Los pagos registrados antes de la versión 10 no tienen método.</p>'}${acts([modLink('caja'), act('Registrar un pago', () => pickInvoiceToPay(), '', 'coins')])}`, { plain: `En ${monthYear(p)} cobraste ${money(k.cashCollected)}.` });
    }
    if (kind === 'expenses') {
      const top = Object.entries(k.spendByCat || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
      return R(`<p>En ${pn} ${k.projected ? 'se proyectan' : 'llevas'} <b>${money(k.spendTotal)}</b> en gastos${k.budgetExec != null ? `, el ${pct(k.budgetExec, 0)} del presupuesto` : ''}${k.invMonth ? `, más ${money(k.invMonth)} de inversión` : ''}.</p>${top.length ? list(top.map(([c, v]) => row(esc(catLabel(c)), '', money(v)))) : ''}${acts([modLink('gastos'), act('Registrar un gasto', () => withKey(() => expModal(null)), '', 'plus')])}`, { plain: `En ${monthYear(p)} llevas ${money(k.spendTotal)} en gastos.` });
    }
    if (kind === 'result') return R(`<p>El resultado de ${pn} es <b class="${k.result < 0 ? 'txt-bad' : 'txt-ok'}">${money(k.result)}</b>.</p>${kpis([kpi('Ingresos', money(k.revenue)), kpi('Gastos', money(k.spendTotal)), kpi('Inversión', money(k.invMonth)), kpi('Antes de invertir', money(k.resultBefore), '', k.resultBefore < 0 ? 'bad' : '')])}${acts([modLink('rentabilidad'), modLink('utilidades')])}`, { plain: `El resultado de ${monthYear(p)} es ${money(k.result)}.` });
    if (kind === 'cash') return R(`<p>El saldo de caja ${p === CUR_P ? 'hoy' : 'al cierre de ' + monthYear(p)} es <b class="${k.cash < 0 ? 'txt-bad' : ''}">${money(k.cash)}</b>. Se calcula solo: cobros menos egresos.</p>${kpis([kpi('Cobrado', money(k.cashCollected)), kpi('Egresos', money(k.egresoMes)), kpi('Flujo del mes', money(k.netFlow), '', k.netFlow < 0 ? 'bad' : 'ok')])}${acts([modLink('caja')])}`, { plain: `El saldo de caja es ${money(k.cash)}.` });
    if (kind === 'mrr') return R(`<p>Ingreso recurrente mensual (MRR) al cierre de ${pn}: <b>${money(k.mrrEnd)}</b>; al año (ARR) son ${money(k.mrrEnd * 12)}.</p>${kpis([kpi('Clientes activos', num(k.activeAtClose)), kpi('Ingreso promedio', money(k.arpuClose)), kpi('En pausa', num(k.pausedAtClose || 0))])}${acts([modLink('clientes'), modLink('ingresos')])}`, { plain: `El MRR es ${money(k.mrrEnd)}.` });
    if (kind === 'clients') return R(`<p>Al cierre de ${pn} hay <b>${k.activeAtClose}</b> ${k.activeAtClose === 1 ? 'cliente activo' : 'clientes activos'}${k.pausedAtClose ? `, ${k.pausedAtClose} en pausa` : ''} y ${k.churnedClients || 0} ${k.churnedClients === 1 ? 'baja' : 'bajas'}${k.churnPct != null ? ` (${pct(k.churnPct)} de la cartera)` : ''}.</p>${acts([modLink('clientes'), modLink('pausas')])}`);
    if (kind === 'goal') return R(k.goal ? `<p>La meta de ${pn} es <b>${money(k.goal)}</b> y llevas ${money(k.revenue)}: el <b>${pct(k.revenueGoal, 0)}</b>.${p === CUR_P ? ` Quedan ${daysIn(p) - +TODAY.slice(8) } días del mes.` : ''}</p>` : '<p>Todavía no tienes una meta para ese mes. Puedes ponerla en Ajustes → Meta de ingresos.</p>');
    if (kind === 'fees') { const ps = pagos.filter(x => x.date && inPeriod(x.date, p) && +x.fee > 0); return R(ps.length ? `<p>En ${pn} las plataformas te descontaron <b>${money(sum(ps, x => +x.fee), 2)}</b> en ${ps.length} ${ps.length === 1 ? 'pago' : 'pagos'}. Ya están en Gastos, en "Comisiones bancarias y de pasarelas".</p>${acts([act('Editar comisiones', () => withKey(() => payFeesModal()), '', 'gear')])}` : `<p>En ${pn} no hay comisiones de cobro registradas.</p>`); }
    // resumen del mes
    const b = briefData();
    const left = p === CUR_P ? daysIn(p) - +TODAY.slice(8) : null;
    return R(`<p>Así ${k.projected ? 'se proyecta' : 'va'} <b>${pn}</b>:</p>${kpis([kpi('Ingresos', money(k.revenue), k.goal ? `${pct(k.revenueGoal, 0)} de la meta` : 'Sin IVA'), kpi('Gastos', money(k.spendTotal), k.budgetExec != null ? `${pct(k.budgetExec, 0)} del presupuesto` : ''), kpi('Resultado', money(k.result), k.invMonth ? `Con ${money(k.invMonth)} de inversión` : '', k.result < 0 ? 'bad' : 'ok'), kpi(k.projected ? 'Cobro esperado' : 'Cobrado', money(k.cashCollected), 'Con IVA'), kpi('Caja', money(k.cash), 'Cobros − egresos', k.cash < 0 ? 'bad' : ''), kpi('Clientes', num(k.activeAtClose), `MRR ${money(k.mrrEnd)}`)])}
      ${p === CUR_P && b.pend.length ? `<p class="ath-tip">${svgI('coins', 14)} Tienes ${money(b.pendUsd)} por cobrar${b.vencidas.length ? `, ${money(b.vencUsd)} ya vencidos` : ''}.${left != null ? ` Quedan ${left} días del mes.` : ''}</p>` : ''}${acts([modLink('resumen', 'Ver el Resumen'), modLink('caja'), b.pend.length ? act('¿Quién me debe?', () => ask('¿Quién me debe?')) : ''])}`, { plain: `En ${monthYear(p)}: ingresos ${money(k.revenue)}, gastos ${money(k.spendTotal)}, resultado ${money(k.result)} y caja ${money(k.cash)}.` });
  }

  // 5b · Cobranza
  function arReply(c, onlyLate) {
    let pend = pendingInvoices(c ? c.id : null);
    if (onlyLate) { const v = pend.filter(x => x.i.dueDate < TODAY); if (!v.length) return R(`<p>No hay facturas vencidas${c ? ' de <b>' + esc(c.name) + '</b>' : ''}. ${pend.length ? `Por cobrar (sin vencer) hay ${money(sum(pend, x => x.due), 2)}.` : '¡La cobranza está al día!'}</p>`); pend = v; }
    if (!pend.length) return R(c ? `<p><b>${esc(c.name)}</b> no tiene facturas por cobrar. ¡Al día!</p>` : '<p>No hay facturas por cobrar. ¡La cobranza está al día!</p>');
    const venc = pend.filter(x => x.i.dueDate < TODAY);
    const rows = pend.slice(0, 7).map(x => { const late = Math.round((D(TODAY) - D(x.i.dueDate)) / DAY); return row(esc(x.c ? x.c.name : '—'), `Factura ${esc(x.i.num || x.i.id)} · ${late > 0 ? `<span class="txt-bad">vencida hace ${late} ${late === 1 ? 'día' : 'días'}</span>` : late === 0 ? 'vence hoy' : 'vence el ' + fmtDate(x.i.dueDate)}`, money(x.due, 2), act('Cobrar', () => withKey(() => payModal(x.i.id)), 'btn-tint'), late > 0 ? 'bad' : ''); });
    return R(`<p>${c ? `<b>${esc(c.name)}</b> te debe` : 'Te deben'} <b>${money(sum(pend, x => x.due), 2)}</b> en ${pend.length} ${pend.length === 1 ? 'factura' : 'facturas'}${venc.length ? `; <b class="txt-bad">${venc.length} ${venc.length === 1 ? 'está vencida' : 'están vencidas'}</b> (${money(sum(venc, x => x.due), 2)})` : ''}.</p>${list(rows)}${pend.length > 7 ? `<p class="muted small">Y ${pend.length - 7} más en Cobranza.</p>` : ''}${acts([modLink('cobranza'), modLink('facturacion')])}`, { plain: `${c ? c.name + ' te debe' : 'Te deben'} ${money(sum(pend, x => x.due), 2)} en ${pend.length} ${pend.length === 1 ? 'factura' : 'facturas'}${venc.length ? `, ${venc.length === pend.length ? (venc.length === 1 ? 'vencida' : 'todas vencidas') : venc.length + (venc.length === 1 ? ' vencida' : ' vencidas')}` : ''}.` });
  }

  // 5c · Registrar un pago
  function payReply(t, cands) {
    const method = parseMethod(t), m = parseMoney(t), rt = parseRateType(t), rv = parseRateValue(t);
    const preset = {}; if (method) preset.method = method;
    if (method === 'VES' || (!method && m.bs)) { preset.method = 'VES'; const bs = m.bs || m.any; if (bs) preset.amountBs = num(bs, 2); if (rt) preset.rateType = rt; if (rv && rv !== bs) preset.rate = num(rv, 2); }
    else { const usd = m.usd || m.any; if (usd) preset.amount = usd; }
    const desc = [preset.method ? PM[preset.method].label : '', preset.amountBs ? 'Bs ' + preset.amountBs : '', preset.amount ? money(preset.amount, 2) : '', preset.rateType ? 'dólar ' + RATE_SHORT[preset.rateType] : '', preset.rate ? 'a ' + preset.rate + ' Bs/US$' : ''].filter(Boolean).join(' · ');
    const pre = desc ? ` Ya dejé cargado: <b>${esc(desc)}</b>. Solo falta la referencia.` : '';
    if (!cands.length) return R(`<p>Te abro las facturas por cobrar para que elijas cuál vas a registrar.${pre}</p>`, { after: () => pickInvoiceToPayPreset(null, preset), close: true });
    if (cands.length > 1 && cands[0].sc === cands[1].sc) return R(`<p>¿De cuál cliente es el pago?</p>${acts(cands.slice(0, 4).map(x => act(x.c.name, () => runReply(payForClient(x.c, preset, pre)), 'btn-tint')))}`);
    return payForClient(cands[0].c, preset, pre);
  }
  function payForClient(c, preset, pre) {
    const pend = pendingInvoices(c.id);
    if (!pend.length) return R(`<p><b>${esc(c.name)}</b> no tiene facturas por cobrar. Si te pagó por adelantado, crea primero la factura en el Facturero.</p>${acts([modLink('facturero', 'Abrir el Facturero')])}`);
    if (pend.length === 1) { const x = pend[0]; return R(`<p>Abro el pago de la factura <b>${esc(x.i.num || x.i.id)}</b> de <b>${esc(c.name)}</b> (saldo ${money(x.due, 2)}).${pre || ''}</p>`, { after: () => withKey(() => payModal(x.i.id, null, preset)), close: true }); }
    return R(`<p><b>${esc(c.name)}</b> tiene ${pend.length} facturas por cobrar. ¿Cuál vas a registrar?</p>${list(pend.slice(0, 6).map(x => row(`Factura ${esc(x.i.num || x.i.id)}`, `Vence el ${fmtDate(x.i.dueDate)}${x.i.dueDate < TODAY ? ' · <span class="txt-bad">vencida</span>' : ''}`, money(x.due, 2), act('Cobrar', () => withKey(() => payModal(x.i.id, null, preset)), 'btn-tint'))))}`);
  }
  function pickInvoiceToPayPreset(clientQ, preset) {
    const pend = pendingInvoices(); if (!pend.length) return toast('No hay facturas por cobrar. ¡Todo al día!');
    if (!preset || !Object.keys(preset).length) return pickInvoiceToPay(clientQ);
    if (pend.length === 1) return withKey(() => payModal(pend[0].i.id, null, preset));
    openAthena(); runReply(R(`<p>¿Cuál factura vas a cobrar?</p>${list(pend.slice(0, 8).map(x => row(esc(x.c ? x.c.name : '—'), `Factura ${esc(x.i.num || x.i.id)} · vence el ${fmtDate(x.i.dueDate)}`, money(x.due, 2), act('Cobrar', () => withKey(() => payModal(x.i.id, null, preset)), 'btn-tint'))))}`));
  }

  // 5d · Tasas del dólar y conversiones
  const RT = ['BCV', 'BINANCE', 'PAYPAL', 'ZELLE', 'EFECTIVO'];
  function ratesReply() {
    const rows = RT.map(k => { const r = rateOn(k, TODAY); return row(`Dólar ${RATE_SHORT[k]}`, r ? (r.monthly ? 'referencia del mes' : r.date === TODAY ? 'registrada hoy' : 'última: ' + fmtDate(r.date)) : 'sin registrar', r ? fmtRate(r.rate) : '—'); });
    const bcv = rateOn('BCV', TODAY), bin = rateOn('BINANCE', TODAY);
    const gap = bcv && bin && !bin.monthly ? (bin.rate / bcv.rate - 1) * 100 : null;
    return R(`<p>Estas son las tasas que tengo (Bs por US$). Las tomo de lo que registras en Ajustes → Tasas del día; no las busco en internet.</p>${list(rows)}${gap != null ? `<p class="ath-tip">${svgI('rate', 14)} Brecha entre el dólar Binance y el BCV: <b>${pct(gap, 1)}</b>.</p>` : ''}${acts([act('Registrar las tasas de hoy', () => withKey(() => tasasModal()), 'btn-cta', 'rate'), qchip('Convierte 5.000 Bs', 'Convierte 5.000 Bs a dólares')])}`, { plain: bcv ? `Dólar BCV ${num(bcv.rate, 2)} bolívares${bin ? ` y Binance ${num(bin.rate, 2)}${bin.monthly ? ' (referencia del mes)' : ''}` : ''}.` : bin ? `No tienes el dólar BCV registrado; la referencia Binance es ${num(bin.rate, 2)} bolívares por dólar. Registra las tasas de hoy en Ajustes.` : 'Todavía no hay tasas registradas.' });
  }
  function convertReply(t) {
    const m = parseMoney(t), rt = parseRateType(t), rv = parseRateValue(t);
    let dir = null, amt = null;
    if (m.bs) { dir = 'bs'; amt = m.bs; } else if (m.usd) { dir = 'usd'; amt = m.usd; }
    else if (m.any) { amt = m.any; dir = /\b(a|en) (dolares|usd|divisas)\b|\bcuantos dolares\b/.test(t) ? 'bs' : /\b(a|en) (bolivares|bs)\b|\bcuantos (bolivares|bs)\b/.test(t) ? 'usd' : null; }
    if (!amt) return R('<p>Dime el monto y la moneda. Por ejemplo: “convierte 5.000 Bs a dólares” o “¿cuánto es 50 dólares en bolívares?”.</p>');
    if (!dir) return R(`<p>¿${num(amt, 2)} qué son, bolívares o dólares?</p>${acts([act(`${num(amt, 2)} bolívares`, () => runReply(convertReply(`${num(amt, 2)} bs a dolares`))), act(`${num(amt, 2)} dólares`, () => runReply(convertReply(`${num(amt, 2)} dolares a bolivares`)))])}`);
    const opts = rv && (!m.bs || rv !== m.bs) ? [{ k: 'OTRA', rate: rv, src: 'la tasa que indicaste' }] : (rt ? [rt] : RT).map(k => { const r = rateOn(k, TODAY); return r ? { k, rate: r.rate, src: r.monthly ? 'referencia del mes' : r.date === TODAY ? 'de hoy' : 'del ' + fmtDate(r.date) } : null; }).filter(Boolean);
    if (!opts.length) return R(`<p>No tengo la tasa ${rt ? 'del dólar ' + RATE_SHORT[rt] : 'del día'} registrada. Regístrala y te hago la cuenta.</p>${acts([act('Registrar las tasas de hoy', () => withKey(() => tasasModal()), 'btn-cta', 'rate')])}`);
    const rows = opts.map(o => row(o.k === 'OTRA' ? 'Tasa indicada' : `Dólar ${RATE_SHORT[o.k]}`, `${fmtRate(o.rate)} · ${o.src}`, dir === 'bs' ? money(amt / o.rate, 2) : moneyBs(amt * o.rate)));
    const first = opts[0];
    return R(`<p>${dir === 'bs' ? `<b>${moneyBs(amt)}</b> equivalen a:` : `<b>${money(amt, 2)}</b> equivalen a:`}</p>${list(rows)}`, { plain: (dir === 'bs' ? `${moneyBs(amt)} son ${money(amt / first.rate, 2)}` : `${money(amt, 2)} son ${moneyBs(amt * first.rate)}`) + (first.k === 'OTRA' ? ` a la tasa que indicaste (${num(first.rate, 2)} Bs/US$).` : ` al dólar ${RATE_SHORT[first.k]} (${num(first.rate, 2)} Bs/US$).`) });
  }
  function rateSetReply(t) {
    const type = parseRateType(t); const m = parseMoney(t); const v = parseRateValue(t) || m.any || m.bs;
    if (!type || !(v > 0)) return R('<p>Dime cuál dólar y en cuánto está. Por ejemplo: “registra la tasa BCV en 196,50”.</p>');
    const save = () => { tasas[TODAY] = Object.assign({}, tasas[TODAY] || {}, { [type]: v }); store.set('tasas_v1', tasas); if (typeof rebuild === 'function') { rebuild(); if (typeof bumpData === 'function') bumpData(); } logAudit(`registró la tasa ${RATE_SHORT[type]} del ${fmtDate(TODAY)}: ${num(v, 2)} Bs/US$ (con Athena)`, 'ajustes'); render(); aiSay(`<p>¡Listo! Guardé el dólar <b>${RATE_SHORT[type]}</b> de hoy en <b>${fmtRate(v)}</b>. Se va a proponer solo al registrar pagos en bolívares.</p>`); };
    return R(`<p>Voy a guardar el dólar <b>${RATE_SHORT[type]}</b> de hoy en <b>${fmtRate(v)}</b>.</p>${acts([act('Guardar', () => withKey(save), 'btn-cta', 'check', true), act('Abrir Tasas del día', () => withKey(() => tasasModal()))])}`);
  }

  // 5e · Agenda
  function rangeOf(t) {
    const dow = D(TODAY).getUTCDay(); const tn = t.replace(/\b(de|en|por) la manana\b/g, ' ');
    if (/\bpasado manana\b/.test(tn)) return [addD(2), addD(2), 'pasado mañana'];
    if (/\bmanana\b/.test(tn)) return [addD(1), addD(1), 'mañana'];
    if (/\b(proxima semana|semana que viene)\b/.test(tn)) { const a = addD(((1 - dow + 7) % 7) || 7); return [a, isoD(addDays(D(a), 6)), 'la próxima semana']; }
    if (/\b(esta semana|la semana)\b/.test(tn)) return [TODAY, isoD(addDays(D(weekStart(TODAY)), 6)), 'esta semana'];
    if (/\b(este mes|del mes|el mes)\b/.test(tn)) return [TODAY, isoD(addDays(monthEnd(CUR_P), -1)), 'lo que queda del mes'];
    const w = parseWhen(t); if (w.date) return [w.date, w.date, dayLong(w.date)];
    return [TODAY, TODAY, 'hoy'];
  }
  const evLine = e => row(`${esc(e.title)}`, `${e.date === TODAY ? 'Hoy' : esc(dayLongCap(e.date))} · ${esc(evTime(e))}${e.type === 'CLIENTE' ? ' · ' + esc(EV_STATUS[e.status || 'PROGRAMADA'][0]) : ''}`, '', act('Abrir', () => evDetail(e.id), '', '', false), e.status === 'CONFIRMADA' ? 'ok' : '');
  function agendaReply(t) {
    if (/\b(proxima|siguiente) (cita|reunion)\b|\bque sigue\b/.test(t)) {
      const nm = nowMin(); const n = events.filter(e => !DONE.includes(e.status) && (e.date > TODAY || (e.date === TODAY && (!e.start || toMin(e.start) >= nm)))).sort(byWhen)[0];
      return n ? R(`<p>Tu próxima cita es <b>${esc(n.title)}</b>, ${n.date === TODAY ? 'hoy' : esc(dayLong(n.date))} a las ${hhmm(n.start) || 'hora por definir'}.</p>${list([evLine(n)])}`, { plain: `Tu próxima cita es ${n.title}, ${n.date === TODAY ? 'hoy' : dayLong(n.date)} a las ${hhmm(n.start)}.` }) : R(`<p>No tienes citas próximas. ¿Agendamos una?</p>${acts([act('Agendar una cita', () => eventModal(null, TODAY, { type: 'CLIENTE' }), 'btn-cta', 'plus')])}`);
    }
    const [from, to, lbl] = rangeOf(t);
    const ev = userEvents(from, to); const sys = sysEvents(from, to).filter(e => e.sys !== 'GASTO');
    const cuando = ['hoy', 'mañana', 'pasado mañana'].includes(lbl) ? lbl : 'para ' + lbl;
    if (!ev.length && !sys.length) return R(`<p>No tienes nada agendado ${lbl === 'hoy' || lbl === 'mañana' || lbl === 'pasado mañana' ? lbl : 'para ' + esc(lbl)}. ¿Agendamos algo?</p>${acts([act('Agendar una cita', () => eventModal(null, from < TODAY ? TODAY : from, { type: 'CLIENTE' }), 'btn-cta', 'plus'), modLink('agenda', 'Abrir la Agenda')])}`, { plain: `No tienes nada agendado para ${lbl}.` });
    const rows = ev.slice(0, 8).map(evLine).concat(sys.slice(0, 4).map(e => row(esc(e.title), `${esc(dayLongCap(e.date))} · ${esc(e.detail || SYS_TYPES[e.sys].label)}`, '', '', 'sys')));
    return R(`<p>${ev.length ? `${cap(lbl)} tienes <b>${ev.length} ${ev.length === 1 ? 'cita o reunión' : 'citas y reuniones'}</b>${sys.length ? ` y ${sys.length} ${sys.length === 1 ? 'fecha del sistema' : 'fechas del sistema'}` : ''}:` : `No tienes citas ${esc(cuando)}, pero hay ${sys.length} ${sys.length === 1 ? 'fecha del sistema' : 'fechas del sistema'}:`}</p>${list(rows)}${ev.length > 8 ? `<p class="muted small">Y ${ev.length - 8} más en la Agenda.</p>` : ''}${acts([modLink('agenda', 'Abrir la Agenda'), act('Agendar otra', () => eventModal(null, from < TODAY ? TODAY : from, { type: 'CLIENTE' }), '', 'plus')])}`, { plain: ev.length ? `${cap(lbl)} tienes ${ev.length} ${ev.length === 1 ? 'cita' : 'citas'}${ev[0] ? `; la primera es ${ev[0].title}${ev[0].start ? ' a las ' + hhmm(ev[0].start) : ''}` : ''}.` : `No tienes citas ${cuando}; hay ${sys.length} fechas del sistema, como vencimientos de facturas.` });
  }
  function confirmReply() {
    const l = events.filter(e => e.type === 'CLIENTE' && e.date >= TODAY && e.date <= addD(14) && (e.status || 'PROGRAMADA') === 'PROGRAMADA').sort(byWhen);
    if (!l.length) return R('<p>No tienes citas por confirmar en las próximas dos semanas. ¡Todo confirmado!</p>');
    return R(`<p>Tienes <b>${l.length}</b> ${l.length === 1 ? 'cita por confirmar' : 'citas por confirmar'}. Toca “WhatsApp” y se abre con el mensaje listo:</p>${list(l.slice(0, 8).map(e => row(esc(e.title), `${e.date === TODAY ? 'Hoy' : esc(dayLongCap(e.date))} · ${esc(hhmm(e.start))}${e.confirmSentAt ? ' · mensaje enviado' : ''}`, '', waNumber(e.phone) ? `<button type="button" class="btn btn-sm btn-ok" data-ev-wa="${esc(e.id)}">${svgI('chat', 13)}<span>WhatsApp</span></button>` : act('Agregar teléfono', () => eventModal(e.id)))))}`, { plain: `Tienes ${l.length} citas por confirmar.` });
  }
  function freeSlots(from, dur, n = 3) {
    const out = []; let d = from, tm = null;
    for (let i = 0; i < 12 && out.length < n; i++) { const fs = nextFreeSlot(d, tm, dur); if (!fs) break; if (!out.some(x => x.date === fs.date && x.start === fs.start)) out.push(fs); d = fs.date; tm = fromMin(toMin(fs.start) + Math.max(dur, 60)); }
    return out;
  }
  function freeReply(t) {
    const w = parseWhen(t); const dur = parseDur(t) || agCfg.dur || 30; const from = w.date && w.date >= TODAY ? w.date : TODAY;
    const sl = freeSlots(from, dur, 4);
    if (!sl.length) return R(`<p>No encontré horarios libres en los próximos 45 días con tu horario de atención (${esc(agCfg.days.map(d => DOW_S[d]).join(', '))} de ${hhmm(agCfg.start)} a ${hhmm(agCfg.end)}).</p>${acts([act('Editar mi horario', () => agendaCfgModal(), '', 'gear')])}`);
    return R(`<p>Estos son tus próximos horarios libres de ${dur} minutos:</p>${list(sl.map(s => row(`${s.date === TODAY ? 'Hoy' : esc(dayLongCap(s.date))}`, `${hhmm(s.start)} – ${hhmm(s.end)}`, '', act('Agendar aquí', () => eventModal(null, s.date, { type: 'CLIENTE', start: s.start, duration: dur }), 'btn-tint'))))}`, { plain: `Tu próximo horario libre es ${sl[0].date === TODAY ? 'hoy' : dayLong(sl[0].date)} a las ${hhmm(sl[0].start)}.` });
  }
  function nextWorkday(from) { for (let i = 1; i < 15; i++) { const d = isoD(addDays(D(from), i)); if (agCfg.days.includes(D(d).getUTCDay())) return d; } return isoD(addDays(D(from), 1)); }
  function scheduleReply(t, raw, forced = {}) {
    const w = parseWhen(t);
    let type = 'CLIENTE';
    if (/\bsocios\b/.test(t)) type = 'SOCIOS'; else if (/\binversionistas?\b/.test(t)) type = 'INVERSIONISTAS'; else if (/\b(reunion de equipo|con el equipo|del equipo)\b/.test(t)) type = 'EQUIPO';
    let client = forced.client || null, prospect = forced.prospect || '';
    if (type === 'CLIENTE' && !client && !prospect) {
      const cands = findClients(t);
      if (cands.length > 1 && cands[0].sc === cands[1].sc) return R(`<p>¿Con cuál cliente es la cita?</p>${acts(cands.slice(0, 4).map(x => act(x.c.name, () => runReply(scheduleReply(t, raw, { ...forced, client: x.c })), 'btn-tint')))}`);
      if (cands.length) client = cands[0].c; else prospect = prospectName(raw);
    }
    const service = parseService(t) || (type === 'CLIENTE' ? (client ? 'SEGUIMIENTO' : 'DEMO') : null); // sin servicio: seguimiento si ya es cliente, demostración si es un prospecto
    const dur = forced.duration || parseDur(t) || (service === 'DEMO' ? 20 : agCfg.dur || 30);
    const modality = parseModality(t) || 'VIDEO';
    let date = forced.date || w.date, start = forced.start || w.start, note = '';
    if (date && date < TODAY) return R('<p>Esa fecha ya pasó. Dime otra y te la agendo.</p>');
    if (!date && start) date = toMin(start) > nowMin() + 10 ? TODAY : nextWorkday(TODAY);
    if (!start) { const fs = nextFreeSlot(date || TODAY, null, dur); if (fs) { if (date && fs.date !== date) note = `Ese día no tienes horarios libres; te propongo el primero disponible.`; else note = 'No me dijiste la hora: te propongo el primer horario libre.'; date = fs.date; start = fs.start; } else return R('<p>No encontré un horario libre cercano. Dime la fecha y la hora.</p>'); }
    if (!date) date = TODAY;
    if (type === 'CLIENTE' && !client && !prospect) return R(`<p>¿Con quién es la cita? Te abro el formulario con ${date === TODAY ? 'hoy' : esc(dayLong(date))} a las ${hhmm(start)} ya cargado.</p>`, { after: () => eventModal(null, date, { type: 'CLIENTE', start, duration: dur, service }), close: true });
    const name = client ? client.name : prospect;
    const title = type === 'CLIENTE' ? `${EV_SERVICES[service] || 'Cita'} · ${name}` : (EV_TYPES[type] || EV_TYPES.OTRO).label;
    const end = fromMin(toMin(start) + dur);
    const cs = evConflicts({ date, start, end, duration: dur, allDay: false }, null);
    const dow = D(date).getUTCDay(); const outH = !agCfg.days.includes(dow) || toMin(start) < toMin(agCfg.start) || toMin(start) + dur > toMin(agCfg.end);
    const ev = { type, title, date, start, end, duration: dur, service, modality, clientId: client ? client.id : '', clientName: client ? '' : prospect };
    const icon = { VIDEO: 'video', PRESENCIAL: 'pin', LLAMADA: 'phone', WHATSAPP: 'chat' }[modality] || 'video';
    const card = `<div class="ath-ev" style="--ec:${(EV_TYPES[type] || EV_TYPES.OTRO).color}"><p class="ath-ev-k"><i></i>${esc((EV_TYPES[type] || EV_TYPES.OTRO).label)}${type === 'CLIENTE' && !client ? ' · prospecto' : ''}</p><b class="ath-ev-t">${esc(title)}</b>
      <p class="ath-ev-w">${svgI('clock', 14)}<span>${esc(dayLongCap(date))} · ${esc(hhmm(start))} – ${esc(hhmm(end))}</span></p>
      ${type === 'CLIENTE' ? `<p class="ath-ev-w">${svgI(icon, 14)}<span>${esc(EV_MODALITY[modality])}${client && client.opt && client.opt.tel ? ' · ' + esc(client.opt.tel) : ''}</span></p>` : ''}
      ${cs.length ? `<p class="ath-warn">${svgI('warn', 14)}<span>Se cruza con ${cs.map(c => esc(`${c.title} (${evTime(c)})`)).join(', ')}.</span></p>` : ''}
      ${outH ? `<p class="ath-warn">${svgI('clock', 14)}<span>Queda fuera de tu horario de atención.</span></p>` : ''}
      ${note ? `<p class="ath-note">${esc(note)}</p>` : ''}</div>`;
    const doIt = () => { const e = createEvent(ev); const tel = waNumber(e.phone); runReply(R(`<p>¡Listo! Agendé <b>${esc(e.title)}</b> para el ${esc(dayLong(e.date))} a las ${hhmm(e.start)}.${e.reminder ? ` Te aviso ${esc((EV_REMIND[e.reminder] || '').toLowerCase())}.` : ''}</p>${acts([tel ? `<button type="button" class="btn btn-sm btn-ok" data-ev-wa="${esc(e.id)}">${svgI('chat', 14)}<span>Confirmar por WhatsApp</span></button>` : '', act('Ver en la Agenda', () => { state.agDay = e.date; state.agMonth = e.date.slice(0, 7); goMod('agenda'); }, '', 'agenda'), `<button type="button" class="btn btn-sm" data-ev-ics="${esc(e.id)}">${svgI('download', 14)}<span>Calendario</span></button>`])}`, { plain: `Listo. Agendé ${e.title} para el ${dayLong(e.date)} a las ${hhmm(e.start)}.` })); };
    const other = () => { const fs = nextFreeSlot(date, fromMin(toMin(start) + Math.max(dur, 30)), dur); if (!fs) return aiSay('<p>No encontré otro horario libre cercano.</p>'); runReply(scheduleReply(t, raw, { client, prospect, date: fs.date, start: fs.start, duration: dur })); };
    return R(`<p>${cs.length ? 'Ojo, ese horario está ocupado. ' : ''}¿Te la agendo así?</p>${card}${acts([act('Agendar', doIt, 'btn-cta', 'check', true), act('Editar antes', () => eventModal(null, date, { type, clientId: client ? client.id : '', clientName: client ? '' : prospect, service, start, duration: dur })), act('Otro horario', other, '', 'refresh')])}`, { plain: `¿Te agendo ${title} el ${dayLong(date)} a las ${hhmm(start)}?` });
  }
  function createEvent(p) {
    const now = new Date().toISOString(), cli = p.type === 'CLIENTE';
    const c = p.clientId ? clientDefs.find(x => x.id === p.clientId) : null;
    const data = { title: p.title, type: p.type, date: p.date, allDay: false, start: p.start, end: p.end, duration: p.duration, place: '', notes: '', ownerId: 'dir', reminder: +agCfg.reminder || 0, updatedAt: now,
      participants: p.type === 'SOCIOS' ? socios.map(s => ({ k: 's', id: s.id })) : p.type === 'INVERSIONISTAS' ? investors.map(v => ({ k: 'i', id: v.id })) : [],
      ...(cli ? { clientId: p.clientId || '', clientName: p.clientId ? '' : p.clientName || '', phone: (c && c.opt && c.opt.tel) || '', email: (c && c.opt && c.opt.email) || '', service: p.service || 'DEMO', modality: p.modality || 'VIDEO', status: 'PROGRAMADA' } : { clientId: '', clientName: '', status: null }) };
    const e = { id: 'ev' + Date.now().toString(36), ...data, createdAt: now, createdBy: auditUser(), via: 'athena' };
    events.push(e); saveEvents(); state.agDay = e.date; state.agMonth = e.date.slice(0, 7);
    if (e.reminder > 0 && window.askNotifyPermission) askNotifyPermission();
    logAudit(`agendó "${e.title}" (${(EV_TYPES[e.type] || EV_TYPES.OTRO).label.toLowerCase()}${cli ? ' · programada' : ''}) para el ${fmtDate(e.date)} a las ${hhmm(e.start)}${cli ? ' con ' + (evClientName(e) || 'un prospecto') : ''} · con Athena`, 'agenda');
    render(); toast(`Agendado: ${dayLong(e.date)} a las ${hhmm(e.start)}`); return e;
  }

  // 5f · Ficha rápida de un cliente
  function clientReply(c) {
    const subs = db.subscriptions.filter(s => s.clientId === c.id && activeOn(s, D(TODAY)));
    const fee = sum(subs, s => s.monthlyFee); const plan = subs.filter(s => s.plan).map(s => PLANS[s.plan].label).join(', ');
    const d = db.clients.find(x => x.id === c.id) || {}; const pend = pendingInvoices(c.id); const debt = sum(pend, x => x.due);
    const next = events.filter(e => e.clientId === c.id && e.date >= TODAY && !DONE.includes(e.status)).sort(byWhen)[0];
    const paused = pausedOn(db, c.id, D(TODAY)); const tel = waNumber(c.opt && c.opt.tel);
    return R(`<p><b>${esc(c.name)}</b>${c.sector && c.sector !== 'Sin sector' ? ` · ${esc(c.sector)}` : ''}${paused ? ' · <span class="txt-warn">en pausa</span>' : ''}</p>${kpis([kpi('Plan', plan ? esc(plan) : subs.length ? 'Servicio' : 'Sin plan', fee ? money(fee) + ' al mes' : ''), kpi('Salud', d.healthScore != null ? `${num(d.healthScore)}/10` : 'N/D'), kpi('Te debe', money(debt, 2), pend.length ? `${pend.length} ${pend.length === 1 ? 'factura' : 'facturas'}` : 'Al día', debt > 0 ? 'bad' : 'ok'), kpi('Próxima cita', next ? (next.date === TODAY ? 'Hoy' : fmtDate(next.date)) : 'Ninguna', next ? esc(hhmm(next.start)) : '')])}
      ${acts([act('Agendar cita', () => eventModal(null, TODAY, { type: 'CLIENTE', clientId: c.id }), 'btn-tint', 'agenda'), pend.length ? act('Registrar pago', () => runReply(payForClient(c, {}, '')), '', 'coins') : '', tel ? act('WhatsApp', () => openExternal(`https://wa.me/${tel}`), '', 'chat') : '', act('Ver la ficha', () => { goMod('clientes'); setTimeout(() => withKey(() => clientModal(c.id)), 160); }, '', 'users')])}`, { plain: `${c.name}: ${plan ? 'plan ' + plan + ', ' : ''}${debt > 0 ? 'te debe ' + money(debt, 2) : 'está al día'}.` });
  }

  // 5g · Guía contable (Venezuela) — siempre con la nota de validarlo con el contador
  const CONTA = [
    [/\bigtf\b|grandes transacciones/, '<p><b>IGTF (3%)</b>. Desde la reforma de 2022, los pagos en divisas o criptoactivos pagan 3% de Impuesto a las Grandes Transacciones Financieras. Lo cobran (perciben) los contribuyentes especiales designados por el SENIAT cuando reciben pagos en divisas. Si te pagan en dólares y no eres contribuyente especial, en general no lo cobras; si lo eres, debes sumarlo, separarlo y declararlo.</p>'],
    [/\biva\b/, `<p><b>IVA</b>. La alícuota general es 16% (la que usa el tablero hoy: ${num(ivaRate)}%). El IVA no es ingreso tuyo: se suma a la factura y se le entrega al SENIAT, por eso el tablero lo separa. Si facturas en divisas, la factura debe mostrar también el equivalente en bolívares a la tasa del BCV del día.</p>`],
    [/factura(cion)? (digital|electronica)|imprenta digital|maquina fiscal|providencia/, '<p><b>Facturación digital</b>. El SENIAT publicó la providencia de facturación digital en la Gaceta Oficial N° 43.032 (19 de diciembre de 2024), con plazo de adecuación hasta marzo de 2025. Las facturas fiscales deben salir de una imprenta digital autorizada o de una máquina fiscal. El facturero de esta app te sirve de control interno, pero no sustituye a la imprenta digital.</p>'],
    [/retencion|retenciones|islr|comprobante de retencion/, '<p><b>Retenciones</b>. Si te paga un contribuyente especial, puede retenerte una parte del IVA (por lo general el 75%) y, según el servicio, el ISLR. Te entrega el comprobante y ese monto lo descuentas en tu declaración. Regístralo como abono con la nota “retención” para que el saldo de la factura cuadre.</p>'],
  ];
  function contaReply(t) { let hit = CONTA.filter(([re]) => re.test(t)); if (hit.length > 1 && /retencion/.test(t)) hit = hit.filter(([re]) => re === CONTA[3][0]); if (!hit.length) return null; return R(`${hit.map(([, h]) => h).join('')}<p class="ath-note">Es una guía general, no asesoría: valídalo con tu contador. En la entrega va la propuesta contable completa (plan de cuentas, libros de compra y venta, IGTF y cierre de mes).</p>`); }

  // 5h · Navegación
  const NAV = [['facturero', /\b(facturero|crea(r)? (una )?factura|nueva factura|emitir (una )?factura|hacer (una )?factura)\b/], ['resumen', /\b(resumen|inicio|tablero|dashboard|pantalla principal)\b/], ['agenda', /\b(agenda|calendario)\b/], ['facturacion', /\b(facturacion|facturas)\b/], ['cobranza', /\b(cobranza|corte|morosos|cuentas por cobrar)\b/], ['caja', /\b(caja|libro de caja|flujo de caja)\b/], ['gastos', /\b(gastos|egresos)\b/], ['ingresos', /\bingresos\b/], ['clientes', /\b(clientes|cartera)\b/], ['inversionistas', /\b(inversionistas|recibos)\b/], ['utilidades', /\b(utilidades|socios|reparto)\b/], ['matriz', /\b(matriz|presupuesto)\b/], ['productos', /\b(productos|catalogo)\b/], ['comisiones', /\b(comisiones|asesores|implementadores)\b/], ['rentabilidad', /\b(rentabilidad|estado de resultados|margenes)\b/], ['pausas', /\b(pausas|pausados)\b/], ['inversion', /\binversion(es)?\b/], ['plan', /\bplan de accion\b/], ['auditoria', /\b(auditoria|bitacora|registro de seguridad)\b/], ['ajustes', /\b(ajustes|configuracion|preferencias)\b/]];
  const navTarget = t => (NAV.find(([, re]) => re.test(t)) || [])[0] || null;
  function navReply(id, t) {
    const p = parsePeriod(t); const usesP = PERIOD_MODS.includes(id) && p && ALL_PERIODS.includes(p);
    return R(`<p>Te llevo a <b>${esc(modOf(id).name)}</b>${usesP ? ` de ${monthYear(p)}` : ''}.</p>`, { after: () => { if (usesP && state.period !== p) { state.period = p; state.agMonth = null; } goMod(id); if (usesP) load(); }, close: sheet(), plain: `Te llevo a ${modOf(id).name}${usesP ? ' de ' + monthYear(p) : ''}.` });
  }

  /* ---------- 6. Entender la pregunta ---------- */
  async function answer(q) {
    const raw = String(q || ''); const t = prep(raw);
    if (!t) return R('<p>¿En qué te ayudo?</p>');
    const words = t.split(' ').length;
    const isQ = /^(cuanto|cuantos|cuantas|cual|cuales|que|como|cuando|donde|quien|quienes|hay|tengo|me puedes decir|dime|sabes)\b/.test(t) || /\?\s*$/.test(raw);
    // conversación
    if (/^(borra|borrar|limpia|limpiar|nueva|reinicia|reiniciar) (la |el )?(conversacion|chat|historial)\b/.test(t)) return R('<p>Listo, empezamos de cero.</p>', { clear: true });
    if (/\b(ayuda|que (puedes|sabes) hacer|que haces|como (te uso|funcionas)|comandos|que te puedo (preguntar|pedir))\b/.test(t)) return helpReply();
    if (/^(gracias|muchas gracias|mil gracias|listo gracias|ok gracias|perfecto|excelente|genial|chevere|buenisimo|dale gracias)\b/.test(t) && words <= 4) return R(['<p>¡Con gusto! Aquí estoy cuando me necesites.</p>', '<p>¡A la orden! Cualquier cosa me dices.</p>', '<p>¡Para eso estoy!</p>'][Math.floor(Math.random() * 3)]);
    if (/\b(quien eres|como te llamas|que eres)\b/.test(t)) return R('<p>Soy <b>Athena</b>, la asistente de Agora Digital. Conozco tus cifras, tu cobranza, tus tasas y tu agenda, y te ayudo a registrar pagos y agendar citas. Funciono sin internet y tus datos no salen de este equipo.</p>');
    if (/^(hola|holi|buenas|buenos dias|buen dia|buenas tardes|buenas noches|hey|epa|que tal|saludos)\b/.test(t) && words <= 5) return greetReply();
    if (/\b(que hora es|que dia es( hoy)?|que fecha es( hoy)?)\b/.test(t)) { const n = new Date(); return R(`<p>Hoy es ${esc(dayLong(TODAY))} de ${TODAY.slice(0, 4)} y son las ${hhmm(fromMin(n.getHours() * 60 + n.getMinutes()))}.</p>`); }
    // comandos
    if (/\b(tema|modo|apariencia)\b/.test(t) || /^(oscuro|claro|automatico)$/.test(t)) {
      const th = /oscuro|noche|dark/.test(t) ? 'dark' : /claro|light/.test(t) ? 'light' : /automatico|sistema|auto/.test(t) ? 'auto' : null;
      if (th) return R(`<p>Listo: tema ${{ dark: 'oscuro', light: 'claro', auto: 'automático (como el sistema)' }[th]}.</p>`, { after: () => { setTheme(th); logAudit(`cambió el tema a ${{ auto: 'automático', light: 'claro', dark: 'oscuro' }[th]} (con Athena)`, 'ajustes'); } });
    }
    if (/\b(bloquea|bloquear|cierra la edicion|cerrar la edicion)\b/.test(t)) return isUnlocked() ? R('<p>Listo, bloqueé la edición.</p>', { after: () => $('#lockBtn').click() }) : R('<p>La edición ya está bloqueada.</p>');
    if (/\b(desbloquea|desbloquear|abre la edicion|abrir la edicion|abrir edicion|habilita la edicion)\b/.test(t)) return isUnlocked() ? R('<p>La edición ya está abierta.</p>') : R('<p>Escribe tu clave de edición y queda abierta 15 minutos.</p>', { after: () => keyModal(null), close: true });
    if (/\b(informe|reporte|pdf|excel)\b/.test(t) && /\b(descarga|descargar|bajar|baja|genera|generar|exporta|exportar|saca|sacar|dame|imprime|imprimir|quiero)\b/.test(t)) { const id = navTarget(t); return R(`<p>Abro la descarga del informe${id ? ' de ' + esc(modOf(id).name) : ''} (PDF a color o Excel).</p>`, { after: () => { if (id && id !== state.module) { goMod(id); setTimeout(openReport, 500); } else openReport(); }, close: true }); }
    if (/\b(respaldo|backup|copia de seguridad)\b/.test(t)) return R('<p>Descargo el respaldo completo de este equipo (clientes, facturas, pagos, tasas, citas y más). Guárdalo en un lugar seguro.</p>', { after: () => backupDownload() });
    if (/\b(atajos?|teclado)\b/.test(t) || /^gestos$/.test(t)) return R('<p>Aquí tienes los atajos de teclado y los gestos.</p>', { after: () => window.openKeys && openKeys(), close: true });
    if (/\b(dibuja|dibujar|trazo|letra dibujada|gesto de letra)\b/.test(t)) return R('<p>Dibuja una letra grande: A Agenda, C Caja, F Facturación, P Pago, N Nueva cita…</p>', { after: () => window.openGesturePad && openGesturePad(), close: true });
    if (/\b(instala|instalar)\b.*\b(app|aplicacion)\b|\bapk\b/.test(t)) return R('<p>Te muestro cómo instalarla en iPhone, Android, Mac y PC.</p>', { after: () => installModal(), close: true });
    if (/\b(cierra|cerrar) (la )?sesion\b/.test(t)) return R(`<p>¿Cierro tu sesión?</p>${acts([`<button type="button" class="btn btn-sm btn-danger" id="logoutBtn">${svgI('logout', 14)}<span>Cerrar sesión</span></button>`])}`);
    if (/^(busca|buscar|encuentra|encontrar)\s+(.+)/.test(t)) { const qq = raw.replace(/^\s*(busca|buscar|encuentra|encontrar)\s+/i, ''); return R(`<p>Busco “${esc(qq)}”.</p>`, { after: () => window.openPalette && openPalette(qq), close: true }); }
    // guía contable
    if (/\b(igtf|iva|retencion|retenciones|islr|factura digital|facturacion digital|factura electronica|imprenta digital|maquina fiscal|providencia)\b/.test(t) && !/\b(registra|agenda|paga|pago)\b/.test(t)) { const r = contaReply(t); if (r) return r; }
    // tasas: registrar
    const mon = parseMoney(t);
    if ((/\b(registra|registrar|anota|anotar|guarda|guardar|pon|poner|actualiza|actualizar|carga|cargar|fija|fijar)\b/.test(t) && /\b(tasa|dolar)\b/.test(t) && !/\b(pago|pagos|pago movil)\b/.test(t))
      || /\b(dolar|tasa) (del? )?(bcv|oficial|binance|paypal|zelle|efectivo|paralelo) (de hoy )?(esta|amanecio|cerro|quedo|va|abrio) (hoy )?(en|a)\b/.test(t)) return rateSetReply(t);
    // conversiones
    if ((/\b(convierte|convertir|conviertes|pasame|cuanto (es|son|seria|serian|da|dan|equivale|equivalen)|cuantos (dolares|bolivares|bs)|equivale|equivalen|a cuanto (equivale|sale|salen)|en (dolares|bolivares))\b/.test(t)) && (mon.bs || mon.usd || mon.any)) return convertReply(t);
    if ((mon.bs || mon.usd) && /\b(a|en|al) (dolar(es)?|usd|divisas|bolivares|bs)\b/.test(t) && !/\b(pago|pagaron|pago de|abono|cobr)/.test(t)) return convertReply(t);
    // agenda: agendar
    const nounAgenda = /\b(la|mi|tu|su|esta|de la|en la|en mi) agenda\b/.test(t); // "abre la agenda", "qué hay en mi agenda": la agenda como lugar, no como verbo
    const schedVerb = /\b(agendar|agendame|agendale|agendemos|agendalo|agendala|programa(r|me)? (una|un|la|el) (cita|reunion|demo|llamada)|(crea|crear|pon|ponme|anota|anotame|cuadra|cuadrame|reserva|reservame|nueva) (una |un )?(cita|reunion|demo|llamada|videollamada))\b/.test(t)
      || (!nounAgenda && /\bagenda (una|un|la|el|a|al|con|para|me|le|cita|reunion|demo|llamada|manana|hoy|pasado|este|esta|proximo|proxima|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.test(t));
    if (schedVerb || (!isQ && /\b(cita|reunion|demo|llamada|videollamada) con\b/.test(t))) return scheduleReply(t, raw);
    // pagos
    const cands = findClients(t);
    const payVerb = /\b(registra(r)?( un| el)? (pago|cobro|abono)|anota(r)? (un |el )?(pago|abono)|me pago|me pagaron|nos pago|nos pagaron|pagaron|abono|abona|abone|abonaron|abonar|cobrale|cobrarle|recibi (un |el )?pago|depositaron|transfirieron|hizo (un |el )?pago|mando (el )?pago|pago de)\b/.test(t);
    if (!isQ && (payVerb || (/\b(pago|abono)\b/.test(t) && (mon.bs || mon.usd || mon.any || parseMethod(t))) || (cands.length && (mon.bs || mon.usd || mon.any) && parseMethod(t)))) return payReply(t, cands);
    if (/^(registrar|registra) (un )?pago$/.test(t)) return payReply(t, []);
    // agenda: consultas
    if (/\b(por confirmar|sin confirmar|confirmar (las )?citas|confirmaciones|confirma (las )?citas)\b/.test(t)) return confirmReply();
    if (/\b(horario libre|horarios libres|hueco|espacio libre|disponibilidad|cuando (tengo|estoy) libre|tengo libre|hora libre|cuando puedo agendar)\b/.test(t)) return freeReply(t);
    if (/\b(que tengo|que hay|tengo (algo|citas?|reuniones?)|mis citas|mi agenda|citas? (de|para) (hoy|manana|pasado|esta|la|el)|reuniones? (de|para) (hoy|manana|esta|la)|proxima cita|siguiente cita|proxima reunion|que me toca|agenda de (hoy|manana)|que sigue)\b/.test(t)) return agendaReply(t);
    if (isQ && /\b(cita|reunion)\b/.test(t) && cands.length) { const c = cands[0].c; const l = events.filter(e => e.clientId === c.id && e.date >= TODAY && !DONE.includes(e.status)).sort(byWhen); return l.length ? R(`<p>Con <b>${esc(c.name)}</b> tienes:</p>${list(l.slice(0, 5).map(evLine))}`) : R(`<p>No tienes citas próximas con <b>${esc(c.name)}</b>.</p>${acts([act('Agendar una', () => eventModal(null, TODAY, { type: 'CLIENTE', clientId: c.id }), 'btn-cta', 'plus')])}`); }
    // cobranza
    if (/\b(quien(es)? me debe(n)?|quien debe|me deben|por cobrar|cuentas por cobrar|vencid[ao]s?|morosos?|deudores|deudas?|facturas? pendientes?|pendientes? de cobro|cuanto me debe(n)?|debe(n)? algo)\b/.test(t)) return arReply(cands.length ? cands[0].c : null, /\bvencid/.test(t) && !/\b(por cobrar|me deben|me debe|debe)\b/.test(t));
    // tasas: consulta
    if (/\b(tasa|tasas|dolar|precio del dolar|a cuanto esta|cambio del dia|bcv|paralelo|brecha)\b/.test(t) && !/\b(gast|factur|cobr|vend)/.test(t)) return ratesReply();
    // navegación explícita
    const navV = /\b(abre|abreme|abrir|ve a|vete a|ir a|vamos a|llevame|muestrame|muestra|mostrar|ensename|entra|entrar|pasame a|cambia a|quiero ver|ver)\b/.test(t);
    const nt = navTarget(t);
    if (navV && nt && !/\bcuant/.test(t)) return navReply(nt, t);
    // cifras
    const p = parsePeriod(t) || CUR_P;
    if (/\b(comisiones? (de|por|del?) (paypal|binance|cobro|plataforma|pasarela)|cuanto me (cobra|cobro|quita|quito) paypal)\b/.test(t)) return metricReply('fees', p);
    if (/\b(meta|objetivo)\b/.test(t)) return metricReply('goal', p);
    if (/\b(cuantos clientes|clientes activos|churn|bajas|cancelaron)\b/.test(t)) return metricReply('clients', p);
    if (/\b(mrr|recurrente|arr|ingreso fijo)\b/.test(t)) return metricReply('mrr', p);
    if (/\b(utilidad|ganancia|ganamos|gane|perdi|perdimos|perdida|resultado|rentab\w*)\b/.test(t)) return metricReply('result', p);
    if (/\b(caja|saldo|cuanto (dinero|plata|real) tengo|disponible|liquidez|flujo)\b/.test(t)) return metricReply('cash', p);
    if (/\b(cobr(e|amos|ado|aron|os)|recaud\w*|me pagaron (este|en)|cobros)\b/.test(t)) return metricReply('collected', p);
    if (/\b(gast(e|amos|ado|os|o)|egres\w*|cuanto (se fue|salio))\b/.test(t)) return metricReply('expenses', p);
    if (/\b(factur(e|amos|ado|acion|o)|ingres(o|os|aron|e)|vend(i|imos|ido|io)|ventas)\b/.test(t)) return metricReply('revenue', p);
    if (/\b(como (va|vamos|esta|estamos|anda|andamos|me fue|nos fue|fue|cerro|cerramos)|resumen|balance|estado del mes|panorama|numeros|cifras)\b/.test(t)) return metricReply('summary', p);
    // un cliente
    if (cands.length && (cands[0].sc >= 100 || words <= 4 || /\b(cliente|ficha|info|informacion|datos|como va|como esta)\b/.test(t))) return clientReply(cands[0].c);
    // un módulo, sin verbo
    if (nt && words <= 3) return navReply(nt, t);
    // servicio externo (tu agente de IA), si está configurado
    const ext = await askExternal(raw);
    if (ext) return R(`<p>${esc(ext).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')}</p>`, { plain: ext });
    return R(`<p>No estoy segura de haber entendido “${esc(raw.slice(0, 80))}”. Puedo ayudarte con las cifras del mes, la cobranza, los pagos, las tasas del dólar y tu agenda.</p><div class="ath-chips">${[qchip('¿Cómo va el mes?', '¿Cómo va el mes?'), qchip('¿Quién me debe?', '¿Quién me debe?'), qchip('¿Qué tengo hoy?', '¿Qué tengo hoy?'), qchip('Ayuda', '¿Qué puedes hacer?')].join('')}</div>${acts([act(`Buscar “${raw.slice(0, 30)}”`, () => window.openPalette && openPalette(raw), '', 'search')])}`, { plain: 'No estoy segura de haber entendido. Puedo ayudarte con las cifras del mes, la cobranza, los pagos, las tasas y tu agenda.' });
  }
  async function askExternal(q) {
    const c = cfg(); if (!c.endpoint || !/^https:\/\//i.test(c.endpoint)) return null;
    let k = null; try { k = KP(CUR_P); } catch (e) { k = null; }
    const ctx = k ? { mes: periodLabel(CUR_P), ingresos: round2(k.revenue || 0), gastos: round2(k.spendTotal || 0), resultado: round2(k.result || 0), cobrado: round2(k.cashCollected || 0), caja: k.cash == null ? null : round2(k.cash), clientesActivos: k.activeAtClose || 0 } : {};
    const ctrl = window.AbortController ? new AbortController() : null; const tm = setTimeout(() => ctrl && ctrl.abort(), 15000);
    try {
      const r = await fetch(c.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pregunta: q, contexto: ctx, usuario: firstName(), fecha: TODAY, origen: 'agora-digital-app' }), signal: ctrl ? ctrl.signal : undefined });
      if (!r.ok) return null;
      const ct = r.headers.get('content-type') || ''; const data = ct.includes('json') ? await r.json() : { respuesta: await r.text() };
      const txt = String(data.respuesta || data.answer || data.reply || data.text || '').trim(); return txt ? txt.slice(0, 4000) : null;
    } catch (e) { return null; } finally { clearTimeout(tm); }
  }

  /* ---------- 7. Panel de conversación ---------- */
  let panel = null, logEl = null, inp = null, suggEl = null, LOG = [], unread = 0, busy = false, hist = [], histI = -1, viaVoice = false;
  const isOpen = () => !!(panel && panel.classList.contains('is-open'));
  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('div'); panel.className = 'ath-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Athena, tu asistente');
    panel.innerHTML = `<div class="ath-scrim" data-ath="close"></div><section class="ath-box">
      <span class="ath-grab" aria-hidden="true"></span>
      <header class="ath-h"><span class="ath-av"><img src="${IMG}" alt="" width="40" height="40"></span><span class="ath-ht"><b>Athena</b><small data-ath-sub></small></span>
        <button type="button" class="tb-ic" data-ath="new" title="Nueva conversación" aria-label="Nueva conversación">${svgI('refresh', 17)}</button>
        <button type="button" class="tb-ic" data-ath="cfg" title="Opciones de Athena" aria-label="Opciones de Athena">${svgI('gear', 17)}</button>
        <button type="button" class="tb-ic" data-ath="close" title="Cerrar (Esc)" aria-label="Cerrar">${I.close}</button></header>
      <div class="ath-log" role="log" aria-live="polite" aria-relevant="additions"></div>
      <div class="ath-sugg" role="group" aria-label="Sugerencias"></div>
      <form class="ath-form" novalidate>${SR ? `<button type="button" class="ath-mic" data-ath="mic" aria-label="Dictar por voz" title="Dictar por voz">${svgI('mic', 18)}</button>` : ''}<textarea rows="1" maxlength="400" placeholder="Pregúntale a Athena…" aria-label="Escribe tu pregunta" enterkeyhint="send"></textarea><button type="submit" class="ath-send" aria-label="Enviar">${svgI('send', 17)}</button></form>
      <p class="ath-foot">Responde con los datos de este equipo. Revisa las cifras importantes antes de decidir.</p></section>`;
    document.body.appendChild(panel);
    logEl = $('.ath-log', panel); inp = $('textarea', panel); suggEl = $('.ath-sugg', panel);
    $('.ath-form', panel).addEventListener('submit', e => { e.preventDefault(); send(); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); return; }
      if (e.key === 'ArrowUp' && !inp.value && hist.length) { e.preventDefault(); histI = histI < 0 ? hist.length - 1 : Math.max(0, histI - 1); inp.value = hist[histI]; autosize(); }
      else if (e.key === 'ArrowDown' && histI >= 0) { e.preventDefault(); histI++; inp.value = histI < hist.length ? hist[histI] : ''; if (histI >= hist.length) histI = -1; autosize(); }
    });
    inp.addEventListener('input', autosize);
    LOG.forEach(m => paintMsg(m));
    return panel;
  }
  function autosize() { if (!inp) return; inp.style.height = 'auto'; inp.style.height = Math.min(120, inp.scrollHeight) + 'px'; }
  function setSub() { const s = panel && $('[data-ath-sub]', panel); if (s) s.textContent = cfg().endpoint ? 'Tu asistente · conectada a tu servicio' : 'Tu asistente · funciona sin internet'; }
  function openAthena(q) {
    if (!appOn()) return;
    if (window.closeAccMenu) closeAccMenu(); if (typeof closeMenu === 'function') closeMenu(false);
    const pal = $('.cmdk.is-open'); if (pal) pal.classList.remove('is-open'), document.documentElement.classList.remove('no-scroll');
    hidePop(); ensurePanel(); setSub();
    const was = isOpen(); panel.classList.add('is-open'); if (sheet()) document.documentElement.classList.add('no-scroll');
    const b = $('#athenaBtn'); if (b) { b.classList.add('is-on'); b.classList.remove('has-note'); b.setAttribute('aria-expanded', 'true'); }
    unread = 0;
    if (!LOG.length) { const g = greetReply(); push('ai', g.html, g); setSugg(); }
    else if (!was) setSugg();
    scrollEnd(false);
    if (q && String(q).trim()) ask(String(q)); else setTimeout(() => inp && inp.focus({ preventScroll: true }), was ? 0 : 60);
  }
  function closeAthena() {
    if (!panel || !isOpen()) return; panel.classList.remove('is-open'); document.documentElement.classList.remove('no-scroll');
    const b = $('#athenaBtn'); if (b) { b.classList.remove('is-on'); b.setAttribute('aria-expanded', 'false'); }
    stopMic(); try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
    if (panel.contains(document.activeElement) && b && b.offsetParent) b.focus({ preventScroll: true });
  }
  const toggleAthena = () => (isOpen() ? closeAthena() : openAthena());
  window.openAthena = openAthena; window.closeAthena = closeAthena; window.toggleAthena = toggleAthena;
  function resetConversation() { LOG = []; RUNS = new Map(); if (logEl) logEl.innerHTML = ''; hist = []; histI = -1; }

  function paintMsg(m) {
    if (!logEl) return;
    const el = document.createElement('div'); el.className = `ath-m ath-${m.who}`;
    el.innerHTML = m.who === 'ai' ? `<img class="ath-mav" src="${IMG}" alt="" width="26" height="26"><div class="ath-bub">${m.html}</div>` : `<div class="ath-bub">${m.html}</div>`;
    const prev = logEl.lastElementChild; if (prev && prev.classList.contains('ath-' + m.who) && !prev.classList.contains('ath-typing')) el.classList.add('is-cont');
    logEl.appendChild(el); if (!reduceMotion()) { el.classList.add('is-new'); setTimeout(() => el.classList.remove('is-new'), 600); }
  }
  function push(who, html, meta = {}) { const m = { who, html, plain: meta.plain || '', t: Date.now() }; LOG.push(m); if (LOG.length > 120) LOG.splice(0, LOG.length - 120); if (panel) { paintMsg(m); scrollEnd(true); } return m; }
  function scrollEnd(smooth) { if (!logEl) return; requestAnimationFrame(() => { logEl.scrollTo({ top: logEl.scrollHeight, behavior: smooth && !reduceMotion() ? 'smooth' : 'auto' }); }); }
  function aiSay(html, plain) { if (!isOpen()) openAthena(); push('ai', html, { plain }); }
  function runReply(r) { if (!r) return; if (!isOpen()) openAthena(); push('ai', r.html, r); if (r.after) setTimeout(r.after, 120); }
  function setSugg(list) {
    if (!suggEl) return;
    const mod = state.module; let s = list;
    if (!s) s = mod === 'agenda' ? ['¿Qué tengo hoy?', 'Agenda una cita mañana a las 10', '¿Cuándo tengo un horario libre?', 'Citas por confirmar']
      : ['facturacion', 'cobranza', 'facturero'].includes(mod) ? ['¿Quién me debe?', 'Registrar un pago', '¿A cuánto está el dólar?', 'Facturas vencidas']
      : ['caja', 'gastos', 'matriz', 'rentabilidad'].includes(mod) ? ['¿Cómo está la caja?', '¿Cuánto cobré este mes?', '¿Cuánto gasté este mes?', '¿Cuál es el resultado del mes?']
      : ['¿Cómo va el mes?', '¿Qué tengo hoy?', '¿Quién me debe?', '¿A cuánto está el dólar?', 'Agenda una cita'];
    suggEl.innerHTML = s.map(x => qchip(x, x)).join('');
  }
  function showTyping() { const el = document.createElement('div'); el.className = 'ath-m ath-ai ath-typing'; el.innerHTML = `<img class="ath-mav" src="${IMG}" alt="" width="26" height="26"><div class="ath-bub" aria-label="Athena está escribiendo"><i></i><i></i><i></i></div>`; logEl.appendChild(el); scrollEnd(true); panel.classList.add('is-thinking'); return el; }
  async function ask(q, voice) {
    q = String(q || '').trim(); if (!q || busy) return; busy = true; ensurePanel();
    hist.push(q); if (hist.length > 30) hist.shift(); histI = -1;
    push('me', esc(q));
    const typing = showTyping(); const t0 = Date.now();
    let r; try { r = await answer(q); } catch (e) { console.warn(e); r = R('<p>Uy, algo falló al responder. Intenta de nuevo o dímelo de otra forma.</p>'); }
    const min = reduceMotion() ? 0 : Math.min(650, 260 + q.length * 6); const left = min - (Date.now() - t0); if (left > 0) await wait(left);
    typing.remove(); panel.classList.remove('is-thinking'); busy = false;
    if (r.clear) { resetConversation(); }
    push('ai', r.html, r); setSugg(r.sugg);
    if ((voice || cfg().voice) && r.html) speak(r.plain || stripHtml(r.html));
    if (r.after) { if (r.close && sheet()) closeAthena(); setTimeout(() => { try { r.after(); } catch (x) { console.warn(x); } }, r.close && sheet() ? 280 : 140); }
  }
  function send() { if (!inp) return; const q = inp.value.trim(); if (!q) return; inp.value = ''; autosize(); const v = viaVoice; viaVoice = false; ask(q, v); }

  // voz: dictado y lectura en voz alta
  let rec = null, listening = false, langI = 0; const LANGS = ['es-VE', 'es-419', 'es-US', 'es-ES'];
  function stopMic() { if (rec && listening) { try { rec.stop(); } catch (e) {} } listening = false; if (panel) panel.classList.remove('is-listening'); }
  function toggleMic() {
    if (!SR) return toast('Tu navegador no permite dictar por voz. Prueba con Chrome, Edge o Safari.');
    if (listening) return stopMic();
    try {
      rec = new SR(); rec.lang = LANGS[langI]; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
      rec.onresult = e => { let txt = '', fin = false; for (let i = 0; i < e.results.length; i++) { txt += e.results[i][0].transcript; if (e.results[i].isFinal) fin = true; } inp.value = txt; autosize(); if (fin) { viaVoice = true; stopMic(); send(); } };
      rec.onerror = e => { if (e.error === 'language-not-supported' && langI < LANGS.length - 1) { langI++; listening = false; return toggleMic(); } if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Permite el micrófono para dictarle a Athena.'); else if (e.error === 'no-speech') toast('No te escuché. Toca el micrófono y habla de nuevo.'); else if (e.error === 'network') toast('El dictado por voz necesita internet en este navegador.'); stopMic(); };
      rec.onend = () => { listening = false; if (panel) panel.classList.remove('is-listening'); };
      rec.start(); listening = true; panel.classList.add('is-listening'); try { if (navigator.vibrate) navigator.vibrate(8); } catch (x) {}
    } catch (e) { listening = false; toast('No pude activar el micrófono.'); }
  }
  function speak(text) {
    try {
      if (!('speechSynthesis' in window) || !text) return; speechSynthesis.cancel();
      const say = String(text).replace(/US\$\s?([\d.,]+)/g, '$1 dólares').replace(/Bs\s?([\d.,]+)/g, '$1 bolívares').replace(/Bs\/US\$/g, 'bolívares por dólar').slice(0, 420);
      const u = new SpeechSynthesisUtterance(say); const vs = speechSynthesis.getVoices();
      const v = ['es-VE', 'es-US', 'es-419', 'es-MX', 'es-CO', 'es-ES'].map(l => vs.find(x => x.lang && x.lang.replace('_', '-').toLowerCase() === l.toLowerCase())).find(Boolean) || vs.find(x => /^es/i.test(x.lang || ''));
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'es-VE'; u.rate = 1.02; speechSynthesis.speak(u);
    } catch (e) {}
  }

  /* ---------- 8. Avisos, saludo diario y sugerencias en el Resumen ---------- */
  function hidePop() { const p = $('.ath-pop'); if (p) { p.classList.remove('show'); clearTimeout(p._t); } }
  function pop(text, onOpen) {
    if (!appOn()) return;
    let p = $('.ath-pop');
    if (!p) { p = document.createElement('div'); p.className = 'ath-pop'; p.setAttribute('role', 'status'); document.body.appendChild(p); p.addEventListener('click', e => { if (e.target.closest('[data-pop-x]')) { hidePop(); return; } hidePop(); if (p._on) p._on(); else openAthena(); }); }
    p._on = onOpen || null;
    p.innerHTML = `<img src="${IMG}" alt="" width="36" height="36"><span class="ath-pop-t"><b>Athena</b><small>${esc(text)}</small></span><button type="button" class="tb-ic" data-pop-x aria-label="Cerrar aviso">${I.close}</button>`;
    void p.offsetWidth; p.classList.add('show'); clearTimeout(p._t); p._t = setTimeout(hidePop, 9000);
  }
  window.athenaNotify = (text, evId) => {
    const html = `<p>${svgI('bell', 14)} ${esc(text)}</p>${evId ? acts([act('Ver la cita', () => evDetail(evId), 'btn-tint', 'agenda')]) : ''}`;
    if (isOpen()) { push('ai', html, { plain: text }); return; }
    push('ai', html, { plain: text }); unread++;
    const b = $('#athenaBtn'); if (b) b.classList.add('has-note');
    pop(text, evId ? () => { openAthena(); evDetail(evId); } : null);
  };
  window.onEnterApp = () => {
    const c = cfg(); if (!c.greet) return;
    if (store.get('athena_greet_day', '') === TODAY) return; store.set('athena_greet_day', TODAY);
    setTimeout(() => pop(`${saludo()}${firstName() ? ', ' + firstName() : ''}. ${briefLine()}`), 900);
  };
  window.athenaSuggestHtml = () => {
    if (!cfg().sugg) return '';
    let b; try { b = briefData(); } catch (e) { return ''; }
    const chip = (ic, label, q, tone) => `<button type="button" class="ath-chip ${tone ? 'is-' + tone : ''}" data-ath-q="${esc(q)}">${svgI(ic, 14)}<span>${label}</span></button>`;
    const chips = [];
    chips.push(b.todayEv.length ? chip('agenda', `${b.todayEv.length} ${b.todayEv.length === 1 ? 'cita' : 'citas'} hoy${b.nextToday ? ' · la próxima ' + esc(hhmm(b.nextToday.start)) : ''}`, '¿Qué tengo hoy?') : chip('agenda', 'Sin citas hoy · agenda una', 'Agenda una cita'));
    if (b.vencidas.length) chips.push(chip('warn', `${b.vencidas.length} ${b.vencidas.length === 1 ? 'factura vencida' : 'facturas vencidas'} · ${money(b.vencUsd)}`, '¿Quién me debe?', 'bad'));
    else if (b.pend.length) chips.push(chip('coins', `Por cobrar ${money(b.pendUsd)}`, '¿Quién me debe?'));
    if (b.porConf.length) chips.push(chip('chat', `${b.porConf.length} ${b.porConf.length === 1 ? 'cita' : 'citas'} por confirmar`, 'Citas por confirmar', 'warn'));
    if (!b.tasaHoy) chips.push(chip('rate', 'Registra la tasa de hoy', '¿A cuánto está el dólar?'));
    if (b.k && b.k.goal) chips.push(chip('trend', `Meta del mes al ${pct(b.k.revenueGoal, 0)}`, '¿Cómo va el mes?', b.k.revenueGoal >= 100 ? 'ok' : ''));
    return `<section class="ath-ins" aria-label="Sugerencias de Athena"><button type="button" class="ath-ins-av" data-act="athena" aria-label="Abrir a Athena"><img src="${IMG}" alt="" width="44" height="44"></button><div class="ath-ins-b"><p class="ath-ins-t"><b>${hola()}.</b> <span>Athena te sugiere:</span></p><div class="ath-ins-l">${chips.join('')}</div></div><button type="button" class="btn btn-sm ath-ins-ask" data-act="athena">${svgI('athena', 15)}<span>Pregúntale</span></button></section>`;
  };

  /* ---------- 9. Opciones de Athena ---------- */
  function cfgModal() {
    const c = cfg();
    openModal(`<h2 id="modal-t">Opciones de Athena</h2><p class="muted">Athena funciona sin internet con los datos de este equipo. Aquí decides cómo te acompaña.</p>
      <form data-form="athena-cfg" novalidate><div class="fgrid">
        <label class="fld span2 chk"><input type="checkbox" name="greet" ${c.greet ? 'checked' : ''}> Saludarme una vez al día al entrar, con lo más importante</label>
        <label class="fld span2 chk"><input type="checkbox" name="sugg" ${c.sugg ? 'checked' : ''}> Mostrar sugerencias de Athena en el Resumen</label>
        <label class="fld span2 chk"><input type="checkbox" name="voice" ${c.voice ? 'checked' : ''}> Responder en voz alta (si dictas con el micrófono, responde en voz alta igual)</label>
        <label class="fld span2"><span>Conectar tu agente de IA (opcional)</span><input name="endpoint" type="url" inputmode="url" maxlength="300" value="${esc(c.endpoint || '')}" placeholder="https://tu-servidor.com/athena"><small class="muted">Solo para lo que Athena no entienda. Se envía la pregunta y un resumen de cifras del mes (sin datos de clientes). El servicio debe responder JSON con el campo “respuesta”. En Hostinger agrega el dominio a connect-src del archivo .htaccess.</small></label>
      </div><p class="form-err" hidden></p>
      <div class="modal-acts"><button type="button" class="btn btn-ghost mr-auto" data-ath-test-voice="1">${svgI('mic', 14)} Probar la voz</button><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Guardar <span class="cta-dot">${I.arrow}</span></button></div></form>`);
  }
  window.athenaCfgModal = cfgModal;
  document.addEventListener('submit', e => {
    const f = e.target; if (!f.dataset || f.dataset.form !== 'athena-cfg') return; e.preventDefault(); e.stopImmediatePropagation();
    const fd = new FormData(f); const ep = String(fd.get('endpoint') || '').trim(); const err = f.querySelector('.form-err');
    if (ep && !/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(ep)) { err.textContent = 'La dirección debe empezar con https://'; err.hidden = false; return; }
    const next = { greet: !!fd.get('greet'), sugg: !!fd.get('sugg'), voice: !!fd.get('voice'), endpoint: ep };
    store.set('athena_cfg_v1', next); logAudit(`actualizó las opciones de Athena${ep ? ' (conectada a un servicio externo)' : ''}`, 'ajustes'); closeModal(); toast('Opciones de Athena guardadas'); setSub(); render();
  }, true);

  /* ---------- 10. Clics y teclado ---------- */
  document.addEventListener('click', e => {
    const tv = e.target.closest('[data-ath-test-voice]'); if (tv) { speak(`${saludo()}${firstName() ? ', ' + firstName() : ''}. Soy Athena. Así sueno.`); return; }
    const a = e.target.closest('[data-act="athena"],[data-act="athena-cfg"],[data-ath-q],[data-ath-run],[data-ath]'); if (!a) return;
    if (a.dataset.act === 'athena') { e.preventDefault(); if (a.id === 'athenaBtn') return toggleAthena(); return openAthena(); }
    if (a.dataset.act === 'athena-cfg') { e.preventDefault(); return cfgModal(); }
    if (a.dataset.athQ != null) { e.preventDefault(); return openAthena(a.dataset.athQ); }
    if (a.dataset.athRun) {
      e.preventDefault(); const fn = RUNS.get(+a.dataset.athRun); if (!fn) return;
      if (a.dataset.once) { a.disabled = true; a.classList.add('is-done'); }
      if (sheet() && !a.closest('.ath-ev')) closeAthena();
      try { fn(); } catch (x) { console.warn(x); }
      return;
    }
    const k = a.dataset.ath;
    if (k === 'close') { e.preventDefault(); return closeAthena(); }
    if (k === 'new') { e.preventDefault(); resetConversation(); const g = greetReply(); push('ai', g.html, g); setSugg(); inp && inp.focus(); return; }
    if (k === 'cfg') { e.preventDefault(); return cfgModal(); }
    if (k === 'mic') { e.preventDefault(); return toggleMic(); }
  });
  // botones de la app dentro de las respuestas (WhatsApp, calendario, cerrar sesión): en el celular se cierra la hoja
  document.addEventListener('click', e => { if (sheet() && isOpen() && e.target.closest('.ath-log [data-ev-wa], .ath-log [data-ev-ics], .ath-log #logoutBtn')) setTimeout(closeAthena, 50); }, true);
  document.addEventListener('keydown', e => {
    if (!isOpen()) return;
    if (e.key === 'Escape') { const m = $('#modal'); if (m && !m.hidden) return; if (listening) { stopMic(); return; } e.preventDefault(); closeAthena(); }
  });
  // al cerrar sesión la conversación se borra (puede entrar otra persona en este equipo)
  document.addEventListener('click', e => { if (e.target.closest('#logoutBtn')) { closeAthena(); resetConversation(); hidePop(); } }, true);
  // swipe hacia abajo en la hoja del celular para cerrarla
  let sy = null;
  document.addEventListener('touchstart', e => { if (!isOpen() || !sheet()) return; const h = e.target.closest('.ath-h, .ath-grab'); sy = h ? e.touches[0].clientY : null; }, { passive: true });
  document.addEventListener('touchmove', e => { if (sy == null || !panel) return; const dy = e.touches[0].clientY - sy; const box = $('.ath-box', panel); if (box && dy > 0) box.style.transform = `translateY(${dy}px)`; }, { passive: true });
  document.addEventListener('touchend', e => { if (sy == null || !panel) return; const dy = e.changedTouches[0].clientY - sy; sy = null; const box = $('.ath-box', panel); if (box) box.style.transform = ''; if (dy > 90) closeAthena(); }, { passive: true });

  // Para pruebas y para tu agente: pregunta sin abrir el panel (no ejecuta acciones)
  window.athenaAsk = async q => { const r = await answer(q); return { plain: r.plain || stripHtml(r.html), html: r.html }; };
  window.athenaParse = { when: t => parseWhen(prep(t)), money: t => parseMoney(prep(t)), period: t => parsePeriod(prep(t)), prospect: prospectName, clients: t => findClients(prep(t)).map(x => x.c.name) };
})();
