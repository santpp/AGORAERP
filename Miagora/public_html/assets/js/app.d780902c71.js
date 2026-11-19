/* Agora Digital App · Finanzas y Operaciones · lógica de la aplicación (sin dependencias) */
// v11: en la edición con servidor, servidor.js carga los datos antes que este archivo y deja aquí su puente.
// Sin servidor (HTML local, PC), SRV es null y todo funciona como siempre en este navegador.
const SRV = (typeof window !== 'undefined' && window.AGORA_SRV) || null;
const NONCE_ATTR = () => (SRV && window.AGORA_NONCE ? ` nonce="${window.AGORA_NONCE}"` : '');
/* ====================== UTILIDADES ====================== */
const DAY = 864e5;
const D = s => new Date(s + 'T00:00:00Z');
const isoD = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const monthStart = p => D(p + '-01');
const monthEnd = p => { const [y, m] = p.split('-').map(Number); return new Date(Date.UTC(y, m, 1)); }; // exclusivo
const daysIn = p => Math.round((monthEnd(p) - monthStart(p)) / DAY);
const prevPeriod = p => { let [y, m] = p.split('-').map(Number); m--; if (!m) { m = 12; y--; } return `${y}-${String(m).padStart(2, '0')}`; };
const inPeriod = (s, p) => !!s && s.slice(0, 7) === p;
const div = (a, b) => (a == null || b == null || b === 0 || !isFinite(a / b)) ? null : a / b;
const sum = (arr, f = x => x) => arr.reduce((s, x) => s + (f(x) || 0), 0);
const round2 = n => Math.round(n * 100) / 100;
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ====================== CATÁLOGO ====================== */
const PLANS = {
  BRONCE:   { label: 'Bronce',   fee: 50,  seatLimit: 3,    impl: 0,  aiMode: 'NONE',      aiAllowanceUsd: 0 },
  PLATA:    { label: 'Plata',    fee: 100, seatLimit: 10,   impl: 3,  aiMode: 'SEMI',      aiAllowanceUsd: 12 },
  ORO:      { label: 'Oro',      fee: 150, seatLimit: 20,   impl: 5,  aiMode: 'AUTOPILOT', aiAllowanceUsd: 25 },
  DIAMANTE: { label: 'Diamante', fee: 250, seatLimit: null, impl: 10, aiMode: 'AUTOPILOT', aiAllowanceUsd: 50 },
};
const PLAN_ORDER = ['BRONCE', 'PLATA', 'ORO', 'DIAMANTE'];
const AI_PROVIDERS = ['OPENAI', 'ANTHROPIC', 'GOOGLE'];
// Fecha de hoy real (zona horaria del equipo): lo posterior no ha ocurrido
const TODAY = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const ymNext = p => { let [y, m] = p.split('-').map(Number); m++; if (m > 12) { m = 1; y++; } return `${y}-${String(m).padStart(2, '0')}`; };
const DATE_MAX = `${+TODAY.slice(0, 4) + 1}-12-31`; // límite superior de fechas: fin del año siguiente
const ymMax = (a, b) => (a > b ? a : b), ymMin = (a, b) => (a < b ? a : b);
function periodRange(a, b) { const out = []; for (let q = a; q <= b && out.length < 60; q = ymNext(q)) out.push(q); return out; }
const BASE_FIRST = '2026-03', UI_FIRST = '2026-09';
// v9.5: ventana de meses relativa a hoy: mes anterior, mes en curso y próximo mes (este último es proyección)
const CUR_P = TODAY.slice(0, 7), NEXT_P = ymNext(CUR_P), PREV_P = (() => { let [y, m] = CUR_P.split('-').map(Number); m--; if (!m) { m = 12; y--; } return `${y}-${String(m).padStart(2, '0')}`; })();
const isProj = p => p > CUR_P; // meses que todavía no ocurren: se muestran como proyección
// Los meses del tablero van desde marzo de 2026 hasta el próximo mes
// (o hasta el mes de la factura más reciente, si se emitió por adelantado).
let ALL_PERIODS = periodRange(BASE_FIRST, ymMax('2026-10', NEXT_P));
let UI_PERIODS = ALL_PERIODS.filter(p => p >= ymMin(UI_FIRST, PREV_P));
function extendPeriods(minP, maxP) {
  const lim = (() => { let q = CUR_P; for (let i = 0; i < 12; i++) q = ymNext(q); return q; })();
  const a = ymMin(BASE_FIRST, minP && minP >= '2024-01' ? minP : BASE_FIRST);
  const b = ymMax(ymMax('2026-10', NEXT_P), maxP && maxP <= lim ? maxP : NEXT_P);
  ALL_PERIODS = periodRange(a, b);
  UI_PERIODS = ALL_PERIODS.filter(p => p >= ymMin(UI_FIRST, PREV_P));
}

const DEFAULT_BENCHMARKS = [
  { metricKey: 'revenueGoal', label: 'Cumplimiento de la meta de ingresos %', green: 100, yellow: 85, direction: 'HIGHER_IS_BETTER' },
  { metricKey: 'nrr',         label: 'Retención de ingresos (NRR) %',         green: 105, yellow: 95, direction: 'HIGHER_IS_BETTER' },
  { metricKey: 'churnMrr',    label: 'Ingreso perdido por bajas y reducciones %', green: 2,   yellow: 5,  direction: 'LOWER_IS_BETTER' },
  { metricKey: 'budgetExec',  label: 'Gasto contra presupuesto %',            green: 100, yellow: 110, direction: 'LOWER_IS_BETTER' },
  { metricKey: 'grossMargin', label: 'Margen bruto %',                        green: 65,  yellow: 55, direction: 'HIGHER_IS_BETTER' },
  { metricKey: 'ebitdaPct',   label: 'Ganancia operativa (EBITDA) %',         green: 20,  yellow: 10, direction: 'HIGHER_IS_BETTER' },
  { metricKey: 'runway',      label: 'Meses que aguanta la caja',             green: 6,   yellow: 3,  direction: 'HIGHER_IS_BETTER' },
  { metricKey: 'onTimePct',   label: 'Cobro puntual del día 5 %',             green: 90,  yellow: 75, direction: 'HIGHER_IS_BETTER' },
  { metricKey: 'dso',         label: 'Días promedio de cobro',                green: 10,  yellow: 20, direction: 'LOWER_IS_BETTER' },
  { metricKey: 'utilization', label: 'Uso de la capacidad del equipo %',      green: 70,  yellow: 55, direction: 'HIGHER_IS_BETTER' },
  { metricKey: 'roi',         label: 'Retorno de la inversión (ROI) acumulado %', green: 0, yellow: -50, direction: 'HIGHER_IS_BETTER' },
];
/* Categorías de gasto. Grupo: COGS = costo de atender a los clientes; OPEX = gasto operativo; BELOW = debajo de la ganancia operativa. */
const EXPENSE_CATS = [
  { id: 'PAYROLL',           label: 'Nómina y equipo',                       group: 'OPEX' },
  { id: 'TOOLS',             label: 'Herramientas y software',               group: 'OPEX' },
  { id: 'INFRA',             label: 'Servidores e infraestructura',          group: 'OPEX' },
  { id: 'MARKETING',         label: 'Publicidad y marketing propio',         group: 'OPEX' },
  { id: 'PROFESSIONAL',      label: 'Servicios profesionales (contador, legal)', group: 'OPEX' },
  { id: 'OFFICE',            label: 'Oficina, internet y telefonía',         group: 'OPEX' },
  { id: 'BANK',              label: 'Comisiones bancarias y de Binance',     group: 'OPEX' },
  { id: 'OTHER',             label: 'Otros gastos',                          group: 'OPEX' },
  { id: 'COMMISSIONS',       label: 'Comisiones de venta',                   group: 'COGS' },
  { id: 'AFFILIATE_PAYOUTS', label: 'Pagos a afiliados y referidos',         group: 'COGS' },
  { id: 'TAXES',             label: 'Impuestos',                             group: 'BELOW' },
  { id: 'DEPRECIATION',      label: 'Depreciación de equipos',               group: 'BELOW' },
];


const CUTOFF_DAY = 5; // fecha de corte: día 5 de cada mes
const PENDING_FROM = '2026-09-01'; // cortes desde esta fecha quedan "por decidir" si nadie decidió
const IVA_RATE = 16;

/* Catálogo: los mismos productos y servicios del facturero de Ágora.
   Recurrente (servicio mensual) → ingreso recurrente (MRR). No recurrente (se entrega una vez) → ingreso no recurrente. */
const PRODUCTS = [
  { id: 'plan-bronce',   plan: 'BRONCE',   short: 'Plan Bronce',   name: 'Suscripción mensual, Plan Bronce “Ordena tu negocio”', recurring: true, price: 50,  match: ['plan bronce'] },
  { id: 'plan-plata',    plan: 'PLATA',    short: 'Plan Plata',    name: 'Suscripción mensual, Plan Plata “Deja de perseguir clientes”', recurring: true, price: 100, match: ['plan plata'] },
  { id: 'plan-oro',      plan: 'ORO',      short: 'Plan Oro',      name: 'Suscripción mensual, Plan Oro “Domina tu ecosistema”', recurring: true, price: 150, match: ['plan oro'] },
  { id: 'plan-diamante', plan: 'DIAMANTE', short: 'Plan Diamante', name: 'Suscripción mensual, Plan Diamante “Sin límites”', recurring: true, price: 250, match: ['plan diamante'] },
  { id: 'svc-email',        short: 'Gestión de correos electrónicos', name: 'Gestión de correos electrónicos', recurring: true,  price: 60,  hours: 5,  member: 'm5', match: ['gestion de correos'] },
  { id: 'svc-meta',         short: 'Gestión de Meta Ads',             name: 'Gestión de Meta Ads, publicidad de campañas', recurring: true,  price: 120, hours: 8,  member: 'm5', match: ['meta ads'] },
  { id: 'svc-marketing',    short: 'Gestión de marketing',            name: 'Gestión de marketing', recurring: true,  price: 150, hours: 12, member: 'm5', match: ['gestion de marketing'] },
  { id: 'svc-landing-mgmt', short: 'Gestión de landing page',         name: 'Gestión de landing page', recurring: true,  price: 40,  hours: 3,  member: 'm5', match: ['gestion de landing'] },
  { id: 'svc-implementacion', short: 'Implementación inicial del CRM', name: 'Implementación y configuración inicial del CRM', recurring: false, price: 200, hours: 6,  member: 'm1', match: ['implementacion y configuracion'] },
  { id: 'svc-canales',      short: 'Integración de canales',          name: 'Integración de canales en bandeja unificada', recurring: false, price: 80,  hours: 3,  member: 'm1', match: ['integracion de canales'] },
  { id: 'svc-ia',           short: 'Implementación de IA',            name: 'Implementación de IA', recurring: false, price: 150, hours: 10, member: 'm4', match: ['implementacion de ia'] },
  { id: 'svc-landing-new',  short: 'Creación de landing page',        name: 'Creación de landing page', recurring: false, price: 250, hours: 15, member: 'm5', match: ['creacion de landing'] },
];
const normTxt = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
function matchProduct(catalog, title) {
  const t = normTxt(title);
  return catalog.find(p => normTxt(p.name) === t) || catalog.find(p => (p.match || []).some(m => t.includes(m))) || null;
}
const planProduct = plan => PRODUCTS.find(p => p.plan === plan);

const DEFAULT_STAFF = [
  { memberId: 'm1', name: 'Ana Pérez',   role: 'Implementación',     hourlyCost: 3.5, monthlyCapacityHours: 80 },
  { memberId: 'm2', name: 'José Rivas',  role: 'Implementación',     hourlyCost: 3,   monthlyCapacityHours: 64 },
  { memberId: 'm3', name: 'Luis Mora',   role: 'Soporte',            hourlyCost: 2.5, monthlyCapacityHours: 60 },
  { memberId: 'm4', name: 'Carla Díaz',  role: 'Desarrollo e IA',    hourlyCost: 5,   monthlyCapacityHours: 60 },
  { memberId: 'm5', name: 'María León',  role: 'Marketing y pauta',  hourlyCost: 4,   monthlyCapacityHours: 80 },
];
const SEED_PAUSES = {
  c05: [{ id: 'pz1', start: '2026-08-10', end: '2026-08-24', reason: 'CLIENT_REQUEST', note: 'Vacaciones colectivas' }],
  c14: [{ id: 'pz2', start: '2026-09-22', end: null, reason: 'CLIENT_REQUEST', note: 'Cambio de administración' }],
};
const SEED_INVESTMENTS = [
  { id: 'iv1', date: '2026-03-05', concept: 'Desarrollo de módulos de IA de la plataforma', category: 'PRODUCT_DEV', amount: 1200, currency: 'USD' },
  { id: 'iv2', date: '2026-04-10', concept: 'Campaña de lanzamiento en redes', category: 'MARKETING', amount: 400, currency: 'USD' },
  { id: 'iv3', date: '2026-05-15', concept: 'Laptops para el equipo de implementación', category: 'EQUIPMENT', amount: 600, currency: 'USDT' },
  { id: 'iv4', date: '2026-07-08', concept: 'Certificación del equipo en Meta Business', category: 'TRAINING', amount: 150, currency: 'USD' },
  { id: 'iv5', date: '2026-08-18', concept: 'Integración con la API oficial de WhatsApp', category: 'PRODUCT_DEV', amount: 300, currency: 'USDT' },
  { id: 'iv6', date: '2026-09-12', concept: 'Material para ferias comerciales', category: 'MARKETING', amount: 18600, currency: 'VES' },
];
const SEED_SERVICES = {
  c01: [['svc-meta', 120, '2026-06-01']],
  c02: [['svc-marketing', 150, '2026-04-01']],
  c03: [['svc-landing-mgmt', 40, '2026-07-15']],
  c07: [['svc-email', 60, '2026-05-01', '2026-09-01']],
  c15: [['svc-email', 60, '2026-08-01']],
  c16: [['svc-meta', 120, '2026-05-04']],
};
const SEED_SALES = {
  c14: [['svc-implementacion', 200, '2026-03-01'], ['svc-canales', 80, '2026-03-01'], ['svc-ia', 150, '2026-05-20']],
  c11: [['svc-canales', 80, '2026-04-02']],
  c15: [['svc-implementacion', 200, '2026-05-12', 'USDT'], ['svc-canales', 80, '2026-05-12', 'USDT']],
  c16: [['svc-landing-new', 250, '2026-05-04']],
  c05: [['svc-implementacion', 200, '2026-06-03'], ['svc-canales', 80, '2026-06-03']],
  c07: [['svc-ia', 400, '2026-06-15'], ['svc-ia', 300, '2026-08-20']],
  c03: [['svc-implementacion', 200, '2026-07-01'], ['svc-canales', 80, '2026-07-01']],
  c01: [['svc-landing-new', 350, '2026-07-10']],
  c08: [['svc-canales', 14240, '2026-08-05', 'VES']],
  c13: [['svc-implementacion', 200, '2026-09-10'], ['svc-canales', 80, '2026-09-10']],
  c06: [['svc-ia', 150, '2026-09-25']],
};
const SEED_CLIENTS = [
  ['c01', 'Clínica Sonrisa',        'Salud',             'INSTAGRAM', 180, 8, 18, [['ORO', '2026-01-10']]],
  ['c02', 'Inmobiliaria Altos',     'Bienes raíces',     'LINKEDIN',  320, 9, 26, [['DIAMANTE', '2025-11-03']]],
  ['c03', 'Academia Lumen',         'Educación',         'REFERRAL',   90, 7, 12, [['ORO', '2026-07-01']], { aiHeavy: 1.75 }],
  ['c04', 'Ferretería El Tornillo', 'Retail',            'WHATSAPP',   60, 6,  3, [['BRONCE', '2026-01-15']]],
  ['c05', 'Óptica Visión Clara',    'Salud',             'FACEBOOK',  140, 7,  6, [['PLATA', '2026-06-03']]],
  ['c06', 'Gimnasio Forza',         'Fitness',           'TIKTOK',    120, 9, 14, [['PLATA', '2026-01-05', '2026-07-01'], ['ORO', '2026-07-01']], { implOver: '2026-09' }],
  ['c07', 'Seguros Andinos',        'Seguros',           'LINKEDIN',  410, 8, 34, [['DIAMANTE', '2025-10-01']], { aiHeavy: 1.45 }],
  ['c08', 'Panadería La Espiga',    'Alimentos',         'INSTAGRAM',  45, 5,  2, [['BRONCE', '2026-08-05']], { currency: 'VES' }],
  ['c09', 'Estudio Legal Ríos',     'Servicios legales', 'WEB',       150, 3,  3, [['PLATA', '2025-12-15', '2026-08-01'], ['BRONCE', '2026-08-01']]],
  ['c10', 'Viajes Caribe Azul',     'Turismo',           'FACEBOOK',  130, 2,  4, [['PLATA', '2026-01-20', '2026-07-20']]],
  ['c11', 'Moda Urbana MU',         'Moda',              'TIKTOK',     70, 8,  9, [['BRONCE', '2026-04-02', '2026-09-15'], ['PLATA', '2026-09-15']]],
  ['c12', 'Consultora Norte',       'Consultoría',       'AFFILIATE', 110, 6, 11, [['ORO', '2025-12-01', '2026-05-20'], ['ORO', '2026-08-01']]],
  ['c13', 'Taller AutoPro',         'Automotriz',        'WEB',       200, 7,  5, [['PLATA', '2026-09-10']]],
  ['c14', 'Constructora Delta',     'Construcción',      'REFERRAL',  260, 8, 41, [['DIAMANTE', '2026-03-01']]],
  ['c15', 'Farmacia Bienestar',     'Salud',             'WHATSAPP',   95, 7, 15, [['ORO', '2026-05-12']]],
  ['c16', 'Restaurante Brasa Viva', 'Alimentos',         'INSTAGRAM',  80, 8,  0, []],
].map(([id, name, sector, channel, cac, health, seats, segs, opt]) => ({
  id, name, sector, channel, cac, health, seats, segs, opt: opt || {},
  pauses: (SEED_PAUSES[id] || []).map(x => ({ ...x })),
  services: (SEED_SERVICES[id] || []).map(([productId, price, start, end], i) => ({ id: `${id}_v${i + 1}`, productId, price, start, end: end || null })),
  sales: (SEED_SALES[id] || []).map(([productId, amount, date, currency], i) => ({ id: `${id}_t${i + 1}`, productId, amount, currency: currency || 'USD', date })),
}));
function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/* ====================== SEED ====================== */
function buildDb(defs, opts = {}) {
  const decisions = opts.decisions || {}, payments = opts.payments || {}, imported = opts.imported || [];
  const catalog = opts.catalog || PRODUCTS;
  const prod = id => catalog.find(p => p.id === id) || PRODUCTS.find(p => p.id === id) || { id, short: id, name: id, recurring: false, hours: 0 };
  let r = rng(20260903);
  const jitter = (a = 0.85, b = 1.15) => a + (b - a) * r();
  const ORG = 'org_agora';

  // v10.1: en modo real ya no hay tabla fija (la de la v10 proponía 192 Bs/US$ para octubre de 2026, unas 5 veces menos
  // que el mercado). Las tasas salen de lo que registra el usuario (opts.rates, ya unificado por mes); un mes sin tasa usa
  // la última anterior conocida y, si no hay ninguna, los montos en bolívares quedan sin convertir y se avisa (rateNote).
  const DEMO_VES = { '2026-03': 142, '2026-04': 150, '2026-05': 158, '2026-06': 165, '2026-07': 171, '2026-08': 178, '2026-09': 186, '2026-10': 192 }; // solo datos de ejemplo
  const vesPerUsd = opts.real ? {} : { ...DEMO_VES };
  Object.entries(opts.rates || {}).forEach(([p, v]) => { if (+v > 0) vesPerUsd[p] = +v; });
  { let last = null; ALL_PERIODS.forEach(p => { if (vesPerUsd[p] > 0) last = vesPerUsd[p]; else if (last) vesPerUsd[p] = last; }); }
  const ivaRateOpt = opts.ivaRate != null ? +opts.ivaRate : IVA_RATE;
  const planFee = plan => { const pp = prod(planProduct(plan).id); return pp && +pp.price > 0 ? +pp.price : PLANS[plan].fee; };
  const exchangeRates = [];
  ALL_PERIODS.forEach(p => {
    if (vesPerUsd[p] > 0) exchangeRates.push({ currency: 'VES', rateToUsd: 1 / vesPerUsd[p], date: p + '-01' });
    exchangeRates.push({ currency: 'USDT', rateToUsd: 1, date: p + '-01' });
  });
  const rateOf = p => vesPerUsd[p] > 0 ? 1 / vesPerUsd[p] : 0;

  const clients = [], subscriptions = [], movements = [], oneTime = [];
  (defs || SEED_CLIENTS).forEach(d => {
    const cpauses = d.pauses || [], opt = d.opt || {};
    const subs = [];
    (d.segs || []).forEach(([plan, start, end], i) => {
      const P = PLANS[plan];
      subs.push({
        id: `${d.id}_s${i + 1}`, organizationId: ORG, clientId: d.id, kind: 'PLAN', plan, productId: planProduct(plan).id, monthlyFee: planFee(plan), seatLimit: P.seatLimit,
        seatsUsed: Math.min(d.seats, P.seatLimit ?? 999), implementationsIncluded: P.impl, aiMode: P.aiMode,
        aiAllowanceUsd: P.aiAllowanceUsd, startDate: start, endDate: end || null, manualPauses: cpauses,
      });
    });
    (d.services || []).forEach(v => subs.push({ id: v.id, organizationId: ORG, clientId: d.id, kind: 'SERVICE', plan: null, productId: v.productId, monthlyFee: +v.price, startDate: v.start, endDate: v.end || null, manualPauses: cpauses }));
    subscriptions.push(...subs);
    (d.sales || []).forEach(t => oneTime.push({ id: t.id, organizationId: ORG, clientId: d.id, productId: t.productId, type: t.productId, amount: +t.amount, currency: t.currency || 'USD', date: t.date, invoiceRef: t.invoiceRef || null }));

    // Movimientos de MRR: se derivan de la línea de tiempo del MRR contratado del cliente (planes + servicios recurrentes)
    const mrrAt = dt => sum(subs.filter(s => activeOn(s, dt)), s => s.monthlyFee);
    const planAt = dt => { const s = subs.find(x => x.kind === 'PLAN' && activeOn(x, dt)); return s ? s.plan : null; };
    const dates = [...new Set(subs.flatMap(s => [s.startDate, s.endDate]).filter(Boolean))].sort();
    let prev = 0, ever = false, firstStart = null, lastEnd = null;
    dates.forEach(dt => {
      const dd = D(dt), after = mrrAt(dd);
      if (after === prev) return;
      const type = prev === 0 ? (ever ? 'REACTIVATION' : 'NEW') : after === 0 ? 'CHURN' : after > prev ? 'UPGRADE' : 'DOWNGRADE';
      movements.push({ clientId: d.id, type, fromPlan: planAt(addDays(dd, -1)), toPlan: planAt(dd), amountDelta: after - prev, effectiveDate: dt });
      if (type === 'NEW') firstStart = dt;
      lastEnd = after === 0 ? dt : null;
      if (after > 0) ever = true; prev = after;
    });
    const firstSale = (d.sales || []).map(t => t.date).sort()[0] || null;
    clients.push({
      id: d.id, organizationId: ORG, name: d.name, sector: d.sector, healthScore: d.health, acquisitionChannel: d.channel,
      cacEstimated: d.cac, status: prev > 0 ? 'active' : 'churned', startedAt: firstStart || firstSale, churnedAt: lastEnd,
      seatsUsed: d.seats, opt, pauses: cpauses,
    });
  });

  const staff = (opts.staff || DEFAULT_STAFF).map(x => ({ ...x }));
  const projects = [
    { id: 'pr1', clientId: 'c07', name: 'Integración ERP',    pricingModel: 'FIXED_PRICE', budgetedCost: 380, start: '2026-06' },
    { id: 'pr2', clientId: 'c01', name: 'Portal de reservas', pricingModel: 'FIXED_PRICE', budgetedCost: 260, start: '2026-07' },
    { id: 'pr3', clientId: 'c14', name: 'Webhooks de obra',   pricingModel: 'INCLUDED_IN_PLAN', budgetedCost: 120, start: '2026-05' },
  ];
  const devHours = {
    pr1: { '2026-06': 22, '2026-07': 24, '2026-08': 16, '2026-09': 14 },
    pr2: { '2026-07': 14, '2026-08': 20, '2026-09': 26 },
    pr3: { '2026-05': 10, '2026-06': 8 },
  };

  const usageCosts = [], implementationLogs = [], timeEntries = [], invoices = [], expenses = [], marketingSpend = [], cashSnapshots = [];
  const usageBase = {
    BRONCE:   { INFRA: 1.2 },
    PLATA:    { OPENAI: 6, INFRA: 2, TWILIO: 0.8 },
    ORO:      { OPENAI: 11, ANTHROPIC: 5, ESIGN: 2.5, INFRA: 3 },
    DIAMANTE: { OPENAI: 25, ANTHROPIC: 13, ESIGN: 5, INFRA: 6, TWILIO: 2.5 },
  };
  const implRange = { BRONCE: [0, 0], PLATA: [1, 3], ORO: [2, 4], DIAMANTE: [4, 8] };
  const supportH = { BRONCE: 1, PLATA: 2, ORO: 3, DIAMANTE: 5 };
  const unpaid = new Set(['c09|2026-07', 'c09|2026-08', 'c09|2026-09', 'c09|2026-10', 'c10|2026-06', 'c10|2026-07', 'c08|2026-09', 'c07|2026-09']);
  const latePaid = { 'c05|2026-08': '2026-09-22', 'c07|2026-08': '2026-09-05', 'c09|2026-06': '2026-07-28' };
  const voided = new Set(['c12|2026-05']);
  const pad2 = n => String(n).padStart(2, '0');

  ALL_PERIODS.forEach(p => {
    clients.forEach(c => {
      const subs = subscriptions.filter(s => s.clientId === c.id && overlapDays(s, p) > 0);
      const sales = oneTime.filter(o => o.clientId === c.id && inPeriod(o.date, p));
      // CORRECCIÓN: las facturas del facturero se cargan SIEMPRE, antes de mirar la actividad del cliente.
      // Antes, si el cliente no tenía plan, servicio o venta en ese mes (por ejemplo, porque al editar la
      // factura cambió su fecha), la factura se descartaba y no aparecía en Facturación.
      const imp = imported.filter(x => x.clientId === c.id && inPeriod(x.issueDate, p));
      imp.forEach(x => {
        let paidDate = payments[x.id] !== undefined ? payments[x.id] : (x.paidDate || null);
        if (paidDate && paidDate > TODAY) paidDate = null;
        invoices.push({ id: x.id, num: x.num, organizationId: ORG, clientId: c.id, subtotal: x.subtotal, ivaRate: x.ivaRate, iva: x.iva, amount: round2(x.subtotal + x.iva), currency: 'USD', issueDate: x.issueDate, dueDate: x.dueDate, paidDate, voided: false, isCutoff: x.dueDate.slice(8) === pad2(CUTOFF_DAY), imported: true, updatedAt: x.updatedAt || null });
      });
      if (!subs.length && !sales.length) return;
      r = rng(hashStr(c.id + '|' + p));
      const planSubs = subs.filter(s => s.kind === 'PLAN');
      const cur = planSubs[planSubs.length - 1];
      const share = sum(planSubs, s => overlapDays(s, p)) / daysIn(p);
      const isNew = inPeriod(c.startedAt, p);
      const real = !!opts.real;
      if (cur && !real) {
        Object.entries(usageBase[cur.plan]).forEach(([provider, v]) => {
          let cost = v * jitter() * share;
          if (AI_PROVIDERS.includes(provider) && c.opt.aiHeavy) cost *= c.opt.aiHeavy;
          usageCosts.push({ organizationId: ORG, clientId: c.id, provider, costUsd: round2(cost), billingPeriod: p });
        });
        const [lo, hi] = implRange[cur.plan];
        let used = lo + Math.floor(r() * (hi - lo + 1));
        if (c.opt.implOver === p) used = cur.implementationsIncluded + 1;
        used = Math.min(used, cur.implementationsIncluded + (c.opt.implOver === p ? 1 : 0));
        const ih = round2(used * 2.4);
        implementationLogs.push({ organizationId: ORG, clientId: c.id, period: p, implementationsUsed: used, implementationsIncluded: cur.implementationsIncluded, hoursSpent: ih });
        if (ih) {
          timeEntries.push({ memberId: 'm1', clientId: c.id, hours: round2(ih * 0.55), billable: true, category: 'IMPLEMENTATION', period: p });
          timeEntries.push({ memberId: 'm2', clientId: c.id, hours: round2(ih * 0.45), billable: true, category: 'IMPLEMENTATION', period: p });
        }
        timeEntries.push({ memberId: 'm3', clientId: c.id, hours: round2(supportH[cur.plan] * share * jitter(0.8, 1.25)), billable: true, category: 'SUPPORT', period: p });
      } else if (subs.length && !real) {
        usageCosts.push({ organizationId: ORG, clientId: c.id, provider: 'INFRA', costUsd: round2(0.5 * jitter()), billingPeriod: p });
      }
      // horas de servicios: recurrentes (prorrateadas) y no recurrentes (en el mes de la venta)
      if (!real) subs.filter(s => s.kind === 'SERVICE').forEach(s => { const P = prod(s.productId); if (P.hours) timeEntries.push({ memberId: P.member || 'm5', clientId: c.id, productId: s.productId, hours: round2(P.hours * overlapDays(s, p) / daysIn(p) * jitter(0.85, 1.2)), billable: true, category: 'SERVICE', period: p }); });
      if (!real) sales.forEach(o => { const P = prod(o.productId); if (P.hours) timeEntries.push({ memberId: P.member || 'm5', clientId: c.id, productId: o.productId, hours: round2(P.hours * jitter(0.9, 1.3)), billable: true, category: 'SERVICE', period: p }); });

      // factura del mes: recurrente + no recurrente; el IVA se cobra aparte y no es ingreso
      const key = c.id + '|' + p;
      if (imp.length) return;
      if (real) return; // modo real: solo cuentan las facturas del facturero
      const recurringPart = sum(subs, s => proratedFee(s, p));
      const ot = sum(sales, o => o.currency === 'VES' ? o.amount * rateOf(p) : o.amount);
      const firstInvoice = isNew || (!subs.length);
      const issue = firstInvoice ? (c.startedAt && inPeriod(c.startedAt, p) ? c.startedAt : sales[0].date) : p + '-01';
      if (issue > TODAY) return;
      const due = firstInvoice ? issue : `${p}-${pad2(CUTOFF_DAY)}`;
      const subtotal = round2(recurringPart + ot), iva = round2(subtotal * ivaRateOpt / 100), totalUsd = subtotal + iva;
      const cur$ = c.opt.currency || 'USD';
      const invId = 'F-' + p.replace('-', '') + '-' + c.id.slice(1).toUpperCase();
      const payDay = r() < 0.8 ? 1 + Math.floor(r() * CUTOFF_DAY) : CUTOFF_DAY + 1 + Math.floor(r() * 7);
      let paidDate = firstInvoice ? issue : `${p}-${pad2(payDay)}`;
      if (latePaid[key]) paidDate = latePaid[key];
      if (unpaid.has(key)) paidDate = null;
      if (payments[invId] !== undefined) paidDate = payments[invId];
      if (paidDate && paidDate > TODAY) paidDate = null;
      invoices.push({
        id: invId, organizationId: ORG, clientId: c.id, subtotal, ivaRate: ivaRateOpt, iva,
        amount: cur$ === 'VES' ? round2(totalUsd / rateOf(p)) : totalUsd, currency: cur$, issueDate: issue,
        dueDate: due, paidDate, voided: voided.has(key), isCutoff: !firstInvoice,
      });
    });
    if (!opts.real) projects.forEach(pr => { const h = devHours[pr.id][p]; if (h) timeEntries.push({ memberId: 'm4', clientId: pr.clientId, projectId: pr.id, hours: h, billable: true, category: 'CUSTOM_DEV', period: p }); });
    [['m1', 14], ['m2', 10], ['m3', 12], ['m4', 8], ['m5', 10]].forEach(([m, h]) => timeEntries.push({ memberId: m, hours: h, billable: false, category: 'INTERNAL', period: p }));

    const payroll = sum(staff, s => s.hourlyCost * s.monthlyCapacityHours);
    const mkt = { '2026-03': 160, '2026-04': 180, '2026-05': 210, '2026-06': 200, '2026-07': 230, '2026-08': 190, '2026-09': 220, '2026-10': 220 }[p] || 220;
    const mrrNow = sum(subscriptions.filter(s => overlapDays(s, p) > 0), s => proratedFee(s, p));
    [
      ['PAYROLL', payroll, 'Nómina del equipo (5 personas)'], ['TOOLS', 80, 'Licencias de software'], ['INFRA', 60, 'Servidores y dominios'],
      ['MARKETING', mkt, 'Pauta en redes'], ['PROFESSIONAL', 20, 'Honorarios del contador'], ['BANK', 8, 'Comisiones de Binance y bancos'],
      ['COMMISSIONS', round2(mrrNow * 0.05), 'Comisiones de venta (5% del ingreso fijo)'], ['AFFILIATE_PAYOUTS', 22, 'Pagos a afiliados'],
      ['TAXES', round2(mrrNow * 0.02), 'Impuestos del mes'], ['DEPRECIATION', 30, 'Depreciación de laptops'],
    ].forEach(([category, amount, concept], i) => expenses.push({ id: `ex-${p}-${i}`, organizationId: ORG, category, concept, amount, currency: 'USD', period: p }));
    expenses.push({ id: `ex-${p}-ves`, organizationId: ORG, category: 'OFFICE', concept: 'Internet y telefonía (Bs.)', amount: 2400, currency: 'VES', period: p });
    const split = { INSTAGRAM: 0.35, TIKTOK: 0.25, FACEBOOK: 0.2, LINKEDIN: 0.2 };
    Object.entries(split).forEach(([channel, f]) => marketingSpend.push({ organizationId: ORG, channel, amount: round2(mkt * f), period: p }));
  });

  // Gastos registrados por el usuario (o importados de su hoja) reemplazan los de ejemplo
  if (opts.expenses) {
    expenses.length = 0; marketingSpend.length = 0;
    opts.expenses.forEach(e => expenses.push({ organizationId: ORG, ...e }));
    ALL_PERIODS.forEach(p => { const m = sum(expenses.filter(e => e.period === p && e.category === 'MARKETING'), e => e.currency === 'VES' ? e.amount * rateOf(p) : e.amount); marketingSpend.push({ organizationId: ORG, channel: 'TOTAL', amount: round2(m), period: p }); });
  }
  let cash = 6200;
  ALL_PERIODS.forEach((p, i) => { cash += [0, 140, -60, 210, 180, -40, 260, 90][i] || 0; const ov = opts.cash && opts.cash[p] != null ? +opts.cash[p] : null; cashSnapshots.push({ organizationId: ORG, period: p, cashBalance: ov != null ? ov : (opts.real ? null : cash), edited: ov != null }); });

  // Corte del día 5
  const cuts = [];
  invoices.forEach(inv => {
    if (inv.voided || !inv.isCutoff || inv.dueDate >= TODAY) return;
    if (inv.paidDate && inv.paidDate <= inv.dueDate) return;
    const p = inv.dueDate.slice(0, 7), key = inv.clientId + '|' + p;
    let decision = decisions[key];
    if (decision === undefined) decision = inv.dueDate >= PENDING_FROM ? null : ((!inv.paidDate || inv.paidDate > isoD(addDays(D(inv.dueDate), 3))) ? 'CUT' : 'GRACE');
    cuts.push({ key, clientId: inv.clientId, period: p, invoiceId: inv.id, dueDate: inv.dueDate, paidDate: inv.paidDate, decision });
  });
  const pauses = [];
  clients.forEach(c => (c.pauses || []).forEach(pp => pauses.push({ ...pp, clientId: c.id, source: 'MANUAL' })));
  cuts.filter(x => x.decision === 'CUT').forEach(x => pauses.push({ id: 'cut_' + x.invoiceId, clientId: x.clientId, start: isoD(addDays(D(x.dueDate), 1)), end: x.paidDate, reason: 'NO_PAYMENT', source: 'CUT', invoiceId: x.invoiceId }));

  if (opts.real) projects.length = 0;
  // v10: cobros reales de cada factura (pagos en Binance, PayPal, Zelle, efectivo o bolívares con su equivalente en US$)
  const payMap = {}; (opts.pagos || []).forEach(pg => { if (pg && pg.invId && pg.date && pg.date <= TODAY && +pg.usd > 0) (payMap[pg.invId] = payMap[pg.invId] || []).push({ id: pg.id, date: pg.date, usd: +pg.usd, method: pg.method }); });
  invoices.forEach(inv => { const l = payMap[inv.id]; inv.pays = l ? l.sort((a, b) => a.date.localeCompare(b.date)) : null; });
  return { catalog, prod, cuts, pauses, clients, subscriptions, movements, oneTime, usageCosts, implementationLogs, timeEntries, invoices, staff, projects, expenses, marketingSpend, cashSnapshots, exchangeRates };
}
/* v10 · Cobros reales (base de caja)
   - Si la factura tiene pagos registrados, lo cobrado es la suma de sus pagos (con el equivalente en US$ de cada uno),
     en la fecha de cada pago: así cuentan los abonos parciales y lo que realmente entró al cambiar bolívares.
   - Si la factura se marcó pagada antes de la v10 (sin detalle de pago), lo cobrado es su total en la fecha de pago. */
function collectedIn(db, p) {
  return sum(db.invoices.filter(i => !i.voided), i => i.pays && i.pays.length ? sum(i.pays.filter(x => inPeriod(x.date, p)), x => x.usd) : (i.paidDate && inPeriod(i.paidDate, p) ? invoiceUsd(db, i) || 0 : 0));
}
// Saldo pendiente de una factura en una fecha de referencia (exclusiva): total − pagos anteriores; 0 si ya estaba saldada
function invBalance(db, i, ref) {
  if (i.voided) return 0;
  if (i.paidDate && D(i.paidDate) < ref) return 0;
  const tot = invoiceUsd(db, i) || 0; const paid = i.pays ? sum(i.pays.filter(x => D(x.date) < ref), x => x.usd) : 0;
  return Math.max(0, round2(tot - paid));
}

/* ====================== MOTOR DE MÉTRICAS (puro) ====================== */
function activeOn(s, d) { return D(s.startDate) <= d && (!s.endDate || D(s.endDate) > d); }
function overlapDays(s, p) {
  const a = Math.max(D(s.startDate).getTime(), monthStart(p).getTime());
  const b = Math.min(s.endDate ? D(s.endDate).getTime() : Infinity, monthEnd(p).getTime());
  return Math.max(0, Math.round((b - a) / DAY));
}
function inPause(pp, d) { return D(pp.start) <= d && (!pp.end || D(pp.end) > d); }
// Días facturables: días con suscripción activa menos los días en pausa a solicitud (la pausa por corte no se descuenta: la deuda sigue).
function billableDays(s, p) {
  const a = Math.max(D(s.startDate).getTime(), monthStart(p).getTime());
  const b = Math.min(s.endDate ? D(s.endDate).getTime() : Infinity, monthEnd(p).getTime());
  let n = 0;
  for (let t = a; t < b; t += DAY) { const d = new Date(t); if (!(s.manualPauses || []).some(pp => inPause(pp, d))) n++; }
  return n;
}
function proratedFee(s, p) { return s.monthlyFee * billableDays(s, p) / daysIn(p); }
function pausedOn(db, clientId, d) { return db.pauses.find(pp => pp.clientId === clientId && inPause(pp, d)) || null; }
function clientActiveOn(db, clientId, d) { return db.subscriptions.some(s => s.clientId === clientId && activeOn(s, d)); }
function pauseDays(db, clientId, p) {
  let n = 0;
  for (let t = monthStart(p).getTime(); t < monthEnd(p).getTime(); t += DAY) { const d = new Date(t); if (clientActiveOn(db, clientId, d) && pausedOn(db, clientId, d)) n++; }
  return n;
}
function rateFor(db, currency, date) {
  if (currency === 'USD' || currency === 'USDT') return 1;
  const rs = db.exchangeRates.filter(x => x.currency === currency && x.date <= date).sort((a, b) => a.date < b.date ? 1 : -1);
  return rs.length ? rs[0].rateToUsd : null;
}
function toUsd(db, amount, currency, date) { const r = rateFor(db, currency, date); return r == null ? null : amount * r; }
function invoiceUsd(db, inv) { return toUsd(db, inv.amount, inv.currency, inv.issueDate); }
function invoiceStatus(inv, ref) {
  if (inv.voided) return 'VOID';
  if (inv.paidDate && D(inv.paidDate) <= ref) return 'PAID';
  return D(inv.dueDate) < ref ? 'OVERDUE' : 'PENDING';
}
function mrrOn(db, d) { return sum(db.subscriptions.filter(s => activeOn(s, d)), s => s.monthlyFee); }
function activeClientIdsOn(db, d) { return new Set(db.subscriptions.filter(s => activeOn(s, d)).map(s => s.clientId)); }
function staffCost(db, memberId) { const s = db.staff.find(x => x.memberId === memberId); return s ? s.hourlyCost : 0; }
function expByCat(db, p, cat) { return sum(db.expenses.filter(e => e.period === p && (!cat || e.category === cat)), e => toUsd(db, e.amount, e.currency, p + '-01')); }

const DIRECT_CATS = ['IMPLEMENTATION', 'SUPPORT', 'SERVICE'];
function hasData(db, p) { return ALL_PERIODS.includes(p); }

function periodMetrics(db, p) {
  if (!hasData(db, p)) return null;
  const ms = monthStart(p), me = monthEnd(p), lastDay = addDays(me, -1), prevDay = addDays(ms, -1), days = daysIn(p);
  const subsP = db.subscriptions.filter(s => overlapDays(s, p) > 0);
  const mrr = sum(subsP, s => proratedFee(s, p));
  const mrrPlans = sum(subsP.filter(s => s.kind === 'PLAN'), s => proratedFee(s, p)), mrrServices = mrr - mrrPlans;
  const nonMrr = sum(db.oneTime.filter(o => inPeriod(o.date, p)), o => toUsd(db, o.amount, o.currency, o.date));
  const revenue = mrr + nonMrr;

  const mrrStart = mrrOn(db, prevDay);
  const mrrEnd = mrrOn(db, lastDay);
  const cohort = activeClientIdsOn(db, prevDay);
  const mov = db.movements.filter(m => inPeriod(m.effectiveDate, p));
  const coh = mov.filter(m => cohort.has(m.clientId));
  const upgrades = sum(coh.filter(m => m.type === 'UPGRADE'), m => m.amountDelta);
  const downgrades = 0 - sum(coh.filter(m => m.type === 'DOWNGRADE'), m => m.amountDelta);
  const churnAmt = 0 - sum(coh.filter(m => m.type === 'CHURN'), m => m.amountDelta);
  const churnedClients = new Set(coh.filter(m => m.type === 'CHURN').map(m => m.clientId)).size;
  const newClients = mov.filter(m => m.type === 'NEW').length;

  const usage = db.usageCosts.filter(u => u.billingPeriod === p);
  const usageTotal = sum(usage, u => u.costUsd);
  const usageAi = sum(usage.filter(u => AI_PROVIDERS.includes(u.provider)), u => u.costUsd);
  const te = db.timeEntries.filter(t => t.period === p);
  const directHoursCost = sum(te.filter(t => DIRECT_CATS.includes(t.category)), t => t.hours * staffCost(db, t.memberId));
  const commissions = 0; // las comisiones de venta se registran como inversión
  const affiliates = 0;
  const cogs = usageTotal + directHoursCost + commissions + affiliates;
  const grossMargin = div(revenue - cogs, revenue) == null ? null : div(revenue - cogs, revenue) * 100;

  const taxes = expByCat(db, p, 'impuestos'), dep = 0;
  const allExp = expByCat(db, p);
  const opexExTaxDep = allExp - taxes - dep;
  // EBITDA: el costo de horas ya está dentro de PAYROLL y las comisiones dentro de Expense,
  // por eso aquí solo se resta UsageCost (que no es Expense) + gastos sin impuestos ni depreciación.
  const ebitda = revenue - usageTotal - opexExTaxDep;
  const ebitdaPct = revenue ? ebitda / revenue * 100 : null;
  const netMargin = revenue ? (ebitda - dep - taxes) / revenue * 100 : null;

  const activeIds = new Set(subsP.map(s => s.clientId));
  const arpu = div(mrr, activeIds.size);
  const churnClientsPct = cohort.size ? churnedClients / cohort.size * 100 : null;
  const churnMrr = mrrStart ? (churnAmt + downgrades) / mrrStart * 100 : null;
  const nrr = mrrStart ? (mrrStart + upgrades - downgrades - churnAmt) / mrrStart * 100 : null;

  const marketing = sum(db.marketingSpend.filter(m => m.period === p), m => m.amount);
  let cac, cacEstimated = false;
  if (newClients > 0 && marketing > 0) cac = marketing / newClients;
  else {
    const pool = db.clients.filter(c => inPeriod(c.startedAt, p));
    const src = pool.length ? pool : db.clients;
    cac = div(sum(src, c => c.cacEstimated), src.length); cacEstimated = true;
  }
  const cacByChannel = {};
  db.marketingSpend.filter(m => m.period === p).forEach(m => {
    const n = db.clients.filter(c => inPeriod(c.startedAt, p) && c.acquisitionChannel === m.channel).length;
    cacByChannel[m.channel] = { spend: m.amount, newClients: n, cac: div(m.amount, n) };
  });

  const cashCollected = collectedIn(db, p); // v10: cobros reales (incluye abonos y lo recibido en bolívares convertido)
  const totalSpend = allExp + usageTotal;
  const burn = totalSpend - cashCollected;
  const cashSnap = db.cashSnapshots.find(c => c.period === p);

  const ar = sum(db.invoices.filter(i => !i.voided && D(i.issueDate) < me), i => invBalance(db, i, me)); // v10: saldo pendiente real
  const invoiced = sum(db.invoices.filter(i => !i.voided && inPeriod(i.issueDate, p)), i => invoiceUsd(db, i));
  const dso = invoiced ? ar / invoiced * days : null;

  // concentración (MRR al cierre)
  const byClient = {};
  db.subscriptions.filter(s => activeOn(s, lastDay)).forEach(s => byClient[s.clientId] = (byClient[s.clientId] || 0) + s.monthlyFee);
  const ranked = Object.entries(byClient).sort((a, b) => b[1] - a[1]);
  const top3 = mrrEnd ? sum(ranked.slice(0, 3), x => x[1]) / mrrEnd * 100 : null;
  const largest = mrrEnd && ranked.length ? ranked[0][1] / mrrEnd * 100 : null;

  // mix de planes
  const planMix = PLAN_ORDER.map(plan => {
    const subs = db.subscriptions.filter(s => s.kind === 'PLAN' && s.plan === plan && activeOn(s, lastDay));
    const m = sum(subs, s => s.monthlyFee);
    return { plan, clients: subs.length, mrr: m, pct: mrrEnd ? m / mrrEnd * 100 : null, arpu: div(m, subs.length) };
  });
  { const ss = db.subscriptions.filter(s => s.kind === 'SERVICE' && activeOn(s, lastDay)); const m = sum(ss, s => s.monthlyFee);
    planMix.push({ plan: 'SERVICIOS', clients: new Set(ss.map(s => s.clientId)).size, mrr: m, pct: mrrEnd ? m / mrrEnd * 100 : null, arpu: div(m, new Set(ss.map(s => s.clientId)).size) }); }

  // equipo
  const utilization = db.staff.map(s => {
    const mine = te.filter(t => t.memberId === s.memberId);
    const billable = sum(mine.filter(t => t.billable), t => t.hours);
    return { ...s, billable, total: sum(mine, t => t.hours), pct: div(billable, s.monthlyCapacityHours) == null ? null : billable / s.monthlyCapacityHours * 100 };
  });
  const fte = sum(db.staff, s => s.monthlyCapacityHours) / 160;
  const revPerEmployee = div(revenue * 12, fte);
  const impl = db.implementationLogs.filter(l => l.period === p);
  const implUsed = sum(impl, l => l.implementationsUsed), implIncluded = sum(impl, l => l.implementationsIncluded);

  const projects = db.projects.filter(pr => pr.pricingModel === 'FIXED_PRICE' && pr.start <= p).map(pr => {
    const real = sum(db.timeEntries.filter(t => t.projectId === pr.id && t.period <= p), t => t.hours * staffCost(db, t.memberId));
    return { ...pr, real, deviation: div(real - pr.budgetedCost, pr.budgetedCost) == null ? null : (real - pr.budgetedCost) / pr.budgetedCost * 100 };
  });

  const pauseRows = db.clients.map(c => ({ id: c.id, days: pauseDays(db, c.id, p) }));
  const pauseDaysTotal = sum(pauseRows, x => x.days);
  const pausedAtClose = db.clients.filter(c => clientActiveOn(db, c.id, lastDay) && pausedOn(db, c.id, lastDay));
  const mrrPaused = sum(pausedAtClose, c => sum(db.subscriptions.filter(s => s.clientId === c.id && activeOn(s, lastDay)), s => s.monthlyFee));
  const dueOn5 = db.invoices.filter(i => !i.voided && i.isCutoff && inPeriod(i.dueDate, p) && i.dueDate < TODAY);
  const onTime = dueOn5.filter(i => i.paidDate && i.paidDate <= i.dueDate).length;
  const cutsP = db.cuts.filter(x => x.period === p);

  return {
    mrrPlans, mrrServices, ivaBilled: sum(db.invoices.filter(i => !i.voided && inPeriod(i.issueDate, p)), i => i.iva || 0),
    p, days, mrr, pauseDays: pauseDaysTotal, pausedAtClose: pausedAtClose.length, pausedClientsInMonth: pauseRows.filter(x => x.days > 0).length, mrrPaused,
    dueOn5: dueOn5.length, onTime, onTimePct: dueOn5.length ? onTime / dueOn5.length * 100 : null,
    cutsCut: cutsP.filter(x => x.decision === 'CUT').length, cutsGrace: cutsP.filter(x => x.decision === 'GRACE').length, cutsPending: cutsP.filter(x => x.decision == null).length, arr: mrr * 12, nonMrr, revenue, mrrStart, mrrEnd, upgrades, downgrades, churnAmt, churnedClients, newClients,
    movements: mov, usageTotal, usageAi, directHoursCost, commissions, affiliates, cogs, grossMargin, ebitda, ebitdaPct, netMargin, taxes, dep,
    activeClients: activeIds.size, arpu, churnClientsPct, churnMrr, nrr, marketing, cac, cacEstimated, cacByChannel,
    cashCollected, totalSpend, burn, cash: cashSnap ? cashSnap.cashBalance : null, ar, invoiced, dso, top3, largest, ranked,
    planMix, utilization, fte, revPerEmployee, implUsed, implIncluded, projects,
  };
}

function kpiSet(db, p) {
  const cur = periodMetrics(db, p);
  if (!cur) return null;
  const p1 = prevPeriod(p), p2 = prevPeriod(p1);
  const prev = periodMetrics(db, p1), prev2 = periodMetrics(db, p2);
  const avg = arr => { const v = arr.filter(x => x != null); return v.length ? sum(v) / v.length : null; };
  const derive = (m, a, b) => {
    if (!m) return null;
    const churn3 = avg([m.churnClientsPct, a && a.churnClientsPct, b && b.churnClientsPct]);
    const gm = m.grossMargin == null ? null : m.grossMargin / 100;
    const ltv = (m.arpu == null || gm == null || !churn3) ? null : m.arpu * gm / (churn3 / 100);
    const ltvCac = div(ltv, m.cac);
    const payback = (m.arpu == null || gm == null) ? null : div(m.cac, m.arpu * gm);
    const burn3 = avg([m.burn, a && a.burn, b && b.burn]);
    const runway = burn3 == null ? null : (m.cash != null && m.cash <= 0 ? 0 : burn3 <= 0 ? Infinity : div(m.cash, burn3));
    return { churn3, ltv, ltvCac, payback, burn3, runway };
  };
  const curD = derive(cur, prev, prev2);
  const prevD = prev ? derive(prev, prev2, periodMetrics(db, prevPeriod(p2))) : null;
  return { cur: { ...cur, ...curD }, prev: prev ? { ...prev, ...prevD } : null };
}

function statusOf(value, b) {
  if (value == null || !b) return null;
  if (value === Infinity) return b.direction === 'HIGHER_IS_BETTER' ? 'green' : 'red';
  if (b.direction === 'HIGHER_IS_BETTER') return value >= b.green ? 'green' : value >= b.yellow ? 'yellow' : 'red';
  return value <= b.green ? 'green' : value <= b.yellow ? 'yellow' : 'red';
}

function clientMatrix(db, p, m) {
  const me = monthEnd(p), lastDay = addDays(me, -1);
  const affN = db.clients.filter(x => x.acquisitionChannel === 'AFFILIATE' && db.subscriptions.some(s => s.clientId === x.id && overlapDays(s, p) > 0)).length;
  return db.clients.map(c => {
    const subs = db.subscriptions.filter(s => s.clientId === c.id && overlapDays(s, p) > 0);
    const sales = db.oneTime.filter(o => o.clientId === c.id && inPeriod(o.date, p));
    if (!subs.length && !sales.length) return null;
    const planSubs = subs.filter(s => s.kind === 'PLAN');
    const sub = planSubs.find(s => activeOn(s, lastDay)) || planSubs[planSubs.length - 1] || null;
    const mrrPart = sum(subs, s => proratedFee(s, p));
    const ot = sum(sales, o => toUsd(db, o.amount, o.currency, o.date));
    const billing = mrrPart + ot;
    const usage = db.usageCosts.filter(u => u.clientId === c.id && u.billingPeriod === p);
    const usageTotal = sum(usage, u => u.costUsd);
    const ai = sum(usage.filter(u => AI_PROVIDERS.includes(u.provider)), u => u.costUsd);
    const hours = sum(db.timeEntries.filter(t => t.clientId === c.id && t.period === p && DIRECT_CATS.includes(t.category)), t => t.hours * staffCost(db, t.memberId));
    const commission = m.mrr ? m.commissions * mrrPart / m.mrr : 0;
    const affiliate = c.acquisitionChannel === 'AFFILIATE' && affN ? m.affiliates / affN : 0;
    const cost = usageTotal + hours + commission + affiliate;
    const margin = billing - cost;
    const marginPct = billing ? margin / billing * 100 : null;
    const invs = db.invoices.filter(i => i.clientId === c.id && !i.voided && D(i.issueDate) < me);
    const st = invs.map(i => invoiceStatus(i, me));
    const payment = st.includes('OVERDUE') ? 'OVERDUE' : st.includes('PENDING') ? 'PENDING' : 'PAID';
    const arC = sum(invs.filter(i => invoiceStatus(i, me) !== 'PAID'), i => invBalance(db, i, me));
    const invC = sum(invs.filter(i => inPeriod(i.issueDate, p)), i => invoiceUsd(db, i));
    const dso = invC ? arC / invC * m.days : null;
    const impl = db.implementationLogs.find(l => l.clientId === c.id && l.period === p);
    const active = clientActiveOn(db, c.id, lastDay);
    const clientMrrEnd = sum(db.subscriptions.filter(s => s.clientId === c.id && activeOn(s, lastDay)), s => s.monthlyFee);
    const services = db.subscriptions.filter(s => s.clientId === c.id && s.kind === 'SERVICE' && activeOn(s, lastDay)).map(s => ({ productId: s.productId, price: s.monthlyFee }));
    const flags = [];
    if (marginPct != null && marginPct < 50) flags.push('LOW_MARGIN_RISK');
    if (sub && ai > sub.aiAllowanceUsd && sub.aiMode !== 'NONE') flags.push('AI_OVERRUN');
    if (impl && impl.implementationsUsed > impl.implementationsIncluded) flags.push('IMPLEMENTATION_OVERRUN');
    if (sub && activeOn(sub, lastDay) && sub.seatLimit != null && sub.seatsUsed >= sub.seatLimit * 0.9) flags.push('UPGRADE_READY');
    if (m.mrrEnd && clientMrrEnd / m.mrrEnd > 0.2) flags.push('CONCENTRATION_RISK');
    const pauseNow = active ? pausedOn(db, c.id, lastDay) : null;
    return {
      pauseDays: pauseDays(db, c.id, p), pauseNow, services, sales: sales.map(o => ({ productId: o.productId, usd: toUsd(db, o.amount, o.currency, o.date) })),
      id: c.id, name: c.name, sector: c.sector, plan: sub ? sub.plan : null, active, churnedInPeriod: subs.length > 0 && !active, oneTimeOnly: !subs.length,
      seatsUsed: sub ? sub.seatsUsed : null, seatLimit: sub ? sub.seatLimit : null, billing, mrrPart, oneTime: ot, ai, aiAllowance: sub ? sub.aiAllowanceUsd : 0, usageTotal, hours, commission, affiliate,
      margin, marginPct, payment, ar: arC, dso, cac: c.cacEstimated, health: c.healthScore, flags,
      implUsed: impl ? impl.implementationsUsed : 0, implIncluded: impl ? impl.implementationsIncluded : 0,
    };
  }).filter(Boolean);
}

/* Ingresos por línea de negocio: cada plan, servicios recurrentes y servicios no recurrentes.
   El CoGS se asigna así: consumo de IA/infra y horas de implementación/soporte → plan del cliente;
   horas de servicios → línea del servicio; comisiones y afiliados → proporcional al ingreso de la línea. */
const LINE_ORDER = ['BRONCE', 'PLATA', 'ORO', 'DIAMANTE', 'SERV_REC', 'NON_REC'];
function revenueLines(db, p, m) {
  const L = Object.fromEntries(LINE_ORDER.map(k => [k, { line: k, revenue: 0, aiInfra: 0, talent: 0, other: 0, clients: new Set() }]));
  const lastDay = addDays(monthEnd(p), -1);
  const planOf = cid => { const ss = db.subscriptions.filter(s => s.clientId === cid && s.kind === 'PLAN' && overlapDays(s, p) > 0); const s = ss.find(x => activeOn(x, lastDay)) || ss[ss.length - 1]; return s ? s.plan : 'SERV_REC'; };
  db.subscriptions.filter(s => overlapDays(s, p) > 0).forEach(s => { const k = s.kind === 'PLAN' ? s.plan : 'SERV_REC'; L[k].revenue += proratedFee(s, p); L[k].clients.add(s.clientId); });
  db.oneTime.filter(o => inPeriod(o.date, p)).forEach(o => { L.NON_REC.revenue += toUsd(db, o.amount, o.currency, o.date); L.NON_REC.clients.add(o.clientId); });
  db.usageCosts.filter(u => u.billingPeriod === p).forEach(u => { L[planOf(u.clientId)].aiInfra += u.costUsd; });
  db.timeEntries.filter(t => t.period === p && DIRECT_CATS.includes(t.category)).forEach(t => {
    const cost = t.hours * staffCost(db, t.memberId);
    if (t.category === 'SERVICE') L[db.prod(t.productId).recurring ? 'SERV_REC' : 'NON_REC'].talent += cost;
    else L[planOf(t.clientId)].talent += cost;
  });
  const total = sum(Object.values(L), x => x.revenue);
  return LINE_ORDER.map(k => {
    const x = L[k]; x.other = total ? (m.commissions + m.affiliates) * x.revenue / total : 0;
    const cogs = x.aiInfra + x.talent + x.other;
    return { ...x, clients: x.clients.size, cogs, margin: x.revenue - cogs, marginPct: x.revenue ? (x.revenue - cogs) / x.revenue * 100 : null, arpu: div(x.revenue, x.clients.size) };
  });
}
function productRevenue(db, p) {
  const out = {};
  const add = (pid, usd, cid) => { const P = db.prod(pid); out[pid] = out[pid] || { productId: pid, short: P.short, recurring: P.recurring, revenue: 0, clients: new Set() }; out[pid].revenue += usd; out[pid].clients.add(cid); };
  db.subscriptions.filter(s => overlapDays(s, p) > 0).forEach(s => add(s.productId, proratedFee(s, p), s.clientId));
  db.oneTime.filter(o => inPeriod(o.date, p)).forEach(o => add(o.productId, toUsd(db, o.amount, o.currency, o.date), o.clientId));
  const order = db.catalog.map(x => x.id);
  return Object.values(out).map(x => ({ ...x, clients: x.clients.size })).sort((a, b) => (b.recurring - a.recurring) || ((order.indexOf(a.productId) + 999) % 999 - (order.indexOf(b.productId) + 999) % 999));
}

function arAging(db, p) {
  const ref = addDays(monthEnd(p), -1);
  const buckets = [
    { key: 'b0', label: 'Al día', range: '0–30 días', min: -Infinity, max: 30, items: [] },
    { key: 'b1', label: 'Mora leve', range: '31–60 días', min: 31, max: 60, items: [] },
    { key: 'b2', label: 'Mora severa', range: '61–90 días', min: 61, max: 90, items: [] },
    { key: 'b3', label: 'Mora crítica', range: 'Más de 90 días', min: 91, max: Infinity, items: [] },
  ];
  db.invoices.forEach(i => {
    if (i.voided || D(i.issueDate) > ref) return;
    if (i.paidDate && D(i.paidDate) <= ref) return;
    const daysLate = Math.round((ref - D(i.dueDate)) / DAY);
    const b = buckets.find(b => Math.max(daysLate, 0) >= Math.max(b.min, 0) && daysLate <= b.max) || buckets[0];
    const c = db.clients.find(c => c.id === i.clientId);
    const tot = invoiceUsd(db, i), bal = invBalance(db, i, addDays(ref, 1)); if (!(bal > 0.004)) return; // v10: saldo pendiente (descuenta abonos)
    b.items.push({ ...i, clientName: c.name, usd: bal, total: tot, abonado: round2(tot - bal), daysLate, status: invoiceStatus(i, addDays(ref, 1)) });
  });
  buckets.forEach(b => { b.total = sum(b.items, x => x.usd); b.items.sort((a, z) => z.daysLate - a.daysLate); });
  return buckets;
}

const INVEST_CATS = { PRODUCT_DEV: 'Desarrollo de producto', MARKETING: 'Campañas y adquisición', EQUIPMENT: 'Equipos e infraestructura', TRAINING: 'Capacitación', OTHER: 'Otra' };
// Inversión: desembolsos para hacer crecer el negocio. No son gasto operativo, así que no restan del EBITDA.
// Retorno de la inversión (ROI) acumulado = (EBITDA acumulado − inversión acumulada) / inversión acumulada.
function investmentSummary(db, inv, p, cache) {
  const periods = ALL_PERIODS.filter(q => q <= p);
  const series = periods.map(q => {
    const m = cache && cache[q] !== undefined ? cache[q] : periodMetrics(db, q);
    const i = sum(inv.filter(x => x.date.slice(0, 7) === q), x => toUsd(db, x.amount, x.currency, x.date));
    return { p: q, invest: i, ebitda: m ? m.ebitda : 0 };
  });
  const invMonth = series.length ? series[series.length - 1].invest : 0;
  const invAcc = sum(series, x => x.invest), ebitdaAcc = sum(series, x => x.ebitda);
  const last3 = series.slice(-3).map(x => x.ebitda);
  const avg3 = last3.length ? sum(last3) / last3.length : null;
  const roi = invAcc ? (ebitdaAcc - invAcc) / invAcc * 100 : null;
  const recovered = invAcc > 0 && ebitdaAcc >= invAcc;
  const investPayback = !invAcc ? null : recovered ? 0 : (avg3 > 0 ? (invAcc - ebitdaAcc) / avg3 : null);
  const byCat = Object.keys(INVEST_CATS).map(k => ({ cat: k, total: sum(inv.filter(x => x.category === k && x.date.slice(0, 7) <= p), x => toUsd(db, x.amount, x.currency, x.date)) }));
  return { series, invMonth, invAcc, ebitdaAcc, roi, recovered, investPayback, byCat };
}

if (typeof module !== 'undefined') module.exports = { collectedIn, invBalance, DEFAULT_STAFF, EXPENSE_CATS, TODAY, PRODUCTS, matchProduct, revenueLines, productRevenue, SEED_INVESTMENTS, investmentSummary, pauseDays, SEED_CLIENTS, buildDb, periodMetrics, kpiSet, clientMatrix, arAging, statusOf, DEFAULT_BENCHMARKS, UI_PERIODS, div };

/* ====================== LOGOS ORIGINALES DE ÁGORA (vectorizados) ====================== */
const ISO_D = "M839.0 1412.9C806.6 1411.0 767.3 1403.2 735.5 1392.5C656.8 1366.1 589.6 1318.7 537.4 1252.9C517.2 1227.4 490.2 1181.4 481.5 1157.5C480.5 1154.8 479.4 1152.0 479.0 1151.5C477.1 1148.7 467.6 1120.3 463.5 1105.5C462.6 1102.2 461.5 1098.2 461.0 1096.5C459.0 1089.3 454.4 1064.8 452.9 1053.5C452.3 1048.5 451.3 1041.6 450.8 1038.0C449.3 1028.0 448.5 830.1 450.0 811.0C451.1 794.9 453.3 776.1 455.0 767.5C457.1 756.4 459.4 746.0 461.7 737.0C463.1 731.8 464.5 725.9 464.9 724.0C465.9 719.8 474.8 693.7 477.9 686.2C479.0 683.4 481.0 678.6 482.1 675.8C489.0 658.7 511.3 617.7 519.1 607.9C520.7 605.9 522.0 604.0 522.0 603.7C522.0 603.4 524.5 599.7 527.5 595.4C559.6 550.8 603.0 510.6 650.2 482.1C663.1 474.3 694.4 457.9 700.8 455.6C705.2 454.0 722.6 447.2 725.5 445.9C731.2 443.4 763.4 433.9 772.2 432.1C774.6 431.6 781.0 430.3 786.5 429.2C812.7 423.8 836.1 421.6 867.0 421.6C892.6 421.5 913.7 422.7 927.7 425.1C944.0 427.8 956.8 430.1 960.0 431.0C961.9 431.5 967.5 432.9 972.5 434.1C991.5 438.7 1019.7 448.2 1033.5 454.5C1035.2 455.3 1039.0 457.0 1042.0 458.3C1053.8 463.5 1058.0 465.6 1072.0 473.3C1131.5 506.0 1183.7 554.4 1220.1 610.5C1234.5 632.6 1239.0 640.9 1251.3 667.1C1258.0 681.4 1269.0 711.0 1271.9 722.5C1272.5 724.7 1273.6 729.2 1274.5 732.5C1278.0 745.3 1282.4 767.1 1284.4 782.0C1287.7 806.4 1288.1 819.6 1288.0 917.5C1287.9 1028.1 1287.5 1038.0 1281.0 1074.9C1277.1 1097.4 1265.4 1136.0 1256.9 1154.8C1255.3 1158.3 1254.0 1161.4 1254.0 1161.6C1254.0 1162.5 1249.9 1171.3 1243.8 1183.5C1217.4 1236.4 1179.0 1283.8 1131.8 1321.9C1124.0 1328.1 1105.3 1341.8 1100.8 1344.5C1099.9 1345.0 1093.0 1349.3 1085.5 1353.9C1074.3 1360.7 1043.4 1377.0 1041.6 1377.0C1041.4 1377.0 1038.3 1378.3 1034.8 1379.9C1027.7 1383.1 1012.3 1389.2 1007.0 1390.9C1005.1 1391.5 1000.1 1393.1 996.0 1394.4C948.8 1409.8 893.9 1416.2 839.0 1412.9ZM916.0 1336.1C964.0 1328.4 997.2 1317.4 1035.4 1296.5C1104.9 1258.7 1161.2 1194.8 1190.3 1120.8C1198.3 1100.7 1201.0 1091.9 1205.9 1070.0C1214.2 1032.8 1214.5 1026.8 1214.5 917.5C1214.5 827.4 1213.9 805.2 1211.0 791.0C1210.5 788.5 1209.3 782.2 1208.4 777.0C1205.5 760.5 1197.4 730.6 1193.0 720.5C1192.5 719.4 1189.6 712.5 1186.5 705.1C1167.6 659.9 1136.0 616.5 1096.7 581.5C1064.0 552.4 1018.6 526.5 975.5 512.6C956.4 506.4 945.7 503.9 923.5 500.1C887.3 494.0 838.5 494.8 802.0 502.2C755.0 511.6 710.4 530.4 672.5 556.8C639.4 579.8 605.5 613.7 583.5 645.6C560.0 679.8 541.5 721.6 532.1 761.5C528.9 775.4 528.1 779.3 526.9 787.5C526.3 791.9 525.4 798.6 524.8 802.5C523.3 813.3 522.6 995.6 524.0 1017.5C526.3 1053.8 532.8 1083.7 545.7 1117.5C549.9 1128.5 549.5 1127.7 557.1 1143.5C583.3 1198.7 627.5 1249.1 679.1 1282.6C696.7 1294.1 715.5 1304.2 731.5 1311.0C737.0 1313.3 742.4 1315.6 743.5 1316.1C762.4 1324.3 800.9 1333.8 828.0 1337.0C843.1 1338.7 845.0 1338.8 875.0 1338.5C897.6 1338.2 906.1 1337.7 916.0 1336.1ZM831.7 1259.3C831.3 1259.0 831.0 1220.0 831.0 1172.8C831.0 1096.9 830.8 1087.0 829.5 1087.0C828.0 1087.0 813.9 1100.9 738.8 1175.8L706.0 1208.5L680.0 1182.5C665.7 1168.2 654.0 1156.1 654.0 1155.5C654.0 1154.9 681.2 1127.2 714.5 1094.0C749.1 1059.5 774.8 1033.0 774.6 1032.3C774.2 1031.3 756.5 1031.0 687.8 1030.8L601.5 1030.5L601.5 993.5L601.5 956.5L868.8 956.2L1136.0 956.0L1136.0 993.5L1136.0 1031.0L1049.5 1031.0C967.1 1031.0 963.0 1031.1 963.0 1032.8C963.0 1033.8 988.5 1059.9 1023.5 1094.7C1056.8 1127.8 1084.0 1155.3 1084.0 1155.7C1084.0 1156.7 1032.3 1208.0 1031.2 1208.0C1030.8 1208.0 1003.3 1180.8 970.0 1147.5C936.2 1113.7 908.7 1087.0 907.8 1087.0C906.1 1087.0 906.0 1091.9 905.8 1173.2L905.5 1259.5L868.9 1259.8C848.8 1259.9 832.1 1259.7 831.7 1259.3ZM601.2 840.8L601.5 803.5L687.0 803.3C734.0 803.1 773.1 803.0 773.8 803.0C774.4 803.0 775.0 802.4 775.0 801.6C775.0 800.9 747.8 773.1 714.5 739.9C681.2 706.7 654.0 679.1 654.0 678.5C654.0 678.0 665.7 665.8 680.0 651.5L706.0 625.5L713.2 632.7C799.1 718.0 829.5 747.8 830.2 747.4C830.6 747.1 831.0 708.1 831.0 660.7C831.1 600.0 831.4 575.0 832.1 576.3C832.9 577.7 833.5 577.9 834.6 576.9C835.3 576.3 835.7 575.4 835.4 574.9C835.1 574.3 849.4 574.1 870.2 574.2L905.5 574.5L905.8 660.5C905.9 716.6 906.4 746.8 907.0 747.4C907.7 748.1 928.1 728.4 969.4 687.1L1030.8 625.7L1033.9 628.3C1039.1 632.6 1083.0 676.4 1083.0 677.2C1083.0 677.6 1082.3 677.7 1081.5 677.4C1080.5 677.0 1080.0 677.4 1080.0 678.5C1080.0 679.6 1080.5 680.0 1081.5 679.6C1082.3 679.3 1083.0 679.2 1083.0 679.3C1083.0 679.5 1056.0 706.6 1023.0 739.5C988.8 773.7 963.0 800.2 963.0 801.2C963.0 802.2 963.6 803.0 964.2 803.0C964.9 803.0 1003.8 803.1 1050.5 803.3L1135.5 803.5L1135.7 839.5C1135.8 859.3 1135.6 874.9 1135.3 874.2C1134.7 872.6 1133.0 873.6 1133.0 875.7C1133.0 876.7 1133.6 877.0 1134.6 876.6C1135.4 876.3 1135.8 876.4 1135.5 877.0C1135.1 877.7 1042.8 878.0 867.9 878.0L601.0 878.0L601.2 840.8Z";
const WORD_D = "M1801.0 1271.6L1801.0 1243.1L1864.8 1242.8L1928.5 1242.5L1932.9 1240.0C1941.6 1235.2 1941.5 1235.8 1941.8 1192.1C1942.1 1150.4 1942.1 1149.8 1936.9 1159.5C1934.0 1165.0 1927.1 1171.5 1921.3 1174.4C1919.2 1175.4 1916.8 1176.6 1915.9 1177.0C1915.0 1177.5 1911.2 1178.7 1907.4 1179.7C1901.5 1181.2 1896.6 1181.5 1875.0 1181.5C1858.4 1181.4 1846.9 1181.0 1842.0 1180.1C1812.4 1174.9 1796.6 1160.6 1789.3 1132.5C1787.6 1125.9 1787.5 1117.8 1787.5 992.5L1787.5 859.5L1789.8 851.0C1795.0 832.0 1804.4 819.5 1819.3 812.2C1833.7 805.0 1843.1 803.7 1878.3 804.3C1905.6 804.7 1906.7 804.7 1913.4 807.2C1925.2 811.7 1934.0 819.1 1937.6 827.5C1938.4 829.4 1939.7 831.0 1940.5 831.0C1941.7 831.0 1942.0 828.6 1942.2 817.8L1942.5 804.5L1979.0 804.5L2015.5 804.5L2015.5 1021.5C2015.5 1203.1 2015.3 1239.8 2014.1 1246.5C2009.4 1273.3 1995.9 1288.7 1970.0 1296.8C1961.4 1299.5 1947.1 1300.0 1875.3 1300.0L1801.0 1300.0L1801.0 1271.6ZM1444.0 1185.5C1443.5 1185.0 1443.6 1182.5 1444.1 1180.0C1444.6 1177.5 1445.4 1172.8 1445.9 1169.5C1446.4 1166.2 1447.2 1161.0 1447.8 1158.0C1448.9 1152.4 1451.4 1138.4 1452.5 1132.0C1452.8 1130.1 1454.0 1123.3 1455.1 1117.0C1456.2 1110.7 1457.8 1101.9 1458.5 1097.5C1460.2 1087.6 1462.4 1075.3 1464.5 1063.5C1467.9 1044.9 1469.2 1037.3 1470.0 1031.1C1470.5 1027.6 1471.2 1024.0 1471.5 1023.1C1471.7 1022.2 1473.3 1013.6 1475.0 1004.0C1476.6 994.4 1478.6 982.7 1479.5 978.0C1481.5 967.1 1483.9 953.1 1485.1 945.5C1485.6 942.2 1486.4 937.5 1487.0 935.0C1488.2 928.9 1492.5 905.0 1498.5 869.5C1499.4 864.5 1500.7 856.9 1501.5 852.5C1505.0 833.1 1507.8 816.9 1509.0 809.0C1509.6 805.4 1510.3 801.8 1510.6 800.8C1510.8 799.9 1511.7 795.2 1512.5 790.3C1513.2 785.5 1515.0 775.0 1516.5 767.0C1520.9 742.2 1523.1 729.7 1524.1 723.0C1524.6 719.4 1525.3 715.9 1525.5 715.1C1525.8 714.4 1526.7 709.6 1527.5 704.6C1528.3 699.6 1529.6 691.9 1530.4 687.5C1533.4 671.0 1535.1 661.3 1535.9 656.3C1536.3 653.4 1536.9 650.8 1537.1 650.5C1537.4 650.3 1562.1 650.0 1592.0 650.0C1640.0 649.9 1646.4 650.0 1647.2 651.4C1647.7 652.3 1649.2 658.9 1650.5 666.2C1651.9 673.5 1653.7 682.9 1654.5 687.0C1655.3 691.1 1657.3 701.9 1659.0 711.0C1660.6 720.1 1662.6 730.6 1663.4 734.5C1664.2 738.4 1666.2 749.1 1668.0 758.5C1669.7 767.9 1671.7 778.6 1672.5 782.5C1673.2 786.4 1674.6 793.5 1675.5 798.5C1676.4 803.5 1677.7 810.6 1678.5 814.5C1679.2 818.4 1680.6 825.5 1681.5 830.5C1682.4 835.5 1683.8 842.6 1684.5 846.5C1685.2 850.4 1686.6 857.5 1687.5 862.5C1688.4 867.5 1689.8 874.6 1690.5 878.5C1691.2 882.4 1692.6 889.5 1693.5 894.5C1694.4 899.5 1695.8 906.6 1696.5 910.5C1697.3 914.4 1699.3 924.9 1700.9 934.0C1702.6 943.1 1704.7 953.9 1705.4 958.0C1706.2 962.1 1707.6 969.5 1708.5 974.5C1709.4 979.5 1710.8 986.6 1711.5 990.5C1712.3 994.4 1713.6 1001.5 1714.5 1006.5C1715.4 1011.5 1716.8 1018.6 1717.5 1022.5C1718.3 1026.3 1719.6 1033.5 1720.5 1038.5C1721.4 1043.5 1722.6 1049.5 1723.2 1052.0C1723.7 1054.5 1724.6 1058.8 1725.0 1061.5C1726.0 1067.9 1730.5 1092.4 1732.4 1101.5C1734.0 1109.1 1736.0 1120.2 1738.6 1134.5C1739.4 1139.5 1740.8 1146.4 1741.5 1150.0C1742.3 1153.6 1743.6 1160.5 1744.5 1165.5C1745.4 1170.5 1746.6 1176.9 1747.2 1179.8C1747.8 1182.6 1748.1 1185.3 1747.8 1185.6C1747.5 1185.9 1730.5 1186.1 1710.0 1186.1C1669.5 1186.2 1671.1 1186.4 1671.0 1180.5C1671.0 1178.8 1670.5 1175.6 1670.0 1173.3C1669.4 1170.9 1668.6 1166.2 1668.0 1162.8C1667.5 1159.3 1666.4 1152.2 1665.5 1147.0C1664.6 1141.8 1663.3 1133.7 1662.5 1129.0C1661.8 1124.3 1660.9 1119.8 1660.6 1119.0C1660.3 1118.2 1659.6 1114.1 1659.0 1110.0C1658.5 1105.9 1657.1 1097.5 1656.0 1091.5C1654.9 1085.5 1653.5 1077.1 1652.9 1073.0C1651.1 1060.7 1658.1 1062.0 1593.9 1062.0C1550.0 1062.0 1537.8 1062.3 1537.5 1063.2C1537.2 1063.9 1536.3 1069.5 1535.5 1075.5C1534.6 1081.5 1533.2 1090.8 1532.4 1096.0C1531.6 1101.2 1530.7 1107.1 1530.4 1109.0C1529.9 1112.5 1528.2 1123.3 1525.5 1140.5C1524.7 1145.5 1523.4 1153.8 1522.6 1159.0C1519.2 1181.0 1518.7 1183.8 1518.1 1184.9C1517.1 1186.4 1445.2 1187.0 1444.0 1185.5ZM2399.9 1185.8C2398.0 1185.1 2398.0 1182.4 2398.2 994.8L2398.5 804.5L2435.0 804.5L2471.5 804.5L2472.0 826.3C2472.3 838.7 2472.9 848.1 2473.5 848.3C2474.0 848.4 2475.1 846.5 2476.0 844.0C2480.1 832.5 2492.0 818.3 2503.1 811.7C2513.7 805.4 2521.0 803.7 2537.9 803.6L2552.5 803.5L2552.8 834.8C2552.9 851.9 2552.7 866.0 2552.3 866.0C2508.0 866.7 2512.3 866.3 2502.7 870.0C2491.3 874.3 2483.5 881.5 2478.5 892.4C2471.7 907.3 2472.0 899.4 2472.0 1049.4C2472.0 1135.8 2471.6 1185.1 2471.0 1185.5C2469.6 1186.4 2402.2 1186.6 2399.9 1185.8ZM2667.0 1186.0C2642.2 1185.3 2641.3 1185.2 2632.5 1182.2C2627.6 1180.5 2621.5 1178.0 2619.0 1176.6C2608.8 1170.9 2598.7 1158.3 2594.6 1145.9C2590.0 1132.3 2590.0 1133.2 2590.0 995.5C2590.0 861.5 2590.1 858.6 2594.0 846.5C2598.9 830.9 2609.4 818.3 2622.4 812.0C2637.2 805.0 2640.4 804.5 2676.0 804.5C2710.0 804.5 2711.3 804.7 2722.5 810.1C2729.9 813.7 2736.2 819.6 2740.2 826.7C2741.9 829.7 2743.6 831.8 2744.1 831.3C2744.6 830.8 2745.1 824.6 2745.2 817.5L2745.5 804.5L2782.0 804.5L2818.5 804.5L2818.7 994.0C2818.9 1098.2 2818.6 1184.1 2818.1 1184.8C2817.5 1185.8 2809.8 1186.1 2782.1 1186.1C2762.8 1186.1 2746.5 1185.8 2746.0 1185.5C2745.4 1185.1 2745.0 1179.3 2745.0 1172.0C2745.0 1164.8 2744.6 1158.9 2744.0 1158.5C2743.5 1158.2 2741.9 1160.2 2740.5 1163.0C2734.3 1175.2 2721.1 1183.2 2703.2 1185.6C2697.3 1186.3 2692.5 1186.9 2692.5 1186.8C2692.5 1186.7 2681.0 1186.3 2667.0 1186.0ZM2142.5 1185.0C2116.6 1181.7 2098.7 1168.1 2091.0 1145.5C2086.2 1131.4 2086.0 1125.0 2086.0 995.5C2086.0 852.5 2085.9 853.7 2095.3 835.0C2102.3 820.9 2115.0 811.7 2134.8 806.2C2143.6 803.8 2259.5 803.2 2272.5 805.5C2294.3 809.3 2310.1 819.6 2317.7 835.0C2327.0 853.9 2327.0 853.8 2327.0 996.0C2326.9 1123.7 2326.7 1131.1 2322.0 1145.0C2314.1 1168.5 2296.8 1181.7 2269.5 1184.9C2259.3 1186.1 2152.1 1186.2 2142.5 1185.0ZM2245.7 1125.7C2254.2 1120.3 2253.5 1131.9 2253.5 995.0L2253.5 873.5L2251.1 869.3C2249.8 867.0 2248.0 864.8 2247.1 864.4C2240.4 861.7 2233.1 861.1 2205.9 861.0C2170.3 861.0 2165.8 861.9 2161.1 870.5C2159.6 873.2 2159.5 884.0 2159.5 995.0L2159.5 1116.5L2161.8 1120.3C2164.7 1124.9 2168.9 1127.2 2176.0 1128.1C2179.0 1128.5 2195.0 1128.7 2211.5 1128.6L2241.5 1128.4L2245.7 1125.7ZM2728.9 1125.4C2736.1 1123.3 2741.2 1118.5 2743.3 1111.7C2744.9 1106.8 2745.0 1097.1 2745.0 994.8C2745.0 873.5 2745.2 878.9 2739.5 871.4C2738.2 869.7 2734.9 867.1 2732.3 865.9C2727.6 863.6 2726.8 863.5 2701.5 863.5C2677.1 863.5 2675.3 863.6 2672.0 865.6C2666.3 868.9 2664.3 872.9 2663.5 882.3C2663.2 886.8 2663.0 940.7 2663.2 1002.0L2663.5 1113.5L2665.7 1117.6C2670.1 1125.9 2673.7 1126.8 2701.6 1126.9C2718.8 1127.0 2724.8 1126.7 2728.9 1125.4ZM1926.6 1120.4C1932.5 1118.0 1936.8 1114.3 1939.3 1109.7L1941.5 1105.5L1941.5 992.5L1941.5 879.5L1939.2 875.4C1936.4 870.4 1933.7 867.8 1928.5 865.4C1924.9 863.7 1921.8 863.5 1898.3 863.5L1872.2 863.5L1867.9 866.5C1864.6 868.9 1863.3 870.7 1861.8 875.0C1860.1 880.2 1860.0 885.7 1860.2 994.0L1860.5 1107.5L1863.0 1112.5C1864.9 1116.4 1866.5 1118.0 1870.0 1119.7C1874.3 1121.8 1875.8 1121.9 1898.6 1122.0C1918.5 1122.0 1923.4 1121.7 1926.6 1120.4ZM1639.4 999.1C1640.0 998.3 1637.5 979.5 1636.5 976.8C1636.2 976.1 1635.6 972.6 1635.0 969.0C1634.5 965.4 1633.4 958.2 1632.5 953.0C1631.6 947.8 1630.3 939.7 1629.5 935.0C1628.7 930.3 1627.1 921.1 1626.0 914.5C1624.8 907.9 1623.0 897.1 1621.9 890.5C1618.9 871.7 1617.0 860.9 1616.0 856.0C1615.5 853.5 1614.8 849.7 1614.5 847.5C1613.8 843.0 1611.6 829.4 1609.5 817.5C1608.7 813.1 1607.4 805.0 1606.5 799.5C1605.7 794.0 1604.5 787.5 1604.0 785.0C1603.4 782.5 1602.6 777.6 1602.0 774.0C1601.5 770.4 1600.4 763.7 1599.6 759.0C1598.8 754.3 1597.2 744.6 1596.0 737.5C1592.9 718.4 1590.8 715.1 1589.5 727.2C1589.2 730.7 1588.5 735.8 1588.0 738.5C1587.5 741.2 1586.3 748.2 1585.5 754.0C1584.6 759.8 1583.4 767.2 1582.9 770.5C1580.9 782.6 1578.9 795.7 1578.0 802.5C1577.5 806.4 1576.6 812.2 1576.0 815.5C1575.5 818.8 1574.4 825.9 1573.5 831.2C1572.7 836.6 1571.3 845.2 1570.5 850.2C1569.7 855.3 1568.5 862.6 1568.0 866.5C1567.4 870.4 1566.3 877.5 1565.4 882.5C1564.6 887.5 1563.5 895.1 1563.0 899.5C1562.4 903.9 1561.5 909.5 1561.0 912.0C1560.5 914.5 1559.4 921.5 1558.5 927.5C1557.6 933.5 1556.3 942.3 1555.5 947.0C1554.7 951.7 1553.4 960.2 1552.5 966.0C1551.7 971.8 1550.2 981.0 1549.3 986.6C1548.4 992.1 1547.9 997.4 1548.3 998.3C1548.9 999.9 1552.8 1000.0 1593.9 1000.0C1619.1 1000.0 1639.1 999.6 1639.4 999.1ZM1561.7 608.3C1561.4 607.8 1564.1 603.0 1567.5 597.5C1571.0 592.0 1577.7 581.2 1582.5 573.5C1587.2 565.8 1595.8 551.9 1601.7 542.5C1607.5 533.1 1616.0 519.3 1620.7 511.8L1629.1 498.0L1671.2 498.0C1694.3 498.0 1713.0 498.4 1712.8 498.8C1712.4 499.7 1706.3 507.5 1660.0 565.4L1625.4 608.5L1593.8 608.8C1576.4 608.9 1561.9 608.7 1561.7 608.3Z";
const LOGO_ISO = (cls = '', fill = 'currentColor') => `<svg class="${cls}" viewBox="443 415 851 1004" aria-hidden="true" focusable="false"><path fill="${fill}" fill-rule="evenodd" d="${ISO_D}"/></svg>`;
const LOGO_H = (cls = '', isoFill = '#AD103C', wordFill = 'currentColor', label = 'Ágora') => `<svg class="${cls}" viewBox="443 415 2381 1004" role="img" aria-label="${esc(label)}"><path fill="${isoFill}" fill-rule="evenodd" d="${ISO_D}"/><path fill="${wordFill}" fill-rule="evenodd" d="${WORD_D}"/></svg>`;

/* ====================== FORMATO ====================== */
const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const periodLabel = p => { const [y, m] = p.split('-'); const s = MONTHS[+m - 1]; return s[0].toUpperCase() + s.slice(1) + ' ' + y; };
const group = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const num = (n, d = 0) => { if (n == null) return 'N/D'; const neg = n < 0; const [i, f] = Math.abs(n).toFixed(d).split('.'); return (neg ? '−' : '') + group(i) + (f ? ',' + f : ''); };
const money = (n, d = 0) => n == null ? 'N/D' : (n < 0 ? '−' : '') + 'US$ ' + num(Math.abs(n), d);
const pct = (n, d = 1) => n == null ? 'N/D' : num(n, d) + '%';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = s => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${+d} ${MONTHS[+m - 1].slice(0, 3)} ${y}`; };
const ND_TEXT = 'Todavía no hay datos suficientes para calcular esto.';
// v10: montos en bolívares y tasas (Bs por US$)
const moneyBs = (n, d = 2) => n == null ? 'N/D' : (n < 0 ? '−' : '') + 'Bs ' + num(Math.abs(n), d);
const fmtRate = n => n == null || !(n > 0) ? '—' : num(n, n >= 100 ? 2 : 4) + ' Bs/US$';
const fmtBytes = b => b >= 1048576 ? num(b / 1048576, 1) + ' MB' : num(Math.max(1, Math.round(b / 1024))) + ' KB';

/* ====================== ESTADO ====================== */
// v10.1: si el navegador no puede escribir (almacenamiento lleno o bloqueado) se avisa. Antes fallaba en
// silencio: el cambio se veía en pantalla pero se perdía al recargar.
let storeFailAt = 0;
function storeFail(k, e) {
  try { console.warn('No se pudo guardar', k, e && e.name); } catch (x) {}
  const now = Date.now(); if (now - storeFailAt < 4000) return; storeFailAt = now;
  const full = e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
  const msg = full ? 'No se pudo guardar: el almacenamiento de este navegador está lleno. Descarga un respaldo (Ajustes → Datos y seguridad) antes de seguir.' : 'No se pudo guardar el cambio en este navegador. Descarga un respaldo antes de seguir.';
  try { if (typeof toast === 'function') toast(msg, 'bad'); } catch (x) {}
}
const store = {
  get(k, def) { try { const v = localStorage.getItem('agora_fin_' + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem('agora_fin_' + k, JSON.stringify(v)); return true; } catch (e) { storeFail(k, e); return false; } },
  del(k) { try { localStorage.removeItem('agora_fin_' + k); } catch (e) {} },
};
// v10.1: registro de auditoría (últimas 5.000 acciones) y eslabón que queda al recortar
const AUDIT_MAX = 5000;
let auditAnchor = store.get('audit_anchor_v1', '');
// v10.1: espacio que ocupan los datos en este navegador (localStorage guarda texto en UTF-16: 2 bytes por carácter)
const LS_LIMIT = 5 * 1024 * 1024; // límite conservador (Safari y Firefox ≈ 5 MB; Chrome y Edge ≈ 10 MB)
function storageUsage() {
  let chars = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); chars += k.length + (localStorage.getItem(k) || '').length; } } catch (e) {}
  const bytes = chars * 2; return { bytes, pct: Math.min(100, bytes / LS_LIMIT * 100) };
}
const DEFAULT_ACTIONS = [
  { id: 'a1', title: 'Auditoría de consumo de IA por plan', horizon: 'D15', status: 'IN_PROGRESS', ownerId: 'm4', dueDate: '2026-10-15' },
  { id: 'a2', title: 'Cobro automático con Stripe', horizon: 'D30', status: 'PENDING', ownerId: 'dir', dueDate: '2026-10-31' },
  { id: 'a3', title: 'Campaña para subir de plan (upgrade) a los clientes "Listo para subir de plan"', horizon: 'D60', status: 'PENDING', ownerId: 'm1', dueDate: '2026-11-30' },
  { id: 'a4', title: 'Revisiones trimestrales de negocio (QBR) con los clientes Oro y Diamante para ampliar servicios', horizon: 'D90', status: 'PENDING', ownerId: 'dir', dueDate: '2026-12-31' },
];
const clone = o => JSON.parse(JSON.stringify(o));
const FACT_CLI_KEY = 'agora-clientes-v1';
const lsRaw = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const newClientId = () => 'k' + String(Math.max(0, ...clientDefs.map(x => /^k\d+$/.test(x.id) ? parseInt(x.id.slice(1), 10) : 0)) + 1).padStart(3, '0');
const defFromFactura = fc => ({ id: null, name: fc.nombre, sector: 'Sin sector', channel: 'OTHER', cac: 0, health: 7, seats: 1, segs: [], services: [], sales: [], pauses: [], opt: { cliCode: fc.code, ...(fc.rif && fc.rif !== '—' ? { rif: fc.rif } : {}), ...(fc.dir && fc.dir !== '—' ? { dir: fc.dir } : {}), ...(fc.email && fc.email !== '—' ? { email: fc.email } : {}), ...(fc.tel && fc.tel !== '—' ? { tel: fc.tel } : {}) } });
let clientDefs = store.get('clients_v2', null);
const FRESH_BASE = !clientDefs;
if (!clientDefs) clientDefs = [];
clientDefs.forEach(c => { ['pauses', 'services', 'sales', 'segs'].forEach(k => { if (!Array.isArray(c[k])) c[k] = []; }); });
// Clientes eliminados a propósito: el facturero no los vuelve a crear
let deletedCli = store.get('deleted_cli_v1', []);
function isDeletedCli(code, name) { return deletedCli.some(d => (code && d.code && d.code === code) || (name && normTxt(d.name) === normTxt(name))); }
// Clientes reales: se toman del facturero (sus clientes registrados) y se mantienen sincronizados
function syncClientsFromFacturero() {
  const list = lsRaw(FACT_CLI_KEY, []); let added = 0;
  list.forEach(fc => {
    if (!fc || !fc.nombre) return;
    if (isDeletedCli(fc.code, fc.nombre)) return;
    let c = clientDefs.find(x => (x.opt && x.opt.cliCode === fc.code) || normTxt(x.name) === normTxt(fc.nombre));
    if (!c) { c = defFromFactura(fc); c.id = newClientId(); clientDefs.push(c); added++; }
    else { c.opt = { ...(c.opt || {}), cliCode: fc.code }; ['rif', 'dir', 'email', 'tel'].forEach(k => { if (fc[k] && fc[k] !== '—' && !c.opt[k]) c.opt[k] = fc[k]; }); }
  });
  return added;
}
if (FRESH_BASE) { store.set('decisions', {}); store.set('payments', {}); store.set('imported_v1', []); store.set('fact_sig', ''); store.set('paused', {}); }
syncClientsFromFacturero(); store.set('clients_v2', clientDefs);
let decisions = store.get('decisions', {}), payments = store.get('payments', {});
// v10: pagos reales de las facturas (uno o varios por factura: abonos), tasas del día y comisiones de las pasarelas
let pagos = store.get('pagos_v1', []);   // { id, invId, date, method, currency, amount, usd, fee, net, rateType, rate, rateBcv, bsChannel, bank, binType, payer, ref, note, settle, excess, user, at }
let tasas = store.get('tasas_v1', {});   // 'AAAA-MM-DD' → { BCV, BINANCE, PAYPAL, ZELLE, EFECTIVO }
let payFees = Object.assign({ PAYPAL: { pct: 5.4, fixed: 0.3 }, BINANCE: { pct: 0, fixed: 0 }, ZELLE: { pct: 0, fixed: 0 }, CASH: { pct: 0, fixed: 0 }, VES: { pct: 0, fixed: 0 } }, store.get('payfees_v1', {}));
const savePagos = () => { store.set('pagos_v1', pagos); };
let importedInv = store.get('imported_v1', []);
let catalog = store.get('catalog_v1', null) || clone(PRODUCTS);
PRODUCTS.forEach(p => { if (!catalog.some(x => x.id === p.id)) catalog.push(clone(p)); });
let expenseEntries = store.get('expenses_v2', []); // gastos reales, registrados a mano
let customCats = store.get('custom_cats_v1', []);
const DEFAULT_BUDGETS = { PAYROLL: 1250, TOOLS: 90, INFRA: 60, MARKETING: 210, PROFESSIONAL: 25, OFFICE: 15, BANK: 10, OTHER: 20, COMMISSIONS: 120, AFFILIATE_PAYOUTS: 25, TAXES: 45, DEPRECIATION: 30, API_USAGE: 230 };
let budgets = store.get('budgets_v2', {});
let budgetOverrides = store.get('budget_over_v1', {});
let goals = store.get('goals_v1', null) || { default: 2600, byPeriod: {} };

/* Migración a las categorías de la Matriz económica */
(function migrateCats() {
  if (store.get('cats_v3', false)) return;
  const MG = { PAYROLL: 'nomina', TOOLS: 'software', INFRA: 'infra', PROFESSIONAL: 'profesionales', OFFICE: 'internet', BANK: 'bancarias', TAXES: 'impuestos', DEPRECIATION: 'otros', OTHER: 'otros', API_USAGE: 'ia' };
  const MV = { MARKETING: 'publicidad', COMMISSIONS: 'comisiones', AFFILIATE_PAYOUTS: 'comisiones' };
  const MI = { PRODUCT_DEV: 'producto', MARKETING: 'publicidad', EQUIPMENT: 'equipos', TRAINING: 'formacion', OTHER: 'producto' };
  const inv = store.get('investments_v2', []);
  inv.forEach(x => { if (MI[x.category]) x.category = MI[x.category]; });
  expenseEntries = (expenseEntries || []).filter(e => {
    if (MV[e.category]) { inv.push({ id: 'iv-m-' + e.id, date: e.date || e.period + '-28', concept: e.concept || 'Gasto movido a inversión', category: MV[e.category], amount: e.amount, currency: e.currency || 'USD' }); return false; }
    if (MG[e.category]) e.category = MG[e.category]; return true;
  });
  const nb = {}; Object.entries(budgets || {}).forEach(([k, v]) => { const nk = MG[k] || k; nb[nk] = (nb[nk] || 0) + (+v || 0); }); budgets = nb;
  store.set('expenses_v2', expenseEntries); store.set('investments_v2', inv); store.set('budgets_v2', budgets); store.set('cats_v3', true);
})();let staffState = store.get('staff_v1', null);
let cashOver = store.get('cash_v1', {});
let rateOver = store.get('rates_v1', {});
let ivaRate = store.get('iva_v1', 16);
// Próximos meses: los gastos recurrentes que todavía no llegan se proyectan (no se guardan, se recalculan siempre)
function projectedRecurring() {
  try {
    const out = [], fut = ALL_PERIODS.filter(isProj);
    recExp.forEach(r => {
      if (!r.active || !r.start) return;
      fut.forEach(q => {
        const date = dayOfP(q, r.day);
        if (date < r.start || (r.end && date > r.end) || (r.skips || []).includes(q)) return;
        if ((expenseEntries || []).some(e => e.id === `rec-${r.id}-${q}`)) return;
        out.push({ id: `proj-${r.id}-${q}`, date, period: q, category: r.category, concept: r.concept, amount: r.amount, currency: r.currency, source: 'proyectado', projected: true, recId: r.id, payerId: recPayerFor(r, date), payee: r.payee || '' });
      });
    });
    return out;
  } catch (e) { if (e instanceof ReferenceError) return []; throw e; }
}
// v10: la comisión que cobra la pasarela (PayPal, Binance…) en cada pago entra sola como gasto "Comisiones bancarias y de pasarelas"
function feeExpenses() {
  return (pagos || []).filter(pg => +pg.fee > 0.004 && pg.date && pg.date <= TODAY).map(pg => {
    const f = importedInv.find(x => x.id === pg.invId);
    return { id: `fee-${pg.id}`, date: pg.date, period: pg.date.slice(0, 7), category: 'bancarias', concept: `Comisión de ${PAY_LABEL(pg.method)} · factura ${f ? f.num : String(pg.invId).replace(/^FAC-/, '')}`, amount: round2(+pg.fee), currency: 'USD', source: 'auto-pago', payId: pg.id };
  });
}
const PAY_LABEL = m => ({ BINANCE: 'Binance', PAYPAL: 'PayPal', ZELLE: 'Zelle', CASH: 'efectivo', VES: 'bolívares' }[m] || 'la pasarela');
const baseExpenses = () => [...(expenseEntries || []), ...projectedRecurring(), ...feeExpenses()];
// v10.1: una sola fuente de tasas por mes. Manda la tasa mensual escrita a mano (rates_v1); si no hay, el promedio de las
// tasas del día registradas ese mes (Binance; si no hay, BCV). Las tasas del día (tasas_v1) se siguen usando tal cual al
// registrar pagos en bolívares.
function monthlyRates() {
  const acc = {};
  Object.entries(tasas || {}).forEach(([d, t]) => { if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return; const a = acc[d.slice(0, 7)] || (acc[d.slice(0, 7)] = { b: [], v: [] }); if (+t.BINANCE > 0) a.b.push(+t.BINANCE); if (+t.BCV > 0) a.v.push(+t.BCV); });
  const out = {}; Object.entries(acc).forEach(([p, a]) => { const arr = a.b.length ? a.b : a.v; if (arr.length) out[p] = round2(sum(arr) / arr.length); });
  Object.entries(rateOver || {}).forEach(([p, v]) => { if (+v > 0) out[p] = +v; });
  return out;
}
const dbOpts = () => ({ real: true, decisions, payments, imported: importedInv, catalog, expenses: baseExpenses(), staff: staffState || undefined, cash: cashOver, rates: monthlyRates(), ivaRate, pagos });
let db = buildDb(clientDefs, dbOpts());
function rebuild() { db = buildDb(clientDefs, dbOpts()); try { const auto = autoComExpenses(db); if (auto.length) db = buildDb(clientDefs, { ...dbOpts(), expenses: [...baseExpenses(), ...auto] }); } catch (e) { if (!(e instanceof ReferenceError)) console.warn(e); } }
function saveCatalog() { store.set('catalog_v1', catalog); try { if (importedInv.length) { rederiveFromInvoices(); store.set('imported_v1', importedInv); store.set('clients_v2', clientDefs); } } catch (e) { if (!(e instanceof ReferenceError)) console.warn(e); } rebuild(); }
const prodOf = id => catalog.find(p => p.id === id) || { id, short: id, name: id, recurring: false };
function saveClients() { store.set('clients_v2', clientDefs); rebuild(); }
function saveDecisions() { store.set('decisions', decisions); store.set('payments', payments); rebuild(); }
const storedBench = store.get('benchmarks', []);
const mergeBench = list => DEFAULT_BENCHMARKS.map(d => { const s = list.find(x => x.metricKey === d.metricKey); return s ? { ...d, green: s.green, yellow: s.yellow } : { ...d }; });
const state = {
  period: CUR_P, // siempre abre en el mes en curso
  module: (String(location.hash || '').replace(/^#\/?/, '').split('?')[0] || 'resumen'),
  role: store.get('role', 'SUPERADMIN'),
  theme: store.get('theme', 'auto'),   // v10: 'auto' (sigue al sistema), 'light' o 'dark'
  accent: store.get('accent', 'vino'), // v10: vino · azul · oro · apple · grafito
  nav: store.get('nav_v1', 'top'),       // v10: 'top' = menú arriba como siempre (predeterminado) · 'side' = barra lateral opcional
  demo: 'normal', loading: true,
  filters: { q: '', plan: '', health: 0, payment: '', flag: '' },
  sort: { key: 'plan', dir: 1 },
  bucket: 'b1',
  benchmarks: mergeBench(storedBench),
  actions: store.get('actions', DEFAULT_ACTIONS),
  audit: store.get('audit', []),
  investments: store.get('investments_v2', []),
  planOpen: false,
};
const ROLES = { SUPERADMIN: 'Superadministrador', DIRECCION: 'Dirección', ADMIN: 'Administración', VENTAS: 'Ventas', ...(SRV ? { CONTADOR: 'Contador (solo lectura)' } : {}) };
const canAccess = () => ['SUPERADMIN', 'DIRECCION', 'ADMIN', 'CONTADOR'].includes(state.role);
const canRemind = () => canAccess();
const canPause = () => ['SUPERADMIN', 'DIRECCION'].includes(state.role);
const canInvest = () => ['SUPERADMIN', 'DIRECCION'].includes(state.role);
const canEditClients = () => canAccess();
const canDeleteClients = () => state.role === 'SUPERADMIN';
const bench = key => state.benchmarks.find(b => b.metricKey === key);
const OWNERS = () => [{ id: 'dir', name: 'Dirección' }, ...(typeof asesores !== 'undefined' ? asesores : []).map(a => ({ id: a.id, name: a.nombre }))];
const ownerName = id => (OWNERS().find(o => o.id === id) || { name: '—' }).name;

/* ====================== ICONOS ====================== */
const I = {
  check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  warn: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.5v.01"/></svg>',
  alert: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M12 8v5M12 16.5v.01"/></svg>',
  up: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/></svg>',
  down: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5.5 12.5L12 19l6.5-6.5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  moon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  get mark() { return LOGO_ISO(); },
};
const STATUS = {
  green: { label: 'En meta', icon: I.check, cls: 'st-ok' },
  yellow: { label: 'Atención', icon: I.warn, cls: 'st-warn' },
  red: { label: 'Alerta', icon: I.alert, cls: 'st-bad' },
};
const statusPill = s => s ? `<span class="pill ${STATUS[s].cls}">${STATUS[s].icon}${STATUS[s].label}</span>` : '';
const FLAGS = {
  LOW_MARGIN_RISK: { label: 'Margen bajo', cls: 'st-bad' },
  AI_OVERRUN: { label: 'Exceso de IA', cls: 'st-warn' },
  IMPLEMENTATION_OVERRUN: { label: 'Exceso de implementaciones', cls: 'st-warn' },
  UPGRADE_READY: { label: 'Listo para subir de plan', cls: 'st-gold' },
  CONCENTRATION_RISK: { label: 'Concentración', cls: 'st-bad' },
};
const PAYMENT = { PAID: { label: 'Al día', cls: 'st-ok' }, PENDING: { label: 'Pendiente', cls: 'st-warn' }, OVERDUE: { label: 'Vencida', cls: 'st-bad' } };
const PLAN_COLOR = { BRONCE: 'var(--plan-bronce)', PLATA: 'var(--plan-plata)', ORO: 'var(--plan-oro)', DIAMANTE: 'var(--plan-diamante)', SERVICIOS: 'var(--line-serv)', SERV_REC: 'var(--line-serv)', NON_REC: 'var(--line-non)', null: 'var(--line-non)' };
const LINE_LABEL = { BRONCE: 'Plan Bronce', PLATA: 'Plan Plata', ORO: 'Plan Oro', DIAMANTE: 'Plan Diamante', SERVICIOS: 'Servicios recurrentes', SERV_REC: 'Servicios recurrentes', NON_REC: 'Servicios no recurrentes' };

/* ====================== ESTADOS DE WIDGET ====================== */
function wstate() { return state.loading ? 'loading' : state.demo; }
function skeleton(lines = 4, h = 18) { return `<div class="skel-wrap" aria-busy="true" aria-label="Cargando">${Array.from({ length: lines }, (_, i) => `<div class="skel" style="height:${h}px;width:${92 - (i % 3) * 14}%"></div>`).join('')}</div>`; }
function empty(text, cta) { return `<div class="state-box"><span class="state-mark">${I.mark}</span><p>${text}</p>${cta ? `<button class="btn btn-ghost" data-act="${esc(cta.act)}">${cta.label}</button>` : ''}</div>`; }
function errorBox() { return `<div class="state-box state-err" role="alert"><span class="state-mark">${I.mark}</span><p>No pudimos cargar estos datos. Intenta de nuevo en un momento.</p><button class="btn btn-ghost" data-act="retry">Reintentar</button></div>`; }
function widget(content, opts = {}) {
  const s = wstate();
  if (s === 'loading') return skeleton(opts.lines || 4, opts.h || 18);
  if (s === 'error') return errorBox();
  if (s === 'vacio') return empty(opts.emptyText || 'Aún no hay datos este mes. Registra el primero y el tablero hace el resto.');
  return content();
}
function healthBadge(h) { const c = h >= 8 ? 'st-ok' : h >= 5 ? 'st-warn' : 'st-bad'; return `<span class="hb ${c}" title="Salud del cliente: ${h} de 10">${h}</span>`; }
const HORIZONS = { D15: '15 días', D30: '30 días', D60: '60 días', D90: '90 días' };
const ASTATUS = { PENDING: 'Pendiente', IN_PROGRESS: 'En curso', DONE: 'Hecho' };
/* ====================== DATOS DERIVADOS (memo) ====================== */
const __pm = periodMetrics; let __pmDb = null; const __pmMemo = new Map();
periodMetrics = function (dbx, p) { if (dbx !== __pmDb) { __pmMemo.clear(); __pmDb = dbx; } if (!__pmMemo.has(p)) __pmMemo.set(p, __pm(dbx, p)); return __pmMemo.get(p); };
let __kpDb = null, __kpVer = 0; const __kpMemo = new Map(); let dataVer = 0;
function bumpData() { dataVer++; }
/* Categorías: las mismas de la Matriz económica (gastos e inversión) */
const FIN_CATS = [
  { id: 'nomina', label: 'Nómina y honorarios', tipo: 'gasto', group: 'OPEX' },
  { id: 'software', label: 'Herramientas y licencias de software', tipo: 'gasto', group: 'OPEX' },
  { id: 'infra', label: 'Hospedaje, dominios y servidores', tipo: 'gasto', group: 'OPEX' },
  { id: 'ia', label: 'Consumo de inteligencia artificial', tipo: 'gasto', group: 'COGS' },
  { id: 'whatsapp', label: 'API de WhatsApp y mensajería', tipo: 'gasto', group: 'COGS' },
  { id: 'internet', label: 'Internet y telefonía', tipo: 'gasto', group: 'OPEX' },
  { id: 'profesionales', label: 'Servicios profesionales (contabilidad, legal)', tipo: 'gasto', group: 'OPEX' },
  { id: 'bancarias', label: 'Comisiones bancarias y de pasarelas (Binance, PayPal)', tipo: 'gasto', group: 'OPEX' },
  { id: 'impuestos', label: 'Impuestos y tasas', tipo: 'gasto', group: 'BELOW' },
  { id: 'otros', label: 'Otros gastos', tipo: 'gasto', group: 'OPEX' },
  { id: 'publicidad', label: 'Publicidad y pauta (Meta Ads, Google, TikTok)', tipo: 'inversion' },
  { id: 'comisiones', label: 'Comisiones de venta y afiliados', tipo: 'inversion' },
  { id: 'producto', label: 'Desarrollo de producto', tipo: 'inversion' },
  { id: 'equipos', label: 'Equipos y mobiliario', tipo: 'inversion' },
  { id: 'formacion', label: 'Formación y certificaciones', tipo: 'inversion' },
];
Object.keys(INVEST_CATS).forEach(k => delete INVEST_CATS[k]);
FIN_CATS.filter(c => c.tipo === 'inversion').forEach(c => { INVEST_CATS[c.id] = c.label; });
const ALL_CATS = () => [...FIN_CATS.filter(c => c.tipo === 'gasto'), ...customCats];
const catLabel = id => (ALL_CATS().find(c => c.id === id) || { label: id }).label;
const GROUP_LABEL = { COGS: 'Costo de atender a los clientes', OPEX: 'Gasto operativo', BELOW: 'Impuestos y tasas' };
const GROUP_COLOR = { COGS: '#579BFC', OPEX: '#E2445C', BELOW: '#9AA0B4' };
function budgetFor(p, cat) { const mv = matrix.prev['cat:' + cat + '|' + p]; if (mv != null) return mv; const k = p + '|' + cat; return budgetOverrides[k] != null ? budgetOverrides[k] : (budgets[cat] || 0); }
function goalFor(p) { const keys = Object.keys(matrix.prev).filter(k => (k.startsWith('ing:') || k.startsWith('prod:')) && k.endsWith('|' + p)); if (keys.length) return sum(keys, k => +matrix.prev[k] || 0); return goals.byPeriod[p] != null ? goals.byPeriod[p] : goals.default; }
function spendByCat(p) {
  const out = {};
  db.expenses.filter(e => e.period === p).forEach(e => { out[e.category] = (out[e.category] || 0) + (toUsd(db, e.amount, e.currency, p + '-01') || 0); });
  out.API_USAGE = sum(db.usageCosts.filter(u => u.billingPeriod === p), u => u.costUsd);
  return out;
}
function KP(p) {
  if (__kpDb !== db || __kpVer !== dataVer) { __kpMemo.clear(); __kpDb = db; __kpVer = dataVer; }
  if (__kpMemo.has(p)) return __kpMemo.get(p);
  const ks = kpiSet(db, p);
  if (!ks) { __kpMemo.set(p, null); return null; }
  const k = { ...ks.cur };
  const sp = spendByCat(p); const cats = ALL_CATS();
  k.spendByCat = sp;
  k.budgetTotal = sum(cats, c => budgetFor(p, c.id));
  k.spendTotal = sum(Object.values(sp));
  k.budgetExec = k.budgetTotal ? k.spendTotal / k.budgetTotal * 100 : null;
  k.opex = sum(cats.filter(c => c.group === 'OPEX'), c => sp[c.id] || 0);
  k.cogsSpend = sum(cats.filter(c => c.group === 'COGS'), c => sp[c.id] || 0);
  k.belowSpend = sum(cats.filter(c => c.group === 'BELOW'), c => sp[c.id] || 0);
  k.goal = goalFor(p); k.revenueGoal = k.goal ? k.revenue / k.goal * 100 : null;
  const billable = sum(k.utilization, u => u.billable), cap = sum(k.utilization, u => u.monthlyCapacityHours);
  k.utilizationPct = cap ? billable / cap * 100 : null; k.billableHours = billable; k.freeHours = Math.max(0, cap - billable);
  k.implPct = k.implIncluded ? k.implUsed / k.implIncluded * 100 : null;
  // Proyección (próximo mes): lo que se espera cobrar es la facturación del mes con IVA
  k.projected = isProj(p);
  if (k.projected) { k.cashCollected = round2(k.revenue * (1 + ivaRate / 100)); k.burn = k.totalSpend - k.cashCollected; }
  const lastDay = addDays(monthEnd(p), -1);
  const act = db.clients.filter(c => clientActiveOn(db, c.id, lastDay));
  k.activeAtClose = act.length;
  k.arpuClose = act.length ? k.mrrEnd / act.length : null;
  k.healthAvg = act.length ? sum(act, c => c.healthScore) / act.length : null;
  const ag = arAging(db, p); k.aging = ag;
  k.morosos = new Set(ag.slice(1).flatMap(b => b.items.map(i => i.clientId))).size;
  const inv = investmentSummary(db, allInvestments(), p);
  Object.assign(k, { roi: inv.roi, invAcc: inv.invAcc, ebitdaAcc: inv.ebitdaAcc, invMonth: inv.invMonth, investPayback: inv.investPayback, invRecovered: inv.recovered, invSummary: inv });
  k.resultBefore = k.revenue - k.spendTotal; k.result = k.resultBefore - k.invMonth;
  k.netFlow = k.cashCollected - k.totalSpend - (k.invMonth || 0); // flujo de caja: cobros − gastos − inversión
  if (k.projected) { const a1 = KP(prevPeriod(p)), a2 = a1 ? KP(prevPeriod(prevPeriod(p))) : null; const bs = [k.burn, a1 && a1.burn, a2 && a2.burn].filter(v => v != null); k.burn3 = bs.length ? sum(bs) / bs.length : null; }
  k.cash = cashAt(p); if (k.cash != null && k.burn3 != null) k.runway = k.cash <= 0 ? 0 : k.burn3 <= 0 ? Infinity : k.cash / k.burn3; /* sin caja no aguanta ningún mes */
  k.churnPct = k.churnClientsPct;
  const yr = p.slice(0, 4); const ytd = MX_MONTHS.filter(m => m.slice(0, 4) === yr && m <= p);
  k.gastoMes = sum(Object.values(expenseByCat(p))); k.invMes = sum(Object.values(invByCat(p))); k.egresoMes = k.gastoMes + k.invMes;
  k.gastoAno = sum(ytd, m => sum(Object.values(expenseByCat(m)))); k.invAno = sum(ytd, m => sum(Object.values(invByCat(m)))); k.egresoAno = k.gastoAno + k.invAno;
  __kpMemo.set(p, k);
  return k;
}
const perUpTo = p => ALL_PERIODS.filter(x => x <= p).slice(-6); // últimos 6 meses hasta el elegido
const mShort = p => { const s = MONTHS[+p.slice(5) - 1]; return s[0].toUpperCase() + s.slice(1, 3); };
const mLong = p => { const s = MONTHS[+p.slice(5) - 1]; return s[0].toUpperCase() + s.slice(1); };
const monthYear = p => MONTHS[+p.slice(5) - 1] + ' de ' + p.slice(0, 4);
const monthWindow = () => [PREV_P, CUR_P, NEXT_P].filter(x => ALL_PERIODS.includes(x));
const monthRel = x => x === CUR_P ? 'mes en curso' : x === PREV_P ? 'mes anterior' : x === NEXT_P ? 'próximo mes (proyección)' : isProj(x) ? 'proyección' : 'historial';
const projIndex = months => months.findIndex(isProj);
// Módulos cuyo contenido depende del mes elegido (en ellos se avisa cuando el mes es una proyección)
const PERIOD_MODS = ['resumen', 'ingresos', 'facturacion', 'gastos', 'rentabilidad', 'caja', 'clientes', 'cobranza', 'pausas', 'inversion', 'inversionistas', 'utilidades', 'comisiones'];
const projNote = p => `<div class="proj-note" role="note"><span class="pn-ic">${svgI('spark', 16)}</span><span><b>Proyección de ${monthYear(p)}.</b> Se calcula con los planes y servicios activos, los gastos recurrentes programados, lo que ya tenga fecha en ese mes y las comisiones estimadas. Se vuelve real a medida que ocurre.</span></div>`;
// v10.1: aviso de montos en bolívares que no se pueden pasar a US$ porque no hay ninguna tasa registrada para ese mes
function vesWithoutRate(p) {
  try {
    if (rateFor(db, 'VES', p + '-01') != null) return 0;
    const exp = (db.expenses || []).filter(e => e.period === p && e.currency === 'VES').length;
    const inv = (typeof allInvestments === 'function' ? allInvestments() : []).filter(x => String(x.date || '').slice(0, 7) === p && x.currency === 'VES').length;
    return exp + inv;
  } catch (e) { return 0; }
}
const RATE_MODS = ['resumen', 'gastos', 'caja', 'inversion', 'rentabilidad', 'matriz'];
const rateNote = p => { const n = vesWithoutRate(p); return n ? `<div class="proj-note rate-note" role="alert"><span class="pn-ic">${svgI('rate', 16)}</span><span><b>${n} monto${n === 1 ? '' : 's'} en bolívares sin tasa.</b> No hay tasa registrada para ${monthYear(p)} ni de meses anteriores, así que no se suman en US$. Regístrala en Ajustes → Tasas del día o en «Tasa Binance por mes».</span></div>` : ''; };

/* ====================== CLAVE DE EDICIÓN ====================== */
// v10.1: la clave de edición se protege con PBKDF2 y sal propia. El hash de la v10 (FNV, sin sal y fácil de
// descifrar) solo se usa una vez para reconocer la clave anterior y se borra en ese momento.
let keyHash = store.get('key_hash', null); let keyKdf = store.get('key_kdf_v1', null); let unlockedUntil = (SRV && SRV.editUntil()) || 0; let pendingEl = null; let pendingFn = null;
const hashKey = k => hashStr('agora|' + k).toString(36) + hashStr(k + '|fin').toString(36);
const hasEditKey = () => !!(keyKdf || keyHash);
const keyTries = { n: 0, until: 0 }; // v10.1: espera creciente tras 5 intentos fallidos
async function verifyEditKey(k) {
  if (keyKdf) return kdfCheck(k, keyKdf);
  if (keyHash && hashKey(k) === keyHash) { try { await setEditKey(k, true); } catch (e) {} return true; }
  return false;
}
async function setEditKey(k, migrated) {
  const nk = await kdfMake(k); if (!nk) throw new Error('Este navegador no permite proteger la clave. Ábrela con https o en un navegador actualizado.');
  keyKdf = nk; store.set('key_kdf_v1', nk); keyHash = null; store.del('key_hash');
  if (migrated) logAudit('reforzó la protección de la clave de edición (PBKDF2)', 'sesion');
}
const isUnlocked = () => Date.now() < unlockedUntil;
const KEY_DATA = ['edit', 'pause', 'resume', 'pay', 'cut', 'grace', 'expEdit', 'expDel', 'invEdit', 'invDel', 'delClient', 'staffDel', 'aseEdit', 'aseDel', 'impEdit', 'impDel', 'comPay', 'comUnpay', 'comBase', 'pdel', 'recEdit', 'recToggle', 'unpay', 'invstEdit', 'invstAporte', 'invstPay', 'aporteDel', 'payerUntil', 'rcptVoid', 'socEdit', 'socDel'];
const KEY_ACTS = ['mx-add-prod', 'mx-add-cat', 'mx-add-inv', 'new-client', 'new-exp', 'new-inv', 'budget', 'goal', 'sheet', 'import', 'bench', 'reset-clients', 'cash', 'rates', 'iva', 'new-ase', 'new-imp', 'np-open', 'bulk-delete', 'new-investor', 'new-aporte', 'new-receipt', 'backup-up', 'new-socio', 'soc-pcts', 'soc-split', 'rec-new'];
function needsKey(t) { return KEY_DATA.some(k => t.dataset[k] !== undefined) || KEY_ACTS.includes(t.dataset.act); }
// v10: ejecuta una acción que mueve los indicadores; si la edición está bloqueada pide la clave y sigue sola al abrirla
function withKey(fn) { if (isUnlocked()) return fn(); keyModal(null); pendingFn = fn; }
function keyModal(afterEl) {
  pendingEl = afterEl || null; pendingFn = null;
  if (SRV) return SRV.editModal(); // con servidor: se abre con la clave de acceso (validada en el servidor)
  if (!hasEditKey()) return openModal(`<h2 id="modal-t">Crea tu clave de edición</h2><p class="muted">Cualquier cambio que mueva los indicadores (clientes, precios, facturas, pagos, gastos, metas, caja) pedirá esta clave. La edición queda abierta 15 minutos.</p>
    <form data-form="key-new" novalidate><div class="fgrid"><label class="fld"><span>Clave nueva (mínimo 6 caracteres)</span><input type="password" name="k1" autocomplete="new-password"></label><label class="fld"><span>Repítela</span><input type="password" name="k2" autocomplete="new-password"></label></div><p class="form-err" hidden></p>
    <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Guardar clave <span class="cta-dot">${I.arrow}</span></button></div></form>`);
  openModal(`<h2 id="modal-t">Escribe tu clave de edición</h2><p class="muted">Este cambio mueve los indicadores del tablero. La edición queda abierta 15 minutos.</p>
    <form data-form="key" novalidate><label class="fld"><span>Clave</span><input type="password" name="k" autocomplete="current-password"></label><p class="form-err" hidden></p>
    <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Abrir edición <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}
function unlock() {
  if (SRV) unlockedUntil = SRV.editUntil() || Date.now() + 15 * 60 * 1000; // el servidor ya lo dejó en la auditoría
  else { unlockedUntil = Date.now() + 15 * 60 * 1000; logAudit('abrió la edición con la clave (15 minutos)', 'sesion'); } renderLock(); const el = pendingEl; pendingEl = null; const fn = pendingFn; pendingFn = null; closeModal();
  if (fn) { render(); setTimeout(() => { try { fn(); } catch (x) { console.warn(x); } }, 60); return; }
  const sel = el ? (el.id ? '#' + CSS.escape(el.id) : el.getAttributeNames().filter(n => n.startsWith('data-')).map(n => `[${n}="${CSS.escape(el.getAttribute(n))}"]`).join('')) : '';
  if (el && el.type === 'submit' && el.form && el.isConnected) { el.form.requestSubmit(el); return; }
  // CORRECCIÓN v9.3: antes la vista no se redibujaba al abrir la edición, así que en Productos y en la
  // Matriz los precios, los tipos de ingreso y los montos seguían bloqueados hasta cambiar de módulo.
  render();
  if (!el) return;
  setTimeout(() => { const target = el.isConnected ? el : (sel ? document.querySelector('#content ' + sel) || document.querySelector(sel) : null); if (target) target.click(); }, 30);
}
function renderLock() {
  const b = document.getElementById('lockBtn'); if (!b) return;
  const on = isUnlocked(); const min = Math.max(1, Math.ceil((unlockedUntil - Date.now()) / 60000));
  b.className = 'lock ' + (on ? 'lock-on' : '');
  b.innerHTML = on ? `${svgI('unlock', 15)}<span class="lk-t">${min} min</span>` : `${svgI('lock', 15)}<span class="lk-t">Bloqueada</span>`; // v10: compacto, el detalle va en el título
  b.setAttribute('aria-label', on ? 'Bloquear la edición' : 'Abrir la edición con tu clave'); b.title = on ? `Edición abierta por ${min} min más. Toca para bloquearla.` : 'Edición bloqueada. Toca para abrirla con tu clave.';
}
setInterval(() => { if (unlockedUntil && !isUnlocked()) { unlockedUntil = 0; } renderLock(); }, 20000);

/* ====================== ICONOS Y MÓDULOS ====================== */
const IC = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  invoice: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h4"/>',
  pie: '<path d="M12 3v9h9"/><path d="M20.5 15A9 9 0 1 1 9 3.5"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M16 12.5h2"/><path d="M3 9h18"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  rocket: '<path d="M5 15c-1.5 1.5-2 4-2 6 2 0 4.5-.5 6-2"/><path d="M9 15l-3-3 9-9c2 0 4 .5 6 2 0 2-.5 4-2 6z"/><circle cx="15" cy="9" r="1.5"/>',
  team: '<circle cx="12" cy="7" r="3"/><path d="M6 21v-1a6 6 0 0 1 12 0v1"/>',
  check: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12.5l3 3 5-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 20v-4h-4"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 18v2h16v-2"/>',
  coins: '<ellipse cx="9" cy="6.5" rx="6" ry="2.5"/><path d="M3 6.5v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4"/><path d="M9 17c-3.3 0-6-1.1-6-2.5v-4"/><path d="M15 11.5c3.3 0 6 1.1 6 2.5v4c0 1.4-2.7 2.5-6 2.5s-6-1.1-6-2.5v-4c0-1.4 2.7-2.5 6-2.5z"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  split: '<circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.4 6.4"/><path d="M12 12H3"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4.5v4.5h4.5"/><path d="M12 7.5V12l3 2"/>',
  agenda: '<rect x="3" y="4.5" width="18" height="16.5" rx="3.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><path d="M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 17h2M11 17h2"/>',
  pulse: '<path d="M3 12h4l2.2-5.5L13.5 18l2.2-6H21"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  chevL: '<path d="M15 6l-6 6 6 6"/>',
  chevR: '<path d="M9 6l6 6-6 6"/>',
  // v10
  chat: '<path d="M4 18.5V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H8z"/><path d="M8.5 9.5h7M8.5 12.5h4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>',
  phone: '<path d="M5 4h3.5l1.5 4.2-2.2 1.4a11 11 0 0 0 6.6 6.6l1.4-2.2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5C10.6 20 4 13.4 3.5 5.6A1.5 1.5 0 0 1 5 4z"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="M16 10.5l5-3v9l-5-3"/>',
  warn: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  sidebar: '<rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M9.5 4.5v15"/><path d="M5.5 8h1.8M5.5 11h1.8"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 9.5h.01M9 9.5h.01M12 9.5h.01M15 9.5h.01M18 9.5h.01M6.5 14.5h11"/>',
  hand: '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11"/><path d="M11 10.5V5a1.5 1.5 0 0 1 3 0v6"/><path d="M14 10.5V6.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-5-2.7L3 15.5a1.6 1.6 0 0 1 2.6-1.8L8 16"/>',
  scribble: '<path d="M4 17c2.5-6 4.5-9 6-9 2 0-1.5 8 .5 8 1.6 0 3-4 4.5-4s.5 3 2 3 2-1 3-2"/><path d="M15.5 4.5l3 3L10 16l-3.5.5.5-3.5z" opacity=".0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
  auto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>',
  more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
  logout: '<path d="M15 4h4v16h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 20v-4h-4"/>',
  install: '<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M12 8v6M9.5 11.5L12 14l2.5-2.5"/><path d="M10.5 18.5h3"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.6-1-2.6 0-1 .8-1.7 1.8-1.7H17a3.5 3.5 0 0 0 3.5-3.5c0-4.2-3.8-7.5-8.5-7.5z"/><circle cx="7.5" cy="11" r="1.1"/><circle cx="10" cy="7.5" r="1.1"/><circle cx="14.5" cy="7.5" r="1.1"/>',
  rate: '<path d="M4 7h13l-3-3M20 17H7l3 3"/>',
  athena: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 13.5c1 1.4 2.2 2 3.5 2s2.5-.6 3.5-2"/><path d="M9 9.5v.5M15 9.5v.5"/>',
};
const svgI = (k, s = 18) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;
const MODULES = [
  { id: 'resumen',      name: 'Resumen',          icon: 'home',     color: '#AD103C', desc: 'El pulso del negocio: ingreso recurrente, resultado, salud financiera y lo que viene.' },
  { id: 'ingresos',     name: 'Ingresos',         icon: 'trend',    color: '#AD103C', desc: 'Lo que entra fijo cada mes y lo que entra por única vez. Montos sin IVA.' },
  { id: 'facturacion',  name: 'Facturación',      icon: 'invoice',  color: '#C9971F', desc: 'Ciclo del día 5: qué se cobra a cada cliente y las facturas del mes.' },
  { id: 'facturero',    name: 'Facturero',        icon: 'edit',     color: '#C9971F', desc: 'Crea, guarda e imprime las facturas. Cada factura guardada entra sola al tablero.' },
  { id: 'productos',    name: 'Productos y servicios', icon: 'receipt', color: '#4B5788', desc: 'Catálogo del facturero: precio de lista y tipo de ingreso de cada producto.' },
  { id: 'matriz',       name: 'Matriz económica', icon: 'pie',      color: '#4B5788', desc: 'Presupuesto previsto contra lo real, mes a mes, con el flujo de caja.' },
  { id: 'gastos',       name: 'Gastos',           icon: 'receipt',  color: '#4B5788', desc: 'En qué se va el dinero, comparado con lo presupuestado.' },
  { id: 'rentabilidad', name: 'Rentabilidad',     icon: 'pie',      color: '#AD103C', desc: 'Estado de resultados del mes y márgenes por línea y por cliente.' },
  { id: 'caja',         name: 'Caja',             icon: 'wallet',   color: '#4B5788', desc: 'Libro de caja: lo cobrado, lo gastado, el saldo después de cada movimiento y cuántos meses aguanta la caja.' },
  { id: 'clientes',     name: 'Clientes',         icon: 'users',    color: '#AD103C', desc: 'Tu cartera agrupada por plan, con su rentabilidad y alertas.' },
  { id: 'cobranza',     name: 'Cobranza y corte', icon: 'calendar', color: '#C9971F', desc: 'Corte del día 5, servicios cortados y cuentas por cobrar.' },
  { id: 'pausas',       name: 'Pausas',           icon: 'pause',    color: '#C9971F', desc: 'Clientes pausados y los días que llevan sin servicio.' },
  { id: 'inversion',    name: 'Inversión',        icon: 'rocket',   color: '#4B5788', desc: 'Captación de clientes y producto: lo invertido y lo que ha devuelto.' },
  { id: 'inversionistas', name: 'Inversionistas', icon: 'coins',    color: '#AD103C', desc: 'Quién puso dinero o pagó gastos de su bolsillo, cuánto se le debe y sus recibos de pago.' },
  { id: 'utilidades',   name: 'Utilidades',       icon: 'split',    color: '#C9971F', desc: 'Los socios de la empresa y cómo se reparte entre ellos la utilidad del mes.' },
  { id: 'agenda',       name: 'Agenda',           icon: 'agenda',   color: '#4B5788', desc: 'Calendario de planificación: citas, reuniones de socios e inversionistas y las fechas clave del negocio.' },
  { id: 'comisiones',   name: 'Comisiones',       icon: 'team',     color: '#AD103C', desc: 'Lo que se le paga al equipo: comisiones por venta y pagos por implementación.' },
  { id: 'plan',         name: 'Plan de acción',   icon: 'check',    color: '#AD103C', desc: 'Lo que vamos a mover en los próximos 90 días.' },
  { id: 'auditoria',    name: 'Auditoría',        icon: 'shield',   color: '#282E49', desc: 'Registro de seguridad: qué usuario hizo qué acción, en qué módulo, con fecha y hora.' },
  { id: 'ajustes',      name: 'Ajustes',          icon: 'gear',     color: '#4B5788', desc: 'Clave, catálogo, metas, presupuesto, caja, tasas e importaciones.' },
];
// v11 · con servidor, el facturero se convierte en la Facturación fiscal (correlativo, control de la imprenta y tasa BCV)
if (SRV) Object.assign(MODULES.find(m => m.id === 'facturero'), { name: 'Facturación fiscal', desc: 'Facturas y notas de crédito o débito con correlativo sin saltos, número de control de la imprenta y equivalente a tasa BCV, según la norma del SENIAT.' });
const modOf = id => MODULES.find(m => m.id === id) || MODULES[0];
// Grupos del menú desplegable de módulos (barra superior)
const MODULE_GROUPS = [
  { label: 'General', ids: ['resumen', 'auditoria', 'ajustes'] },
  { label: 'Ingresos y facturación', ids: ['ingresos', 'facturacion', 'facturero', 'productos'] },
  { label: 'Clientes', ids: ['clientes', 'cobranza', 'pausas'] },
  { label: 'Gastos y resultados', ids: ['gastos', 'matriz', 'rentabilidad', 'caja', 'inversion'] },
  { label: 'Personas y reparto', ids: ['utilidades', 'inversionistas', 'comisiones'] },
  { label: 'Planificación', ids: ['agenda', 'plan'] },
];
// v9.4: el Resumen ya no lleva grilla de módulos; se navega solo con la barra superior y su menú desplegable

/* ====================== GRÁFICOS ====================== */
function niceStep(range, n) { const raw = range / n; const mag = Math.pow(10, Math.floor(Math.log10(raw || 1))); const f = raw / mag; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag; }
function ticks(min, max, n = 4) { if (max - min < 1) { max = min + 100; } const st = niceStep(max - min, n); const lo = Math.floor(min / st) * st, hi = Math.ceil(max / st) * st; const out = []; for (let v = lo; v <= hi + st / 2; v += st) out.push(+v.toFixed(6)); return out; }
const axisMoney = v => (v < 0 ? '−' : '') + 'US$ ' + num(Math.abs(v), Math.abs(v) % 1 ? 2 : 0);
// Lienzo de cada gráfico según la pantalla: en el celular y la tableta el texto se lee igual que en el escritorio.
// Los informes y el PDF siempre usan las proporciones de escritorio (CHART_DESKTOP, ver reportClone).
let CHART_DESKTOP = false, chartSeq = 0;
// v10: el ancho útil es el del contenido (con barra lateral el contenido es más angosto que la ventana)
const vwNow = () => { const c = document.getElementById('content'), app = document.getElementById('app'); if (c && app && !app.hidden && c.clientWidth > 200) return c.clientWidth; return window.innerWidth || document.documentElement.clientWidth || 1440; };
function chartDims(w, h, full) {
  if (CHART_DESKTOP) return { W: w, H: h, small: false };
  const vw = vwNow(); if (full == null) full = w < 1000 ? 1180 : 0; // ancho desde el que el gráfico ocupa todo el panel
  if (vw <= 560) return { W: 390, H: Math.round(h * 0.92), small: true };
  if (full && vw <= full) return { W: 1000, H: h, small: false };
  return { W: w, H: h, small: false };
}
const chartBucket = () => { const vw = vwNow(); return vw <= 560 ? 0 : vw <= 1000 ? 1 : vw <= 1100 ? 2 : vw <= 1180 ? 3 : 4; };
function lineChart({ labels, series, fmtAxis = axisMoney, fmtVal = v => money(v), height = 280, zero = true, legend = true, w = 1000, full, projIdx = -1 }) {
  const dm = chartDims(w, height, full), W = dm.W, H = dm.H, L = dm.small ? 66 : 78, R = dm.small ? 8 : 18, T = 14, B = 30;
  const all = series.flatMap(s => s.values).filter(v => v != null);
  if (!all.length) return empty('Aún no hay datos para graficar.');
  const tk = ticks(zero ? Math.min(0, ...all) : Math.min(...all), Math.max(...all), 4);
  const y0 = tk[0], y1 = tk[tk.length - 1];
  const PAD = dm.small ? 14 : 34; const x = i => L + PAD + (labels.length === 1 ? (W - L - R - 2 * PAD) / 2 : i * (W - L - R - 2 * PAD) / (labels.length - 1));
  const y = v => T + (H - T - B) * (1 - (v - y0) / (y1 - y0 || 1));
  const grid = tk.map(v => `<g><line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="ch-grid"/><text x="${L - 10}" y="${y(v) + 4}" text-anchor="end" class="ch-ax">${fmtAxis(v)}</text></g>`).join('');
  const hasProj = projIdx >= 0 && projIdx < labels.length;
  const xl = labels.map((l, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="ch-ax ${hasProj && i >= projIdx ? 'ch-ax-proj' : ''}">${l}</text>`).join('');
  const path = ps => ps.map((pt, i) => (i ? 'L' : 'M') + pt[0].toFixed(1) + ' ' + pt[1].toFixed(1)).join(' ');
  const lines = series.map(s => {
    const pts = s.values.map((v, i) => v == null ? null : [x(i), y(v), v, i]).filter(Boolean);
    const d = path(pts);
    const gid = 'chg' + (++chartSeq); // degradado que se desvanece hacia la base, estilo Apple
    const area = s.area && pts.length > 1 ? `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".30"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient></defs><path d="${d} L${pts[pts.length - 1][0]} ${y(Math.max(y0, 0))} L${pts[0][0]} ${y(Math.max(y0, 0))} Z" fill="url(#${gid})"/>` : '';
    // tramo real (se dibuja al entrar) y tramo proyectado (punteado)
    const real = hasProj ? pts.filter(pt => pt[3] < projIdx) : pts, fut = hasProj ? pts.filter(pt => pt[3] >= projIdx - 1) : [];
    const solid = real.length > 1 || (!hasProj && pts.length) ? `<path ${s.dash ? 'stroke-dasharray="5 5"' : 'class="ch-line" pathLength="1"'} d="${path(real)}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` : '';
    const dashed = fut.length > 1 ? `<path class="ch-proj" d="${path(fut)}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-dasharray="4 6" stroke-linecap="round"/>` : '';
    return `${area.replace('<path ', '<path class="ch-area" ')}${solid}${dashed}${pts.map(pt => `<circle cx="${pt[0]}" cy="${pt[1]}" r="4.5" class="ch-dot ${hasProj && pt[3] >= projIdx ? 'ch-dot-proj' : ''}" stroke="${s.color}"><title>${esc(s.name)} · ${labels[pt[3]]}${hasProj && pt[3] >= projIdx ? ' (proyección)' : ''}: ${fmtVal(pt[2])}</title></circle>`).join('')}`;
  }).join('');
  const lg = legend && (series.length > 1 || hasProj) ? `<div class="legend">${series.map(s => `<span><i class="sw" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}${hasProj ? '<span><i class="sw sw-proj"></i>Proyección</span>' : ''}</div>` : '';
  return `${lg}<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map(s => s.name).join(', '))} por mes">${grid}${xl}${lines}</svg>`;
}
function barChart({ labels, series, stacked = false, fmtAxis = axisMoney, fmtVal = v => money(v), height = 280, highlight = -1, line = null, w = 1000, full, projIdx = -1 }) {
  const hasProj = projIdx >= 0 && projIdx < labels.length; const isP = i => hasProj && i >= projIdx;
  const dm = chartDims(w, height, full), W = dm.W, H = dm.H, L = dm.small ? 66 : 78, R = dm.small ? 8 : 18, T = 14, B = 30;
  const totals = labels.map((_, i) => stacked ? sum(series, s => Math.max(0, s.values[i] || 0)) : Math.max(0, ...series.map(s => s.values[i] || 0)));
  const mins = labels.map((_, i) => Math.min(0, ...series.map(s => s.values[i] || 0)));
  const lv = line ? line.values.filter(v => v != null) : [];
  const tk = ticks(Math.min(0, ...mins, ...lv), Math.max(1, ...totals, ...lv), 4);
  const y0 = tk[0], y1 = tk[tk.length - 1];
  const y = v => T + (H - T - B) * (1 - (v - y0) / (y1 - y0 || 1));
  const slot = (W - L - R) / labels.length; const gw = Math.min(64, slot * 0.62); const bw = stacked ? gw : gw / series.length;
  const grid = tk.map(v => `<g><line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="ch-grid ${v === 0 ? 'ch-zero' : ''}"/><text x="${L - 10}" y="${y(v) + 4}" text-anchor="end" class="ch-ax">${fmtAxis(v)}</text></g>`).join('');
  const bars = labels.map((l, i) => {
    const cx = L + slot * i + slot / 2; let acc = 0;
    const hl = i === highlight ? `<rect x="${L + slot * i + 3}" y="${T}" width="${slot - 6}" height="${H - T - B}" rx="10" class="ch-hl"/>` : '';
    const rects = series.map((s, j) => {
      const v = s.values[i] || 0; let x0, yt, yb;
      if (stacked) { x0 = cx - gw / 2; yb = y(acc); acc += Math.max(0, v); yt = y(acc); }
      else { x0 = cx - gw / 2 + j * bw; yt = v >= 0 ? y(v) : y(0); yb = v >= 0 ? y(0) : y(v); }
      const h = Math.max(0, yb - yt); if (!h) return '';
      const rr = Math.min(5, bw / 3, h / 2);
      return `<path class="ch-bar${!stacked && v < 0 ? ' neg' : ''}${isP(i) ? ' ch-bar-proj' : ''}" style="--i:${i}" d="M${x0 + 1} ${yb} V${yt + rr} Q${x0 + 1} ${yt} ${x0 + 1 + rr} ${yt} H${x0 + bw - 1 - rr} Q${x0 + bw - 1} ${yt} ${x0 + bw - 1} ${yt + rr} V${yb} Z" fill="${s.color}"${isP(i) ? ' fill-opacity=".42"' : ''}><title>${esc(s.name)} · ${l}${isP(i) ? ' (proyección)' : ''}: ${fmtVal(v)}</title></path>`;
    }).join('');
    return `${hl}${rects}<text x="${cx}" y="${H - 8}" text-anchor="middle" class="ch-ax ${i === highlight ? 'ch-ax-on' : ''} ${isP(i) ? 'ch-ax-proj' : ''}">${l}</text>`;
  }).join('');
  let ln = '';
  if (line) {
    const pts = line.values.map((v, i) => v == null ? null : [L + slot * i + slot / 2, y(v), v, i]).filter(Boolean), path = ps => ps.map((pt, i) => (i ? 'L' : 'M') + pt[0] + ' ' + pt[1]).join(' ');
    const real = hasProj ? pts.filter(pt => pt[3] < projIdx) : pts, fut = hasProj ? pts.filter(pt => pt[3] >= projIdx - 1) : [];
    ln = `${real.length > 1 ? `<path class="ch-line" pathLength="1" d="${path(real)}" fill="none" stroke="${line.color}" stroke-width="2.5" stroke-linejoin="round"/>` : ''}${fut.length > 1 ? `<path class="ch-proj" d="${path(fut)}" fill="none" stroke="${line.color}" stroke-width="2.5" stroke-dasharray="4 6" stroke-linecap="round"/>` : ''}${pts.map(pt => `<circle cx="${pt[0]}" cy="${pt[1]}" r="4.5" class="ch-dot ${isP(pt[3]) ? 'ch-dot-proj' : ''}" stroke="${line.color}"><title>${esc(line.name)} · ${labels[pt[3]]}: ${fmtVal(pt[2])}</title></circle>`).join('')}`;
  }
  const lg = `<div class="legend">${series.map(s => `<span><i class="sw" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}${line ? `<span><i class="sw sw-line" style="background:${line.color}"></i>${esc(line.name)}</span>` : ''}${hasProj ? '<span><i class="sw sw-proj"></i>Proyección</span>' : ''}</div>`;
  return `${lg}<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map(s => s.name).join(', '))} por mes">${grid}${bars}${ln}</svg>`;
}
function hbars(rows, { fmt = v => money(v), max = null, color = 'var(--brand)' } = {}) {
  const mx = max || Math.max(1, ...rows.map(r => r.value));
  return `<div class="hb-list">${rows.map(r => `<div class="hb-row"><span class="hb-l">${r.label}${r.sub ? `<small>${r.sub}</small>` : ''}</span><span class="hb-track"><i style="width:${Math.max(0, Math.min(100, r.value / mx * 100)).toFixed(1)}%;background:${r.color || color}"></i></span><span class="hb-v">${fmt(r.value)}</span></div>`).join('')}</div>`;
}
function donut(mix, total) {
  const R = 54, C = 2 * Math.PI * R; let off = 0;
  const segs = mix.filter(m => m.mrr > 0).map(m => { const len = C * m.mrr / total; const s = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${PLAN_COLOR[m.plan]}" stroke-width="18" stroke-dasharray="${Math.max(0, len - 2.5)} ${C - len + 2.5}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"><title>${LINE_LABEL[m.plan]}: ${money(m.mrr)} (${pct(m.pct)})</title></circle>`; off += len; return s; }).join('');
  return `<svg viewBox="0 0 140 140" class="donut" role="img" aria-label="Distribución del ingreso fijo"><circle r="${R}" cx="70" cy="70" fill="none" class="donut-bg" stroke-width="18"/>${segs}<text x="70" y="64" text-anchor="middle" class="donut-k">Ingreso fijo</text><text x="70" y="84" text-anchor="middle" class="donut-v">${money(total)}</text></svg>`;
}

/* ====================== MICROMÓDULO ====================== */
function spark(series, color) {
  const v = series.map(x => (x == null || !isFinite(x)) ? null : x); const vals = v.filter(x => x != null);
  if (vals.length < 2) return '<span class="spark"></span>';
  const mn = Math.min(...vals), mx = Math.max(...vals), W = 100, H = 30, n = v.length;
  const pts = v.map((x, i) => x == null ? null : [i / (n - 1) * W, H - 4 - (mx === mn ? 0.5 : (x - mn) / (mx - mn)) * (H - 8)]).filter(Boolean);
  const d = pts.map((pt, i) => (i ? 'L' : 'M') + pt[0].toFixed(1) + ' ' + pt[1].toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="-3 -2 106 34" preserveAspectRatio="none" aria-hidden="true"><path class="ch-line" pathLength="1" d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}
function fmtK(v, f) {
  if (v == null) return 'N/D';
  if (f === 'money') return money(v);
  if (f === 'pct') return pct(v);
  if (f === 'days') return num(v, 0) + (Math.round(v) === 1 ? ' día' : ' días');
  if (f === 'months') return v === Infinity ? 'Rentable' : num(v, 1) + ' meses';
  if (f === 'score') return num(v, 1) + '/10';
  if (f === 'hours') return num(v, 0) + ' h';
  return num(v, 0);
}
function deltaPill(def, cur, prev) {
  if (cur == null || prev == null || cur === Infinity || prev === Infinity) return `<span class="dp dp-flat">Sin comparación</span>`;
  const b = def.bench ? bench(def.bench) : null;
  const up = b ? b.direction === 'HIGHER_IS_BETTER' : def.better !== 'down';
  let d, txt;
  if (def.fmt === 'pct') { d = cur - prev; txt = num(Math.abs(d), 1) + ' pts'; }
  else if (['count', 'days', 'score', 'hours'].includes(def.fmt)) { d = cur - prev; txt = num(Math.abs(d), def.fmt === 'score' ? 1 : 0); }
  else if (def.fmt === 'money') { d = cur - prev; txt = money(Math.abs(d)); }
  else { if (!prev) return `<span class="dp dp-flat">Sin comparación</span>`; d = (cur - prev) / Math.abs(prev) * 100; txt = num(Math.abs(d), 1) + '%'; }
  if (Math.abs(d) < 0.005) return `<span class="dp dp-flat">Igual que ${mLong(prevPeriod(state.period)).toLowerCase()}</span>`;
  const good = (d > 0) === up;
  return `<span class="dp ${def.neutral ? 'dp-flat' : good ? 'dp-good' : 'dp-bad'}">${d > 0 ? '▲' : '▼'} ${txt}</span>`;
}
const BADGE = { green: ['En meta', 'mb-ok'], yellow: ['Atención', 'mb-warn'], red: ['Alerta', 'mb-bad'] };
function micro(def, p) {
  const k = KP(p); const pk = KP(prevPeriod(p));
  const get = def.get || (x => x[def.key]);
  const v = k ? get(k) : null, pv = pk ? get(pk) : null;
  const b = def.bench ? bench(def.bench) : null; const st = statusOf(v, b);
  const series = perUpTo(p).map(x => { const kk = KP(x); const r = kk ? get(kk) : null; return r === Infinity ? null : r; });
  const mod = modOf(state.module);
  const goal = b ? `Meta ${b.direction === 'HIGHER_IS_BETTER' ? '≥' : '≤'} ${num(b.green, b.green % 1 ? 1 : 0)}${def.fmt === 'pct' ? '%' : def.fmt === 'months' ? ' meses' : def.fmt === 'days' ? ' días' : ''}` : '';
  const foot = [goal, def.foot && k ? def.foot(k) : ''].filter(Boolean).join(' · ');
  return `<article class="micro ${st === 'red' ? 'micro-red' : ''}" style="--mc:${mod.color}">
    <header class="mm-h"><h3>${def.name}</h3>${k && k.projected ? '<span class="mb mb-proj" title="Mes que todavía no ocurre: es una proyección">Proyectado</span>' : ''}<button class="mm-i" type="button" title="${esc(def.info)}" aria-label="Qué mide: ${esc(def.info)}">${svgI('info', 15)}</button></header>
    ${widget(() => `<div class="mm-row"><p class="mm-v ${v == null ? 'nd' : ''}">${fmtK(v, def.fmt)}</p>${st ? `<span class="mb ${BADGE[st][1]}">${BADGE[st][0]}</span>` : ''}</div>
    ${v == null ? `<p class="mm-foot">${ND_TEXT}</p>` : `<div class="mm-mid">${deltaPill(def, v, pv)}${spark(series, st === 'red' ? 'var(--bad)' : 'var(--mc)')}</div>${foot ? `<p class="mm-foot">${foot}</p>` : ''}`}`, { lines: 3, h: 20, emptyText: 'Aún no hay datos de este mes.' })}
  </article>`;
}
const microGrid = (defs, p) => { const n = defs.length; const cols = n <= 4 ? n : (n % 3 === 0 ? 3 : 4); return `<div class="micro-grid" style="--cols:${cols}">${defs.map(d => micro(d, p)).join('')}</div>`; };
const panel = (title, body, actions = '', cls = '') => `<section class="panel ${cls}"><header class="pn-h"><h2>${title}</h2>${actions ? `<div class="pn-a">${actions}</div>` : ''}</header>${body}</section>`;
const stCell = (txt, cls) => `<span class="sc ${cls}">${txt}</span>`;

/* ====================== TABLERO (tabla con grupos alineados) ====================== */
function board({ cols, groups, foot, cls = '' }) {
  cols = cols.map(c => c.label === '' ? { ...c, cls: ((c.cls || '') + ' nw').trim() } : c);
  const head = `<thead><tr>${cols.map(c => `<th scope="col" class="${c.cls || ''}">${c.label}</th>`).join('')}</tr></thead>`;
  const body = groups.map(g => `<tbody class="bt-g" style="--g:${g.color || 'var(--line-2)'}">${g.label ? `<tr class="bt-gh"><th colspan="${cols.length}" scope="colgroup"><span class="bt-gt">${g.label}</span>${g.sub ? `<span class="bt-gs">${g.sub}</span>` : ''}</th></tr>` : ''}${g.rows.length ? g.rows.map(r => `<tr class="${r.cls || ''}">${r.cells.map((c, i) => `<td class="${cols[i].cls || ''}">${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}" class="bt-empty">${g.emptyText || 'Sin elementos.'}</td></tr>`}</tbody>`).join('');
  const ft = foot ? `<tfoot><tr>${foot.map((c, i) => `<td class="${cols[i].cls || ''}">${c}</td>`).join('')}</tr></tfoot>` : '';
  return `<div class="bt-wrap"><table class="bt ${cls}"><colgroup>${cols.map(c => `<col style="${c.w ? 'width:' + c.w : ''}">`).join('')}</colgroup>${head}${body}${ft}</table></div>`;
}

/* ====================== RESUMEN ====================== */
// Salud financiera: seis puntos con los mismos umbrales de Ajustes → puntaje de 0 a 100
const H_PTS = { green: 100, yellow: 60, red: 15 };
function healthOf(p) {
  const k = KP(p); if (!k) return null; const pk = KP(prevPeriod(p)); const pill = [];
  const marg = k.revenue ? k.result / k.revenue * 100 : (k.result < 0 ? -100 : null);
  pill.push({ key: 'rent', name: 'Rentabilidad', icon: 'pie', st: marg == null ? null : statusOf(marg, bench('ebitdaPct')), val: marg == null ? 'Sin ingresos' : `${pct(marg, 0)} de margen`, detail: `Resultado de ${money(k.result)} sobre ${money(k.revenue)} de ingresos`, href: '#/rentabilidad' });
  let liqSt = null, liqVal = 'Sin datos';
  if (k.cash != null) { if (k.cash <= 0) { liqSt = 'red'; liqVal = 'Caja en negativo'; } else if (k.runway === Infinity) { liqSt = 'green'; liqVal = 'La operación se paga sola'; } else if (k.runway != null) { liqSt = statusOf(k.runway, bench('runway')); liqVal = `${num(k.runway, 1)} meses de caja`; } else { liqSt = 'green'; liqVal = 'Caja positiva'; } }
  pill.push({ key: 'liq', name: 'Liquidez', icon: 'wallet', st: liqSt, val: liqVal, detail: `Saldo de caja${k.projected ? ' proyectado' : ''}: ${money(k.cash)}`, href: '#/caja' });
  const invs = db.invoices.filter(i => !i.voided && inPeriod(i.issueDate, p));
  const paidPct = invs.length ? invs.filter(i => invoiceStatus(i, monthEnd(p)) === 'PAID').length / invs.length * 100 : null;
  const cobV = k.dueOn5 ? k.onTimePct : paidPct; let cobSt = cobV == null ? null : statusOf(cobV, bench('onTimePct'));
  if (cobSt === 'green' && k.morosos > 0) cobSt = 'yellow';
  pill.push({ key: 'cob', name: 'Cobranza', icon: 'calendar', st: k.projected ? null : cobSt, val: k.projected ? 'Todavía no hay cobros' : cobV == null ? 'Sin facturas del mes' : `${pct(cobV, 0)} ${k.dueOn5 ? 'pagó a tiempo' : 'ya cobrado'}`, detail: k.morosos ? `${k.morosos} cliente(s) con más de 30 días de atraso` : 'Ningún cliente con más de 30 días de atraso', href: '#/cobranza' });
  const dm = pk ? k.mrrEnd - pk.mrrEnd : null, dmp = pk && pk.mrrEnd ? dm / pk.mrrEnd * 100 : null;
  let grSt = null; if (dm != null && (k.mrrEnd || pk.mrrEnd)) grSt = dm > 0.005 ? 'green' : k.nrr != null ? statusOf(k.nrr, bench('nrr')) : dm < -0.005 ? 'red' : 'yellow';
  pill.push({ key: 'crec', name: 'Crecimiento', icon: 'trend', st: grSt, val: dm == null ? 'Sin mes anterior' : `${dm >= 0 ? '+' : '−'}${money(Math.abs(dm))}${dmp != null ? ` (${dm >= 0 ? '+' : '−'}${pct(Math.abs(dmp), 1)})` : ''}`, detail: `Ingreso recurrente frente a ${mLong(prevPeriod(p)).toLowerCase()}`, href: '#/ingresos' });
  pill.push({ key: 'gas', name: 'Control de gastos', icon: 'receipt', st: k.budgetTotal ? statusOf(k.budgetExec, bench('budgetExec')) : null, val: k.budgetTotal ? `${pct(k.budgetExec, 0)} del presupuesto` : 'Sin presupuesto', detail: k.budgetTotal ? `${money(k.spendTotal)} de ${money(k.budgetTotal)} presupuestados` : 'Defínelo en Gastos para medir este punto', href: '#/gastos' });
  pill.push({ key: 'meta', name: 'Meta de ingresos', icon: 'check', st: k.goal ? statusOf(k.revenueGoal, bench('revenueGoal')) : null, val: k.goal ? `${pct(k.revenueGoal, 0)} de la meta` : 'Sin meta', detail: k.goal ? `${money(k.revenue)} de ${money(k.goal)}` : 'Defínela en Ingresos', href: '#/ingresos' });
  const scored = pill.filter(x => x.st);
  const score = scored.length ? Math.round(sum(scored, x => H_PTS[x.st]) / scored.length) : null;
  const tone = score == null ? 'flat' : score >= 80 ? 'ok' : score >= 55 ? 'warn' : 'bad';
  const label = score == null ? 'Sin datos suficientes' : score >= 80 ? 'Sana' : score >= 55 ? 'Estable, con puntos por vigilar' : 'En riesgo';
  return { score, tone, label, pillars: pill, projected: k.projected };
}
function healthPanel(p) {
  const h = healthOf(p); if (!h) return '';
  const R = 52, C = +(2 * Math.PI * R).toFixed(2), off = h.score == null ? C : +(C * (1 - h.score / 100)).toFixed(2);
  const dot = st => `<i class="hl-dot ${st ? 'hl-' + st : ''}" aria-hidden="true"></i>`;
  const stTxt = st => st ? STATUS[st].label : 'Sin dato';
  return `<section class="panel hl-panel" aria-labelledby="hl-t">
    <header class="pn-h"><h2 id="hl-t">Salud financiera${h.projected ? ' proyectada' : ''}</h2><div class="pn-a"><button class="btn btn-sm" type="button" data-act="bench" title="Desde qué valor cada punto está en meta o en alerta">${I.sliders} Umbrales</button></div></header>
    <div class="hl-wrap">
      <div class="hl-ring hl-${h.tone}"><svg viewBox="0 0 120 120" role="img" aria-label="Puntaje de salud: ${h.score == null ? 'sin datos' : h.score + ' de 100'}"><circle cx="60" cy="60" r="${R}" class="hl-bg"/><circle cx="60" cy="60" r="${R}" class="hl-fg" stroke-dasharray="${C}" stroke-dashoffset="${off}" style="--len:${C}" transform="rotate(-90 60 60)"/></svg>
        <div class="hl-c"><b class="hl-score">${h.score == null ? '–' : h.score}</b><span>de 100</span></div></div>
      <div class="hl-sum"><p class="hl-label hl-t-${h.tone}">${h.label}</p><p class="muted small">Seis puntos medidos con los umbrales de Ajustes: en meta suma 100, atención 60 y alerta 15. Los que no tienen datos no cuentan.</p></div>
    </div>
    <ul class="hl-list">${h.pillars.map(x => `<li><a href="${x.href}" class="hl-row">${dot(x.st)}<span class="hl-n"><b>${x.name}</b><small>${esc(x.detail)}</small></span><span class="hl-v"><b>${esc(x.val)}</b><small class="${x.st ? STATUS[x.st].cls.replace('st-', 'txt-') : 'muted'}">${stTxt(x.st)}</small></span><i class="hl-go" aria-hidden="true">${svgI('chevR', 14)}</i></a></li>`).join('')}</ul>
  </section>`;
}
// Mes anterior, mes en curso y próximo mes, lado a lado
function threeMonthsPanel(p) {
  const cols = monthWindow().map(m => ({ m, k: KP(m), h: healthOf(m) })).filter(c => c.k);
  if (!cols.length) return '';
  const tag = m => m === CUR_P ? '<span class="tm-tag live-t"><i class="live"></i> En curso</span>' : m === PREV_P ? '<span class="tm-tag">Mes anterior</span>' : '<span class="tm-tag proj-t"><i class="proj-dot"></i> Proyección</span>';
  const row = (lbl, v, cls = '') => `<div class="tm-r ${cls}"><span>${lbl}</span><b>${v}</b></div>`;
  const cards = cols.map((c, i) => { const pc = i ? cols[i - 1] : null, dv = pc ? c.k.result - pc.k.result : null, pj = isProj(c.m);
    const vs = pc ? `frente a ${mLong(pc.m).toLowerCase()}` : '';
    const pill = dv == null ? '' : `<span class="dp ${Math.abs(dv) < 0.005 ? 'dp-flat' : dv > 0 ? 'dp-good' : 'dp-bad'}" title="Resultado ${vs}">${Math.abs(dv) < 0.005 ? 'Igual' : (dv > 0 ? '▲ ' : '▼ ') + money(Math.abs(dv))}<span class="sr-only"> ${vs}</span></span>`;
    const hs = c.h && c.h.score != null ? `<i class="hl-dot hl-${c.h.tone === 'ok' ? 'green' : c.h.tone === 'warn' ? 'yellow' : 'red'}"></i>${c.h.score}/100` : '–';
    return `<button type="button" class="tm-card ${c.m === p ? 'is-on' : ''} ${pj ? 'is-proj' : ''}" data-period="${esc(c.m)}" aria-pressed="${c.m === p}" aria-label="Ver ${periodLabel(c.m)}">
      <span class="tm-h"><b>${mLong(c.m)}</b>${tag(c.m)}</span>
      <span class="tm-k"><span>Resultado del mes</span>${pill}</span>
      <span class="tm-v ${c.k.result < 0 ? 'neg' : ''}">${money(c.k.result)}</span>
      <span class="tm-rows">${row('Recurrente (MRR)', money(c.k.mrrEnd))}${row('Ingresos', money(c.k.revenue))}${row('Gastos', money(c.k.spendTotal))}${row('Inversión', money(c.k.invMonth))}${row(pj ? 'Cobro esperado' : 'Cobrado', money(c.k.cashCollected))}${row(pj ? 'Caja proyectada' : 'Caja al cierre', money(c.k.cash), c.k.cash < 0 ? 'neg' : '')}${row('Clientes activos', num(c.k.activeAtClose))}${row('Salud', hs)}</span>
    </button>`; }).join('');
  return `<section class="panel tm-panel" aria-labelledby="tm-t"><header class="pn-h"><h2 id="tm-t">Mes anterior, en curso y próximo</h2><div class="pn-a"><a class="btn btn-sm" href="#/matriz">Ver el año en la Matriz</a></div></header>
    <div class="tm-grid">${cards}</div><p class="note">El mes en curso muestra lo registrado hasta hoy; el próximo es una proyección con los planes y servicios activos, los gastos recurrentes programados y las comisiones estimadas.</p></section>`;
}
// Próximas fechas de la Agenda (citas, reuniones y fechas automáticas)
function upcomingPanel() {
  const up = agendaItems(TODAY, isoD(addDays(D(TODAY), 14))).slice(0, 6);
  const card = e => { const x = D(e.date); return `<li class="up-c ${e.sys ? 'is-sys' : ''}" style="--ec:${evColor(e)}"><span class="up-d"><small>${DOW_S[x.getUTCDay()]}</small><b>${x.getUTCDate()}</b><small>${MONTHS[x.getUTCMonth()].slice(0, 3)}</small></span><span class="up-t"><b>${esc(e.title)}</b><small>${e.sys ? esc(evKind(e)) : esc(evTime(e)) + ' · ' + esc(evKind(e))}${e.date === TODAY ? ' · <span class="live-t">hoy</span>' : ''}</small></span></li>`; };
  return `<section class="panel up-panel" aria-labelledby="up-t"><header class="pn-h"><h2 id="up-t">Próximas fechas</h2><div class="pn-a"><button class="btn btn-sm" type="button" data-ev-new="${esc(TODAY)}">${svgI('plus', 14)} Nueva cita</button><a class="btn btn-sm" href="#/agenda">Abrir la Agenda</a></div></header>
    ${up.length ? `<ul class="up-grid">${up.map(card).join('')}</ul>` : `<div class="ag-empty"><span class="ag-empty-ic">${svgI('agenda', 22)}</span><p>No hay nada agendado en las próximas dos semanas.</p></div>`}</section>`;
}
function viewResumen(p) {
  const k = KP(p); const pk = KP(prevPeriod(p));
  if (wstate() !== 'normal') return `<section class="hero">${widget(() => '', { lines: 4, h: 30 })}</section>`;
  if (!k) return `<section class="hero">${empty('Aún no hay datos de este mes.')}</section>`;
  const per = perUpTo(p), pi = projIndex(per);
  const d = pk ? k.mrrEnd - pk.mrrEnd : null;
  const chart = lineChart({ labels: per.map(mShort), series: [{ name: 'Ingreso recurrente al cierre', values: per.map(x => KP(x) ? KP(x).mrrEnd : null), color: '#FABD4B', area: true }], height: 230, w: 620, full: 1100, legend: false, projIdx: pi });
  const res = k.result;
  const athIns = typeof athenaSuggestHtml === 'function' ? athenaSuggestHtml(p) : '';
  const card = (cls, title, value, sub, neg, href, op) => `<a class="rcard ${cls}" href="${href}" ${op ? `data-op="${op}"` : ''} aria-label="${title}: ${value}. Abrir el módulo"><span class="rc-t">${title}<i class="rc-go" aria-hidden="true">${I.arrow}</i></span><b class="rc-v ${neg ? 'neg' : ''}">${value}</b><span class="rc-s">${sub}</span></a>`;
  return `${athIns}<section class="hero hero-sm hero-r" aria-labelledby="hero-t">
      <div class="hero-txt"><p id="hero-t" class="hero-k">${k.projected ? 'Ingreso recurrente mensual (MRR) proyectado' : 'Ingreso recurrente mensual (MRR)'} al cierre de ${monthYear(p)}</p>
      <p class="hero-v">${money(k.mrrEnd)}</p>
      <p class="hero-s">${d == null ? '' : `<span class="${d >= 0 ? 'pos' : 'neg'}">${d >= 0 ? '+' : '−'}${money(Math.abs(d))}</span> frente al mes anterior. `}${k.activeAtClose} cliente${k.activeAtClose === 1 ? '' : 's'} activo${k.activeAtClose === 1 ? '' : 's'}, con un ingreso promedio de ${money(k.arpuClose)} por cliente.</p></div>
      <div class="hero-ch">${chart}</div>
      <div class="hero-stats">
          <div><span>${k.projected ? 'Cobro esperado' : 'Recaudado'} en ${mLong(p).toLowerCase()}</span><b>${money(k.cashCollected)}</b><small>${k.projected ? 'Facturación del mes con IVA' : 'Pagos recibidos, con IVA'}</small></div>
          <div><span>Recurrente anual (ARR)</span><b>${money(k.mrrEnd * 12)}</b><small>Ingreso fijo al cierre × 12</small></div>
          <a class="hs-link ${k.cash == null ? '' : k.cash >= 0 ? 'hs-pos' : 'hs-neg'}" href="#/caja"><span>${k.projected ? 'Caja proyectada' : 'Saldo de caja'} ${svgI('lock', 11)}</span><b>${money(k.cash)}</b><small>Automático: cobros − egresos</small></a>
          <div><span>Clientes activos</span><b>${k.activeAtClose}</b><small>${k.pausedAtClose ? `${k.pausedAtClose} en pausa` : 'Ninguno en pausa'}</small></div>
          <div class="${k.churnedClients ? 'hs-neg' : ''}"><span>Clientes en baja (churn)</span><b>${k.churnedClients}</b><small>${k.churnPct == null ? 'Sin cartera al inicio del mes' : pct(k.churnPct) + ' de la cartera del inicio'}</small></div>
          <div><span>Egresos de ${mLong(p).toLowerCase()}</span><b>${money(k.egresoMes)}</b><small>Incluye ${money(k.invMes)} de inversión</small></div>
      </div>
    </section>
    <section class="panel result" aria-labelledby="res-t">
      <header class="pn-h"><h2 id="res-t">${k.projected ? 'Resultado proyectado' : 'Resultado'} de ${monthYear(p)}</h2><div class="pn-a"><a class="btn" href="#/rentabilidad">Ver el detalle</a></div></header>
      <div class="rgrid">
        ${card('rc-in', 'Ingresos', money(k.revenue), `${money(k.mrr)} recurrentes y ${money(k.nonMrr)} por única vez`, false, '#/ingresos')}
        <span class="rop" aria-hidden="true">−</span>
        ${card('rc-out', 'Gastos', money(k.spendTotal), 'Lo que cuesta operar el mes', false, '#/gastos', '−')}
        <span class="rop" aria-hidden="true">−</span>
        ${card('rc-inv', 'Inversión', money(k.invMonth), 'Captación de clientes y producto', false, '#/inversion', '−')}
        <span class="rop" aria-hidden="true">=</span>
        ${card('rc-res', 'Resultado del mes', money(res), `Antes de invertir: ${money(k.resultBefore)}`, res < 0, '#/rentabilidad', '=')}
      </div>
    </section>
    <div class="rs-duo">${healthPanel(p)}${threeMonthsPanel(p)}</div>
    ${upcomingPanel()}
`;
}

/* ====================== INGRESOS ====================== */
function viewIngresos(p) {
  const k = KP(p);
  const defs = [
    { key: 'mrr', name: 'Ingreso fijo del mes (MRR)', fmt: 'money', info: 'Planes Ágora y servicios mensuales (correos, Meta Ads, marketing, gestión de landing), prorrateados por días. Sin IVA ni la API de WhatsApp.', foot: x => `Planes ${money(x.mrrPlans)} · servicios ${money(x.mrrServices)}` },
    { key: 'nonMrr', name: 'Ingresos por única vez', fmt: 'money', info: 'Implementación inicial, integración de canales, implementación de IA y creación de landing page. Sin IVA.' },
    { key: 'revenue', name: 'Ingreso total del mes', fmt: 'money', info: 'Ingreso fijo + ingresos por única vez. El IVA cobrado no es ingreso.', foot: x => `IVA facturado aparte: ${money(x.ivaBilled)}` },
    { key: 'revenueGoal', name: 'Cumplimiento de la meta', fmt: 'pct', bench: 'revenueGoal', info: 'Ingreso total del mes entre la meta que definiste para ese mes.', foot: x => `Meta ${money(x.goal)}` },
    { key: 'nrr', name: 'Retención de ingresos (NRR)', fmt: 'pct', bench: 'nrr', info: 'De lo que te pagaban los clientes que ya tenías, cuánto conservaste sumando subidas de plan y servicios nuevos, y restando bajas y reducciones.' },
    { key: 'churnMrr', name: 'Ingreso perdido por bajas', fmt: 'pct', bench: 'churnMrr', info: 'Ingreso fijo que se fue por clientes que se dieron de baja o bajaron de plan, sobre el ingreso fijo del inicio del mes.' },
  ];
  const per = perUpTo(p);
  const trend = widget(() => barChart({ w: 520, height: 260, labels: per.map(mShort), projIdx: projIndex(per), stacked: true, highlight: per.length - 1, series: [
    { name: 'Ingreso fijo', values: per.map(x => KP(x) && KP(x).mrr), color: '#00A86B' },
    { name: 'Por única vez', values: per.map(x => KP(x) && KP(x).nonMrr), color: '#7B61FF' }],
    line: { name: 'Meta', values: per.map(x => goalFor(x)), color: '#FABD4B' } }), { lines: 6 });
  const mix = widget(() => `<div class="mix">${donut(k.planMix, k.mrrEnd)}<div class="mix-l">${k.planMix.map(m => `<div class="mix-r"><i class="sw" style="background:${PLAN_COLOR[m.plan]}"></i><span>${LINE_LABEL[m.plan]}<small>${m.clients} cliente${m.clients === 1 ? '' : 's'}</small></span><b>${money(m.mrr)}</b><em>${pct(m.pct, 0)}</em></div>`).join('')}</div></div>`, { lines: 5 });
  const prods = productRevenue(db, p); const totalR = sum(prods, x => x.revenue);
  const prodB = widget(() => board({ cols: [{ label: 'Producto o servicio' }, { label: 'Clientes', cls: 'r', w: '90px' }, { label: 'Ingreso del mes', cls: 'r', w: '140px' }, { label: 'Peso', w: '28%' }],
    groups: [true, false].map(rec => ({ label: rec ? 'Recurrentes · se cobran cada mes' : 'Única vez · se cobran una sola vez', color: rec ? '#00A86B' : '#7B61FF', sub: money(sum(prods.filter(x => x.recurring === rec), x => x.revenue)), emptyText: 'Sin ventas de este tipo en el mes.',
      rows: prods.filter(x => x.recurring === rec).map(x => ({ cells: [esc(x.short), x.clients, money(x.revenue), `<span class="pbar"><i style="width:${totalR ? (x.revenue / totalR * 100).toFixed(1) : 0}%;background:${rec ? '#00A86B' : '#7B61FF'}"></i></span><small class="muted">${pct(totalR ? x.revenue / totalR * 100 : null, 0)}</small>`] })) })),
    foot: ['Total sin IVA', '', money(totalR), ''] }), { lines: 6 });
  const MV = { NEW: ['Cliente nuevo', 'sc-ok'], UPGRADE: ['Expansión', 'sc-ok'], DOWNGRADE: ['Reducción', 'sc-warn'], CHURN: ['Baja', 'sc-bad'], REACTIVATION: ['Reactivación', 'sc-blue'] };
  const mv = k ? k.movements.slice().sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)) : [];
  const movB = widget(() => mv.length ? board({ cols: [{ label: 'Cliente' }, { label: 'Movimiento', w: '150px' }, { label: 'Fecha', w: '130px' }, { label: 'Cambio en el ingreso fijo', cls: 'r', w: '200px' }],
    groups: [{ rows: mv.map(m => ({ cells: [`<b>${esc(db.clients.find(c => c.id === m.clientId).name)}</b>`, stCell(MV[m.type][0], MV[m.type][1]), fmtDate(m.effectiveDate), `<span class="${m.amountDelta < 0 ? 'txt-bad' : 'txt-ok'}">${m.amountDelta > 0 ? '+' : ''}${money(m.amountDelta)}</span>`] })) }] }) : empty('No hubo altas, bajas ni cambios de plan este mes.'), { lines: 4 });
  return `${microGrid(defs, p)}
    <div class="duo">${panel('Ingresos por mes', trend, `<button class="btn btn-sm" data-act="goal">${svgI('edit', 14)} Meta</button>`)}${panel('Ingreso fijo por línea al cierre', mix)}</div>
    ${panel('Ingresos por producto y servicio', prodB, `<button class="btn btn-sm" data-act="catalog">${svgI('edit', 14)} Catálogo y precios</button>`)}
    ${panel('Movimientos del ingreso fijo', movB)}`;
}

/* ====================== FACTURACIÓN ====================== */
const FACT_STATUS = { PAID: ['Pagada', 'sc-ok'], PENDING: ['Por cobrar', 'sc-warn'], OVERDUE: ['Vencida', 'sc-bad'] };
function nextCutoff() { const t = D(TODAY); let y = t.getUTCFullYear(), m = t.getUTCMonth() + 1; if (t.getUTCDate() > CUTOFF_DAY) { m++; if (m > 12) { m = 1; y++; } } return `${y}-${String(m).padStart(2, '0')}-${String(CUTOFF_DAY).padStart(2, '0')}`; }
function cycleRows(p) {
  const lastDay = addDays(monthEnd(p), -1); const first = monthStart(p);
  return db.clients.filter(c => clientActiveOn(db, c.id, first) || clientActiveOn(db, c.id, lastDay)).map(c => {
    const subs = db.subscriptions.filter(s => s.clientId === c.id && (activeOn(s, first) || activeOn(s, lastDay)));
    const lines = subs.map(s => ({ name: prodOf(s.productId).short, amount: s.monthlyFee }));
    const amount = sum(lines, l => l.amount);
    const inv = db.invoices.find(i => i.clientId === c.id && inPeriod(i.issueDate, p) && !i.voided);
    return { c, lines, amount, inv };
  }).sort((a, b) => a.c.name.localeCompare(b.c.name, 'es'));
}
function viewFacturacion(p) {
  const k = KP(p); const ref = p === TODAY.slice(0, 7) ? addDays(D(TODAY), 1) : monthEnd(p); // mes en curso: estado a hoy
  const invs = db.invoices.filter(i => !i.voided && inPeriod(i.issueDate, p));
  const nc = nextCutoff(); const ivaR = ivaRate;
  const defs = [
    { key: 'factSub', name: 'Facturado en el ciclo (sin IVA)', fmt: 'money', info: 'Suma de las facturas emitidas en el mes, sin IVA.', get: x => sum(db.invoices.filter(i => !i.voided && inPeriod(i.issueDate, x.p)), i => i.subtotal || 0), foot: () => `IVA facturado: ${money(k ? k.ivaBilled : 0)}` },
    { key: 'factCount', name: 'Facturas emitidas', fmt: 'count', neutral: true, info: 'Cantidad de facturas emitidas en el mes.', get: x => db.invoices.filter(i => !i.voided && inPeriod(i.issueDate, x.p)).length },
    { key: 'factPaid', name: 'Facturas cobradas del ciclo', fmt: 'pct', info: 'Facturas del mes que ya están pagadas, sobre el total emitido.', get: x => { const l = db.invoices.filter(i => !i.voided && inPeriod(i.issueDate, x.p)); return l.length ? l.filter(i => invoiceStatus(i, monthEnd(x.p)) === 'PAID').length / l.length * 100 : null; } },
    { key: 'onTimePct', name: 'Cobro puntual del día 5', fmt: 'pct', bench: 'onTimePct', info: 'Clientes que pagaron a más tardar el día 5 de su ciclo.', foot: x => `${x.onTime} de ${x.dueOn5} a tiempo` },
  ];
  const cyc = cycleRows(p);
  const cycB = widget(() => board({ cols: [{ label: 'Cliente' }, { label: 'Qué se le cobra este ciclo' }, { label: 'Subtotal', cls: 'r', w: '110px' }, { label: `IVA ${num(ivaR)}%`, cls: 'r', w: '100px' }, { label: 'Total', cls: 'r', w: '110px' }, { label: 'Factura', w: '150px' }, { label: 'Estado', w: '120px' }],
    groups: [{ rows: cyc.map(r => { const st = r.inv ? invoiceStatus(r.inv, ref) : null; return { cells: [`<b>${esc(r.c.name)}</b>`, r.lines.length ? r.lines.map(l => `${esc(l.name)} <span class="muted">${money(l.amount)}</span>`).join('<br>') : '<span class="muted">Solo ventas por única vez</span>', money(r.amount), money(r.amount * ivaR / 100), money(r.amount * (1 + ivaR / 100)), r.inv ? `${r.inv.id}${r.inv.imported ? '<small class="muted">Facturero</small>' : ''}` : '<span class="muted">Sin factura</span>', r.inv ? stCell(FACT_STATUS[st][0], FACT_STATUS[st][1]) : stCell('Por facturar', 'sc-gold')] }; }) }],
    foot: ['Total del ciclo', '', money(sum(cyc, r => r.amount)), money(sum(cyc, r => r.amount) * ivaR / 100), money(sum(cyc, r => r.amount) * (1 + ivaR / 100)), '', ''] }), { lines: 6 });
  const invB = widget(() => invs.length ? board({ cols: [{ label: 'N°', w: '130px' }, { label: 'Cliente' }, { label: 'Emisión', cls: 'nw', w: '110px' }, { label: 'Vence', cls: 'nw', w: '110px' }, { label: 'Subtotal', cls: 'r' }, { label: 'IVA', cls: 'r' }, { label: 'Total', cls: 'r' }, { label: 'Estado', w: '116px' }, { label: 'Pago', cls: 'nw', w: '230px' }],
    groups: [{ rows: invs.sort((a, b) => a.issueDate.localeCompare(b.issueDate)).map(i => { const st = invoiceStatus(i, ref); const c = db.clients.find(x => x.id === i.clientId); return { cells: [`${i.id}${i.imported ? '<small class="muted">Facturero</small>' : ''}`, esc(c.name), fmtDate(i.issueDate), fmtDate(i.dueDate), money(i.subtotal, 2), money(i.iva, 2), money((i.subtotal || 0) + (i.iva || 0), 2), stCell(FACT_STATUS[st][0], FACT_STATUS[st][1]), invPayCell(i, st)] }; }) }] }) : empty('Aún no hay facturas emitidas este mes.'), { lines: 6 });
  return `<div class="cycle"><div class="cy-i">${svgI('calendar', 20)}</div><div><b>Ciclo de facturación: corte el día ${CUTOFF_DAY} de cada mes</b><span>Las facturas se emiten el día 1 y vencen el día ${CUTOFF_DAY}. Si el cliente no paga, ese día decides en Cobranza si se le corta el servicio. Próximo corte: <b>${fmtDate(nc)}</b>.</span></div></div>
    ${microGrid(defs, p)}
    ${panel(`Qué se cobra en el ciclo de ${monthYear(p)}`, cycB)}
    ${panel('Facturas del mes', invB, `<a class="btn btn-sm btn-cta" href="#/facturero">Crear factura <span class="cta-dot">${I.arrow}</span></a>`)}
    ${allInvoicesPanel()}`;
}
function viewFacturero() {
  if (SRV) return SRV.fiscalView();
  return `${panel('Facturero de Ágora', `<p class="pn-d">Es el mismo facturero que ya usas. Tus clientes del tablero aparecen en <b>Mis clientes</b>, y cada factura que guardes entra sola al tablero: los planes y servicios mensuales como ingreso recurrente, y lo demás como ingreso por única vez.</p><div class="fact-frame"><iframe id="factFrame" title="Facturero de Ágora" loading="lazy"></iframe></div>`, `<button class="btn btn-sm" data-act="sync-fact">${svgI('sync', 14)} Sincronizar ahora</button>`)}`;
}

/* ====================== GASTOS ====================== */
function gastosAnualesPanel(p) {
  const k = KP(p); const pk = KP(prevPeriod(p)); if (!k) return '';
  return `    <section class="panel" aria-labelledby="gx-t">
      <header class="pn-h"><h2 id="gx-t">Gastos de ${p.slice(0, 4)}, incluida la inversión</h2><div class="pn-a"><a class="btn" href="#/matriz">Ver en la Matriz</a></div></header>
      <div class="gx">
        <div class="gx-cards">
          <a class="gx-c" href="#/gastos"><span>Gastos mensuales · ${mLong(p).toLowerCase()}</span><b>${money(k.egresoMes)}</b><small>${money(k.gastoMes)} de operación + ${money(k.invMes)} de inversión</small>${pk ? `<em class="${k.egresoMes > (pk.egresoMes || 0) ? 'neg' : 'pos'}">${k.egresoMes > (pk.egresoMes || 0) ? '▲' : '▼'} ${money(Math.abs(k.egresoMes - (pk.egresoMes || 0)))} frente al mes anterior</em>` : ''}</a>
          <a class="gx-c" href="#/matriz"><span>Gastos anuales · enero a ${mLong(p).toLowerCase()}</span><b>${money(k.egresoAno)}</b><small>${money(k.gastoAno)} de operación + ${money(k.invAno)} de inversión</small><em>Promedio mensual ${money(k.egresoAno / Math.max(1, MX_MONTHS.filter(m => m <= p && (sum(Object.values(expenseByCat(m))) + sum(Object.values(invByCat(m)))) > 0).length || 1))}</em></a>
        </div>
        <div class="gx-ch">${barChart({ w: 720, full: 1000, height: 230, labels: MX_MONTHS.filter(m => m <= p).map(mShort), projIdx: projIndex(MX_MONTHS.filter(m => m <= p)), stacked: true, highlight: MX_MONTHS.filter(m => m <= p).length - 1, series: [
          { name: 'Gastos de operación', values: MX_MONTHS.filter(m => m <= p).map(m => sum(Object.values(expenseByCat(m)))), color: '#E2445C' },
          { name: 'Inversión', values: MX_MONTHS.filter(m => m <= p).map(m => sum(Object.values(invByCat(m)))), color: '#FABD4B' }] })}</div>
      </div>
    </section>`;
}

function viewGastos(p) {
  const k = KP(p);
  const defs = [
    { key: 'spendTotal', name: 'Gasto total del mes', fmt: 'money', better: 'down', info: 'Todas las categorías de gasto más el consumo de IA y APIs de los clientes.' },
    { key: 'budgetExec', name: 'Gasto contra presupuesto', fmt: 'pct', bench: 'budgetExec', info: 'Gasto total entre el presupuesto del mes. Más de 100% significa que te pasaste.', foot: x => `Presupuesto ${money(x.budgetTotal)}` },
    { key: 'cogsSpend', name: 'Costo de atender a los clientes', fmt: 'money', better: 'down', info: 'Consumo de IA y APIs, comisiones de venta y pagos a afiliados.' },
    { key: 'opex', name: 'Gasto operativo', fmt: 'money', better: 'down', info: 'Nómina, herramientas, servidores, publicidad propia, contador, oficina y comisiones bancarias.' },
  ];
  const per = perUpTo(p);
  const trend = widget(() => barChart({ labels: per.map(mShort), projIdx: projIndex(per), stacked: true, highlight: per.length - 1, series: ['COGS', 'OPEX', 'BELOW'].map(g => ({ name: GROUP_LABEL[g], color: GROUP_COLOR[g], values: per.map(x => { const kk = KP(x); return kk ? sum(ALL_CATS().filter(c => c.group === g), c => kk.spendByCat[c.id] || 0) : null; }) })),
    line: { name: 'Presupuesto', color: '#FABD4B', values: per.map(x => KP(x) && KP(x).budgetTotal) } }), { lines: 6 });
  const cats = ALL_CATS();
  const groups = ['COGS', 'OPEX', 'BELOW'].map(g => {
    const rows = cats.filter(c => c.group === g); const gB = sum(rows, c => budgetFor(p, c.id)), gR = sum(rows, c => (k ? k.spendByCat[c.id] : 0) || 0);
    return { label: GROUP_LABEL[g], color: GROUP_COLOR[g], sub: `${money(gR)} de ${money(gB)}`, rows: rows.map(c => { const bv = budgetFor(p, c.id), rv = (k ? k.spendByCat[c.id] : 0) || 0, ex = bv ? rv / bv * 100 : null;
      const st = ex == null ? (rv ? ['Sin presupuesto', 'sc-gray'] : ['Sin movimiento', 'sc-gray']) : ex > 110 ? ['Pasado', 'sc-bad'] : ex > 100 ? ['Al límite', 'sc-warn'] : ['Dentro', 'sc-ok'];
      return { cells: [`${esc(c.label)}${c.auto ? '<small class="muted">Automático, sale del consumo de cada cliente</small>' : ''}`, money(bv), money(rv), `<span class="${rv > bv ? 'txt-bad' : ''}">${bv || rv ? (rv - bv > 0 ? '+' : '') + money(rv - bv) : '—'}</span>`, `<span class="pbar"><i style="width:${Math.min(ex || 0, 100)}%;background:${ex > 100 ? 'var(--bad)' : GROUP_COLOR[g]}"></i></span><small class="muted">${ex == null ? '—' : pct(ex, 0)}</small>`, stCell(st[0], st[1])] }; }) };
  });
  const bvr = widget(() => (k.budgetTotal ? '' : `<p class="pn-d">Todavía no definiste presupuesto. Usa el botón Presupuesto para poner cuánto esperas gastar al mes en cada categoría.</p>`) + board({ cols: [{ label: 'Categoría' }, { label: 'Presupuesto', cls: 'r', w: '120px' }, { label: 'Real', cls: 'r', w: '120px' }, { label: 'Diferencia', cls: 'r', w: '120px' }, { label: 'Ejecución', w: '170px' }, { label: 'Estado', w: '140px' }], groups,
    foot: ['Total', money(k.budgetTotal), money(k.spendTotal), (k.spendTotal - k.budgetTotal > 0 ? '+' : '') + money(k.spendTotal - k.budgetTotal), '', ''] }), { lines: 8, h: 22 });
  const entries = db.expenses.filter(e => e.period === p).sort((a, b) => (b.date || b.period).localeCompare(a.date || a.period) || catLabel(a.category).localeCompare(catLabel(b.category)));
  const catOpts = sel => ['COGS', 'OPEX', 'BELOW'].map(g => `<optgroup label="${esc(GROUP_LABEL[g])}">${ALL_CATS().filter(c => !c.auto && c.group === g).map(c => `<option value="${esc(c.id)}" ${sel === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</optgroup>`).join('');
  const quick = `<form class="qadd" data-form="exp" data-quick="1" novalidate>
      <label class="fld qa-c"><span>Concepto</span><input name="concept" maxlength="120" placeholder="Ej. Pago del contador"></label>
      <label class="fld qa-k"><span>Categoría</span><select name="category">${catOpts('software')}</select></label>
      <label class="fld qa-d"><span>Fecha</span><input type="date" name="date" value="${esc(defaultExpDate())}"></label>
      <label class="fld qa-m"><span>Monto</span><input name="amount" type="number" min="0" step="0.01" placeholder="0,00"></label>
      <label class="fld qa-u"><span>Moneda</span><select name="currency">${opts(CURRENCIES, 'USD')}</select></label>
      <button class="btn btn-cta qa-b" type="submit">Agregar <span class="cta-dot">${I.arrow}</span></button>
      <div class="qa-x"><label class="fld chk qa-rec"><input type="checkbox" name="recurrent"> Recurrente (fijo mes a mes)</label>
        <label class="fld"><span>Último cobro (opcional)</span><input type="date" name="recEnd"></label>
        <label class="fld"><span>¿Quién lo paga?</span><select name="payerId">${payerOpts('')}</select></label>
        <label class="fld fld-grow"><span>A quién se le paga</span><input name="payee" maxlength="100" placeholder="Proveedor o beneficiario"></label></div>
      <p class="muted small qa-e">Si es recurrente, la fecha es el primer cobro: el gasto se registra solo cada mes ese mismo día. Si la fecha es futura, se registra al llegar.</p>
      <p class="form-err qa-e" hidden></p></form>`;
  const list = widget(() => entries.length ? board({ cols: [{ label: 'Fecha', cls: 'nw', w: '110px' }, { label: 'Concepto' }, { label: 'Categoría', w: '26%' }, { label: 'Monto', cls: 'r', w: '150px' }, { label: '', w: '130px' }],
    groups: [{ rows: entries.map(e => ({ cls: e.projected ? 'row-proj' : '', cells: [fmtDate(e.date || e.period + '-01'), `<b>${esc(e.concept || catLabel(e.category))}</b>${e.recId ? '<span class="pill pill-rec">Recurrente</span>' : ''}${e.payerId ? `<span class="pill pill-inv">Lo pagó ${esc(investorName(e.payerId))}</span>` : ''}${e.payee ? `<small class="muted">Se le pagó a ${esc(e.payee)}</small>` : ''}`, esc(catLabel(e.category)), `${money(toUsd(db, e.amount, e.currency, p + '-01'), 2)}${e.currency !== 'USD' ? `<small class="muted">${num(e.amount, 2)} ${e.currency}</small>` : ''}`, e.projected ? `<span class="pill pill-proj" title="Se registra solo el ${fmtDate(e.date)}">${svgI('spark', 12)} Proyectado</span>` : e.source === 'auto' ? `<a class="btn btn-sm" href="#/comisiones">Ver en Comisiones</a>` : e.source === 'auto-pago' ? `<span class="pill pill-rec" title="Se calcula sola al registrar el pago">Automático</span>` : `<span class="acts"><button class="btn btn-sm" data-exp-edit="${esc(e.id)}">Editar</button><button class="icon-btn" data-exp-del="${esc(e.id)}" aria-label="Eliminar ${esc(e.concept || '')}">${I.trash}</button></span>`] })) }],
    foot: ['', `${entries.length} gasto${entries.length === 1 ? '' : 's'}`, '', money(sum(entries, e => toUsd(db, e.amount, e.currency, p + '-01'))), ''] }) : empty(`Aún no hay gastos registrados en ${monthYear(p)}. Agrégalos arriba: cada uno se suma al gasto del mes y al resultado.`), { lines: 6 });
  return `${microGrid(defs, p)}
    ${gastosAnualesPanel(p)}
    ${panel(`Gastos registrados en ${monthYear(p)}`, quick + list)}
    ${recPanel()}
    ${panel('Presupuesto contra real por categoría', bvr, `<button class="btn btn-sm" data-act="budget">${svgI('edit', 14)} Presupuesto</button><button class="btn btn-sm" data-act="sheet">${svgI('upload', 14)} Importar desde la hoja</button>`)}
    ${panel('Gasto por mes contra presupuesto', trend)}`;
}
function defaultExpDate() { const p = state.period; return p === TODAY.slice(0, 7) ? TODAY : isoD(addDays(monthEnd(p), -1)); }

/* ====================== RENTABILIDAD ====================== */
function viewRentabilidad(p) {
  const k = KP(p);
  const defs = [
    { key: 'grossMargin', name: 'Margen bruto', fmt: 'pct', bench: 'grossMargin', info: 'Lo que queda de cada dólar de ingreso después de pagar lo que cuesta atender a los clientes (consumo, horas del equipo con clientes, comisiones).' },
    { key: 'ebitda', name: 'Ganancia operativa (EBITDA)', fmt: 'money', info: 'Ingresos menos consumo y todos los gastos, sin contar impuestos ni depreciación.' },
    { key: 'ebitdaPct', name: 'Margen operativo', fmt: 'pct', bench: 'ebitdaPct', info: 'Ganancia operativa entre ingresos.' },
    { key: 'netMargin', name: 'Margen neto', fmt: 'pct', info: 'Ganancia operativa menos impuestos y depreciación, sobre los ingresos.' },
  ];
  const pl = widget(() => {
    const row = (label, v, cls = '', note = '') => `<tr class="${cls}"><th scope="row">${label}${note ? `<small>${note}</small>` : ''}</th><td>${money(v)}</td><td>${k.revenue ? pct(v / k.revenue * 100, 0) : '—'}</td></tr>`;
    return `<table class="pl"><thead><tr><th scope="col">Concepto</th><th scope="col">Monto</th><th scope="col">% de ingresos</th></tr></thead><tbody>
      ${row('Ingresos recurrentes', k.mrr)}${row('Ingresos por única vez', k.nonMrr)}${row('Ingresos totales', k.revenue, 'pl-sub')}
      ${row('Costo de atender a los clientes', -k.cogsSpend, '', 'Consumo de IA y APIs, comisiones y afiliados')}${row('Gasto operativo', -k.opex, '', 'Nómina, herramientas, servidores, publicidad, contador, oficina')}
      ${row('Ganancia operativa (EBITDA)', k.revenue - k.cogsSpend - k.opex, 'pl-sub')}${row('Impuestos y depreciación', -k.belowSpend)}
      ${row('Resultado antes de invertir', k.resultBefore, 'pl-sub')}${row('Inversión del mes', -k.invMonth, '', 'Captación de clientes y producto')}
      ${row('Resultado del mes', k.result, 'pl-tot ' + (k.result < 0 ? 'neg' : 'pos'))}</tbody></table>`;
  }, { lines: 8 });
  const per = perUpTo(p);
  const trend = widget(() => lineChart({ labels: per.map(mShort), projIdx: projIndex(per), series: [
    { name: 'Margen bruto', values: per.map(x => KP(x) && KP(x).grossMargin), color: '#7B61FF' },
    { name: 'Margen operativo', values: per.map(x => KP(x) && KP(x).ebitdaPct), color: '#00A86B' }], fmtAxis: v => num(v) + '%', fmtVal: v => pct(v), height: 250, w: 520 }), { lines: 5 });
  const lines = k ? revenueLines(db, p, k).filter(x => x.revenue > 0) : [];
  const lineB = widget(() => hbars(lines.map(x => ({ label: LINE_LABEL[x.line], sub: `${money(x.revenue)} de ingreso`, value: x.marginPct || 0, color: (x.marginPct || 0) < 50 ? 'var(--bad)' : PLAN_COLOR[x.line] })), { fmt: v => pct(v, 0), max: 100 }), { lines: 5 });
  const rows = k ? clientMatrix(db, p, k).filter(r => r.billing > 0).sort((a, b) => a.marginPct - b.marginPct).slice(0, 6) : [];
  const worst = widget(() => rows.length ? board({ cols: [{ label: 'Cliente' }, { label: 'Ingreso', cls: 'r', w: '120px' }, { label: 'Costo de atenderlo', cls: 'r', w: '160px' }, { label: 'Margen', cls: 'r', w: '100px' }, { label: 'Estado', w: '130px' }],
    groups: [{ rows: rows.map(r => ({ cells: [`<b>${esc(r.name)}</b><small class="muted">${r.plan ? PLANS[r.plan].label : 'Sin plan'}</small>`, money(r.billing), money(r.billing - r.margin), pct(r.marginPct, 0), stCell(r.marginPct < 50 ? 'Margen bajo' : r.marginPct < 65 ? 'Ajustado' : 'Sano', r.marginPct < 50 ? 'sc-bad' : r.marginPct < 65 ? 'sc-warn' : 'sc-ok')] })) }] }) : empty('Aún no hay clientes facturados este mes.'), { lines: 6 });
  return `${panel(`Estado de resultados de ${monthYear(p)}`, pl)}${microGrid(defs, p)}<div class="duo">${panel('Márgenes por mes', trend)}${panel('Margen bruto por línea', lineB)}</div>${panel('Clientes que menos margen dejan', worst)}`;
}

/* ====================== CAJA ====================== */
// Libro de caja: cada cobro, gasto, inversión y comisión del mes, con el saldo acumulado.
// Usa exactamente las mismas cifras que el saldo de caja del tablero, así que cuadra con él.
const LEDGER_KIND = { COBRO: ['Cobro', 'sc-ok'], ABONO: ['Abono', 'sc-teal'], GASTO: ['Gasto', 'sc-bad'], FEE: ['Comisión de cobro', 'sc-gray'], IMPL: ['Implementación', 'sc-warn'], INVERSION: ['Inversión', 'sc-violet'], COMISION: ['Comisión', 'sc-gold'], CONSUMO: ['Consumo de IA', 'sc-gray'] };
function cashLedger(p) {
  const rows = [], proj = isProj(p);
  if (!proj) db.invoices.filter(i => !i.voided).forEach(i => {
    const c = db.clients.find(x => x.id === i.clientId), cn = c ? c.name : '—';
    if (i.pays && i.pays.length) i.pays.filter(x => inPeriod(x.date, p)).forEach(x => { const pg = pagos.find(z => z.id === x.id) || {}; rows.push({ date: x.date, kind: pg.settle === false ? 'ABONO' : 'COBRO', concept: `Factura ${i.num || i.id} · ${cn}`, sub: payDetail(pg), inn: x.usd, out: 0 }); });
    else if (i.paidDate && inPeriod(i.paidDate, p)) { const pr = payRefs[i.id]; rows.push({ date: i.paidDate, kind: 'COBRO', concept: `Factura ${i.num || i.id} · ${cn}`, sub: pr ? `Ref. ${pr.ref}${pr.method ? ' · ' + (PAY_METHODS[pr.method] || '') : ''}` : '', inn: invoiceUsd(db, i) || 0, out: 0 }); }
  });
  else db.clients.forEach(c => { const b = clientRecUni(db, c.id, p), v = (b.rec + b.uni) * (1 + ivaRate / 100); if (v > 0.004) rows.push({ date: `${p}-${String(CUTOFF_DAY).padStart(2, '0')}`, kind: 'COBRO', concept: `Cobro esperado · ${c.name}`, sub: 'Facturación del mes con IVA', inn: v, out: 0, proj: true }); });
  db.expenses.filter(e => e.period === p).forEach(e => rows.push({ date: e.date || p + '-01', kind: e.source === 'auto' ? 'IMPL' : e.source === 'auto-pago' ? 'FEE' : 'GASTO', concept: e.concept || catLabel(e.category), sub: `${catLabel(e.category)}${e.payee ? ' · se le pagó a ' + e.payee : ''}${e.payerId ? ' · lo pagó ' + investorName(e.payerId) : ''}`, inn: 0, out: toUsd(db, e.amount, e.currency, p + '-01') || 0, proj: !!e.projected }));
  const use = sum(db.usageCosts.filter(u => u.billingPeriod === p), u => u.costUsd); if (use > 0) rows.push({ date: p + '-28', kind: 'CONSUMO', concept: 'Consumo de IA y APIs de los clientes', sub: '', inn: 0, out: use });
  allInvestments().filter(x => x.date.slice(0, 7) === p).forEach(x => rows.push({ date: x.date, kind: x.auto ? 'COMISION' : 'INVERSION', concept: x.concept, sub: INVEST_CATS[x.category] || 'Inversión', inn: 0, out: toUsd(db, x.amount, x.currency, x.date) || x.amount, proj: proj || x.date > TODAY }));
  rows.sort((a, b) => a.date.localeCompare(b.date) || (b.inn - a.inn));
  const open = p > CASH_START ? (cashAt(prevPeriod(p)) || 0) : 0; let bal = open;
  rows.forEach(r => { bal += r.inn - r.out; r.bal = bal; });
  return { rows, open, close: bal, inn: sum(rows, r => r.inn), out: sum(rows, r => r.out) };
}
function viewCaja(p) {
  const defs = [
    { key: 'cash', name: 'Efectivo en caja', fmt: 'money', info: 'Saldo de caja al cierre del mes: cobros recibidos menos egresos pagados (gastos e inversión), acumulado desde enero.' },
    { key: 'cashCollected', name: 'Cobrado en el mes', fmt: 'money', info: 'Facturas pagadas dentro del mes, con IVA incluido. En un mes proyectado es lo que se espera cobrar.' },
    { key: 'netFlow', name: 'Flujo neto del mes', fmt: 'money', info: 'Lo cobrado menos los gastos y la inversión del mes. Negativo significa que la caja bajó.' },
    { key: 'runway', name: 'Meses que aguanta la caja', fmt: 'months', bench: 'runway', info: 'Efectivo en caja entre el consumo neto promedio de los últimos 3 meses. Si cobras más de lo que gastas, la operación se paga sola.', foot: x => x.cash != null && x.cash <= 0 ? 'La caja está en negativo' : '' },
  ];
  const per = perUpTo(p);
  const ch = widget(() => barChart({ labels: per.map(mShort), projIdx: projIndex(per), highlight: per.length - 1, series: [
    { name: 'Cobrado', values: per.map(x => KP(x) && KP(x).cashCollected), color: '#00A86B' },
    { name: 'Egresos (gastos e inversión)', values: per.map(x => KP(x) && (KP(x).totalSpend + KP(x).invMonth)), color: '#E2445C' }],
    line: { name: 'Efectivo en caja', values: per.map(x => KP(x) && KP(x).cash), color: '#579BFC' } }), { lines: 6 });
  const L = cashLedger(p), f = state.cajaF || (state.cajaF = { kind: 'all', q: '' });
  const vis = L.rows.filter(r => (f.kind === 'all' || (f.kind === 'in' ? r.inn > 0 : r.out > 0)) && (!f.q || normTxt(`${r.concept} ${r.sub} ${LEDGER_KIND[r.kind][0]}`).includes(normTxt(f.q))));
  const tools = `<div class="toolbar ld-tools" role="search"><div class="seg" role="group" aria-label="Qué mostrar">${[['all', 'Todo'], ['in', 'Entradas'], ['out', 'Salidas']].map(([v, l]) => `<button type="button" class="seg-b ${f.kind === v ? 'is-on' : ''}" data-caja-f="${esc(v)}" aria-pressed="${f.kind === v}">${l}</button>`).join('')}</div><label class="fld fld-grow"><span class="sr-only">Buscar</span><input type="search" data-ff="caja-q" value="${esc(f.q)}" placeholder="Buscar cliente, proveedor o concepto"></label></div>`;
  const tb = board({ cls: 'bt-ledger', cols: [{ label: 'Fecha', cls: 'nw', w: '110px' }, { label: 'Movimiento', w: '140px' }, { label: 'Concepto' }, { label: 'Entrada', cls: 'r', w: '130px' }, { label: 'Salida', cls: 'r', w: '130px' }, { label: 'Saldo', cls: 'r', w: '140px' }],
    groups: [{ emptyText: L.rows.length ? 'Ningún movimiento coincide con el filtro.' : `Sin movimientos de caja en ${monthYear(p)}.`, rows: [
      ...(f.kind === 'all' && !f.q ? [{ cls: 'ld-open', cells: [fmtDate(p + '-01'), '<span class="muted">Saldo inicial</span>', `<b>Saldo al inicio de ${mLong(p).toLowerCase()}</b>`, '', '', `<b class="${L.open < 0 ? 'txt-bad' : ''}">${money(L.open, 2)}</b>`] }] : []),
      ...vis.map(r => ({ cls: r.proj ? 'row-proj' : '', cells: [fmtDate(r.date), stCell(LEDGER_KIND[r.kind][0], LEDGER_KIND[r.kind][1]), `<b>${esc(r.concept)}</b>${r.sub ? `<small class="muted">${esc(r.sub)}</small>` : ''}${r.proj ? '<span class="pill pill-proj">Proyectado</span>' : ''}`, r.inn ? `<span class="txt-ok">+${money(r.inn, 2)}</span>` : '', r.out ? `<span class="txt-bad">−${money(r.out, 2)}</span>` : '', `<span class="${r.bal < 0 ? 'txt-bad' : ''}">${money(r.bal, 2)}</span>`] }))] }],
    foot: ['', `${vis.length} movimiento(s)`, 'Totales del mes', `+${money(L.inn, 2)}`, `−${money(L.out, 2)}`, money(L.close, 2)] });
  return `${microGrid(defs, p)}${isProj(p) ? '' : cobrosPorMetodo(p)}${panel('Cobrado, egresos y caja por mes', ch, '')}${panel(`Libro de caja de ${monthYear(p)}${isProj(p) ? ' · proyección' : ''}`, `<p class="pn-d">Cada entrada y salida de dinero del mes, en orden de fecha, con el saldo después de cada movimiento. El saldo final es el mismo del Resumen y de la Matriz.</p>${tools}${tb}`)}${isProj(p) ? '' : cobrosBs(p)}`;
}
/* v10 · Cobros del mes por método (Binance, PayPal, Zelle, efectivo, bolívares) con comisiones y neto */
function cobrosPorMetodo(p) {
  const ps = pagos.filter(x => x.date && inPeriod(x.date, p) && x.date <= TODAY);
  const legacy = db.invoices.filter(i => !i.voided && !(i.pays && i.pays.length) && i.paidDate && inPeriod(i.paidDate, p));
  const rows = Object.keys(PM).map(m => { const l = ps.filter(x => x.method === m); return { m, n: l.length, usd: sum(l, x => +x.usd || 0), fee: sum(l, x => +x.fee || 0), orig: sum(l, x => +x.amount || 0) }; });
  const legUsd = sum(legacy, i => invoiceUsd(db, i) || 0);
  const tot = sum(rows, r => r.usd) + legUsd;
  if (!tot) return panel(`Cobros de ${monthYear(p)} por método`, `<div class="ag-empty"><span class="ag-empty-ic">${svgI('coins', 22)}</span><p>Aún no hay cobros registrados este mes. Registra cada pago en Facturación o Cobranza con su método (Binance, PayPal, Zelle, efectivo o bolívares).</p><a class="btn btn-sm" href="#/facturacion">Ir a Facturación</a></div>`);
  const tiles = rows.filter(r => r.n).map(r => `<div class="pm-sum" style="--pm:${PM[r.m].color}"><span class="pm-sum-h">${pmIcon(r.m, 16)}<b>${PM[r.m].label}</b><em>${r.n} pago${r.n === 1 ? '' : 's'}</em></span><b class="pm-sum-v">${money(r.usd, 2)}</b><small>${r.m === 'VES' ? moneyBs(r.orig) + ' recibidos' : r.m === 'BINANCE' ? num(r.orig, 2) + ' USDT' : ''}${r.fee ? `${r.m === 'VES' || r.m === 'BINANCE' ? ' · ' : ''}comisión ${money(r.fee, 2)}` : ''}</small><span class="pbar"><i style="width:${(r.usd / tot * 100).toFixed(1)}%;background:${PM[r.m].color}"></i></span></div>`).join('') + (legUsd ? `<div class="pm-sum" style="--pm:#8E8E93"><span class="pm-sum-h">${svgI('history', 16)}<b>Sin detalle</b><em>${legacy.length} factura${legacy.length === 1 ? '' : 's'}</em></span><b class="pm-sum-v">${money(legUsd, 2)}</b><small>Pagadas antes de la v10 o sin método</small><span class="pbar"><i style="width:${(legUsd / tot * 100).toFixed(1)}%;background:#8E8E93"></i></span></div>` : '');
  const fees = sum(rows, r => r.fee);
  return panel(`Cobros de ${monthYear(p)} por método`, `<div class="pm-sums">${tiles}</div><p class="note">Total cobrado ${money(tot, 2)}${fees ? ` · comisiones de las plataformas ${money(fees, 2)} (ya están en Gastos) · neto ${money(tot - fees, 2)}` : ''}.</p>`, `<button class="btn btn-sm" data-act="tasas">${svgI('rate', 14)} Tasas del día</button>`);
}
/* v10 · Pagos en bolívares: a qué dólar se cambió cada uno y cuánto se ganó o perdió frente a la tasa BCV */
function cobrosBs(p) {
  const l = pagos.filter(x => x.method === 'VES' && x.date && inPeriod(x.date, p)).sort((a, b) => a.date.localeCompare(b.date));
  if (!l.length) return '';
  const inv = id => db.invoices.find(i => i.id === id) || importedInv.find(f => f.id === id) || {};
  const cli = id => { const i = inv(id); const c = db.clients.find(x => x.id === i.clientId); return c ? c.name : '—'; };
  const tb = board({ cls: 'bt-bs', cols: [{ label: 'Fecha', cls: 'nw', w: '100px' }, { label: 'Cliente y factura' }, { label: 'Bolívares', cls: 'r', w: '140px' }, { label: 'Dólar usado', w: '150px' }, { label: 'Equivale a', cls: 'r', w: '115px' }, { label: 'A tasa BCV', cls: 'r', w: '115px' }, { label: 'Diferencia', cls: 'r', w: '110px' }],
    groups: [{ rows: l.map(x => { const d = x.usdBcv ? round2(x.usd - x.usdBcv) : null; return { cells: [fmtDate(x.date), `<b>${esc(cli(x.invId))}</b><small class="muted">Factura ${esc(inv(x.invId).num || String(x.invId).replace(/^FAC-/, ''))} · ${esc(BS_CHANNELS[x.bsChannel] || '')}${x.bank ? ' ' + esc(x.bank) : ''} · ref. ${esc(x.ref)}</small>`, moneyBs(+x.amount), `${esc(RATE_SHORT[x.rateType] || 'Otra')}<small class="muted">${fmtRate(+x.rate)}</small>`, money(+x.usd, 2), x.usdBcv ? money(+x.usdBcv, 2) : '<span class="muted">—</span>', d == null ? '<span class="muted">—</span>' : `<span class="${d < 0 ? 'txt-bad' : 'txt-ok'}">${d >= 0 ? '+' : '−'}${money(Math.abs(d), 2)}</span>`] }; }) }],
    foot: ['', `${l.length} pago(s)`, moneyBs(sum(l, x => +x.amount)), `Promedio ${fmtRate(sum(l, x => +x.amount) / Math.max(0.0001, sum(l, x => +x.usd)))}`, money(sum(l, x => +x.usd), 2), money(sum(l.filter(x => x.usdBcv), x => +x.usdBcv), 2), ''] });
  return panel(`Pagos en bolívares de ${monthYear(p)}`, `<p class="pn-d">Cada pago en bolívares con el dólar al que se cambió y lo que habría sido a tasa BCV. La diferencia muestra cuánto ganaste o dejaste de recibir según la tasa.</p>${tb}`);
}

/* ====================== CLIENTES ====================== */
function viewClientes(p) {
  const k = KP(p);
  const defs = [
    { key: 'activeAtClose', name: 'Clientes activos', fmt: 'count', info: 'Clientes con plan o servicio mensual vigente al cierre del mes.' },
    { key: 'newClients', name: 'Clientes nuevos', fmt: 'count', info: 'Clientes que empezaron a pagar algo fijo este mes.' },
    { key: 'churnedClients', name: 'Clientes que se dieron de baja', fmt: 'count', better: 'down', info: 'Clientes que tenían ingreso fijo al inicio del mes y lo perdieron todo.' },
    { key: 'arpuClose', name: 'Ingreso promedio por cliente', fmt: 'money', info: 'Ingreso fijo al cierre entre los clientes activos.' },
  ];
  const rows = k ? clientMatrix(db, p, k) : [];
  const f = state.filters;
  const filtered = rows.filter(r => (!f.q || normTxt(r.name + ' ' + r.sector).includes(normTxt(f.q))) && r.health >= f.health && (!f.payment || r.payment === f.payment) && (!f.flag || r.flags.includes(f.flag)));
  const toolbar = `<div class="toolbar" role="search">
    <label class="fld fld-grow"><span>Buscar</span><input type="search" data-filter="q" value="${esc(f.q)}" placeholder="Cliente o sector"></label>
    <label class="fld"><span>Salud mínima</span><select data-filter="health">${[0, 3, 5, 7, 9].map(h => `<option value="${esc(h)}" ${+f.health === h ? 'selected' : ''}>${h ? h + ' o más' : 'Todas'}</option>`).join('')}</select></label>
    <label class="fld"><span>Pago</span><select data-filter="payment"><option value="">Todos</option>${Object.entries(PAYMENT).map(([kk, v]) => `<option value="${esc(kk)}" ${f.payment === kk ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
    <label class="fld"><span>Alerta</span><select data-filter="flag"><option value="">Todas</option>${Object.entries(FLAGS).map(([kk, v]) => `<option value="${esc(kk)}" ${f.flag === kk ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label></div>`;
  const PAY = { PAID: ['Al día', 'sc-ok'], PENDING: ['Por cobrar', 'sc-warn'], OVERDUE: ['Vencida', 'sc-bad'] };
  const groups = [...PLAN_ORDER.map(pl => [pl, 'Plan ' + PLANS[pl].label, PLAN_COLOR[pl]]), ['NONE', 'Solo servicios o venta única', 'var(--line-serv)']].map(([g, label, color]) => {
    const rs = filtered.filter(r => (g === 'NONE' ? !r.plan : r.plan === g)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return { label, color, sub: `${rs.length} cliente${rs.length === 1 ? '' : 's'} · ${money(sum(rs, r => r.billing))}`, rows: rs.map(r => ({ cls: r.marginPct < 50 ? 'row-alert' : '', cells: [
      `<span class="cli-cell">${cliChk(r.id)}<span><b>${esc(r.name)}</b><small class="muted">${esc(r.sector)}${r.services.length ? ' · ' + r.services.map(v => esc(prodOf(v.productId).short)).join(', ') : ''}</small></span></span>`,
      r.plan ? `${r.seatsUsed}/${r.seatLimit == null ? '∞' : r.seatLimit}` : '—',
      `${money(r.billing)}${r.oneTime ? `<small class="muted">${money(r.oneTime)} única vez</small>` : ''}`,
      `<span class="${r.marginPct < 50 ? 'txt-bad' : ''}">${pct(r.marginPct, 0)}</span>`,
      stCell(PAY[r.payment][0], PAY[r.payment][1]),
      r.pauseNow ? stCell(r.pauseNow.source === 'CUT' ? 'Cortado' : 'En pausa', r.pauseNow.source === 'CUT' ? 'sc-bad' : 'sc-warn') : r.active ? stCell('Activo', 'sc-ok') : stCell('De baja', 'sc-gray'),
      healthBadge(r.health),
      `<span class="flags">${r.flags.map(fl => `<span class="pill ${FLAGS[fl].cls}">${FLAGS[fl].label}</span>`).join('') || '<span class="muted">—</span>'}</span>`,
      `<span class="acts"><button class="btn btn-sm" data-edit="${esc(r.id)}" aria-label="Editar ${esc(r.name)}">Editar</button><button class="btn btn-sm btn-tint" data-ev-new="${esc(TODAY)}" data-ev-kind="CLIENTE" data-ev-client="${esc(r.id)}" aria-label="Agendar cita con ${esc(r.name)}">Agendar</button>${r.active ? (r.pauseNow ? `<button class="btn btn-sm btn-ok" data-resume="${esc(r.id)}">Reanudar</button>` : `<button class="btn btn-sm btn-danger" data-pause="${esc(r.id)}">Pausar</button>`) : ''}</span>`] })) };
  }).filter(g => g.rows.length);
  const tb = widget(() => groups.length ? board({ cls: 'bt-cli', cols: [{ label: 'Cliente' }, { label: 'Usuarios', cls: 'r', w: '76px' }, { label: 'Ingreso del mes', cls: 'r', w: '118px' }, { label: 'Margen', cls: 'r', w: '72px' }, { label: 'Pago', w: '104px' }, { label: 'Servicio', w: '104px' }, { label: 'Salud', cls: 'c', w: '60px' }, { label: 'Alertas', w: '160px' }, { label: '', cls: 'nw', w: '250px' }], groups }) + `<p class="note">${filtered.length} de ${rows.length} clientes con facturación en ${monthYear(p)}. Filas resaltadas: margen menor a 50%.</p>` : (rows.length ? empty('Ningún cliente coincide con estos filtros.', { act: 'clear-filters', label: 'Quitar filtros' }) : empty(`Ningún cliente tiene facturación en ${monthYear(p)}. Tu base tiene ${clientDefs.length} cliente${clientDefs.length === 1 ? '' : 's'} del facturero: asígnales su plan en Editar o guarda sus facturas en el Facturero.`) + (clientDefs.length ? board({ cols: [{ label: 'Cliente' }, { label: 'RIF o cédula', w: '180px' }, { label: 'Código en el facturero', w: '200px' }, { label: '', w: '120px' }], groups: [{ label: 'Clientes del facturero', color: '#00A9C2', rows: clientDefs.map(c => ({ cells: [`<b>${esc(c.name)}</b>`, esc((c.opt && c.opt.rif) || '—'), esc((c.opt && c.opt.cliCode) || '—'), `<button class="btn btn-sm" data-edit="${esc(c.id)}">Editar</button>`] })) }] }) : '')), { lines: 8, h: 26 });
  return `${bulkBar()}${microGrid(defs, p)}${panel('Cartera por plan', toolbar + tb, `<button class="btn btn-sm btn-cta" data-act="new-client">Nuevo cliente <span class="cta-dot">${I.arrow}</span></button>`)}${baseClientsPanel()}`;
}

/* ====================== COBRANZA ====================== */
function viewCobranza(p) {
  const k = KP(p);
  const defs = [
    { key: 'onTimePct', name: 'Cobro puntual del día 5', fmt: 'pct', bench: 'onTimePct', info: 'Clientes que pagaron a más tardar el día 5, entre los que tenían factura con corte ese día.', foot: x => `${x.onTime} de ${x.dueOn5} pagaron a tiempo` },
    { key: 'ar', name: 'Cuentas por cobrar', fmt: 'money', better: 'down', info: 'Facturas emitidas y no pagadas al cierre del mes, con IVA.' },
    { key: 'dso', name: 'Días promedio de cobro', fmt: 'days', bench: 'dso', info: 'Cuántos días de facturación tienes pendientes por cobrar.' },
    { key: 'morosos', name: 'Clientes con más de 30 días de atraso', fmt: 'count', better: 'down', info: 'Clientes con al menos una factura vencida hace más de 30 días.' },
  ];
  const cuts = db.cuts.filter(x => x.period === p);
  const DEC = { CUT: ['Cortado', 'sc-bad'], GRACE: ['Prórroga', 'sc-warn'] };
  const cutB = widget(() => cuts.length ? board({ cols: [{ label: 'Cliente' }, { label: 'Factura', w: '140px' }, { label: 'Monto', cls: 'r', w: '110px' }, { label: 'Pagó el', w: '120px' }, { label: 'Días cortado', cls: 'r', w: '110px' }, { label: 'Decisión', w: '130px' }, { label: '', w: '310px' }],
    groups: [{ rows: cuts.map(x => { const c = db.clients.find(cc => cc.id === x.clientId); const inv = db.invoices.find(i => i.id === x.invoiceId); const pz = db.pauses.find(pp => pp.id === 'cut_' + x.invoiceId);
      const days = pz ? Math.max(0, Math.round(((pz.end ? D(pz.end) : D(TODAY)) - D(pz.start)) / DAY)) : 0;
      return { cells: [`<b>${esc(c.name)}</b>`, x.invoiceId, money(invoiceUsd(db, inv), 2), x.paidDate ? fmtDate(x.paidDate) : '<span class="txt-bad">Sin pagar</span>', x.decision === 'CUT' ? days + (pz && !pz.end ? ' · sigue' : '') : '—', x.decision ? stCell(DEC[x.decision][0], DEC[x.decision][1]) : stCell('Por decidir', 'sc-gold'),
        `<span class="acts">${x.decision !== 'CUT' ? `<button class="btn btn-sm btn-danger" data-cut="${esc(x.key)}">Cortar</button>` : ''}${x.decision !== 'GRACE' ? `<button class="btn btn-sm" data-grace="${esc(x.key)}">No cortar</button>` : ''}${!x.paidDate ? `<button class="btn btn-sm btn-ok" data-pay="${esc(x.invoiceId)}">Registrar pago</button>` : ''}</span>`] }; }) }] }) : empty(p >= TODAY.slice(0, 7) ? `El corte de ${monthYear(p)} es el ${fmtDate(nextCutoff())}.` : 'Todos pagaron a más tardar el día 5. No hay nada que decidir.'), { lines: 4, h: 24 });
  const aging = k ? k.aging : []; const sel = aging.find(b => b.key === state.bucket) || aging[0];
  const tones = ['ag-ok', 'ag-warn', 'ag-bad', 'ag-crit'];
  const agB = widget(() => `<div class="aging">${aging.map((b, i) => `<button class="ag ${tones[i]} ${b.key === sel.key ? 'is-sel' : ''}" data-bucket="${esc(b.key)}" aria-pressed="${b.key === sel.key}"><span class="ag-l">${b.label}</span><span class="ag-r">${b.range}</span><span class="ag-v">${money(b.total)}</span><span class="ag-n">${b.items.length} factura${b.items.length === 1 ? '' : 's'}</span></button>`).join('')}</div>
    <div class="mt">${sel.items.length ? board({ cols: [{ label: 'Factura', w: '140px' }, { label: 'Cliente' }, { label: 'Monto', cls: 'r', w: '120px' }, { label: 'Vence', w: '120px' }, { label: 'Atraso', cls: 'r', w: '100px' }, { label: '', w: '250px' }],
      groups: [{ rows: sel.items.map(i => ({ cells: [i.id, esc(i.clientName), money(i.usd, 2), fmtDate(i.dueDate), i.daysLate > 0 ? i.daysLate + ' días' : 'Al día', `<span class="acts"><button class="btn btn-sm" data-remind="${esc(i.id)}">Recordatorio</button><button class="btn btn-sm btn-ok" data-pay="${esc(i.id)}">Registrar pago</button></span>`] })) }] }) : empty(`No hay facturas en ${sel.label.toLowerCase()}.`)}</div>`, { lines: 4, h: 40 });
  const audit = state.audit.map(normAudit).filter(a => ['cobranza', 'facturacion', 'pausas'].includes(a.module) || a.legacy).slice(0, 8);
  return `${microGrid(defs, p)}${panel(`Corte del día ${CUTOFF_DAY} · ${mLong(p)}`, `<p class="pn-d">Si el cliente no pagó el día ${CUTOFF_DAY}, decides si se le corta el servicio o se le da prórroga. El corte lo pausa hasta que registres su pago.</p>${cutB}`)}
    ${panel('Cuentas por cobrar por antigüedad', agB)}
    ${panel('Registro de cambios de cobranza', audit.length ? `<ul class="audit">${audit.map(a => `<li><time>${fmtDate(a.date)} ${esc(a.time)}</time><b>${esc(a.user)}</b> ${esc(a.action)}</li>`).join('')}</ul>` : '<p class="muted">Todavía no hay cambios registrados.</p>', '<a class="btn btn-sm" href="#/auditoria">Ver auditoría completa</a>')}`;
}

/* ====================== PAUSAS ====================== */
function viewPausas(p) {
  const defs = [
    { key: 'pauseDays', name: 'Días de pausa en el mes', fmt: 'days', better: 'down', info: 'Suma de los días que cada cliente estuvo sin servicio, ya sea a solicitud o por corte del día 5.' },
    { key: 'pausedClientsInMonth', name: 'Clientes que se pausaron', fmt: 'count', better: 'down', info: 'Clientes con al menos un día en pausa durante el mes.' },
    { key: 'pausedAtClose', name: 'En pausa al cierre', fmt: 'count', better: 'down', info: 'Clientes que terminaron el mes sin servicio.' },
    { key: 'mrrPaused', name: 'Ingreso fijo detenido', fmt: 'money', better: 'down', info: 'Ingreso fijo mensual de los clientes que están en pausa al cierre.' },
  ];
  const per = perUpTo(p);
  const ch = widget(() => barChart({ w: 520, height: 260, labels: per.map(mShort), projIdx: projIndex(per), highlight: per.length - 1, fmtAxis: v => num(v), fmtVal: v => num(v) + ' días', series: [{ name: 'Días de pausa', values: per.map(x => KP(x) && KP(x).pauseDays), color: '#FDAB3D' }] }), { lines: 5 });
  const ms = monthStart(p), me = monthEnd(p);
  const list = db.pauses.filter(pp => D(pp.start) < me && (!pp.end || D(pp.end) > ms)).sort((a, b) => a.start.localeCompare(b.start));
  const body = widget(() => list.length ? board({ cols: [{ label: 'Cliente' }, { label: 'Motivo', w: '170px' }, { label: 'Desde', w: '120px' }, { label: 'Hasta', w: '120px' }, { label: 'Días en el mes', cls: 'r', w: '120px' }, { label: '', w: '170px' }],
    groups: [{ rows: list.map(pp => { const c = db.clients.find(x => x.id === pp.clientId); const a = Math.max(D(pp.start).getTime(), ms.getTime()), b = Math.min(pp.end ? D(pp.end).getTime() : Infinity, me.getTime(), D(TODAY).getTime() + DAY);
      return { cells: [`<b>${esc(c.name)}</b>${pp.note ? `<small class="muted">${esc(pp.note)}</small>` : ''}`, stCell(pp.source === 'CUT' ? 'Falta de pago' : (PAUSE_REASONS[pp.reason] || 'Pausa'), pp.source === 'CUT' ? 'sc-bad' : 'sc-warn'), fmtDate(pp.start), pp.end ? fmtDate(pp.end) : '<b>Sigue</b>', Math.max(0, Math.round((b - a) / DAY)),
        !pp.end ? (pp.source === 'CUT' ? `<button class="btn btn-sm btn-ok" data-pay="${esc(pp.invoiceId)}">Registrar pago</button>` : `<button class="btn btn-sm btn-ok" data-resume="${esc(pp.clientId)}">Reanudar</button>`) : ''] }; }) }] }) : empty('Ningún cliente estuvo en pausa este mes.'), { lines: 5, h: 24 });
  return `${microGrid(defs, p)}<div class="duo">${panel('Días de pausa por mes', ch)}${panel('Pausas del mes', body, '', 'pn-wide')}</div>`;
}

/* ====================== INVERSIÓN ====================== */
function viewInversion(p) {
  const k = KP(p); const inv = k ? k.invSummary : null;
  const defs = [
    { key: 'invMonth', name: 'Inversión del mes', fmt: 'money', neutral: true, info: 'Lo invertido este mes en captación de clientes y producto.' },
    { key: 'invAcc', name: 'Inversión acumulada', fmt: 'money', neutral: true, info: 'Todo lo invertido desde marzo de 2026.' },
    { key: 'roi', name: 'Retorno de la inversión (ROI)', fmt: 'pct', bench: 'roi', info: '(Ganancia operativa acumulada − inversión acumulada) entre la inversión acumulada.', foot: x => `Ganancia operativa acumulada ${money(x.ebitdaAcc)}` },
    { key: 'investPayback', name: 'Meses para recuperarla', fmt: 'months', better: 'down', info: 'Lo que falta por recuperar entre la ganancia operativa promedio de los últimos 3 meses.', get: x => x.invRecovered ? 0 : x.investPayback },
  ];
  const ch = widget(() => barChart({ height: 260, labels: inv.series.map(x => mShort(x.p)), projIdx: projIndex(inv.series.map(x => x.p)), series: [{ name: 'Inversión', values: inv.series.map(x => x.invest), color: '#9D50DD' }, { name: 'Ganancia operativa', values: inv.series.map(x => x.ebitda), color: '#00A86B' }] }), { lines: 6 });
  const list = allInvestments().filter(x => x.date.slice(0, 7) <= p).sort((a, b) => b.date.localeCompare(a.date));
  const tb = widget(() => list.length ? board({ cols: [{ label: 'Fecha', w: '110px' }, { label: 'Concepto' }, { label: 'Categoría', w: '190px' }, { label: 'Monto', cls: 'r', w: '120px' }, { label: '', w: '130px' }],
    groups: [{ rows: list.map(x => ({ cells: [fmtDate(x.date), esc(x.concept), stCell(INVEST_CATS[x.category] || 'Otra', 'sc-violet'), `${money(toUsd(db, x.amount, x.currency, x.date), 2)}${x.payerId ? `<small class="muted">Lo pagó ${esc(investorName(x.payerId))}</small>` : ''}`, x.auto ? '<small class="muted">Automático, desde Comisiones</small>' : `<span class="acts"><button class="btn btn-sm" data-inv-edit="${esc(x.id)}">Editar</button><button class="icon-btn" data-inv-del="${esc(x.id)}" aria-label="Eliminar ${esc(x.concept)}">${I.trash}</button></span>`] })) }] }) : empty('Aún no hay inversiones registradas.'), { lines: 5 });
  return `${microGrid(defs, p)}${panel('Inversión contra ganancia operativa', ch)}${panel('Inversiones registradas', tb, `<button class="btn btn-sm btn-cta" data-act="new-inv">Registrar inversión <span class="cta-dot">${I.arrow}</span></button>`)}`;
}

/* ====================== EQUIPO ====================== */
function viewEquipo(p) {
  const k = KP(p);
  const defs = [
    { key: 'utilizationPct', name: 'Uso de la capacidad', fmt: 'pct', bench: 'utilization', info: 'Horas facturables de todo el equipo entre sus horas disponibles. Lo sano está entre 70% y 85%.' },
    { key: 'billableHours', name: 'Horas facturables', fmt: 'hours', info: 'Horas dedicadas a clientes: implementación, soporte, servicios y desarrollo.' },
    { key: 'freeHours', name: 'Horas libres para vender', fmt: 'hours', neutral: true, info: 'Capacidad disponible que todavía no está comprometida con clientes.' },
    { key: 'implPct', name: 'Implementaciones usadas', fmt: 'pct', neutral: true, info: 'Implementaciones que usaron los clientes entre las que incluyen sus planes.', foot: x => `${x.implUsed} de ${x.implIncluded}` },
  ];
  const body = widget(() => `<div class="legend"><span><i class="band-sw"></i>Zona sana 70–85%</span></div><div class="ubars">${k.utilization.map(u => { const pc = u.pct || 0; const st = pc < 70 ? ['Con espacio', 'sc-warn'] : pc <= 85 ? ['Sano', 'sc-ok'] : ['Saturado', 'sc-bad'];
    return `<div class="ubar"><div class="ub-l"><b>${esc(u.name)}</b><span>${esc(u.role)} · ${money(u.hourlyCost, 2)}/h</span></div><div class="ub-track" title="${num(u.billable, 1)} h facturables de ${u.monthlyCapacityHours} h"><div class="ub-band"></div><div class="ub-fill" style="width:${(Math.min(pc, 110) / 110 * 100).toFixed(1)}%"></div></div><div class="ub-v"><b>${pct(u.pct, 0)}</b><small>${num(u.billable, 0)} de ${u.monthlyCapacityHours} h</small></div><div>${stCell(st[0], st[1])}</div></div>`; }).join('')}</div>`, { lines: 5, h: 26 });
  return `${microGrid(defs, p)}${panel('Uso de la capacidad por persona', body, `<button class="btn btn-sm" data-act="staff">${svgI('edit', 14)} Editar equipo</button>`)}`;
}

/* ====================== PLAN DE ACCIÓN ====================== */
function viewPlan() {
  const HC = { D15: '#E2445C', D30: '#FDAB3D', D60: '#579BFC', D90: '#00A3A3' };
  const ASC = { PENDING: 'sc-gray', IN_PROGRESS: 'sc-warn', DONE: 'sc-ok' };
  const tb = board({ cols: [{ label: 'Tarea' }, { label: 'Responsable', w: '160px' }, { label: 'Fecha límite', w: '130px' }, { label: 'Estado', w: '150px' }, { label: '', w: '56px' }],
    groups: Object.entries(HORIZONS).map(([h, label]) => { const items = state.actions.filter(a => a.horizon === h);
      return { label: `Próximos ${label}`, color: HC[h], sub: `${items.filter(a => a.status === 'DONE').length} de ${items.length} hechas`, emptyText: 'Sin tareas en este horizonte.', rows: items.map(a => ({ cls: a.status === 'DONE' ? 'is-done' : '', cells: [`<label class="acheck"><input type="checkbox" data-done="${esc(a.id)}" ${a.status === 'DONE' ? 'checked' : ''}><span>${esc(a.title)}</span></label>`, esc(ownerName(a.ownerId)), fmtDate(a.dueDate), `<select class="sc-sel ${ASC[a.status]}" data-astatus="${esc(a.id)}" aria-label="Estado de ${esc(a.title)}">${Object.entries(ASTATUS).map(([kk, v]) => `<option value="${esc(kk)}" ${a.status === kk ? 'selected' : ''}>${v}</option>`).join('')}</select>`, `<button class="icon-btn" data-del="${esc(a.id)}" aria-label="Eliminar ${esc(a.title)}">${I.trash}</button>`] })) }; }) });
  const form = `<form class="aform" data-form="action">
    <label class="fld fld-grow"><span>Nueva tarea</span><input name="title" required maxlength="120" placeholder="Ej. Llamar a los clientes con más de 30 días de atraso"></label>
    <label class="fld"><span>Horizonte</span><select name="horizon">${Object.entries(HORIZONS).map(([kk, v]) => `<option value="${esc(kk)}">${v}</option>`).join('')}</select></label>
    <label class="fld"><span>Responsable</span><select name="ownerId">${OWNERS().map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('')}</select></label>
    <label class="fld"><span>Fecha límite</span><input type="date" name="dueDate" required></label>
    <button class="btn btn-cta" type="submit">Agregar tarea <span class="cta-dot">${I.arrow}</span></button></form>`;
  return panel('Tablero del plan', tb + form);
}

/* ====================== AJUSTES ====================== */
const RETIRED = [
  ['Ingreso recurrente anual (ARR) como tarjeta', 'Se muestra solo en el Resumen. Es el ingreso fijo × 12 y no aporta otra lectura.'],
  ['Valor de vida / costo de adquisición (LTV:CAC)', 'Con una cartera de este tamaño y un costo de adquisición estimado, cambia mucho de un mes a otro y no es confiable.'],
  ['Meses para recuperar el costo de adquisición', 'Depende del mismo costo de adquisición estimado. Vale la pena retomarlo cuando midas la pauta por canal.'],
  ['Concentración en los 3 clientes principales', 'Queda como alerta por cliente ("Concentración") en lugar de una tarjeta.'],
  ['Ingreso por empleado', 'Con un equipo de 5 personas no ayuda a decidir; el uso de la capacidad es más útil.'],
  ['Desviación de alcance en proyectos de precio fijo', 'Hay muy pocos proyectos de precio fijo.'],
];
const APP_VERSION = '11.0 · 6 oct 2026' + (SRV ? ' · servidor' : ''); // visible en el inicio de sesión y en Ajustes para confirmar qué versión está publicada
const ACCENTS = { vino: ['Vino', '#AD103C'], azul: ['Azul profundo', '#282E49'], oro: ['Oro', '#C9971F'], apple: ['Azul', '#0071E3'], grafito: ['Grafito', '#6E6E73'] };
function appearanceHtml() {
  const th = [['auto', 'Automático', 'auto'], ['light', 'Claro', 'sun'], ['dark', 'Oscuro', 'moon']];
  const mini = cls => `<span class="ap-ui ${cls}"><i></i><i></i><i></i></span>`; // miniatura de la ventana (clara, oscura o las dos, como en Ajustes del Mac)
  return `<div class="appear"><div class="appear-th" role="radiogroup" aria-label="Tema">${th.map(([k, l, ic]) => `<button type="button" class="ap-th ap-${k} ${state.theme === k ? 'is-on' : ''}" data-set-theme="${esc(k)}" role="radio" aria-checked="${state.theme === k}"><span class="ap-prev" aria-hidden="true">${k === 'dark' ? mini('ap-d') : k === 'light' ? mini('ap-l') : mini('ap-l') + mini('ap-d ap-half')}</span><span>${svgI(ic, 14)} ${l}</span></button>`).join('')}</div>
    <div class="appear-ac"><span class="muted small">Menú de módulos</span><div class="seg seg-nav" role="radiogroup" aria-label="Dónde va el menú de módulos">${[['top', 'Arriba (como siempre)'], ['side', 'Barra lateral']].map(([k, l]) => `<button type="button" class="seg-b ${state.nav === k ? 'is-on' : ''}" data-set-nav="${esc(k)}" role="radio" aria-checked="${state.nav === k}">${l}</button>`).join('')}</div></div>
    <div class="appear-ac"><span class="muted small">Color de acento</span><div class="ac-dots" role="radiogroup" aria-label="Color de acento">${Object.entries(ACCENTS).map(([k, [l, c]]) => `<button type="button" class="ac-dot ${state.accent === k ? 'is-on' : ''}" style="--dc:${c}" data-set-accent="${esc(k)}" role="radio" aria-checked="${state.accent === k}" title="${esc(l)}" aria-label="${esc(l)}"></button>`).join('')}</div></div></div>`;
}
function viewAjustes() {
  const card = (icon, title, text, btn, extra = '') => `<div class="set-card ${extra}"><span class="set-ic">${svgI(icon, 18)}</span><div class="set-b"><h3>${title}</h3><p>${text}</p><div class="set-a">${btn}</div></div></div>`;
  const tz = tasas[TODAY] || {}; const lastT = Object.keys(tasas).sort().pop();
  const tasaTxt = Object.keys(RATE_TYPES).filter(k => k !== 'OTRA').map(k => { const r = rateOn(k, TODAY); return r ? `${RATE_SHORT[k]} ${num(r.rate, 2)}` : null; }).filter(Boolean).join(' · ') || 'Todavía no registras tasas';
  const g = (title, cards) => `<section class="set-sec"><h2 class="set-st">${title}</h2><div class="set-grid">${cards}</div></section>`;
  return `<p class="intro">Versión instalada: <b>${APP_VERSION}</b>. Si después de subirla ves otra versión, borra la caché de Hostinger y del navegador.</p>
  ${g('Apariencia y experiencia', `
    ${card('palette', 'Apariencia', 'Tema automático (sigue al sistema, como en iPhone y Mac), claro u oscuro, y el color de acento.', appearanceHtml(), 'set-wide')}
    ${card('keyboard', 'Atajos y gestos', 'Teclado al estilo Mac, doble clic, dos dedos a los lados (trackpad o pantalla) para ir a la página anterior o siguiente, pellizcar en la Agenda y letras dibujadas.', '<span class="acts"><button class="btn" data-act="shortcuts">Ver atajos y gestos</button><button class="btn" data-act="gesture-pad">Probar un trazo</button><button class="btn" data-act="gesture-cfg">Configurar letras</button></span>')}
    ${card('athena', 'Athena', 'Tu asistente: responde sobre ingresos, caja, cobranza y agenda, agenda citas y abre el registro de pagos. Funciona sin internet y sin enviar tus datos.', '<span class="acts"><button class="btn btn-cta" data-act="athena">Abrir Athena</button><button class="btn" data-act="athena-cfg">Opciones</button></span>')}
    ${card('install', 'Instalar la app', 'Úsala como app en tu iPhone, Android, Mac o PC, con su ícono y sin la barra del navegador.', '<button class="btn" data-act="install">Cómo instalarla</button>')}`)}
  ${g('Cobros y contabilidad', `
    ${card('rate', 'Tasas del día', `Bs por US$ según el dólar BCV, Binance, PayPal, Zelle y efectivo. Hoy: ${esc(tasaTxt)}.${SRV ? ' BCV y Binance llegan solas del servidor cada 5 minutos.' : ''}${lastT && lastT !== TODAY ? ` Última carga: ${fmtDate(lastT)}.` : ''}${SRV ? ' Al cobrar en bolívares se usa la más alta entre BCV y Binance, congelada 15 minutos.' : ' Al cobrar en bolívares se sugiere la más alta entre BCV y Binance.'}`, SRV ? '<span class="acts"><button class="btn btn-cta" data-srv-act="tasas-vivo">Tasas en vivo</button><button class="btn" data-act="tasas">Registrar a mano</button><button class="btn" data-act="rates">Tasa Binance por mes</button></span>' : '<span class="acts"><button class="btn btn-cta" data-act="tasas">Registrar tasas de hoy</button><button class="btn" data-act="rates">Tasa Binance por mes</button></span>')}
    ${card('coins', 'Comisiones de cobro', `PayPal: ${num(payFees.PAYPAL.pct, 2)}% + ${money(payFees.PAYPAL.fixed, 2)} por pago. Binance: ${num(payFees.BINANCE.pct, 2)}%. Se descuentan solas al registrar el pago y entran como gasto.`, '<button class="btn" data-act="payfees">Editar comisiones</button>')}
    ${card('calendar', 'IVA', `IVA actual: ${num(ivaRate)}%. Se suma a las facturas y no cuenta como ingreso.`, '<button class="btn" data-act="iva">IVA</button>')}
    ${card('trend', 'Meta de ingresos', `Meta mensual general: ${money(goals.default)}.`, '<button class="btn" data-act="goal">Editar meta</button>')}
    ${card('receipt', 'Presupuesto de gastos', 'Monto mensual presupuestado por categoría.', '<button class="btn" data-act="budget">Editar presupuesto</button>')}
    ${card('wallet', 'Saldo de caja', 'Se calcula solo con los cobros reales (incluidos abonos y pagos en bolívares convertidos) menos los egresos. No se edita a mano.', '<a class="btn" href="#/caja">Ver la Caja</a>')}
    ${card('gear', 'Umbrales de las métricas', 'Desde qué valor una métrica está en meta y desde cuál pasa a alerta.', '<button class="btn" data-act="bench">Editar umbrales</button>')}`)}
  ${g('Agenda', `
    ${card('agenda', 'Horario de atención', `${esc(agCfg.days.map(d => DOW_S[d]).join(', '))} de ${hhmm(agCfg.start)} a ${hhmm(agCfg.end)} · citas de ${EV_DUR[agCfg.dur] || agCfg.dur + ' min'} · recordatorio ${(EV_REMIND[agCfg.reminder] || '').toLowerCase()}.`, '<button class="btn" data-act="agenda-cfg">Editar horario y mensaje</button>')}`)}
  ${SRV ? SRV.ajustesGroup(card, g) : g('Datos y seguridad', `
    ${card('users', 'Vista del tablero', 'Prueba cómo ve el tablero cada rol y cómo se ven los estados de carga, vacío y error.', `<label class="fld"><span>Ver como</span><select id="roleSel">${Object.entries(ROLES).map(([kk, v]) => `<option value="${esc(kk)}" ${state.role === kk ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label class="fld"><span>Vista previa de estados</span><select id="demoSel">${[['normal', 'Con datos'], ['loading', 'Cargando'], ['vacio', 'Vacío'], ['error', 'Error']].map(([kk, v]) => `<option value="${esc(kk)}" ${(state.loading ? 'loading' : state.demo) === kk ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`)}
    ${card('lock', 'Clave de edición', hasEditKey() ? 'Ya tienes una clave. Los cambios que mueven los indicadores la piden y la edición queda abierta 15 minutos.' : 'Aún no tienes clave. Créala para proteger los cambios que mueven los indicadores.', `<button class="btn" data-act="key-change">${hasEditKey() ? 'Cambiar clave' : 'Crear clave'}</button>`)}
    ${card('user', 'Tu perfil', `${esc(account ? account.email : '')}${account && account.name ? ' · ' + esc(account.name) : ''}. La clave de acceso está protegida con ${account && account.kdf ? `PBKDF2 (${num(account.kdf.iter)} iteraciones y sal propia)` : 'el método anterior: se refuerza sola la próxima vez que entres'}.`, '<button class="btn" data-act="profile">Editar nombre</button>')}
    ${card('shield', 'Código de recuperación', account && account.rec ? `Generado el ${fmtDate(String(account.rec.at || '').slice(0, 10))}. Es la única forma de recuperar el acceso sin borrar los datos de este equipo. Guárdalo fuera de la computadora.` : 'Todavía no tienes uno. Si olvidas tu clave, sin este código solo se puede empezar de cero.', `<button class="btn" data-act="rec-new">${account && account.rec ? 'Generar uno nuevo' : 'Generar código'}</button>`)}
    ${(() => { const su = storageUsage(), lvl = su.pct >= 85 ? 'is-bad' : su.pct >= 65 ? 'is-warn' : ''; return card('wallet', 'Espacio en este navegador', `Tus datos ocupan ${fmtBytes(su.bytes)} de unos 5 MB que permite el navegador.${su.pct >= 65 ? ' Descarga un respaldo: si se llena, los cambios nuevos no se podrán guardar.' : ''}<span class="st-meter ${lvl}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(su.pct)}" aria-label="Espacio usado"><i style="width:${su.pct.toFixed(1)}%"></i></span>`, '<button class="btn" data-act="backup-dl">Descargar respaldo</button>'); })()}
    ${card('invoice', 'Productos y servicios', 'El catálogo del facturero con el precio de lista y el tipo de ingreso de cada producto.', '<a class="btn" href="#/productos">Ir a Productos</a>')}
    ${card('team', 'Asesores e implementadores', 'Quién cobra comisión por venta y quién cobra por implementación, con sus porcentajes y tarifas.', '<a class="btn" href="#/comisiones">Ir a Comisiones</a>')}
    ${card('upload', 'Importaciones', 'Trae facturas con el respaldo del facturero o gastos pegando la tabla de tu hoja.', '<span class="acts"><button class="btn" data-act="import">Facturas</button><button class="btn" data-act="sheet">Gastos</button></span>')}
    ${card('upload', 'Respaldo completo del tablero', 'Descarga en un archivo todos tus datos (clientes, facturas, pagos, tasas, citas, gastos, inversionistas, recibos, auditoría y facturero) o restáuralos en otro equipo o al pasar al dominio.', '<span class="acts"><button class="btn" data-act="backup-dl">Descargar respaldo</button><button class="btn" data-act="backup-up">Restaurar</button></span>')}
    ${card('sync', 'Clientes del facturero', `La base de clientes sale del facturero: hoy hay ${clientDefs.length} cliente${clientDefs.length === 1 ? '' : 's'}. Recargar borra los cambios hechos aquí y la vuelve a armar con los clientes y facturas del facturero.`, '<button class="btn btn-danger" data-act="reset-clients">Recargar desde el facturero</button>')}`)}
  ${panel('Métricas que retiramos y por qué', board({ cols: [{ label: 'Métrica', w: '34%' }, { label: 'Por qué' }], groups: [{ rows: RETIRED.map(([n, w]) => ({ cells: [`<b>${n}</b>`, `<span class="muted">${w}</span>`] })) }] }))}`;
}
// v10 · Tasas del día: Bs por US$ según cada tipo de dólar (se usan al registrar pagos en bolívares)
function tasasModal(date) {
  const d = date || TODAY; const t = tasas[d] || {};
  const hist = Object.keys(tasas).sort().reverse().slice(0, 12);
  openModal(`<h2 id="modal-t">Tasas del día</h2><p class="muted">Cuántos bolívares vale un dólar según cada referencia. Se proponen solas al registrar un pago en bolívares y quedan guardadas por fecha. Escribe solo las que uses.</p>
    <form data-form="tasas" novalidate><div class="fgrid">
      <label class="fld"><span>Fecha</span><input type="date" name="date" value="${esc(d)}" max="${TODAY}"></label>
      ${Object.keys(RATE_TYPES).filter(k => k !== 'OTRA').map(k => `<label class="fld"><span>${RATE_TYPES[k]} · Bs por US$</span><input name="r_${k}" inputmode="decimal" autocomplete="off" value="${esc(t[k] ? num(t[k], 2) : '')}" placeholder="${(rateOn(k, d) || {}).rate ? num(rateOn(k, d).rate, 2) : '0,00'}"></label>`).join('')}
    </div>
    ${hist.length ? board({ cols: [{ label: 'Fecha', w: '120px' }, ...Object.keys(RATE_TYPES).filter(k => k !== 'OTRA').map(k => ({ label: RATE_SHORT[k], cls: 'r' }))], groups: [{ rows: hist.map(x => ({ cells: [fmtDate(x), ...Object.keys(RATE_TYPES).filter(k => k !== 'OTRA').map(k => tasas[x][k] ? num(tasas[x][k], 2) : '—')] })) }] }) : ''}
    <p class="form-err" hidden></p>
    <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Guardar tasas <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}
function payFeesModal() {
  openModal(`<h2 id="modal-t">Comisiones de cobro</h2><p class="muted">Lo que te descuenta cada plataforma por recibir un pago. Se propone sola al registrar el pago (la puedes cambiar ahí) y entra como gasto en "Comisiones bancarias y de pasarelas".</p>
    <form data-form="payfees" novalidate>${board({ cols: [{ label: 'Método' }, { label: '% del pago', cls: 'r', w: '140px' }, { label: 'Monto fijo (US$)', cls: 'r', w: '160px' }], groups: [{ rows: ['PAYPAL', 'BINANCE', 'ZELLE', 'CASH', 'VES'].map(m => ({ cells: [`<span class="pm-chip" style="--pm:${PM[m].color}">${pmIcon(m, 13)}${PM[m].label}</span>`, `<input class="num-in" name="p_${m}" inputmode="decimal" value="${esc(num(payFees[m].pct || 0, 2))}" aria-label="Porcentaje de ${PM[m].label}">`, `<input class="num-in" name="f_${m}" inputmode="decimal" value="${esc(num(payFees[m].fixed || 0, 2))}" aria-label="Monto fijo de ${PM[m].label}">`] })) }] })}
    <p class="muted small">Referencia: PayPal suele cobrar entre 5,4% y 6% + US$ 0,30 por pago internacional recibido; revisa tu cuenta.</p>
    <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Guardar <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}
function agendaCfgModal() {
  openModal(`<h2 id="modal-t">Horario de atención y mensaje</h2><p class="muted">Se usa para sugerir horarios libres, marcar las horas fuera de horario en la Agenda y armar el mensaje de confirmación por WhatsApp.</p>
    <form data-form="agenda-cfg" novalidate><div class="fgrid">
      <label class="fld"><span>Desde</span><input type="time" name="start" value="${esc(agCfg.start)}" step="900"></label>
      <label class="fld"><span>Hasta</span><input type="time" name="end" value="${esc(agCfg.end)}" step="900"></label>
      <label class="fld"><span>Duración habitual de las citas</span><select name="dur">${opts(EV_DUR, String(agCfg.dur))}</select></label>
      <label class="fld"><span>Recordatorio por defecto</span><select name="reminder">${opts(EV_REMIND, String(agCfg.reminder))}</select></label>
      <div class="fld span2"><span>Días de atención</span><div class="rate-chips">${[1, 2, 3, 4, 5, 6, 0].map(d => `<label class="rate-chip"><input type="checkbox" name="day" value="${esc(d)}" ${agCfg.days.includes(d) ? 'checked' : ''}><span>${DOW_S[d]}</span></label>`).join('')}</div></div>
      <label class="fld span2"><span>Mensaje de confirmación (WhatsApp y correo)</span><textarea name="wa" rows="4" maxlength="600">${esc(agCfg.wa)}</textarea><small class="muted">Puedes usar {nombre}, {servicio}, {dia}, {hora}, {modalidad} y {lugar}.</small></label>
    </div><p class="form-err" hidden></p>
    <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Guardar <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}
function profileModal() {
  openModal(`<h2 id="modal-t">Tu perfil</h2><p class="muted">Athena usa tu nombre para saludarte. El correo es tu usuario para entrar.</p>
    <form data-form="profile" novalidate><div class="fgrid"><label class="fld span2"><span>Nombre</span><input name="name" maxlength="60" value="${esc(account && account.name || '')}" placeholder="Ej. Eduardo"></label></div><p class="form-err" hidden></p>
    <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Guardar <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}
function installModal() {
  const a = isApple();
  openModal(`<h2 id="modal-t">Instala Agora Digital App</h2><p class="muted">Queda con el ícono de Athena, se abre en su propia ventana y funciona sin conexión.</p>
    <div class="inst">${state.installEvt ? `<button type="button" class="btn btn-cta" data-act="install-now">Instalar ahora <span class="cta-dot">${I.arrow}</span></button>` : ''}
    <div class="inst-g"><h3>iPhone y iPad (Safari)</h3><ol><li>Abre tu dominio en Safari.</li><li>Toca Compartir <b>⬆︎</b> → <b>Agregar a pantalla de inicio</b>.</li></ol></div>
    <div class="inst-g"><h3>Mac</h3><ol><li>Safari: menú <b>Archivo → Agregar al Dock</b>.</li><li>Chrome o Edge: ícono de instalar en la barra de direcciones.</li></ol></div>
    <div class="inst-g"><h3>Android</h3><ol><li>Instala el archivo <b>AgoraDigital.apk</b> que viene en la entrega, o</li><li>En Chrome: menú <b>⋮ → Instalar app</b>.</li></ol></div>
    <div class="inst-g"><h3>PC con Windows</h3><ol><li>Abre <b>AgoraDigital.exe</b> de la entrega (no necesita internet), o</li><li>En Edge o Chrome: ícono de instalar en la barra de direcciones.</li></ol></div></div>
    <p class="muted small">Recuerda: los datos viven en cada equipo. Para pasarlos de uno a otro usa Ajustes → Respaldo completo.</p>
    <div class="modal-acts"><button type="button" class="btn btn-cta" data-act="close">Listo</button></div>`);
  void a;
}

/* ====================== TIPOS DE INGRESO (como en el módulo de Productos) ====================== */
const REV_TYPES = {
  suscripcion: { label: 'Suscripción (recurrente)', short: 'Suscripciones', rec: true },
  mensual: { label: 'Servicio mensual (recurrente)', short: 'Servicios mensuales', rec: true },
  unico: { label: 'Servicio único (no recurrente)', short: 'Servicios únicos', rec: false },
  sin: { label: 'Sin clasificar', short: 'Sin clasificar', rec: false },
};
function prodTipo(p) { if (p.tipo && REV_TYPES[p.tipo]) return p.tipo; return p.plan ? (p.recurring !== false ? 'suscripcion' : 'unico') : (p.recurring ? 'mensual' : 'unico'); }
catalog.forEach(p => { p.tipo = prodTipo(p); p.recurring = REV_TYPES[p.tipo].rec; });

/* ====================== MATRIZ ECONÓMICA: previsto ====================== */
let matrix = Object.assign({ saldoInicial: 0, saldoInicialPeriodo: '2026-09', prev: {} }, store.get('matrix_v1', {}));
const saveMatrix = () => store.set('matrix_v1', matrix);
const MX_YEAR = TODAY.slice(0, 4); // la Matriz muestra el año en curso
const MX_MONTHS = Array.from({ length: 12 }, (_, i) => `${MX_YEAR}-${String(i + 1).padStart(2, '0')}`);
const prevOf = (key, m) => matrix.prev[key + '|' + m] != null ? matrix.prev[key + '|' + m] : null;
function revenueByType(p) {
  const out = { suscripcion: 0, mensual: 0, unico: 0, sin: 0 };
  if (!ALL_PERIODS.includes(p) || p > TODAY.slice(0, 7)) return out;
  productRevenue(db, p).forEach(x => { const P = catalog.find(c => c.id === x.productId) || { tipo: x.recurring ? 'mensual' : 'unico' }; out[prodTipo(P)] += x.revenue; });
  return out;
}
function expenseByCat(p) { const o = {}; if (!ALL_PERIODS.includes(p)) return o; return spendByCat(p); }
function invByCat(p) { const o = {}; allInvestments().filter(x => x.date.slice(0, 7) === p).forEach(x => { o[x.category] = (o[x.category] || 0) + (toUsd(db, x.amount, x.currency, x.date) || x.amount); }); return o; }
function cashFlowReal(p) {
  if (!ALL_PERIODS.includes(p) || p > TODAY.slice(0, 7)) return { ent: 0, sal: 0 };
  const ent = collectedIn(db, p); // v10: cobros reales (pagos registrados con su equivalente en US$)
  const sal = sum(Object.values(expenseByCat(p))) + sum(Object.values(invByCat(p)));
  return { ent, sal };
}
const CASH_START = '2026-01'; // el saldo de caja se calcula solo: arranca en cero y acumula cobros − egresos
function cashAt(p) {
  if (p < CASH_START) return null;
  let s0 = 0;
  for (let q = CASH_START; q <= p; q = nextP(q)) { const f = isProj(q) ? cashFlowProjected(q) : cashFlowReal(q); s0 += f.ent - f.sal; }
  return s0;
}
// Próximo mes: entra la facturación del mes con IVA y sale lo programado (gastos recurrentes, gastos con fecha futura,
// inversiones planificadas y comisiones estimadas). Es una proyección: se vuelve real a medida que ocurre.
function cashFlowProjected(p) {
  if (!ALL_PERIODS.includes(p)) return { ent: 0, sal: 0 };
  const m = periodMetrics(db, p);
  return { ent: m ? m.revenue * (1 + ivaRate / 100) : 0, sal: sum(Object.values(expenseByCat(p))) + sum(Object.values(invByCat(p))), projected: true };
}
const nextP = p => { let [y, m] = p.split('-').map(Number); m++; if (m > 12) { m = 1; y++; } return `${y}-${String(m).padStart(2, '0')}`; };

function productRevByMonth(p) {
  const o = {}; if (!ALL_PERIODS.includes(p) || p > TODAY.slice(0, 7)) return o;
  productRevenue(db, p).forEach(x => { o[x.productId] = (o[x.productId] || 0) + x.revenue; }); return o;
}
let customInvCats = store.get('custom_inv_cats_v1', []);
customInvCats.forEach(c => { INVEST_CATS[c.id] = c.label; });
function viewMatriz() {
  const mode = state.mxMode || 'real';
  const months = MX_MONTHS, cur = TODAY.slice(0, 7);
  const lock = !isUnlocked();
  const PR = months.map(productRevByMonth), EB = months.map(m => isProj(m) ? {} : expenseByCat(m)), IB = months.map(m => isProj(m) ? {} : invByCat(m));
  const real = {};
  const segs = ['suscripcion', 'mensual', 'unico', 'sin'];
  const prodsOf = t => catalog.filter(pp => prodTipo(pp) === t).sort((a, b) => (a.plan ? 0 : 1) - (b.plan ? 0 : 1) || a.short.localeCompare(b.short, 'es'));
  segs.forEach(t => prodsOf(t).forEach(pp => { real['prod:' + pp.id] = PR.map(r => r[pp.id] || 0); }));
  const catG = ALL_CATS(); catG.forEach(c => real['cat:' + c.id] = EB.map(e => e[c.id] || 0));
  const catI = Object.keys(INVEST_CATS); catI.forEach(c => real['inv:' + c] = IB.map(e => e[c] || 0));
  const val = (key, i) => mode === 'previsto' ? (prevOf(key, months[i]) || 0) : mode === 'dif' ? ((real[key] || [])[i] || 0) - (prevOf(key, months[i]) || 0) : ((real[key] || [])[i] || 0);
  const tot = (keys, i) => sum(keys, k => val(k, i));
  const segKeys = t => prodsOf(t).map(pp => 'prod:' + pp.id);
  const kIng = segs.flatMap(segKeys), kG = catG.map(c => 'cat:' + c.id), kI = catI.map(c => 'inv:' + c);
  const cell = (key, i) => {
    if (mode === 'previsto') { const pv = prevOf(key, months[i]); return `<input class="mx-in" data-mx="${esc(key)}" data-mm="${esc(months[i])}" inputmode="decimal" value="${esc(pv == null ? '' : num(pv, 2))}" ${lock ? 'disabled' : ''} aria-label="Previsto ${months[i]}">`; }
    const v = val(key, i); const isIng = key.startsWith('prod');
    return `<span class="${mode === 'dif' ? (v > 0.005 ? (isIng ? 'up' : 'down') : v < -0.005 ? (isIng ? 'down' : 'up') : 'muted') : v ? '' : 'muted'}">${v ? num(v, 0) : '–'}</span>`;
  };
  const line = (label, key, cls = '') => `<tr class="${cls}"><td>${label}</td>${months.map((_, i) => `<td class="num">${cell(key, i)}</td>`).join('')}<td class="num tot">${num(sum(months.map((_, i) => val(key, i))), 0)}</td></tr>`;
  const totLine = (label, fn, cls = 'sub') => `<tr class="${cls}"><td>${label}</td>${months.map((_, i) => { const v = fn(i); return `<td class="num ${v < 0 ? 'down' : ''}">${num(v, 0)}</td>`; }).join('')}<td class="num tot">${num(sum(months.map((_, i) => fn(i))), 0)}</td></tr>`;
  const head = (label, k) => `<tr class="grp grp-${k}"><td colspan="14">${label}</td></tr>`;
  const addRow = (label, act, extra = '') => `<tr class="mx-add"><td colspan="14"><button type="button" class="mx-addb" data-act="${esc(act)}" ${extra}>＋ ${label}</button></td></tr>`;
  const segRows = t => { const ps = prodsOf(t); if (t === 'sin' && !ps.length) return ''; const ks = segKeys(t);
    return `<tr class="seg-h"><td>${REV_TYPES[t].short}</td>${months.map((_, i) => `<td class="num">${num(tot(ks, i), 0) === '0' ? '–' : num(tot(ks, i), 0)}</td>`).join('')}<td class="num tot">${num(sum(months.map((_, i) => tot(ks, i))), 0)}</td></tr>
      ${ps.map(pp => line(`<span class="mx-ind">${esc(pp.short)}</span>`, 'prod:' + pp.id, 'mx-sub')).join('')}
      ${t !== 'sin' ? addRow(`Agregar producto a ${REV_TYPES[t].short.toLowerCase()}`, 'mx-add-prod', `data-tipo="${t}"`) : ''}`; };
  const GRP = { COGS: 'Costo de atender a los clientes', OPEX: 'Gasto operativo', BELOW: 'Impuestos y tasas' };
  const gRows = ['COGS', 'OPEX', 'BELOW'].map(g => { const cs = catG.filter(c => (c.group || 'OPEX') === g); const ks = cs.map(c => 'cat:' + c.id);
    return `<tr class="seg-h"><td>${GRP[g]}</td>${months.map((_, i) => `<td class="num">${tot(ks, i) ? num(tot(ks, i), 0) : '–'}</td>`).join('')}<td class="num tot">${num(sum(months.map((_, i) => tot(ks, i))), 0)}</td></tr>
      ${cs.map(c => line(`<span class="mx-ind">${esc(c.label)}</span>`, 'cat:' + c.id, 'mx-sub')).join('')}
      ${addRow(`Agregar concepto a ${GRP[g].toLowerCase()}`, 'mx-add-cat', `data-group="${g}"`)}`; }).join('');
  // flujo de caja automático
  let saldo = 0;
  const flujo = months.map((m, i) => { const activo = m >= CASH_START && m <= cur; const s0 = activo ? saldo : null; const f = mode === 'previsto' ? { ent: tot(kIng, i), sal: tot(kG, i) + tot(kI, i) } : cashFlowReal(m); if (activo || mode === 'previsto') saldo += f.ent - f.sal; return { s0: mode === 'previsto' ? s0 ?? null : s0, ent: f.ent, sal: f.sal, s1: (activo || mode === 'previsto') ? saldo : null }; });
  const cierre = cashAt(cur > months[11] ? months[11] : cur);
  const badge = (v, prev) => { if (v == null) return '–'; const up = prev == null ? null : v - prev; const cl = v > 0.005 ? 'pos' : v < -0.005 ? 'neg' : 'zero'; return `<span class="mx-cash ${cl}" title="${v >= 0 ? 'Saldo positivo' : 'Saldo negativo'}${up == null ? '' : ` · ${up >= 0 ? 'sube' : 'baja'} ${money(Math.abs(up))} frente al mes anterior`}">${up == null || Math.abs(up) < 0.005 ? '' : `<i>${up >= 0 ? '▲' : '▼'}</i>`}${num(v, 0)}</span>`; };
  const segBtns = [['real', 'Real'], ['previsto', 'Previsto (editar)'], ['dif', 'Diferencia real − previsto']].map(([v, l]) => `<button type="button" class="seg-b ${mode === v ? 'is-on' : ''}" data-mxmode="${esc(v)}">${l}</button>`).join('');
  return `<p class="intro">Presupuesto previsto frente a lo real, mes a mes, con la misma estructura de la hoja de control del presupuesto anual: ingresos por producto, gastos e inversión por concepto, y el saldo de caja. Montos en US$ sin IVA.</p>
  <div class="mx-bar"><div class="seg">${segBtns}</div>
    <label class="inline">Saldo de caja al cierre de ${mLong(cur > months[11] ? months[11] : cur).toLowerCase()} <span class="mx-auto ${cierre >= 0 ? 'pos' : 'neg'}">${svgI('lock', 13)}<input id="mx-saldo-auto" class="num-in" value="${esc(money(cierre))}" readonly tabindex="-1" aria-readonly="true" aria-label="Saldo de caja calculado automáticamente"></span></label>
    <span class="muted small">Se calcula solo: cobros recibidos − egresos pagados, desde enero.</span>
    ${lock && mode === 'previsto' ? `<button class="btn btn-sm" type="button" data-act="unlock">${svgI('lock', 14)} Abrir edición</button>` : ''}</div>
  ${panel(mode === 'previsto' ? 'Presupuesto previsto · escribe los montos y se guardan solos' : mode === 'dif' ? 'Diferencia: en verde lo que salió mejor que lo previsto' : `Matriz económica real · ${MX_YEAR}`, `<div class="mx-wrap"><table class="mx"><thead><tr><th></th>${months.map(m => `<th class="num ${m === cur ? 'cur' : ''}">${mShort(m)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>
    ${head('Ingresos', 'ingreso')}
    ${segs.map(segRows).join('')}
    ${totLine('Total de ingresos', i => tot(kIng, i))}
    ${head('Gastos', 'gasto')}
    ${gRows}
    ${totLine('Total de gastos', i => tot(kG, i))}
    ${totLine('Resultado antes de invertir', i => tot(kIng, i) - tot(kG, i))}
    ${head('Inversión', 'inversion')}
    ${catI.map(c => line(`<span class="mx-ind">${esc(INVEST_CATS[c])}</span>`, 'inv:' + c, 'mx-sub')).join('')}
    ${addRow('Agregar concepto de inversión', 'mx-add-inv')}
    ${totLine('Total de inversión', i => tot(kI, i))}
    ${totLine('Resultado del mes', i => tot(kIng, i) - tot(kG, i) - tot(kI, i), 'sub total')}
    ${mode !== 'dif' ? `${head(mode === 'previsto' ? 'Flujo de caja previsto' : 'Flujo de caja real · automático', 'caja')}
    <tr><td>Saldo al inicio del mes</td>${flujo.map(f => `<td class="num">${f.s0 == null ? '–' : num(f.s0, 0)}</td>`).join('')}<td></td></tr>
    <tr><td>${mode === 'previsto' ? 'Entradas previstas' : 'Cobros recibidos'}</td>${flujo.map(f => `<td class="num">${f.ent ? num(f.ent, 0) : '–'}</td>`).join('')}<td class="num tot">${num(sum(flujo, f => f.ent), 0)}</td></tr>
    <tr><td>${mode === 'previsto' ? 'Salidas previstas' : 'Egresos pagados'}</td>${flujo.map(f => `<td class="num">${f.sal ? num(f.sal, 0) : '–'}</td>`).join('')}<td class="num tot">${num(sum(flujo, f => f.sal), 0)}</td></tr>
    <tr class="sub total mx-close"><td>Saldo de caja al cierre ${svgI('lock', 12)}</td>${flujo.map((f, i) => `<td class="num">${badge(f.s1, i ? flujo[i - 1].s1 : null)}</td>`).join('')}<td></td></tr>` : ''}
  </tbody></table></div>
  <div class="mx-legend"><span><i class="mx-dot pos"></i>Saldo positivo</span><span><i class="mx-dot neg"></i>Saldo negativo</span><span>▲ ▼ comparado con el mes anterior</span></div>
  <p class="note">En "Real", los ingresos salen de las facturas (por producto y período del servicio) y los egresos del registro de gastos, de las comisiones calculadas y de la inversión. El saldo de caja no se edita: se calcula solo con lo cobrado y lo pagado, y es el mismo que ves en el Resumen. Lo previsto de gastos es el presupuesto del módulo Gastos, y lo previsto de ingresos es la meta del módulo Ingresos.</p>`)}`;
}

function mxAddModal(kind, extra) {
  const title = kind === 'prod' ? `Agregar producto a ${REV_TYPES[extra].short.toLowerCase()}` : kind === 'cat' ? 'Agregar concepto de gasto' : 'Agregar concepto de inversión';
  openModal(`<h2 id="modal-t">${title}</h2>
    <form data-form="mx-add" data-kind="${esc(kind)}" data-extra="${esc(extra || '')}" novalidate><div class="fgrid">
      <label class="fld span2"><span>Nombre *</span><input name="nombre" maxlength="120" placeholder="${esc(kind === 'prod' ? 'Ej. Gestión de TikTok Ads' : kind === 'cat' ? 'Ej. Alquiler de oficina' : 'Ej. Ferias y eventos')}"></label>
      ${kind === 'prod' ? `<label class="fld"><span>Precio de lista en US$</span><input name="precio" inputmode="decimal" placeholder="Vacío = se escribe en la factura"></label>` : ''}
      ${kind === 'cat' ? `<label class="fld"><span>Segmento</span><select name="group">${opts({ COGS: 'Costo de atender a los clientes', OPEX: 'Gasto operativo', BELOW: 'Impuestos y tasas' }, extra || 'OPEX')}</select></label>` : ''}
    </div>${kind === 'prod' ? '<p class="muted small">También queda disponible en el facturero y en Productos y servicios.</p>' : ''}<p class="form-err" hidden></p>
    <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Agregar <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}
/* ====================== PRODUCTOS (como el módulo de ellos) ====================== */
function viewProductos() {
  const year = MX_YEAR; const lock = !isUnlocked();
  const lines = importedInv.filter(f => (f.issueDate || '').startsWith(year)).flatMap(f => (f.lines || []).map(l => ({ ...l, num: f.num })));
  const ORD = ['plan-bronce', 'plan-plata', 'plan-oro', 'plan-diamante', 'svc-implementacion', 'svc-canales', 'svc-email', 'svc-meta', 'svc-marketing', 'svc-ia', 'svc-landing-new', 'svc-landing-mgmt'];
  const oi = p => { const i = ORD.indexOf(p.id); return i < 0 ? 99 : i; };
  const rows = catalog.filter(p => !p.fromInvoice).slice().sort((a, b) => oi(a) - oi(b)).map(p => { const ls = lines.filter(l => l.productId === p.id); return { p, total: sum(ls, l => l.amount), veces: new Set(ls.map(l => l.num)).size }; });
  const fromInv = catalog.filter(p => p.fromInvoice).map(p => { const ls = lines.filter(l => l.productId === p.id); return { p, total: sum(ls, l => l.amount), veces: ls.length }; });
  const typeSel = (id, cur) => `<select class="sel-sm" data-ptype="${esc(id)}" ${lock ? 'disabled' : ''} aria-label="Tipo de ingreso">${Object.entries(REV_TYPES).map(([k, t]) => `<option value="${esc(k)}" ${k === cur ? 'selected' : ''}>${t.label}</option>`).join('')}</select>`;
  const priceIn = p => `<input class="num-in" data-pprice="${esc(p.id)}" inputmode="decimal" value="${esc(+p.price > 0 ? num(+p.price, 2) : '')}" placeholder="En la factura" ${lock ? 'disabled' : ''} aria-label="Precio de lista de ${esc(p.short)}">`;
  const grupo = p => p.plan ? 'Planes Ágora CRM' : p.custom ? 'Mis productos' : 'Servicios';
  // v9.3: el alta de producto es un panel plegable pegado a su botón, con animación de altura.
  // Siempre está en el DOM (cerrado = inerte) para poder abrirlo y cerrarlo sin redibujar la vista.
  const npOpen = !!state.newProd;
  const newForm = `<div class="clp np-wrap ${npOpen ? 'is-open' : ''}" id="npWrap" ${npOpen ? '' : 'inert aria-hidden="true"'}><div class="clp-in"><div class="np-box"><h3>Nuevo producto o servicio</h3><form class="fgrid" data-form="np" novalidate>
      <label class="fld span2"><span>Nombre *</span><input name="nombre" maxlength="120"><small class="muted">Así aparecerá en la factura</small></label>
      <label class="fld"><span>Precio de lista en US$</span><input name="precio" inputmode="decimal" placeholder="Vacío = se escribe en la factura"></label>
      <label class="fld"><span>Tipo de ingreso</span><select name="tipo">${Object.entries(REV_TYPES).map(([k, t]) => `<option value="${esc(k)}" ${k === 'unico' ? 'selected' : ''}>${t.label}</option>`).join('')}</select></label>
      <label class="fld span2"><span>Descripción</span><input name="desc" maxlength="200"></label>
      <p class="form-err span2" hidden></p>
      <div class="span2 acts"><button class="btn btn-cta" type="submit">Guardar en el catálogo <span class="cta-dot">${I.arrow}</span></button><button class="btn" type="button" data-act="np-cancel">Cancelar</button></div></form></div></div></div>`;
  const npBtn = `<button class="btn btn-sm btn-cta" type="button" id="npBtn" data-act="${esc(npOpen ? 'np-cancel' : 'np-open')}" aria-expanded="${npOpen}" aria-controls="npWrap"><span class="bl">${npOpen ? 'Cerrar' : 'Agregar producto'}</span> <span class="cta-dot"><span class="btn-chev">${svgI('plus', 14)}</span></span></button>`;
  const tb = board({ cols: [{ label: 'Producto o servicio' }, { label: 'Precio de lista', cls: 'r', w: '150px' }, { label: 'Tipo de ingreso', w: '290px' }, { label: `Facturas ${year}`, cls: 'r', w: '110px' }, { label: `Facturado ${year}`, cls: 'r', w: '130px' }, { label: '', w: '56px' }],
    groups: [{ rows: rows.map(r => ({ cls: state.flashRow === r.p.id ? 'row-flash' : '', cells: [`<b>${esc(r.p.name)}</b><small class="muted">${grupo(r.p)}</small>`, priceIn(r.p), typeSel(r.p.id, prodTipo(r.p)), r.veces, money(r.total), r.p.custom && !lock ? `<button class="icon-btn" data-pdel="${esc(r.p.id)}" aria-label="Eliminar ${esc(r.p.short)}">${I.trash}</button>` : ''] })) }] });
  const fi = fromInv.length ? board({ cols: [{ label: 'Concepto (como aparece en la factura)' }, { label: 'Veces', cls: 'r', w: '90px' }, { label: 'Facturado', cls: 'r', w: '130px' }, { label: 'Tipo de ingreso', w: '250px' }],
    groups: [{ rows: fromInv.map(r => ({ cells: [esc(r.p.name), r.veces, money(r.total), typeSel(r.p.id, prodTipo(r.p))] })) }] }) + '<p class="note">Aparecen aquí cuando en la factura se escribe un concepto que no está en el catálogo. Clasifícalos para que cuenten bien.</p>' : '<p class="muted">Todos los conceptos facturados coinciden con el catálogo.</p>';
  return `<p class="intro">El tipo de cada producto decide cómo se cuenta lo facturado: las suscripciones y los servicios mensuales suman al <b>ingreso recurrente</b>; los servicios únicos son ingreso no recurrente. El catálogo es el mismo del facturero.</p>
    ${lock ? `<div class="lock-note">${svgI('lock', 16)}<span>Los precios y tipos se editan con la edición abierta.</span><button class="btn btn-sm" type="button" data-act="unlock">Abrir edición</button></div>` : ''}
    ${panel('Catálogo de productos y servicios', newForm + tb, npBtn)}
    ${panel('Conceptos facturados que no están en el catálogo', fi)}`;
}

// Plegable genérico: anima la altura (grid 0fr → 1fr), vuelve inerte lo cerrado para el teclado
function disclose(el, open) {
  if (!el) return;
  el.classList.add('is-animating');
  if (open) { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); } else { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); }
  void el.offsetHeight; el.classList.toggle('is-open', open);
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('is-animating'), reduceMotion() ? 0 : 500);
}
function toggleNewProd(open) {
  state.newProd = open;
  const w = document.getElementById('npWrap'), b = document.getElementById('npBtn');
  if (!w || !b) { render(); return; }
  b.dataset.act = open ? 'np-cancel' : 'np-open'; b.setAttribute('aria-expanded', String(open)); b.querySelector('.bl').textContent = open ? 'Cerrar' : 'Agregar producto';
  disclose(w, open);
  const f = w.querySelector('form');
  if (open) setTimeout(() => { const i = f && f.querySelector('input[name=nombre]'); if (i) i.focus({ preventScroll: true }); b.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'nearest' }); }, 80);
  else if (f) { f.reset(); const e = f.querySelector('.form-err'); if (e) e.hidden = true; if (w.contains(document.activeElement)) b.focus({ preventScroll: true }); }
}
// Eliminar un producto propio: pide confirmación y avisa si ya aparece en facturas
function prodDelModal(id) {
  const P = catalog.find(x => x.id === id); if (!P) return;
  const n = importedInv.reduce((a, f) => a + (f.lines || []).filter(l => l.productId === id).length, 0);
  openModal(`<h2 id="modal-t">Eliminar "${esc(P.short)}"</h2><p class="muted">Se quita del catálogo del tablero y del facturero.${n ? ` <b>Aparece en ${n} línea(s) de facturas</b>: esas líneas pasarán a contarse como ingreso no recurrente hasta que el concepto se vuelva a clasificar.` : ' No aparece en ninguna factura.'}</p>
    <form data-form="pdel" data-id="${esc(id)}" novalidate><p class="form-err" hidden></p><div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-danger">Eliminar producto</button></div></form>`);
}

/* ====================== COMISIONES ====================== */
let asesores = store.get('asesores_v1', []);
let impls = store.get('impls_v1', []);
let comPaid = store.get('com_paid_v1', {});
let comBase = store.get('com_base_v1', 'facturado');
const saveCom = () => { store.set('asesores_v1', asesores); store.set('impls_v1', impls); store.set('com_paid_v1', comPaid); store.set('com_base_v1', comBase); };
const MODALIDAD = { COMISION: 'Comisión por venta', IMPLEMENTACION: 'Pago por implementación', AMBAS: 'Comisión e implementaciones' };
const asesorName = id => (asesores.find(a => a.id === id) || { nombre: '—' }).nombre;
function clientRecUni(d, cid, p) {
  const subs = d.subscriptions.filter(s => s.clientId === cid && overlapDays(s, p) > 0);
  const rec = sum(subs, s => proratedFee(s, p));
  const uni = sum(d.oneTime.filter(o => o.clientId === cid && inPeriod(o.date, p)), o => toUsd(d, o.amount, o.currency, o.date) || 0);
  return { rec, uni };
}
function clientPaidRecUni(cid, p) {
  const paid = importedInv.filter(x => x.clientId === cid && x.paidDate && inPeriod(payments[x.id] || x.paidDate, p));
  const paid2 = importedInv.filter(x => x.clientId === cid && payments[x.id] && inPeriod(payments[x.id], p));
  const list = [...new Set([...paid, ...paid2])];
  return { rec: sum(list, x => x.recSub != null ? x.recSub : x.subtotal), uni: sum(list, x => x.uniSub || 0) };
}
function commissionRows(d, p) {
  return asesores.map(a => {
    const cls = clientDefs.filter(c => c.opt && c.opt.asesorId === a.id);
    let rec = 0, uni = 0; const det = [];
    cls.forEach(c => {
      const startMov = d.movements.find(m => m.clientId === c.id && m.type === 'NEW');
      const monthsIn = startMov ? (() => { const [y1, m1] = startMov.effectiveDate.split('-').map(Number), [y2, m2] = p.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); })() : 0;
      const b = comBase === 'cobrado' ? clientPaidRecUni(c.id, p) : clientRecUni(d, c.id, p);
      const recOk = !(+a.mesesRec > 0) || monthsIn < +a.mesesRec;
      const r = recOk ? b.rec : 0; rec += r; uni += b.uni; if (r || b.uni) det.push({ name: c.name, rec: r, uni: b.uni });
    });
    const usaCom = a.modalidad !== 'IMPLEMENTACION', usaImp = a.modalidad !== 'COMISION';
    const comRec = usaCom ? rec * (+a.pctRec || 0) / 100 : 0, comUni = usaCom ? uni * (+a.pctUni || 0) / 100 : 0;
    const imps = usaImp ? impls.filter(x => x.asesorId === a.id && inPeriod(x.fecha, p)) : [];
    const impTotal = sum(imps, x => +x.monto || 0);
    return { a, clients: cls.length, rec, uni, comRec, comUni, imps, impTotal, total: comRec + comUni + impTotal, det, paid: comPaid[p + '|' + a.id] || null };
  });
}
function autoComExpenses(d) { // implementaciones → gasto "Nómina y honorarios"
  const out = [];
  ALL_PERIODS.forEach(p => commissionRows(d, p).forEach(r => {
    if (r.impTotal > 0) out.push({ id: `auto-imp-${p}-${r.a.id}`, period: p, date: isoD(addDays(monthEnd(p), -1)), category: 'nomina', concept: `Implementaciones de ${r.a.nombre}`, amount: round2(r.impTotal), currency: 'USD', source: 'auto' });
  }));
  return out;
}
function autoComInvestments() { // comisiones por venta → inversión "Comisiones de venta y afiliados"
  const out = [];
  try { ALL_PERIODS.forEach(p => commissionRows(db, p).forEach(r => { const v = round2(r.comRec + r.comUni); if (v > 0) out.push({ id: `auto-com-${p}-${r.a.id}`, date: isoD(addDays(monthEnd(p), -1)), concept: `Comisiones de ${r.a.nombre}`, category: 'comisiones', amount: v, currency: 'USD', auto: true }); })); } catch (e) { if (!(e instanceof ReferenceError)) console.warn(e); }
  return out;
}
const allInvestments = () => [...state.investments, ...autoComInvestments()];
function viewComisiones(p) {
  const rows = commissionRows(db, p); const lock = !isUnlocked();
  const totalCom = sum(rows, r => r.comRec + r.comUni), totalImp = sum(rows, r => r.impTotal), total = totalCom + totalImp;
  const k = KP(p); const rev = k ? k.revenue : 0;
  const stat = (t, v, s) => `<article class="micro" style="--mc:#E8697D"><header class="mm-h"><h3>${t}</h3></header><div class="mm-row"><p class="mm-v">${v}</p></div>${s ? `<p class="mm-foot">${s}</p>` : ''}</article>`;
  const kpis = `<div class="micro-grid" style="--cols:4">${stat('Total a pagar al equipo', money(total), `${monthYear(p)}`)}${stat('Comisiones por venta', money(totalCom), `Base: lo ${comBase}`)}${stat('Pagos por implementación', money(totalImp), `${sum(rows, r => r.imps.length)} implementación(es)`)}${stat('Peso sobre los ingresos', rev ? pct(total / rev * 100) : 'N/D', `Ingresos del mes ${money(rev)}`)}</div>`;
  const ase = board({ cols: [{ label: 'Persona' }, { label: 'Modalidad', w: '200px' }, { label: '% recurrente', cls: 'r', w: '110px' }, { label: '% único', cls: 'r', w: '90px' }, { label: 'Meses con comisión recurrente', cls: 'r', w: '150px' }, { label: 'Tarifa por implementación', cls: 'r', w: '160px' }, { label: 'Clientes', cls: 'r', w: '80px' }, { label: '', w: '130px' }],
    groups: [{ emptyText: 'Aún no hay personas registradas. Agrega a tus asesores e implementadores.', rows: asesores.map(a => ({ cells: [`<b>${esc(a.nombre)}</b>${a.rol ? `<small class="muted">${esc(a.rol)}</small>` : ''}`, MODALIDAD[a.modalidad], a.modalidad === 'IMPLEMENTACION' ? '—' : pct(+a.pctRec || 0, 1), a.modalidad === 'IMPLEMENTACION' ? '—' : pct(+a.pctUni || 0, 1), a.modalidad === 'IMPLEMENTACION' ? '—' : (+a.mesesRec > 0 ? a.mesesRec + ' meses' : 'Siempre'), a.modalidad === 'COMISION' ? '—' : money(+a.tarifaImpl || 0, 2), clientDefs.filter(c => c.opt && c.opt.asesorId === a.id).length, `<span class="acts"><button class="btn btn-sm" data-ase-edit="${esc(a.id)}">Editar</button><button class="icon-btn" data-ase-del="${esc(a.id)}" aria-label="Eliminar ${esc(a.nombre)}">${I.trash}</button></span>`] })) }] });
  const liq = board({ cols: [{ label: 'Persona' }, { label: 'Ventas recurrentes', cls: 'r', w: '140px' }, { label: 'Ventas únicas', cls: 'r', w: '120px' }, { label: 'Comisión', cls: 'r', w: '110px' }, { label: 'Implementaciones', cls: 'r', w: '140px' }, { label: 'Total a pagar', cls: 'r', w: '130px' }, { label: 'Estado', w: '120px' }, { label: '', w: '150px' }],
    groups: [{ emptyText: 'Sin personas para liquidar.', rows: rows.map(r => ({ cells: [`<b>${esc(r.a.nombre)}</b><small class="muted">${r.det.length ? r.det.map(x => esc(x.name)).join(', ') : r.clients ? 'Sin ventas en el mes' : 'Sin clientes asignados'}</small>`, money(r.rec), money(r.uni), money(r.comRec + r.comUni), `${money(r.impTotal)}${r.imps.length ? `<small class="muted">${r.imps.length} implementación(es)</small>` : ''}`, `<b>${money(r.total)}</b>`, r.total ? (isProj(p) ? stCell('Proyectado', 'sc-gray') : r.paid ? stCell('Pagado', 'sc-ok') : stCell('Por pagar', 'sc-warn')) : stCell('Sin monto', 'sc-gray'), r.total && !isProj(p) ? (r.paid ? `<button class="btn btn-sm" data-com-unpay="${esc(r.a.id)}">Desmarcar</button><small class="muted">Pagado ${fmtDate(r.paid)}${comPaidRef[p + '|' + r.a.id] ? ' · recibo ' + comPaidRef[p + '|' + r.a.id] : ''}</small>` : `<button class="btn btn-sm btn-ok" data-com-pay="${esc(r.a.id)}">Pagar y emitir recibo</button>`) : ''] })) }],
    foot: ['Total', money(sum(rows, r => r.rec)), money(sum(rows, r => r.uni)), money(totalCom), money(totalImp), money(total), '', ''] });
  const il = impls.filter(x => inPeriod(x.fecha, p)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const impB = board({ cols: [{ label: 'Fecha', cls: 'nw', w: '110px' }, { label: 'Implementación' }, { label: 'Cliente', w: '22%' }, { label: 'Hecha por', w: '18%' }, { label: 'Monto a pagar', cls: 'r', w: '130px' }, { label: '', w: '130px' }],
    groups: [{ emptyText: `Aún no hay implementaciones registradas en ${monthYear(p)}.`, rows: il.map(x => ({ cells: [fmtDate(x.fecha), `<b>${esc(x.concepto)}</b>`, esc((clientDefs.find(c => c.id === x.clientId) || { name: '—' }).name), esc(asesorName(x.asesorId)), money(+x.monto, 2), `<span class="acts"><button class="btn btn-sm" data-imp-edit="${esc(x.id)}">Editar</button><button class="icon-btn" data-imp-del="${esc(x.id)}" aria-label="Eliminar implementación">${I.trash}</button></span>`] })) }] });
  const hp = ALL_PERIODS.filter(x => x <= TODAY.slice(0, 7));
  const hist = hp.map(x => { const rs = commissionRows(db, x); const t = sum(rs, r => r.total); const pd = sum(rs.filter(r => r.paid), r => r.total); return { x, t, pd, pend: t - pd }; });
  const histChart = hist.some(h => h.t) ? barChart({ height: 250, labels: hp.map(mShort), stacked: true, highlight: hp.indexOf(p), series: [{ name: 'Pagado', values: hist.map(h => h.pd), color: '#037F4C' }, { name: 'Por pagar', values: hist.map(h => h.pend), color: '#FDAB3D' }], line: { name: 'Total generado', values: hist.map(h => h.t), color: '#AD103C' } }) + `<div class="com-sum"><span><b>${money(sum(hist, h => h.pd))}</b> pagado en total</span><span><b>${money(sum(hist, h => h.pend))}</b> pendiente por pagar</span><span><b>${hist.filter(h => h.t && !h.pend).length}</b> de ${hist.filter(h => h.t).length} meses liquidados por completo</span></div>` : empty('Todavía no hay comisiones generadas. Cuando tus asesores vendan o hagan implementaciones, aquí verás el historial de pagos.');
  return `<p class="intro">Todo el equipo cobra por comisión sobre lo que vende o por cada implementación que hace. Asigna a cada cliente su asesor (en Clientes → Editar) y registra aquí las implementaciones. Lo que se calcula entra solo a la Matriz económica: las comisiones como inversión en "Comisiones de venta y afiliados" y las implementaciones como gasto en "Nómina y honorarios".</p>
    ${kpis}
    ${panel('Historial de pagos de comisiones', histChart)}
    ${panel(`Liquidación de ${monthYear(p)}`, `<div class="mx-bar mb"><span class="muted small">Calcular la comisión sobre lo</span><div class="seg">${[['facturado', 'Facturado'], ['cobrado', 'Cobrado']].map(([v, l]) => `<button type="button" class="seg-b ${comBase === v ? 'is-on' : ''}" data-com-base="${esc(v)}">${l}</button>`).join('')}</div></div>${liq}`)}
    ${panel(`Implementaciones de ${monthYear(p)}`, impB, `<button class="btn btn-sm btn-cta" data-act="new-imp">Registrar implementación <span class="cta-dot">${I.arrow}</span></button>`)}
    ${receiptsPanel(r => r.tipo === 'COMISION' || r.tipo === 'IMPLEMENTADOR')}
    ${panel('Asesores e implementadores', ase, `<button class="btn btn-sm btn-cta" data-act="new-ase">Agregar persona <span class="cta-dot">${I.arrow}</span></button>`)}`;
}
function aseModal(id) {
  const a = id ? asesores.find(x => x.id === id) : { nombre: '', rol: '', modalidad: 'COMISION', pctRec: 10, pctUni: 10, mesesRec: 0, tarifaImpl: 0 };
  openModal(`<h2 id="modal-t">${id ? 'Editar persona' : 'Agregar persona'}</h2>
    <form data-form="ase" data-id="${esc(id || '')}" novalidate><div class="fgrid">
      <label class="fld span2"><span>Nombre *</span><input name="nombre" maxlength="80" value="${esc(a.nombre)}"></label>
      <label class="fld"><span>Rol</span><input name="rol" maxlength="60" value="${esc(a.rol || '')}" placeholder="Ej. Asesor comercial"></label>
      <label class="fld"><span>Cómo cobra</span><select name="modalidad">${opts(MODALIDAD, a.modalidad)}</select></label>
      <label class="fld"><span>% de comisión sobre ventas recurrentes</span><input name="pctRec" type="number" min="0" max="100" step="0.1" value="${esc(a.pctRec)}"></label>
      <label class="fld"><span>% de comisión sobre ventas únicas</span><input name="pctUni" type="number" min="0" max="100" step="0.1" value="${esc(a.pctUni)}"></label>
      <label class="fld"><span>Meses que paga la comisión recurrente</span><input name="mesesRec" type="number" min="0" step="1" value="${esc(a.mesesRec || 0)}"><small class="muted">0 = mientras el cliente siga pagando</small></label>
      <label class="fld"><span>Tarifa por implementación (US$)</span><input name="tarifaImpl" type="number" min="0" step="0.01" value="${esc(a.tarifaImpl || 0)}"></label>
    </div><p class="form-err" hidden></p>
    <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Guardar <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}
function impModal(id) {
  const x = id ? impls.find(v => v.id === id) : { fecha: defaultExpDate(), concepto: '', clientId: '', asesorId: (asesores.find(a => a.modalidad !== 'COMISION') || {}).id || '', monto: '' };
  const implers = asesores.filter(a => a.modalidad !== 'COMISION');
  openModal(`<h2 id="modal-t">${id ? 'Editar implementación' : 'Registrar implementación'}</h2>
    ${implers.length ? '' : '<p class="form-err">Primero agrega una persona que cobre por implementación.</p>'}
    <form data-form="imp" data-id="${esc(id || '')}" novalidate><div class="fgrid">
      <label class="fld span2"><span>Implementación *</span><input name="concepto" maxlength="120" value="${esc(x.concepto)}" placeholder="Ej. Configuración de flujos de seguimiento"></label>
      <label class="fld"><span>Cliente</span><select name="clientId"><option value="">—</option>${clientDefs.map(c => `<option value="${esc(c.id)}" ${x.clientId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label class="fld"><span>Hecha por *</span><select name="asesorId">${implers.map(a => `<option value="${esc(a.id)}" ${x.asesorId === a.id ? 'selected' : ''}>${esc(a.nombre)}</option>`).join('')}</select></label>
      <label class="fld"><span>Fecha</span><input type="date" name="fecha" value="${esc(x.fecha)}"></label>
      <label class="fld"><span>Monto a pagar (US$)</span><input type="number" min="0" step="0.01" name="monto" value="${esc(x.monto)}" placeholder="Tarifa de la persona"></label>
    </div><p class="form-err" hidden></p>
    <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta" ${implers.length ? '' : 'disabled'}>Guardar <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}

/* ====================== ESTADO NUEVO (v8) ====================== */
let payRefs = store.get('pay_refs_v1', {});        // factura → { ref, method, amount, date, user, at }
let recExp = store.get('rec_exp_v1', []);          // plantillas de gastos recurrentes
let investors = store.get('investors_v1', []);     // inversionistas
let aportes = store.get('aportes_v1', []);         // aportes en efectivo o préstamos a la empresa
let receipts = store.get('receipts_v1', []);       // recibos de pago emitidos
let comPaidRef = store.get('com_paid_ref_v1', {}); // período|persona → N° de recibo
const saveNew = () => { store.set('pay_refs_v1', payRefs); store.set('rec_exp_v1', recExp); store.set('investors_v1', investors); store.set('aportes_v1', aportes); store.set('receipts_v1', receipts); store.set('com_paid_ref_v1', comPaidRef); };
// v10: métodos de cobro. Los cinco primeros son los del registro de pagos; los demás quedan para mostrar pagos viejos.
const PAY_METHODS = { BINANCE: 'Binance (USDT)', PAYPAL: 'PayPal', ZELLE: 'Zelle', CASH: 'Efectivo (US$)', VES: 'Bolívares', TRANSFER: 'Transferencia bancaria', PAGOMOVIL: 'Pago Móvil', OTHER: 'Otro' };
const PAY_METHODS_SEL = { BINANCE: 'Binance (USDT)', PAYPAL: 'PayPal', ZELLE: 'Zelle', CASH: 'Efectivo (US$)', VES: 'Bolívares (Pago Móvil o transferencia)', OTHER: 'Otro' };
const PM = {
  BINANCE: { label: 'Binance', cur: 'USDT', color: '#C99400', ref: 'ID de la orden o referencia de Binance', hint: 'Binance Pay, P2P o depósito en USDT' },
  PAYPAL: { label: 'PayPal', cur: 'USD', color: '#0070E0', ref: 'ID de la transacción de PayPal', hint: 'Monto bruto; la comisión se descuenta sola' },
  ZELLE: { label: 'Zelle', cur: 'USD', color: '#6D1ED4', ref: 'Código de confirmación de Zelle', hint: 'Transferencia en dólares desde un banco de EE. UU.' },
  CASH: { label: 'Efectivo', cur: 'USD', color: '#248A3D', ref: 'N° del recibo de caja', hint: 'Dólares en efectivo' },
  VES: { label: 'Bolívares', cur: 'VES', color: '#0E7C86', ref: 'N° de referencia del Pago Móvil o la transferencia', hint: 'Monto en Bs y a qué dólar lo cambiaste' },
};
const PM_ICON = {
  BINANCE: '<path d="M12 3l3 3-3 3-3-3z"/><path d="M6 9l3 3-3 3-3-3z"/><path d="M18 9l3 3-3 3-3-3z"/><path d="M12 15l3 3-3 3-3-3z"/><path d="M12 10.2l1.8 1.8-1.8 1.8-1.8-1.8z"/>',
  PAYPAL: '<path d="M8 20l1.2-7h3.6c3.3 0 5.4-1.8 5.9-4.6.5-2.9-1.4-4.4-4.4-4.4H8.6L6 20z"/><path d="M10.5 16.5l.6-3.5"/>',
  ZELLE: '<path d="M7 6h10l-10 12h10"/><path d="M12 3.5v2.5M12 18v2.5"/>',
  CASH: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
  VES: '<path d="M7 5h5.5a3.5 3.5 0 0 1 0 7H7z"/><path d="M7 12h6.5a3.5 3.5 0 0 1 0 7H7z"/><path d="M7 5v14"/>',
};
const pmIcon = (m, s = 18) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PM_ICON[m] || PM_ICON.CASH}</svg>`;
const BS_CHANNELS = { PAGOMOVIL: 'Pago Móvil', TRANSFER: 'Transferencia', PUNTO: 'Punto de venta', EFECTIVO_BS: 'Efectivo en bolívares' };
const RATE_TYPES = { BCV: 'Dólar BCV (oficial)', BINANCE: 'Dólar Binance (USDT)', PAYPAL: 'Dólar PayPal', ZELLE: 'Dólar Zelle', EFECTIVO: 'Dólar efectivo', OTRA: 'Otra tasa' };
const RATE_SHORT = { BCV: 'BCV', BINANCE: 'Binance', PAYPAL: 'PayPal', ZELLE: 'Zelle', EFECTIVO: 'Efectivo', OTRA: 'Otra' };
const BIN_TYPES = { PAY: 'Binance Pay', P2P: 'P2P', DEPOSITO: 'Depósito en la red' };
// Tasa del día (Bs por US$) de un tipo, la más reciente hasta la fecha. Para el dólar Binance usa también la tasa del mes.
function rateOn(type, date) {
  const ds = Object.keys(tasas || {}).filter(d => d <= (date || TODAY) && tasas[d] && +tasas[d][type] > 0).sort();
  if (ds.length) return { rate: +tasas[ds[ds.length - 1]][type], date: ds[ds.length - 1] };
  if (type === 'BINANCE') { const r = rateFor(db, 'VES', date || TODAY); if (r) return { rate: round2(1 / r), date: null, monthly: true }; }
  return null;
}
// Regla "según la operación" para COBRAR EN BOLÍVARES una factura en divisas: la tasa MÁS ALTA entre el dólar BCV y el
// dólar Binance registrados (de los últimos 5 días), para que los bolívares alcancen para reponer los dólares.
function cobroRate(date) {
  const d = date || TODAY;
  const c = ['BCV', 'BINANCE'].map(t => { const r = rateOn(t, d); return r && !r.monthly && r.date && (D(d) - D(r.date)) / DAY <= 5 ? { type: t, rate: r.rate, date: r.date } : null; }).filter(Boolean);
  return c.sort((a, b) => b.rate - a.rate)[0] || null;
}
const rateIn = r => num(r, Math.abs(r * 100 - Math.round(r * 100)) < 1e-6 ? 2 : 4); // tasa para un campo (hasta 4 decimales)
const invTotal = inv => round2((inv.subtotal || 0) + (inv.iva || 0)) || round2(invoiceUsd(db, inv) || 0);
const invPagos = invId => (pagos || []).filter(x => x.invId === invId).sort((a, b) => a.date.localeCompare(b.date));
const invPaidUsd = invId => round2(sum(invPagos(invId), x => +x.usd || 0));
const invDue = inv => Math.max(0, round2(invTotal(inv) - invPaidUsd(inv.id)));
// Texto corto del detalle de un pago: "Bs 46.400,00 · Pago Móvil · a 200,00 Bs/US$ (dólar Binance) · ref. 1234"
function payDetail(pg) {
  if (!pg || !pg.method) return '';
  const parts = [];
  if (pg.method === 'VES') { parts.push(`${moneyBs(+pg.amount)} · ${BS_CHANNELS[pg.bsChannel] || 'Bolívares'}${pg.bank ? ' ' + pg.bank : ''}`); parts.push(`a ${fmtRate(+pg.rate)} (dólar ${RATE_SHORT[pg.rateType] || 'otra tasa'})`); }
  else if (pg.method === 'BINANCE') parts.push(`${num(+pg.amount, 2)} USDT · ${BIN_TYPES[pg.binType] || 'Binance'}`);
  else if (pg.method === 'PAYPAL') parts.push(`PayPal ${money(+pg.amount, 2)}${+pg.fee ? ' − comisión ' + money(+pg.fee, 2) : ''}`);
  else parts.push(`${PM[pg.method] ? PM[pg.method].label : 'Pago'} ${money(+pg.amount, 2)}`);
  if (pg.ref) parts.push('ref. ' + pg.ref);
  return parts.join(' · ');
}
const usdOf = (amount, currency, date) => { const v = toUsd(db, +amount || 0, currency || 'USD', date || TODAY); return v == null ? (+amount || 0) : v; };
const investorName = id => { const x = investors.find(v => v.id === id); return x ? `${x.nombre} ${x.apellido}`.trim() : '—'; };
const payerOpts = sel => `<option value="">La empresa</option>${investors.map(v => `<option value="${esc(v.id)}" ${sel === v.id ? 'selected' : ''}>${esc(v.nombre + ' ' + v.apellido)} (inversionista)</option>`).join('')}`;
const pad2s = n => String(n).padStart(2, '0');
const dayOfP = (q, day) => `${q}-${pad2s(Math.min(+day || 1, daysIn(q)))}`;

/* ====================== GASTOS RECURRENTES ====================== */
// Cada plantilla registra sola el gasto de cada mes en cuanto llega su día de cobro.
function recPayerFor(r, date) { return r.payerId && (!r.payerUntil || date <= r.payerUntil) ? r.payerId : ''; }
function runRecurring(silent) {
  let n = 0; const cur = TODAY.slice(0, 7);
  recExp.forEach(r => {
    if (!r.active || !r.start) return;
    for (let q = r.start.slice(0, 7); q <= cur; q = ymNext(q)) {
      const date = dayOfP(q, r.day);
      if (date < r.start || (r.end && date > r.end) || date > TODAY) continue;
      if (q < ALL_PERIODS[0]) continue;
      if ((r.skips || []).includes(q)) continue;
      const id = `rec-${r.id}-${q}`;
      if (expenseEntries.some(e => e.id === id)) continue;
      const payerId = recPayerFor(r, date);
      expenseEntries.push({ id, date, period: q, category: r.category, concept: r.concept, amount: r.amount, currency: r.currency, source: 'recurrente', recId: r.id, payerId, payee: r.payee || '' });
      n++;
    }
  });
  if (n) { store.set('expenses_v2', expenseEntries); if (!silent) { rebuild(); bumpData(); } logAudit(`registró automáticamente ${n} gasto(s) recurrente(s) al llegar su fecha de cobro`, 'gastos'); }
  return n;
}
function nextCharge(r) {
  if (!r.active) return null;
  for (let q = (r.start > TODAY ? r.start : TODAY).slice(0, 7), i = 0; i < 24; q = ymNext(q), i++) {
    const d = dayOfP(q, r.day);
    if (d < r.start || (r.end && d > r.end)) { if (r.end && d > r.end) return null; continue; }
    if (d > TODAY || (d === TODAY && !expenseEntries.some(e => e.id === `rec-${r.id}-${q}`))) return d;
  }
  return null;
}
function recModal(id) {
  const r = recExp.find(x => x.id === id); if (!r) return;
  openModal(`<h2 id="modal-t">Gasto recurrente</h2><p class="muted">Los cambios se aplican a los próximos meses. Lo ya registrado no cambia.</p>
    <form data-form="rec" data-id="${esc(r.id)}" novalidate><div class="fgrid">
      <label class="fld span2"><span>Concepto *</span><input name="concept" maxlength="120" value="${esc(r.concept)}"></label>
      <label class="fld"><span>Categoría</span><select name="category">${expCatOpts(r.category)}</select></label>
      <label class="fld"><span>Monto *</span><input name="amount" type="number" min="0" step="0.01" value="${esc(r.amount)}"></label>
      <label class="fld"><span>Moneda</span><select name="currency">${opts(CURRENCIES, r.currency)}</select></label>
      <label class="fld"><span>Día de cobro (1 a 31)</span><input name="day" type="number" min="1" max="31" step="1" value="${esc(r.day)}"></label>
      <label class="fld"><span>Primer cobro</span><input type="date" name="start" value="${esc(r.start)}"></label>
      <label class="fld"><span>Último cobro (fecha de baja, opcional)</span><input type="date" name="end" value="${esc(r.end || '')}"></label>
      <label class="fld"><span>¿Quién lo paga?</span><select name="payerId">${payerOpts(r.payerId)}</select></label>
      <label class="fld"><span>Lo paga el inversionista hasta (opcional)</span><input type="date" name="payerUntil" value="${esc(r.payerUntil || '')}"></label>
      <label class="fld span2"><span>A quién se le paga (proveedor o beneficiario)</span><input name="payee" maxlength="100" value="${esc(r.payee || '')}" placeholder="Ej. Hostinger, Canva, contador"></label>
    </div><p class="form-err" hidden></p>
    <div class="modal-acts"><button type="button" class="btn btn-danger mr-auto" data-rec-del="${esc(r.id)}">Eliminar plantilla</button><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Guardar <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}
const expCatOpts = sel => ['COGS', 'OPEX', 'BELOW'].map(g => `<optgroup label="${esc(GROUP_LABEL[g])}">${ALL_CATS().filter(c => !c.auto && c.group === g).map(c => `<option value="${esc(c.id)}" ${sel === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</optgroup>`).join('');
function recPanel() {
  const list = recExp.slice().sort((a, b) => (b.active - a.active) || a.concept.localeCompare(b.concept, 'es'));
  const tb = board({ cols: [{ label: 'Concepto' }, { label: 'Monto', cls: 'r', w: '130px' }, { label: 'Día de cobro', cls: 'r', w: '100px' }, { label: 'Vigencia', w: '170px' }, { label: 'Lo paga', w: '170px' }, { label: 'Próximo cobro', w: '120px' }, { label: 'Estado', w: '110px' }, { label: '', cls: 'nw', w: '200px' }],
    groups: [{ emptyText: 'Aún no hay gastos recurrentes. Marca "Recurrente" al registrar un gasto fijo (alquiler, licencias, internet) y se registrará solo cada mes.', rows: list.map(r => { const nx = nextCharge(r); const reg = expenseEntries.filter(e => e.recId === r.id).length; return { cls: r.active ? '' : 'is-done', cells: [
      `<b>${esc(r.concept)}</b><small class="muted">${esc(catLabel(r.category))}${r.payee ? ' · paga a ' + esc(r.payee) : ''} · ${reg} registro(s)</small>`,
      `${money(usdOf(r.amount, r.currency, TODAY), 2)}${r.currency !== 'USD' ? `<small class="muted">${num(r.amount, 2)} ${r.currency}</small>` : ''}`,
      `Día ${r.day}`, `${fmtDate(r.start)}${r.end ? ' → ' + fmtDate(r.end) : ' → sin fin'}`,
      r.payerId ? `<span class="pill pill-inv">${esc(investorName(r.payerId))}</span>${r.payerUntil ? `<small class="muted">hasta ${fmtDate(r.payerUntil)}</small>` : ''}` : '<span class="muted">La empresa</span>',
      nx ? fmtDate(nx) : '—', r.active ? stCell('Activo', 'sc-ok') : stCell('Pausado', 'sc-gray'),
      `<span class="acts"><button class="btn btn-sm" data-rec-edit="${esc(r.id)}">Editar</button><button class="btn btn-sm" data-rec-toggle="${esc(r.id)}">${r.active ? 'Pausar' : 'Reanudar'}</button></span>`] }; }) }] });
  return panel('Gastos recurrentes (fijos mes a mes)', `<p class="pn-d">Cada plantilla registra el gasto sola el día de cobro de cada mes. Si hoy ya pasó ese día y aún no estaba registrado, se registra al abrir el tablero.</p>${tb}`);
}

/* ====================== AUDITORÍA ====================== */
function auditUser() { try { return (account && account.email) || 'Sistema (automático)'; } catch (e) { return 'Sistema (automático)'; } }
function normAudit(a) {
  if (a.ts) return a;
  const m = String(a.at || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(\d{1,2}:\d{2})?/);
  return { id: 'old-' + hashStr(JSON.stringify(a)).toString(36), ts: null, date: m ? `${m[3]}-${pad2s(m[2])}-${pad2s(m[1])}` : '', time: m && m[4] ? m[4] : '', user: a.user || '—', role: a.user || '—', module: 'sistema', action: a.text || '', legacy: true };
}
// v10.1: el registro guarda las últimas 5.000 acciones. Al recortar se conserva el eslabón anterior (audit_anchor_v1);
// antes, al pasar de 5.000, la verificación marcaba "Alterada" aunque nadie hubiera tocado nada. En registros que ya
// se habían recortado sin eslabón, la acción más antigua que se conserva pasa a ser el punto de partida.
// Nota: esta cadena detecta cambios hechos a mano en el navegador; la prueba firmada llega con la versión con servidor.
function auditIntegrity() {
  if (SRV) return SRV.auditIntegrity(); // con servidor: cadena firmada (HMAC) verificada en el servidor
  const chain = state.audit.filter(a => a.h).slice().reverse(); let ok = true, genesis = false;
  let prev = auditAnchor || '';
  chain.forEach((a, i) => {
    const h = hashStr(prev + a.ts + a.user + a.module + a.action).toString(36);
    if (h !== a.h) { if (i === 0 && !auditAnchor && state.audit.length >= AUDIT_MAX) genesis = true; else ok = false; }
    prev = a.h;
  });
  return { ok, n: chain.length, genesis };
}
const AUD_EXTRA = { sesion: 'Sesión', sistema: 'Sistema' };
const audModName = id => (MODULES.find(m => m.id === id) || {}).name || AUD_EXTRA[id] || id;
const audModColor = id => (MODULES.find(m => m.id === id) || {}).color || '#5E6480';
function auditTable(rows) {
  return board({ cls: 'bt-aud', cols: [{ label: 'Fecha', cls: 'nw', w: '110px' }, { label: 'Hora', cls: 'nw', w: '80px' }, { label: 'Usuario', w: '210px' }, { label: 'Módulo', w: '150px' }, { label: 'Acción realizada' }],
    groups: [{ emptyText: 'No hay acciones con estos filtros.', rows: rows.map(a => ({ cells: [fmtDate(a.date), a.time || '—', `<b>${esc(a.user)}</b><small class="muted">${esc(a.role || '')}</small>`, `<span class="aud-mod" style="--c:${audModColor(a.module)}">${esc(audModName(a.module))}</span>`, esc(a.action)] })) }] });
}
function viewAuditoria() {
  const all = state.audit.map(normAudit); const f = state.audF || (state.audF = { q: '', user: '', module: '', from: '', to: '' });
  const rows = all.filter(a => (!f.q || normTxt(a.action + ' ' + a.user).includes(normTxt(f.q))) && (!f.user || a.user === f.user) && (!f.module || a.module === f.module) && (!f.from || a.date >= f.from) && (!f.to || a.date <= f.to));
  const users = [...new Set(all.map(a => a.user))], mods = [...new Set(all.map(a => a.module))];
  const lim = state.audLim || 200; const integ = auditIntegrity();
  const stat = (t, v, s, c = '#4B5788') => `<article class="micro" style="--mc:${c}"><header class="mm-h"><h3>${t}</h3></header><div class="mm-row"><p class="mm-v">${v}</p></div>${s ? `<p class="mm-foot">${s}</p>` : ''}</article>`;
  const today = all.filter(a => a.date === TODAY).length;
  const kpis = `<div class="micro-grid" style="--cols:4">${stat('Acciones registradas', num(all.length), 'Se guardan las últimas 5.000')}${stat('Acciones de hoy', num(today), fmtDate(TODAY))}${stat('Usuarios con actividad', num(users.length), users.slice(0, 2).map(esc).join(', '))}${stat('Integridad del registro', integ.ok ? 'Verificada' : 'Alterada', integ.ok ? `${num(integ.n)} acciones encadenadas sin cambios${integ.genesis ? ' (desde la más antigua que se conserva)' : ''}` : 'Alguien modificó el registro fuera del tablero', integ.ok ? '#037F4C' : '#D9480F')}</div>`;
  const tools = `<div class="toolbar" role="search">
    <label class="fld fld-grow"><span>Buscar</span><input type="search" data-ff="aud-q" value="${esc(f.q)}" placeholder="Acción o usuario"></label>
    <label class="fld"><span>Usuario</span><select data-ff="aud-user"><option value="">Todos</option>${users.map(u => `<option ${f.user === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></label>
    <label class="fld"><span>Módulo</span><select data-ff="aud-module"><option value="">Todos</option>${mods.map(m => `<option value="${esc(m)}" ${f.module === m ? 'selected' : ''}>${esc(audModName(m))}</option>`).join('')}</select></label>
    <label class="fld"><span>Desde</span><input type="date" data-ff="aud-from" value="${esc(f.from)}"></label>
    <label class="fld"><span>Hasta</span><input type="date" data-ff="aud-to" value="${esc(f.to)}"></label></div>`;
  return `<p class="intro">Registro histórico de todo lo que se hace en el sistema: quién, cuándo, en qué módulo y qué cambió. No se puede editar ni borrar desde el tablero, y cada acción queda encadenada a la anterior para detectar alteraciones.</p>${kpis}
    ${panel('Actividad reciente', all.length ? auditTable(all.slice(0, 6)) : '<p class="muted">Todavía no hay acciones registradas.</p>')}
    ${panel('Registro de auditoría', tools + auditTable(rows.slice(0, lim)) + `<p class="note">${rows.length} de ${all.length} acciones.${rows.length > lim ? ` <button class="btn btn-sm" data-aud-more="1">Ver 200 más</button>` : ''}</p>`)}`;
}

/* ====================== FACTURACIÓN: PAGOS CON REFERENCIA ====================== */
function invPayCell(i, st) {
  const pr = payRefs[i.id]; const ps = invPagos(i.id); const last = ps[ps.length - 1];
  const chip = m => m && PM[m] ? `<span class="pm-chip" style="--pm:${PM[m].color}" title="${esc(PAY_METHODS[m])}">${pmIcon(m, 13)}${esc(PM[m].label)}</span>` : '';
  if (st === 'PAID') {
    const m = last ? last.method : pr && pr.method;
    return `<span class="acts">${chip(m)}${pr ? `<span class="ref-chip" title="Referencia del pago">Ref. ${esc(pr.ref)}</span>` : `<button class="btn btn-sm" data-pay="${esc(i.id)}">Agregar referencia</button>`}<button class="btn btn-sm btn-ghost" data-unpay="${esc(i.id)}" title="Revertir el pago">Revertir</button></span>${i.paidDate ? `<small class="muted">Pagó ${fmtDate(i.paidDate)}${last && last.method === 'VES' ? ` · ${moneyBs(+last.amount)} a dólar ${esc(RATE_SHORT[last.rateType] || '')}` : pr && pr.method && !last ? ' · ' + esc(PAY_METHODS[pr.method] || '') : ''}${ps.length > 1 ? ` · ${ps.length} pagos` : ''}</small>` : ''}`;
  }
  const paid = invPaidUsd(i.id);
  if (paid > 0.004) return `<span class="acts">${chip(last && last.method)}${canRemind() ? `<button class="btn btn-sm btn-ok" data-pay="${esc(i.id)}">Registrar pago</button>` : ''}</span><small class="muted">Abonado ${money(paid, 2)} · saldo <b class="txt-bad">${money(invDue(i), 2)}</b></small>`;
  return canRemind() ? `<button class="btn btn-sm btn-ok" data-pay="${esc(i.id)}">Registrar pago</button>` : '';
}
function allInvoicesPanel() {
  const f = state.invF || (state.invF = { q: '', st: '' }); const ref = addDays(D(TODAY), 1);
  const base = db.invoices.filter(i => !i.voided).map(i => ({ i, c: db.clients.find(x => x.id === i.clientId), st: invoiceStatus(i, ref) }));
  const rows = base.filter(r => (!f.st || r.st === f.st) && (!f.q || normTxt(`${r.i.num || r.i.id} ${r.i.id} ${r.c ? r.c.name : ''} ${(payRefs[r.i.id] || {}).ref || ''}`).includes(normTxt(f.q))))
    .sort((a, b) => b.i.issueDate.localeCompare(a.i.issueDate) || String(b.i.num || b.i.id).localeCompare(String(a.i.num || a.i.id)));
  const tot = r => (r.i.subtotal || 0) + (r.i.iva || 0);
  const tools = `<div class="toolbar" role="search"><label class="fld fld-grow"><span>Buscar</span><input type="search" data-ff="inv-q" value="${esc(f.q)}" placeholder="N° de factura, cliente o referencia"></label>
    <label class="fld"><span>Estado</span><select data-ff="inv-st"><option value="">Todas</option>${Object.entries(FACT_STATUS).map(([k, v]) => `<option value="${esc(k)}" ${f.st === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></label></div>`;
  const tb = board({ cols: [{ label: 'N°', w: '120px' }, { label: 'Cliente' }, { label: 'Emisión', cls: 'nw', w: '105px' }, { label: 'Vence', cls: 'nw', w: '105px' }, { label: 'Total con IVA', cls: 'r', w: '120px' }, { label: 'Estado', w: '110px' }, { label: 'Pago', cls: 'nw', w: '250px' }],
    groups: [{ emptyText: 'Ninguna factura coincide.', rows: rows.map(r => ({ cells: [`<b>${esc(r.i.num || r.i.id)}</b>${r.i.imported ? `<small class="muted">Facturero${r.i.updatedAt ? ' · guardada ' + fmtDate(String(r.i.updatedAt).slice(0, 10)) : ''}</small>` : ''}`, esc(r.c ? r.c.name : '—'), fmtDate(r.i.issueDate), fmtDate(r.i.dueDate), money(tot(r), 2), stCell(FACT_STATUS[r.st][0], FACT_STATUS[r.st][1]), invPayCell(r.i, r.st)] })) }],
    foot: ['', `${rows.length} factura(s)`, '', '', money(sum(rows, tot), 2), '', `Cobrado ${money(sum(rows.filter(r => r.st === 'PAID'), tot), 2)} · por cobrar ${money(sum(rows.filter(r => r.st !== 'PAID'), tot), 2)}`] });
  return panel('Todas las facturas emitidas', `<p class="pn-d">Todas las facturas del facturero, de todos los meses, sincronizadas al instante. Para marcar una como pagada se exige el número de referencia del pago.</p>${tools}${tb}`, `<button class="btn btn-sm" data-act="sync-fact">${svgI('sync', 14)} Sincronizar ahora</button>`);
}

/* ====================== CLIENTES: ELIMINACIÓN MASIVA ====================== */
state.selCli = new Set();
function bulkBar() {
  if (!canDeleteClients()) return '';
  const n = [...state.selCli].filter(id => clientDefs.some(c => c.id === id)).length;
  return `<div class="bulkbar ${n ? 'is-on' : ''}" role="region" aria-label="Acciones masivas"><span><b>${n}</b> cliente(s) seleccionado(s)</span><span class="acts">${n ? `<button class="btn btn-sm btn-ghost" data-act="sel-clear">Quitar selección</button><button class="btn btn-sm btn-danger" data-act="bulk-delete">${I.trash} Eliminar seleccionados</button>` : '<span class="muted small">Marca las casillas de los clientes que quieres eliminar.</span>'}</span></div>`;
}
const cliChk = id => canDeleteClients() ? `<input type="checkbox" class="cli-chk" data-selcli="${esc(id)}" ${state.selCli.has(id) ? 'checked' : ''} aria-label="Seleccionar cliente">` : '';
function baseClientsPanel() {
  const q = normTxt((state.baseQ || ''));
  const list = clientDefs.filter(c => !q || normTxt(c.name).includes(q)).slice().sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const lastDay = addDays(D(TODAY), 0);
  const allSel = list.length && list.every(c => state.selCli.has(c.id));
  const tb = board({ cols: [{ label: canDeleteClients() ? `<input type="checkbox" class="cli-chk" data-selall="1" ${allSel ? 'checked' : ''} aria-label="Seleccionar todos">` : '', w: '44px' }, { label: 'Cliente' }, { label: 'Código del facturero', w: '160px' }, { label: 'Plan actual', w: '130px' }, { label: 'Facturas', cls: 'r', w: '90px' }, { label: 'Estado', w: '110px' }],
    groups: [{ emptyText: 'No hay clientes.', rows: list.map(c => { const sg = c.segs.find(s => !s[2]); const act = clientActiveOn(db, c.id, lastDay); return { cls: state.selCli.has(c.id) ? 'row-sel' : '', cells: [cliChk(c.id), `<b>${esc(c.name)}</b><small class="muted">${esc(c.sector || '')}</small>`, esc((c.opt && c.opt.cliCode) || '—'), sg ? PLANS[sg[0]].label : '<span class="muted">Sin plan</span>', importedInv.filter(f => f.clientId === c.id).length, act ? stCell('Activo', 'sc-ok') : stCell('Sin servicio', 'sc-gray')] }; }) }] });
  return panel(`Base completa de clientes · ${clientDefs.length}`, `<div class="toolbar"><label class="fld fld-grow"><span>Buscar en la base</span><input type="search" data-ff="base-q" value="${esc(state.baseQ || '')}" placeholder="Nombre del cliente"></label></div>${tb}`);
}
function bulkDeleteModal() {
  const ids = [...state.selCli].filter(id => clientDefs.some(c => c.id === id)); if (!ids.length) return;
  const names = ids.map(id => clientDefs.find(c => c.id === id).name);
  const nInv = importedInv.filter(f => ids.includes(f.clientId)).length;
  openModal(`<h2 id="modal-t">Eliminar ${ids.length} cliente(s)</h2><p>Vas a eliminar a: <b>${names.slice(0, 15).map(esc).join(', ')}${names.length > 15 ? ` y ${names.length - 15} más` : ''}</b>.</p>
    <p class="muted">Se borra su historial de planes, servicios, ventas y pausas${nInv ? `, y ${nInv} factura(s) importada(s)` : ''}. Esto cambia las métricas de todos los meses y no se puede deshacer.</p>
    <form data-form="bulk-del" novalidate><label class="fld chk"><input type="checkbox" name="fromFact" checked> Quitarlos también de "Mis clientes" del facturero</label>
    <label class="fld"><span>Para confirmar escribe ELIMINAR</span><input name="conf" autocomplete="off" placeholder="ELIMINAR"></label><p class="form-err" hidden></p>
    <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-danger">Eliminar ${ids.length} cliente(s)</button></div></form>`);
}
function deleteClientsByIds(ids, fromFact) {
  const gone = clientDefs.filter(c => ids.includes(c.id));
  gone.forEach(c => { if (!isDeletedCli(c.opt && c.opt.cliCode, c.name)) deletedCli.push({ code: (c.opt && c.opt.cliCode) || null, name: c.name, at: new Date().toISOString() }); });
  store.set('deleted_cli_v1', deletedCli);
  clientDefs = clientDefs.filter(c => !ids.includes(c.id));
  importedInv = importedInv.filter(f => !ids.includes(f.clientId)); store.set('imported_v1', importedInv);
  if (fromFact) { const codes = gone.map(c => c.opt && c.opt.cliCode).filter(Boolean), nms = gone.map(c => normTxt(c.name)); const list = lsRaw(FACT_CLI_KEY, []).filter(x => !codes.includes(x.code) && !nms.includes(normTxt(x.nombre))); try { localStorage.setItem(FACT_CLI_KEY, JSON.stringify(list)); } catch (e) {} }
  ids.forEach(id => state.selCli.delete(id));
  saveClients();
  return gone;
}

/* ====================== INVERSIONISTAS ====================== */
const APORTE_TIPOS = { CAPITAL: 'Aporte en efectivo o préstamo', GASTO: 'Pagó un gasto de la empresa', INVERSION: 'Pagó una inversión de la empresa' };
const RCPT_TIPOS = { INVERSIONISTA: 'Pago de deuda a inversionista', PROVEEDOR: 'Pago a proveedor', COMISION: 'Pago de comisión', IMPLEMENTADOR: 'Pago a implementador' };
function investorLedger() {
  const rows = [];
  aportes.forEach(a => rows.push({ id: a.id, date: a.date, investorId: a.investorId, kind: 'CAPITAL', concept: a.concept, payee: a.payee || '', usd: usdOf(a.amount, a.currency, a.date), debt: a.reembolsable !== false, del: a.id }));
  db.expenses.filter(e => e.payerId && !e.projected).forEach(e => rows.push({ id: e.id, date: e.date || e.period + '-01', investorId: e.payerId, kind: 'GASTO', concept: e.concept || catLabel(e.category), payee: e.payee || '', usd: usdOf(e.amount, e.currency, (e.period || '') + '-01'), debt: true, recurring: !!e.recId }));
  state.investments.filter(x => x.payerId).forEach(x => rows.push({ id: x.id, date: x.date, investorId: x.payerId, kind: 'INVERSION', concept: x.concept, payee: x.payee || '', usd: usdOf(x.amount, x.currency, x.date), debt: true }));
  receipts.filter(r => r.tipo === 'INVERSIONISTA' && !r.anulado).forEach(r => rows.push({ id: r.id, date: r.date, investorId: r.investorId, kind: 'PAGO', concept: r.concept, payee: '', usd: -usdOf(r.amount, r.currency, r.date), debt: true, num: r.num, ref: r.ref }));
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}
function investorSummary(id, led) {
  const L = (led || investorLedger()).filter(r => r.investorId === id);
  const capital = sum(L.filter(r => r.kind === 'CAPITAL'), r => r.usd), capitalDebt = sum(L.filter(r => r.kind === 'CAPITAL' && r.debt), r => r.usd);
  const gastos = sum(L.filter(r => r.kind === 'GASTO'), r => r.usd), inv = sum(L.filter(r => r.kind === 'INVERSION'), r => r.usd), paid = -sum(L.filter(r => r.kind === 'PAGO'), r => r.usd);
  return { capital, gastos, inv, paid, aportado: capital + gastos + inv, deuda: round2(capitalDebt + gastos + inv - paid), n: L.length };
}
function viewInversionistas(p) {
  const led = investorLedger(); const sums = investors.map(v => ({ v, s: investorSummary(v.id, led) }));
  const deuda = sum(sums, x => x.s.deuda), aportado = sum(sums, x => x.s.aportado), pagado = sum(sums, x => x.s.paid);
  const k = KP(p); const gMes = sum(led.filter(r => r.kind === 'GASTO' && (r.date || '').slice(0, 7) === p), r => r.usd);
  const self = k ? k.resultBefore >= 0 : null;
  const stat = (t, v, s, c = '#4B5788') => `<article class="micro" style="--mc:${c}"><header class="mm-h"><h3>${t}</h3></header><div class="mm-row"><p class="mm-v">${v}</p></div>${s ? `<p class="mm-foot">${s}</p>` : ''}</article>`;
  const kpis = `<div class="micro-grid" style="--cols:4">${stat('Lo que la empresa les debe', money(deuda, 2), `${investors.length} inversionista(s)`, '#AD103C')}${stat('Aportado en total', money(aportado, 2), 'Efectivo, gastos e inversiones pagadas')}${stat('Ya devuelto', money(pagado, 2), `${receipts.filter(r => r.tipo === 'INVERSIONISTA' && !r.anulado).length} recibo(s) emitido(s)`, '#037F4C')}${stat('¿La empresa ya se sostiene sola?', self == null ? 'N/D' : self ? 'Sí' : 'Todavía no', k ? `Resultado de ${mLong(p).toLowerCase()} antes de invertir: ${money(k.resultBefore)} · gastos asumidos este mes: ${money(gMes)}` : '', self ? '#037F4C' : '#C9971F')}</div>`;
  const invB = board({ cols: [{ label: 'Inversionista' }, { label: 'Efectivo o préstamo', cls: 'r', w: '130px' }, { label: 'Gastos asumidos', cls: 'r', w: '125px' }, { label: 'Inversiones asumidas', cls: 'r', w: '135px' }, { label: 'Devuelto', cls: 'r', w: '110px' }, { label: 'Deuda pendiente', cls: 'r', w: '140px' }, { label: '', cls: 'nw', w: '300px' }],
    groups: [{ emptyText: 'Aún no hay inversionistas. Agrega a las personas que han puesto dinero o pagado gastos de su bolsillo.', rows: sums.map(({ v, s }) => ({ cells: [
      `<b>${esc(v.nombre + ' ' + v.apellido)}</b><small class="muted">${esc([v.doc, v.tel, v.email].filter(Boolean).join(' · ') || 'Sin datos de contacto')}</small>`,
      money(s.capital, 2), money(s.gastos, 2), money(s.inv, 2), money(s.paid, 2), `<b class="${s.deuda > 0.005 ? 'txt-bad' : 'txt-ok'}">${money(s.deuda, 2)}</b>`,
      `<span class="acts"><button class="btn btn-sm" data-invst-ledger="${esc(v.id)}">Estado de cuenta</button><button class="btn btn-sm" data-invst-aporte="${esc(v.id)}">Registrar aporte</button>${s.deuda > 0.005 ? `<button class="btn btn-sm btn-ok" data-invst-pay="${esc(v.id)}">Pagarle</button>` : ''}<button class="btn btn-sm btn-ghost" data-invst-edit="${esc(v.id)}">Editar</button></span>`] })) }],
    foot: ['Total', money(sum(sums, x => x.s.capital), 2), money(sum(sums, x => x.s.gastos), 2), money(sum(sums, x => x.s.inv), 2), money(pagado, 2), money(deuda, 2), ''] });
  // sustentación de gastos: quién está pagando qué de su bolsillo
  const sus = [
    ...recExp.filter(r => r.payerId).map(r => ({ rec: r, concept: r.concept, tipo: `Recurrente · día ${r.day}`, payer: r.payerId, payee: r.payee, usd: usdOf(r.amount, r.currency, TODAY), acc: sum(led.filter(x => x.kind === 'GASTO' && expenseEntries.some(e => e.id === x.id && e.recId === r.id)), x => x.usd), until: r.payerUntil, active: r.active })),
    ...led.filter(x => x.kind === 'GASTO' && !x.recurring).map(x => ({ concept: x.concept, tipo: `Único · ${fmtDate(x.date)}`, payer: x.investorId, payee: x.payee, usd: x.usd, acc: x.usd, until: null, active: false })),
  ];
  const susB = board({ cols: [{ label: 'Gasto' }, { label: 'Tipo', w: '150px' }, { label: 'Lo asume', w: '180px' }, { label: 'A quién se le paga', w: '170px' }, { label: 'Monto', cls: 'r', w: '110px' }, { label: 'Acumulado asumido', cls: 'r', w: '140px' }, { label: 'Hasta', w: '190px' }],
    groups: [{ emptyText: 'Ningún gasto está siendo pagado por un inversionista.', rows: sus.map(x => ({ cells: [`<b>${esc(x.concept)}</b>`, x.tipo, `<span class="pill pill-inv">${esc(investorName(x.payer))}</span>`, esc(x.payee || '—'), money(x.usd, 2), money(x.acc, 2),
      x.rec ? (x.until ? `${fmtDate(x.until)}<small class="muted">Luego lo paga la empresa</small>` : `<button class="btn btn-sm" data-payer-until="${esc(x.rec.id)}">La empresa lo asume desde…</button>`) : '—'] })) }] });
  const ledB = board({ cols: [{ label: 'Fecha', cls: 'nw', w: '105px' }, { label: 'Inversionista', w: '170px' }, { label: 'Movimiento', w: '240px' }, { label: 'Concepto' }, { label: 'Monto', cls: 'r', w: '120px' }, { label: '', w: '60px' }],
    groups: [{ emptyText: 'Sin movimientos.', rows: led.slice(0, 80).map(r => ({ cells: [fmtDate(r.date), esc(investorName(r.investorId)), r.kind === 'PAGO' ? stCell('Devolución · ' + r.num, 'sc-ok') : stCell(r.kind === 'CAPITAL' ? (r.debt ? 'Efectivo o préstamo' : 'Capital no reembolsable') : r.kind === 'GASTO' ? (r.recurring ? 'Gasto recurrente asumido' : 'Gasto asumido') : 'Inversión asumida', r.kind === 'CAPITAL' ? 'sc-violet' : 'sc-gold'), `${esc(r.concept)}${r.payee ? `<small class="muted">Se le pagó a ${esc(r.payee)}</small>` : ''}${r.ref ? `<small class="muted">Ref. ${esc(r.ref)}</small>` : ''}`, `<span class="${r.usd < 0 ? 'txt-ok' : ''}">${r.usd < 0 ? '−' : '+'}${money(Math.abs(r.usd), 2)}</span>`, r.del ? `<button class="icon-btn" data-aporte-del="${esc(r.del)}" aria-label="Eliminar aporte">${I.trash}</button>` : ''] })) }] });
  return `<p class="intro">Quién ha puesto dinero en la empresa, qué gastos e inversiones está pagando de su bolsillo mientras la empresa se vuelve autosustentable, y cuánto se les debe. Cada pago a un inversionista, proveedor, asesor o implementador queda respaldado con un recibo.</p>${kpis}
    ${panel('Inversionistas y deuda', invB, `<button class="btn btn-sm" data-act="new-aporte">Registrar aporte</button><button class="btn btn-sm btn-cta" data-act="new-investor">Agregar inversionista <span class="cta-dot">${I.arrow}</span></button>`)}
    ${panel('Sustentación de gastos', `<p class="pn-d">Gastos que un inversionista está pagando de su bolsillo. Los recurrentes se siguen cargando a su cuenta cada mes hasta la fecha en que la empresa los asuma.</p>${susB}`)}
    ${receiptsPanel()}
    ${panel('Movimientos de los inversionistas', ledB)}`;
}
function receiptsPanel(filter) {
  const list = receipts.filter(r => !filter || filter(r)).slice().sort((a, b) => b.num.localeCompare(a.num));
  const tb = board({ cols: [{ label: 'N° de recibo', w: '120px' }, { label: 'Fecha', cls: 'nw', w: '105px' }, { label: 'Tipo', w: '180px' }, { label: 'Pagado a', w: '180px' }, { label: 'Concepto' }, { label: 'Referencia', w: '140px' }, { label: 'Monto', cls: 'r', w: '115px' }, { label: '', cls: 'nw', w: '170px' }],
    groups: [{ emptyText: 'Aún no hay recibos emitidos.', rows: list.map(r => ({ cls: r.anulado ? 'is-done' : '', cells: [`<b>${esc(r.num)}</b>${r.anulado ? '<small class="txt-bad">Anulado</small>' : ''}`, fmtDate(r.date), esc(RCPT_TIPOS[r.tipo]), esc(r.beneficiary), esc(r.concept), esc(r.ref), money(usdOf(r.amount, r.currency, r.date), 2), `<span class="acts"><button class="btn btn-sm" data-rcpt-view="${esc(r.id)}">Ver recibo</button>${r.anulado ? '' : `<button class="btn btn-sm btn-ghost" data-rcpt-void="${esc(r.id)}">Anular</button>`}</span>`] })) }] });
  return panel('Recibos de pago emitidos', tb, `<button class="btn btn-sm btn-cta" data-act="new-receipt">Emitir recibo <span class="cta-dot">${I.arrow}</span></button>`);
}
function investorModal(id) {
  const v = id ? investors.find(x => x.id === id) : { nombre: '', apellido: '', doc: '', tel: '', email: '', nota: '' };
  const s = id ? investorSummary(id) : null;
  openModal(`<h2 id="modal-t">${id ? 'Editar inversionista' : 'Agregar inversionista'}</h2>
    <form data-form="investor" data-id="${esc(id || '')}" novalidate><div class="fgrid">
      <label class="fld"><span>Nombre *</span><input name="nombre" maxlength="60" value="${esc(v.nombre)}"></label>
      <label class="fld"><span>Apellido *</span><input name="apellido" maxlength="60" value="${esc(v.apellido)}"></label>
      <label class="fld"><span>Cédula o RIF</span><input name="doc" maxlength="20" value="${esc(v.doc || '')}" placeholder="V-00.000.000"></label>
      <label class="fld"><span>Teléfono</span><input name="tel" maxlength="30" value="${esc(v.tel || '')}"></label>
      <label class="fld span2"><span>Correo</span><input name="email" type="email" maxlength="80" value="${esc(v.email || '')}"></label>
      <label class="fld span2"><span>Nota (acuerdo, condiciones de devolución)</span><input name="nota" maxlength="200" value="${esc(v.nota || '')}"></label>
    </div><p class="form-err" hidden></p>
    <div class="modal-acts">${id && s && !s.n ? `<button type="button" class="btn btn-danger mr-auto" data-invst-del="${esc(id)}">Eliminar</button>` : ''}<button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Guardar <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}
function aporteModal(investorId) {
  if (!investors.length) return investorModal(null);
  const invCats = INVEST_CATS;
  openModal(`<h2 id="modal-t">Registrar aporte de un inversionista</h2><p class="muted">Todo lo que un inversionista pone de su bolsillo queda como deuda de la empresa con esa persona, salvo que marques que no se le devuelve.</p>
    <form data-form="aporte" novalidate><div class="fgrid">
      <label class="fld"><span>Inversionista *</span><select name="investorId">${investors.map(v => `<option value="${esc(v.id)}" ${v.id === investorId ? 'selected' : ''}>${esc(v.nombre + ' ' + v.apellido)}</option>`).join('')}</select></label>
      <label class="fld"><span>¿Qué hizo? *</span><select name="tipo" data-aporte-tipo="1">${opts(APORTE_TIPOS, 'GASTO')}</select></label>
      <label class="fld span2"><span>Concepto *</span><input name="concept" maxlength="120" placeholder="Ej. Pago de servidores de octubre"></label>
      <label class="fld"><span>Fecha *</span><input type="date" name="date" value="${esc(TODAY)}"></label>
      <label class="fld"><span>Monto *</span><input type="number" name="amount" min="0" step="0.01"></label>
      <label class="fld"><span>Moneda</span><select name="currency">${opts(CURRENCIES, 'USD')}</select></label>
      <label class="fld" data-for="GASTO INVERSION"><span>A quién se le pagó *</span><input name="payee" maxlength="100" placeholder="Proveedor o beneficiario"></label>
      <label class="fld" data-for="GASTO"><span>Categoría del gasto</span><select name="category">${expCatOpts('software')}</select></label>
      <label class="fld" data-for="INVERSION" hidden><span>Categoría de la inversión</span><select name="invCat">${opts(invCats, 'producto')}</select></label>
      <label class="fld span2 chk" data-for="GASTO"><input type="checkbox" name="recurrent"> Es un gasto recurrente (lo seguirá pagando cada mes)</label>
      <label class="fld" data-for="GASTO"><span>Lo paga hasta (opcional)</span><input type="date" name="payerUntil"></label>
      <label class="fld span2 chk" data-for="CAPITAL" hidden><input type="checkbox" name="reembolsable" checked> La empresa debe devolverle este dinero</label>
    </div><p class="form-err" hidden></p>
    <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Registrar aporte <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}
function ledgerModal(id) {
  const v = investors.find(x => x.id === id); const L = investorLedger().filter(r => r.investorId === id); const s = investorSummary(id, L);
  openModal(`<h2 id="modal-t">Estado de cuenta · ${esc(v.nombre + ' ' + v.apellido)}</h2><p class="muted">Aportado ${money(s.aportado, 2)} · devuelto ${money(s.paid, 2)} · <b>deuda pendiente ${money(s.deuda, 2)}</b></p>
    ${board({ cols: [{ label: 'Fecha', w: '105px' }, { label: 'Movimiento' }, { label: 'Monto', cls: 'r', w: '120px' }], groups: [{ emptyText: 'Sin movimientos.', rows: L.map(r => ({ cells: [fmtDate(r.date), `${esc(r.concept)}<small class="muted">${r.kind === 'PAGO' ? 'Devolución · ' + esc(r.num) + ' · ref. ' + esc(r.ref) : APORTE_TIPOS[r.kind]}</small>`, `${r.usd < 0 ? '−' : '+'}${money(Math.abs(r.usd), 2)}`] })) }] })}
    <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cerrar</button>${s.deuda > 0.005 ? `<button type="button" class="btn btn-cta" data-invst-pay="${esc(id)}">Pagarle y emitir recibo <span class="cta-dot">${I.arrow}</span></button>` : ''}</div>`);
}
function payerUntilModal(recId) {
  const r = recExp.find(x => x.id === recId);
  openModal(`<h2 id="modal-t">La empresa asume "${esc(r.concept)}"</h2><p class="muted">${esc(investorName(r.payerId))} lo sigue pagando hasta la fecha que indiques. Desde el cobro siguiente, la empresa lo paga y ya no suma a la deuda.</p>
    <form data-form="payer-until" data-id="${esc(r.id)}" novalidate><label class="fld"><span>Último cobro que paga el inversionista</span><input type="date" name="until" value="${esc(TODAY)}"></label><p class="form-err" hidden></p>
    <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Guardar <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}

/* ====================== UTILIDADES (SOCIOS Y REPARTO) ======================
   Utilidad del mes = Resultado del mes del Resumen (ingresos − gastos − inversión).
   Los porcentajes se guardan como enteros en centésimas de punto (10.000 = 100,00 %), así el
   reparto nunca acumula errores de decimales: 33,34 + 33,33 + 33,33 suma exactamente 100.
   Los montos se reparten en centavos con el método del mayor residuo: la suma de lo que le
   toca a cada socio es exactamente la utilidad repartida, sin centavos perdidos ni sobrantes. */
let socios = store.get('socios_v1', []); // { id, nombre, apellido, doc, tel, email, nota, bp, ci, investorId, createdAt }
socios.forEach(x => { x.bp = Math.max(0, Math.min(10000, Math.round(+x.bp || 0))); });
const saveSocios = () => store.set('socios_v1', socios);
const BP_TOTAL = 10000;
const SOC_COLORS = 6; // --p1 … --p6: tonos de la paleta Agora Digital
const bpTxt = bp => num(bp / 100, bp % 100 === 0 ? 0 : bp % 10 === 0 ? 1 : 2); // 5000 → 50 · 1950 → 19,5 · 3333 → 33,33
const fmtBp = bp => bpTxt(bp) + '%';
const assignedBp = (list = socios) => list.reduce((a, s) => a + (s.bp | 0), 0);
const socioName = s => `${s.nombre} ${s.apellido || ''}`.trim();
const socColor = s => `var(--p${((s.ci | 0) % SOC_COLORS) + 1})`;
const socInitials = s => ((s.nombre || '?')[0] + ((s.apellido || '')[0] || (s.nombre || '').split(/\s+/)[1]?.[0] || '')).toUpperCase();
const socAvatar = s => `<span class="ut-av ${((s.ci | 0) % SOC_COLORS) === 1 ? 'gold' : ''}" style="--pc:${socColor(s)}" aria-hidden="true">${esc(socInitials(s))}</span>`;
const sortedSocios = () => socios.slice().sort((a, b) => b.bp - a.bp || socioName(a).localeCompare(socioName(b), 'es'));
// "33,33" | "33.33" | "33,33 %" → 3333. Más de 2 decimales o más de 100 % → error.
function parsePctBp(txt) {
  const t = String(txt == null ? '' : txt).replace('%', '').trim();
  if (!t) return { error: 'Escribe el porcentaje de participación.' };
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(t)) return { error: 'Escribe un porcentaje válido, con hasta 2 decimales (por ejemplo 33,33).' };
  const [i, f = ''] = t.replace('.', ',').split(','); const bp = (+i) * 100 + (+(f + '00').slice(0, 2));
  if (bp > BP_TOTAL) return { error: 'Un socio no puede tener más de 100%.' };
  return { bp };
}
// Partes iguales sin decimales perdidos: 3 socios → 33,34 · 33,33 · 33,33
function equalSplit(n) { if (!n) return []; const base = Math.floor(BP_TOTAL / n), extra = BP_TOTAL - base * n; return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0)); }
// Reparte un monto (US$) según los porcentajes. Todo en centavos enteros.
function distributeProfit(amount, list) {
  const total = Math.round((amount || 0) * 100), sumBp = assignedBp(list), assigned = Math.min(BP_TOTAL, sumBp);
  const rows = list.map(s => ({ s, bp: s.bp | 0, cents: 0 }));
  // Datos inválidos (por ejemplo, un respaldo editado a mano que suma más de 100 %): no se reparte nada
  if (sumBp > BP_TOTAL) return { total, assigned, rows, dist: 0, free: Math.max(0, total), positive: false, invalid: true };
  if (!(total > 0) || !assigned) return { total, assigned, rows, dist: 0, free: Math.max(0, total), positive: total > 0 };
  const dist = Math.round(total * assigned / BP_TOTAL);
  const raw = rows.map((r, i) => { const n = total * r.bp; return { r, i, fl: Math.floor(n / BP_TOTAL), rem: n % BP_TOTAL }; });
  let rest = dist - raw.reduce((a, x) => a + x.fl, 0);
  raw.slice().sort((a, b) => b.rem - a.rem || a.i - b.i).forEach(x => { if (rest > 0 && x.r.bp > 0) { x.fl++; rest--; } });
  raw.forEach(x => { x.r.cents = x.fl; });
  return { total, assigned, rows, dist, free: total - dist, positive: true };
}
const utilityOf = p => { const k = KP(p); return k ? k.result : null; };
const yearMonthsTo = p => ALL_PERIODS.filter(m => m.slice(0, 4) === p.slice(0, 4) && m <= p);
const utilityYtd = p => sum(yearMonthsTo(p), m => utilityOf(m) || 0);
function nextSocColor() { const used = new Set(socios.map(s => (s.ci | 0) % SOC_COLORS)); for (let i = 0; i < SOC_COLORS; i++) if (!used.has(i)) return i; return socios.length % SOC_COLORS; }
// Barra y leyenda del reparto del módulo Utilidades
function utSplit(d, opts = {}) {
  const list = d.rows;
  if (!list.length) return `<div class="ut-empty"><p>Todavía no hay socios registrados. Agrega el primero con su porcentaje y aquí verás cuánto le toca a cada uno.</p><button class="btn btn-sm btn-cta" type="button" data-act="new-socio">Agregar el primer socio <span class="cta-dot">${I.arrow}</span></button></div>`;
  const freeBp = Math.max(0, BP_TOTAL - d.assigned);
  const bar = `<div class="ut-bar" role="img" aria-label="Reparto: ${esc(list.map(r => socioName(r.s) + ' ' + fmtBp(r.bp)).join(', '))}${freeBp ? ', sin asignar ' + fmtBp(freeBp) : ''}">${list.filter(r => r.bp > 0).map(r => `<i style="flex:${r.bp} 1 0;--pc:${socColor(r.s)}" title="${esc(socioName(r.s))} · ${fmtBp(r.bp)}"></i>`).join('')}${freeBp ? `<i class="ut-free" style="flex:${freeBp} 1 0" title="Sin asignar · ${fmtBp(freeBp)}"></i>` : ''}</div>`;
  const amt = r => d.positive ? money(r.cents / 100, 2) : '—';
  const leg = `<ul class="ut-leg">${list.map(r => `<li style="--pc:${socColor(r.s)}"><span class="dot"></span><span class="nm">${esc(socioName(r.s))}</span><span class="pc">${fmtBp(r.bp)}</span><span class="am">${amt(r)}</span></li>`).join('')}${freeBp ? `<li class="free" style="--pc:var(--surface-3)"><span class="dot" style="background:repeating-linear-gradient(135deg,var(--surface-3) 0 3px,var(--line-2) 3px 6px)"></span><span class="nm">Sin asignar · queda en la empresa</span><span class="pc">${fmtBp(freeBp)}</span><span class="am">${d.positive ? money(d.free / 100, 2) : '—'}</span></li>` : ''}</ul>`;
  return bar + leg + (d.invalid ? `<p class="note txt-bad">Los porcentajes suman ${fmtBp(assignedBp(list.map(r => r.s)))}: corrígelos en Utilidades → Editar porcentajes para poder repartir.</p>` : d.positive ? '' : `<p class="note">Este mes no hay utilidad para repartir: el resultado es ${money(d.total / 100, 2)}.</p>`);
}
// Encabezado del módulo: utilidad acumulada del mes (resultado del mes) y cómo se reparte entre los socios
function utHero(p, k, d, ytd, A, months) {
  const U = k ? k.result : null, live = p === TODAY.slice(0, 7);
  const st = !socios.length ? 'Sin socios registrados' : A === BP_TOTAL ? 'Reparto completo' : A > BP_TOTAL ? 'Se pasa de 100%' : `Falta asignar ${fmtBp(BP_TOTAL - A)}`;
  return `<section class="hero hero-sm ut-hero" aria-labelledby="uth-t">
      <div class="ut-h-l"><p id="uth-t" class="hero-k">${isProj(p) ? 'Utilidad proyectada' : 'Utilidad acumulada'} de ${monthYear(p)}</p>
        <p class="hero-v ${U < 0 ? 'ut-neg' : ''}">${money(U, 2)}</p>
        <p class="hero-s">${live ? `Al ${fmtDate(TODAY)}, mes en curso. ` : isProj(p) ? 'Proyección del mes. ' : 'Cierre del mes. '}${k ? `Ingresos <b>${money(k.revenue)}</b> − gastos <b>${money(k.spendTotal)}</b> − inversión <b>${money(k.invMonth)}</b>: es el resultado del mes.` : ''}</p>
        <div class="hero-stats">
          <div class="${ytd < 0 ? 'hs-neg' : ''}"><span>Acumulada de ${p.slice(0, 4)}</span><b>${money(ytd)}</b><small>${mLong(months[0] || p)} a ${mLong(p).toLowerCase()}</small></div>
          <div class="${A === BP_TOTAL ? 'hs-pos' : ''}"><span>Reparto asignado</span><b>${fmtBp(Math.min(A, 99999))}</b><small>${socios.length} socio(s) · ${st.toLowerCase()}</small></div>
          <div><span>Para repartir</span><b>${money(d.dist / 100)}</b><small>${d.positive ? (d.free ? `Sin asignar: ${money(d.free / 100)}` : 'El 100% de la utilidad') : 'Sin utilidad positiva'}</small></div>
        </div></div>
      <div class="ut-h-r"><p class="ut-h-t">Cómo se reparte</p>${utSplit(d)}</div>
    </section>`;
}
function viewUtilidades(p) {
  const k = KP(p); const lock = !isUnlocked();
  const U = k ? k.result : null, list = sortedSocios(), A = assignedBp(), d = distributeProfit(U, list);
  const months = yearMonthsTo(p), ytd = utilityYtd(p), dY = distributeProfit(ytd, list);
  const ytdOf = id => { const r = dY.rows.find(x => x.s.id === id); return r && dY.positive ? r.cents / 100 : 0; };
  const rowOf = id => d.rows.find(r => r.s.id === id);
  const tb = board({ cols: [{ label: 'Socio' }, { label: 'Participación', w: '190px' }, { label: `Le corresponde en ${mLong(p).toLowerCase()}`, cls: 'r', w: '170px' }, { label: `Acumulado de ${p.slice(0, 4)}`, cls: 'r', w: '150px' }, { label: '', cls: 'nw', w: '150px' }],
    groups: [{ emptyText: 'Aún no hay socios. Agrega a las personas dueñas de la empresa y el porcentaje de la utilidad que le corresponde a cada una.', rows: list.map(s => { const r = rowOf(s.id); return { cells: [
      `<span class="ut-who">${socAvatar(s)}<span><b>${esc(socioName(s))}</b><small class="muted">${esc([s.doc, s.tel, s.email].filter(Boolean).join(' · ') || 'Sin datos de contacto')}</small></span></span>`,
      `<span class="ut-pct" style="--pc:${socColor(s)}"><b>${fmtBp(s.bp)}</b><span class="pbar"><i style="width:${(s.bp / 100).toFixed(2)}%"></i></span></span>`,
      d.positive ? `<b>${money(r.cents / 100, 2)}</b>` : '<span class="muted">—</span>', money(ytdOf(s.id), 2),
      `<span class="acts"><button class="btn btn-sm" data-soc-edit="${esc(s.id)}">Editar</button><button class="icon-btn" data-soc-del="${esc(s.id)}" aria-label="Eliminar a ${esc(socioName(s))}">${I.trash}</button></span>`] }; }) }],
    foot: list.length ? ['Total', fmtBp(A), d.positive ? money(d.dist / 100, 2) : '—', money(dY.positive ? dY.dist / 100 : 0, 2), ''] : null });
  const acts = `${list.length > 1 ? `<button class="btn btn-sm" type="button" data-act="soc-split">${svgI('split', 14)} Partes iguales</button>` : ''}${list.length ? `<button class="btn btn-sm" type="button" data-act="soc-pcts">${svgI('edit', 14)} Editar porcentajes</button>` : ''}<button class="btn btn-sm btn-cta" type="button" data-act="new-socio">Agregar socio <span class="cta-dot">${I.arrow}</span></button>`;
  const series = months.map(m => utilityOf(m) || 0); let acc = 0; const accS = series.map(v => (acc += v));
  const ch = months.length ? barChart({ height: 240, labels: months.map(mShort), projIdx: projIndex(months), highlight: months.length - 1, series: [{ name: 'Utilidad del mes', values: series, color: '#C9971F' }], line: { name: 'Acumulada del año', values: accS, color: '#AD103C' } }) : empty('Aún no hay meses con datos este año.');
  const hist = list.length && months.length ? board({ cols: [{ label: 'Mes', cls: 'nw', w: '190px' }, { label: 'Utilidad', cls: 'r', w: '150px' }, ...list.map(s => ({ label: esc(socioName(s)), cls: 'r' })), { label: 'Sin asignar', cls: 'r', w: '140px' }],
    groups: [{ rows: months.slice().reverse().map(m => { const dm = distributeProfit(utilityOf(m), list); return { cls: m === p ? 'row-sel' : '', cells: [periodLabel(m), `<span class="${dm.total < 0 ? 'txt-bad' : ''}">${money(dm.total / 100, 2)}</span>`, ...list.map(s => dm.positive ? money(dm.rows.find(r => r.s.id === s.id).cents / 100, 2) : '—'), dm.positive ? money(dm.free / 100, 2) : '—'] }; }) }] }) + '<p class="note">Cada mes se reparte por separado con los porcentajes actuales. Los meses con pérdida no se reparten. El acumulado del año de cada socio sale de repartir la utilidad neta del año (ganancias menos pérdidas).</p>' : '';
  return `${utHero(p, k, d, ytd, A, months)}
    ${lock ? `<div class="lock-note">${svgI('lock', 16)}<span>Los socios y sus porcentajes se editan con la edición abierta.</span><button class="btn btn-sm" type="button" data-act="unlock">Abrir edición</button></div>` : ''}
    ${panel('Socios de la empresa', `<p class="pn-d">La utilidad del mes es el resultado del mes (ingresos − gastos − inversión). Los porcentajes admiten hasta 2 decimales y el reparto siempre cuadra al centavo.</p>${tb}`, acts)}
    ${panel(`Utilidad por mes · ${p.slice(0, 4)}`, ch)}
    ${panel('Reparto por mes', hist || empty(list.length ? 'Aún no hay meses con datos este año.' : 'Cuando agregues socios verás aquí cuánto le tocó a cada uno, mes a mes.'))}`;
}
function socioModal(id) {
  const s = id ? socios.find(x => x.id === id) : { nombre: '', apellido: '', doc: '', tel: '', email: '', nota: '', bp: null };
  const others = assignedBp() - (id ? s.bp : 0), avail = Math.max(0, BP_TOTAL - others);
  const sugg = id ? s.bp : avail;
  openModal(`<h2 id="modal-t">${id ? 'Editar socio' : 'Agregar socio'}</h2><p class="muted">Los demás socios tienen ${fmtBp(others)}. Puedes asignar hasta <b>${fmtBp(avail)}</b>.</p>
    <form data-form="socio" data-id="${esc(id || '')}" data-others="${esc(others)}" novalidate><div class="fgrid">
      ${!id && investors.length ? `<label class="fld span2"><span>Copiar datos de un inversionista (opcional)</span><select data-soc-copy="1"><option value="">—</option>${investors.map(v => `<option value="${esc(v.id)}">${esc(v.nombre + ' ' + v.apellido)}</option>`).join('')}</select></label>` : ''}
      <label class="fld"><span>Nombre *</span><input name="nombre" maxlength="60" value="${esc(s.nombre)}"></label>
      <label class="fld"><span>Apellido</span><input name="apellido" maxlength="60" value="${esc(s.apellido || '')}"></label>
      <label class="fld"><span>Cédula o RIF</span><input name="doc" maxlength="20" value="${esc(s.doc || '')}" placeholder="V-00.000.000"></label>
      <label class="fld"><span>Teléfono</span><input name="tel" maxlength="30" value="${esc(s.tel || '')}"></label>
      <label class="fld span2"><span>Correo</span><input name="email" type="email" maxlength="80" value="${esc(s.email || '')}"></label>
      <label class="fld"><span>Participación en la utilidad (%) *</span><input name="pct" inputmode="decimal" autocomplete="off" data-soc-one="1" value="${esc(sugg == null ? '' : bpTxt(sugg))}" placeholder="Ej. 33,33"><small class="muted">Hasta 2 decimales</small></label>
      <div class="fld"><span>Cómo queda el reparto</span><div class="ut-form-tot" data-soc-tot="1"></div></div>
      <label class="fld span2"><span>Nota (acuerdo entre socios)</span><input name="nota" maxlength="200" value="${esc(s.nota || '')}"></label>
    </div><p class="form-err" hidden></p>
    <div class="modal-acts">${id ? `<button type="button" class="btn btn-danger mr-auto" data-soc-del="${esc(id)}">Eliminar</button>` : ''}<button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Guardar <span class="cta-dot">${I.arrow}</span></button></div></form>`);
  updateSocTotals(document.querySelector('#modal form[data-form="socio"]'));
}
function pctsModal(equal) {
  const list = sortedSocios(); if (!list.length) return socioModal(null);
  const eq = equalSplit(list.length);
  openModal(`<h2 id="modal-t">${equal ? 'Repartir en partes iguales' : 'Porcentajes de participación'}</h2><p class="muted">${equal ? `Cada socio queda con la misma parte. Como 100 no siempre se divide exacto, la centésima que sobra va al primero: así suma justo 100%.` : 'Escribe el porcentaje de cada socio, con hasta 2 decimales. La suma no puede pasar de 100%; lo que quede sin asignar se queda en la empresa.'}</p>
    <form data-form="soc-pcts" novalidate>${board({ cols: [{ label: 'Socio' }, { label: 'Participación (%)', cls: 'r', w: '170px' }], groups: [{ rows: list.map((s, i) => ({ cells: [`<span class="ut-who">${socAvatar(s)}<b>${esc(socioName(s))}</b></span>`, `<input class="num-in ut-pin" name="p_${s.id}" inputmode="decimal" autocomplete="off" data-soc-pct="1" value="${esc(bpTxt(equal ? eq[i] : s.bp))}" aria-label="Participación de ${esc(socioName(s))}">`] })) }] })}
    <div class="ut-form-tot" data-soc-tot="1"></div>
    <p class="form-err" hidden></p>
    <div class="modal-acts"><button type="button" class="btn btn-ghost mr-auto" data-act="soc-eq-fill">${svgI('split', 14)} Partes iguales</button><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Guardar porcentajes <span class="cta-dot">${I.arrow}</span></button></div></form>`);
  updateSocTotals(document.querySelector('#modal form[data-form="soc-pcts"]'));
}
// Suma en vivo de los porcentajes del formulario (enteros, sin errores de decimales)
function updateSocTotals(f) {
  if (!f) return; const box = f.querySelector('[data-soc-tot]'); if (!box) return;
  let total = 0, bad = false;
  if (f.dataset.form === 'socio') { const r = parsePctBp(f.pct.value); if (r.error) bad = !!f.pct.value.trim(); else total = r.bp; total += +f.dataset.others || 0; }
  else f.querySelectorAll('[data-soc-pct]').forEach(i => { const r = parsePctBp(i.value || '0'); if (r.error) bad = true; else total += r.bp; });
  const over = total > BP_TOTAL;
  box.className = 'ut-form-tot ' + (over || bad ? 'over' : total === BP_TOTAL ? 'ok' : '');
  box.innerHTML = `<div class="row"><span>Total asignado</span><b class="${over ? 'txt-bad' : total === BP_TOTAL ? 'txt-ok' : ''}">${bad ? 'Revisa los valores' : fmtBp(total)}</b></div><span class="pbar"><i style="width:${Math.min(100, total / 100).toFixed(2)}%;background:${over ? 'var(--bad)' : total === BP_TOTAL ? 'var(--ok)' : 'var(--gold)'}"></i></span><div class="row"><span>${over ? 'Te pasas por' : 'Queda sin asignar'}</span><b>${fmtBp(Math.abs(BP_TOTAL - total))}</b></div>`;
}
function socDelModal(id) {
  const s = socios.find(x => x.id === id); if (!s) return;
  openModal(`<h2 id="modal-t">Eliminar a ${esc(socioName(s))}</h2><p class="muted">Su ${fmtBp(s.bp)} queda sin asignar hasta que lo repartas entre los demás socios. Esto cambia el reparto de todos los meses.</p>
    <form data-form="soc-del" data-id="${esc(s.id)}" novalidate><p class="form-err" hidden></p><div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-danger">Eliminar socio</button></div></form>`);
}

/* ====================== AGENDA (calendario de planificación + citas con clientes) ======================
   v10: además de las reuniones de socios, inversionistas y equipo, la Agenda maneja CITAS CON CLIENTES
   (o prospectos): servicio, duración, modalidad (presencial, videollamada, llamada o WhatsApp), enlace,
   responsable, recordatorio y estado (programada, confirmada, realizada, reprogramada, cancelada, no asistió).
   Vistas como en Calendario de Apple: Día, Semana, Mes y Lista. Doble clic (o doble toque) en un día u hora
   crea una cita ahí; pellizcar con el trackpad cambia de vista. Confirma por WhatsApp o correo en un toque,
   avisa si dos citas se cruzan y sugiere el próximo horario libre. Las fechas del sistema (corte del día 5,
   vencimientos, cobros de gastos recurrentes, plan de acción y reanudaciones) se calculan con sysEvents()
   y no se guardan. Todo se exporta a cualquier calendario (.ics) y queda en la auditoría. */
let events = store.get('events_v1', []); // { id, title, type, date, allDay, start, end, place, participants:[{k,id}], notes, clientId, clientName, phone, email, service, modality, link, status, reminder, ownerId, notified, createdAt, updatedAt }
const saveEvents = () => store.set('events_v1', events);
let agCfg = Object.assign({ start: '08:00', end: '18:00', days: [1, 2, 3, 4, 5], dur: 30, reminder: 30, view: 'month', wa: 'Hola, {nombre}. Te escribimos de Agora Digital para confirmar tu cita: {servicio} el {dia} a las {hora} ({modalidad}).{lugar} ¿Nos confirmas tu asistencia? Responde SÍ para confirmar o dime si prefieres otra hora.' }, store.get('agenda_cfg_v1', {}));
const saveAgCfg = () => store.set('agenda_cfg_v1', agCfg);
const EV_TYPES = {
  CLIENTE: { label: 'Cita con cliente', color: '#0E7C86' },
  SOCIOS: { label: 'Reunión de socios', color: '#AD103C' },
  INVERSIONISTAS: { label: 'Reunión con inversionistas', color: '#C9971F' },
  EQUIPO: { label: 'Reunión de equipo', color: '#5E6AD2' },
  OTRO: { label: 'Otro compromiso', color: '#8E8E93' },
};
const EV_SERVICES = { DEMO: 'Demostración de 20 minutos', VENTA: 'Reunión de venta', IMPLEMENTACION: 'Implementación', CAPACITACION: 'Capacitación', SEGUIMIENTO: 'Seguimiento', SOPORTE: 'Soporte', COBRO: 'Cobranza', RENOVACION: 'Renovación o cambio de plan', OTRO: 'Otro' };
const EV_MODALITY = { VIDEO: 'Videollamada', PRESENCIAL: 'Presencial', LLAMADA: 'Llamada', WHATSAPP: 'WhatsApp' };
const EV_STATUS = { PROGRAMADA: ['Programada', 'sc-gray'], CONFIRMADA: ['Confirmada', 'sc-ok'], REALIZADA: ['Realizada', 'sc-blue'], REPROGRAMADA: ['Reprogramada', 'sc-warn'], CANCELADA: ['Cancelada', 'sc-bad'], NO_ASISTIO: ['No asistió', 'sc-bad'] };
const EV_REMIND = { 0: 'Sin recordatorio', 10: '10 minutos antes', 30: '30 minutos antes', 60: '1 hora antes', 120: '2 horas antes', 1440: '1 día antes' };
const EV_DUR = { 15: '15 min', 20: '20 min', 30: '30 min', 45: '45 min', 60: '1 hora', 90: '1 h 30 min', 120: '2 horas', 180: '3 horas' };
const SYS_TYPES = {
  CORTE: { label: 'Corte del día 5', color: '#C9971F', href: '#/cobranza' },
  VENCE: { label: 'Vencimiento de factura', color: '#D9480F', href: '#/facturacion' },
  GASTO: { label: 'Cobro de gasto recurrente', color: '#5E6480', href: '#/gastos' },
  PLAN: { label: 'Plan de acción', color: '#037F4C', href: '#/plan' },
  PAUSA: { label: 'Reanudación de cliente', color: '#00A3A3', href: '#/pausas' },
};
const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DOW_S = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const dayLong = d => { const x = D(d); return `${DOW[x.getUTCDay()]} ${x.getUTCDate()} de ${MONTHS[x.getUTCMonth()]}`; };
const dayLongCap = d => { const t = dayLong(d); return t[0].toUpperCase() + t.slice(1); };
const hhmm = t => { if (!t) return ''; const [h, m] = t.split(':').map(Number); const ap = h < 12 ? 'a. m.' : 'p. m.'; const h12 = h % 12 || 12; return `${h12}:${String(m).padStart(2, '0')} ${ap}`; };
const toMin = t => { if (!t || !/^\d{1,2}:\d{2}/.test(t)) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = n => `${String(Math.floor(Math.max(0, Math.min(1439, n)) / 60)).padStart(2, '0')}:${String(Math.max(0, Math.min(1439, n)) % 60).padStart(2, '0')}`;
const evEndMin = e => { const s = toMin(e.start); if (s == null) return null; const en = toMin(e.end); return en != null && en > s ? en : s + (+e.duration || 60); };
const evTime = e => e.allDay || !e.start ? 'Todo el día' : `${hhmm(e.start)}${e.end ? ' – ' + hhmm(e.end) : ''}`;
const agF = () => state.agF || (state.agF = { user: true, sys: true });
const agView = () => state.agView || agCfg.view || 'month';
const partName = pt => pt.k === 's' ? (() => { const s = socios.find(x => x.id === pt.id); return s ? socioName(s) : null; })() : (() => { const v = investors.find(x => x.id === pt.id); return v ? `${v.nombre} ${v.apellido}`.trim() : null; })();
const partAvatar = pt => { if (pt.k === 's') { const s = socios.find(x => x.id === pt.id); return s ? socAvatar(s) : ''; } const v = investors.find(x => x.id === pt.id); if (!v) return ''; return `<span class="ut-av ag-av-i" aria-hidden="true">${esc(((v.nombre || '?')[0] + ((v.apellido || '')[0] || '')).toUpperCase())}</span>`; };
const evClientName = e => e.clientId ? ((clientDefs.find(c => c.id === e.clientId) || {}).name || e.clientName || 'Cliente') : (e.clientName || '');
const evStatus = e => e.type === 'CLIENTE' ? (e.status || 'PROGRAMADA') : null;
function agendaTodayCount() { return events.filter(e => e.date === TODAY && !['CANCELADA', 'REALIZADA', 'NO_ASISTIO'].includes(e.status)).length; }
// Fechas automáticas del sistema entre dos fechas (inclusive)
function sysEvents(from, to) {
  const out = [], months = periodRange(from.slice(0, 7), to.slice(0, 7)), inR = d => d && d >= from && d <= to;
  months.forEach(q => { const d = `${q}-05`; if (inR(d) && ALL_PERIODS.includes(q)) { const n = cycleRows(q).length; if (n) out.push({ sys: 'CORTE', id: 'sys-corte-' + q, date: d, title: 'Corte de cobro del día 5', detail: `${n} cliente(s) con servicio ese mes` }); } });
  db.invoices.filter(i => !i.voided && !(i.paidDate && i.paidDate <= TODAY) && inR(i.dueDate)).forEach(i => { const c = db.clients.find(x => x.id === i.clientId); out.push({ sys: 'VENCE', id: 'sys-vence-' + i.id, date: i.dueDate, title: `Vence la factura ${i.num || i.id}`, detail: `${c ? c.name : '—'} · ${money(invoiceUsd(db, i), 2)}${i.dueDate < TODAY ? ' · vencida' : ''}` }); });
  recExp.filter(r => r.active && r.start).forEach(r => months.forEach(q => { const d = dayOfP(q, r.day); if (!inR(d) || d < r.start || (r.end && d > r.end) || (r.skips || []).includes(q)) return; out.push({ sys: 'GASTO', id: `sys-gasto-${r.id}-${q}`, date: d, title: `Cobro: ${r.concept}`, detail: `${money(usdOf(r.amount, r.currency, d), 2)}${r.payee ? ' · ' + r.payee : ''}` }); }));
  state.actions.filter(a => a.status !== 'DONE' && inR(a.dueDate)).forEach(a => out.push({ sys: 'PLAN', id: 'sys-plan-' + a.id, date: a.dueDate, title: `Fecha límite: ${a.title}`, detail: `Responsable: ${ownerName(a.ownerId)}` }));
  clientDefs.forEach(c => (c.pauses || []).forEach(pp => { if (inR(pp.end)) out.push({ sys: 'PAUSA', id: 'sys-pausa-' + pp.id, date: pp.end, title: `Reanuda ${c.name}`, detail: PAUSE_REASONS[pp.reason] || 'Fin de la pausa' }); }));
  return out;
}
// Eventos visibles (según los filtros) entre dos fechas, ordenados por fecha y hora
function agendaItems(from, to) {
  const f = agF();
  const u = f.user ? events.filter(e => e.date >= from && e.date <= to && (!f.onlyCli || e.type === 'CLIENTE')) : [];
  const sy = f.sys ? sysEvents(from, to) : [];
  const key = e => `${e.date} ${e.sys ? '0' : e.allDay || !e.start ? '1' : '2' + e.start}`;
  return [...u, ...sy].sort((a, b) => key(a).localeCompare(key(b)) || String(a.title).localeCompare(String(b.title), 'es'));
}
const evColor = e => e.sys ? SYS_TYPES[e.sys].color : (EV_TYPES[e.type] || EV_TYPES.OTRO).color;
const evKind = e => e.sys ? SYS_TYPES[e.sys].label : e.type === 'CLIENTE' && e.service ? `${EV_SERVICES[e.service] || 'Cita'}${e.modality ? ' · ' + EV_MODALITY[e.modality] : ''}` : (EV_TYPES[e.type] || EV_TYPES.OTRO).label;
const evStCell = e => { const s = evStatus(e); return s ? `<span class="sc ${EV_STATUS[s][1]} sc-xs">${EV_STATUS[s][0]}</span>` : ''; };
function evRow(e, opts = {}) {
  const parts = (e.participants || []).filter(pt => partName(pt)); const cn = evClientName(e);
  return `<li class="ag-ev ${e.sys ? 'is-sys' : ''} ${['CANCELADA', 'NO_ASISTIO'].includes(e.status) ? 'is-off' : ''}" style="--ec:${evColor(e)}" ${e.sys ? '' : `data-ev-open="${e.id}"`}>
    <span class="ag-ev-time">${opts.date ? `<b>${D(e.date).getUTCDate()} ${MONTHS[D(e.date).getUTCMonth()].slice(0, 3)}</b>` : ''}${e.sys ? 'Automático' : esc(evTime(e))}</span>
    <span class="ag-ev-main"><b>${esc(e.title)}</b><small>${esc(evKind(e))}${cn ? ' · ' + esc(cn) : ''}${e.place ? ' · ' + esc(e.place) : ''}${e.detail ? ' · ' + esc(e.detail) : ''}</small>
      ${evStCell(e)}
      ${parts.length ? `<span class="ag-parts">${parts.slice(0, 6).map(partAvatar).join('')}<span class="muted small">${esc(parts.map(partName).join(', '))}</span></span>` : ''}
      ${e.notes && !opts.compact ? `<small class="ag-notes">${esc(e.notes)}</small>` : ''}</span>
    <span class="acts">${e.sys ? `<a class="btn btn-sm btn-ghost" href="${SYS_TYPES[e.sys].href}">Ver</a>` : `${e.type === 'CLIENTE' && (e.phone || '').replace(/\D/g, '').length >= 7 && !['REALIZADA', 'CANCELADA'].includes(e.status) ? `<button class="btn btn-sm btn-ok" type="button" data-ev-wa="${esc(e.id)}">${svgI('chat', 13)} Confirmar</button>` : ''}<button class="btn btn-sm" type="button" data-ev-edit="${esc(e.id)}">Editar</button><button class="icon-btn" type="button" data-ev-ics="${esc(e.id)}" aria-label="Agregar a mi calendario" title="Agregar a mi calendario (.ics)">${svgI('download', 15)}</button><button class="icon-btn" type="button" data-ev-del="${esc(e.id)}" aria-label="Eliminar ${esc(e.title)}">${I.trash}</button>`}</span>
  </li>`;
}
// Semana (domingo a sábado) que contiene una fecha
const weekStart = d => isoD(addDays(D(d), -D(d).getUTCDay()));
function agTitle(view, anchor) {
  if (view === 'day') return `${dayLongCap(anchor)} <span>${anchor.slice(0, 4)}</span>`;
  if (view === 'week') { const a = weekStart(anchor), b = isoD(addDays(D(a), 6)); const da = D(a), dbb = D(b); return da.getUTCMonth() === dbb.getUTCMonth() ? `${da.getUTCDate()} – ${dbb.getUTCDate()} de ${MONTHS[dbb.getUTCMonth()]} <span>${b.slice(0, 4)}</span>` : `${da.getUTCDate()} ${MONTHS[da.getUTCMonth()].slice(0, 3)} – ${dbb.getUTCDate()} ${MONTHS[dbb.getUTCMonth()].slice(0, 3)} <span>${b.slice(0, 4)}</span>`; }
  if (view === 'list') return `Próximas citas <span>${monthYear(anchor.slice(0, 7))}</span>`;
  return `${mLong(anchor.slice(0, 7))} <span>${anchor.slice(0, 4)}</span>`;
}
// Cuadrícula de horas (Día y Semana) al estilo de Calendario: eventos posicionados por hora, línea roja de la hora actual
function timeGrid(days, items) {
  const h0 = Math.max(0, Math.floor((Math.min(toMin(agCfg.start) || 480, ...items.filter(e => !e.sys && !e.allDay && e.start).map(e => toMin(e.start))) - 60) / 60)), h1 = Math.min(24, Math.ceil((Math.max(toMin(agCfg.end) || 1080, ...items.filter(e => !e.sys && !e.allDay && e.start).map(evEndMin)) + 60) / 60));
  const HH = 52, hours = Array.from({ length: h1 - h0 }, (_, i) => h0 + i);
  const nowMin = (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); })();
  const allDay = d => items.filter(e => e.date === d && (e.sys || e.allDay || !e.start));
  const timed = d => { const l = items.filter(e => e.date === d && !e.sys && !e.allDay && e.start).map(e => ({ e, s: toMin(e.start), en: evEndMin(e) })).sort((a, b) => a.s - b.s || b.en - a.en);
    const cols = []; l.forEach(x => { let c = cols.findIndex(end => end <= x.s); if (c < 0) { c = cols.length; cols.push(0); } cols[c] = x.en; x.col = c; });
    l.forEach(x => { x.n = Math.max(1, ...l.filter(y => y.s < x.en && y.en > x.s).map(y => y.col + 1)); }); return l; };
  const isWork = d => agCfg.days.includes(D(d).getUTCDay());
  const ws = toMin(agCfg.start) || 480, we = toMin(agCfg.end) || 1080;
  return `<div class="tg ${days.length === 1 ? 'tg-day' : ''}" style="--cols:${days.length};--hh:${HH}px" role="grid" aria-label="Calendario por horas">
    <div class="tg-head"><span class="tg-corner"></span>${days.map(d => `<button type="button" class="tg-dh ${d === TODAY ? 'today' : ''} ${d === state.agDay ? 'sel' : ''}" data-ag-pick="${esc(d)}"><small>${DOW_S[D(d).getUTCDay()]}</small><b>${D(d).getUTCDate()}</b></button>`).join('')}</div>
    <div class="tg-all"><span class="tg-corner">Todo el día</span>${days.map(d => `<div class="tg-ac" data-slot="${d}|">${allDay(d).slice(0, 4).map(e => `<span class="ag-chip ${e.sys ? 'is-sys' : 'is-all'}" style="--ec:${evColor(e)}" title="${esc(e.title)}" ${e.sys ? '' : `data-ev-open="${e.id}"`}>${esc(e.title)}</span>`).join('')}${allDay(d).length > 4 ? `<span class="ag-more">+${allDay(d).length - 4}</span>` : ''}</div>`).join('')}</div>
    <div class="tg-body"><div class="tg-hours">${hours.map(h => `<span style="height:${HH}px">${h === 0 ? '' : hhmm(fromMin(h * 60)).replace(':00', '')}</span>`).join('')}</div>
      ${days.map(d => `<div class="tg-col ${d === TODAY ? 'today' : ''} ${isWork(d) ? '' : 'off'}" data-day="${esc(d)}">${hours.map(h => `<div class="tg-slot ${h * 60 < ws || h * 60 >= we ? 'off' : ''}" data-slot="${d}|${fromMin(h * 60)}" style="height:${HH}px" title="Doble clic para agendar a las ${hhmm(fromMin(h * 60))}"><i data-slot="${d}|${fromMin(h * 60 + 30)}"></i></div>`).join('')}
        ${timed(d).map(x => { const top = (x.s - h0 * 60) / 60 * HH, hgt = Math.max(22, (x.en - x.s) / 60 * HH - 2), w = 100 / x.n; return `<button type="button" class="tg-ev ${['CANCELADA', 'NO_ASISTIO'].includes(x.e.status) ? 'is-off' : ''} ${x.e.status === 'CONFIRMADA' ? 'is-ok' : ''}" style="--ec:${evColor(x.e)};top:${top}px;height:${hgt}px;left:calc(${x.col * w}% + 2px);width:calc(${w}% - 4px)" data-ev-open="${esc(x.e.id)}" title="${esc(evTime(x.e) + ' · ' + x.e.title)}"><b>${esc(x.e.title)}</b><small>${esc(hhmm(x.e.start))}${evClientName(x.e) && !x.e.title.includes(evClientName(x.e)) ? ' · ' + esc(evClientName(x.e)) : ''}</small></button>`; }).join('')}
        ${d === TODAY && nowMin >= h0 * 60 && nowMin <= h1 * 60 ? `<i class="tg-now" style="top:${(nowMin - h0 * 60) / 60 * HH}px" aria-hidden="true"></i>` : ''}</div>`).join('')}</div></div>`;
}
function viewAgenda() {
  const today = TODAY, view = agView();
  const month = state.agMonth || state.period;
  let sel = state.agDay && (view !== 'month' || state.agDay.slice(0, 7) === month) ? state.agDay : (today.slice(0, 7) === month ? today : month + '-01');
  state.agMonth = sel.slice(0, 7); state.agDay = sel;
  const f = agF(); const dir = state.agDir || ''; state.agDir = '';
  let body = '', from, to;
  if (view === 'month') {
    const first = D(state.agMonth + '-01'), start = addDays(first, -first.getUTCDay());
    const cells = Array.from({ length: 42 }, (_, i) => isoD(addDays(start, i))); from = cells[0]; to = cells[41];
    const items = agendaItems(from, to); const byDay = {}; items.forEach(e => { (byDay[e.date] = byDay[e.date] || []).push(e); });
    body = `<div class="ag-cal ${dir ? 'slide-' + dir : ''}" role="grid" aria-label="Calendario de ${monthYear(state.agMonth)}">
    <div class="ag-dow" role="row">${DOW_S.map((d, i) => `<span role="columnheader" class="${i === 0 || i === 6 ? 'we' : ''}">${d}</span>`).join('')}</div>
    <div class="ag-grid">${cells.map(d => { const evs = byDay[d] || [], inM = d.slice(0, 7) === state.agMonth, isT = d === today, isS = d === sel;
      return `<button type="button" role="gridcell" class="ag-day ${inM ? '' : 'out'} ${isT ? 'today' : ''} ${isS ? 'sel' : ''} ${d < today ? 'past' : ''}" data-ag-day="${esc(d)}" data-slot="${d}|" aria-selected="${isS}" aria-label="${dayLongCap(d)}${isT ? ', hoy' : ''}: ${evs.length ? evs.length + ' evento(s)' : 'sin eventos'}. Doble clic para agendar." tabindex="${isS ? 0 : -1}"><span class="ag-n">${D(d).getUTCDate()}</span><span class="ag-chips">${evs.slice(0, 3).map(e => `<span class="ag-chip ${e.sys ? 'is-sys' : e.allDay || !e.start ? 'is-all' : 'is-timed'} ${['CANCELADA', 'NO_ASISTIO'].includes(e.status) ? 'is-off' : ''}" style="--ec:${evColor(e)}" title="${esc((e.sys ? evKind(e) : evTime(e)) + ' · ' + e.title)}">${e.start && !e.sys && !e.allDay ? `<em>${esc(e.start)}</em> ` : ''}${esc(e.title)}</span>`).join('')}${evs.length > 3 ? `<span class="ag-more">+${evs.length - 3} más</span>` : ''}</span><span class="ag-dots">${evs.slice(0, 4).map(e => `<i style="--ec:${evColor(e)}"></i>`).join('')}</span></button>`; }).join('')}</div></div>`;
  } else if (view === 'week' || view === 'day') {
    const a = view === 'week' ? weekStart(sel) : sel; const days = Array.from({ length: view === 'week' ? 7 : 1 }, (_, i) => isoD(addDays(D(a), i))); from = days[0]; to = days[days.length - 1];
    body = `<div class="ag-tgw ${dir ? 'slide-' + dir : ''}">${timeGrid(days, agendaItems(from, to))}</div>`;
  } else {
    from = sel < today ? sel : today; to = isoD(addDays(D(from), 60));
    const items = agendaItems(from, to); const byDay = {}; items.forEach(e => { (byDay[e.date] = byDay[e.date] || []).push(e); });
    body = Object.keys(byDay).length ? `<div class="ag-listv">${Object.entries(byDay).map(([d, l]) => `<section class="agl-day ${d === today ? 'today' : ''}"><h3><b>${dayLongCap(d)}</b>${d === today ? ' <span class="pill st-ok">Hoy</span>' : ''}<small>${d.slice(0, 4)}</small></h3><ul class="ag-list">${l.map(e => evRow(e, { compact: true })).join('')}</ul></section>`).join('')}</div>` : `<div class="ag-empty"><span class="ag-empty-ic">${svgI('agenda', 22)}</span><p>No hay nada agendado en los próximos 60 días.</p><button class="btn btn-sm btn-cta" type="button" data-ev-new="${esc(today)}" data-ev-kind="CLIENTE">Agendar una cita con un cliente</button></div>`;
  }
  const dayEvs = agendaItems(sel, sel);
  const dayPanel = view === 'list' ? '' : `<section class="panel ag-side" aria-labelledby="ag-dt"><header class="pn-h"><h2 id="ag-dt">${dayLongCap(sel)}${sel === today ? ' <span class="pill st-ok">Hoy</span>' : ''}</h2><div class="pn-a"><button class="btn btn-sm btn-cta" type="button" data-ev-new="${esc(sel)}" data-ev-kind="CLIENTE">Agendar <span class="cta-dot">${svgI('plus', 13)}</span></button></div></header>
    ${dayEvs.length ? `<ul class="ag-list">${dayEvs.map(e => evRow(e)).join('')}</ul>` : `<div class="ag-empty"><span class="ag-empty-ic">${svgI('agenda', 22)}</span><p>No hay nada agendado este día.</p><button class="btn btn-sm" type="button" data-ev-new="${esc(sel)}" data-ev-kind="CLIENTE">Agendar una cita</button></div>`}
    <p class="note ag-tip">${svgI('spark', 13)} Doble clic (o doble toque) en un día o una hora para agendar ahí. Con el trackpad, pellizca para cambiar entre Día, Semana y Mes.</p></section>`;
  const in30 = isoD(addDays(D(today), 30)); const up = agendaItems(today, in30);
  const upEmpty = 'No hay nada en los próximos 30 días con los filtros elegidos.';
  const upB = board({ cols: [{ label: 'Cuándo', cls: 'nw', w: '210px' }, { label: 'Qué' }, { label: 'Cliente o participantes', w: '26%' }, { label: 'Estado', w: '130px' }],
    groups: [{ emptyText: upEmpty, rows: up.map(e => ({ cls: e.sys ? 'row-sys' : '', cells: [`<b>${fmtDate(e.date)}</b><small class="muted">${DOW[D(e.date).getUTCDay()]}${e.date === today ? ' · hoy' : ''} · ${e.sys ? 'automático' : esc(evTime(e).replace(/^Todo/, 'todo'))}</small>`, `<span class="ag-ttl" style="--ec:${evColor(e)}">${esc(e.title)}</span><small class="muted">${esc(evKind(e))}${e.place ? ' · ' + esc(e.place) : ''}</small>`, esc(e.sys ? (e.detail || '') : (evClientName(e) || (e.participants || []).map(partName).filter(Boolean).join(', ') || '—')), e.sys ? '<span class="muted small">Del sistema</span>' : (evStCell(e) || '<span class="muted small">—</span>')] })) }] });
  const upM = up.length ? `<ul class="ag-list ag-up-m">${up.map(e => evRow(e, { date: true, compact: true })).join('')}</ul>` : `<p class="muted ag-up-m">${upEmpty}</p>`;
  // indicadores
  const wkA = weekStart(today), wkB = isoD(addDays(D(wkA), 6));
  const cliWeek = events.filter(e => e.type === 'CLIENTE' && e.date >= wkA && e.date <= wkB && e.status !== 'CANCELADA').length;
  const porConf = events.filter(e => e.type === 'CLIENTE' && e.date >= today && (e.status || 'PROGRAMADA') === 'PROGRAMADA').length;
  const d90 = isoD(addDays(D(today), -90)); const done = events.filter(e => e.type === 'CLIENTE' && e.date >= d90 && e.date <= today && ['REALIZADA', 'NO_ASISTIO'].includes(e.status));
  const asis = done.length ? done.filter(e => e.status === 'REALIZADA').length / done.length * 100 : null;
  const nextE = events.filter(e => (e.date > today || (e.date === today && (!e.start || e.start >= new Date().toTimeString().slice(0, 5)))) && !['CANCELADA', 'REALIZADA', 'NO_ASISTIO'].includes(e.status)).sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')))[0];
  const stat = (t, v, s, c) => `<article class="micro" style="--mc:${c}"><header class="mm-h"><h3>${t}</h3></header><div class="mm-row"><p class="mm-v">${v}</p></div>${s ? `<p class="mm-foot">${s}</p>` : ''}</article>`;
  const kpis = `<div class="micro-grid ag-kpis" style="--cols:4">${stat('Citas con clientes esta semana', num(cliWeek), `Del ${fmtDate(wkA)} al ${fmtDate(wkB)}`, '#0E7C86')}${stat('Por confirmar', num(porConf), porConf ? 'Confírmalas por WhatsApp con un toque' : 'Todo confirmado', porConf ? '#C9971F' : '#248A3D')}${stat('Asistencia (90 días)', asis == null ? 'N/D' : pct(asis, 0), done.length ? `${done.filter(e => e.status === 'REALIZADA').length} realizadas de ${done.length}` : 'Marca tus citas como realizadas o no asistió', '#5E6AD2')}${stat('Lo próximo', nextE ? (nextE.date === today ? 'Hoy' : fmtDate(nextE.date)) : 'Nada', nextE ? `${esc(nextE.title)} · ${esc(evTime(nextE))}` : 'Agenda tu primera cita', '#AD103C')}</div>`;
  const views = [['day', 'Día', '1'], ['week', 'Semana', '2'], ['month', 'Mes', '3'], ['list', 'Lista', '4']];
  const head = `<div class="ag-head"><div class="ag-title"><h2>${agTitle(view, sel)}</h2></div>
    <div class="ag-nav"><button class="icon-btn" type="button" data-ag-nav="-1" aria-label="Anterior" title="Anterior (←)">${svgI('chevL', 18)}</button><button class="btn btn-sm" type="button" data-ag-nav="0" title="Hoy (T)">Hoy</button><button class="icon-btn" type="button" data-ag-nav="1" aria-label="Siguiente" title="Siguiente (→)">${svgI('chevR', 18)}</button></div>
    <div class="ag-views"><div class="seg" role="group" aria-label="Vista del calendario">${views.map(([v, l, k]) => `<button type="button" class="seg-b ${view === v ? 'is-on' : ''}" data-ag-view="${esc(v)}" aria-pressed="${view === v}" title="${l} (${k})">${l}</button>`).join('')}</div></div>
    <div class="ag-filters" role="group" aria-label="Qué mostrar"><label class="ag-tog"><input type="checkbox" data-ag-f="user" ${f.user ? 'checked' : ''}><span>Citas y reuniones</span></label><label class="ag-tog"><input type="checkbox" data-ag-f="onlyCli" ${f.onlyCli ? 'checked' : ''}><span>Solo clientes</span></label><label class="ag-tog"><input type="checkbox" data-ag-f="sys" ${f.sys ? 'checked' : ''}><span>Fechas del sistema</span></label></div>
    <div class="ag-acts"><button class="btn btn-sm" type="button" data-act="ev-ics-all" title="Descarga tus citas y reuniones para abrirlas en el calendario de tu teléfono o computadora">${svgI('download', 14)} Exportar (.ics)</button><button class="btn btn-sm" type="button" data-ev-new="${esc(sel)}" data-ev-kind="SOCIOS">Nueva reunión</button><button class="btn btn-sm btn-cta" type="button" data-ev-new="${esc(sel)}" data-ev-kind="CLIENTE">Agendar cita con cliente <span class="cta-dot">${I.arrow}</span></button></div></div>`;
  const legend = `<div class="ag-legend">${Object.values(EV_TYPES).map(t => `<span><i style="--ec:${t.color}"></i>${t.label}</span>`).join('')}${f.sys ? `<span class="sys"><i></i>Fechas del sistema</span>` : ''}</div>`;
  return `${kpis}<div class="ag-layout ag-v-${view}"><section class="panel ag-main" aria-label="Calendario" data-pinch="agenda">${head}${body}${legend}</section>${dayPanel}</div>${view === 'list' ? '' : panel('Próximos 30 días', `<div class="ag-up-t">${upB}</div>${upM}`)}`;
}
// Navegar el calendario según la vista (← →, deslizar, botones)
function agStep(n) {
  const v = agView(); const sel = state.agDay || TODAY;
  if (!n) { state.agDir = TODAY > sel ? 'r' : TODAY < sel ? 'l' : ''; state.agDay = TODAY; state.agMonth = TODAY.slice(0, 7); return render(); }
  state.agDir = n > 0 ? 'r' : 'l';
  if (v === 'month') { state.agMonth = n > 0 ? ymNext(state.agMonth || sel.slice(0, 7)) : prevPeriod(state.agMonth || sel.slice(0, 7)); state.agDay = state.agMonth === TODAY.slice(0, 7) ? TODAY : state.agMonth + '-01'; }
  else { state.agDay = isoD(addDays(D(sel), n * (v === 'week' ? 7 : v === 'day' ? 1 : 30))); state.agMonth = state.agDay.slice(0, 7); }
  render();
}
function agSetView(v) { if (!['day', 'week', 'month', 'list'].includes(v) || v === agView()) return; state.agView = v; agCfg.view = v; saveAgCfg(); render(); }
// Próximo horario libre (días y horas de atención de Ajustes) para una duración dada, desde una fecha y hora
function nextFreeSlot(fromDate, fromTime, dur, ignoreId) {
  const ws = toMin(agCfg.start) || 480, we = toMin(agCfg.end) || 1080; dur = +dur || agCfg.dur || 30;
  for (let i = 0; i < 45; i++) {
    const d = isoD(addDays(D(fromDate), i)); if (!agCfg.days.includes(D(d).getUTCDay())) continue;
    const nowM = (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); })();
    let t = Math.max(ws, i === 0 ? Math.max(toMin(fromTime) || ws, d === TODAY ? Math.ceil((nowM + 15) / 15) * 15 : ws) : ws);
    const busy = events.filter(e => e.id !== ignoreId && e.date === d && !e.allDay && e.start && !['CANCELADA', 'NO_ASISTIO'].includes(e.status)).map(e => [toMin(e.start), evEndMin(e)]).sort((a, b) => a[0] - b[0]);
    while (t + dur <= we) { const hit = busy.find(([s, en]) => t < en && t + dur > s); if (!hit) return { date: d, start: fromMin(t), end: fromMin(t + dur) }; t = Math.ceil(hit[1] / 15) * 15; }
  }
  return null;
}
function evConflicts(data, ignoreId) {
  if (data.allDay || !data.start) return [];
  const s = toMin(data.start), en = evEndMin(data);
  return events.filter(e => e.id !== ignoreId && e.date === data.date && !e.allDay && e.start && !['CANCELADA', 'NO_ASISTIO'].includes(e.status) && toMin(e.start) < en && evEndMin(e) > s);
}
function eventModal(id, presetDate, preset = {}) {
  const kind = preset.type || (id ? null : 'CLIENTE');
  const base = { title: '', type: kind || (socios.length ? 'SOCIOS' : 'OTRO'), date: presetDate || state.agDay || TODAY, allDay: false, start: preset.start || '10:00', end: '', duration: preset.duration || agCfg.dur || 30, place: '', participants: [], notes: '', clientId: preset.clientId || '', clientName: preset.clientName || '', phone: '', email: '', service: preset.service || 'DEMO', modality: 'VIDEO', link: '', status: 'PROGRAMADA', reminder: agCfg.reminder, ownerId: 'dir' };
  const e = id ? Object.assign({}, base, events.find(x => x.id === id) || {}) : base; if (id && !events.find(x => x.id === id)) return;
  if (!id && e.type === 'CLIENTE' && !preset.start) { const fs = nextFreeSlot(e.date, null, e.duration); if (fs && fs.date === e.date) e.start = fs.start; }
  if (!e.end && e.start) e.end = fromMin(toMin(e.start) + (+e.duration || 30));
  if (e.clientId) { const c = clientDefs.find(x => x.id === e.clientId); if (c) { e.phone = e.phone || (c.opt && c.opt.tel) || ''; e.email = e.email || (c.opt && c.opt.email) || ''; } }
  const has = (k, pid) => (e.participants || []).some(pt => pt.k === k && pt.id === pid);
  const chk = (k, pid, label, av) => `<label class="ag-pk"><input type="checkbox" name="pt" value="${k}:${pid}" ${has(k, pid) ? 'checked' : ''}>${av}<span>${esc(label)}</span></label>`;
  const socL = socios.map(s => chk('s', s.id, socioName(s), socAvatar(s))).join(''), invL = investors.map(v => chk('i', v.id, `${v.nombre} ${v.apellido}`.trim(), partAvatar({ k: 'i', id: v.id }))).join('');
  const cliOpts = `<option value="">Prospecto (todavía no es cliente)</option>${clientDefs.slice().sort((a, b) => a.name.localeCompare(b.name, 'es')).map(c => `<option value="${esc(c.id)}" ${c.id === e.clientId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}`;
  const isCli = e.type === 'CLIENTE';
  openModal(`<h2 id="modal-t">${id ? (isCli ? 'Editar cita' : 'Editar reunión') : isCli ? 'Agendar cita con cliente' : 'Nueva reunión'}</h2>
    <form data-form="event" data-id="${esc(id || '')}" novalidate><div class="fgrid">
      <label class="fld"><span>Tipo</span><select name="type" data-ev-type="1">${opts(Object.fromEntries(Object.entries(EV_TYPES).map(([k, t]) => [k, t.label])), e.type)}</select></label>
      <label class="fld" data-evk="CLIENTE"><span>Estado</span><select name="status">${opts(Object.fromEntries(Object.entries(EV_STATUS).map(([k, v]) => [k, v[0]])), e.status || 'PROGRAMADA')}</select></label>
      <fieldset class="fset span2" data-evk="CLIENTE"><legend>Cliente</legend><div class="fgrid">
        <label class="fld span2"><span>Cliente</span><select name="clientId" data-ev-client="1">${cliOpts}</select></label>
        <label class="fld" data-ev-prospect ${e.clientId ? 'hidden' : ''}><span>Nombre del prospecto *</span><input name="clientName" maxlength="80" value="${esc(e.clientId ? '' : e.clientName || '')}" placeholder="Persona o empresa"></label>
        <label class="fld"><span>WhatsApp o teléfono</span><input name="phone" maxlength="30" inputmode="tel" value="${esc(e.phone || '')}" placeholder="0412-000-0000"></label>
        <label class="fld"><span>Correo</span><input name="email" type="email" maxlength="80" value="${esc(e.email || '')}" placeholder="cliente@empresa.com"></label>
        <label class="fld"><span>Servicio</span><select name="service" data-ev-service="1">${opts(EV_SERVICES, e.service || 'DEMO')}</select></label>
      </div></fieldset>
      <label class="fld span2"><span>Título *</span><input name="title" maxlength="120" value="${esc(e.title)}" placeholder="${esc(isCli ? 'Se llena solo: servicio + cliente' : 'Ej. Revisión mensual de resultados')}"></label>
      <label class="fld"><span>Fecha *</span><input type="date" name="date" value="${esc(e.date)}" min="2024-01-01" max="${DATE_MAX}"></label>
      <label class="fld span2 chk" data-evk="SOCIOS INVERSIONISTAS EQUIPO OTRO"><input type="checkbox" name="allDay" data-ev-allday="1" ${e.allDay ? 'checked' : ''}> Todo el día</label>
      <label class="fld" data-ev-time ${e.allDay ? 'hidden' : ''}><span>Hora de inicio *</span><input type="time" name="start" step="300" value="${esc(e.start || '')}" data-ev-start="1"></label>
      <label class="fld" data-ev-time ${e.allDay ? 'hidden' : ''}><span>Duración</span><select name="duration" data-ev-dur="1">${opts(EV_DUR, String(e.duration || 30))}</select></label>
      <label class="fld" data-ev-time ${e.allDay ? 'hidden' : ''}><span>Hora de fin</span><input type="time" name="end" step="300" value="${esc(e.end || '')}"></label>
      <div class="fld" data-ev-time ${e.allDay ? 'hidden' : ''}><span>&nbsp;</span><button type="button" class="btn btn-tint" data-ev-free="1">${svgI('spark', 14)} Sugerir horario libre</button></div>
      <div class="fld span2" data-evk="CLIENTE"><span>Modalidad</span><div class="rate-chips" role="radiogroup" aria-label="Modalidad">${Object.entries(EV_MODALITY).map(([k, v]) => `<label class="rate-chip"><input type="radio" name="modality" value="${esc(k)}" ${k === (e.modality || 'VIDEO') ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div></div>
      <label class="fld span2"><span>Lugar o enlace de la videollamada</span><input name="place" maxlength="200" value="${esc(e.place || e.link || '')}" placeholder="Ej. Oficina, https://meet.google.com/… o Zoom"></label>
      <label class="fld"><span>Responsable</span><select name="ownerId">${OWNERS().map(o => `<option value="${esc(o.id)}" ${o.id === (e.ownerId || 'dir') ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></label>
      <label class="fld"><span>Recordatorio</span><select name="reminder">${opts(EV_REMIND, String(e.reminder != null ? e.reminder : agCfg.reminder))}</select></label>
      ${socL || invL ? `<fieldset class="fset span2" data-evk="SOCIOS INVERSIONISTAS EQUIPO OTRO"><legend>Participantes</legend>${socL ? `<p class="ag-pk-t">Socios</p><div class="ag-pks">${socL}</div>` : ''}${invL ? `<p class="ag-pk-t">Inversionistas</p><div class="ag-pks">${invL}</div>` : ''}</fieldset>` : `<p class="span2 muted small" data-evk="SOCIOS INVERSIONISTAS">Cuando registres socios (en Utilidades) o inversionistas, podrás invitarlos aquí.</p>`}
      <label class="fld span2"><span>Notas o agenda de la reunión</span><textarea name="notes" rows="3" maxlength="800">${esc(e.notes || '')}</textarea></label>
    </div>
    <div class="ev-conflict" data-ev-conflict hidden></div>
    <p class="form-err" hidden></p>
    <div class="modal-acts">${id ? `<button type="button" class="btn btn-danger mr-auto" data-ev-del="${esc(id)}">Eliminar</button>` : ''}<button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">${id ? 'Guardar cambios' : 'Agendar'} <span class="cta-dot">${I.arrow}</span></button></div></form>`);
  const f = document.querySelector('#modal form[data-form="event"]'); if (f) evFormSync(f);
}
// Muestra los campos según el tipo (cita con cliente o reunión) y mantiene la hora de fin con la duración
function evFormSync(f, changed) {
  const t = f.type.value, cli = t === 'CLIENTE';
  f.querySelectorAll('[data-evk]').forEach(el => { el.hidden = !el.dataset.evk.split(' ').includes(t); });
  if (cli && f.allDay.checked) { f.allDay.checked = false; f.querySelectorAll('[data-ev-time]').forEach(x => { x.hidden = false; }); }
  const pros = f.querySelector('[data-ev-prospect]'); if (pros) pros.hidden = !cli || !!f.clientId.value;
  if (changed === 'client' && f.clientId.value) { const c = clientDefs.find(x => x.id === f.clientId.value); if (c) { if (c.opt && c.opt.tel) f.phone.value = c.opt.tel; if (c.opt && c.opt.email) f.email.value = c.opt.email; } }
  if ((changed === 'start' || changed === 'dur') && f.start.value) f.end.value = fromMin(toMin(f.start.value) + (+f.duration.value || 30));
  if (cli) {
    const cn = f.clientId.value ? (clientDefs.find(x => x.id === f.clientId.value) || {}).name : f.clientName.value.trim();
    const auto = !f.title.value || f.title.dataset.auto === '1' || (f.title.dataset.auto !== '0' && ['client', 'service', 'type', 'prospect'].includes(changed));
    if (auto) { f.title.value = `${EV_SERVICES[f.service.value] || 'Cita'}${cn ? ' · ' + cn : ''}`; f.title.dataset.auto = '1'; }
  }
  evConflictNote(f);
}
function evConflictNote(f) {
  const box = f.querySelector('[data-ev-conflict]'); if (!box) return;
  const data = { date: f.date.value, start: f.allDay.checked ? '' : f.start.value, end: f.end.value, duration: f.duration.value, allDay: f.allDay.checked };
  const cs = evConflicts(data, f.dataset.id || null);
  box.hidden = !cs.length;
  box.innerHTML = cs.length ? `${svgI('warn', 15)}<span><b>Se cruza con ${cs.length === 1 ? 'otra cita' : cs.length + ' citas'}:</b> ${cs.map(c => esc(`${c.title} (${evTime(c)})`)).join(', ')}. <button type="button" class="lnk" data-ev-free="1">Buscar otro horario</button></span>` : '';
}
function evDelModal(id) {
  const e = events.find(x => x.id === id); if (!e) return;
  openModal(`<h2 id="modal-t">Eliminar "${esc(e.title)}"</h2><p class="muted">${esc(dayLongCap(e.date))} · ${esc(evTime(e))}. Esta acción queda en el registro de auditoría. Si solo cambió de fecha, mejor edítala o márcala como cancelada para conservar el historial.</p>
    <form data-form="ev-del" data-id="${esc(e.id)}" novalidate><p class="form-err" hidden></p><div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-danger">Eliminar</button></div></form>`);
}
// Ficha de una cita: estado, contacto y acciones rápidas (confirmar por WhatsApp, correo, llamar, enlace, calendario)
function evDetail(id) {
  const e = events.find(x => x.id === id); if (!e) return;
  const cn = evClientName(e), digits = waNumber(e.phone), st = evStatus(e);
  const link = /^https?:\/\//i.test(e.place || '') ? e.place : (e.link || '');
  const parts = (e.participants || []).map(partName).filter(Boolean);
  openModal(`<div class="evd" style="--ec:${evColor(e)}"><p class="evd-k"><i></i>${esc((EV_TYPES[e.type] || EV_TYPES.OTRO).label)}${st ? ` · <span class="sc ${EV_STATUS[st][1]} sc-xs">${EV_STATUS[st][0]}</span>` : ''}</p>
    <h2 id="modal-t">${esc(e.title)}</h2>
    <p class="evd-when">${svgI('clock', 15)} ${esc(dayLongCap(e.date))} · ${esc(evTime(e))}</p>
    ${cn ? `<p class="evd-row">${svgI('users', 15)} <b>${esc(cn)}</b>${e.phone ? ` · ${esc(e.phone)}` : ''}${e.email ? ` · ${esc(e.email)}` : ''}</p>` : ''}
    ${e.type === 'CLIENTE' ? `<p class="evd-row">${svgI('spark', 15)} ${esc(EV_SERVICES[e.service] || 'Cita')} · ${esc(EV_MODALITY[e.modality] || '')}${e.reminder ? ` · recordatorio ${esc(EV_REMIND[e.reminder] || '').toLowerCase()}` : ''}</p>` : ''}
    ${e.place ? `<p class="evd-row">${svgI('pin', 15)} ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(e.place)}</a>` : esc(e.place)}</p>` : ''}
    ${parts.length ? `<p class="evd-row">${svgI('users', 15)} ${esc(parts.join(', '))}</p>` : ''}
    ${e.ownerId ? `<p class="evd-row muted">Responsable: ${esc(ownerName(e.ownerId))}</p>` : ''}
    ${e.notes ? `<p class="evd-notes">${esc(e.notes)}</p>` : ''}
    <div class="evd-acts">
      ${digits ? `<button type="button" class="btn btn-ok" data-ev-wa="${esc(e.id)}">${svgI('chat', 15)} Confirmar por WhatsApp</button>` : ''}
      ${e.email ? `<button type="button" class="btn" data-ev-mail="${esc(e.id)}">${svgI('mail', 15)} Correo</button>` : ''}
      ${digits ? `<a class="btn" href="tel:+${digits}">${svgI('phone', 15)} Llamar</a>` : ''}
      ${link ? `<a class="btn" href="${esc(link)}" target="_blank" rel="noopener">${svgI('video', 15)} Abrir enlace</a>` : ''}
      <button type="button" class="btn" data-ev-ics="${esc(e.id)}">${svgI('download', 15)} Calendario</button>
    </div>
    ${e.type === 'CLIENTE' ? `<div class="evd-st" role="group" aria-label="Cambiar estado">${Object.entries(EV_STATUS).map(([k, v]) => `<button type="button" class="seg-b ${st === k ? 'is-on' : ''}" data-ev-status="${e.id}|${k}">${v[0]}</button>`).join('')}</div>` : ''}
    <div class="modal-acts"><button type="button" class="btn btn-danger mr-auto" data-ev-del="${esc(e.id)}">Eliminar</button>${e.type === 'CLIENTE' ? `<button type="button" class="btn" data-ev-follow="${esc(e.id)}">Agendar seguimiento</button>` : ''}<button type="button" class="btn btn-cta" data-ev-edit="${esc(e.id)}">Editar <span class="cta-dot">${I.arrow}</span></button></div></div>`);
}
// Número de WhatsApp en formato internacional (Venezuela por defecto): 0412-555-1234 → 584125551234
function waNumber(t) { let d = String(t || '').replace(/\D/g, ''); if (!d || d.length < 7) return ''; if (d.startsWith('00')) d = d.slice(2); if (d.startsWith('0') && d.length === 11) d = '58' + d.slice(1); else if (d.length === 10 && /^4/.test(d)) d = '58' + d; return d; }
function evMessage(e) {
  const cn = evClientName(e) || 'cliente'; const first = cn.split(/\s+/)[0];
  const lugar = e.place ? (/^https?:/i.test(e.place) ? ` Enlace: ${e.place}.` : ` Lugar: ${e.place}.`) : '';
  return String(agCfg.wa || '').replace(/\{nombre\}/g, first).replace(/\{servicio\}/g, (EV_SERVICES[e.service] || 'la cita').toLowerCase()).replace(/\{dia\}/g, dayLong(e.date)).replace(/\{hora\}/g, hhmm(e.start) || 'la hora acordada').replace(/\{modalidad\}/g, (EV_MODALITY[e.modality] || '').toLowerCase()).replace(/\{lugar\}/g, lugar);
}
function openExternal(url) { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 500); }
// Calendario estándar (.ics): se abre en Apple Calendario, Google Calendar u Outlook (con alarma si la cita tiene recordatorio)
function icsText(list) {
  const escI = t => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const fold = l => { const out = []; let x = l; while (x.length > 74) { out.push(x.slice(0, 74)); x = ' ' + x.slice(74); } out.push(x); return out.join('\r\n'); };
  const dt = (d, t) => d.replace(/-/g, '') + (t ? 'T' + t.replace(':', '') + '00' : '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Agora Digital App//Agenda//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Agora Digital App'];
  list.forEach(e => {
    const parts = (e.participants || []).map(partName).filter(Boolean); const cn = evClientName(e);
    L.push('BEGIN:VEVENT', `UID:${e.id}@agoradigital.app`, `DTSTAMP:${stamp}`);
    if (e.allDay || !e.start) { L.push(`DTSTART;VALUE=DATE:${dt(e.date)}`, `DTEND;VALUE=DATE:${dt(isoD(addDays(D(e.date), 1)))}`); }
    else { const endT = fromMin(Math.min(23 * 60 + 59, evEndMin(e))); L.push(`DTSTART:${dt(e.date, e.start)}`, `DTEND:${dt(e.date, endT)}`); }
    L.push(`SUMMARY:${escI(e.title)}`, `CATEGORIES:${escI((EV_TYPES[e.type] || EV_TYPES.OTRO).label)}`);
    if (e.type === 'CLIENTE') L.push(`STATUS:${e.status === 'CANCELADA' ? 'CANCELLED' : e.status === 'CONFIRMADA' || e.status === 'REALIZADA' ? 'CONFIRMED' : 'TENTATIVE'}`);
    if (e.place) L.push(`LOCATION:${escI(e.place)}`);
    if (/^https?:\/\//i.test(e.place || '')) L.push(`URL:${e.place}`);
    const desc = [evKind(e), cn ? 'Cliente: ' + cn + (e.phone ? ' · ' + e.phone : '') + (e.email ? ' · ' + e.email : '') : '', parts.length ? 'Participantes: ' + parts.join(', ') : '', e.notes || '', 'Agendado en Agora Digital App'].filter(Boolean).join('\n');
    L.push(`DESCRIPTION:${escI(desc)}`);
    if (+e.reminder > 0 && e.start && !e.allDay) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escI(e.title)}`, `TRIGGER:-PT${+e.reminder}M`, 'END:VALARM');
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}
function downloadIcs(list, name) {
  const blob = new Blob([icsText(list)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
// Historial de citas de un cliente (se muestra al editar el cliente)
function clientEventsHtml(cid) {
  const l = events.filter(e => e.clientId === cid).sort((a, b) => (b.date + (b.start || '')).localeCompare(a.date + (a.start || '')));
  return `<div class="hist"><h3>Citas · ${l.length}</h3>${l.length ? `<ol>${l.slice(0, 8).map(e => `<li><b>${fmtDate(e.date)}</b> ${esc(evTime(e))} · ${esc(EV_SERVICES[e.service] || e.title)} ${evStCell(e)}</li>`).join('')}</ol>` : '<p class="muted small">Todavía no tiene citas.</p>'}<button type="button" class="btn btn-sm btn-tint" data-ev-new="${esc(TODAY)}" data-ev-kind="CLIENTE" data-ev-client="${esc(cid)}">${svgI('plus', 13)} Agendar cita</button></div>`;
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-ev-open]'); if (!el || !document.getElementById('app') || document.getElementById('app').hidden) return;
  const inner = e.target.closest('button,a,input,select,label'); if (inner && inner !== el) return;
  e.preventDefault(); evDetail(el.dataset.evOpen);
});
/* ====================== RECIBOS DE PAGO ====================== */
function suggestedReceipt(tipo, who, period) {
  if (tipo === 'INVERSIONISTA') return Math.max(0, investorSummary(who).deuda);
  if (tipo === 'COMISION' || tipo === 'IMPLEMENTADOR') { const r = commissionRows(db, period || state.period).find(x => x.a.id === who); return r ? round2(r.total) : 0; }
  return '';
}
function receiptModal(pre = {}) {
  const tipo = pre.tipo || 'INVERSIONISTA'; const per = pre.period || state.period;
  const who = pre.investorId || pre.asesorId || '';
  const amount = pre.amount != null ? pre.amount : suggestedReceipt(tipo, who || (tipo === 'INVERSIONISTA' ? (investors[0] || {}).id : (asesores[0] || {}).id), per);
  openModal(`<h2 id="modal-t">Emitir recibo de pago</h2><p class="muted">El recibo usa el mismo formato de la factura de Ágora. El número de referencia, el monto y la fecha del pago son obligatorios.</p>
    <form data-form="receipt" novalidate><div class="fgrid">
      <label class="fld span2"><span>Tipo de pago *</span><select name="tipo" data-rcpt-tipo="1">${opts(RCPT_TIPOS, tipo)}</select></label>
      <label class="fld" data-for="INVERSIONISTA" ${tipo === 'INVERSIONISTA' ? '' : 'hidden'}><span>Inversionista *</span><select name="investorId" data-rcpt-who="1">${investors.map(v => `<option value="${esc(v.id)}" ${v.id === pre.investorId ? 'selected' : ''}>${esc(v.nombre + ' ' + v.apellido)} · debe ${money(investorSummary(v.id).deuda, 2)}</option>`).join('') || '<option value="">Sin inversionistas</option>'}</select></label>
      <label class="fld" data-for="COMISION IMPLEMENTADOR" ${tipo === 'COMISION' || tipo === 'IMPLEMENTADOR' ? '' : 'hidden'}><span>Persona *</span><select name="asesorId" data-rcpt-who="1">${asesores.map(a => `<option value="${esc(a.id)}" ${a.id === pre.asesorId ? 'selected' : ''}>${esc(a.nombre)}</option>`).join('') || '<option value="">Sin asesores</option>'}</select></label>
      <label class="fld" data-for="COMISION IMPLEMENTADOR" ${tipo === 'COMISION' || tipo === 'IMPLEMENTADOR' ? '' : 'hidden'}><span>Mes que se liquida</span><select name="period" data-rcpt-who="1">${UI_PERIODS.map(x => `<option value="${esc(x)}" ${x === per ? 'selected' : ''}>${periodLabel(x)}</option>`).join('')}</select></label>
      <label class="fld" data-for="PROVEEDOR" ${tipo === 'PROVEEDOR' ? '' : 'hidden'}><span>Proveedor *</span><input name="provName" maxlength="100" placeholder="Nombre o razón social"></label>
      <label class="fld" data-for="PROVEEDOR" ${tipo === 'PROVEEDOR' ? '' : 'hidden'}><span>RIF o cédula del proveedor</span><input name="provDoc" maxlength="20"></label>
      <label class="fld span2"><span>Concepto *</span><input name="concept" maxlength="140" value="${esc(pre.concept || '')}" placeholder="Ej. Devolución parcial del préstamo de marzo"></label>
      <label class="fld"><span>Monto pagado *</span><input name="amount" type="number" min="0" step="0.01" value="${esc(amount)}"></label>
      <label class="fld"><span>Moneda</span><select name="currency">${opts(CURRENCIES, 'USD')}</select></label>
      <label class="fld"><span>Fecha del pago *</span><input type="date" name="date" value="${esc(TODAY)}" max="${TODAY}"></label>
      <label class="fld"><span>Método</span><select name="method">${opts(PAY_METHODS_SEL, 'BINANCE')}</select></label>
      <label class="fld span2"><span>Número de referencia de la transferencia o pago *</span><input name="ref" maxlength="40" autocomplete="off" placeholder="Tal como aparece en el comprobante"></label>
      <label class="fld span2"><span>Nota (opcional)</span><input name="nota" maxlength="200"></label>
      <label class="fld span2 chk" data-for="PROVEEDOR" ${tipo === 'PROVEEDOR' ? '' : 'hidden'}><input type="checkbox" name="asExpense"> Registrar también como gasto del mes (no lo marques si el gasto ya está registrado)</label>
      <label class="fld" data-for="PROVEEDOR" ${tipo === 'PROVEEDOR' ? '' : 'hidden'}><span>Categoría del gasto</span><select name="category">${expCatOpts('otros')}</select></label>
    </div><p class="form-err" hidden></p>
    <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Emitir recibo <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}
function nextReceiptNum() { const n = Math.max(0, ...receipts.map(r => parseInt(String(r.num).replace(/\D/g, ''), 10) || 0)) + 1; return 'REC-' + String(n).padStart(6, '0'); }
let __factDom = null;
function factTemplate() { if (!__factDom) { __factHtml = __factHtml || factureroHtml(); __factDom = __factHtml; } return new DOMParser().parseFromString(__factDom, 'text/html'); }
/* ====================== MOTOR DE PDF PROPIO (sin librerías ni internet) ======================
   Dibuja el informe o el recibo en imágenes de alta resolución (HTML → SVG → canvas), corta las
   hojas sin partir filas ni tarjetas, y arma el archivo PDF a mano con membrete y pie en cada hoja.
   Se inyecta dentro del documento del informe o del recibo y devuelve un Blob listo para descargar. */
function agoraPdfEngine(cfg) {
  const MM = 72 / 25.4; // puntos PDF por milímetro
  const AVOID = '.panel,.micro-grid,.duo,tr,.micro,.rcard,.pn-h,svg,.gx-c,.hero,.aging,.ubar,.hb-row,.mix,li,.set-card,.rep-h,.rep-band,.cycle,.note,.pn-d,.rep-f,.bt-gh,.qn,.intro';
  const latin1 = s => String(s).normalize('NFC').replace(/[^\x0A\x0D\x20-\x7E -ÿ]/g, c => ({ '−': '-', '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...' }[c] || '?'));
  const pdfStr = s => '(' + latin1(s).replace(/([\\()])/g, '\\$1') + ')';
  function collectCss() {
    let css = '';
    for (const sh of Array.from(document.styleSheets)) {
      try { for (const r of Array.from(sh.cssRules)) { if (r.type === CSSRule.MEDIA_RULE && /print/.test(r.conditionText || r.media.mediaText)) continue; if (r.type === CSSRule.PAGE_RULE || r.type === CSSRule.FONT_FACE_RULE) continue; css += r.cssText + '\n'; } } catch (e) { /* hoja externa sin acceso: se omite */ }
    }
    return css.replace(/:root/g, '.pdf-root').replace(/(?<![\w.#-])html(?![\w-])/g, '.pdf-root').replace(/(?<![\w.#-])body(?![\w-])/g, '.pdf-body');
  }
  function breakPoints(el, pageH) {
    const top0 = el.getBoundingClientRect().top, total = el.scrollHeight;
    const boxes = Array.from(el.querySelectorAll(AVOID)).map(n => { const r = n.getBoundingClientRect(); return [r.top - top0, r.bottom - top0]; }).filter(b => b[1] - b[0] > 0 && b[1] - b[0] < pageH);
    const cuts = []; let y = 0;
    while (y < total - 1) {
      let cut = Math.min(y + pageH, total);
      if (cut < total) {
        const hit = boxes.filter(b => b[0] < cut && b[1] > cut && b[0] > y + 40);
        if (hit.length) cut = Math.min(...hit.map(b => b[0])) - 2;
      }
      cuts.push([y, cut]); y = cut;
    }
    return cuts;
  }
  function loadImg(svg) {
    return new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('No se pudo dibujar la hoja')); i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  }
  async function renderSlices(el, slices, W, scale) {
    const css = collectCss();
    const ser = new XMLSerializer();
    const style = document.createElement('style'); style.textContent = css;
    style.textContent += '\n.pdf-root.pdf-body{background:#fff!important;padding:0!important;margin:0!important;display:block!important;zoom:1!important}';
    const styleStr = ser.serializeToString(style);
    const clone = el.cloneNode(true); clone.style.margin = '0'; clone.style.boxShadow = 'none'; clone.style.zoom = ''; clone.style.transform = 'none';
    (cfg.remove ? clone.querySelectorAll(cfg.remove) : []).forEach(n => n.remove()); clone.querySelectorAll('[contenteditable]').forEach(n => n.removeAttribute('contenteditable')); clone.querySelectorAll('.pending').forEach(n => n.classList.remove('pending'));
    const cloneStr = ser.serializeToString(clone);
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    const out = [];
    for (const [y0, y1] of slices) {
      const h = Math.max(1, Math.ceil(y1 - y0));
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}"><foreignObject x="0" y="0" width="${W}" height="${h}"><div xmlns="http://www.w3.org/1999/xhtml" class="pdf-root pdf-body" data-theme="${theme}" style="width:${W}px;height:${h}px;overflow:hidden;background:#fff;margin:0;padding:0">${styleStr}<div style="transform:translateY(${-y0}px);width:${W}px">${cloneStr}</div></div></foreignObject></svg>`;
      const img = await loadImg(svg);
      const c = document.createElement('canvas'); c.width = Math.round(W * scale); c.height = Math.round(h * scale);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0, W, h);
      const data = c.toDataURL('image/jpeg', 0.93); // falla en navegadores que bloquean este dibujo (algunos Safari)
      const bin = atob(data.split(',')[1]); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      out.push({ bytes, w: c.width, h: c.height, cssH: h });
    }
    return out;
  }
  function buildPdf(pages, o) {
    const enc = new TextEncoder(); const parts = []; const offs = []; let len = 0;
    const push = x => { const b = typeof x === 'string' ? Uint8Array.from(latin1(x), ch => ch.charCodeAt(0)) : x; parts.push(b); len += b.length; };
    const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const N = pages.length; const kids = []; let next = 4;
    const plan = pages.map(() => { const p = { page: next, content: next + 1, img: next + 2 }; next += 3; kids.push(`${p.page} 0 R`); return p; });
    obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => push(`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${N} >>`));
    obj(3, () => push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
    const fontB = next++; obj(fontB, () => push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
    pages.forEach((pg, i) => {
      const p = plan[i]; const PW = o.pageW * MM, PH = o.pageH * MM;
      const iw = o.contentW * MM, ih = pg.cssH * o.mmPerPx * MM, ix = o.ml * MM, iy = PH - o.mt * MM - ih;
      let cs = `q ${iw.toFixed(2)} 0 0 ${ih.toFixed(2)} ${ix.toFixed(2)} ${iy.toFixed(2)} cm /Im0 Do Q\n`;
      if (o.chrome) {
        const bar = (x, w, r, g, b) => `${r} ${g} ${b} rg ${x.toFixed(2)} ${(PH - 2.6 * MM).toFixed(2)} ${w.toFixed(2)} ${(2.6 * MM).toFixed(2)} re f\n`;
        cs += bar(0, PW * 0.62, 0.678, 0.063, 0.235) + bar(PW * 0.62, PW * 0.24, 0.157, 0.18, 0.286) + bar(PW * 0.86, PW * 0.14, 0.98, 0.741, 0.294);
        const txt = (font, size, rgb, x, y, s, right) => { const w = right ? latin1(s).length * size * 0.5 : 0; return `BT /${font} ${size} Tf ${rgb} rg ${(x - w).toFixed(2)} ${y.toFixed(2)} Td ${pdfStr(s)} Tj ET\n`; };
        const y1 = PH - 9 * MM, y2 = 5 * MM;
        cs += txt('F2', 10, '0.678 0.063 0.235', 8 * MM, y1, 'Agora Digital App');
        cs += txt('F1', 8.5, '0.369 0.392 0.502', 8 * MM + 98, y1, 'Finanzas y Operaciones');
        cs += txt('F1', 8.5, '0.369 0.392 0.502', PW - 8 * MM, y1, o.label, true);
        cs += `0.863 0.867 0.89 RG 0.6 w ${(8 * MM).toFixed(2)} ${(PH - 11.2 * MM).toFixed(2)} m ${(PW - 8 * MM).toFixed(2)} ${(PH - 11.2 * MM).toFixed(2)} l S ${(8 * MM).toFixed(2)} ${(9.5 * MM).toFixed(2)} m ${(PW - 8 * MM).toFixed(2)} ${(9.5 * MM).toFixed(2)} l S\n`;
        cs += txt('F1', 8, '0.369 0.392 0.502', 8 * MM, y2, 'Agora Digital App  \xB7  agoradigital.app  \xB7  Cada conversaci\xF3n, una oportunidad.');
        cs += txt('F1', 8, '0.369 0.392 0.502', PW - 8 * MM, y2, `P\xE1gina ${i + 1} de ${N}`, true);
      }
      obj(p.page, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW.toFixed(2)} ${PH.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 ${fontB} 0 R >> /XObject << /Im0 ${p.img} 0 R >> >> /Contents ${p.content} 0 R >>`));
      obj(p.content, () => { const b = Uint8Array.from(latin1(cs), ch => ch.charCodeAt(0)); push(`<< /Length ${b.length} >>\nstream\n`); push(b); push('\nendstream'); });
      obj(p.img, () => { push(`<< /Type /XObject /Subtype /Image /Width ${pg.w} /Height ${pg.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.bytes.length} >>\nstream\n`); push(pg.bytes); push('\nendstream'); });
    });
    const xref = len; const total = next;
    let x = `xref\n0 ${total}\n0000000000 65535 f \n`; for (let n = 1; n < total; n++) x += String(offs[n] || 0).padStart(10, '0') + ' 00000 n \n';
    push(x + `trailer\n<< /Size ${total} /Root 1 0 R /Info << /Producer (Agora Digital App) /Title ${pdfStr(o.title)} >> >>\nstartxref\n${xref}\n%%EOF`);
    void enc; return new Blob(parts, { type: 'application/pdf' });
  }
  window.makePdf = async function (ov) {
    cfg = Object.assign({}, cfg, ov || {});
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
    const el = document.querySelector(cfg.sel); const W = Math.ceil(cfg.width || el.scrollWidth);
    const land = cfg.orient === 'landscape'; const pageW = land ? 297 : 210, pageH = land ? 210 : 297;
    const o = cfg.single ? { pageW, pageH, ml: 0, mt: 0, contentW: pageW, contentH: pageH, chrome: false } : { pageW, pageH, ml: 8, mt: 15, contentW: pageW - 16, contentH: pageH - 29, chrome: true };
    o.mmPerPx = o.contentW / W; o.label = cfg.label || ''; o.title = cfg.name;
    const pageHpx = Math.floor(o.contentH / o.mmPerPx);
    const slices = cfg.single ? [[0, Math.min(el.scrollHeight, pageHpx)]] : breakPoints(el, pageHpx);
    const pages = await renderSlices(el, slices, W, 2);
    return { blob: buildPdf(pages, o), name: cfg.name };
  };
}

// Inyecta el motor propio en el documento del informe o del recibo (no usa internet ni abre Imprimir).
const pdfScript = (sel, name, orient, single, label) => `<script${NONCE_ATTR()}>${agoraPdfEngine.toString()}\nagoraPdfEngine(${JSON.stringify({ sel, name, orient, single: !!single, label: label || '', width: single ? 794 : 0 })});<\/script>`;
function downloadBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }
function receiptHtml(r) {
  const dp = factTemplate();
  const styles = [...dp.querySelectorAll('style')].map(s => s.textContent).join('\n');
  const page = dp.getElementById('page'); page.querySelectorAll('#rowHl,#rowTools').forEach(x => x.remove());
  const doc = dp.getElementById('doc'); doc.removeAttribute('contenteditable'); doc.querySelectorAll('[contenteditable]').forEach(x => x.removeAttribute('contenteditable'));
  const $q = s => doc.querySelector(s); const set = (s, h) => { const el = $q(s); if (el) el.innerHTML = h; };
  const usd = usdOf(r.amount, r.currency, r.date); const amt = num(+r.amount, 2);
  set('.doc-title h1', 'Recibo de pago<span class="dot">.</span>');
  const sub = doc.querySelector('.brand .sub'); if (sub) sub.textContent = 'Agora Digital App';
  doc.insertAdjacentHTML('beforeend', `<div class="rc-foot"><b>Agora Digital App</b><span>agoradigital.app · Cada conversación, una oportunidad.</span><span>Recibo ${esc(r.num)} · página 1 de 1</span></div>`);
  set('.meta', `<dt>N° de recibo</dt><dd class="num">${esc(r.num)}</dd><dt>N° de referencia</dt><dd>${esc(r.ref)}</dd><dt>Fecha del pago</dt><dd>${fmtDmy(r.date)}</dd><dt>Método</dt><dd>${esc(PAY_METHODS[r.method] || '—')}</dd>`);
  const em = $q('.party.emisor h2'); if (em) em.textContent = 'Pagado por';
  set('.party.cliente', `<h2><span>Pagado a</span><span class="code">${esc(RCPT_TIPOS[r.tipo])}</span></h2><div class="name">${esc(r.beneficiary)}</div><dl><dt>Cédula / RIF</dt><dd>${esc(r.beneficiaryDoc || '—')}</dd><dt>Concepto</dt><dd>${esc(r.concept)}</dd>${r.period ? `<dt>Período</dt><dd>${periodLabel(r.period)}</dd>` : ''}<dt>Contacto</dt><dd>${esc(r.beneficiaryContact || '—')}</dd></dl>`);
  set('.conditions', `<div><span>Moneda</span><strong>${esc(CURRENCIES[r.currency] || r.currency)}</strong></div><div><span>Tipo de pago</span><strong>${esc(RCPT_TIPOS[r.tipo])}</strong></div><div><span>Estado</span><strong>${r.anulado ? 'ANULADO' : 'Pagado'}</strong></div><div><span>Emitido por</span><strong>${esc(r.user || '')}</strong></div>`);
  const th = doc.querySelectorAll('.items thead th'); if (th.length >= 4) { th[2].textContent = `Monto (${r.currency})`; th[3].textContent = `Total (${r.currency})`; }
  set('#items', `<tr><td class="qty">1</td><td><span class="title">${esc(r.concept)}</span><span class="desc">${esc(r.nota || (r.tipo === 'INVERSIONISTA' ? 'Devolución de dinero aportado a la empresa.' : RCPT_TIPOS[r.tipo]))}</span></td><td class="r price">${amt}</td><td class="r line">${amt}</td></tr>`);
  doc.querySelectorAll('.summary .pay').forEach(x => x.remove());
  set('.totals', `<div class="row"><span>Monto pagado</span><strong>${amt}</strong></div>${r.currency !== 'USD' ? `<div class="row"><span>Equivalente en US$</span><strong>${num(usd, 2)}</strong></div>` : ''}<div class="grand"><span>Total pagado ${esc(r.currency)}</span><strong>${amt}</strong></div>`);
  const terms = $q('.terms'); if (terms) terms.innerHTML = `<h3>Constancia de pago</h3><ol><li>Se deja constancia de que se pagó a <b>${esc(r.beneficiary)}</b> la cantidad de <b>${amt} ${esc(r.currency)}</b> por concepto de ${esc(r.concept)}.</li><li>El pago se hizo el ${fmtDmy(r.date)} por ${esc(PAY_METHODS[r.method] || 'el método indicado')}, con número de referencia <b>${esc(r.ref)}</b>.</li>${r.tipo === 'INVERSIONISTA' ? `<li>Saldo pendiente con el inversionista luego de este pago: <b>US$ ${num(Math.max(0, r.balanceAfter || 0), 2)}</b>.</li>` : ''}<li>Este recibo fue emitido desde Agora Digital App y queda en el registro de auditoría.</li></ol>`;
  if (r.anulado) doc.insertAdjacentHTML('afterbegin', '<div style="position:absolute;top:42%;left:0;right:0;text-align:center;font-size:96px;font-weight:800;color:rgba(217,72,15,.18);transform:rotate(-18deg);z-index:9;pointer-events:none">ANULADO</div>');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Recibo ${esc(r.num)}</title><style>${styles}</style>
    <style>html,body{background:#E9EAEF!important}body{display:block!important;margin:0;padding:24px 0}.workspace{display:flex;justify-content:center;padding:0!important;margin:0!important}#page{margin:0 auto!important}aside,.panel,.status,.savebar{display:none!important}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{html,body{background:#fff!important;padding:0}}#doc{position:relative}.rc-foot{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:space-between;gap:12px;align-items:center;padding:9px 56px;background:#282E49;color:#C3C7D9;font-size:10.5px;font-family:inherit}.rc-foot b{color:#FABD4B;font-size:11.5px}</style>
    </head><body><main class="workspace" id="workspace">${page.outerHTML}</main>${pdfScript('#page', `Recibo_${r.num}_${r.beneficiary.replace(/[^\wÁÉÍÓÚÑáéíóúñ]+/g, '_').slice(0, 30)}.pdf`, 'portrait', true, '')}</body></html>`;
}
const fmtDmy = s => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
function showReceipt(id) { const r = receipts.find(x => x.id === id); if (!r) return; openViewer({ title: `Recibo ${r.num}`, html: receiptHtml(r), xls: null }); }

/* ====================== VISOR (informes y recibos) ====================== */
function openViewer(cfg) {
  let v = document.getElementById('viewer');
  if (!v) { v = document.createElement('div'); v.id = 'viewer'; v.className = 'viewer'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-modal', 'true'); document.body.appendChild(v); }
  v.innerHTML = `<div class="vw-bar"><b class="vw-t">${esc(cfg.title)}</b><span class="acts"><button class="btn btn-sm btn-cta" data-vw="pdf">Descargar PDF a color <span class="cta-dot">${I.arrow}</span></button>${cfg.xls ? '<button class="btn btn-sm" data-vw="xls">Descargar Excel</button>' : ''}<button class="btn btn-sm" data-vw="print">Imprimir</button><button class="icon-btn" data-vw="close" aria-label="Cerrar">${I.close}</button></span></div><iframe class="vw-f" title="${esc(cfg.title)}"></iframe>`;
  v.hidden = false; v._cfg = cfg; v.querySelector('iframe').srcdoc = cfg.html; v.querySelector('[data-vw="pdf"]').focus();
}
function viewerAction(a, btn) {
  const v = document.getElementById('viewer'); if (!v) return; const w = v.querySelector('iframe').contentWindow;
  if (a === 'close') { v.hidden = true; v.innerHTML = ''; return; }
  if (a === 'print') { w.focus(); w.print(); return; }
  if (a === 'xls' && v._cfg.xls) { v._cfg.xls(); return; }
  if (a === 'pdf') {
    btn.disabled = true; const old = btn.innerHTML; btn.textContent = 'Generando PDF…';
    Promise.resolve().then(() => w.makePdf()).then(r => { downloadBlob(r.blob, r.name); toast(`PDF a color descargado: ${r.name}`); if (v._cfg.onPdf) v._cfg.onPdf(); })
      .catch(err => { console.error(err); toast('Este navegador no permitió armar el PDF. Usa Chrome, Edge o Firefox actualizados (o el botón Imprimir).'); })
      .finally(() => { btn.disabled = false; btn.innerHTML = old; });
  }
}

/* ====================== INFORMES DESCARGABLES POR MÓDULO ====================== */
function reportClone(modId) {
  // Los gráficos del informe siempre van con las proporciones de escritorio, aunque se descargue desde el celular
  const redo = !CHART_DESKTOP && chartBucket() < 4 && modId !== 'facturero' && !!document.querySelector('#content svg.chart');
  if (redo) { CHART_DESKTOP = true; render(); }
  const src = document.getElementById('content');
  const main = src.cloneNode(true);
  if (redo) { CHART_DESKTOP = false; render(); }
  if (modId === 'facturero') {
    const body = main.querySelector('.fact-frame'); const list = importedInv.slice().sort((a, b) => b.issueDate.localeCompare(a.issueDate));
    const tb = board({ cols: [{ label: 'N°' }, { label: 'Cliente' }, { label: 'Emisión' }, { label: 'Vence' }, { label: 'Subtotal', cls: 'r' }, { label: 'IVA', cls: 'r' }, { label: 'Total', cls: 'r' }, { label: 'Pago' }],
      groups: [{ rows: list.map(f => ({ cells: [esc(f.num), esc((clientDefs.find(c => c.id === f.clientId) || { name: '—' }).name), fmtDate(f.issueDate), fmtDate(f.dueDate), money(f.subtotal, 2), money(f.iva, 2), money(f.subtotal + f.iva, 2), payments[f.id] ? `Pagada ${fmtDate(payments[f.id])}${payRefs[f.id] ? ' · ref. ' + esc(payRefs[f.id].ref) : ''}` : 'Por cobrar'] })) }] });
    if (body) { const d = document.createElement('div'); d.innerHTML = tb; body.replaceWith(d); }
  }
  main.querySelectorAll('.ath-ins, .mod-x, .toolbar, form.qadd, form.aform, .bulkbar, .lock-note, .fact-frame, .acts, .modal, .mx-add, .cli-chk, iframe, script, .dl-menu, .np-wrap, .clp:not(.is-open)').forEach(x => x.remove());
  main.classList.remove('view-enter');
  main.querySelectorAll('[data-final]').forEach(x => { x.textContent = x.dataset.final; x.removeAttribute('data-final'); }); // cifras animadas: valor final
  main.querySelectorAll('.seg-thumb').forEach(x => x.remove()); main.querySelectorAll('.rv').forEach(x => x.classList.remove('rv', 'in'));
  main.querySelectorAll('a.btn, button.btn, button.icon-btn, .seg-b, .mx-addb').forEach(x => x.remove());
  main.querySelectorAll('button').forEach(b => { const d = document.createElement('div'); d.className = b.className; d.innerHTML = b.innerHTML; b.replaceWith(d); });
  main.querySelectorAll('select').forEach(sel => { const sp = document.createElement('span'); sp.className = sel.className; sp.textContent = (sel.options[sel.selectedIndex] || {}).text || ''; sel.replaceWith(sp); });
  main.querySelectorAll('input, textarea').forEach(i => { if (i.type === 'checkbox' || i.type === 'radio' || i.type === 'hidden') { i.remove(); return; } const sp = document.createElement('span'); sp.textContent = i.value; i.replaceWith(sp); });
  main.querySelectorAll('linearGradient[id]').forEach(g => { const nid = 'r' + g.id; main.querySelectorAll(`[fill="url(#${g.id})"]`).forEach(x => x.setAttribute('fill', `url(#${nid})`)); g.id = nid; g.setAttribute('data-keep', '1'); }); // degradados de los gráficos
  main.querySelectorAll('[id]:not([data-keep])').forEach(x => x.removeAttribute('id'));
  return main;
}
// Estilos de los informes: hoja A4 horizontal (281 mm útiles = 1062 px) aprovechada de borde a borde.
// Estilos de los informes: los de la app + assets/css/informes.css (en la versión de un solo archivo
// van incrustados en <script type="text/plain" id="report-css">). La etiqueta de la hoja va aparte.
function reportStyleTags(label) {
  const inl = [...document.querySelectorAll('head style')].map(x => x.textContent).join('\n');
  const links = [...document.querySelectorAll('link[rel="stylesheet"]')].map(l => `<link rel="stylesheet" href="${esc(l.href)}">`).join('');
  const rc = document.getElementById('report-css');
  const rep = rc ? `<style>${rc.textContent}</style>` : `<link rel="stylesheet" href="${esc(new URL('assets/css/informes.css', location.href).href)}">`;
  return `${links}${inl ? `<style>${inl}</style>` : ''}${rep}<style>@page{@top-right{content:"${String(label).replace(/["\\]/g, '')}";font:9pt sans-serif;color:#5E6480}}</style>`;
}
function reportHtml(mod, main) {
  const stamp = new Date().toLocaleString('es-VE', { dateStyle: 'long', timeStyle: 'short' });
  return `<!doctype html><html lang="es" data-theme="light"><head><meta charset="utf-8"><title>Informe ${esc(mod.name)} · Agora Digital App</title>${reportStyleTags(`Informe de ${mod.name} · ${periodLabel(state.period)}`)}</head><body><div id="rep">
    <header class="rep-h"><div class="lg">${LOGO_H('', '#AD103C', '#282E49')}<div><b>AGORA DIGITAL APP · FINANZAS Y OPERACIONES</b><h1>Informe de ${esc(mod.name)}</h1></div></div>
    <div class="rep-m"><b>${esc(periodLabel(state.period))}</b>Generado el ${esc(stamp)}<br>por ${esc(auditUser())}</div></header><div class="rep-band"></div>
    <div id="content">${main.innerHTML}</div>
    <footer class="rep-f"><b>Agora Digital App</b><span>agoradigital.app · Cada conversación, una oportunidad.</span><span>${esc(mod.desc)}</span></footer>
  </div>${pdfScript('#rep', `Informe_${mod.name.replace(/[^\wÁÉÍÓÚÑáéíóúñ]+/g, '_')}_${state.period}.pdf`, 'landscape', false, `Informe de ${mod.name} · ${periodLabel(state.period)}`)}</body></html>`;
}
function cellText(el) {
  const c = el.cloneNode(true); c.querySelectorAll('br').forEach(b => b.replaceWith(' · ')); c.querySelectorAll('small').forEach(s => s.prepend(' · '));
  return c.textContent.replace(/\s+/g, ' ').replace(/^ · /, '').trim();
}
function reportXls(mod, main) {
  const H = 'background:#282E49;color:#FFFFFF;font-weight:bold;border:1px solid #1E2338;padding:6px';
  const T = 'background:#AD103C;color:#FFFFFF;font-weight:bold;font-size:13pt;padding:6px';
  let out = `<tr><td colspan="8" style="background:#AD103C;color:#fff;font-size:16pt;font-weight:bold;padding:10px">Agora Digital App · Informe de ${esc(mod.name)}</td></tr><tr><td colspan="8" style="color:#5E6480">${esc(periodLabel(state.period))} · generado el ${esc(new Date().toLocaleString('es-VE'))} por ${esc(auditUser())}</td></tr><tr><td></td></tr>`;
  const micros = [...main.querySelectorAll('.micro')];
  if (micros.length) { out += `<tr><td colspan="3" style="${T}">Indicadores</td></tr>`; micros.forEach((m, i) => { const t = m.querySelector('h3'), v = m.querySelector('.mm-v'), f = m.querySelector('.mm-foot'); out += `<tr><td style="background:${i % 2 ? '#F6F6F8' : '#FFFFFF'};border:1px solid #DCDDE3;font-weight:bold">${esc(t ? cellText(t) : '')}</td><td style="background:#FFF3D6;border:1px solid #DCDDE3;font-weight:bold;color:#282E49">${esc(v ? cellText(v) : '')}</td><td style="border:1px solid #DCDDE3;color:#5E6480">${esc(f ? cellText(f) : '')}</td></tr>`; }); out += '<tr><td></td></tr>'; }
  main.querySelectorAll('table').forEach(tb => {
    const p = tb.closest('.panel'); const title = p && p.querySelector('h2') ? cellText(p.querySelector('h2')) : 'Tabla';
    const ncol = Math.max(...[...tb.rows].map(r => r.cells.length), 1);
    out += `<tr><td colspan="${ncol}" style="${T}">${esc(title)}</td></tr>`;
    [...tb.rows].forEach((r, ri) => {
      const isHead = r.parentElement.tagName === 'THEAD', isFoot = r.parentElement.tagName === 'TFOOT', isGroup = r.classList.contains('bt-gh') || r.classList.contains('grp') || r.classList.contains('seg-h');
      const bg = isHead ? '' : isFoot ? 'background:#FFF3D6;font-weight:bold;' : isGroup ? 'background:#E7E8EE;font-weight:bold;' : (ri % 2 ? 'background:#F6F6F8;' : 'background:#FFFFFF;');
      out += '<tr>' + [...r.cells].map(c => `<td colspan="${c.colSpan || 1}" style="${isHead ? H : bg + 'border:1px solid #DCDDE3;padding:5px;' + (/\br\b|num/.test(c.className) ? 'text-align:right;' : '')}">${esc(cellText(c))}</td>`).join('') + '</tr>';
    });
    out += '<tr><td></td></tr>';
  });
  out += `<tr><td></td></tr><tr><td colspan="8" style="background:#282E49;color:#FABD4B;font-weight:bold;padding:8px">Agora Digital App · agoradigital.app · Cada conversación, una oportunidad.</td></tr>`;
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${esc(mod.name.slice(0, 30))}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body><table style="font-family:Calibri,Arial;font-size:11pt;border-collapse:collapse">${out}</table></body></html>`;
  const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Informe_${mod.name.replace(/[^\wÁÉÍÓÚÑáéíóúñ]+/g, '_')}_${state.period}.xls`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  logAudit(`descargó el informe de ${mod.name} en Excel (${periodLabel(state.period)})`, mod.id);
}
function openReport() {
  const mod = modOf(state.module); const main = reportClone(mod.id);
  logAudit(`abrió el informe de ${mod.name} (${periodLabel(state.period)})`, mod.id);
  openViewer({ title: `Informe de ${mod.name} · ${periodLabel(state.period)}`, html: reportHtml(mod, main), xls: () => reportXls(mod, main), onPdf: () => logAudit(`descargó el informe de ${mod.name} en PDF (${periodLabel(state.period)})`, mod.id) });
}

/* ====================== RESPALDO COMPLETO ====================== */
const BACKUP_KEY = k => k.startsWith('agora_fin_') || k.startsWith('agora-');
// v10.1: las credenciales (acceso, clave de edición, sesión e intentos) no viajan en el respaldo ni se pisan al restaurar:
// quien restaura ya está dentro con su propia clave. Así un respaldo viejo no te deja fuera de tu propio equipo.
const CRED_KEYS = new Set(['agora_fin_sess', 'agora_fin_acc_v1', 'agora_fin_key_hash', 'agora_fin_key_kdf_v1', 'agora_fin_login_tries']);
const BACKUP_DATA_KEY = k => BACKUP_KEY(k) && !CRED_KEYS.has(k);
const SAFE_MOD = /^[a-z0-9_-]{1,40}$/;
function backupDownload() {
  const data = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (BACKUP_DATA_KEY(k)) data[k] = localStorage.getItem(k); }
  const blob = new Blob([JSON.stringify({ app: 'agora-digital-app', version: 10.1, format: 2, createdAt: new Date().toISOString(), data }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `agora-digital-app-respaldo-${TODAY}.json`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  logAudit('descargó un respaldo completo del tablero', 'ajustes'); toast('Respaldo descargado');
}
// Revisa el archivo antes de tocar nada: formato, datos legibles y módulos de la auditoría con forma de identificador
function validateBackup(j) {
  if (!j || j.app !== 'agora-digital-app' || !j.data || typeof j.data !== 'object' || Array.isArray(j.data)) return 'Ese archivo no es un respaldo de Agora Digital App.';
  const entries = Object.entries(j.data).filter(([k]) => BACKUP_DATA_KEY(k));
  if (!entries.length) return 'El respaldo no trae datos para restaurar.';
  for (const [k, v] of entries) {
    if (typeof v !== 'string') return `El dato "${k}" no tiene el formato esperado.`;
    if (k.startsWith('agora_fin_')) { try { JSON.parse(v); } catch (e) { return `El dato "${k}" está dañado (no se puede leer).`; } }
  }
  return null;
}
function sanitizeAudit(raw) {
  try { const list = JSON.parse(raw); if (!Array.isArray(list)) return '[]'; return JSON.stringify(list.filter(a => a && typeof a === 'object').map(a => ({ ...a, module: SAFE_MOD.test(String(a.module || '')) ? a.module : 'sistema' }))); } catch (e) { return '[]'; }
}
// Escribe todo o nada: si el navegador se queda sin espacio a mitad de camino, vuelve exactamente a como estaba
function restoreBackup(j) {
  const incoming = Object.entries(j.data).filter(([k, v]) => BACKUP_DATA_KEY(k) && typeof v === 'string');
  const snapshot = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (BACKUP_DATA_KEY(k)) snapshot.push([k, localStorage.getItem(k)]); }
  try {
    snapshot.forEach(([k]) => localStorage.removeItem(k));
    incoming.forEach(([k, v]) => localStorage.setItem(k, k === 'agora_fin_audit' ? sanitizeAudit(v) : v));
    return null;
  } catch (e) {
    incoming.forEach(([k]) => { try { localStorage.removeItem(k); } catch (x) {} });
    snapshot.forEach(([k, v]) => { try { localStorage.setItem(k, v); } catch (x) {} });
    const full = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
    return full ? 'No hay espacio suficiente en este navegador para ese respaldo. No se cambió nada.' : 'No se pudo restaurar el respaldo. No se cambió nada.';
  }
}
document.addEventListener('change', e => {
  if (e.target.id !== 'backupFileIn') return; const f = e.target.files[0]; if (!f) return; const err = e.target.closest('.modal-body').querySelector('.form-err');
  const show = m => { err.textContent = m; err.hidden = false; };
  if (f.size > 40 * 1024 * 1024) return show('El archivo es demasiado grande para ser un respaldo de esta app.');
  f.text().then(t => {
    let j; try { j = JSON.parse(t); } catch (x) { j = null; }
    const bad = validateBackup(j); if (bad) return show(bad);
    const who = auditUser();
    const fail = restoreBackup(j); if (fail) return show(fail);
    state.audit = store.get('audit', []); logAudit(`restauró un respaldo completo del ${fmtDate(String(j.createdAt || '').slice(0, 10))} (${who})`, 'ajustes');
    toast('Respaldo restaurado. Recargando…'); setTimeout(() => location.reload(), 900);
  }).catch(() => show('No se pudo leer el archivo.'));
});

/* ====================== EVENTOS DE LOS MÓDULOS NUEVOS ====================== */
function toggleFor(form, sel, val) { form.querySelectorAll('[data-for]').forEach(el => { el.hidden = !el.dataset.for.split(' ').includes(val); }); }
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.vw) return viewerAction(t.dataset.vw, t);
  if (needsKey(t) && !isUnlocked() && !t.closest('#modal')) return; // el manejador principal ya pidió la clave
  const d = t.dataset;
  if (d.act === 'report') return openReport();
  if (d.act === 'backup-dl') return SRV ? SRV.exportData() : backupDownload();
  if (d.act === 'backup-up' && SRV) return SRV.importModal();
  if (d.act === 'backup-up') return openModal(`<h2 id="modal-t">Restaurar respaldo completo</h2><p class="muted">Reemplaza TODOS los datos de este navegador por los del archivo. Antes descarga un respaldo de lo actual si lo quieres conservar.</p><label class="fld"><span>Archivo agora-digital-app-respaldo-….json</span><input type="file" id="backupFileIn" accept=".json,application/json"></label><p class="form-err" hidden></p><div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button></div>`);
  if (d.recEdit) return recModal(d.recEdit);
  if (d.recToggle) { const r = recExp.find(x => x.id === d.recToggle); r.active = !r.active; saveNew(); if (r.active) runRecurring(); logAudit(`${r.active ? 'reanudó' : 'pausó'} el gasto recurrente "${r.concept}"`, 'gastos'); toast(r.active ? 'Gasto recurrente reanudado' : 'Gasto recurrente pausado'); render(); return; }
  if (d.recDel) { const r = recExp.find(x => x.id === d.recDel); recExp = recExp.filter(x => x.id !== r.id); saveNew(); logAudit(`eliminó la plantilla del gasto recurrente "${r.concept}" (lo ya registrado se conserva)`, 'gastos'); closeModal(); toast('Plantilla eliminada. Los gastos ya registrados se conservan.'); render(); return; }
  if (d.unpay) { const inv = db.invoices.find(i => i.id === d.unpay); const pr = payRefs[inv.id]; const n = invPagos(inv.id).length; pagos = pagos.filter(x => x.invId !== inv.id); savePagos(); delete payments[inv.id]; delete payRefs[inv.id]; saveNew(); saveDecisions(); logAudit(`revirtió el pago de la factura ${inv.num || inv.id}${pr ? ' (ref. ' + pr.ref + ')' : ''}${n > 1 ? ` y sus ${n} pagos registrados` : ''}`, 'facturacion'); toast('Pago revertido: la factura vuelve a estar por cobrar'); render(); return; }
  if (d.pagoDel) { const pg = pagos.find(x => x.id === d.pagoDel); if (!pg) return; if (!isUnlocked()) { closeModal(); return keyModal(null); } const inv = db.invoices.find(i => i.id === pg.invId); pagos = pagos.filter(x => x.id !== pg.id); savePagos(); if (payments[pg.invId] && invPagos(pg.invId).length === 0 && payRefs[pg.invId] && payRefs[pg.invId].v10) { delete payments[pg.invId]; delete payRefs[pg.invId]; } else if (payments[pg.invId] && inv && invPaidUsd(pg.invId) < invTotal(inv) - 0.05) { delete payments[pg.invId]; delete payRefs[pg.invId]; } saveNew(); saveDecisions(); logAudit(`eliminó un pago de ${money(+pg.usd, 2)} (ref. ${pg.ref}) de la factura ${inv ? inv.num || inv.id : pg.invId}`, 'facturacion'); toast('Pago eliminado'); closeModal(); render(); if (inv) setTimeout(() => payModal(inv.id), 220); return; }
  if (d.refGen) { const f = t.closest('form'); if (f && f.ref) { const n = pagos.filter(x => x.method === 'CASH' && x.date === TODAY).length + 1; f.ref.value = `EF-${TODAY.replace(/-/g, '')}-${String(n).padStart(3, '0')}`; } return; }
  if (d.act === 'sel-clear') { state.selCli.clear(); render(); return; }
  if (d.act === 'bulk-delete') return bulkDeleteModal();
  if (d.act === 'new-investor') return investorModal(null);
  if (d.invstEdit) return investorModal(d.invstEdit);
  if (d.invstDel) { const v = investors.find(x => x.id === d.invstDel); investors = investors.filter(x => x.id !== v.id); saveNew(); logAudit(`eliminó al inversionista ${v.nombre} ${v.apellido}`, 'inversionistas'); closeModal(); toast('Inversionista eliminado'); render(); return; }
  if (d.act === 'new-aporte') return aporteModal(null);
  if (d.invstAporte) return aporteModal(d.invstAporte);
  if (d.invstLedger) return ledgerModal(d.invstLedger);
  if (d.invstPay) return receiptModal({ tipo: 'INVERSIONISTA', investorId: d.invstPay, concept: 'Devolución de aportes a la empresa' });
  if (d.aporteDel) { const a = aportes.find(x => x.id === d.aporteDel); aportes = aportes.filter(x => x.id !== a.id); saveNew(); logAudit(`eliminó el aporte "${a.concept}" de ${investorName(a.investorId)}`, 'inversionistas'); toast('Aporte eliminado'); render(); return; }
  if (d.payerUntil) return payerUntilModal(d.payerUntil);
  if (d.act === 'new-receipt') return receiptModal({});
  if (d.rcptView) return showReceipt(d.rcptView);
  if (d.rcptVoid) { const r = receipts.find(x => x.id === d.rcptVoid); openModal(`<h2 id="modal-t">Anular recibo ${esc(r.num)}</h2><p class="muted">El recibo queda en el historial marcado como anulado y deja de contar como pago.</p><form data-form="rcpt-void" data-id="${esc(r.id)}" novalidate><label class="fld"><span>Motivo *</span><input name="motivo" maxlength="140"></label><p class="form-err" hidden></p><div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-danger">Anular recibo</button></div></form>`); return; }
  if (d.audMore) { state.audLim = (state.audLim || 200) + 200; render(); return; }
  if (d.cajaF) { state.cajaF = state.cajaF || { kind: 'all', q: '' }; state.cajaF.kind = d.cajaF; render(); return; }
  // Agenda
  if (d.agDay) { const nd = d.agDay; state.agDay = nd; if (nd.slice(0, 7) !== state.agMonth) { state.agDir = nd.slice(0, 7) > state.agMonth ? 'r' : 'l'; state.agMonth = nd.slice(0, 7); } render(); const c = document.querySelector(`[data-ag-day="${nd}"]`); if (c) c.focus({ preventScroll: true }); return; }
  if (d.agNav !== undefined) return agStep(+d.agNav);
  if (d.agView) return agSetView(d.agView);
  if (d.agPick) { state.agDay = d.agPick; state.agMonth = d.agPick.slice(0, 7); return agSetView('day') || render(); }
  if (d.evNew !== undefined) return eventModal(null, d.evNew || state.agDay || TODAY, { type: d.evKind || 'CLIENTE', clientId: d.evClient || '' });
  if (d.evEdit) return eventModal(d.evEdit);
  if (d.evWa) { const ev = events.find(x => x.id === d.evWa); if (!ev) return; const n = waNumber(ev.phone); if (!n) return toast('Esta cita no tiene un número de WhatsApp. Agrégalo en Editar.'); openExternal(`https://wa.me/${n}?text=${encodeURIComponent(evMessage(ev))}`); ev.confirmSentAt = new Date().toISOString(); saveEvents(); logAudit(`envió la confirmación por WhatsApp de "${ev.title}" (${fmtDate(ev.date)} ${hhmm(ev.start)})`, 'agenda'); toast('Se abrió WhatsApp con el mensaje listo para enviar'); return; }
  if (d.evMail) { const ev = events.find(x => x.id === d.evMail); if (!ev || !ev.email) return; openExternal(`mailto:${encodeURIComponent(ev.email)}?subject=${encodeURIComponent('Confirmación de tu cita · ' + ev.title)}&body=${encodeURIComponent(evMessage(ev) + '\n\nAgora Digital · agoradigital.app')}`); logAudit(`preparó un correo de confirmación de "${ev.title}"`, 'agenda'); return; }
  if (d.evStatus) { const [eid, stv] = d.evStatus.split('|'); const ev = events.find(x => x.id === eid); if (!ev || !EV_STATUS[stv]) return; const before = ev.status || 'PROGRAMADA'; if (before === stv) return; ev.status = stv; ev.updatedAt = new Date().toISOString(); saveEvents(); logAudit(`cambió la cita "${ev.title}" de ${EV_STATUS[before][0].toLowerCase()} a ${EV_STATUS[stv][0].toLowerCase()}`, 'agenda'); toast(`Cita marcada como ${EV_STATUS[stv][0].toLowerCase()}`); render(); evDetail(eid); return; }
  if (d.evFollow) { const ev = events.find(x => x.id === d.evFollow); if (!ev) return; const fs = nextFreeSlot(isoD(addDays(D(ev.date), 7)), ev.start, ev.duration || agCfg.dur); return eventModal(null, fs ? fs.date : isoD(addDays(D(ev.date), 7)), { type: 'CLIENTE', clientId: ev.clientId || '', clientName: ev.clientName || '', service: 'SEGUIMIENTO', start: fs ? fs.start : ev.start, duration: ev.duration }); }
  if (d.evFree) { const f = t.closest('form'); if (!f) return; const fs = nextFreeSlot(f.date.value || TODAY, f.start.value, f.duration.value, f.dataset.id || null); if (!fs) return toast('No encontré un horario libre en los próximos 45 días con tu horario de atención.'); f.date.value = fs.date; f.start.value = fs.start; f.end.value = fs.end; evFormSync(f); toast(`Horario libre: ${dayLong(fs.date)} a las ${hhmm(fs.start)}`); return; }
  if (d.evDel) return evDelModal(d.evDel);
  if (d.evIcs) { const e = events.find(x => x.id === d.evIcs); if (e) { downloadIcs([e], `Agora_${e.title.replace(/[^\wÁÉÍÓÚÑáéíóúñ]+/g, '_').slice(0, 40)}_${e.date}.ics`); logAudit(`descargó "${e.title}" para su calendario`, 'agenda'); toast('Listo: ábrelo para agregarlo a tu calendario'); } return; }
  if (d.act === 'ev-ics-all') { const from = isoD(addDays(D(TODAY), -30)); const list = events.filter(e => e.date >= from).sort((a, b) => a.date.localeCompare(b.date)); if (!list.length) { toast('No hay citas ni reuniones para exportar'); return; } downloadIcs(list, `Agora_Agenda_${TODAY}.ics`); logAudit(`exportó ${list.length} cita(s) y reunión(es) en formato de calendario`, 'agenda'); toast(`${list.length} evento(s) exportados. Abre el archivo para pasarlos a tu calendario.`); return; }
  // Utilidades: socios y porcentajes
  if (d.act === 'new-socio') return socioModal(null);
  if (d.socEdit) return socioModal(d.socEdit);
  if (d.socDel) return socDelModal(d.socDel);
  if (d.act === 'soc-pcts') return pctsModal(false);
  if (d.act === 'soc-split') return pctsModal(true);
  if (d.act === 'soc-eq-fill') { const f = t.closest('form'); const ins = [...f.querySelectorAll('[data-soc-pct]')]; const eq = equalSplit(ins.length); ins.forEach((i, j) => { i.value = bpTxt(eq[j]); }); updateSocTotals(f); return; }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.selcli) { el.checked ? state.selCli.add(el.dataset.selcli) : state.selCli.delete(el.dataset.selcli); render(); return; }
  if (el.dataset.selall) { const q = normTxt(state.baseQ || ''); clientDefs.filter(c => !q || normTxt(c.name).includes(q)).forEach(c => el.checked ? state.selCli.add(c.id) : state.selCli.delete(c.id)); render(); return; }
  if (el.dataset.aporteTipo) { toggleFor(el.form, '[data-for]', el.value); return; }
  if (el.dataset.agF) { agF()[el.dataset.agF] = el.checked; render(); return; }
  if (el.dataset.evType) { const f = el.form, k = el.value === 'SOCIOS' ? 's' : el.value === 'INVERSIONISTAS' ? 'i' : null; if (k) { const boxes = [...f.querySelectorAll('input[name=pt]')]; if (!boxes.some(b => b.checked)) boxes.filter(b => b.value.startsWith(k + ':')).forEach(b => { b.checked = true; }); } evFormSync(f, 'type'); return; }
  if (el.dataset.evAllday) { el.form.querySelectorAll('[data-ev-time]').forEach(x => { x.hidden = el.checked; }); evConflictNote(el.form); return; }
  if (el.dataset.evClient) { evFormSync(el.form, 'client'); return; }
  if (el.dataset.evService) { evFormSync(el.form, 'service'); return; }
  if (el.dataset.evDur) { evFormSync(el.form, 'dur'); return; }
  if (el.form && el.form.dataset.form === 'event' && (el.name === 'date' || el.name === 'end' || el.name === 'start')) { evFormSync(el.form, el.name === 'start' ? 'start' : null); return; }
  if (el.dataset.socCopy) { const v = investors.find(x => x.id === el.value); if (!v) return; const f = el.form; ['nombre', 'apellido', 'doc', 'tel', 'email'].forEach(k => { if (f[k]) f[k].value = v[k] || ''; }); f.dataset.investorId = v.id; return; }
  if (el.dataset.rcptTipo || el.dataset.rcptWho) {
    const f = el.form; const tipo = f.tipo.value; if (el.dataset.rcptTipo) toggleFor(f, '[data-for]', tipo);
    const who = tipo === 'INVERSIONISTA' ? f.investorId.value : f.asesorId.value; const sg = suggestedReceipt(tipo, who, f.period.value);
    if (sg !== '') f.amount.value = sg; return;
  }
  if (el.dataset.ff && el.tagName === 'SELECT' || (el.dataset.ff && el.type === 'date')) ffSet(el);
});
document.addEventListener('input', e => { const el = e.target; if (el.dataset.ff && el.type === 'search') ffSet(el, true); if (el.dataset.socPct || el.dataset.socOne) updateSocTotals(el.form); if (el.form && el.form.dataset.form === 'pay') { if (el.name === 'fee') el.dataset.auto = '0'; payFormSync(el.form); }
  if (el.form && el.form.dataset.form === 'event') { if (el.name === 'title') el.dataset.auto = '0'; else if (el.name === 'clientName') evFormSync(el.form, 'prospect'); else if (el.name === 'start') evFormSync(el.form, 'start'); } });
document.addEventListener('change', e => { const el = e.target; if (el.form && el.form.dataset.form === 'pay' && (el.name === 'method' || el.name === 'rateType' || el.name === 'date')) { if (el.name === 'date') el.form._lastRt = null; if (el.name === 'rateType') el.form._rtManual = true; payFormSync(el.form); } });
function ffSet(el, keepFocus) {
  const [grp, key] = el.dataset.ff.split('-');
  if (grp === 'aud') { state.audF = state.audF || {}; state.audF[key] = el.value; state.audLim = 200; }
  else if (grp === 'inv') { state.invF = state.invF || {}; state.invF[key] = el.value; }
  else if (grp === 'base') state.baseQ = el.value;
  else if (grp === 'caja') { state.cajaF = state.cajaF || { kind: 'all', q: '' }; state.cajaF.q = el.value; }
  render();
  if (keepFocus) { const n = document.querySelector(`[data-ff="${el.dataset.ff}"]`); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }
}
document.addEventListener('submit', e => {
  const f = e.target; const kind = f.dataset && f.dataset.form; if (!kind) return;
  const NEW = ['rec', 'bulk-del', 'investor', 'aporte', 'receipt', 'rcpt-void', 'payer-until', 'pdel', 'socio', 'soc-pcts', 'soc-del', 'event', 'ev-del']; if (!NEW.includes(kind)) return;
  e.preventDefault(); const fd = new FormData(f); const err = f.querySelector('.form-err'); const fail = m => { err.textContent = m; err.hidden = false; return false; };
  const tx = k => (fd.get(k) || '').toString().trim();
  if (kind === 'rec') {
    const r = recExp.find(x => x.id === f.dataset.id); const amount = +fd.get('amount'), day = +fd.get('day');
    if (!tx('concept')) return fail('Escribe el concepto.'); if (!(amount > 0)) return fail('El monto debe ser mayor que cero.'); if (!(day >= 1 && day <= 31)) return fail('El día de cobro va de 1 a 31.');
    if (!tx('start')) return fail('Indica la fecha del primer cobro.'); if (tx('end') && tx('end') < tx('start')) return fail('El último cobro no puede ser antes del primero.');
    Object.assign(r, { concept: tx('concept'), category: fd.get('category'), amount, currency: fd.get('currency'), day, start: tx('start'), end: tx('end') || null, payerId: fd.get('payerId') || '', payerUntil: tx('payerUntil') || null, payee: tx('payee') });
    saveNew(); runRecurring(); rebuild(); logAudit(`editó el gasto recurrente "${r.concept}" (${money(amount, 2)} el día ${day})`, 'gastos'); closeModal(); toast('Gasto recurrente actualizado'); render();
  } else if (kind === 'bulk-del') {
    if (tx('conf').toUpperCase() !== 'ELIMINAR') return fail('Escribe ELIMINAR para confirmar.');
    const ids = [...state.selCli]; const gone = deleteClientsByIds(ids, !!fd.get('fromFact'));
    logAudit(`eliminó en bloque ${gone.length} cliente(s): ${gone.map(c => c.name).join(', ')}`, 'clientes'); closeModal(); toast(`${gone.length} cliente(s) eliminado(s)`); render();
  } else if (kind === 'investor') {
    if (!tx('nombre') || !tx('apellido')) return fail('Escribe el nombre y el apellido.');
    const data = { nombre: tx('nombre'), apellido: tx('apellido'), doc: tx('doc'), tel: tx('tel'), email: tx('email'), nota: tx('nota') };
    if (f.dataset.id) Object.assign(investors.find(x => x.id === f.dataset.id), data); else investors.push({ id: 'inv' + Date.now(), ...data, createdAt: new Date().toISOString() });
    saveNew(); logAudit(`${f.dataset.id ? 'editó' : 'agregó'} al inversionista ${data.nombre} ${data.apellido}`, 'inversionistas'); closeModal(); toast('Inversionista guardado'); render();
  } else if (kind === 'aporte') {
    const tipo = fd.get('tipo'), amount = +fd.get('amount'), date = tx('date'), concept = tx('concept'), investorId = fd.get('investorId');
    if (!concept) return fail('Escribe el concepto.'); if (!(amount > 0)) return fail('El monto debe ser mayor que cero.'); if (!date) return fail('Indica la fecha.');
    if (tipo !== 'CAPITAL' && !tx('payee')) return fail('Indica a quién se le pagó.');
    if (date > TODAY && !(tipo === 'GASTO' && fd.get('recurrent'))) return fail('La fecha no puede ser futura.');
    const who = investorName(investorId);
    if (tipo === 'CAPITAL') aportes.push({ id: 'ap' + Date.now(), investorId, date, concept, amount, currency: fd.get('currency'), reembolsable: !!fd.get('reembolsable'), createdAt: new Date().toISOString() });
    else if (tipo === 'INVERSION') { state.investments.push({ id: 'iv' + Date.now(), concept, category: fd.get('invCat'), date, amount, currency: fd.get('currency'), payerId: investorId, payee: tx('payee') }); store.set('investments_v2', state.investments); }
    else if (fd.get('recurrent')) { recExp.push({ id: 'r' + Date.now().toString(36), concept, category: fd.get('category'), amount, currency: fd.get('currency'), day: +date.slice(8), start: date, end: null, payerId: investorId, payerUntil: tx('payerUntil') || null, payee: tx('payee'), active: true, skips: [], createdAt: new Date().toISOString() }); saveNew(); runRecurring(true); store.set('expenses_v2', expenseEntries); }
    else { ensureExpenseState(); if (date.slice(0, 7) < ALL_PERIODS[0]) return fail('La fecha es anterior al inicio del tablero.'); expenseEntries.push({ id: 'mx-' + Date.now(), date, period: date.slice(0, 7), category: fd.get('category'), concept, amount, currency: fd.get('currency'), source: 'manual', payerId: investorId, payee: tx('payee') }); store.set('expenses_v2', expenseEntries); }
    saveNew(); rebuild(); bumpData(); logAudit(`registró un aporte de ${who}: ${APORTE_TIPOS[tipo].toLowerCase()} · "${concept}" por ${num(amount, 2)} ${fd.get('currency')}`, 'inversionistas'); closeModal(); toast('Aporte registrado'); render();
  } else if (kind === 'receipt') {
    const tipo = fd.get('tipo'), amount = +fd.get('amount'), date = tx('date'), ref = tx('ref'), concept = tx('concept'), currency = fd.get('currency');
    if (!(amount > 0)) return fail('El monto pagado es obligatorio y debe ser mayor que cero.');
    if (!date) return fail('La fecha del pago es obligatoria.'); if (date > TODAY) return fail('La fecha del pago no puede ser futura.');
    if (ref.length < 3) return fail('El número de referencia de la transferencia o pago es obligatorio.');
    if (!concept) return fail('Escribe el concepto del pago.');
    const dup = receipts.find(r => !r.anulado && normTxt(r.ref) === normTxt(ref)); if (dup) return fail(`Ese número de referencia ya está en el recibo ${dup.num}.`);
    const r = { id: 'rc' + Date.now(), num: nextReceiptNum(), tipo, concept, amount, currency, date, ref, method: fd.get('method'), nota: tx('nota'), user: auditUser(), createdAt: new Date().toISOString() };
    if (tipo === 'INVERSIONISTA') {
      const v = investors.find(x => x.id === fd.get('investorId')); if (!v) return fail('Elige el inversionista.');
      const s = investorSummary(v.id); const usd = usdOf(amount, currency, date);
      if (usd > s.deuda + 0.01) return fail(`El monto supera lo que se le debe (${money(s.deuda, 2)}).`);
      Object.assign(r, { investorId: v.id, beneficiary: `${v.nombre} ${v.apellido}`, beneficiaryDoc: v.doc, beneficiaryContact: [v.tel, v.email].filter(Boolean).join(' · '), balanceAfter: round2(s.deuda - usd) });
    } else if (tipo === 'PROVEEDOR') {
      if (!tx('provName')) return fail('Escribe el nombre del proveedor.');
      Object.assign(r, { beneficiary: tx('provName'), beneficiaryDoc: tx('provDoc') });
      if (fd.get('asExpense')) { ensureExpenseState(); expenseEntries.push({ id: 'mx-' + Date.now(), date, period: date.slice(0, 7), category: fd.get('category'), concept: `${concept} (${r.num})`, amount, currency, source: 'manual', payee: r.beneficiary, receipt: r.num }); store.set('expenses_v2', expenseEntries); }
    } else {
      const a = asesores.find(x => x.id === fd.get('asesorId')); if (!a) return fail('Elige la persona a la que se le paga.');
      Object.assign(r, { asesorId: a.id, period: fd.get('period'), beneficiary: a.nombre, beneficiaryDoc: '', beneficiaryContact: a.rol || '' });
      comPaid[r.period + '|' + a.id] = date; comPaidRef[r.period + '|' + a.id] = r.num; saveCom();
    }
    receipts.push(r); saveNew(); rebuild(); bumpData();
    logAudit(`emitió el recibo ${r.num} (${RCPT_TIPOS[tipo].toLowerCase()}) a ${r.beneficiary} por ${num(amount, 2)} ${currency} · ref. ${ref}`, state.module === 'comisiones' ? 'comisiones' : 'inversionistas');
    closeModal(); render(); toast(`Recibo ${r.num} emitido`); showReceipt(r.id);
  } else if (kind === 'rcpt-void') {
    if (!tx('motivo')) return fail('Escribe el motivo.');
    const r = receipts.find(x => x.id === f.dataset.id); r.anulado = true; r.anuladoAt = new Date().toISOString(); r.motivo = tx('motivo');
    if (r.asesorId && comPaidRef[r.period + '|' + r.asesorId] === r.num) { delete comPaid[r.period + '|' + r.asesorId]; delete comPaidRef[r.period + '|' + r.asesorId]; saveCom(); }
    saveNew(); rebuild(); logAudit(`anuló el recibo ${r.num} (${r.motivo})`, state.module); closeModal(); toast(`Recibo ${r.num} anulado`); render();
  } else if (kind === 'socio') {
    const nombre = tx('nombre'); if (!nombre) return fail('Escribe el nombre del socio.');
    const r = parsePctBp(tx('pct')); if (r.error) return fail(r.error);
    const id = f.dataset.id, cur = id ? socios.find(x => x.id === id) : null;
    const others = assignedBp() - (cur ? cur.bp : 0);
    if (others + r.bp > BP_TOTAL) return fail(`Con ${fmtBp(r.bp)} el reparto sumaría ${fmtBp(others + r.bp)}. Puedes asignar hasta ${fmtBp(BP_TOTAL - others)}: baja el porcentaje o ajusta primero el de los demás.`);
    const data = { nombre, apellido: tx('apellido'), doc: tx('doc'), tel: tx('tel'), email: tx('email'), nota: tx('nota'), bp: r.bp };
    if (socios.some(x => x.id !== id && normTxt(socioName(x)) === normTxt(`${data.nombre} ${data.apellido}`))) return fail('Ya hay un socio con ese nombre.');
    if (cur) { const before = cur.bp; Object.assign(cur, data); logAudit(`editó al socio ${socioName(cur)}${before !== r.bp ? ` (participación de ${fmtBp(before)} a ${fmtBp(r.bp)})` : ''}`, 'utilidades'); }
    else { const nw = { id: 'soc' + Date.now().toString(36), ...data, ci: nextSocColor(), investorId: f.dataset.investorId || null, createdAt: new Date().toISOString() }; socios.push(nw); logAudit(`agregó al socio ${socioName(nw)} con ${fmtBp(r.bp)} de la utilidad`, 'utilidades'); }
    saveSocios(); bumpData(); closeModal(); const A = assignedBp(); toast(A === BP_TOTAL ? 'Socio guardado · reparto completo (100%)' : `Socio guardado · falta asignar ${fmtBp(BP_TOTAL - A)}`); render();
  } else if (kind === 'soc-pcts') {
    const list = sortedSocios(); const vals = {}; let total = 0;
    for (const s of list) { const r = parsePctBp((fd.get('p_' + s.id) || '0').toString().trim() || '0'); if (r.error) return fail(`${socioName(s)}: ${r.error}`); vals[s.id] = r.bp; total += r.bp; }
    if (total > BP_TOTAL) return fail(`Los porcentajes suman ${fmtBp(total)}: no pueden pasar de 100%. Baja ${fmtBp(total - BP_TOTAL)} en total.`);
    const changes = list.filter(s => s.bp !== vals[s.id]).map(s => `${socioName(s)} ${fmtBp(s.bp)} → ${fmtBp(vals[s.id])}`);
    list.forEach(s => { s.bp = vals[s.id]; }); saveSocios(); bumpData();
    logAudit(changes.length ? `actualizó el reparto de utilidades: ${changes.join(', ')} (total ${fmtBp(total)})` : 'revisó el reparto de utilidades sin cambios', 'utilidades');
    closeModal(); toast(total === BP_TOTAL ? 'Porcentajes guardados · reparto completo (100%)' : `Porcentajes guardados · queda ${fmtBp(BP_TOTAL - total)} sin asignar`); render();
  } else if (kind === 'soc-del') {
    const s = socios.find(x => x.id === f.dataset.id); if (!s) { closeModal(); return; }
    socios = socios.filter(x => x.id !== s.id); saveSocios(); bumpData();
    logAudit(`eliminó al socio ${socioName(s)} (tenía ${fmtBp(s.bp)} de la utilidad)`, 'utilidades'); closeModal(); toast(`${socioName(s)} eliminado. Su ${fmtBp(s.bp)} quedó sin asignar.`); render();
  } else if (kind === 'event') {
    const type = fd.get('type') || 'OTRO', cli = type === 'CLIENTE';
    const title = tx('title'), date = tx('date'), allDay = !cli && !!fd.get('allDay'), start = allDay ? '' : tx('start'); let end = allDay ? '' : tx('end');
    const clientId = cli ? (fd.get('clientId') || '') : '', clientName = cli && !clientId ? tx('clientName') : '';
    if (cli && !clientId && !clientName) return fail('Elige el cliente o escribe el nombre del prospecto.');
    if (!title) return fail('Escribe el título de la cita o reunión.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '2024-01-01' || date > DATE_MAX) return fail('Indica una fecha válida.');
    if (!allDay && !/^\d{2}:\d{2}$/.test(start)) return fail(cli ? 'Indica la hora de la cita.' : 'Indica la hora de inicio o marca "Todo el día".');
    const duration = +fd.get('duration') || agCfg.dur || 30;
    if (!allDay && !end) end = fromMin(toMin(start) + duration);
    if (!allDay && end && end <= start) return fail('La hora de fin debe ser posterior a la de inicio.');
    const phone = cli ? tx('phone') : '', email = cli ? tx('email') : '';
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Revisa el correo del cliente.');
    const participants = cli ? [] : fd.getAll('pt').map(v => { const [k, id] = String(v).split(':'); return { k, id }; });
    const data = { title, type, date, allDay, start, end, duration: allDay ? null : (toMin(end) - toMin(start)), place: tx('place'), participants, notes: tx('notes'), ownerId: fd.get('ownerId') || 'dir', reminder: +fd.get('reminder') || 0, updatedAt: new Date().toISOString(),
      ...(cli ? { clientId, clientName, phone, email, service: fd.get('service') || 'OTRO', modality: fd.get('modality') || 'VIDEO', status: fd.get('status') || 'PROGRAMADA' } : { clientId: '', clientName: '', status: null }) };
    const id = f.dataset.id; const cur = id ? events.find(x => x.id === id) : null;
    const cs = evConflicts(data, id || null);
    if (cs.length && f.dataset.conflictOk !== '1') { f.dataset.conflictOk = '1'; evConflictNote(f); return fail('Esta cita se cruza con otra. Si quieres agendarla igual, pulsa de nuevo el botón.'); }
    if (cur && (cur.date !== date || cur.start !== start) && cur.status === 'CONFIRMADA' && cli && data.status === 'CONFIRMADA') data.status = 'REPROGRAMADA';
    if (cur && (cur.date !== date || cur.start !== start)) data.notified = null;
    if (cur) Object.assign(cur, data); else events.push({ id: 'ev' + Date.now().toString(36), ...data, createdAt: new Date().toISOString(), createdBy: auditUser() });
    if (cli && clientId && (phone || email)) { const c = clientDefs.find(x => x.id === clientId); if (c) { c.opt = c.opt || {}; if (phone && !c.opt.tel) c.opt.tel = phone; if (email && !c.opt.email) c.opt.email = email; store.set('clients_v2', clientDefs); } }
    saveEvents(); state.agDay = date; state.agMonth = date.slice(0, 7);
    if (+data.reminder > 0 && typeof askNotifyPermission === 'function') askNotifyPermission();
    logAudit(`${cur ? 'editó' : 'agendó'} "${title}" (${(EV_TYPES[type] || EV_TYPES.OTRO).label.toLowerCase()}${cli ? ' · ' + (EV_STATUS[data.status] || ['programada'])[0].toLowerCase() : ''}) para el ${fmtDate(date)}${allDay ? '' : ' a las ' + hhmm(start)}${cli ? ' con ' + (evClientName(data) || 'un prospecto') : participants.length ? ' con ' + participants.map(partName).filter(Boolean).join(', ') : ''}`, 'agenda');
    closeModal(); toast(cur ? 'Cambios guardados en la agenda' : `Agendado: ${dayLong(date)}${allDay ? '' : ' a las ' + hhmm(start)}`); render();
  } else if (kind === 'ev-del') {
    const e = events.find(x => x.id === f.dataset.id); if (!e) { closeModal(); return; }
    events = events.filter(x => x.id !== e.id); saveEvents(); logAudit(`eliminó de la agenda "${e.title}" del ${fmtDate(e.date)}`, 'agenda'); closeModal(); toast('Eliminado de la agenda'); render();
  } else if (kind === 'pdel') {
    // CORRECCIÓN v9.3: antes el producto borrado volvía a aparecer al recargar, porque seguía en el
    // catálogo del facturero (agora-catalogo-v1) y el inicio lo volvía a copiar. Ahora se borra de los dos.
    const P = catalog.find(x => x.id === f.dataset.id); if (!P) { closeModal(); return; }
    catalog = catalog.filter(x => x.id !== P.id);
    const fc = lsRaw('agora-catalogo-v1', []).filter(x => x.id !== P.id && normTxt(x.nombre) !== normTxt(P.name));
    try { localStorage.setItem('agora-catalogo-v1', JSON.stringify(fc)); } catch (x) {}
    saveCatalog(); logAudit(`eliminó el producto "${P.short}"`, 'productos'); closeModal(); toast('Producto eliminado del catálogo y del facturero'); render();
  } else if (kind === 'payer-until') {
    const r = recExp.find(x => x.id === f.dataset.id); if (!tx('until')) return fail('Indica la fecha.');
    r.payerUntil = tx('until'); expenseEntries.forEach(e => { if (e.recId === r.id && e.date > r.payerUntil) e.payerId = ''; });
    saveNew(); store.set('expenses_v2', expenseEntries); rebuild(); logAudit(`la empresa asume el gasto "${r.concept}" después del ${fmtDate(r.payerUntil)} (antes lo pagaba ${investorName(r.payerId)})`, 'inversionistas'); closeModal(); toast('Listo: desde esa fecha lo paga la empresa'); render();
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { const v = document.getElementById('viewer'); if (v && !v.hidden) viewerAction('close'); } });
document.addEventListener('keydown', e => {
  const c = e.target.closest && e.target.closest('[data-ag-day]'); if (!c) return;
  const mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]; if (!mv) return;
  e.preventDefault(); const nd = isoD(addDays(D(c.dataset.agDay), mv)); state.agDay = nd;
  if (nd.slice(0, 7) !== state.agMonth) { state.agDir = mv > 0 ? 'r' : 'l'; state.agMonth = nd.slice(0, 7); }
  render(); const n = document.querySelector(`[data-ag-day="${nd}"]`); if (n) n.focus({ preventScroll: true });
});

/* ====================== v10 · AJUSTES NUEVOS (apariencia, tasas, comisiones, agenda, perfil) ====================== */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-set-theme],[data-set-accent],[data-set-nav],[data-act]'); if (!t) return;
  if (t.dataset.setNav) { if (t.dataset.setNav !== state.nav) { setNav(t.dataset.setNav); logAudit(`cambió el menú de módulos a ${t.dataset.setNav === 'side' ? 'barra lateral' : 'arriba'}`, 'ajustes'); } return; }
  if (t.dataset.setTheme) { setTheme(t.dataset.setTheme); logAudit(`cambió el tema a ${{ auto: 'automático', light: 'claro', dark: 'oscuro' }[t.dataset.setTheme]}`, 'ajustes'); return; }
  if (t.dataset.setAccent) { setAccent(t.dataset.setAccent); logAudit(`cambió el color de acento a ${(ACCENTS[t.dataset.setAccent] || [''])[0].toLowerCase()}`, 'ajustes'); return; }
  const a = t.dataset.act;
  if (a === 'tasas') { if (!isUnlocked()) return keyModal(t); return tasasModal(); }
  if (a === 'payfees') { if (!isUnlocked()) return keyModal(t); return payFeesModal(); }
  if (a === 'agenda-cfg') return agendaCfgModal();
  if (a === 'profile') return profileModal();
  if (a === 'install') return installModal();
  if (a === 'install-now' && state.installEvt) { const ev = state.installEvt; state.installEvt = null; ev.prompt(); ev.userChoice.then(r => { if (r && r.outcome === 'accepted') { logAudit('instaló la app en este equipo', 'ajustes'); toast('¡Listo! La app quedó instalada'); } }).catch(() => {}); closeModal(); return; }
});
document.addEventListener('submit', e => {
  const f = e.target; const kind = f.dataset && f.dataset.form; if (!['tasas', 'payfees', 'agenda-cfg', 'profile'].includes(kind)) return;
  e.preventDefault(); e.stopImmediatePropagation(); const fd = new FormData(f); const err = f.querySelector('.form-err'); const fail = m => { if (err) { err.textContent = m; err.hidden = false; } return false; };
  if (kind === 'tasas') {
    const d = fd.get('date') || TODAY; if (d > TODAY) return fail('La fecha no puede ser futura.');
    const row = {}; let bad = null;
    Object.keys(RATE_TYPES).filter(k => k !== 'OTRA').forEach(k => { const v = (fd.get('r_' + k) || '').toString().trim(); if (!v) return; const n = parseAmount(v); if (!(n > 0)) bad = RATE_TYPES[k]; else row[k] = n; });
    if (bad) return fail(`Revisa la tasa de ${bad}.`); if (!Object.keys(row).length) return fail('Escribe al menos una tasa.');
    tasas[d] = Object.assign({}, tasas[d] || {}, row); store.set('tasas_v1', tasas); rebuild(); bumpData();
    logAudit(`registró las tasas del ${fmtDate(d)}: ${Object.entries(row).map(([k, v]) => `${RATE_SHORT[k]} ${num(v, 2)}`).join(', ')} Bs/US$`, 'ajustes'); closeModal(); toast('Tasas guardadas'); render();
  } else if (kind === 'payfees') {
    const next = {}; for (const m of ['PAYPAL', 'BINANCE', 'ZELLE', 'CASH', 'VES']) { const p = parseAmount(fd.get('p_' + m)) || 0, fx = parseAmount(fd.get('f_' + m)) || 0; if (p < 0 || p > 30 || fx < 0 || fx > 50) return fail(`Revisa la comisión de ${PM[m].label}.`); next[m] = { pct: p, fixed: fx }; }
    payFees = next; store.set('payfees_v1', payFees); logAudit(`actualizó las comisiones de cobro (PayPal ${num(next.PAYPAL.pct, 2)}% + ${money(next.PAYPAL.fixed, 2)})`, 'ajustes'); closeModal(); toast('Comisiones guardadas'); render();
  } else if (kind === 'agenda-cfg') {
    const st = fd.get('start'), en = fd.get('end'); if (!st || !en || en <= st) return fail('La hora de cierre debe ser después de la de inicio.');
    const days = fd.getAll('day').map(Number); if (!days.length) return fail('Elige al menos un día de atención.');
    Object.assign(agCfg, { start: st, end: en, dur: +fd.get('dur') || 30, reminder: +fd.get('reminder') || 0, days, wa: (fd.get('wa') || '').toString().trim() || agCfg.wa }); saveAgCfg();
    logAudit(`actualizó el horario de atención de la Agenda (${days.map(d => DOW_S[d]).join(', ')} de ${hhmm(st)} a ${hhmm(en)})`, 'ajustes'); closeModal(); toast('Horario guardado'); render();
  } else if (kind === 'profile') {
    if (!account) return closeModal(); account.name = (fd.get('name') || '').toString().trim().slice(0, 60); store.set('acc_v1', account); logAudit('actualizó su nombre de perfil', 'ajustes'); closeModal(); toast('Perfil guardado'); render();
  }
}, true);

/* ====================== RENDER ====================== */
const VIEWS = { resumen: viewResumen, ingresos: viewIngresos, facturacion: viewFacturacion, facturero: viewFacturero, productos: viewProductos, matriz: viewMatriz, comisiones: viewComisiones, gastos: viewGastos, rentabilidad: viewRentabilidad, caja: viewCaja, clientes: viewClientes, cobranza: viewCobranza, pausas: viewPausas, inversion: viewInversion, inversionistas: viewInversionistas, utilidades: viewUtilidades, agenda: viewAgenda, equipo: viewEquipo, plan: viewPlan, auditoria: viewAuditoria, ajustes: viewAjustes };
function navBadges() { const p = isProj(state.period) ? CUR_P : state.period; const k = KP(p); if (!k) return {}; return { cobranza: (k.cutsPending || 0) + (k.morosos || 0), pausas: k.pausedAtClose || 0, facturacion: cycleRows(p).filter(r => !r.inv && r.amount > 0).length, agenda: typeof agendaTodayCount === 'function' ? agendaTodayCount() : 0 }; }
/* v10 · Tema (automático, claro u oscuro) y color de acento, como en Ajustes del sistema de Apple */
const darkMQ = (() => { try { return window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null; } catch (e) { return null; } })();
function resolvedTheme() { return state.theme === 'dark' || (state.theme === 'auto' && darkMQ && darkMQ.matches) ? 'dark' : 'light'; }
function applyTheme() {
  const r = document.documentElement, t = resolvedTheme(); r.dataset.theme = t; r.dataset.accent = state.accent || 'vino';
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => { if (!m.media) m.content = t === 'dark' ? '#000000' : '#F5F5F7'; });
}
if (darkMQ) { const onScheme = () => { if (state.theme !== 'auto') return; applyTheme(); if (!document.getElementById('app').hidden) render(); }; if (darkMQ.addEventListener) darkMQ.addEventListener('change', onScheme); else if (darkMQ.addListener) darkMQ.addListener(onScheme); }
function setTheme(t) { if (!['auto', 'light', 'dark'].includes(t)) return; state.theme = t; store.set('theme', t); applyTheme(); render(); }
function setNav(n) { if (!['top', 'side'].includes(n)) return; state.nav = n; store.set('nav_v1', n); const r = document.documentElement; r.classList.toggle('nav-side', n === 'side'); r.classList.remove('side-drawer'); render(); }
function setAccent(a) { if (!['vino', 'azul', 'oro', 'apple', 'grafito'].includes(a)) return; state.accent = a; store.set('accent', a); applyTheme(); render(); }
// Rutas con parámetros: #/agenda?accion=nueva-cita (los atajos de la app instalada usan esto)
function parseRoute(h) { const raw = String(h || '').replace(/^#\/?/, ''); const [mod, q] = raw.split('?'); const params = {}; (q || '').split('&').filter(Boolean).forEach(kv => { const [k, v] = kv.split('='); params[decodeURIComponent(k)] = decodeURIComponent(v || ''); }); return { mod: mod || 'resumen', params }; }
// Barra lateral (Mac y iPad) y barra de pestañas (iPhone)
const SIDE_KEYS = { resumen: '1', agenda: '2', facturacion: '3', cobranza: '4', caja: '5', gastos: '6', clientes: '7', inversionistas: '8', utilidades: '9', ajustes: ',' };
const TAB_IDS = ['resumen', 'agenda', 'facturacion', 'caja'];
function renderChrome(mod, badges) {
  const sideMode = state.nav === 'side'; // predeterminado: menú arriba (como en la v9.5); la barra lateral es opcional
  const side = document.getElementById('sidebar');
  if (side && !sideMode && side._h) { side.innerHTML = ''; side._h = ''; }
  if (side && sideMode) {
    const k = isApple() ? '⌘' : 'Ctrl+';
    const html = `<div class="sb-head"><a class="sb-brand" href="#/resumen" aria-label="Agora Digital App · Inicio">${LOGO_H('', 'var(--iso)', 'currentColor')}<small>Digital App</small></a><button type="button" class="tb-ic" data-side="toggle" aria-label="Ocultar la barra lateral" title="Ocultar la barra lateral (${k}\\)">${svgI('sidebar', 18)}</button></div>
      <button type="button" class="sb-search" data-act="palette">${svgI('search', 15)}<span>Buscar o ir a…</span><kbd>${isApple() ? '⌘K' : 'Ctrl K'}</kbd></button>
      <nav class="sb-nav" aria-label="Módulos">${MODULE_GROUPS.map(g => `<div class="sb-g" role="group" aria-label="${esc(g.label)}"><p class="sb-gt">${g.label}</p>${g.ids.map(id => { const m = modOf(id), on = id === mod.id, bd = badges[id]; return `<a class="sb-i ${on ? 'is-on' : ''}" href="#/${id}" style="--c:${m.color}" ${on ? 'aria-current="page"' : ''} title="${esc(m.desc)}"><span class="sb-ic">${svgI(m.icon, 14)}</span><span class="sb-t">${m.name}</span>${bd ? `<span class="sb-b" aria-label="${bd} pendiente(s)">${bd}</span>` : SIDE_KEYS[id] ? `<span class="sb-k">${k}${SIDE_KEYS[id]}</span>` : ''}</a>`; }).join('')}</div>`).join('')}</nav>
      <button type="button" class="sb-athena" data-act="athena"><img src="assets/img/athena-cabeza.webp" alt="" width="38" height="38"><span><b>Pregúntale a Athena</b><small>Tu asistente · ${isApple() ? '⌘J' : 'Ctrl J'}</small></span></button>
      <div class="sb-foot"><span class="sb-user">${esc(account ? (account.name || account.email) : '')}</span><button type="button" class="tb-ic" data-act="shortcuts" aria-label="Atajos y gestos" title="Atajos de teclado y gestos (?)">${svgI('keyboard', 17)}</button></div>`;
    if (side._h !== html) { side.innerHTML = html; side._h = html; }
  }
  const tab = document.getElementById('tabbar');
  if (tab && !sideMode && tab._h) { tab.innerHTML = ''; tab._h = ''; }
  if (tab && sideMode) {
    const more = sum(Object.entries(badges).filter(([id]) => !TAB_IDS.includes(id)), ([, v]) => +v || 0);
    const label = { resumen: 'Inicio', agenda: 'Agenda', facturacion: 'Facturación', caja: 'Caja' };
    const html = TAB_IDS.map(id => { const m = modOf(id), on = id === mod.id, bd = badges[id]; return `<a class="tb-tab ${on ? 'is-on' : ''}" href="#/${id}" ${on ? 'aria-current="page"' : ''}><span class="tt-ic">${svgI(m.icon, 24)}</span><span>${label[id]}</span>${bd ? `<span class="tt-b">${bd}</span>` : ''}</a>`; }).join('') + `<button type="button" class="tb-tab ${TAB_IDS.includes(mod.id) ? '' : 'is-on'}" data-act="more-menu" aria-haspopup="true"><span class="tt-ic">${svgI('more', 24)}</span><span>${TAB_IDS.includes(mod.id) ? 'Más' : esc(mod.name.split(' ')[0])}</span>${more ? `<span class="tt-b">${more}</span>` : ''}</button>`;
    if (tab._h !== html) { tab.innerHTML = html; tab._h = html; }
  }
  const acc = document.getElementById('accBtn'); if (acc) { const ini = account ? ((account.name || account.email || '?').trim()[0] || '?').toUpperCase() : '?'; if (acc.textContent !== ini) acc.textContent = ini; }
  const sb = document.getElementById('sideBtn'); if (sb) sb.setAttribute('aria-expanded', String(!document.documentElement.classList.contains('side-closed')));
}
const isApple = () => document.documentElement.classList.contains('is-apple');
function render() {
  bumpData();
  if (!VIEWS[state.module]) state.module = 'resumen';
  applyTheme();
  const tb = document.getElementById('themeBtn'); if (tb) { const dk = resolvedTheme() === 'dark'; tb.innerHTML = dk ? I.sun : I.moon; tb.setAttribute('aria-label', dk ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'); tb.title = `${dk ? 'Tema claro' : 'Tema oscuro'} (D)`; }
  renderLock();
  const segPrev = snapSegs(); // posición previa de los controles segmentados (para deslizar la selección)
  const mod = modOf(state.module);
  const badges = canAccess() ? navBadges() : {};
  const pend = Object.values(badges).reduce((a, b) => a + (+b || 0), 0);
  renderChrome(mod, badges);
  // El nombre del módulo es el botón que despliega el menú de módulos (solo se redibuja si cambia)
  const crumb = document.getElementById('crumb');
  const crumbHtml = `<button type="button" class="crumb-btn" id="crumbBtn" aria-controls="modMenu" title="Cambiar de módulo (tecla M)"><span class="cr-ic" style="--c:${mod.color}">${svgI(mod.icon, 14)}</span><span class="crumb-t">${mod.name}</span>${pend ? `<span class="nav-b crumb-b" aria-label="${pend} pendiente(s) en los módulos">${pend}</span>` : ''}<span class="crumb-chev">${svgI('chev', 14)}</span></button>`;
  if (crumb._h !== crumbHtml) { crumb.innerHTML = crumbHtml; crumb._h = crumbHtml; }
  crumb.firstChild.setAttribute('aria-expanded', String(menuIsOpen()));
  if (menuIsOpen()) fillMenu();
  // Selector de meses: anterior · en curso · próximo (proyección). Los demás meses se abren con "Más meses".
  const segMonths = monthWindow().includes(state.period) ? monthWindow() : [...monthWindow(), state.period].sort();
  document.getElementById('seg').innerHTML = segMonths.map(x => `<button type="button" class="seg-b ${x === state.period ? 'is-on' : ''}" data-period="${esc(x)}" aria-pressed="${x === state.period}" title="${periodLabel(x)} · ${monthRel(x)} (← → cambian de mes)${SRV && SRV.isClosed(x) ? ' · mes cerrado' : ''}">${mShort(x)}${SRV && SRV.isClosed(x) ? `<i class="seg-lock" aria-label="mes cerrado">${svgI('lock', 10)}</i>` : x === CUR_P ? '<i class="live" aria-hidden="true"></i>' : isProj(x) ? '<i class="proj-dot" aria-hidden="true"></i>' : ''}</button>`).join('');
  { const mb = document.getElementById('monthMoreBtn'); if (mb) mb.setAttribute('aria-expanded', String(monthMenuOpen())); }
  mountSegThumbs(segPrev, document.querySelector('.topbar'));
  const main = document.getElementById('content');
  if (!canAccess()) { main.innerHTML = `<div class="panel">${empty('Este módulo es solo para dirección y administración. Si necesitas ver estas cifras, pídele acceso a un superadministrador.')}<div class="denied-sw"><label class="fld"><span>Ver como</span><select id="roleSel">${Object.entries(ROLES).map(([kk, v]) => `<option value="${esc(kk)}" ${state.role === kk ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div></div>`; return; }
  const focusId = document.activeElement && document.activeElement.dataset ? (document.activeElement.dataset.filter || null) : null;
  const keepFrame = mod.id === 'facturero' && document.getElementById('factFrame');
  const frame = keepFrame ? document.getElementById('factFrame') : null;
  const perTxt = `${periodLabel(state.period)}${state.period === CUR_P ? ' · <span class="live-t">en curso</span>' : state.period === PREV_P ? ' · mes anterior' : isProj(state.period) ? ' · <span class="proj-t">proyección</span>' : ''}${SRV && SRV.isClosed(state.period) ? ' · <span class="closed-t" title="Cambiar sus datos pide un código de verificación">mes cerrado</span>' : ''}`;
  main.innerHTML = `<header class="mod-h" style="--c:${mod.color}"><p class="mod-k"><span class="dotc">${svgI(mod.icon, 11)}</span>${perTxt}</p><h1 data-dbl="top" title="Doble clic: volver arriba">${mod.name}</h1><p class="mod-d">${mod.desc}</p><span class="mod-x"><button class="btn btn-sm" type="button" data-act="report" title="Descargar informe (${isApple() ? '⌘' : 'Ctrl+'}P)">${svgI('download', 14)} Descargar informe</button></span></header>${isProj(state.period) && PERIOD_MODS.includes(mod.id) ? projNote(state.period) : ''}${!isProj(state.period) && RATE_MODS.includes(mod.id) ? rateNote(state.period) : ''}${VIEWS[mod.id](state.period)}`;
  // Entrada suave del contenido solo al cambiar de módulo o de mes (no en cada redibujo, para no parpadear al escribir)
  const viewKey = mod.id + '|' + state.period + '|' + (state.loading ? 1 : 0);
  if (!state.loading && viewKey !== render.lastKey && !reduceMotion()) {
    main.classList.remove('view-enter'); void main.offsetWidth; main.classList.add('view-enter');
    requestAnimationFrame(() => { setupReveal(main); countUp(main); }); // lo de abajo aparece al llegar con el scroll
  } else if (viewKey === render.lastKey) main.classList.remove('view-enter');
  render.lastKey = viewKey;
  mountSegThumbs(segPrev, main);
  if (mod.id === 'facturero') { if (SRV) SRV.mountFiscal(main); else mountFacturero(frame); }
  // Accesos fijos de la barra superior: Inicio, Ajustes y Auditoría
  [['homeBtn', 'resumen'], ['setBtn', 'ajustes'], ['audBtn', 'auditoria']].forEach(([bid, mid]) => { const b = document.getElementById(bid); if (!b) return; b.classList.toggle('is-on', mod.id === mid); if (mod.id === mid) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  if (focusId) { const el = main.querySelector(`[data-filter="${focusId}"]`); if (el) { el.focus(); if (el.setSelectionRange && el.type === 'search') el.setSelectionRange(el.value.length, el.value.length); } }
  if (typeof afterRender === 'function') afterRender(mod);
}
function load() { state.loading = true; render(); clearTimeout(load.t); load.t = setTimeout(() => { state.loading = false; render(); }, 350); }
window.addEventListener('hashchange', () => {
  const m = document.getElementById('modMenu'); const fromMenu = !!(m && m.contains(document.activeElement)); closeMenu(false); closeMonthMenu(false);
  const r = parseRoute(location.hash); state.module = r.mod; if (!VIEWS[state.module]) state.module = 'resumen';
  if (document.documentElement.classList.contains('side-drawer')) document.documentElement.classList.remove('side-drawer');
  render(); window.scrollTo(0, 0); if (fromMenu) document.getElementById('content').focus({ preventScroll: true });
  if (typeof routeAction === 'function') routeAction(r);
});

/* ====================== MICROINTERACCIONES (estilo Apple) ======================
   - Controles segmentados con una "píldora" que se desliza a la opción elegida (meses, Matriz, Comisiones).
   - Los bloques que están más abajo aparecen suavemente al llegar con el scroll.
   - Las cifras principales cuentan hasta su valor al entrar a un módulo.
   Todo queda dentro de .app (nunca en informes ni PDF) y se apaga con "reducir movimiento". */
function segKey(sg) { const b = sg.querySelector('.seg-b'); if (!b) return sg.id || null; const a = [...b.attributes].find(x => x.name.startsWith('data-')); return a ? a.name : (sg.id || null); }
function snapSegs() { const out = {}; document.querySelectorAll('.app .seg').forEach(sg => { const k = segKey(sg), on = sg.querySelector('.seg-b.is-on'); if (k && on && on.offsetWidth) out[k] = { x: on.offsetLeft, w: on.offsetWidth }; }); return out; }
function mountSegThumbs(prev, root) {
  if (!root) return;
  root.querySelectorAll('.seg').forEach(sg => {
    const on = sg.querySelector('.seg-b.is-on'); if (!on || !on.offsetWidth) return;
    let th = sg.querySelector(':scope > .seg-thumb'); if (!th) { th = document.createElement('i'); th.className = 'seg-thumb'; th.setAttribute('aria-hidden', 'true'); sg.prepend(th); }
    sg.classList.add('has-thumb');
    const from = prev && prev[segKey(sg)], place = (x, w) => { th.style.width = w + 'px'; th.style.transform = `translateX(${x}px)`; };
    if (from && !reduceMotion() && (from.x !== on.offsetLeft || from.w !== on.offsetWidth)) { th.style.transition = 'none'; place(from.x, from.w); void th.offsetWidth; th.style.transition = ''; }
    place(on.offsetLeft, on.offsetWidth);
  });
}
function refreshThumbs() { document.querySelectorAll('.app .seg.has-thumb').forEach(sg => { const th = sg.querySelector(':scope > .seg-thumb'), on = sg.querySelector('.seg-b.is-on'); if (th && on && on.offsetWidth) { th.style.transition = 'none'; th.style.width = on.offsetWidth + 'px'; th.style.transform = `translateX(${on.offsetLeft}px)`; void th.offsetWidth; th.style.transition = ''; } }); }
window.addEventListener('resize', refreshThumbs);
// Al cruzar un punto de quiebre de la pantalla se redibujan los gráficos con el lienzo adecuado
let lastChartBucket = chartBucket(), chartRz = 0;
window.addEventListener('resize', () => { clearTimeout(chartRz); chartRz = setTimeout(() => {
  const b = chartBucket(); if (b === lastChartBucket) return; lastChartBucket = b;
  const c = document.getElementById('content'), ae = document.activeElement;
  if (!c || state.module === 'facturero' || !c.querySelector('svg.chart') || (ae && c.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))) return;
  render();
}, 200); });
if (document.fonts) { if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', refreshThumbs); if (document.fonts.ready) document.fonts.ready.then(refreshThumbs); }
let revealIO = null;
function setupReveal(main) {
  if (revealIO) { revealIO.disconnect(); revealIO = null; }
  if (reduceMotion() || !('IntersectionObserver' in window)) return;
  const vh = window.innerHeight; const items = [...main.children].filter(el => el.getBoundingClientRect().top > vh * 0.9);
  if (!items.length) return;
  const io = revealIO = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; e.target.classList.add('in'); countUp(e.target); io.unobserve(e.target); }), { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });
  items.forEach(el => { el.classList.add('rv'); io.observe(el); });
}
const COUNT_SEL = '.hero-v,.mm-v,.rc-v,.hero-stats b,.tm-v,.hl-score';
function countUp(root) {
  if (reduceMotion() || !root) return;
  const list = root.matches && root.matches(COUNT_SEL) ? [root] : [...root.querySelectorAll(COUNT_SEL)];
  list.forEach(el => {
    if (el.dataset.final || el.children.length || el.closest('.rv:not(.in)')) return;
    const txt = el.textContent, m = txt.match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/); if (!m) return;
    const raw = m[0], dec = (raw.split(',')[1] || '').length, val = parseFloat(raw.replace(/\./g, '').replace(',', '.'));
    if (!isFinite(val) || !val) return;
    const pre = txt.slice(0, m.index), post = txt.slice(m.index + raw.length), t0 = performance.now(), dur = 950;
    el.dataset.final = txt;
    const step = now => { if (!el.isConnected) return; const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 4);
      if (t < 1) { el.textContent = pre + num(val * e, dec) + post; requestAnimationFrame(step); } else { el.textContent = txt; el.removeAttribute('data-final'); } };
    el.textContent = pre + num(0, dec) + post; requestAnimationFrame(step);
  });
}

/* ====================== MÁS MESES (historial) ======================
   La barra muestra mes anterior, en curso y próximo; este panel abre cualquier otro mes con datos. */
const monthMenuEl = () => document.getElementById('monthMenu');
function monthMenuOpen() { const m = monthMenuEl(); return !!m && !m.hidden && !m.classList.contains('is-closing'); }
function monthMenuHtml() {
  const years = [...new Set(ALL_PERIODS.map(p => p.slice(0, 4)))];
  return `<div class="mdm-scroll">${years.map(y => `<div class="mdm-g" role="group" aria-label="${esc(y)}"><p class="mdm-gt">${y}</p><div class="mpk-grid">${ALL_PERIODS.filter(p => p.startsWith(y)).map(p => `<button type="button" class="mpk-b ${p === state.period ? 'is-on' : ''} ${p === CUR_P ? 'is-cur' : ''} ${isProj(p) ? 'is-proj' : ''}" data-pick-period="${esc(p)}" aria-pressed="${p === state.period}" title="${periodLabel(p)} · ${monthRel(p)}">${mShort(p)}${p === CUR_P ? '<i class="live" aria-hidden="true"></i>' : isProj(p) ? '<i class="proj-dot" aria-hidden="true"></i>' : ''}</button>`).join('')}</div></div>`).join('')}</div><div class="mdm-foot"><span><i class="live" aria-hidden="true"></i> en curso · <i class="proj-dot" aria-hidden="true"></i> proyección</span><span><kbd>Esc</kbd> cierra</span></div>`;
}
function openMonthMenu() {
  const m = monthMenuEl(), b = document.getElementById('monthMoreBtn'); if (!m || !b) return;
  closeMenu(false); clearTimeout(m._t); m.classList.remove('is-closing'); m.innerHTML = monthMenuHtml(); m.hidden = false;
  const r = b.getBoundingClientRect(), vw = document.documentElement.clientWidth, w = Math.min(340, vw - 24);
  const left = Math.round(Math.min(Math.max(12, r.right - w), vw - w - 12)), top = Math.round(r.bottom + 8);
  Object.assign(m.style, { left: left + 'px', top: top + 'px', width: w + 'px' }); m.style.setProperty('--mdm-max', Math.max(220, window.innerHeight - top - 14) + 'px'); m.style.setProperty('--mdm-ox', Math.round(r.left - left + r.width / 2) + 'px');
  void m.offsetWidth; m.classList.add('is-open'); b.setAttribute('aria-expanded', 'true');
  const cur = m.querySelector('.mpk-b.is-on') || m.querySelector('.mpk-b'); if (cur) cur.focus({ preventScroll: true });
}
function closeMonthMenu(returnFocus) {
  const m = monthMenuEl(); if (!m || m.hidden || m.classList.contains('is-closing')) return;
  const b = document.getElementById('monthMoreBtn'); if (b) b.setAttribute('aria-expanded', 'false');
  m.classList.remove('is-open'); m.classList.add('is-closing'); clearTimeout(m._t); m._t = setTimeout(() => { m.hidden = true; m.classList.remove('is-closing'); m.innerHTML = ''; }, reduceMotion() ? 0 : 170);
  if (returnFocus && b) b.focus({ preventScroll: true });
}
document.addEventListener('click', e => {
  if (e.target.closest('#monthMoreBtn')) { e.preventDefault(); monthMenuOpen() ? closeMonthMenu(true) : openMonthMenu(); return; }
  const pk = e.target.closest('[data-pick-period]');
  if (pk) { closeMonthMenu(false); if (pk.dataset.pickPeriod !== state.period) { state.period = pk.dataset.pickPeriod; state.agMonth = null; load(); } return; }
  if (monthMenuOpen() && !e.target.closest('#monthMenu')) closeMonthMenu(false);
});
document.addEventListener('keydown', e => {
  if (!monthMenuOpen()) return; const m = monthMenuEl(); const items = [...m.querySelectorAll('.mpk-b')]; const i = items.indexOf(document.activeElement);
  const go = n => { e.preventDefault(); const t = items[(n + items.length) % items.length]; if (t) t.focus(); };
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeMonthMenu(true); return; }
  if (e.key === 'ArrowRight') return go(i + 1); if (e.key === 'ArrowLeft') return go(i - 1);
  if (e.key === 'ArrowDown') return go(i + 4); if (e.key === 'ArrowUp') return go(i - 4);
}, true);

/* ====================== MENÚ DESPLEGABLE DE MÓDULOS (barra superior) ======================
   Botón con el nombre del módulo → panel de vidrio con todos los módulos agrupados.
   Abre con resorte, cierra al elegir, al tocar fuera, con Escape o al salir con Tab.
   Teclado: flechas, Inicio/Fin y la tecla M para abrirlo desde cualquier pantalla. */
const menuEl = () => document.getElementById('modMenu');
const menuBtn = () => document.getElementById('crumbBtn');
function menuIsOpen() { const m = menuEl(); return !!m && !m.hidden && !m.classList.contains('is-closing'); }
function menuHtml() {
  const badges = canAccess() ? navBadges() : {}; let k = 0;
  return `<div class="mdm-scroll">${MODULE_GROUPS.map(g => `<div class="mdm-g" role="group" aria-label="${esc(g.label)}"><p class="mdm-gt">${g.label}</p><div class="mdm-list">${g.ids.map(id => {
    const m = modOf(id), on = id === state.module, bd = badges[id];
    return `<a class="mdm-i ${on ? 'is-on' : ''}" href="#/${id}" style="--c:${m.color};--k:${k++}" ${on ? 'aria-current="page"' : ''}><span class="mdm-ic">${svgI(m.icon, 16)}</span><span class="mdm-t"><b>${m.name}</b><small>${esc(m.desc)}</small></span>${bd ? `<span class="nav-b" aria-label="${bd} pendiente(s)">${bd}</span>` : ''}${on ? `<span class="mdm-ok" aria-hidden="true">${I.check}</span>` : ''}</a>`;
  }).join('')}</div></div>`).join('')}</div><div class="mdm-foot"><span>Flechas para moverte · Enter para abrir</span><span><kbd>M</kbd> abre el menú · <kbd>Esc</kbd> lo cierra</span></div>`;
}
function fillMenu() { const m = menuEl(); if (!m) return; const f = document.activeElement && m.contains(document.activeElement) ? document.activeElement.getAttribute('href') : null; m.innerHTML = menuHtml(); m.querySelectorAll('.mdm-i').forEach(a => { a.style.animation = 'none'; }); if (f) { const a = m.querySelector(`.mdm-i[href="${f}"]`); if (a) a.focus({ preventScroll: true }); } }
function placeMenu() {
  const m = menuEl(), b = menuBtn(); if (!m || m.hidden || !b) return;
  const r = b.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight;
  if (r.bottom < 0 || r.top > vh) { closeMenu(false); return; }
  const w = Math.min(vw >= 1100 ? 900 : 680, vw - 24), left = Math.round(Math.min(Math.max(12, r.left - 6), vw - w - 12)), top = Math.round(r.bottom + 8);
  m.style.left = left + 'px'; m.style.top = top + 'px';
  m.style.setProperty('--mdm-max', Math.max(240, vh - top - 14) + 'px');
  m.style.setProperty('--mdm-ox', Math.round(r.left - left + Math.min(r.width / 2, 60)) + 'px');
}
function openMenu() {
  const m = menuEl(), b = menuBtn(); if (!m || !b) return;
  closeMonthMenu(false); clearTimeout(m._t); m.classList.remove('is-closing'); m.innerHTML = menuHtml(); m.hidden = false;
  placeMenu(); void m.offsetWidth; m.classList.add('is-open'); b.setAttribute('aria-expanded', 'true');
  const cur = m.querySelector('.mdm-i.is-on') || m.querySelector('.mdm-i'); if (cur) cur.focus({ preventScroll: true });
}
function closeMenu(returnFocus) {
  const m = menuEl(); if (!m || m.hidden || m.classList.contains('is-closing')) return;
  const b = menuBtn(); if (b) b.setAttribute('aria-expanded', 'false');
  m.classList.remove('is-open'); m.classList.add('is-closing');
  clearTimeout(m._t); m._t = setTimeout(() => { m.hidden = true; m.classList.remove('is-closing'); m.innerHTML = ''; }, reduceMotion() ? 0 : 170);
  if (returnFocus && b) b.focus({ preventScroll: true });
}
document.addEventListener('click', e => {
  const b = e.target.closest('#crumbBtn');
  if (b) { e.preventDefault(); menuIsOpen() ? closeMenu(true) : openMenu(); return; }
  const it = e.target.closest('.mdm-i');
  if (it) { if (it.getAttribute('href') === location.hash || (!location.hash && it.getAttribute('href') === '#/resumen')) { e.preventDefault(); closeMenu(true); } return; } // el cambio de hash lo cierra
  if (menuIsOpen() && !e.target.closest('#modMenu')) closeMenu(false);
});
document.addEventListener('keydown', e => {
  const m = menuEl(); if (!m) return;
  if (menuIsOpen()) {
    const items = [...m.querySelectorAll('.mdm-i')]; const i = items.indexOf(document.activeElement);
    const go = n => { e.preventDefault(); const t = items[(n + items.length) % items.length]; if (t) t.focus(); };
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeMenu(true); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') return go(i < 0 ? 0 : i + 1);
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') return go(i < 0 ? items.length - 1 : i - 1);
    if (e.key === 'Home') return go(0);
    if (e.key === 'End') return go(items.length - 1);
    return;
  }
  const tg = e.target, editing = tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName));
  if ((e.key === 'm' || e.key === 'M') && !editing && !e.ctrlKey && !e.metaKey && !e.altKey && document.getElementById('modal').hidden && !document.getElementById('app').hidden) {
    const v = document.getElementById('viewer'); if (v && !v.hidden) return;
    e.preventDefault(); openMenu();
  }
}, true);
document.addEventListener('focusout', e => { const m = menuEl(); if (!menuIsOpen() || !m.contains(e.target)) return; const to = e.relatedTarget; if (to && !m.contains(to) && to !== menuBtn()) closeMenu(false); });
{ let raf = 0; const onMove = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const tb = document.querySelector('.topbar'); if (tb) tb.classList.toggle('is-scrolled', window.scrollY > 4); if (menuIsOpen()) placeMenu();
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) document.querySelectorAll('#content > .rv:not(.in)').forEach(el => { el.classList.add('in'); countUp(el); }); }); /* al llegar al final, nada queda oculto */ };
  window.addEventListener('scroll', onMove, { passive: true }); window.addEventListener('resize', onMove); }

/* ====================== FACTURERO INTEGRADO ====================== */
const FK = { cli: 'agora-clientes-v1', inv: 'agora-facturas-v1', seq: 'agora-correlativos-v1', cat: 'agora-catalogo-v1' };
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
function syncClientsToFacturero() {
  const list = lsGet(FK.cli, []); const seq = lsGet(FK.seq, { factura: 0, cliente: 0 }); let changed = false;
  clientDefs.forEach(c => {
    const o = c.opt || {};
    let fc = list.find(x => (o.cliCode && x.code === o.cliCode) || normTxt(x.nombre) === normTxt(c.name));
    if (!fc) { seq.cliente = (seq.cliente || 0) + 1; fc = { code: 'CLI-' + String(seq.cliente).padStart(4, '0'), nombre: c.name, rif: o.rif || '', dir: o.dir || '', email: o.email || '', tel: o.tel || '', createdAt: new Date().toISOString() }; list.push(fc); changed = true; }
    else { ['rif', 'dir', 'email', 'tel'].forEach(f => { if (o[f] && fc[f] !== o[f]) { fc[f] = o[f]; changed = true; } }); if (fc.nombre !== c.name) { fc.nombre = c.name; changed = true; } }
    if (o.cliCode !== fc.code) { c.opt = { ...o, cliCode: fc.code }; }
  });
  if (changed) { lsSet(FK.cli, list); lsSet(FK.seq, seq); }
  store.set('clients_v2', clientDefs);
}
let lastFactSig = store.get('fact_sig', '');
function syncFromFacturero(force) {
  if (SRV) return srvSyncFiscal(force);
  const facturas = lsGet(FK.inv, {}); const sig = String(hashStr(JSON.stringify(facturas)) + '|' + catalog.length + '|' + clientDefs.length);
  if (!force && sig === lastFactSig) return null;
  if (!Object.keys(facturas).length && !importedInv.some(f => f.src !== 'file')) { lastFactSig = sig; store.set('fact_sig', sig); return null; }
  let r;
  try { r = applyImport({ facturas, catalogo: lsGet(FK.cat, []) }, { full: true }); }
  catch (e) { console.error('No se pudo sincronizar el facturero', e); return null; } // no se guarda la firma: se reintenta
  lastFactSig = String(hashStr(JSON.stringify(facturas)) + '|' + catalog.length + '|' + clientDefs.length); store.set('fact_sig', lastFactSig);
  if (r.added || r.updated || r.removed) logAudit(`sincronizó el facturero: ${r.added} nueva(s), ${r.updated} actualizada(s)${r.changed.length ? ' (' + r.changed.join(', ') + ')' : ''}, ${r.removed} quitada(s)`, 'facturero');
  r.invoices = r.added + r.updated + r.removed;
  return r;
}
// v11 · con servidor: las facturas salen de los documentos fiscales emitidos (no del facturero del navegador).
// Se rearma importedInv con el mismo formato y se recalculan planes, servicios y ventas de cada cliente.
function srvSyncFiscal(force) {
  const list = SRV.facturas();
  const sig = String(hashStr(JSON.stringify(list)) + '|' + catalog.length + '|' + clientDefs.length);
  if (!force && sig === lastFactSig && importedInv.length === list.length) return null;
  const oldList = clone(importedInv); const res = { invoices: list.length, added: 0, updated: 0, removed: 0, newClients: [], changed: [] };
  const next = [];
  list.forEach(f => {
    let c = (f.clientAppId && clientDefs.find(x => x.id === f.clientAppId)) || clientDefs.find(x => normTxt(x.name) === normTxt(f.client));
    if (!c) { c = { id: f.clientAppId || newClientId(), name: f.client || 'Cliente', sector: 'Sin sector', channel: 'OTHER', cac: 0, health: 7, seats: 1, segs: [], services: [], sales: [], pauses: [], opt: f.rif ? { rif: f.rif } : {} }; clientDefs.push(c); res.newClients.push(c.name); }
    const lines = (f.lines || []).map(l => {
      let P = (l.productId && catalog.find(p => p.id === l.productId)) || matchProduct(catalog, l.title || '');
      if (!P) { P = { id: 'cus-' + hashStr(normTxt(l.title || 'servicio')).toString(36), short: String(l.title || 'Servicio').slice(0, 60), name: l.title || 'Servicio', recurring: false, tipo: 'sin', price: +l.amount || 0, custom: true, fromInvoice: true, hours: 0 }; if (!catalog.some(x => x.id === P.id)) catalog.push(P); else P = catalog.find(x => x.id === P.id); }
      return { productId: P.id, amount: round2(+l.amount || 0), rec: !!P.recurring, title: l.title || P.name };
    });
    const o = oldList.find(x => x.id === f.id); if (!o) res.added++; else if (o.subtotal !== round2(f.subtotal)) { res.updated++; res.changed.push(f.num); }
    next.push({ id: f.id, num: f.num, clientId: c.id, code: null, issueDate: f.issueDate, dueDate: f.dueDate || f.issueDate, subtotal: round2(+f.subtotal || 0), ivaRate: +f.ivaRate || 0, iva: round2(+f.iva || 0), paidDate: null, lines, updatedAt: f.updatedAt || null, src: 'srv', uid: f.uid, control: f.control || null });
  });
  res.removed = oldList.filter(x => !next.some(n => n.id === x.id)).length;
  importedInv = next;
  rederiveFromInvoices(oldList);
  store.set('imported_v1', importedInv); store.set('catalog_v1', catalog); saveClients();
  lastFactSig = sig; store.set('fact_sig', sig);
  return res;
}
window.agoraSrvSync = () => { try { srvSyncFiscal(true); rebuild(); render(); } catch (e) { console.warn(e); } };
function factureroHtml() { return withPdfEngine(factureroRaw()); }
function withPdfEngine(html) { return html.replace(/<\/body>(?![\s\S]*<\/body>)/, `<script${NONCE_ATTR()}>${agoraPdfEngine.toString()}\nagoraPdfEngine({ sel: '#page', name: 'Factura.pdf', orient: 'portrait', single: true, width: 794, remove: '.row-tools,.row-hl' });<\/script></body>`); }
function factureroRaw() { const b = atob(FACTURERO_B64); const bytes = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i); return new TextDecoder('utf-8').decode(bytes); }
let __factHtml = null;
function mountFacturero(prev) {
  const fr = document.getElementById('factFrame'); if (!fr) return;
  if (prev && prev !== fr && prev.srcdoc) { fr.replaceWith(prev); return; }
  syncClientsToFacturero();
  __factHtml = __factHtml || factureroHtml();
  fr.srcdoc = __factHtml;
}
window.addEventListener('storage', e => { if (SRV) return; if (e.key === FK.cli) { const n = syncClientsFromFacturero(); if (n) { saveClients(); logAudit(`agregó ${n} cliente(s) nuevo(s) desde el facturero`, 'clientes'); toast('Cliente nuevo del facturero agregado al tablero'); render(); } return; } if (e.key === FK.inv) { const r = syncFromFacturero(); if (r && r.invoices) { toast(`Factura guardada en el facturero: el tablero ya la tiene`); render(); } } });
setInterval(() => { try { if (runRecurring()) render(); } catch (x) {} }, 60000);
setInterval(() => { if (SRV) return; const added = syncClientsFromFacturero(); if (added) { saveClients(); logAudit(`agregó ${added} cliente(s) nuevo(s) desde el facturero`, 'clientes'); } const r = syncFromFacturero(); if (added || (r && r.invoices)) render(); }, 4000);

/* ====================== MODALES NUEVOS ====================== */
function expModal(id) {
  const e = id ? db.expenses.find(x => x.id === id) : null;
  openModal(`<h2 id="modal-t">${e ? 'Editar gasto' : 'Registrar gasto'}</h2>
    <form data-form="exp" data-id="${esc(e ? e.id : '')}" novalidate><div class="fgrid">
      <label class="fld span2"><span>Concepto</span><input name="concept" maxlength="120" value="${e ? esc(e.concept || '') : ''}" placeholder="Ej. Licencia de Canva"></label>
      <label class="fld"><span>Categoría</span><select name="category">${['COGS', 'OPEX', 'BELOW'].map(g => `<optgroup label="${esc(GROUP_LABEL[g])}">${ALL_CATS().filter(c => !c.auto && c.group === g).map(c => `<option value="${esc(c.id)}" ${e && e.category === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label class="fld"><span>Fecha del gasto</span><input type="date" name="date" value="${esc(e ? (e.date || e.period + '-01') : defaultExpDate())}"></label>
      <label class="fld"><span>Monto</span><input name="amount" type="number" min="0" step="0.01" value="${esc(e ? e.amount : '')}"></label>
      <label class="fld"><span>Moneda</span><select name="currency">${opts(CURRENCIES, e ? e.currency : 'USD')}</select></label>
      <label class="fld"><span>¿Quién lo paga?</span><select name="payerId">${payerOpts(e ? e.payerId : '')}</select></label>
      <label class="fld"><span>A quién se le paga</span><input name="payee" maxlength="100" value="${e ? esc(e.payee || '') : ''}" placeholder="Proveedor o beneficiario"></label>
      ${e && e.recId ? `<p class="span2 muted small">Este gasto lo registró la plantilla recurrente "${esc((recExp.find(r => r.id === e.recId) || {}).concept || '')}".</p><label class="fld span2 chk"><input type="checkbox" name="applyFuture"> Aplicar también estos cambios a los próximos meses</label>`
        : `<label class="fld span2 chk"><input type="checkbox" name="recurrent"> Es recurrente: registrarlo solo cada mes el mismo día</label><label class="fld"><span>Último cobro (opcional)</span><input type="date" name="recEnd"></label>`}</div>
      <p class="form-err" hidden></p>
      <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">${e ? 'Guardar cambios' : 'Registrar gasto'} <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}
function budgetModal() {
  openModal(`<h2 id="modal-t">Presupuesto mensual de gastos</h2><p class="muted">Lo que esperas gastar cada mes por categoría. Los montos importados desde la hoja para un mes puntual tienen prioridad.</p>
    <form data-form="budget">${board({ cols: [{ label: 'Categoría' }, { label: 'USD al mes', cls: 'r', w: '150px' }], groups: ['COGS', 'OPEX', 'BELOW'].map(g => ({ label: GROUP_LABEL[g], color: GROUP_COLOR[g], rows: ALL_CATS().filter(c => c.group === g).map(c => ({ cells: [esc(c.label), `<input class="num-in" type="number" min="0" step="1" name="b_${c.id}" value="${esc(budgets[c.id] || 0)}" aria-label="Presupuesto de ${esc(c.label)}">`] })) })) })}
    <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Guardar presupuesto <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}
function goalModal() {
  openModal(`<h2 id="modal-t">Meta de ingresos</h2><p class="muted">Deja vacío un mes para usar la meta general.</p>
    <form data-form="goal"><label class="fld"><span>Meta mensual general (USD, sin IVA)</span><input type="number" min="0" step="1" name="g_default" value="${esc(goals.default)}"></label>
    ${board({ cols: [{ label: 'Mes' }, { label: 'Meta del mes', cls: 'r', w: '160px' }], groups: [{ rows: UI_PERIODS.map(x => ({ cells: [periodLabel(x), `<input class="num-in" type="number" min="0" step="1" name="g_${x}" value="${esc(goals.byPeriod[x] != null ? goals.byPeriod[x] : '')}" placeholder="${esc(goals.default)}" aria-label="Meta de ${periodLabel(x)}">`] })) }] })}
    <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Guardar meta <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}
function cashModal() {
  openModal(`<h2 id="modal-t">Efectivo en caja al cierre</h2><p class="muted">Escribe tu saldo real de cada mes. Deja vacío para usar el calculado.</p>
    <form data-form="cash">${board({ cols: [{ label: 'Mes' }, { label: 'Calculado', cls: 'r', w: '130px' }, { label: 'Saldo real (USD)', cls: 'r', w: '170px' }], groups: [{ rows: UI_PERIODS.map(x => { const snap = db.cashSnapshots.find(c => c.period === x); return { cells: [periodLabel(x), `<span class="muted">${money(snap && !snap.edited ? snap.cashBalance : null)}</span>`, `<input class="num-in" type="number" step="0.01" name="c_${x}" value="${esc(cashOver[x] != null ? cashOver[x] : '')}" aria-label="Saldo de ${periodLabel(x)}">`] }; }) }] })}
    <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Guardar saldos <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}
function ratesModal() {
  const base = { '2026-03': 142, '2026-04': 150, '2026-05': 158, '2026-06': 165, '2026-07': 171, '2026-08': 178, '2026-09': 186, '2026-10': 192 };
  openModal(`<h2 id="modal-t">Tasa Binance por mes</h2><p class="muted">Bolívares por USDT. Se usa para convertir a dólares lo cobrado o gastado en bolívares.</p>
    <form data-form="rates">${board({ cols: [{ label: 'Mes' }, { label: 'Bs por USDT', cls: 'r', w: '170px' }], groups: [{ rows: ALL_PERIODS.map(x => ({ cells: [periodLabel(x), `<input class="num-in" type="number" min="0" step="0.01" name="r_${x}" value="${esc(rateOver[x] != null ? rateOver[x] : (base[x] ?? ''))}" aria-label="Tasa de ${periodLabel(x)}">`] })) }] })}
    <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Guardar tasas <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}
function ivaModal() {
  openModal(`<h2 id="modal-t">IVA</h2><p class="muted">Porcentaje que se suma a las facturas. El IVA no cuenta como ingreso.</p>
    <form data-form="iva"><label class="fld"><span>IVA (%)</span><input type="number" min="0" max="100" step="0.01" name="iva" value="${esc(ivaRate)}"></label>
    <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Guardar IVA <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}
function staffModal() {
  const st = staffState || clone(DEFAULT_STAFF);
  const row = (s, i) => ({ cells: [`<input class="txt-in" name="n_${i}" value="${esc(s.name)}" aria-label="Nombre">`, `<input class="txt-in" name="r_${i}" value="${esc(s.role)}" aria-label="Rol">`, `<input class="num-in" type="number" min="0" step="0.1" name="h_${i}" value="${esc(s.hourlyCost)}" aria-label="Costo por hora">`, `<input class="num-in" type="number" min="0" step="1" name="c_${i}" value="${esc(s.monthlyCapacityHours)}" aria-label="Horas al mes">`, `<label class="chk-sm"><input type="checkbox" name="x_${i}"> Quitar</label><input type="hidden" name="id_${i}" value="${esc(s.memberId)}">`] });
  openModal(`<h2 id="modal-t">Equipo</h2><p class="muted">El costo por hora y las horas disponibles mueven la nómina, el margen y el uso de la capacidad.</p>
    <form data-form="staff">${board({ cols: [{ label: 'Nombre' }, { label: 'Rol', w: '26%' }, { label: 'US$/hora', cls: 'r', w: '110px' }, { label: 'Horas/mes', cls: 'r', w: '110px' }, { label: '', w: '90px' }], groups: [{ rows: [...st.map(row), row({ name: '', role: '', hourlyCost: '', monthlyCapacityHours: '', memberId: 'new' }, st.length)] }] })}
    <p class="muted small">La última fila sirve para agregar una persona.</p><input type="hidden" name="count" value="${esc(st.length + 1)}">
    <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Guardar equipo <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}
function catalogModal() {
  const row = p => ({ cells: [`<b>${esc(p.short)}</b><small class="muted">${esc(p.name)}</small>`, `<span class="segm" role="radiogroup" aria-label="Tipo de ${esc(p.short)}"><label><input type="radio" name="rec_${p.id}" value="R" ${p.recurring ? 'checked' : ''}><span>Recurrente</span></label><label><input type="radio" name="rec_${p.id}" value="N" ${!p.recurring ? 'checked' : ''}><span>Única vez</span></label></span>`, `<input class="num-in" type="number" min="0" step="0.01" name="price_${p.id}" value="${esc(p.price || '')}" aria-label="Precio de ${esc(p.short)}">`] });
  openModal(`<h2 id="modal-t">Productos y servicios</h2><p class="muted">Cada producto, planes incluidos, puede ser recurrente (se cobra cada mes y suma al ingreso fijo) o de única vez. Así se clasifica cada línea de las facturas del facturero. El precio de un plan cambia lo que pagan todos sus clientes.</p>
    <form data-form="catalog">${board({ cols: [{ label: 'Producto' }, { label: 'Tipo', w: '230px' }, { label: 'Precio USD', cls: 'r', w: '130px' }], groups: [
      { label: 'Planes Ágora', color: '#AD103C', rows: catalog.filter(p => p.plan).map(row) },
      { label: 'Recurrentes · se cobran cada mes', color: '#00A86B', rows: catalog.filter(p => !p.plan && p.recurring).map(row) },
      { label: 'Única vez · se cobran una sola vez', color: '#7B61FF', rows: catalog.filter(p => !p.plan && !p.recurring).map(row) }] })}
    <fieldset class="fset"><legend>Agregar producto</legend><div class="fgrid"><label class="fld span2"><span>Nombre</span><input name="np_name" maxlength="80" placeholder="Ej. Sesión de fotos de producto"></label><label class="fld"><span>Tipo</span><select name="np_rec"><option value="N">Única vez</option><option value="R">Recurrente</option></select></label><label class="fld"><span>Precio USD</span><input name="np_price" type="number" min="0" step="0.01"></label></div></fieldset>
    <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Guardar catálogo <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}

function sheetModal() {
  openModal(`<h2 id="modal-t">Importar gastos desde tu hoja de cálculo</h2>
    <ol class="steps"><li>En Google Sheets abre la pestaña <b>Gastos</b> y selecciona la tabla completa, con la fila de los meses (Ene, Feb, Mar…).</li><li>Cópiala y pégala aquí abajo.</li><li>Indica si esos montos son lo real o lo presupuestado.</li></ol>
    <form data-form="sheet" novalidate>
      <label class="fld"><span>Tabla pegada</span><textarea name="data" rows="8" placeholder="Categoría&#9;Ene&#9;Feb&#9;Mar…"></textarea></label>
      <div class="fgrid">
        <label class="fld"><span>Estos montos son</span><select name="mode"><option value="REAL">Lo real (gastado)</option><option value="BUDGET">El presupuesto</option></select></label>
        <label class="fld"><span>Moneda de la hoja</span><select name="currency">${opts(CURRENCIES, 'USD')}</select></label>
        <label class="fld"><span>Año de la hoja</span><select name="year">${[...new Set(ALL_PERIODS.map(p => p.slice(0, 4)))].map(y => `<option ${y === TODAY.slice(0, 4) ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
        <label class="fld span2 chk"><input type="checkbox" name="replace" checked> Reemplazar los gastos de ejemplo de los meses importados</label>
      </div>
      <p class="form-err" hidden></p>
      <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Importar <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}
const MONTH_KEYS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTH_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const CAT_RULES = [[/nomin|sueldo|salari|personal|honorar|equipo/, 'nomina'], [/softwar|herramient|licenc|suscrip|saas|app/, 'software'], [/servidor|hosting|hospedaje|dominio|infra|nube|cloud/, 'infra'], [/inteligencia|openai|anthropic|\bia\b|tokens/, 'ia'], [/whatsapp|mensajer|sms|twilio/, 'whatsapp'], [/internet|telef|oficin|alquiler|luz|agua|electric/, 'internet'], [/contad|contabil|legal|abogad|profesional|asesor/, 'profesionales'], [/banc|binance|transfer|pago movil/, 'bancarias'], [/impuest|iva|islr|seniat|tribut|municip|tasa/, 'impuestos']];
// v10: "46.400" se lee como 46 mil 400 (punto de miles, como se escribe en Venezuela); "46,40" y "46.40" siguen siendo decimales
const parseAmount = t => { let x = String(t || '').replace(/[^\d,.\-]/g, ''); if (!x) return null; if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, ''); const lc = x.lastIndexOf(','), ld = x.lastIndexOf('.'); if (lc > ld) x = x.replace(/\./g, '').replace(',', '.'); else x = x.replace(/,/g, ''); const n = parseFloat(x); return isFinite(n) ? n : null; };
function importSheet(fd) {
  const raw = (fd.get('data') || '').trim(); if (!raw) return { error: 'Pega la tabla de gastos copiada desde tu hoja.' };
  const rows = raw.split(/\r?\n/).map(l => l.split(l.includes('\t') ? '\t' : (l.includes(';') ? ';' : ','))).filter(r => r.some(c => c.trim()));
  let hi = -1, cols = {};
  for (let i = 0; i < Math.min(rows.length, 6) && hi < 0; i++) { const m = {}; rows[i].forEach((c, j) => { const t = normTxt(c).slice(0, 3); let idx = MONTH_KEYS.indexOf(t); if (idx < 0) idx = MONTH_EN.indexOf(t); if (idx >= 0) m[j] = idx; }); if (Object.keys(m).length >= 2) { hi = i; cols = m; } }
  if (hi < 0) return { error: 'No se encontró la fila de los meses. Asegúrate de copiar también los encabezados (Ene, Feb, Mar…).' };
  const year = +fd.get('year') || +TODAY.slice(0, 4), mode = fd.get('mode'), cur = fd.get('currency'); // corrección v10: antes el año estaba fijo en 2026
  const res = { rows: 0, cells: 0, periods: new Set(), unmatched: [] };
  const newEntries = [];
  rows.slice(hi + 1).forEach(r => {
    const label = (r.find((c, j) => cols[j] == null && c.trim() && parseAmount(c) == null) || '').trim();
    if (!label || /^total/i.test(normTxt(label))) return;
    const t = normTxt(label); let cat = (ALL_CATS().find(c => normTxt(c.label) === t) || {}).id;
    if (!cat) { const rule = CAT_RULES.find(([re]) => re.test(t)); cat = rule ? rule[1] : 'otros'; if (!rule) res.unmatched.push(label); }
    let any = false;
    Object.entries(cols).forEach(([j, mi]) => { const v = parseAmount(r[j]); const p = `${year}-${String(mi + 1).padStart(2, '0')}`; if (v == null || v === 0 || !ALL_PERIODS.includes(p)) return;
      any = true; res.cells++; res.periods.add(p);
      if (mode === 'BUDGET') { const usd = cur === 'VES' ? v * (toUsd(db, 1, 'VES', p + '-01') || 0) : v; const key = p + '|' + cat; budgetOverrides[key] = (res.seen && res.seen[key] ? budgetOverrides[key] : 0) + usd; (res.seen = res.seen || {})[key] = true; }
      else newEntries.push({ id: 'sh-' + hashStr(label + p).toString(36), period: p, category: cat, concept: label, amount: v, currency: cur, source: 'hoja' }); });
    if (any) res.rows++;
  });
  if (!res.cells) return { error: 'No se encontraron montos en la tabla. Revisa que las celdas tengan números.' };
  if (mode === 'REAL') {
    ensureExpenseState();
    expenseEntries = expenseEntries.filter(e => !(res.periods.has(e.period) && (e.source === 'hoja' || (fd.get('replace') && !e.source))));
    expenseEntries.push(...newEntries); saveExpenses();
  } else { store.set('budget_over_v1', budgetOverrides); bumpData(); }
  return res;
}
function ensureExpenseState() { if (!expenseEntries) expenseEntries = db.expenses.map(({ organizationId, ...e }) => e); }
function saveExpenses() { store.set('expenses_v2', expenseEntries); rebuild(); bumpData(); }


/* ====================== MODALES Y ACCIONES ====================== */
function nowStamp() { const d = new Date(); return d.toLocaleDateString('es') + ' ' + d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }); }
// Registro de auditoría: fecha, hora, usuario, rol, módulo y acción. Cada entrada queda encadenada
// (hash) con la anterior para detectar si alguien la altera fuera del tablero.
function logAudit(text, module) {
  const d = new Date(); const prev = state.audit.find(a => a.h);
  const e = { id: 'au' + d.getTime().toString(36) + Math.random().toString(36).slice(2, 6), ts: d.toISOString(),
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    time: d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
    user: typeof auditUser === 'function' ? auditUser() : 'Sin sesión', role: ROLES[state.role], module: module || state.module || 'sistema', action: text,
    at: nowStamp(), text };
  e.h = hashStr((prev ? prev.h : '') + e.ts + e.user + e.module + e.action).toString(36);
  state.audit.unshift(e);
  if (state.audit.length > AUDIT_MAX) { // v10.1: al recortar se guarda el eslabón anterior para que la cadena siga verificable
    const dropped = state.audit.slice(AUDIT_MAX), link = dropped.find(a => a.h);
    if (link) { auditAnchor = link.h; store.set('audit_anchor_v1', auditAnchor); }
    state.audit = state.audit.slice(0, AUDIT_MAX);
  }
  store.set('audit', state.audit);
}
function toast(msg, tone) { const t = document.getElementById('toast'); if (!t) return; t.textContent = msg; t.classList.toggle('is-bad', tone === 'bad'); t.setAttribute('role', tone === 'bad' ? 'alert' : 'status'); t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), tone === 'bad' ? 9000 : 3200); }
let lastFocus = null, modalT = 0;
const reduceMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
function openModal(html) {
  const m = document.getElementById('modal'); if (m.hidden || m.classList.contains('is-closing')) lastFocus = document.activeElement;
  clearTimeout(modalT); m.classList.remove('is-closing'); if (typeof closeMenu === 'function') closeMenu(false);
  m.querySelector('.modal-body').innerHTML = html; m.hidden = false;
  const f = m.querySelector('input:not([type=hidden]),select,textarea,button:not(.modal-x)'); (f || m.querySelector('.modal-x')).focus();
}
// Cierre con animación corta: el modal se desvanece y luego se oculta (si se abre otro antes, se cancela)
function closeModal() {
  const m = document.getElementById('modal');
  if (!m.hidden) { m.classList.add('is-closing'); clearTimeout(modalT); modalT = setTimeout(() => { m.hidden = true; m.classList.remove('is-closing'); }, reduceMotion() ? 0 : 190); }
  if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
}

function remindModal(invId) {
  const inv = db.invoices.find(i => i.id === invId); const c = db.clients.find(c => c.id === inv.clientId); const cd = clientDefs.find(x => x.id === inv.clientId) || {};
  const bal = invBalance(db, inv, addDays(D(TODAY), 1)); const usd = money(bal || invoiceUsd(db, inv), 2);
  const tel = (cd.opt && cd.opt.tel) || '', mail = (cd.opt && cd.opt.email) || '';
  openModal(`<h2 id="modal-t">Enviar recordatorio de pago</h2>
    <p class="muted">${esc(c.name)} · factura ${esc(inv.num || inv.id)} · ${bal && bal < invoiceUsd(db, inv) - 0.01 ? 'saldo ' : ''}${usd}</p>
    <form data-form="remind" data-inv="${esc(inv.id)}">
      <fieldset class="radios"><legend>Canal</legend>
        <label><input type="radio" name="ch" value="WhatsApp" ${tel || !mail ? 'checked' : ''}> WhatsApp</label>
        <label><input type="radio" name="ch" value="Correo" ${!tel && mail ? 'checked' : ''}> Correo</label></fieldset>
      <div class="fgrid"><label class="fld"><span>WhatsApp del cliente</span><input name="tel" maxlength="30" inputmode="tel" value="${esc(tel)}" placeholder="0412-000-0000"></label><label class="fld"><span>Correo del cliente</span><input name="mail" type="email" maxlength="80" value="${esc(mail)}" placeholder="cliente@empresa.com"></label></div>
      <label class="fld"><span>Mensaje</span><textarea name="msg" rows="5">Hola, equipo de ${esc(c.name)}. Te recordamos que la factura ${esc(inv.num || inv.id)} por ${usd} ${inv.dueDate < TODAY ? 'venció' : 'vence'} el ${fmtDate(inv.dueDate)}. Puedes pagarla por Binance, PayPal, Zelle, en efectivo o en bolívares (Pago Móvil o transferencia a la tasa del día). Envíanos el comprobante por aquí. Si ya la pagaste, ignora este mensaje. ¡Gracias!</textarea></label>
      <p class="form-err" hidden></p>
      <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Abrir y enviar <span class="cta-dot">${I.arrow}</span></button></div>
    </form>`);
}
const PAUSE_REASONS = { CLIENT_REQUEST: 'Solicitud del cliente', MAINTENANCE: 'Mantenimiento o migración', OTHER: 'Otro motivo' };
function pauseModal(clientId) {
  const c = clientDefs.find(x => x.id === clientId);
  openModal(`<h2 id="modal-t">Pausar a ${esc(c.name)}</h2>
    <p class="muted">Durante la pausa el cliente no tiene servicio y esos días no se facturan. Para pausar por falta de pago usa el corte del día 5 en Cobranza y corte.</p>
    <form data-form="pause" data-id="${esc(c.id)}" novalidate><div class="fgrid">
      <label class="fld"><span>Motivo</span><select name="reason">${opts(PAUSE_REASONS, 'CLIENT_REQUEST')}</select></label>
      <label class="fld"><span>Fecha de inicio</span><input type="date" name="start" value="${state.period}-15"></label>
      <label class="fld"><span>Fecha de reanudación prevista (opcional)</span><input type="date" name="end"></label>
      <label class="fld span2"><span>Nota</span><input name="note" maxlength="140" placeholder="Ej. Vacaciones colectivas"></label></div>
      <p class="form-err" hidden></p>
      <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-danger">Pausar cliente</button></div></form>`);
}
function resumeModal(clientId) {
  const lastDay = addDays(monthEnd(state.period), -1);
  const pz = pausedOn(db, clientId, lastDay); const c = db.clients.find(x => x.id === clientId);
  if (pz && pz.source === 'CUT') return payModal(pz.invoiceId, `${c.name} está en pausa por falta de pago. Para reanudarlo, registra el pago de la factura ${pz.invoiceId}.`);
  openModal(`<h2 id="modal-t">Reanudar a ${esc(c.name)}</h2><p class="muted">En pausa desde el ${fmtDate(pz.start)} · ${esc(PAUSE_REASONS[pz.reason] || '')}</p>
    <form data-form="resume" data-id="${esc(clientId)}" data-pause="${esc(pz.id)}" novalidate><label class="fld"><span>Fecha de reanudación</span><input type="date" name="end" value="${esc(isoD(addDays(D(pz.start), 1)) > state.period + '-28' ? isoD(addDays(D(pz.start), 1)) : state.period + '-28')}"></label>
    <p class="form-err" hidden></p>
    <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Reanudar cliente <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}
/* v10 · Registrar un pago: el cliente pudo pagar en Binance, PayPal, Zelle, efectivo o bolívares.
   En bolívares se escribe el monto en Bs y a qué dólar se cambió (BCV, Binance, PayPal, Zelle, efectivo u otra tasa):
   el sistema calcula cuántos dólares fueron, los compara con la factura y deja el registro en la auditoría.
   Si lo recibido no alcanza para el total, queda como abono parcial (la factura sigue por cobrar con su saldo). */
function payModal(invId, intro, preset = {}) {
  const inv = db.invoices.find(i => i.id === invId); if (!inv) return toast('No encontré esa factura.');
  const c = db.clients.find(x => x.id === inv.clientId);
  const total = invTotal(inv), paid = invPaidUsd(inv.id), due = invDue(inv);
  const ps = invPagos(inv.id); const pr = payRefs[inv.id] || {};
  const defDate = preset.date || (TODAY < inv.issueDate ? inv.issueDate : TODAY);
  const m0 = preset.method || (ps.length ? ps[ps.length - 1].method : (PM[pr.method] ? pr.method : 'BINANCE'));
  const amt0 = due > 0 ? due : total;
  const bcv = rateOn('BCV', defDate), bin = rateOn('BINANCE', defDate), best = cobroRate(defDate);
  const rt0 = preset.rateType || (best ? best.type : 'BINANCE');
  const tile = m => `<label class="pm-tile" style="--pm:${PM[m].color}"><input type="radio" name="method" value="${esc(m)}" ${m === m0 ? 'checked' : ''}><span class="pm-ic">${pmIcon(m, 22)}</span><b>${PM[m].label}</b><small>${PM[m].cur === 'VES' ? 'Bs' : PM[m].cur}</small></label>`;
  const rateChip = (k) => `<label class="rate-chip"><input type="radio" name="rateType" value="${esc(k)}" ${k === rt0 ? 'checked' : ''}><span>${RATE_SHORT[k]}</span></label>`;
  const hist = ps.length ? `<div class="pay-hist"><p class="pay-hist-t">Pagos registrados de esta factura</p><ul>${ps.map(x => `<li><span class="pm-chip" style="--pm:${(PM[x.method] || PM.CASH).color}">${pmIcon(x.method, 12)}${esc((PM[x.method] || { label: 'Pago' }).label)}</span><span class="ph-d">${fmtDate(x.date)}<small>${esc(payDetail(x))}</small></span><b>${money(+x.usd, 2)}</b><button type="button" class="icon-btn" data-pago-del="${esc(x.id)}" aria-label="Eliminar este pago">${I.trash}</button></li>`).join('')}</ul></div>` : '';
  openModal(`<h2 id="modal-t">Registrar pago</h2>${intro ? `<p>${esc(intro)}</p>` : ''}
    <div class="pay-head"><div><b>${esc(c ? c.name : '—')}</b><small>Factura ${esc(inv.num || inv.id)} · emitida el ${fmtDate(inv.issueDate)} · vence el ${fmtDate(inv.dueDate)}</small></div>
      <div class="pay-tot"><span>Total</span><b>${money(total, 2)}</b>${paid > 0.004 ? `<small>Abonado ${money(paid, 2)} · saldo <b>${money(due, 2)}</b></small>` : ''}</div></div>
    ${hist}
    <form data-form="pay" data-inv="${esc(inv.id)}" data-due="${esc(due)}" data-total="${esc(total)}" novalidate>
      <fieldset class="pm-tiles" role="radiogroup" aria-label="¿Cómo pagó el cliente?"><legend class="sr-only">¿Cómo pagó el cliente?</legend>${Object.keys(PM).map(tile).join('')}</fieldset>
      <p class="pm-hint muted small" data-pm-hint>${esc(PM[m0].hint)}</p>
      <div class="fgrid">
        <label class="fld" data-pm="BINANCE"><span>Tipo de operación</span><select name="binType">${opts(BIN_TYPES, 'PAY')}</select></label>
        <label class="fld" data-pm="VES"><span>Canal</span><select name="bsChannel">${opts(BS_CHANNELS, 'PAGOMOVIL')}</select></label>
        <label class="fld" data-pm="VES"><span>Banco</span><input name="bank" maxlength="40" placeholder="Ej. Banesco, Mercantil, Venezuela"></label>
        <label class="fld" data-pm="VES"><span>Monto recibido en bolívares *</span><input name="amountBs" inputmode="decimal" autocomplete="off" placeholder="Ej. 46.400,00" value="${esc(preset.amountBs || '')}"></label>
        <div class="fld span2" data-pm="VES"><span>¿A qué dólar lo cambiaste? *</span><div class="rate-chips" role="radiogroup" aria-label="Tipo de dólar">${Object.keys(RATE_TYPES).map(rateChip).join('')}</div></div>
        <label class="fld" data-pm="VES"><span>Tasa usada (Bs por US$) *</span><input name="rate" inputmode="decimal" autocomplete="off" value="${esc(preset.rate || (best ? rateIn(best.rate) : bin ? num(bin.rate, 2) : ''))}" placeholder="Ej. 200,00"><small class="muted" data-rate-src>${best ? `La más alta entre BCV y Binance: ${RATE_SHORT[best.type]} del ${fmtDate(best.date)}` : bin ? (bin.monthly ? 'Tasa Binance del mes' : 'Tasa del día ' + fmtDate(bin.date)) : 'Escríbela o regístrala en Ajustes → Tasas del día'}</small></label>
        <label class="fld" data-pm="VES"><span>Tasa BCV del día (referencia)</span><input name="rateBcv" inputmode="decimal" autocomplete="off" value="${esc(bcv ? num(bcv.rate, 2) : '')}" placeholder="Opcional"><small class="muted">Para comparar y para la factura fiscal</small></label>
        <label class="fld" data-pm="BINANCE PAYPAL ZELLE CASH"><span data-amt-l>Monto recibido (US$) *</span><input name="amount" inputmode="decimal" autocomplete="off" value="${esc(num(preset.amount != null ? preset.amount : amt0, 2))}"></label>
        <label class="fld" data-pm="PAYPAL BINANCE"><span>Comisión de la plataforma (US$)</span><input name="fee" inputmode="decimal" autocomplete="off" value="" placeholder="0,00"><small class="muted" data-fee-src></small></label>
        <label class="fld" data-pm="PAYPAL ZELLE"><span>Titular o correo de quien paga</span><input name="payer" maxlength="80" placeholder="Nombre o correo"></label>
        <label class="fld" data-pm="CASH"><span>¿Quién lo recibió?</span><input name="receiver" maxlength="60" placeholder="Nombre de quien recibió el efectivo"></label>
        <label class="fld"><span>Fecha del pago *</span><input type="date" name="date" value="${esc(defDate)}" max="${TODAY}" min="${inv.issueDate}"></label>
        <label class="fld"><span data-ref-l>${esc(PM[m0].ref)} *</span><span class="ref-row"><input name="ref" maxlength="40" autocomplete="off" value="${esc(preset.ref || '')}" placeholder="Tal como aparece en el comprobante"><button type="button" class="btn btn-sm" data-ref-gen="1" data-pm="CASH">Generar</button></span></label>
        <label class="fld span2"><span>Nota (opcional)</span><input name="note" maxlength="160" placeholder="Ej. Pagó por adelantado dos meses"></label>
      </div>
      <div class="pay-sum" data-pay-sum aria-live="polite"></div>
      <div class="pay-settle" data-pay-settle hidden>
        <label class="rad"><input type="radio" name="settle" value="abono" checked><span><b>Abono parcial</b><small>La factura sigue por cobrar con el saldo que falta.</small></span></label>
        <label class="rad"><input type="radio" name="settle" value="saldar"><span><b>Saldar la factura</b><small>Se da por pagada y la diferencia queda registrada como diferencia de cobro.</small></span></label>
      </div>
      <p class="muted small">La referencia es obligatoria y no puede repetirse. Todo queda en el registro de auditoría.</p><p class="form-err" hidden></p>
      <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Registrar pago <span class="cta-dot">${I.arrow}</span></button></div></form>`);
  const f = document.querySelector('#modal form[data-form="pay"]'); if (f) { if (preset.rate) { f._lastRt = preset.rateType || 'BINANCE'; f._presetRate = true; f._rtManual = true; } payFormSync(f, true); } // la tasa que dictaste no se reemplaza por la registrada
}
// Muestra los campos del método elegido y recalcula el equivalente en US$, la comisión y la diferencia con la factura
function payFormSync(f, first) {
  const m = (f.querySelector('input[name=method]:checked') || {}).value || 'BINANCE';
  f.querySelectorAll('[data-pm]').forEach(el => { el.hidden = !el.dataset.pm.split(' ').includes(m); });
  const hint = f.querySelector('[data-pm-hint]'); if (hint) hint.textContent = PM[m].hint;
  const refL = f.querySelector('[data-ref-l]'); if (refL) refL.textContent = PM[m].ref + ' *';
  const amtL = f.querySelector('[data-amt-l]'); if (amtL) amtL.textContent = m === 'BINANCE' ? 'Monto recibido (USDT) *' : m === 'PAYPAL' ? 'Monto bruto que pagó el cliente (US$) *' : 'Monto recibido (US$) *';
  const due = +f.dataset.due, total = +f.dataset.total, ref = due > 0 ? due : total;
  // comisión sugerida (PayPal: % + fijo de Ajustes) — solo si el campo está vacío o fue calculado por el sistema
  const amount = parseAmount(f.amount.value) || 0, feeIn = f.fee;
  if (m === 'PAYPAL' || m === 'BINANCE') {
    const cfg = payFees[m] || { pct: 0, fixed: 0 }, sug = amount > 0 && (cfg.pct || cfg.fixed) ? round2(amount * cfg.pct / 100 + cfg.fixed) : 0;
    if (feeIn && (first || feeIn.dataset.auto === '1' || feeIn.value === '')) { feeIn.value = sug ? num(sug, 2) : ''; feeIn.dataset.auto = '1'; }
    const src = f.querySelector('[data-fee-src]'); if (src) src.textContent = cfg.pct || cfg.fixed ? `Sugerida: ${num(cfg.pct, 2)}% + ${money(cfg.fixed, 2)} (cámbiala en Ajustes)` : 'Sin comisión configurada';
  }
  // tasa sugerida para el tipo de dólar elegido
  let rt = (f.querySelector('input[name=rateType]:checked') || {}).value || 'BINANCE';
  const pDate = f.date.value || TODAY, best = m === 'VES' && !f._rtManual ? cobroRate(pDate) : null;
  if (best && best.type !== rt && f._lastRt == null) { const chip = f.querySelector(`input[name=rateType][value="${best.type}"]`); if (chip) { chip.checked = true; rt = best.type; } }
  if (m === 'VES' && f._lastRt !== rt) { const r = rateOn(rt, pDate); const src = f.querySelector('[data-rate-src]'); if (r) { f.rate.value = r.monthly ? num(r.rate, 2) : rateIn(r.rate); const age = r.date ? Math.round((D(pDate) - D(r.date)) / DAY) : null; if (src) src.textContent = r.monthly ? 'Promedio Binance del mes: confírmala con la de hoy' : `${best && best.type === rt ? 'La más alta entre BCV y Binance: ' : 'Tasa '}${RATE_SHORT[rt]} del ${fmtDate(r.date)}${age > 2 ? ` · hace ${age} días: confírmala` : ''}`; } else if (!first) { if (src) src.textContent = `Sin tasa ${RATE_SHORT[rt]} registrada: escríbela`; } f._lastRt = rt; }
  if (m === 'VES' && SRV && SRV.quote && pDate === TODAY && !f._rtManual && !f._quoteAsked && !f._presetRate) payServerQuote(f, ref);
  const q = payQuote(f);
  const sum$ = f.querySelector('[data-pay-sum]'), st = f.querySelector('[data-pay-settle]');
  if (!q.usd) { sum$.innerHTML = `<div class="ps-row"><span>Escribe el monto${m === 'VES' ? ' en bolívares y la tasa' : ''} para ver el equivalente.</span></div>`; st.hidden = true; return q; }
  const diff = round2(q.usd - ref), tol = Math.max(0.05, ref * 0.002);
  const tone = Math.abs(diff) <= tol ? 'ok' : diff < 0 ? 'warn' : 'info';
  const label = Math.abs(diff) <= tol ? (due > 0 && due < total ? 'Completa el saldo' : 'Pago completo') : diff < 0 ? `Falta ${money(-diff, 2)}` : `Sobran ${money(diff, 2)} (saldo a favor)`;
  sum$.innerHTML = `<div class="ps-main"><span>Equivale a</span><b>${money(q.usd, 2)}</b><em class="ps-st ps-${tone}">${label}</em></div>
    <div class="ps-rows">${m === 'VES' ? `<div class="ps-row"><span>${moneyBs(q.bs)} ÷ ${fmtRate(q.rate)} (dólar ${RATE_SHORT[rt]})</span><b>${money(q.usd, 2)}</b></div>${q.bcv ? `<div class="ps-row"><span>A tasa BCV (${fmtRate(q.bcv)}) serían</span><b>${money(q.usdBcv, 2)}</b></div><div class="ps-row"><span>Diferencia entre tasas</span><b class="${q.usd - q.usdBcv < 0 ? 'txt-bad' : 'txt-ok'}">${q.usd - q.usdBcv >= 0 ? '+' : '−'}${money(Math.abs(q.usd - q.usdBcv), 2)}</b></div>` : ''}` : ''}
    ${q.fee ? `<div class="ps-row"><span>Comisión de ${PM[m].label}</span><b class="txt-bad">−${money(q.fee, 2)}</b></div><div class="ps-row"><span>Neto que entra a la cuenta</span><b>${money(q.usd - q.fee, 2)}</b></div>` : ''}
    <div class="ps-row"><span>${due > 0 && due < total ? 'Saldo pendiente de la factura' : 'Total de la factura'}</span><b>${money(ref, 2)}</b></div></div>`;
  st.hidden = !(diff < -tol);
  return q;
}
// Con servidor: pide la cotización "cobrar en bolívares" (la más alta entre BCV y Binance compra) y la congela 15 minutos.
// El cobro guarda el número de cotización si usas esa tasa tal cual (queda en el registro con todas las candidatas).
function payServerQuote(f, usd) {
  f._quoteAsked = true;
  SRV.quote('COBRO_BS', usd).then(q => {
    if (!document.body.contains(f) || f._rtManual || (f.date.value || TODAY) !== TODAY) return;
    const type = q.fuente === 'BCV' ? 'BCV' : 'BINANCE'; const chip = f.querySelector(`input[name=rateType][value="${type}"]`); if (chip) chip.checked = true;
    f._quote = q; f._lastRt = type; f.rate.value = rateIn(q.tasa);
    const src = f.querySelector('[data-rate-src]'); const hm = new Date(q.vence).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Caracas' });
    if (src) src.innerHTML = `<span class="rate-lock">${svgI('lock', 12)} Congelada hasta las ${esc(hm)}</span> · la más alta entre ${q.candidatas.map(c => `${esc(c.fuente === 'BCV' ? 'BCV' : 'Binance compra')} ${esc(rateIn(c.tasa))}`).join(' y ')}`;
    payFormSync(f);
  }).catch(() => { /* sin tasas del servidor: queda la sugerencia local */ });
}
function payQuote(f) {
  const m = (f.querySelector('input[name=method]:checked') || {}).value || 'BINANCE';
  if (m === 'VES') { const bs = parseAmount(f.amountBs.value) || 0, rate = parseAmount(f.rate.value) || 0, bcv = parseAmount(f.rateBcv.value) || 0; const usd = bs > 0 && rate > 0 ? round2(bs / rate) : 0; return { m, bs, rate, bcv, usd, usdBcv: bcv > 0 ? round2(bs / bcv) : 0, fee: 0, amount: bs }; }
  const amount = parseAmount(f.amount.value) || 0, fee = (m === 'PAYPAL' || m === 'BINANCE') ? (parseAmount(f.fee.value) || 0) : 0;
  return { m, amount, usd: round2(amount), fee: round2(fee) };
}
const CURRENCIES = { USD: 'USD', USDT: 'USDT', VES: 'Bolívares (VES)' };
function invModal(id) {
  const x = id ? state.investments.find(v => v.id === id) : null;
  openModal(`<h2 id="modal-t">${x ? 'Editar inversión' : 'Registrar inversión'}</h2>
    <form data-form="inv" data-id="${esc(x ? x.id : '')}" novalidate><div class="fgrid">
      <label class="fld span2"><span>Concepto</span><input name="concept" maxlength="120" value="${x ? esc(x.concept) : ''}" placeholder="Ej. Desarrollo del módulo de contratos"></label>
      <label class="fld"><span>Categoría</span><select name="category">${opts(INVEST_CATS, x ? x.category : 'publicidad')}</select></label>
      <label class="fld"><span>Fecha</span><input type="date" name="date" value="${esc(x ? x.date : state.period + '-15')}"></label>
      <label class="fld"><span>Monto</span><input type="number" name="amount" min="0" step="0.01" value="${esc(x ? x.amount : '')}"></label>
      <label class="fld"><span>Moneda</span><select name="currency">${opts(CURRENCIES, x ? x.currency : 'USD')}</select></label></div>
      <p class="form-err" hidden></p>
      <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">${x ? 'Guardar cambios' : 'Registrar inversión'} <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}
const CHANNELS = { WEB: 'Página web', INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', LINKEDIN: 'LinkedIn', TIKTOK: 'TikTok', WHATSAPP: 'WhatsApp', REFERRAL: 'Referido', AFFILIATE: 'Afiliado', OTHER: 'Otro' };
const opts = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
const planPrice = p => { const x = catalog.find(c => c.plan === p); return x && +x.price > 0 ? +x.price : PLANS[p].fee; };
const planOpts = sel => PLAN_ORDER.map(p => `<option value="${esc(p)}" ${p === sel ? 'selected' : ''}>${PLANS[p].label} · ${money(planPrice(p))}/mes</option>`).join('');
const recProducts = () => catalog.filter(p => p.recurring && !p.plan);
const nonRecProducts = () => catalog.filter(p => !p.recurring);
function clientModal(id) {
  const c = id ? clientDefs.find(x => x.id === id) : null;
  const last = c && c.segs.length ? c.segs[c.segs.length - 1] : null;
  const planOpen = last && !last[2];
  const pz = c ? db.pauses.filter(pp => pp.clientId === c.id).sort((a, b) => a.start.localeCompare(b.start)) : [];
  const pzDays = pp => Math.max(0, Math.round(((pp.end ? D(pp.end) : D(TODAY)) - D(pp.start)) / DAY));
  const pauseHist = c ? `<div class="hist"><h3>Historial de pausas · ${sum(pz, pzDays)} días en total</h3>${pz.length ? `<ol>${pz.map(pp => `<li><b>${pp.source === 'CUT' ? 'Corte por falta de pago' : esc(PAUSE_REASONS[pp.reason] || 'Pausa')}</b> desde ${fmtDate(pp.start)}${pp.end ? ` hasta ${fmtDate(pp.end)}` : ' · sigue en pausa'} · ${pzDays(pp)} días${pp.note ? ` · ${esc(pp.note)}` : ''}</li>`).join('')}</ol>` : '<p class="muted small">Nunca ha estado en pausa.</p>'}</div>` : '';
  const hist = c && c.segs.length ? `<div class="hist"><h3>Historial de planes</h3><ol>${c.segs.map(sg => `<li><span class="sw" style="background:${PLAN_COLOR[sg[0]]}"></span><b>${PLANS[sg[0]].label}</b> desde ${fmtDate(sg[1])}${sg[2] ? ` hasta ${fmtDate(sg[2])}` : ' · vigente'}</li>`).join('')}</ol></div>` : '';
  const dflt = TODAY;
  let planBlock;
  if (!c) planBlock = `<div class="fgrid"><label class="fld"><span>Plan</span><select name="plan"><option value="">Sin plan (solo servicios)</option>${planOpts('PLATA')}</select></label><label class="fld"><span>Fecha de inicio</span><input type="date" name="planDate" value="${esc(dflt)}"></label></div>`;
  else if (planOpen) planBlock = `<div class="fgrid"><label class="fld"><span>Plan</span><select name="plan">${planOpts(last[0])}</select></label>
      <label class="fld"><span>Fecha efectiva del cambio</span><input type="date" name="planDate" value="${esc(dflt)}"></label>
      <label class="fld span2 chk"><input type="checkbox" name="churn"> Dar de baja al cliente (cierra el plan y todos sus servicios recurrentes)</label>
      <label class="fld"><span>Fecha de baja</span><input type="date" name="churnDate" value="${esc(TODAY)}"></label></div>`;
  else planBlock = `<div class="fgrid">${last ? `<p class="span2 muted">Plan dado de baja el ${fmtDate(last[2])}.</p>` : '<p class="span2 muted">Este cliente no tiene plan Ágora.</p>'}
      <label class="fld span2 chk"><input type="checkbox" name="reactivate"> ${last ? 'Reactivar con un plan' : 'Agregar un plan'}</label>
      <label class="fld"><span>Plan</span><select name="plan">${planOpts(last ? last[0] : 'PLATA')}</select></label>
      <label class="fld"><span>Desde</span><input type="date" name="planDate" value="${esc(dflt)}"></label></div>`;
  const svcRows = recProducts().map(p => {
    const open = c ? c.services.find(v => v.productId === p.id && !v.end) : null;
    return `<div class="svc-row"><label class="chk"><input type="checkbox" name="svc_${p.id}_on" ${open ? 'checked' : ''}> <span>${esc(p.short)}</span></label>
      <label class="fld"><span>Precio mensual (USD)</span><input type="number" min="0" step="0.01" name="svc_${p.id}_price" value="${esc(open ? open.price : (p.price || ''))}"></label>
      <label class="fld"><span>${open ? `Desde ${fmtDate(open.start)} · cambio o fin el` : 'Desde'}</span><input type="date" name="svc_${p.id}_date" value="${esc(dflt)}"></label></div>`;
  }).join('');
  const sales = c ? c.sales.slice().sort((a, b) => b.date.localeCompare(a.date)) : [];
  const saleList = sales.length ? `<ul class="sale-list">${sales.map(t => `<li><label class="chk"><input type="checkbox" name="sale_del_${t.id}"> Quitar</label><span><b>${esc(prodOf(t.productId).short)}</b> · ${fmtDate(t.date)} · ${num(t.amount, 2)} ${t.currency}${t.invoiceRef ? ` · factura ${esc(t.invoiceRef)}` : ''}</span></li>`).join('')}</ul>` : '<p class="muted small">Sin ventas no recurrentes registradas.</p>';
  const newSale = `<div class="fgrid sale-new"><label class="fld"><span>Agregar venta</span><select name="ns_product"><option value="">—</option>${nonRecProducts().map(p => `<option value="${esc(p.id)}">${esc(p.short)}${p.price ? ` · USD ${p.price}` : ''}</option>`).join('')}</select></label>
    <label class="fld"><span>Fecha</span><input type="date" name="ns_date" value="${esc(dflt)}"></label>
    <label class="fld"><span>Monto</span><input type="number" min="0" step="0.01" name="ns_amount" placeholder="Precio del catálogo"></label>
    <label class="fld"><span>Moneda</span><select name="ns_currency">${opts(CURRENCIES, 'USD')}</select></label></div>`;
  openModal(`<h2 id="modal-t">${c ? 'Editar cliente' : 'Nuevo cliente'}</h2>
    <form data-form="client" data-id="${esc(c ? c.id : '')}" novalidate>
      <div class="fgrid">
        <label class="fld span2"><span>Nombre del cliente</span><input name="name" required maxlength="80" value="${c ? esc(c.name) : ''}"></label>
        <label class="fld"><span>Sector</span><input name="sector" maxlength="60" value="${c ? esc(c.sector) : ''}"></label>
        <label class="fld"><span>Canal de adquisición</span><select name="channel">${opts(CHANNELS, c ? c.channel : 'WEB')}</select></label>
        <label class="fld"><span>Salud del cliente (1–10)</span><input name="health" type="number" min="1" max="10" step="1" value="${esc(c ? c.health : 7)}"></label>
        <label class="fld"><span>Usuarios en uso</span><input name="seats" type="number" min="0" step="1" value="${esc(c ? c.seats : 1)}"></label>
        <label class="fld"><span>Costo de adquisición estimado (USD)</span><input name="cac" type="number" min="0" step="1" value="${esc(c ? c.cac : 100)}"></label>
        <label class="fld"><span>Moneda de facturación</span><select name="currency">${opts(CURRENCIES, c && c.opt && c.opt.currency || 'USD')}</select></label>
      </div>
      <fieldset class="fset"><legend>Asesor que lo vendió</legend><div class="fgrid"><label class="fld"><span>Asesor</span><select name="asesorId"><option value="">Sin asesor</option>${asesores.filter(a => a.modalidad !== 'IMPLEMENTACION').map(a => `<option value="${esc(a.id)}" ${c && c.opt && c.opt.asesorId === a.id ? 'selected' : ''}>${esc(a.nombre)}</option>`).join('')}</select></label><p class="muted small span2">Sus ventas generan comisión para esta persona en el módulo Comisiones.</p></div></fieldset>
      <fieldset class="fset"><legend>Datos para la factura</legend><div class="fgrid">
        <label class="fld"><span>RIF o cédula</span><input name="rif" maxlength="20" value="${c && c.opt && c.opt.rif ? esc(c.opt.rif) : ''}" placeholder="J-00000000-0"></label>
        <label class="fld"><span>Teléfono</span><input name="tel" maxlength="30" value="${c && c.opt && c.opt.tel ? esc(c.opt.tel) : ''}" placeholder="+58 4XX-XXX-XXXX"></label>
        <label class="fld span2"><span>Dirección fiscal</span><input name="dir" maxlength="160" value="${c && c.opt && c.opt.dir ? esc(c.opt.dir) : ''}"></label>
        <label class="fld span2"><span>Correo</span><input name="email" type="email" maxlength="80" value="${c && c.opt && c.opt.email ? esc(c.opt.email) : ''}"></label>
      </div></fieldset>
      ${hist}${pauseHist}${c ? clientEventsHtml(c.id) : ''}
      <fieldset class="fset"><legend>Plan Ágora (recurrente)</legend>${planBlock}</fieldset>
      <fieldset class="fset"><legend>Servicios recurrentes (se cobran cada mes)</legend><div class="svc-list">${svcRows}</div></fieldset>
      <fieldset class="fset"><legend>Servicios no recurrentes (se cobran una vez)</legend>${saleList}${newSale}</fieldset>
      <p class="form-err" hidden></p>
      <div class="modal-acts">
        ${c && canDeleteClients() ? `<button type="button" class="btn btn-danger mr-auto" data-del-client="${esc(c.id)}">Eliminar cliente</button>` : ''}
        <button type="button" class="btn btn-ghost" data-act="close">Cancelar</button>
        <button type="submit" class="btn btn-cta">${c ? 'Guardar cambios' : 'Crear cliente'} <span class="cta-dot">${I.arrow}</span></button>
      </div>
    </form>`);
}
function saveClient(f) {
  const fd = new FormData(f); const err = f.querySelector('.form-err');
  const fail = m => { err.textContent = m; err.hidden = false; return false; };
  const name = (fd.get('name') || '').trim();
  if (!name) return fail('Escribe el nombre del cliente.');
  const id = f.dataset.id;
  if (clientDefs.some(c => c.id !== id && c.name.toLowerCase() === name.toLowerCase())) return fail('Ya existe un cliente con ese nombre.');
  const health = +fd.get('health'); if (!(health >= 1 && health <= 10)) return fail('La salud del cliente va de 1 a 10.');
  const seats = +fd.get('seats'); if (!(seats >= 0)) return fail('Los usuarios en uso no pueden ser negativos.');
  const cac = +fd.get('cac'); if (!(cac >= 0)) return fail('El costo de adquisición no puede ser negativo.');
  const inRange = d => d && d >= '2025-01-01' && d <= DATE_MAX;
  const base = { name, sector: (fd.get('sector') || '').trim() || 'Sin sector', channel: fd.get('channel'), health, seats, cac };
  const currency = fd.get('currency');
  const isNew = !id;
  const c = isNew ? { id: newClientId(), segs: [], services: [], sales: [], pauses: [], opt: {} } : clone(clientDefs.find(x => x.id === id));
  const changes = [];
  const planTouched = !isNew && ((fd.get('churn')) || (c.segs.length && !c.segs[c.segs.length - 1][2] && fd.get('plan') !== c.segs[c.segs.length - 1][0]) || fd.get('reactivate'));
  if (planTouched) c.segs.forEach(sg => { sg.length = 3; }); // desde ahora el plan de este cliente se maneja a mano
  const last = c.segs.length ? c.segs[c.segs.length - 1] : null;
  // plan
  if (isNew) {
    if (fd.get('plan')) { const d = fd.get('planDate'); if (!inRange(d)) return fail(`La fecha de inicio del plan debe estar entre 2025 y ${DATE_MAX.slice(0, 4)}.`); c.segs.push([fd.get('plan'), d]); changes.push(`plan ${PLANS[fd.get('plan')].label}`); }
  } else if (last && !last[2]) {
    if (fd.get('churn')) {
      const d = fd.get('churnDate'); if (!inRange(d) || d <= last[1]) return fail(`La fecha de baja debe ser posterior al ${fmtDate(last[1])}.`);
      last[2] = d; c.services.forEach(v => { if (!v.end && v.start < d) v.end = d; }); changes.push(`dio de baja el ${fmtDate(d)}`);
    } else if (fd.get('plan') !== last[0]) {
      const d = fd.get('planDate'); if (!inRange(d) || d <= last[1]) return fail(`La fecha del cambio de plan debe ser posterior al ${fmtDate(last[1])}.`);
      const from = last[0]; last[2] = d; c.segs.push([fd.get('plan'), d]);
      changes.push(`${PLAN_ORDER.indexOf(fd.get('plan')) > PLAN_ORDER.indexOf(from) ? 'subió de plan (upgrade)' : 'bajó de plan (downgrade)'}: de ${PLANS[from].label} a ${PLANS[fd.get('plan')].label}`);
    }
  } else if (fd.get('reactivate')) {
    const d = fd.get('planDate'); if (!inRange(d) || (last && d <= last[2])) return fail(last ? `La reactivación debe ser posterior a la baja (${fmtDate(last[2])}).` : 'Revisa la fecha del plan.');
    c.segs.push([fd.get('plan'), d]); changes.push(`${last ? 'reactivó' : 'agregó'} plan ${PLANS[fd.get('plan')].label}`);
  }
  // servicios recurrentes
  for (const p of recProducts()) {
    const on = !!fd.get(`svc_${p.id}_on`), price = +fd.get(`svc_${p.id}_price`), d = fd.get(`svc_${p.id}_date`);
    const open = c.services.find(v => v.productId === p.id && !v.end);
    if ((on && !open) || (!on && open) || (on && open && price > 0 && price !== +open.price)) c.services.forEach(v => { if (v.productId === p.id) delete v.src; });
    if (on && !open) {
      if (!(price > 0)) return fail(`Escribe el precio mensual de ${p.short}.`);
      if (!inRange(d)) return fail(`Revisa la fecha de inicio de ${p.short}.`);
      c.services.push({ id: `${c.id}_v${Date.now()}${p.id.slice(4, 7)}`, productId: p.id, price, start: d, end: null }); changes.push(`agregó ${p.short}`);
    } else if (!on && open) {
      if (!inRange(d) || d <= open.start) return fail(`La fecha de fin de ${p.short} debe ser posterior al ${fmtDate(open.start)}.`);
      open.end = d; changes.push(`canceló ${p.short}`);
    } else if (on && open && price > 0 && price !== +open.price) {
      if (!inRange(d) || d <= open.start) return fail(`El cambio de precio de ${p.short} debe ser posterior al ${fmtDate(open.start)}.`);
      open.end = d; c.services.push({ id: `${c.id}_v${Date.now()}${p.id.slice(4, 7)}`, productId: p.id, price, start: d, end: null }); changes.push(`cambió el precio de ${p.short} a ${money(price, 2)}`);
    }
  }
  // ventas no recurrentes
  const before = c.sales.length; c.sales = c.sales.filter(t => !fd.get(`sale_del_${t.id}`)); if (c.sales.length < before) changes.push(`quitó ${before - c.sales.length} venta(s)`);
  if (fd.get('ns_product')) {
    const P = prodOf(fd.get('ns_product')); const amount = fd.get('ns_amount') !== '' ? +fd.get('ns_amount') : +(P.price || 0); const d = fd.get('ns_date');
    if (!(amount > 0)) return fail(`Escribe el monto de ${P.short}.`);
    if (!inRange(d)) return fail('Revisa la fecha de la venta.');
    c.sales.push({ id: `${c.id}_t${Date.now()}`, productId: P.id, amount, currency: fd.get('ns_currency'), date: d }); changes.push(`registró ${P.short}`);
  }
  if (isNew && !c.segs.length && !c.services.length && !c.sales.length) return fail('Agrega un plan, un servicio recurrente o una venta para crear el cliente.');
  Object.assign(c, base); c.opt = { ...(c.opt || {}) }; if (currency === 'USD') delete c.opt.currency; else c.opt.currency = currency;
  ['rif', 'dir', 'email', 'tel', 'asesorId'].forEach(k => { const v = (fd.get(k) || '').trim(); if (v) c.opt[k] = v; else delete c.opt[k]; });
  if (isNew) clientDefs.push(c); else clientDefs[clientDefs.findIndex(x => x.id === id)] = c;
  if (isDeletedCli(null, name)) { deletedCli = deletedCli.filter(d => normTxt(d.name) !== normTxt(name)); store.set('deleted_cli_v1', deletedCli); }
  saveClients(); try { syncClientsToFacturero(); } catch (x) {} logAudit(`${isNew ? 'creó' : 'editó'} el cliente ${name}${changes.length ? ' (' + changes.join(', ') + ')' : ''}`);
  closeModal(); toast(isNew ? `${name} quedó creado` : `Cambios guardados en ${name}`); render();
}
function deleteClientModal(id) {
  const c = clientDefs.find(x => x.id === id);
  openModal(`<h2 id="modal-t">Eliminar cliente</h2><p>Vas a eliminar a <b>${esc(c.name)}</b> con todo su historial de suscripciones, facturas y consumo. Esto cambia las métricas de todos los meses.</p>
    <form data-form="del-client" data-id="${esc(c.id)}"><div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-danger">Eliminar cliente</button></div></form>`);
}
function importModal() {
  openModal(`<h2 id="modal-t">Importar facturas del facturero</h2>
    <ol class="steps"><li>En el facturero de Ágora, entra a <b>Respaldo en disco</b> y pulsa <b>Descargar respaldo</b>.</li><li>Selecciona aquí ese archivo <code>respaldo-facturacion-agora-…json</code>.</li></ol>
    <p class="muted small">Cada línea se cruza con el catálogo: planes y servicios mensuales entran como recurrentes; implementación, integración de canales, IA y creación de landing entran como no recurrentes. El IVA queda aparte y no suma como ingreso. Los clientes que no existan se crean.</p>
    <label class="fld"><span>Archivo de respaldo</span><input type="file" id="importFileIn" accept=".json,application/json"></label>
    <p class="form-err" hidden></p>
    <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button></div>`);
}
// Mismo criterio que el facturero: "150,00", "1.234,56", "150.00" y "1,234.56" se leen igual.
// (Antes "150.00" escrito a mano en el facturero se leía aquí como 15000.)
const parseNum = t => { let s = String(t || '').replace(/[^\d.,-]/g, ''); if (!s) return 0; const c = s.lastIndexOf(','), d = s.lastIndexOf('.');
  if (c > d) s = s.replace(/\./g, '').replace(',', '.'); else if (d > c && c !== -1) s = s.replace(/,/g, ''); else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = parseFloat(s); return isNaN(n) ? 0 : n; };
const parseDmy = t => { const x = String(t || ''); let m = x.match(/(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`; m = x.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };
function parseInvoiceHtml(html) {
  const dom = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const q = sel => dom.querySelector(sel); const tx = sel => (q(sel) ? q(sel).textContent.trim() : '');
  const lines = [...dom.querySelectorAll('#items tr')].map(tr => ({
    qty: parseNum(tr.querySelector('.qty') && tr.querySelector('.qty').textContent) || 1,
    title: tr.querySelector('.title') ? tr.querySelector('.title').textContent.trim() : '',
    price: parseNum(tr.querySelector('.price') && tr.querySelector('.price').textContent),
  })).filter(l => l.title);
  const subtotal = sum(lines, l => l.qty * l.price);
  const ivaAmt = parseNum(tx('#iva')); const rateTxt = tx('#ivaRate');
  const ivaRate = rateTxt ? parseNum(rateTxt) : (subtotal && ivaAmt ? Math.round(ivaAmt / subtotal * 100) : 0);
  return { num: tx('#invNum'), issueDate: parseDmy(tx('#fEmision')), dueDate: parseDmy(tx('#fVence')), client: tx('#cliNombre'), code: tx('#cliCode'), rif: tx('#cliRif'), lines, subtotal: round2(subtotal), ivaRate, iva: ivaAmt ? round2(ivaAmt) : round2(subtotal * ivaRate / 100) };
}
/* ====================== IMPORTACIÓN DEL FACTURERO (corregida) ======================
   Antes: cada sincronización solo AGREGABA cosas al cliente (plan, servicios, ventas) y nunca las corregía.
   Si una factura se editaba en el facturero (otra fecha, otro monto, otro producto u otro cliente), el
   tablero conservaba lo viejo y, si la nueva fecha caía en un mes sin actividad del cliente, la factura
   desaparecía de Facturación. Ahora la importación es "idempotente": se reconstruye todo lo que sale de
   las facturas desde cero, en orden de fecha, cada vez que el facturero cambia. */
function findClientFor(inv) {
  const code = inv.code && /^CLI-/i.test(inv.code) ? inv.code : null;
  return (code && clientDefs.find(x => x.opt && x.opt.cliCode === code)) || clientDefs.find(x => normTxt(x.name) === normTxt(inv.client)) || null;
}
function stripFactDerived(oldList) {
  // Marcas heredadas (facturas importadas con la versión anterior, que no traían etiqueta)
  if (!store.get('fact_derive_v2', false)) {
    const legacySvc = new Set(), legacySeg = new Set();
    (oldList || []).forEach(f => (f.lines || []).forEach((l, i) => {
      legacySvc.add(`${f.clientId}_v${hashStr(f.id + i).toString(36)}`);
      const P = catalog.find(p => p.id === l.productId); if (P && P.plan) legacySeg.add(`${f.clientId}|${P.plan}|${f.issueDate}`);
    }));
    clientDefs.forEach(c => {
      c.services.forEach(v => { if (legacySvc.has(v.id)) v.src = 'fact'; });
      c.segs.forEach(sg => { if (legacySeg.has(`${c.id}|${sg[0]}|${sg[1]}`)) sg[3] = 'fact'; });
    });
    store.set('fact_derive_v2', true);
  }
  clientDefs.forEach(c => {
    c.segs = c.segs.filter(sg => sg[3] !== 'fact');
    c.services = c.services.filter(v => v.src !== 'fact');
    c.sales = c.sales.filter(t => !t.invoiceRef);
  });
}
function rederiveFromInvoices(oldList) {
  stripFactDerived(oldList || importedInv);
  const byClient = {};
  importedInv.forEach(f => { (byClient[f.clientId] = byClient[f.clientId] || []).push(f); });
  clientDefs.forEach(c => {
    const invs = (byClient[c.id] || []).slice().sort((a, b) => a.issueDate.localeCompare(b.issueDate) || String(a.num).localeCompare(String(b.num)));
    const manualPlan = c.segs.length > 0; // lo editado a mano en Clientes manda sobre lo que dicen las facturas
    const manualSvc = new Set(c.services.map(v => v.productId));
    invs.forEach(f => {
      (f.lines || []).forEach((l, i) => {
        const P = catalog.find(p => p.id === l.productId) || { id: l.productId, recurring: false };
        l.rec = !!P.recurring;
        if (P.plan && P.recurring !== false) {
          if (manualPlan) return;
          const last = c.segs[c.segs.length - 1];
          if (!last || last[2]) c.segs.push([P.plan, f.issueDate, null, 'fact']);
          else if (last[0] !== P.plan && f.issueDate > last[1]) { last[2] = f.issueDate; c.segs.push([P.plan, f.issueDate, null, 'fact']); }
        } else if (P.recurring) {
          if (manualSvc.has(P.id)) return;
          const open = c.services.find(v => v.productId === P.id && !v.end);
          const nv = () => c.services.push({ id: `${c.id}_f${hashStr(f.id + '|' + i).toString(36)}`, productId: P.id, price: l.amount, start: f.issueDate, end: null, src: 'fact' });
          if (!open) nv();
          else if (+open.price !== +l.amount && f.issueDate > open.start) { open.end = f.issueDate; nv(); }
        } else {
          c.sales.push({ id: `${c.id}_t${hashStr(f.id + '|' + i).toString(36)}`, productId: P.id, amount: l.amount, currency: 'USD', date: f.issueDate, invoiceRef: f.num });
        }
      });
      f.recSub = round2(sum((f.lines || []).filter(x => x.rec), x => x.amount));
      f.uniSub = round2(sum((f.lines || []).filter(x => !x.rec), x => x.amount));
    });
  });
  const ds = importedInv.map(f => f.issueDate.slice(0, 7)).sort();
  extendPeriods(ds[0], ds[ds.length - 1]);
}
function applyImport(data, opt = {}) {
  if (Array.isArray(data.clientes) && data.clientes.length) {
    const cur = lsRaw(FACT_CLI_KEY, []);
    data.clientes.forEach(fc => { if (fc && fc.nombre && !cur.some(x => x.code === fc.code || normTxt(x.nombre) === normTxt(fc.nombre))) cur.push(fc); });
    try { localStorage.setItem(FACT_CLI_KEY, JSON.stringify(cur)); } catch (e) {}
    syncClientsFromFacturero();
  }
  const facturas = Object.values(data.facturas || {});
  const custom = (data.catalogo || []);
  const res = { invoices: 0, added: 0, updated: 0, removed: 0, newClients: [], rec: 0, non: 0, newProducts: [], skipped: [], outOfRange: 0, changed: [] };
  const oldList = clone(importedInv);
  const parsed = [];
  facturas.forEach(fx => {
    const inv = parseInvoiceHtml(fx.html || '');
    inv.num = inv.num || fx.num; inv.client = inv.client || fx.cliente; inv.code = inv.code || fx.code;
    if (!inv.client || /^nombre o raz/i.test(inv.client)) { res.skipped.push(`Factura ${inv.num}: sin cliente`); return; }
    if (!inv.issueDate || !inv.lines.length) { res.skipped.push(`Factura ${inv.num}: sin fecha o sin productos`); return; }
    if (isDeletedCli(inv.code, inv.client)) { res.skipped.push(`Factura ${inv.num}: el cliente ${inv.client} fue eliminado del tablero`); return; }
    inv.dueDate = inv.dueDate || inv.issueDate;
    let c = findClientFor(inv);
    if (!c) {
      c = { id: newClientId(), name: inv.client, sector: 'Sin sector', channel: 'OTHER', cac: 0, health: 7, seats: 1, segs: [], services: [], sales: [], pauses: [], opt: { ...(inv.rif ? { rif: inv.rif } : {}), ...(inv.code && /^CLI-/i.test(inv.code) ? { cliCode: inv.code } : {}) } };
      clientDefs.push(c); res.newClients.push(inv.client);
    }
    const invId = 'FAC-' + inv.num; const lineRecs = [];
    inv.lines.forEach(l => {
      let P = matchProduct(catalog, l.title);
      if (!P) {
        const cu = custom.find(x => normTxt(x.nombre) === normTxt(l.title));
        P = { id: 'cus-' + hashStr(normTxt(l.title)).toString(36), short: l.title.slice(0, 60), name: l.title, recurring: false, tipo: cu ? 'unico' : 'sin', price: l.price, custom: true, fromInvoice: !cu, hours: 0 };
        if (!catalog.some(x => x.id === P.id)) { catalog.push(P); res.newProducts.push(`${P.short} (no recurrente)`); }
        else P = catalog.find(x => x.id === P.id);
      }
      const amount = round2(l.qty * l.price); lineRecs.push({ productId: P.id, amount, rec: !!P.recurring, title: l.title });
      if (P.recurring) res.rec++; else res.non++;
    });
    if (parsed.some(x => x.id === invId)) res.skipped.push(`Factura ${inv.num}: número repetido en el facturero (se tomó la última guardada)`);
    const rec = { id: invId, num: inv.num, clientId: c.id, code: inv.code || null, issueDate: inv.issueDate, dueDate: inv.dueDate, subtotal: round2(inv.subtotal), ivaRate: inv.ivaRate, iva: inv.iva, paidDate: null, lines: lineRecs, updatedAt: fx.savedAt || null, src: opt.full ? 'fact' : 'file' };
    const k = parsed.findIndex(x => x.id === invId); if (k >= 0) parsed.splice(k, 1);
    parsed.push(rec);
    if (inv.issueDate.slice(0, 7) < ALL_PERIODS[0]) res.outOfRange++;
    res.invoices++;
  });
  // fusionar: en sincronización completa, lo que ya no está en el facturero se quita (salvo lo traído de un respaldo)
  const sigOf = f => JSON.stringify([f.clientId, f.issueDate, f.dueDate, f.subtotal, f.iva, (f.lines || []).map(l => [l.productId, l.amount])]);
  const next = opt.full ? oldList.filter(f => f.src === 'file' && !parsed.some(p => p.id === f.id)) : oldList.filter(f => !parsed.some(p => p.id === f.id));
  parsed.forEach(p => { const o = oldList.find(f => f.id === p.id); if (!o) res.added++; else if (sigOf(o) !== sigOf(p)) { res.updated++; res.changed.push(p.num); } next.push(p); });
  if (opt.full) res.removed = oldList.filter(f => f.src !== 'file' && !parsed.some(p => p.id === f.id)).length;
  importedInv = next;
  rederiveFromInvoices(oldList);
  store.set('imported_v1', importedInv); store.set('catalog_v1', catalog); saveClients();
  return res;
}
function benchModal() {
  openModal(`<h2 id="modal-t">Umbrales de las métricas</h2><p class="muted">Define desde qué valor una métrica está en meta (verde) y desde cuál pasa a alerta.</p>
    <form data-form="bench"><div class="table-scroll"><table class="mini-table"><thead><tr><th scope="col">Métrica</th><th scope="col">Dirección</th><th scope="col">En meta</th><th scope="col">Atención</th></tr></thead><tbody>
    ${state.benchmarks.map(b => `<tr><td>${b.label}</td><td>${b.direction === 'HIGHER_IS_BETTER' ? 'Más es mejor' : 'Menos es mejor'}</td>
      <td><input class="num-in" type="number" step="0.1" name="${b.metricKey}_green" value="${esc(b.green)}" aria-label="${b.label}: en meta"></td>
      <td><input class="num-in" type="number" step="0.1" name="${b.metricKey}_yellow" value="${esc(b.yellow)}" aria-label="${b.label}: atención"></td></tr>`).join('')}
    </tbody></table></div>
    <div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="reset-bench">Restaurar valores</button><button type="submit" class="btn btn-cta">Guardar umbrales <span class="cta-dot">${I.arrow}</span></button></div></form>`);
}

document.addEventListener('click', e => {
  const t = e.target.closest('button,[data-bucket]'); if (!t) return;
  if (t.id === 'lockBtn') { if (isUnlocked()) { unlockedUntil = 0; if (SRV) SRV.closeEdit(); else logAudit('bloqueó la edición', 'sesion'); renderLock(); render(); toast('Edición bloqueada'); } else keyModal(null); return; }
  if (needsKey(t) && !isUnlocked() && !t.closest('#modal')) { keyModal(t); return; }
  if (t.dataset.act === 'key-change') { hasEditKey() ? openModal(`<h2 id="modal-t">Cambiar clave de edición</h2><form data-form="key-change" novalidate><div class="fgrid"><label class="fld span2"><span>Clave actual</span><input type="password" name="k0" autocomplete="current-password"></label><label class="fld"><span>Clave nueva</span><input type="password" name="k1" autocomplete="new-password"></label><label class="fld"><span>Repítela</span><input type="password" name="k2" autocomplete="new-password"></label></div><p class="form-err" hidden></p><div class="modal-acts"><button type="button" class="btn btn-ghost" data-act="close">Cancelar</button><button type="submit" class="btn btn-cta">Cambiar clave <span class="cta-dot">${I.arrow}</span></button></div></form>`) : keyModal(null); return; }
  if (t.dataset.act === 'rec-new') { (async () => { if (await issueRecovery()) recCodeModal('Este código reemplaza al anterior cuando confirmes que lo guardaste.'); })(); return; }
  if (t.dataset.act === 'catalog') { location.hash = '#/productos'; return; }
  if (t.dataset.act === 'unlock') { keyModal(null); return; }
  if (t.dataset.mxmode) { state.mxMode = t.dataset.mxmode; render(); return; }
  if (t.dataset.act === 'mx-add-prod') return mxAddModal('prod', t.dataset.tipo);
  if (t.dataset.act === 'mx-add-cat') return mxAddModal('cat', t.dataset.group);
  if (t.dataset.act === 'mx-add-inv') return mxAddModal('inv', '');
  if (t.dataset.act === 'np-open' || t.dataset.act === 'np-cancel') { toggleNewProd(t.dataset.act === 'np-open'); return; }
  if (t.dataset.pdel) return prodDelModal(t.dataset.pdel);
  if (t.dataset.act === 'new-ase') return aseModal(null);
  if (t.dataset.aseEdit) return aseModal(t.dataset.aseEdit);
  if (t.dataset.aseDel) { const a = asesores.find(x => x.id === t.dataset.aseDel); asesores = asesores.filter(x => x.id !== a.id); clientDefs.forEach(c => { if (c.opt && c.opt.asesorId === a.id) delete c.opt.asesorId; }); saveCom(); saveClients(); logAudit(`eliminó a ${a.nombre} del equipo`); toast(`${a.nombre} eliminado del equipo`); render(); return; }
  if (t.dataset.act === 'new-imp') return impModal(null);
  if (t.dataset.impEdit) return impModal(t.dataset.impEdit);
  if (t.dataset.impDel) { const x = impls.find(v => v.id === t.dataset.impDel); impls = impls.filter(v => v.id !== t.dataset.impDel); saveCom(); rebuild(); logAudit(`eliminó la implementación "${x ? x.concepto : ''}"${x ? ' de ' + asesorName(x.asesorId) + ' (' + fmtDate(x.fecha) + ')' : ''}`, 'comisiones'); toast('Implementación eliminada'); render(); return; }
  if (t.dataset.comPay) { const a = asesores.find(x => x.id === t.dataset.comPay); return receiptModal({ tipo: a && a.modalidad === 'IMPLEMENTACION' ? 'IMPLEMENTADOR' : 'COMISION', asesorId: t.dataset.comPay, period: state.period, concept: `${a && a.modalidad === 'IMPLEMENTACION' ? 'Pago de implementaciones' : 'Comisiones'} de ${periodLabel(state.period).toLowerCase()}` }); }
  if (t.dataset.comUnpay) { delete comPaid[state.period + '|' + t.dataset.comUnpay]; saveCom(); logAudit(`desmarcó el pago de comisiones de ${asesorName(t.dataset.comUnpay)} (${periodLabel(state.period)})`, 'comisiones'); toast('Marcado como por pagar. Si había recibo, anúlalo en Inversionistas.'); render(); return; }
  if (t.dataset.comBase) { comBase = t.dataset.comBase; saveCom(); rebuild(); logAudit(`cambió la base de comisión a lo ${comBase}`); render(); return; }
  if (t.dataset.act === 'cash') return cashModal();
  if (t.dataset.act === 'rates') return ratesModal();
  if (t.dataset.act === 'iva') return ivaModal();
  if (t.dataset.act === 'staff') return staffModal();
  if (t.dataset.act === 'sync-fact') { syncClientsToFacturero(); const r = syncFromFacturero(true); toast(r && r.invoices ? `Sincronizado: ${r.invoices} factura(s) del facturero` : 'Todo al día: no hay facturas nuevas en el facturero'); render(); return; }
  if (t.dataset.sort) { const k = t.dataset.sort; state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: k === 'name' ? 1 : -1 }; render(); }
  else if (t.dataset.bucket) { state.bucket = t.dataset.bucket; render(); }
  else if (t.dataset.period) { if (t.dataset.period !== state.period) { state.period = t.dataset.period; state.agMonth = null; load(); } }
  else if (t.dataset.expEdit) expModal(t.dataset.expEdit);
  else if (t.dataset.expDel) { ensureExpenseState(); const x = expenseEntries.find(v => v.id === t.dataset.expDel); if (x && x.recId) { const r = recExp.find(v => v.id === x.recId); if (r) { r.skips = [...new Set([...(r.skips || []), x.period])]; saveNew(); } } expenseEntries = expenseEntries.filter(v => v.id !== t.dataset.expDel); saveExpenses(); logAudit(`eliminó el gasto "${x ? x.concept : ''}"`); toast('Gasto eliminado'); render(); }
  else if (t.dataset.act === 'new-exp') expModal(null);
  else if (t.dataset.act === 'budget') budgetModal();
  else if (t.dataset.act === 'goal') goalModal();
  else if (t.dataset.act === 'sheet') sheetModal();
  else if (t.dataset.remind) remindModal(t.dataset.remind);
  else if (t.dataset.edit) clientModal(t.dataset.edit);
  else if (t.dataset.pause) pauseModal(t.dataset.pause);
  else if (t.dataset.resume) resumeModal(t.dataset.resume);
  else if (t.dataset.pay) payModal(t.dataset.pay);
  else if (t.dataset.cut || t.dataset.grace) {
    const key = t.dataset.cut || t.dataset.grace; const dec = t.dataset.cut ? 'CUT' : 'GRACE';
    decisions[key] = dec; saveDecisions(); const c = db.clients.find(x => x.id === key.split('|')[0]);
    logAudit(`${dec === 'CUT' ? 'cortó el servicio de' : 'dio prórroga a'} ${c.name} en el corte del día 5 de ${periodLabel(key.split('|')[1]).toLowerCase()}`);
    toast(dec === 'CUT' ? `Servicio cortado a ${c.name}. Queda en pausa hasta que registres su pago.` : `${c.name} sigue con servicio (prórroga).`); render();
  }
  else if (t.dataset.act === 'new-inv') invModal(null);
  else if (t.dataset.act === 'catalog') catalogModal();
  else if (t.dataset.act === 'import') importModal();
  else if (t.dataset.invEdit) invModal(t.dataset.invEdit);
  else if (t.dataset.invDel) { const x = state.investments.find(v => v.id === t.dataset.invDel); state.investments = state.investments.filter(v => v.id !== x.id); store.set('investments_v2', state.investments); logAudit(`eliminó la inversión "${x.concept}"`); toast('Inversión eliminada'); render(); }
  else if (t.dataset.delClient) deleteClientModal(t.dataset.delClient);
  else if (t.dataset.act === 'new-client') clientModal(null);
  else if (t.dataset.act === 'reset-clients') { deletedCli = []; store.set('deleted_cli_v1', []); clientDefs = []; decisions = {}; payments = {}; importedInv = []; store.set('decisions', {}); store.set('payments', {}); store.set('imported_v1', []); syncClientsFromFacturero(); saveClients(); lastFactSig = ''; store.set('fact_sig', ''); try { syncFromFacturero(true); } catch (x) {} logAudit('recargó los clientes desde el facturero'); toast(`Base recargada: ${clientDefs.length} cliente(s) del facturero`); render(); }
  else if (t.dataset.del) { const a = state.actions.find(a => a.id === t.dataset.del); state.actions = state.actions.filter(a => a.id !== t.dataset.del); store.set('actions', state.actions); logAudit(`eliminó la tarea "${a.title}"`); toast('Tarea eliminada'); render(); }
  else if (t.dataset.act === 'retry') { state.demo = 'normal'; const ds = document.getElementById('demoSel'); if (ds) ds.value = 'normal'; load(); }
  else if (t.dataset.act === 'clear-filters') { state.filters = { q: '', plan: '', health: 0, payment: '', flag: '' }; render(); }
  else if (t.dataset.act === 'close' || t.classList.contains('modal-x')) closeModal();
  else if (t.dataset.act === 'bench') benchModal();
  else if (t.dataset.act === 'reset-bench') { state.benchmarks = clone(DEFAULT_BENCHMARKS); store.set('benchmarks', []); logAudit('restauró los umbrales originales de las métricas', 'ajustes'); closeModal(); toast('Umbrales restaurados'); render(); }
  else if (t.id === 'themeBtn') { setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark'); logAudit(`cambió el tema a ${state.theme === 'dark' ? 'oscuro' : 'claro'}`, 'ajustes'); }
});
document.addEventListener('input', e => { const f = e.target.dataset.filter; if (f === 'q') { state.filters.q = e.target.value; render(); } });
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.mx || el.id === 'mx-saldo' || el.id === 'mx-saldo-p' || el.dataset.ptype || el.dataset.pprice) {
    if (!isUnlocked()) { keyModal(null); render(); return; }
    if (el.dataset.mx) { const k = el.dataset.mx + '|' + el.dataset.mm; const v = el.value.trim(); const before = matrix.prev[k]; if (v === '') delete matrix.prev[k]; else { const n = parseAmount(v); if (n == null || !isFinite(n)) { toast('Escribe un número válido'); return; } matrix.prev[k] = n; } saveMatrix(); bumpData();
      const [kind, id] = el.dataset.mx.split(':'); const what = kind === 'prod' ? (prodOf(id).short || id) : kind === 'cat' ? catLabel(id) : (INVEST_CATS[id] || id);
      logAudit(`cambió el previsto de "${what}" en ${periodLabel(el.dataset.mm)}: ${before == null ? 'vacío' : num(before, 2)} → ${v === '' ? 'vacío' : num(matrix.prev[k], 2)}`, 'matriz'); toast('Previsto guardado'); render(); return; }
    if (el.id === 'mx-saldo') { matrix.saldoInicial = parseAmount(el.value) || 0; saveMatrix(); logAudit('cambió el saldo inicial de caja'); toast('Saldo inicial guardado'); render(); return; }
    if (el.id === 'mx-saldo-p') { matrix.saldoInicialPeriodo = el.value || '2026-09'; saveMatrix(); toast('Mes del saldo inicial guardado'); render(); return; }
    if (el.dataset.ptype) { const P = catalog.find(x => x.id === el.dataset.ptype); P.tipo = el.value; P.recurring = REV_TYPES[el.value].rec; saveCatalog(); logAudit(`clasificó "${P.short}" como ${REV_TYPES[el.value].label.toLowerCase()}`); toast('Tipo de ingreso guardado'); render(); return; }
    if (el.dataset.pprice) { const P = catalog.find(x => x.id === el.dataset.pprice); const v = el.value.trim(); P.price = v === '' ? null : parseAmount(v); saveCatalog(); logAudit(`cambió el precio de "${P.short}"`); toast('Precio guardado'); render(); return; }
  }
  if (el.id === 'importFileIn') {
    const file = el.files[0]; if (!file) return; const err = el.closest('.modal-body').querySelector('.form-err');
    file.text().then(txt => {
      let data; try { data = JSON.parse(txt); } catch (x) { data = null; }
      if (!data || data.app !== 'facturacion-agora') { err.textContent = 'Ese archivo no es un respaldo del facturero de Ágora. Descárgalo desde "Respaldo en disco".'; err.hidden = false; return; }
      const r = applyImport(data, { full: false });
      logAudit(`importó ${r.invoices} factura(s) del respaldo del facturero`, 'ajustes');
      openModal(`<h2 id="modal-t">Importación lista</h2><ul class="steps">
        <li><b>${r.invoices}</b> factura(s) importada(s)</li><li><b>${r.rec}</b> línea(s) recurrentes y <b>${r.non}</b> no recurrentes</li>
        ${r.newClients.length ? `<li>Clientes nuevos: ${r.newClients.map(esc).join(', ')}. Completa su sector y canal en Editar.</li>` : ''}
        ${r.newProducts.length ? `<li>Productos nuevos agregados al catálogo: ${r.newProducts.map(esc).join(', ')}. Revisa su tipo en Ver catálogo y precios.</li>` : ''}
        
        ${r.skipped.length ? `<li>No se importaron: ${r.skipped.map(esc).join('; ')}</li>` : ''}</ul>
        <div class="modal-acts"><button type="button" class="btn btn-cta" data-act="close">Listo <span class="cta-dot">${I.arrow}</span></button></div>`);
      render();
    });
    return;
  }
  if (el.dataset.filter && el.dataset.filter !== 'q') { state.filters[el.dataset.filter] = el.dataset.filter === 'health' ? +el.value : el.value; render(); }
  else if (el.id === 'periodSel') { state.period = el.value; load(); }
  else if (el.id === 'roleSel') { const before = state.role; state.role = el.value; store.set('role', state.role); logAudit(`cambió la vista del tablero de ${ROLES[before] || before} a ${ROLES[state.role]}`, 'ajustes'); render(); }
  else if (el.id === 'demoSel') { state.demo = el.value; if (el.value === 'loading') { state.loading = true; render(); } else { state.loading = false; render(); } }
  else if (el.dataset.done) { const a = state.actions.find(a => a.id === el.dataset.done); a.status = el.checked ? 'DONE' : 'PENDING'; store.set('actions', state.actions); logAudit(`${el.checked ? 'marcó como hecha' : 'reabrió'} la tarea "${a.title}"`, 'plan'); render(); }
  else if (el.dataset.astatus) { const a = state.actions.find(a => a.id === el.dataset.astatus); const before = a.status; a.status = el.value; store.set('actions', state.actions); logAudit(`cambió la tarea "${a.title}" de ${ASTATUS[before] || before} a ${ASTATUS[a.status]}`, 'plan'); render(); }
});
document.addEventListener('toggle', e => { if (e.target.dataset && e.target.dataset.toggle) state[e.target.dataset.toggle] = e.target.open; }, true);
document.addEventListener('submit', e => {
  const f = e.target; const kind = f.dataset.form; if (!kind) return; e.preventDefault();
  const fd = new FormData(f);
  if (kind === 'action') {
    const title = (fd.get('title') || '').trim(); if (!title) return;
    state.actions.push({ id: 'a' + Date.now(), title, horizon: fd.get('horizon'), status: 'PENDING', ownerId: fd.get('ownerId'), dueDate: fd.get('dueDate') });
    store.set('actions', state.actions); logAudit(`creó la tarea "${title}"`); toast('Tarea agregada'); render();
  } else if (kind === 'key-new' || kind === 'key-change') {
    // v10.1: PBKDF2 (asíncrono); el botón queda inactivo mientras se calcula
    const err = f.querySelector('.form-err'); const btn = f.querySelector('button[type=submit]'); const fail = m => { err.textContent = m; err.hidden = false; if (btn) btn.disabled = false; };
    const k1 = fd.get('k1') || '', k2 = fd.get('k2') || '';
    if (k1.length < 6) return fail('La clave debe tener al menos 6 caracteres.');
    if (k1 !== k2) return fail('Las dos claves no coinciden.');
    if (btn) btn.disabled = true;
    (async () => {
      if (kind === 'key-change' && !(await verifyEditKey(fd.get('k0') || ''))) return fail('La clave actual no coincide.');
      try { await setEditKey(k1); } catch (x) { return fail(x.message); }
      logAudit(kind === 'key-new' ? 'creó la clave de edición' : 'cambió la clave de edición');
      toast('Clave guardada'); unlock(); render();
    })();
  } else if (kind === 'key') {
    const err = f.querySelector('.form-err'); const btn = f.querySelector('button[type=submit]'); const inp = f.querySelector('input');
    if (keyTries.until > Date.now()) { err.textContent = `Demasiados intentos. Espera ${Math.ceil((keyTries.until - Date.now()) / 1000)} segundos.`; err.hidden = false; return; }
    if (btn) btn.disabled = true;
    (async () => {
      const okKey = await verifyEditKey(fd.get('k') || ''); if (btn) btn.disabled = false;
      if (!okKey) { keyTries.n++; if (keyTries.n >= 5) { keyTries.until = Date.now() + 30000 * Math.pow(2, Math.min(4, keyTries.n - 5)); logAudit('intentos fallidos de la clave de edición (bloqueo temporal)', 'sesion'); } err.textContent = 'Clave incorrecta. Intenta de nuevo.'; err.hidden = false; if (inp) inp.select(); return; }
      keyTries.n = 0; keyTries.until = 0; unlock();
    })();
  } else if (kind === 'cash') {
    cashOver = {}; UI_PERIODS.forEach(x => { const v = fd.get('c_' + x); if (v !== '' && v != null) cashOver[x] = +v; }); store.set('cash_v1', cashOver); rebuild();
    logAudit('actualizó el saldo de caja'); closeModal(); toast('Saldos de caja guardados'); render();
  } else if (kind === 'rates') {
    rateOver = {}; ALL_PERIODS.forEach(x => { const v = +fd.get('r_' + x); if (v > 0) rateOver[x] = v; }); store.set('rates_v1', rateOver); rebuild();
    logAudit('actualizó las tasas Binance'); closeModal(); toast('Tasas guardadas'); render();
  } else if (kind === 'iva') {
    const v = +fd.get('iva'); if (!(v >= 0 && v <= 100)) return; ivaRate = v; store.set('iva_v1', v); rebuild();
    logAudit(`cambió el IVA a ${num(v)}%`); closeModal(); toast('IVA guardado'); render();
  } else if (kind === 'staff') {
    const n = +fd.get('count'); const out = [];
    for (let i = 0; i < n; i++) { if (fd.get('x_' + i)) continue; const name = (fd.get('n_' + i) || '').trim(); if (!name) continue; const id = fd.get('id_' + i); out.push({ memberId: id === 'new' ? 'm' + Date.now() : id, name, role: (fd.get('r_' + i) || '').trim() || 'Equipo', hourlyCost: +fd.get('h_' + i) || 0, monthlyCapacityHours: +fd.get('c_' + i) || 0 }); }
    staffState = out; store.set('staff_v1', out); rebuild(); logAudit('actualizó el equipo'); closeModal(); toast('Equipo guardado'); render();
  } else if (kind === 'mx-add') {
    const err = f.querySelector('.form-err'); const fail = m => { err.textContent = m; err.hidden = false; };
    const nombre = (fd.get('nombre') || '').trim(); if (!nombre) return fail('Escribe el nombre.');
    const k2 = f.dataset.kind, extra = f.dataset.extra;
    if (k2 === 'prod') {
      if (catalog.some(c => normTxt(c.name) === normTxt(nombre))) return fail('Ya existe un producto con ese nombre.');
      const pr = (fd.get('precio') || '').trim(); const precio = pr ? parseAmount(pr) : null; if (pr && !(precio > 0)) return fail('El precio debe ser mayor que cero, o déjalo vacío.');
      const id = 'custom-' + Date.now(); catalog.push({ id, short: nombre.slice(0, 60), name: nombre, desc: '', price: precio, tipo: extra, recurring: REV_TYPES[extra].rec, custom: true, hours: 0 });
      const fc = lsRaw('agora-catalogo-v1', []); fc.push({ id, nombre, desc: '', precio }); try { localStorage.setItem('agora-catalogo-v1', JSON.stringify(fc)); } catch (x) {}
      saveCatalog(); logAudit(`agregó el producto "${nombre}" a ${REV_TYPES[extra].short.toLowerCase()}`);
    } else if (k2 === 'cat') {
      if (ALL_CATS().some(c => normTxt(c.label) === normTxt(nombre))) return fail('Ya existe ese concepto.');
      customCats.push({ id: 'cc-' + Date.now(), label: nombre, tipo: 'gasto', group: fd.get('group') || 'OPEX' }); store.set('custom_cats_v1', customCats); logAudit(`agregó el concepto de gasto "${nombre}"`);
    } else {
      if (Object.values(INVEST_CATS).some(l => normTxt(l) === normTxt(nombre))) return fail('Ya existe ese concepto.');
      const c = { id: 'ci-' + Date.now(), label: nombre }; customInvCats.push(c); INVEST_CATS[c.id] = c.label; store.set('custom_inv_cats_v1', customInvCats); logAudit(`agregó el concepto de inversión "${nombre}"`);
    }
    closeModal(); toast(`"${nombre}" agregado a la matriz`); render();
  } else if (kind === 'np') {
    if (!isUnlocked()) { keyModal(f.querySelector('button[type=submit]')); return; } // la edición pudo vencer con el formulario abierto
    const err = f.querySelector('.form-err'); const fail = m => { err.textContent = m; err.hidden = false; };
    const nombre = (fd.get('nombre') || '').trim(), pr = (fd.get('precio') || '').trim(), tipo = fd.get('tipo');
    if (!nombre) return fail('Escribe el nombre del producto.');
    if (catalog.some(c => normTxt(c.name) === normTxt(nombre))) return fail('Ya existe un producto con ese nombre.');
    const precio = pr ? parseAmount(pr) : null; if (pr && !(precio > 0)) return fail('El precio debe ser mayor que cero, o déjalo vacío.');
    const id = 'custom-' + Date.now(); catalog.push({ id, short: nombre.slice(0, 60), name: nombre, desc: (fd.get('desc') || '').trim(), price: precio, tipo, recurring: REV_TYPES[tipo].rec, custom: true, hours: 0 });
    const fc = lsRaw('agora-catalogo-v1', []); fc.push({ id, nombre, desc: (fd.get('desc') || '').trim(), precio }); try { localStorage.setItem('agora-catalogo-v1', JSON.stringify(fc)); } catch (x) {}
    state.newProd = false; saveCatalog(); logAudit(`agregó el producto "${nombre}"`); toast('Producto guardado. Ya está disponible en el facturero.');
    state.flashRow = id; render(); state.flashRow = null;
    const nr = document.querySelector('#content tr.row-flash'); if (nr) nr.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' });
  } else if (kind === 'ase') {
    const err = f.querySelector('.form-err'); const nombre = (fd.get('nombre') || '').trim();
    if (!nombre) { err.textContent = 'Escribe el nombre.'; err.hidden = false; return; }
    const data = { nombre, rol: (fd.get('rol') || '').trim(), modalidad: fd.get('modalidad'), pctRec: +fd.get('pctRec') || 0, pctUni: +fd.get('pctUni') || 0, mesesRec: +fd.get('mesesRec') || 0, tarifaImpl: +fd.get('tarifaImpl') || 0 };
    if (f.dataset.id) Object.assign(asesores.find(x => x.id === f.dataset.id), data); else asesores.push({ id: 'a' + Date.now(), ...data });
    saveCom(); rebuild(); logAudit(`${f.dataset.id ? 'editó' : 'agregó'} a ${nombre} en el equipo`); closeModal(); toast(`${nombre} guardado`); render();
  } else if (kind === 'imp') {
    const err = f.querySelector('.form-err'); const fail = m => { err.textContent = m; err.hidden = false; };
    const concepto = (fd.get('concepto') || '').trim(); const asesorId = fd.get('asesorId'); const fecha = fd.get('fecha');
    if (!concepto) return fail('Escribe qué implementación se hizo.');
    if (!asesorId) return fail('Elige quién la hizo.');
    if (!fecha || !ALL_PERIODS.includes(fecha.slice(0, 7))) return fail(`Elige una fecha entre ${monthYear(ALL_PERIODS[0])} y ${monthYear(ALL_PERIODS[ALL_PERIODS.length - 1])}.`);
    const a = asesores.find(x => x.id === asesorId); const m = fd.get('monto'); const monto = m === '' ? (+a.tarifaImpl || 0) : +m;
    const data = { concepto, clientId: fd.get('clientId'), asesorId, fecha, monto };
    if (f.dataset.id) Object.assign(impls.find(x => x.id === f.dataset.id), data); else impls.push({ id: 'i' + Date.now(), ...data });
    saveCom(); rebuild(); logAudit(`${f.dataset.id ? 'editó' : 'registró'} la implementación "${concepto}"`); closeModal(); toast('Implementación guardada'); render();
  } else if (kind === 'client') { saveClient(f);
  } else if (kind === 'exp') {
    if (f.dataset.quick && !isUnlocked()) { keyModal(f.querySelector('button[type=submit]')); return; }
    const err = f.querySelector('.form-err'); const amount = +fd.get('amount'); const concept = (fd.get('concept') || '').trim();
    if (!concept) { err.textContent = 'Escribe el concepto del gasto.'; err.hidden = false; return; }
    if (!(amount > 0)) { err.textContent = 'El monto debe ser mayor que cero.'; err.hidden = false; return; }
    const date = fd.get('date'); const recurrent = !!fd.get('recurrent'); const recEnd = fd.get('recEnd') || null;
    const payerId = fd.get('payerId') || '', payee = (fd.get('payee') || '').trim();
    const lastP = ALL_PERIODS[ALL_PERIODS.length - 1];
    if (!date || date.slice(0, 7) < ALL_PERIODS[0] || (!recurrent && date > TODAY && date.slice(0, 7) > lastP)) { err.textContent = `Elige una fecha entre ${monthYear(ALL_PERIODS[0])} y ${monthYear(lastP)}.`; err.hidden = false; return; }
    if (recurrent && recEnd && recEnd < date) { err.textContent = 'El último cobro no puede ser antes del primero.'; err.hidden = false; return; }
    ensureExpenseState(); const data = { date, period: date.slice(0, 7), category: fd.get('category'), concept, amount, currency: fd.get('currency'), payerId, payee };
    let msg;
    if (f.dataset.id) {
      const x = expenseEntries.find(v => v.id === f.dataset.id); Object.assign(x, data, { source: x.source || 'manual' });
      if (x.recId && fd.get('applyFuture')) { const r = recExp.find(v => v.id === x.recId); if (r) Object.assign(r, { concept, category: data.category, amount, currency: data.currency, payerId, payee }); }
      if (!x.recId && recurrent) { const r = { id: 'r' + Date.now().toString(36), concept, category: data.category, amount, currency: data.currency, day: +date.slice(8), start: date, end: recEnd, payerId, payee, active: true, skips: [date.slice(0, 7)], createdAt: new Date().toISOString() }; recExp.push(r); x.recId = r.id; }
      saveNew(); msg = 'Gasto actualizado';
      logAudit(`editó el gasto "${concept}" por ${money(amount, 2)}${recurrent ? ' y lo volvió recurrente' : ''}`, 'gastos');
    } else if (recurrent) {
      const r = { id: 'r' + Date.now().toString(36), concept, category: data.category, amount, currency: data.currency, day: +date.slice(8), start: date, end: recEnd, payerId, payee, active: true, skips: [], createdAt: new Date().toISOString() };
      recExp.push(r); saveNew(); const n = runRecurring(true);
      logAudit(`creó el gasto recurrente "${concept}" por ${money(amount, 2)} el día ${r.day} de cada mes${payerId ? ', pagado por ' + investorName(payerId) : ''}`, 'gastos');
      msg = n ? `Gasto recurrente creado: ya se registró ${n} cobro(s) y seguirá cada día ${r.day}` : `Gasto recurrente creado: se registrará solo el ${fmtDate(date)}`;
    } else {
      expenseEntries.push({ id: 'mx-' + Date.now(), ...data, source: 'manual' }); msg = `Gasto registrado: ${concept}`;
      logAudit(`registró el gasto "${concept}" por ${money(amount, 2)}${payerId ? ', pagado por ' + investorName(payerId) : ''}`, 'gastos');
    }
    saveExpenses(); if (f.dataset.quick) { f.reset(); } else closeModal(); toast(msg); render();
  } else if (kind === 'budget') {
    ALL_CATS().forEach(c => { budgets[c.id] = +fd.get('b_' + c.id) || 0; }); store.set('budgets_v2', budgets);
    logAudit('actualizó el presupuesto de gastos'); closeModal(); toast('Presupuesto guardado'); render();
  } else if (kind === 'goal') {
    goals.default = +fd.get('g_default') || 0; goals.byPeriod = { ...(goals.byPeriod || {}) }; UI_PERIODS.forEach(x => { const v = fd.get('g_' + x); if (v !== '' && v != null) goals.byPeriod[x] = +v; else delete goals.byPeriod[x]; }); // los meses que no salen en el formulario se conservan
    store.set('goals_v1', goals); logAudit('actualizó la meta de ingresos'); closeModal(); toast('Meta guardada'); render();
  } else if (kind === 'sheet') {
    const r = importSheet(fd); const err = f.querySelector('.form-err');
    if (r.error) { err.textContent = r.error; err.hidden = false; return; }
    logAudit(`importó ${r.cells} montos de gastos desde la hoja (${fd.get('mode') === 'REAL' ? 'reales' : 'presupuesto'})`);
    openModal(`<h2 id="modal-t">Gastos importados</h2><ul class="steps"><li><b>${r.rows}</b> categoría(s) y <b>${r.cells}</b> monto(s) cargados como ${fd.get('mode') === 'REAL' ? 'gasto real' : 'presupuesto'}.</li><li>Meses: ${[...r.periods].sort().map(periodLabel).join(', ')}.</li>${r.unmatched.length ? `<li>Quedaron en "Otros gastos" porque no se reconoció su categoría: ${r.unmatched.map(esc).join(', ')}.</li>` : ''}</ul><div class="modal-acts"><button type="button" class="btn btn-cta" data-act="close">Listo <span class="cta-dot">${I.arrow}</span></button></div>`);
    render();
  } else if (kind === 'catalog') {
    catalog.forEach(p => { const pr = fd.get('price_' + p.id); if (pr !== null && pr !== '') p.price = +pr; const rc = fd.get('rec_' + p.id); if (rc) p.recurring = rc === 'R'; });
    const nn = (fd.get('np_name') || '').trim(); if (nn) catalog.push({ id: 'cus-' + hashStr(normTxt(nn)).toString(36), short: nn, name: nn, recurring: fd.get('np_rec') === 'R', price: +fd.get('np_price') || 0, custom: true, hours: 0 });
    saveCatalog(); logAudit('actualizó el catálogo de productos y servicios'); closeModal(); toast('Catálogo guardado'); render();
  } else if (kind === 'del-client') {
    const c = clientDefs.find(x => x.id === f.dataset.id); deleteClientsByIds([c.id], false); logAudit(`eliminó el cliente ${c.name}`, 'clientes'); closeModal(); toast(`${c.name} quedó eliminado`); render();
  } else if (kind === 'remind') {
    const inv = db.invoices.find(i => i.id === f.dataset.inv); const c = db.clients.find(c => c.id === inv.clientId); const err = f.querySelector('.form-err');
    const ch = fd.get('ch'), msg = (fd.get('msg') || '').toString().trim(), tel = (fd.get('tel') || '').toString().trim(), mail = (fd.get('mail') || '').toString().trim();
    if (ch === 'WhatsApp' && !waNumber(tel)) { err.textContent = 'Escribe el número de WhatsApp del cliente.'; err.hidden = false; return; }
    if (ch === 'Correo' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { err.textContent = 'Escribe el correo del cliente.'; err.hidden = false; return; }
    const cd = clientDefs.find(x => x.id === inv.clientId); if (cd) { cd.opt = cd.opt || {}; if (tel && !cd.opt.tel) cd.opt.tel = tel; if (mail && !cd.opt.email) cd.opt.email = mail; store.set('clients_v2', clientDefs); }
    openExternal(ch === 'WhatsApp' ? `https://wa.me/${waNumber(tel)}?text=${encodeURIComponent(msg)}` : `mailto:${encodeURIComponent(mail)}?subject=${encodeURIComponent('Recordatorio de pago · factura ' + (inv.num || inv.id))}&body=${encodeURIComponent(msg)}`);
    logAudit(`envió recordatorio por ${ch} a ${c.name} (factura ${inv.num || inv.id})`, 'cobranza'); closeModal(); toast(`Se abrió ${ch === 'WhatsApp' ? 'WhatsApp' : 'tu correo'} con el recordatorio listo`); render();
  } else if (kind === 'pause') {
    const err = f.querySelector('.form-err'); const fail = m => { err.textContent = m; err.hidden = false; };
    const c = clientDefs.find(x => x.id === f.dataset.id); const start = fd.get('start'), end = fd.get('end') || null;
    const subStart = [...c.segs.map(sg => sg[1]), ...c.services.map(v => v.start)].filter(Boolean).sort()[0] || '2024-01-01'; // corrección v10: clientes solo con servicios no tienen plan
    if (!start || start < subStart) return fail(`La fecha de inicio debe ser posterior al ${fmtDate(subStart)}.`);
    if (end && end <= start) return fail('La reanudación debe ser posterior al inicio.');
    if (c.pauses.some(pp => start < (pp.end || '9999') && (end || '9999') > pp.start)) return fail('Ya hay una pausa en esas fechas.');
    c.pauses.push({ id: 'pz' + Date.now(), start, end, reason: fd.get('reason'), note: (fd.get('note') || '').trim() });
    saveClients(); logAudit(`pausó a ${c.name} desde el ${fmtDate(start)} (${PAUSE_REASONS[fd.get('reason')]})`); closeModal(); toast(`${c.name} quedó en pausa`); render();
  } else if (kind === 'resume') {
    const err = f.querySelector('.form-err'); const c = clientDefs.find(x => x.id === f.dataset.id); const pp = c.pauses.find(x => x.id === f.dataset.pause);
    const end = fd.get('end'); if (!end || end <= pp.start) { err.textContent = `La fecha debe ser posterior al ${fmtDate(pp.start)}.`; err.hidden = false; return; }
    pp.end = end; saveClients(); const days = Math.round((D(end) - D(pp.start)) / DAY);
    logAudit(`reanudó a ${c.name} el ${fmtDate(end)} tras ${days} días de pausa`); closeModal(); toast(`${c.name} reanudado tras ${days} días en pausa`); render();
  } else if (kind === 'pay') {
    const err = f.querySelector('.form-err'); const inv = db.invoices.find(i => i.id === f.dataset.inv); const date = fd.get('date');
    const fail = m => { err.textContent = m; err.hidden = false; const n = /referencia|código|recibo|ID/i.test(m) ? 'ref' : /bol[ií]vares/i.test(m) ? 'amountBs' : /tasa/i.test(m) ? 'rate' : /monto/i.test(m) ? 'amount' : null; const i = n && f.querySelector(`[name=${n}]`); if (i) i.focus(); };
    if (!inv) return fail('No encontré la factura.');
    const method = fd.get('method') || 'BINANCE', ref = (fd.get('ref') || '').trim(); const q = payQuote(f);
    if (method === 'VES') { if (!(q.bs > 0)) return fail('Escribe el monto recibido en bolívares.'); if (!(q.rate > 0)) return fail('Escribe la tasa a la que cambiaste los bolívares (Bs por US$).'); }
    else if (!(q.amount > 0)) return fail('Indica el monto recibido.');
    if (q.fee < 0 || q.fee >= q.usd) return fail('La comisión debe ser menor que el monto recibido.');
    if (ref.length < 3) return fail(`El ${PM[method].ref.toLowerCase()} es obligatorio (mínimo 3 caracteres).`);
    const usedRef = [...Object.entries(payRefs).filter(([k]) => k !== inv.id).map(([k, v]) => [k, v.ref]), ...pagos.map(x => [x.invId, x.ref])].find(([k, r]) => normTxt(r) === normTxt(ref));
    if (usedRef) return fail(`Esa referencia ya se usó en la factura ${String(usedRef[0]).replace(/^FAC-/, '')}.`);
    if (!date || date < inv.issueDate) return fail(`La fecha del pago no puede ser anterior a la emisión (${fmtDate(inv.issueDate)}).`);
    if (date > TODAY) return fail('La fecha del pago no puede ser futura.');
    const total = invTotal(inv), due = invDue(inv), base = due > 0 ? due : total, tol = Math.max(0.05, base * 0.002);
    const short = q.usd < base - tol, settle = !short || fd.get('settle') === 'saldar';
    const rateType = method === 'VES' ? (fd.get('rateType') || 'BINANCE') : null;
    const pg = { id: 'pg' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), invId: inv.id, date, method, currency: PM[method].cur, amount: method === 'VES' ? q.bs : q.amount, usd: q.usd, fee: q.fee || 0, net: round2(q.usd - (q.fee || 0)),
      rateType, rate: method === 'VES' ? q.rate : null, rateBcv: method === 'VES' && q.bcv ? q.bcv : null, usdBcv: method === 'VES' && q.bcv ? q.usdBcv : null, bsChannel: method === 'VES' ? fd.get('bsChannel') : null, bank: method === 'VES' ? (fd.get('bank') || '').trim() : null,
      binType: method === 'BINANCE' ? fd.get('binType') : null, payer: (fd.get('payer') || fd.get('receiver') || '').trim() || null, ref, note: (fd.get('note') || '').trim() || null,
      settle, diff: round2(q.usd - base), excess: q.usd > base + tol ? round2(q.usd - base) : 0, user: auditUser(), at: new Date().toISOString() };
    if (method === 'VES' && f._quote && Date.now() < f._quote.exp && Math.abs(q.rate - f._quote.tasa) < 0.00005) pg.fxQuote = f._quote.cotizacion;
    pagos.push(pg); savePagos();
    if (settle) { payments[inv.id] = date; payRefs[inv.id] = { ref, method, amount: pg.amount, currency: pg.currency, usd: q.usd, date, user: pg.user, at: pg.at, v10: true }; }
    // si se registró en bolívares con una tasa nueva, se guarda como tasa del día de ese tipo
    if (method === 'VES' && rateType !== 'OTRA') { tasas[date] = Object.assign({}, tasas[date] || {}, { [rateType]: q.rate }, q.bcv ? { BCV: q.bcv } : {}); store.set('tasas_v1', tasas); }
    saveNew(); saveDecisions(); const c = db.clients.find(x => x.id === inv.clientId);
    const what = method === 'VES' ? `${moneyBs(q.bs)} (${BS_CHANNELS[pg.bsChannel] || 'bolívares'}${pg.bank ? ', ' + pg.bank : ''}) a ${fmtRate(q.rate)} del dólar ${RATE_SHORT[rateType]}${pg.fxQuote ? ' (tasa congelada por el servidor)' : ''} = ${money(q.usd, 2)}` : `${method === 'BINANCE' ? num(q.amount, 2) + ' USDT' : money(q.amount, 2)} por ${PM[method].label}${q.fee ? ` (comisión ${money(q.fee, 2)})` : ''}`;
    logAudit(`registró un pago de la factura ${inv.num || inv.id} de ${c ? c.name : '—'}: ${what} · ref. ${ref} · ${fmtDate(date)} · ${settle ? (short ? 'factura saldada con diferencia de ' + money(base - q.usd, 2) : 'factura pagada') : 'abono parcial, saldo ' + money(base - q.usd, 2)}`, state.module === 'cobranza' ? 'cobranza' : 'facturacion');
    closeModal(); toast(settle ? (pg.excess ? `Factura ${inv.num || inv.id} pagada · saldo a favor de ${money(pg.excess, 2)}` : `Factura ${inv.num || inv.id} pagada · ${money(q.usd, 2)}`) : `Abono registrado · falta ${money(base - q.usd, 2)}`); render();
  } else if (kind === 'inv') {
    const err = f.querySelector('.form-err'); const fail = m => { err.textContent = m; err.hidden = false; };
    const concept = (fd.get('concept') || '').trim(), amount = +fd.get('amount'), date = fd.get('date');
    if (!concept) return fail('Escribe el concepto de la inversión.');
    if (!(amount > 0)) return fail('El monto debe ser mayor que cero.');
    if (!date || date < ALL_PERIODS[0] + '-01' || date > DATE_MAX) return fail(`La fecha debe estar entre ${monthYear(ALL_PERIODS[0])} y el ${fmtDate(DATE_MAX)}.`);
    const data = { concept, category: fd.get('category'), date, amount, currency: fd.get('currency') };
    if (f.dataset.id) Object.assign(state.investments.find(v => v.id === f.dataset.id), data); else state.investments.push({ id: 'iv' + Date.now(), ...data });
    store.set('investments_v2', state.investments); logAudit(`${f.dataset.id ? 'editó' : 'registró'} la inversión "${concept}"`); closeModal(); toast(f.dataset.id ? 'Inversión actualizada' : 'Inversión registrada'); render();
  } else if (kind === 'bench') {
    state.benchmarks = state.benchmarks.map(b => ({ ...b, green: +fd.get(b.metricKey + '_green'), yellow: +fd.get(b.metricKey + '_yellow') }));
    store.set('benchmarks', state.benchmarks.map(({ metricKey, green, yellow }) => ({ metricKey, green, yellow }))); logAudit('actualizó los umbrales de métricas'); closeModal(); toast('Umbrales guardados'); render();
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.getElementById('modal').hidden) closeModal(); });


/* ====================== PANTALLA DE INICIO DE SESIÓN (v10 · rebranding con Athena) ======================
   Estilo "Cuenta de Apple": lienzo limpio, Athena como protagonista y un formulario agrupado.
   v10.1 · seguridad local:
   · La clave se guarda SOLO con PBKDF2-SHA256 (310.000 iteraciones y sal aleatoria). El hash de la v10 (FNV, sin sal)
     se borra al entrar; las cuentas con 150.000 iteraciones se refuerzan solas.
   · La sesión dura 12 horas (7 días con "Recuérdame") y las sesiones de la v10 se invalidan para forzar la migración.
   · Restablecer el acceso exige el código de recuperación. Sin él solo se puede borrar este equipo y empezar de cero
     (los datos vuelven con un respaldo). Las cuentas de la v10 que aún no tienen código conservan el método anterior
     una última vez y reciben su código al entrar.
   · Límite de la edición local: los datos viven en este navegador sin cifrar; la protección completa (servidor, sesiones
     reales y roles validados) llega con la versión con servidor. */
let account = store.get('acc_v1', null); // { email, name, kdf: { v, salt, iter, hash }, rec: { v, salt, iter, hash, at } }
const SESS = 'agora_fin_sess';
const KDF_ITER = 310000, PASS_MIN = 8;
function isLogged() {
  if (!account || !(account.kdf || account.hash)) return false;
  try { const v = JSON.parse(sessionStorage.getItem(SESS) || localStorage.getItem(SESS) || 'null'); return !!(v && v.v === 2 && v.email === account.email && v.exp > Date.now() && v.exp - Date.now() <= 8 * 24 * 3600 * 1000); } catch (e) { return false; }
}
function startSession(remember) {
  const v = JSON.stringify({ v: 2, email: account.email, iat: Date.now(), exp: Date.now() + (remember ? 7 * 24 : 12) * 3600 * 1000 });
  try { sessionStorage.setItem(SESS, v); if (remember) localStorage.setItem(SESS, v); else localStorage.removeItem(SESS); } catch (e) {}
}
function endSession() { try { sessionStorage.removeItem(SESS); localStorage.removeItem(SESS); } catch (e) {} unlockedUntil = 0; }
const MARK_SVG = LOGO_ISO();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
const kdfOk = () => !!(window.crypto && crypto.subtle && crypto.getRandomValues);
const ctEq = (a, b) => { a = String(a); b = String(b); if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
async function kdfHash(pass, salt, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
  return b64(bits);
}
async function kdfMake(pass, iter = KDF_ITER) { if (!kdfOk()) return null; const salt = crypto.getRandomValues(new Uint8Array(16)); return { v: 3, salt: b64(salt), iter, hash: await kdfHash(pass, salt, iter) }; }
async function kdfCheck(pass, kdf) { try { return ctEq(await kdfHash(pass, unb64(kdf.salt), kdf.iter), kdf.hash); } catch (e) { return false; } }
// Intentos fallidos de acceso: espera creciente (30 s, 1, 2, 4 y 8 min) desde el quinto
const LOGIN_TRIES = 'agora_fin_login_tries';
const loginTries = () => { try { return JSON.parse(localStorage.getItem(LOGIN_TRIES) || 'null') || { n: 0, until: 0 }; } catch (e) { return { n: 0, until: 0 }; } };
function loginFailed() { const t = loginTries(); t.n++; if (t.n >= 5) t.until = Date.now() + 30000 * Math.pow(2, Math.min(4, t.n - 5)); try { localStorage.setItem(LOGIN_TRIES, JSON.stringify(t)); } catch (e) {} return t; }
function loginOk() { try { localStorage.removeItem(LOGIN_TRIES); } catch (e) {} }
// Código de recuperación: 20 caracteres sin 0/O ni 1/I/L (≈ 99 bits). Se guarda solo su PBKDF2.
const REC_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newRecCode() { const out = []; while (out.length < 20) { for (const x of crypto.getRandomValues(new Uint8Array(32))) if (x < 248 && out.length < 20) out.push(REC_ALPHA[x % 31]); } return out.join('').replace(/(.{5})(?=.)/g, '$1-'); }
const normRec = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
let pendingRec = null; // código recién generado que todavía no confirmas haber guardado (si cierras sin confirmar, se vuelve a ofrecer)
async function issueRecovery() { const code = newRecCode(); const kdf = await kdfMake(normRec(code), 100000); if (!kdf) return null; pendingRec = { code, kdf: { ...kdf, at: new Date().toISOString() } }; return code; }
function recCodeModal(reason) {
  if (!pendingRec) return;
  openModal(`<h2 id="modal-t">Tu código de recuperación</h2>
    <p class="muted">${reason ? esc(reason) + ' ' : ''}Si olvidas tu clave, este código es la única forma de recuperar el acceso sin borrar los datos de este equipo. Guárdalo fuera de la computadora (en papel o en tu gestor de claves): no se vuelve a mostrar.</p>
    <p class="rec-code" aria-label="Código de recuperación">${esc(pendingRec.code)}</p>
    <div class="acts"><button type="button" class="btn" data-rec-copy>Copiar</button><button type="button" class="btn" data-rec-dl>Descargar (.txt)</button></div>
    <label class="lg-rem rec-ack"><input type="checkbox" data-rec-ack> Ya lo guardé en un lugar seguro</label>
    <div class="modal-acts"><button type="button" class="btn btn-cta" data-rec-ok disabled>Listo <span class="cta-dot">${I.arrow}</span></button></div>`);
}
document.addEventListener('change', e => { if (e.target.matches && e.target.matches('[data-rec-ack]')) { const b = document.querySelector('[data-rec-ok]'); if (b) b.disabled = !e.target.checked; } });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-rec-copy],[data-rec-dl],[data-rec-ok]'); if (!b || !pendingRec) return;
  if (b.hasAttribute('data-rec-copy')) { try { navigator.clipboard.writeText(pendingRec.code).then(() => toast('Código copiado'), () => toast('Selecciónalo y cópialo a mano')); } catch (x) { toast('Selecciónalo y cópialo a mano'); } return; }
  if (b.hasAttribute('data-rec-dl')) {
    const txt = `Agora Digital App · código de recuperación\r\nCuenta: ${account ? account.email : ''}\r\nCódigo: ${pendingRec.code}\r\nGenerado: ${new Date().toLocaleString('es-VE')}\r\n\r\nGuárdalo fuera de la computadora. Con este código creas una clave nueva sin perder tus datos.\r\n`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain;charset=utf-8' })); a.download = 'agora-codigo-de-recuperacion.txt'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); return;
  }
  if (b.hasAttribute('data-rec-ok')) { if (!account) return; account.rec = pendingRec.kdf; pendingRec = null; store.set('acc_v1', account); logAudit('activó un código de recuperación nuevo', 'sesion'); closeModal(); toast('Código de recuperación activo'); if (state.module === 'ajustes') render(); }
});
const ATHENA_LINES = ['Entra y te cuento cómo va el mes.', 'Registra pagos en Binance, PayPal, Zelle, efectivo o bolívares con la tasa del día.', 'Haz doble clic en un día de la Agenda y agendas una cita en segundos.', 'Pulsa ⌘K (o Ctrl K) y busca lo que quieras.', 'Dibuja una letra y te llevo al módulo: A es Agenda, C es Caja.'];
function showLogin(mode = 'login', msg = '') {
  document.getElementById('app').hidden = true;
  const L = document.getElementById('login'); L.hidden = false; L.className = 'login v10';
  applyTheme();
  const isNew = mode === 'signup', isReset = mode === 'reset', isWipe = mode === 'wipe';
  const hasRec = !!(account && account.rec);
  const title = isNew ? 'Crea tu acceso' : isWipe ? 'Empezar de cero' : isReset ? 'Recuperar el acceso' : 'Inicia sesión';
  const sub = isNew ? 'Configura tu acceso a Agora Digital App en este equipo.' : isWipe ? 'Sin el código de recuperación no hay forma segura de abrir estos datos.' : isReset ? (hasRec ? 'Usa el código de recuperación que guardaste al crear tu acceso.' : 'El acceso vive solo en este navegador.') : `Bienvenido${account && account.name ? ', ' + esc(account.name.split(' ')[0]) : ''}. Entra a tus finanzas y operaciones.`;
  const sw = isNew ? `¿Ya tienes acceso? <button type="button" class="lnk" data-login="login">Inicia sesión</button>` : (isReset || isWipe) ? `<button type="button" class="lnk" data-login="login">Volver a iniciar sesión</button>` : `¿Primera vez aquí? <button type="button" class="lnk" data-login="signup">Crea tu acceso</button>`;
  const eye = `<button type="button" class="lg-eye" data-eye="k1" aria-label="Mostrar la clave"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button>`;
  const errP = `<p class="lg-err" role="alert" ${msg ? '' : 'hidden'}>${esc(msg)}</p>`;
  const form = isWipe ? `<form class="lg2-form" data-login-form="wipe" novalidate>
      <p class="lg-note">Esto <b>borra todos los datos de este navegador</b> (clientes, facturas, pagos, tasas, citas, gastos y facturero) y crea un acceso nuevo. Si tienes un respaldo (.json), lo restauras después en Ajustes → Respaldo completo.</p>
      <div class="lg2-group"><label class="lg2-f"><input name="conf" autocomplete="off" placeholder=" " aria-label="Confirmación"><span>Escribe BORRAR</span></label></div>
      ${errP}<button class="lg2-btn lg2-danger" type="submit">Borrar este equipo y empezar</button></form>`
    : isReset && hasRec ? `<form class="lg2-form" data-login-form="recover" novalidate>
      <div class="lg2-group">
        <label class="lg2-f"><input name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder=" " aria-label="Código de recuperación"><span>Código de recuperación (XXXXX-XXXXX-XXXXX-XXXXX)</span></label>
        <label class="lg2-f lg-in"><input name="k1" type="password" autocomplete="new-password" placeholder=" "><span>Clave nueva (mínimo ${PASS_MIN} caracteres)</span>${eye}</label>
        <label class="lg2-f"><input name="k2" type="password" autocomplete="new-password" placeholder=" "><span>Repite la clave nueva</span></label>
      </div>
      <p class="lg-note">La clave nueva también será tu clave de edición. Después recibes un código de recuperación nuevo.</p>
      ${errP}<button class="lg2-btn" type="submit">Crear clave nueva</button>
      <button type="button" class="lnk lg-forgot" data-login="wipe">No tengo el código</button></form>`
    : isReset ? `<form class="lg2-form" data-login-form="reset" novalidate>
      <p class="lg-note">Tu acceso es de la versión anterior y todavía no tiene código de recuperación, así que por última vez puedes crear una clave nueva escribiendo <b>RESTABLECER</b>. Tus clientes, facturas y gastos no se borran. Al entrar recibirás tu código de recuperación.</p>
      <div class="lg2-group"><label class="lg2-f"><input name="conf" autocomplete="off" placeholder=" " aria-label="Confirmación"><span>Escribe RESTABLECER</span></label></div>
      ${errP}<button class="lg2-btn" type="submit">Restablecer</button></form>`
    : `<form class="lg2-form" data-login-form="${esc(isNew ? 'signup' : 'login')}" novalidate>
      <div class="lg2-group">
        ${isNew ? `<label class="lg2-f"><input name="name" autocomplete="name" maxlength="60" placeholder=" "><span>Tu nombre (para que Athena te salude)</span></label>` : ''}
        <label class="lg2-f"><input name="email" type="email" autocomplete="username" value="${account && !isNew ? esc(account.email) : ''}" placeholder=" "><span>Correo electrónico</span></label>
        <label class="lg2-f lg-in"><input name="k1" type="password" autocomplete="${isNew ? 'new-password' : 'current-password'}" placeholder=" "><span>${isNew ? `Clave (mínimo ${PASS_MIN} caracteres)` : 'Clave'}</span>${eye}</label>
        ${isNew ? `<label class="lg2-f"><input name="k2" type="password" autocomplete="new-password" placeholder=" "><span>Repite la clave</span></label>` : ''}
      </div>
      <label class="lg-rem"><input type="checkbox" name="remember" ${isNew ? '' : 'checked'}> Recuérdame en este equipo (7 días)</label>
      ${errP}
      <button class="lg2-btn" type="submit">${isNew ? 'Crear acceso y entrar' : 'Continuar'}<span class="lg2-arrow">${I.arrow}</span></button>
      ${isNew ? '' : '<button type="button" class="lnk lg-forgot" data-login="reset">¿Olvidaste tu clave?</button>'}</form>`;
  L.innerHTML = `<div class="lg2">
    <header class="lg2-top"><span class="lg2-logo">${LOGO_H('', 'var(--iso)', 'currentColor')}<small>Digital App</small></span><button type="button" class="tb-ic" data-login-theme="1" aria-label="Cambiar tema">${resolvedTheme() === 'dark' ? I.sun : I.moon}</button></header>
    <main class="lg2-main">
      <section class="lg2-hero" aria-hidden="true"><div class="lg2-halo"></div><img class="lg2-athena" src="assets/img/athena-busto.webp" alt="" width="720" height="756" decoding="async"><div class="lg2-bubble"><span class="lg2-bn">Athena</span><b>Hola, soy Athena.</b> <span data-athena-line>${ATHENA_LINES[0]}</span></div></section>
      <section class="lg2-card" aria-labelledby="lg-t">
        <p class="lg2-k">Finanzas y Operaciones</p>
        <h1 id="lg-t">${title}</h1>
        <p class="lg2-sub">${sub}</p>
        ${form}
        <p class="lg2-switch">${sw}</p>
      </section>
    </main>
    <footer class="lg2-foot"><span>© ${TODAY.slice(0, 4)} Agora Digital App · <b>Cada conversación, una oportunidad.</b></span><span>Tus datos se guardan solo en este equipo · Versión ${APP_VERSION}</span></footer></div>`;
  clearInterval(showLogin.t); let li = 0;
  if (!reduceMotion()) showLogin.t = setInterval(() => { const el = document.querySelector('[data-athena-line]'); if (!el) return clearInterval(showLogin.t); li = (li + 1) % ATHENA_LINES.length; el.classList.add('out'); setTimeout(() => { el.textContent = ATHENA_LINES[li].replace('⌘K (o Ctrl K)', isApple() ? '⌘K' : 'Ctrl K'); el.classList.remove('out'); }, 260); }, 5200);
  const f = L.querySelector('input:not([type=checkbox])'); const fk = account && mode === 'login' ? L.querySelector('[name=k1]') : null; if (fk || f) (fk || f).focus();
}
function enterApp() {
  clearInterval(showLogin.t);
  document.getElementById('login').hidden = true; document.getElementById('login').innerHTML = '';
  document.getElementById('app').hidden = false;
  const r = parseRoute(location.hash); state.module = VIEWS[r.mod] ? r.mod : 'resumen';
  load();
  if (typeof routeAction === 'function') setTimeout(() => routeAction(r), 420);
  if (typeof onEnterApp === 'function') setTimeout(onEnterApp, 600);
  // v10.1: pedir al navegador que no borre los datos por falta de espacio y avisar si el almacenamiento está casi lleno
  if (SRV) { SRV.entered(); return; }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}
  setTimeout(() => { const su = storageUsage(); if (su.pct >= 85) toast(`El almacenamiento de este navegador está al ${Math.round(su.pct)} %. Descarga un respaldo (Ajustes → Datos y seguridad).`, 'bad'); }, 1500);
}
function wipeLocalData() {
  const ks = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && (k.startsWith('agora_fin_') || k.startsWith('agora-'))) ks.push(k); }
  ks.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
  try { sessionStorage.clear(); } catch (e) {}
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-login],[data-eye],#logoutBtn,[data-login-theme]'); if (!b) return;
  if (b.id === 'logoutBtn') { if (SRV) { SRV.logout(); return; } logAudit('cerró sesión', 'sesion'); endSession(); if (typeof closeOverlays === 'function') closeOverlays(); showLogin('login'); return; }
  if (b.dataset.loginTheme) { setThemeLogin(); return; }
  if (b.dataset.login) { showLogin(b.dataset.login); return; }
  if (b.dataset.eye) { const i = b.closest('.lg-in').querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; b.setAttribute('aria-label', i.type === 'password' ? 'Mostrar la clave' : 'Ocultar la clave'); }
}, true);
function setThemeLogin() { state.theme = resolvedTheme() === 'dark' ? 'light' : 'dark'; store.set('theme', state.theme); applyTheme(); const b = document.querySelector('[data-login-theme]'); if (b) b.innerHTML = resolvedTheme() === 'dark' ? I.sun : I.moon; }
document.addEventListener('submit', async e => {
  const f = e.target; const mode = f.dataset && f.dataset.loginForm; if (!mode) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const fd = new FormData(f); const btn = f.querySelector('button[type=submit]');
  const fail = m => { const p = f.querySelector('.lg-err'); p.textContent = m; p.hidden = false; if (btn) btn.disabled = false; f.classList.remove('is-busy'); const card = f.closest('.lg2-card'); if (card && !reduceMotion()) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); } };
  const busy = () => { if (btn) btn.disabled = true; f.classList.add('is-busy'); };
  const clearEditKey = () => { keyKdf = null; keyHash = null; store.del('key_kdf_v1'); store.del('key_hash'); };
  if (mode === 'wipe') {
    if ((fd.get('conf') || '').trim().toUpperCase() !== 'BORRAR') return fail('Escribe BORRAR para confirmar.');
    wipeLocalData(); toast('Datos de este equipo borrados'); setTimeout(() => location.reload(), 500); return;
  }
  if (mode === 'reset') { // solo cuentas de la v10 sin código de recuperación (una última vez)
    if (account && account.rec) return showLogin('reset');
    if ((fd.get('conf') || '').trim().toUpperCase() !== 'RESTABLECER') return fail('Escribe RESTABLECER para confirmar.');
    account = null; store.set('acc_v1', null); clearEditKey(); endSession(); logAudit('restableció el acceso (método anterior, sin código)', 'sesion'); return showLogin('signup');
  }
  if (!kdfOk()) return fail('Este navegador no permite proteger la clave. Ábrela con https o en un navegador actualizado.');
  if (mode === 'recover') {
    const code = normRec(fd.get('code')), k1 = fd.get('k1') || '';
    const t = loginTries(); if (t.until > Date.now()) return fail(`Demasiados intentos. Espera ${Math.ceil((t.until - Date.now()) / 1000)} segundos.`);
    if (code.length !== 20) return fail('El código tiene 20 letras y números (los guiones son opcionales).');
    if (k1.length < PASS_MIN) return fail(`La clave nueva debe tener al menos ${PASS_MIN} caracteres.`);
    if (k1 !== (fd.get('k2') || '')) return fail('Las dos claves no coinciden.');
    busy();
    if (!account || !account.rec || !(await kdfCheck(code, account.rec))) { loginFailed(); return fail('Ese código no corresponde a este acceso.'); }
    loginOk();
    account.kdf = await kdfMake(k1); delete account.hash; account.rec = null; store.set('acc_v1', account);
    try { await setEditKey(k1); } catch (x) {}
    startSession(false); logAudit('recuperó el acceso con el código de recuperación y creó una clave nueva', 'sesion');
    enterApp(); await issueRecovery(); setTimeout(() => recCodeModal('Tu código anterior ya no sirve.'), 800); return;
  }
  const email = (fd.get('email') || '').trim().toLowerCase(), k1 = fd.get('k1') || '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Escribe un correo válido.');
  if (mode === 'signup') {
    if (k1.length < PASS_MIN) return fail(`La clave debe tener al menos ${PASS_MIN} caracteres.`);
    if (k1 !== (fd.get('k2') || '')) return fail('Las dos claves no coinciden.');
    busy();
    const kdf = await kdfMake(k1); if (!kdf) return fail('No se pudo proteger la clave en este navegador.');
    account = { email, name: (fd.get('name') || '').trim().slice(0, 60), kdf };
    store.set('acc_v1', account);
    if (!hasEditKey()) { try { await setEditKey(k1); } catch (x) {} }
    startSession(!!fd.get('remember')); logAudit(`creó el acceso (${email})`, 'sesion'); loginOk();
    enterApp(); await issueRecovery(); setTimeout(() => recCodeModal(), 800); return;
  }
  const t = loginTries(); if (t.until > Date.now()) return fail(`Demasiados intentos. Espera ${Math.ceil((t.until - Date.now()) / 1000)} segundos.`);
  busy();
  if (!account || email !== account.email) { loginFailed(); return fail('El correo o la clave no coinciden.'); }
  let ok = false;
  if (account.kdf) ok = await kdfCheck(k1, account.kdf);
  else if (account.hash && hashKey(k1) === account.hash) ok = true; // cuenta de la v9/v10 sin PBKDF2
  if (!ok) { const tt = loginFailed(); if (tt.n === 5) logAudit('5 intentos fallidos de acceso: bloqueo temporal', 'sesion'); return fail('El correo o la clave no coinciden.'); }
  loginOk();
  if (account.hash || !account.kdf || account.kdf.iter < KDF_ITER) { // borrar el hash débil y subir a 310.000 iteraciones
    const k = await kdfMake(k1); if (k) { account.kdf = k; delete account.hash; store.set('acc_v1', account); logAudit('reforzó la protección de su clave (PBKDF2, 310.000 iteraciones)', 'sesion'); }
  }
  startSession(!!fd.get('remember')); logAudit('inició sesión', 'sesion'); enterApp();
  if (!account.rec) { await issueRecovery(); setTimeout(() => recCodeModal('Nuevo en la versión 10.1.'), 900); }
}, true);

/* ====================== INICIO ====================== */
(function init() {
  lsRaw('agora-catalogo-v1', []).forEach(fc => { if (fc && fc.nombre && !catalog.some(x => x.id === fc.id || normTxt(x.name) === normTxt(fc.nombre))) catalog.push({ id: fc.id || 'custom-' + hashStr(fc.nombre).toString(36), short: fc.nombre.slice(0, 60), name: fc.nombre, desc: fc.desc || '', price: fc.precio, tipo: 'unico', recurring: false, custom: true, hours: 0 }); });
  store.set('catalog_v1', catalog);
  { const ds = importedInv.map(f => (f.issueDate || '').slice(0, 7)).filter(Boolean).sort(); extendPeriods(ds[0], ds[ds.length - 1]); }
  try { runRecurring(true); } catch (x) { console.warn(x); }
  rebuild();
  try { syncFromFacturero(false); } catch (x) { console.warn(x); }
  { const g = document.getElementById('agora-logo'); if (g) g.innerHTML = `<path fill="var(--iso)" fill-rule="evenodd" d="${ISO_D}"/><path fill="currentColor" fill-rule="evenodd" d="${WORD_D}"/>`; }
  applyTheme();
  if (SRV) enterApp(); else if (isLogged()) enterApp(); else showLogin(account ? 'login' : 'signup');
})();

