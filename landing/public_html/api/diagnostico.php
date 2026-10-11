<?php
/**
 * Reserva del diagnóstico de ventas gratis (captación de prospectos).
 * Orden: guardia barata → validación por lista blanca → MySQL (consulta
 * preparada; un índice único impide dos reservas en el mismo horario) →
 * aviso por correo → reenvío al webhook de GoHighLevel (opcional).
 */
declare(strict_types=1);
require __DIR__ . '/_bootstrap.php';

$body = guard_post($CONFIG, 'diagnostico', 5, 3600, 300);

$utm = '/^[A-Za-z0-9._\-]{1,60}$/';
$data = validate($body, [
    'objetivo' => ['required' => true, 'in' => ['crm', 'finanzas', 'ambos']],
    'nombre' => ['required' => true, 'max' => 80, 'regex' => "/^[\\p{L}][\\p{L}\\p{M}' .-]{1,79}$/u"],
    'telefono' => ['required' => true, 'max' => 20, 'regex' => '/^[+\d][\d ()-]{6,19}$/'],
    'equipo' => ['required' => true, 'in' => ['1-3', '4-10', '11-20', '21+']],
    'fecha' => ['required' => true, 'max' => 10, 'regex' => '/^\d{4}-\d{2}-\d{2}$/'],
    'hora' => ['required' => true, 'in' => $CONFIG['slots']],
    'empresa' => ['required' => false, 'max' => 80, 'regex' => "/^[\\p{L}\\p{N}][\\p{L}\\p{M}\\p{N}&'.,() -]{1,79}$/u"],
    'correo' => ['required' => false, 'max' => 120, 'type' => 'email'],
    'mensaje' => ['required' => false, 'max' => 500, 'multiline' => true],
    'plan' => ['required' => false, 'in' => ['Bronce', 'Plata', 'Oro', 'Diamante']],
    'utm_source' => ['required' => false, 'max' => 60, 'regex' => $utm],
    'utm_medium' => ['required' => false, 'max' => 60, 'regex' => $utm],
    'utm_campaign' => ['required' => false, 'max' => 60, 'regex' => $utm],
]);

// Página de origen: informativa, nunca bloquea la reserva
$pagina = clean($body['pagina'] ?? '', 300);
$data['pagina'] = (filter_var($pagina, FILTER_VALIDATE_URL) && str_starts_with($pagina, 'https://')) ? $pagina : null;

$digits = preg_replace('/\D/', '', (string)$data['telefono']);
if (strlen($digits) < 7 || strlen($digits) > 15) {
    respond(422, ['error' => 'validation', 'fields' => ['telefono']]);
}

$tz = new DateTimeZone($CONFIG['timezone']);
$when = DateTimeImmutable::createFromFormat('!Y-m-d H:i', $data['fecha'] . ' ' . $data['hora'], $tz);
$now = new DateTimeImmutable('now', $tz);
if (!$when || $when->format('Y-m-d H:i') !== $data['fecha'] . ' ' . $data['hora'] || $when < $now->modify('+1 hour') || $when > $now->modify('+60 days') || (int)$when->format('N') > 5) {
    respond(422, ['error' => 'validation', 'fields' => ['fecha']]);
}

// Sin carreras: el índice único uq_horario_activo impide dos reservas activas en el mismo horario.
try {
    db($CONFIG)->prepare(
        'INSERT INTO diagnosticos (objetivo, nombre, telefono, equipo, inicio, empresa, correo, mensaje, plan, pagina, utm_source, utm_medium, utm_campaign, ip_hash, creado_en)
         VALUES (:objetivo, :nombre, :telefono, :equipo, :inicio, :empresa, :correo, :mensaje, :plan, :pagina, :us, :um, :uc, :ip, NOW())'
    )->execute([
        ':objetivo' => $data['objetivo'],
        ':nombre' => $data['nombre'],
        ':telefono' => $data['telefono'],
        ':equipo' => $data['equipo'],
        ':inicio' => $when->format('Y-m-d H:i:s'),
        ':empresa' => $data['empresa'],
        ':correo' => $data['correo'],
        ':mensaje' => $data['mensaje'],
        ':plan' => $data['plan'],
        ':pagina' => $data['pagina'],
        ':us' => $data['utm_source'],
        ':um' => $data['utm_medium'],
        ':uc' => $data['utm_campaign'],
        ':ip' => ip_hash($CONFIG),
    ]);
} catch (PDOException $e) {
    if ($e->getCode() === '23000') {
        respond(409, ['error' => 'slot_taken']);
    }
    error_log('agora-api diagnostico: ' . $e->getMessage());
    respond(503, ['error' => 'unavailable']);
}

@unlink(rtrim((string)$CONFIG['rate_dir'], '/') . '/disp-' . $data['fecha'] . '.json');

// Aviso por correo al equipo (sin datos del usuario en las cabeceras: no hay inyección de cabeceras)
$lines = array_map(static fn($k, $v) => $k . ': ' . str_replace(["\r", "\n"], ' ', (string)$v), array_keys($data), $data);
@mail(
    $CONFIG['mail_to'],
    '=?UTF-8?B?' . base64_encode('Nuevo diagnóstico de ventas gratis') . '?=',
    implode("\n", $lines),
    'From: ' . $CONFIG['mail_from'] . "\r\nContent-Type: text/plain; charset=utf-8"
);

// Respuesta inmediata al visitante; el reenvío al CRM ocurre después (PHP-FPM / LiteSpeed)
http_response_code(201);
echo json_encode(['ok' => true]);
if (function_exists('fastcgi_finish_request')) {
    fastcgi_finish_request();
} elseif (function_exists('litespeed_finish_request')) {
    litespeed_finish_request();
}
forward_webhook($CONFIG, $data + [
    'inicio_iso' => $when->format(DATE_ATOM),
    'zona' => $CONFIG['timezone'],
    'origen' => 'landing-3.0',
    'plan_sugerido' => ['1-3' => 'Bronce', '4-10' => 'Plata', '11-20' => 'Oro', '21+' => 'Diamante'][$data['equipo']] ?? '',
]);
exit;
