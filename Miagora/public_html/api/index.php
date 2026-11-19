<?php
/** Agora Digital App · servidor · API (todas las rutas /api/v1/...) */
declare(strict_types=1);

$agoraApp = getenv('AGORA_APP_DIR') ?: (static function (string $dir): string {
    // agora_app va FUERA de la web: se busca subiendo carpetas (sitio principal o subdominio dentro de public_html)
    for ($i = 0; $i < 4; $i++) {
        $dir = dirname($dir);
        if (!preg_match('#/public_html(/|$)#', $dir) && is_file($dir . '/agora_app/bootstrap.php')) {
            return $dir . '/agora_app';
        }
    }
    http_response_code(500);
    exit('Agora Digital App: falta la carpeta agora_app al lado de public_html (fuera de la web).');
})(__DIR__);
require $agoraApp . '/bootstrap.php';

if ($app = \Agora\App::boot('api')) {
    $app->run();
}
