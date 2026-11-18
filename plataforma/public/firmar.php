<?php

/**
 * Página de firma del cliente: /firmar?t=TOKEN (público, sin cuenta).
 * Con ?documento=TOKEN entrega el PDF enviado para que el cliente lo revise.
 * Funciona en el repositorio (contratos/public/) y en el servidor (public_html/, con el código en ../contratos/).
 */

declare(strict_types=1);

$base = is_file(__DIR__ . '/../contratos/src/Web/arranque.php') ? __DIR__ . '/../contratos' : __DIR__ . '/..';
// Sin emitir.php: esta página no responde JSON.
require $base . '/src/Web/arranque.php';

use Agora\Plataforma\Servicio\ContratoServicio;
use Agora\Plataforma\Servicio\ErrorContrato;

$token = (string) ($_GET['t'] ?? $_GET['documento'] ?? '');
$servicio = new ContratoServicio($pdo, null, $generador, $documentos);

if (isset($_GET['descarga'])) {
    // Enlace del correo: copia del convenio firmado (vence a los 30 días).
    try {
        $ruta = $servicio->documentoFirmadoDeDescarga((string) $_GET['descarga']);
    } catch (ErrorContrato $e) {
        http_response_code($e->http);
        header('Content-Type: text/plain; charset=utf-8');
        echo $e->getMessage();
        exit;
    }
    header('Content-Type: application/pdf');
    header('Content-Disposition: inline; filename="convenio-firmado-asocim.pdf"');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: frame-ancestors 'self'");
    readfile($ruta);
    exit;
}

if (isset($_GET['documento'])) {
    try {
        $ruta = $servicio->documentoDeEnlace($token);
    } catch (ErrorContrato $e) {
        http_response_code($e->http);
        header('Content-Type: text/plain; charset=utf-8');
        echo $e->getMessage();
        exit;
    }
    header('Content-Type: application/pdf');
    header('Content-Disposition: inline; filename="convenio-asocim.pdf"');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: frame-ancestors 'self'");
    readfile($ruta);
    exit;
}

header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
// Solo se ejecutan el estilo y el script de esta página (con el nonce de esta petición). Sin recursos externos.
$nonce = base64_encode(random_bytes(16));
header("Content-Security-Policy: default-src 'none'; script-src 'nonce-{$nonce}'; style-src 'nonce-{$nonce}'; "
    . "img-src 'self' data:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; "
    . "form-action 'none'; frame-ancestors 'none'");
?>
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Firma del convenio · ASOCIM</title>
<style nonce="<?= $nonce ?>">
  :root {
    --navy: #1A1070;
    --orange: #F86000;
    --bg: #F4F5F9;
    --card: #FFFFFF;
    --texto: #1B1B2F;
    --suave: #6B6F85;
    --borde: #D9DBE7;
    --error: #B42318;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #121224; --card: #1C1C34; --texto: #F2F2F8; --suave: #A9ACC4; --borde: #33355A;
    }
  }
  :root[data-theme="dark"] {
    --bg: #121224; --card: #1C1C34; --texto: #F2F2F8; --suave: #A9ACC4; --borde: #33355A;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--texto);
    font-family: Helvetica, Arial, sans-serif; font-size: 16px; line-height: 1.45;
  }
  header { background: var(--navy); color: #fff; padding: 14px 16px; }
  header strong { font-size: 18px; letter-spacing: .02em; }
  main { max-width: 680px; margin: 0 auto; padding: 16px; display: grid; gap: 16px; }
  .card { background: var(--card); border: 1px solid var(--borde); border-radius: 12px; padding: 16px; }
  h1 { font-size: 20px; margin: 0 0 6px; color: var(--navy); }
  h2 { font-size: 16px; margin: 0 0 10px; }
  .suave { color: var(--suave); font-size: 14px; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0; }
  dt { color: var(--suave); }
  dd { margin: 0; font-weight: 600; text-align: right; }
  .cuotas { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
  .cuotas td { padding: 6px 0; border-top: 1px solid var(--borde); }
  .cuotas td:last-child { text-align: right; }
  iframe { width: 100%; height: 60vh; min-height: 360px; border: 1px solid var(--borde); border-radius: 8px; background: #fff; }
  label { display: block; font-weight: 600; margin-bottom: 6px; }
  input[type=text] {
    width: 100%; font: inherit; padding: 12px; border: 1px solid var(--borde);
    border-radius: 8px; background: var(--card); color: var(--texto);
  }
  canvas {
    width: 100%; height: 180px; display: block; touch-action: none;
    background: #fff; border: 1px dashed var(--suave); border-radius: 8px; cursor: crosshair;
  }
  .fila { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; gap: 8px; }
  button {
    font: inherit; font-weight: 600; border: 0; border-radius: 10px; padding: 14px 18px;
    cursor: pointer; min-height: 48px;
  }
  .secundario { background: transparent; color: var(--navy); border: 1px solid var(--borde); }
  .principal { background: var(--orange); color: #fff; width: 100%; font-size: 17px; }
  button:disabled { opacity: .5; cursor: default; }
  .aviso { color: var(--error); font-weight: 600; min-height: 1.4em; }
  .oculto { display: none !important; }
  .pila { display: grid; gap: 16px; }
  .separado { margin-top: 12px; }
  .separado-firma { margin-top: 14px; }
  .exito { text-align: center; padding: 24px 8px; }
  .exito h1 { color: var(--navy); }
  .legal { font-size: 13px; color: var(--suave); }
</style>
</head>
<body>
<header><strong>ASOCIM</strong> · Convenio de pago</header>
<main>
  <section class="card" id="cargando">
    <p>Cargando tu convenio…</p>
  </section>

  <section class="card oculto" id="error">
    <h1>No podemos mostrar este convenio</h1>
    <p id="error-texto" class="aviso"></p>
    <p class="suave">Si necesitas un enlace nuevo, escribe a la institución.</p>
  </section>

  <div id="contenido" class="oculto pila">
    <section class="card">
      <h1>Hola, <span id="nombre"></span></h1>
      <p class="suave">Revisa tu convenio y, si estás de acuerdo, fírmalo al final.</p>
      <dl class="separado">
        <dt>Precio del curso</dt><dd id="precio"></dd>
        <dt>Cargos</dt><dd id="cargos"></dd>
        <dt>Total a pagar</dt><dd id="total"></dd>
      </dl>
      <table class="cuotas" id="cuotas"></table>
    </section>

    <section class="card">
      <h2>Convenio</h2>
      <iframe id="documento" title="Convenio en PDF"></iframe>
    </section>

    <section class="card">
      <h2>Firma</h2>
      <label for="firmante">Nombre completo</label>
      <input type="text" id="firmante" autocomplete="name" maxlength="120">
      <label for="lienzo" class="separado-firma">Dibuja tu firma</label>
      <canvas id="lienzo"></canvas>
      <div class="fila">
        <button type="button" class="secundario" id="limpiar">Borrar firma</button>
        <span class="suave" id="estado-firma">Sin firma</span>
      </div>
      <p class="aviso" id="aviso"></p>
      <button type="button" class="principal" id="firmar" disabled>Firmar convenio</button>
      <p class="legal separado">Al firmar confirmas que leíste el convenio y que aceptas sus condiciones. Se guarda la fecha, la hora y la dirección desde la que firmas.</p>
    </section>
  </div>

  <section class="card exito oculto" id="listo">
    <h1>Convenio firmado</h1>
    <p>Gracias. Te enviaremos una copia firmada por correo.</p>
  </section>
</main>

<script nonce="<?= $nonce ?>">
(() => {
  const token = new URLSearchParams(location.search).get('t') || '';
  const $ = (id) => document.getElementById(id);
  let firmaVacia = true;

  const mostrarError = (msg) => {
    $('cargando').classList.add('oculto');
    $('error').classList.remove('oculto');
    $('error-texto').textContent = msg;
  };

  async function cargar() {
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) {
      return mostrarError('El enlace no es válido.');
    }
    let datos;
    try {
      const r = await fetch('/api/firmar/' + token, { headers: { Accept: 'application/json' } });
      datos = await r.json();
      if (!r.ok) return mostrarError(datos.error || 'No se pudo cargar el convenio.');
    } catch (e) {
      return mostrarError('No hay conexión. Intenta de nuevo.');
    }
    $('nombre').textContent = datos.cliente.nombre;
    $('precio').textContent = datos.resultado.precio_curso;
    $('cargos').textContent = datos.resultado.total_cargos;
    $('total').textContent = datos.resultado.total_a_pagar;
    const tabla = $('cuotas');
    datos.resultado.cuotas.forEach((c) => {
      const fila = tabla.insertRow();
      fila.insertCell().textContent = 'Cuota ' + c.numero + ' · ' + c.vencimiento;
      fila.insertCell().textContent = c.monto;
    });
    $('documento').src = '/firmar?documento=' + encodeURIComponent(token);
    $('cargando').classList.add('oculto');
    $('contenido').classList.remove('oculto');
    // El lienzo estaba oculto al cargar y medía 0: hay que ajustarlo ahora que es visible.
    ajustar();
  }

  // ---- lienzo de firma (ratón, dedo y lápiz)
  const lienzo = $('lienzo');
  const ctx = lienzo.getContext('2d');
  let dibujando = false;
  let ultimo = null;

  function ajustar() {
    const ratio = window.devicePixelRatio || 1;
    const ancho = lienzo.clientWidth;
    const alto = lienzo.clientHeight;
    lienzo.width = ancho * ratio;
    lienzo.height = alto * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1A1070';
  }

  function punto(e) {
    const r = lienzo.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function actualizarEstado() {
    $('estado-firma').textContent = firmaVacia ? 'Sin firma' : 'Firma lista';
    validar();
  }

  lienzo.addEventListener('pointerdown', (e) => {
    dibujando = true;
    lienzo.setPointerCapture(e.pointerId);
    ultimo = punto(e);
  });
  lienzo.addEventListener('pointermove', (e) => {
    if (!dibujando) return;
    const p = punto(e);
    ctx.beginPath();
    ctx.moveTo(ultimo.x, ultimo.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ultimo = p;
    if (firmaVacia) { firmaVacia = false; actualizarEstado(); }
  });
  const soltar = () => { dibujando = false; };
  lienzo.addEventListener('pointerup', soltar);
  lienzo.addEventListener('pointercancel', soltar);

  $('limpiar').addEventListener('click', () => {
    ctx.clearRect(0, 0, lienzo.clientWidth, lienzo.clientHeight);
    firmaVacia = true;
    actualizarEstado();
  });

  $('firmante').addEventListener('input', validar);
  function validar() {
    $('firmar').disabled = firmaVacia || $('firmante').value.trim() === '';
  }

  window.addEventListener('resize', () => {
    if (firmaVacia) ajustar();
  });

  $('firmar').addEventListener('click', async () => {
    const boton = $('firmar');
    $('aviso').textContent = '';
    boton.disabled = true;
    boton.textContent = 'Firmando…';
    try {
      const r = await fetch('/api/firmar/' + token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          nombre: $('firmante').value.trim(),
          firma: lienzo.toDataURL('image/png'),
        }),
      });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos.error || 'No se pudo firmar.');
      $('contenido').classList.add('oculto');
      $('listo').classList.remove('oculto');
    } catch (e) {
      $('aviso').textContent = e.message;
      boton.disabled = false;
      boton.textContent = 'Firmar convenio';
    }
  });

  ajustar();
  cargar();
})();
</script>
</body>
</html>
