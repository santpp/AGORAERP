<?php
/**
 * Plantilla de configuración del servidor (Landing 3.0).
 * RECOMENDADO: copia este archivo FUERA de public_html como
 *   /home/TU_USUARIO/agora-config.php
 * (la API lo busca ahí primero). Si tu plan no lo permite, cópialo como
 * api/config.php: el .htaccess bloquea su acceso desde la web.
 * Nunca subas este archivo con datos reales a un repositorio.
 */
declare(strict_types=1);

return [
    // Orígenes que pueden enviar el formulario (exactos, con https://)
    'allowed_origins' => ['https://landing.agoradigital.app'],

    // MySQL / MariaDB (usuario con permisos mínimos: ver database/00_usuario_y_permisos.sql)
    'db_dsn' => 'mysql:host=localhost;dbname=agora;charset=utf8mb4',
    'db_user' => 'agora_web',
    'db_pass' => 'CAMBIAR',

    // Secreto para la huella de IP (64 caracteres): php -r "echo bin2hex(random_bytes(32));"
    'ip_secret' => 'CAMBIAR_POR_64_CARACTERES_ALEATORIOS',

    // reCAPTCHA v3 (vacío = desactivado; el formulario sigue protegido por honeypot, tiempo y límites)
    'recaptcha_secret' => '',
    'recaptcha_min_score' => 0.5,

    // Aviso por correo de cada reserva
    'mail_to' => 'info@agoradigital.app',
    'mail_from' => 'no-responder@agoradigital.app',

    // GoHighLevel: Automation → Workflows → disparador "Inbound Webhook" → copia la URL.
    // Vacío = no se reenvía (la reserva igual queda en MySQL y en el correo).
    'ghl_webhook_url' => '',

    // Carpeta privada para los límites de solicitudes (fuera de public_html si es posible)
    // 'rate_dir' => '/home/TU_USUARIO/agora-rl',

    // 'cloudflare' si el dominio pasa por Cloudflare: usa la IP real del visitante
    // (solo cuando la solicitud llega desde los rangos oficiales de Cloudflare)
    'trust_proxy' => '',

    // Tiempo mínimo (ms) entre pedir el token y enviar el formulario
    'min_fill_ms' => 1200,

    // Deben coincidir con js/config.js
    'slots' => ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
    'timezone' => 'Etc/GMT+4',
];
