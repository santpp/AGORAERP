<?php
/**
 * Agora Digital App · migrador de la base de datos (v11)
 * Uso (SSH de Hostinger o terminal):
 *   php agora_app/database/migrate.php            aplica los módulos pendientes
 *   php agora_app/database/migrate.php --estado   muestra qué está aplicado
 * Alternativa sin SSH: importa cada archivo de database/modules/ en orden desde phpMyAdmin (hPanel).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require dirname(__DIR__) . '/bootstrap.php';

use Agora\Core\Clock;
use Agora\Core\Db;
use Agora\Core\SqlScript;

$db = Db::fromEnv();
\Agora\Core\Migrator::run($db, in_array('--estado', $argv, true));
exit(0);
