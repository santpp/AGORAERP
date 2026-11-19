<?php
/**
 * Agora Digital App · instalación en el servidor (por SSH, una sola vez).
 *
 *   php agora_app/tools/instalar.php --generar-env            crea .env con secretos al azar (si no existe)
 *   php agora_app/tools/instalar.php                          revisa, crea las tablas y el manifiesto
 *   php agora_app/tools/instalar.php --admin-correo=tu@correo --admin-nombre="Tu nombre"
 *   php agora_app/tools/instalar.php --empresa="Mi Empresa C.A." --plan=ORO --superadmin=dueno@empresa.com
 */
declare(strict_types=1);
require __DIR__ . '/_cli.php';

use Agora\App;
use Agora\Core\Db;
use Agora\Core\Env;
use Agora\Core\Migrator;
use Agora\Security\Integrity;
use Agora\Services\Platform;

cli_run(function () use ($argv): void {
    $a = cli_args($argv);
    cli_out("\nAgora Digital App · instalación del servidor v" . App::VERSION . "\n");

    if (!empty($a['generar-env'])) {
        $target = AGORA_APP . '/.env';
        if (is_file($target)) {
            throw new RuntimeException('Ya existe agora_app/.env: no se reemplaza. Bórralo a mano si de verdad quieres uno nuevo.');
        }
        $tpl = (string) file_get_contents(AGORA_APP . '/.env.example');
        foreach (['AUDIT_KEY', 'OTP_PEPPER', 'INTEGRITY_KEY', 'BACKUP_KEY'] as $k) {
            $tpl = (string) preg_replace('/^' . $k . '=.*$/m', $k . '=' . rtrim(strtr(base64_encode(random_bytes(48)), '+/', '-_'), '='), $tpl);
        }
        file_put_contents($target, $tpl);
        chmod($target, 0600);
        cli_ok('Se creó agora_app/.env con secretos nuevos (permiso 600). Ahora completa la base de datos, el correo y APP_URL.');
        cli_out('  IMPORTANTE: copia BACKUP_KEY a un gestor de claves fuera del servidor: sin ella no se pueden abrir los respaldos.');
        return;
    }

    // 1) PHP y extensiones
    if (PHP_VERSION_ID < 80100) {
        throw new RuntimeException('Se necesita PHP 8.1 o superior (tienes ' . PHP_VERSION . ').');
    }
    $need = ['pdo', 'sodium', 'curl', 'mbstring', 'json', 'openssl', 'zlib'];
    $need[] = Env::str('DB_DRIVER', 'mysql') === 'sqlite' ? 'pdo_sqlite' : 'pdo_mysql';
    $miss = array_filter($need, fn ($e) => !extension_loaded($e));
    if ($miss) {
        throw new RuntimeException('Faltan extensiones de PHP: ' . implode(', ', $miss) . ' (hPanel → Avanzado → Configuración de PHP → Extensiones).');
    }
    cli_ok('PHP ' . PHP_VERSION . ' con las extensiones necesarias');

    // 2) Secretos
    if (!is_file(AGORA_APP . '/.env')) {
        throw new RuntimeException('Falta agora_app/.env. Corre primero: php agora_app/tools/instalar.php --generar-env');
    }
    foreach (['AUDIT_KEY', 'OTP_PEPPER', 'INTEGRITY_KEY', 'BACKUP_KEY'] as $k) {
        Env::secret($k);
    }
    if (Env::isProduction() && !str_starts_with(Env::str('APP_URL'), 'https://')) {
        throw new RuntimeException('APP_URL debe empezar con https:// en producción.');
    }
    cli_ok('Secretos configurados (AUDIT_KEY, OTP_PEPPER, INTEGRITY_KEY, BACKUP_KEY)');

    // 3) Carpetas
    foreach (['storage', 'storage/logs', 'storage/respaldos', 'storage/integridad'] as $d) {
        $p = AGORA_APP . '/' . $d;
        if (!is_dir($p)) {
            mkdir($p, 0750, true);
        }
        if (!is_writable($p)) {
            throw new RuntimeException("No se puede escribir en agora_app/{$d}.");
        }
    }
    @chmod(AGORA_APP . '/storage/respaldos', 0700);
    @chmod(AGORA_APP . '/.env', 0600);
    $pub = Env::str('PUBLIC_DIR', dirname(AGORA_APP) . '/public_html');
    $real = (string) realpath(AGORA_APP);
    if (preg_match('#/public_html(/|$)#', $real) || (is_dir($pub) && str_starts_with($real . '/', realpath($pub) . '/'))) {
        throw new RuntimeException('agora_app está DENTRO de public_html (se podría descargar por la web): muévela al lado, fuera de public_html.');
    }
    if (!is_file($pub . '/index.php') || !str_contains((string) file_get_contents($pub . '/index.php'), 'Agora Digital App')) {
        cli_out('  · Aviso: no encontré la página de la app en ' . $pub . '. Si la subiste a otra carpeta (por ejemplo, un subdominio dentro de public_html), escribe esa ruta en PUBLIC_DIR del .env.');
    }
    cli_ok('Carpetas de trabajo listas (storage/ fuera de la web)');

    // 4) Base de datos
    $db = Db::fromEnv();
    $n = Migrator::run($db, false, true);
    cli_ok('Base de datos al día (' . $n . ' script(s) aplicados ahora)');

    $app = new App($db);
    $platform = new Platform($app);

    // 5) Administrador de la plataforma
    if (!empty($a['admin-correo'])) {
        $pass = (string) ($a['admin-clave'] ?? '');
        if ($pass === '') {
            $pass = cli_secret('Clave del administrador (mínimo 10 caracteres)');
            if ($pass !== cli_secret('Repite la clave')) {
                throw new RuntimeException('Las claves no coinciden.');
            }
        }
        $platform->createPlatformAdmin((string) $a['admin-correo'], (string) ($a['admin-nombre'] ?? 'Administración Agora'), $pass);
        cli_ok('Administrador de la plataforma listo: ' . $a['admin-correo'] . ' (entra con clave + código por correo)');
    } elseif (!(int) $db->value('SELECT COUNT(*) FROM users WHERE is_platform_admin = 1')) {
        cli_out('  · Aún no hay administrador de la plataforma. Créalo con --admin-correo=... --admin-nombre="..."');
    }

    // 6) Primera empresa
    if (!empty($a['empresa'])) {
        $org = $platform->createOrg((string) $a['empresa'], (string) ($a['plan'] ?? 'BRONCE'));
        cli_ok('Empresa creada: ' . $org['nombre'] . ' · plan ' . $org['plan'] . ' · ' . $org['uid']);
        if (!empty($a['superadmin'])) {
            $inv = $platform->createInvitation((int) $org['id'], (string) $a['superadmin'], 'SUPERADMIN', null, 'Agora Digital');
            cli_ok('Invitación de Superadministrador enviada a ' . $a['superadmin'] . ' (vence ' . $inv['vence'] . ')');
            if (!Env::isProduction()) {
                cli_out('  Enlace (solo se muestra fuera de producción): ' . $inv['enlace']);
            }
        }
    }

    // 7) Manifiesto de integridad
    $m = Integrity::build();
    cli_ok('Manifiesto de integridad firmado (' . $m['archivos'] . ' archivos)');

    cli_out("\nÚltimo paso: en hPanel → Avanzado → Tareas Cron, agrega (cada minuto):");
    cli_out('  * * * * *  ' . PHP_BINARY . ' ' . realpath(AGORA_APP . '/cron/tareas.php'));
    cli_out("Y revisa todo con: php agora_app/tools/diagnostico.php\n");
});
