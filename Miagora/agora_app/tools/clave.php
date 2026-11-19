<?php
/**
 * Cambia la clave de un usuario desde SSH (sin correo ni enlace). Pide la clave en pantalla sin mostrarla.
 *     php agora_app/tools/clave.php --correo=info@agoradigital.app
 * Desbloquea la cuenta y reinicia los intentos fallidos. El inicio de sesión con MFA por correo sigue necesitando el correo.
 */
declare(strict_types=1);
require __DIR__ . '/_cli.php';

use Agora\Security\Password;

cli_run(function () use ($argv): void {
    $a = cli_args($argv);
    $correo = strtolower(trim((string) ($a['correo'] ?? '')));
    if ($correo === '' || !filter_var($correo, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('Indica el correo con --correo=usuario@dominio');
    }

    $app = new \Agora\App();
    $u = $app->db->one('SELECT id, name, email FROM users WHERE email = ?', [$correo]);
    if (!$u) {
        throw new RuntimeException('No existe ningún usuario con ese correo.');
    }
    cli_ok('Usuario: ' . $u['name'] . ' <' . $u['email'] . '>');

    $clave = cli_secret('Nueva clave (no se muestra)');
    $repite = cli_secret('Repite la nueva clave');
    if ($clave !== $repite) {
        throw new RuntimeException('Las claves no coinciden. No se cambió nada.');
    }
    Password::assertPolicy($clave, $u['email'], (string) $u['name']);

    $ahora = \Agora\Core\Clock::ts();
    $app->db->update('users', [
        'password_hash' => Password::hash($clave),
        'password_changed_at' => $ahora,
        'failed_logins' => 0,
        'locked_until' => null,
        'updated_at' => $ahora,
    ], ['id' => (int) $u['id']]);

    cli_ok('Clave cambiada. Ya puedes iniciar sesión.');
});
