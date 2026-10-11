<?php
/**
 * Horarios ocupados de un día (escasez real para el formulario).
 * GET /api/disponibilidad.php?fecha=AAAA-MM-DD → {"taken":["10:00", …]}
 * - Sin sesión ni cookies: barato de servir.
 * - Microcaché de 20 s por fecha: una inundación de consultas no llega a MySQL.
 */
declare(strict_types=1);
require __DIR__ . '/_bootstrap.php';

require_method('GET');
require_same_origin($CONFIG, false);
rate_limit($CONFIG, 'disponibilidad', 60, 600);
rate_limit($CONFIG, 'disponibilidad', 3000, 60, false);

$fecha = is_string($_GET['fecha'] ?? null) ? $_GET['fecha'] : '';
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
    respond(422, ['error' => 'validation']);
}
$tz = new DateTimeZone($CONFIG['timezone']);
$day = DateTimeImmutable::createFromFormat('!Y-m-d', $fecha, $tz);
$today = new DateTimeImmutable('today', $tz);
if (!$day || $day->format('Y-m-d') !== $fecha || $day < $today || $day > $today->modify('+60 days')) {
    respond(422, ['error' => 'validation']);
}

header('Cache-Control: private, max-age=20');
$cache = rtrim((string)$CONFIG['rate_dir'], '/') . '/disp-' . $fecha . '.json';
if (is_file($cache) && filemtime($cache) > time() - 20) {
    $hit = json_decode((string)file_get_contents($cache), true);
    if (is_array($hit)) {
        respond(200, ['taken' => $hit]);
    }
}

$stmt = db($CONFIG)->prepare(
    "SELECT DATE_FORMAT(inicio_activo, '%H:%i') AS h
       FROM diagnosticos
      WHERE inicio_activo >= :desde AND inicio_activo < :hasta"
);
$stmt->execute([':desde' => $day->format('Y-m-d 00:00:00'), ':hasta' => $day->modify('+1 day')->format('Y-m-d 00:00:00')]);
$taken = array_values(array_intersect($CONFIG['slots'], array_column($stmt->fetchAll(), 'h')));
@file_put_contents($cache, json_encode($taken), LOCK_EX);

respond(200, ['taken' => $taken]);
