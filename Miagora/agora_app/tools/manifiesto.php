<?php
/**
 * Rehace el manifiesto firmado de integridad (lista de archivos y su huella SHA-256).
 * Córrelo SIEMPRE después de subir una versión nueva; si no, la tarea de integridad avisará de "archivos modificados".
 *     php agora_app/tools/manifiesto.php
 */
declare(strict_types=1);
require __DIR__ . '/_cli.php';

cli_run(function (): void {
    $r = \Agora\Security\Integrity::build();
    cli_ok('Manifiesto creado con ' . $r['archivos'] . ' archivos: ' . \Agora\Security\Integrity::manifestPath());
});
