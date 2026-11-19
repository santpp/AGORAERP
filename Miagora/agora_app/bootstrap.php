<?php
/**
 * Agora Digital App · servidor v11 · arranque común (API, página, tareas programadas y herramientas).
 * Esta carpeta (agora_app/) vive FUERA de public_html: nada de aquí se puede descargar por la web.
 */
declare(strict_types=1);

if (!defined('AGORA_APP')) {
    define('AGORA_APP', __DIR__);
}
if (PHP_VERSION_ID < 80100) {
    http_response_code(500);
    exit('Agora Digital App necesita PHP 8.1 o superior (hPanel → Avanzado → Configuración de PHP).');
}

spl_autoload_register(static function (string $class): void {
    if (strncmp($class, 'Agora\\', 6) !== 0) {
        return;
    }
    $file = AGORA_APP . '/src/' . str_replace('\\', '/', substr($class, 6)) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

date_default_timezone_set('UTC');
mb_internal_encoding('UTF-8');

\Agora\Core\Env::load(getenv('AGORA_ENV_FILE') ?: AGORA_APP . '/.env');

// En producción nunca se muestran errores en pantalla (se registran en storage/logs)
$prod = !in_array(\Agora\Core\Env::str('APP_ENV', 'production'), ['development', 'test'], true); // ante la duda, producción
ini_set('display_errors', $prod ? '0' : '1');
ini_set('log_errors', '1');
error_reporting(E_ALL);
set_error_handler(static function (int $no, string $msg, string $file, int $line): bool {
    if (!(error_reporting() & $no)) {
        return false;
    }
    throw new \ErrorException($msg, 0, $no, $file, $line);
});
