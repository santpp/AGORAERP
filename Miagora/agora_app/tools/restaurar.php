<?php
/**
 * Restaura un respaldo cifrado (.sql.gz.agbk) en la base configurada en .env.
 * ¡Reemplaza TODAS las tablas! Hazlo con la app en mantenimiento.
 *     php agora_app/tools/restaurar.php --archivo=storage/respaldos/agora-20261005-031500-diario.sql.gz.agbk --confirmar
 *     php agora_app/tools/restaurar.php --archivo=... --probar      (solo descifra y cuenta, sin tocar la base)
 *     php agora_app/tools/restaurar.php --archivos=...-archivos.json.agbk --salida=/ruta  (recupera .env y manifiesto)
 */
declare(strict_types=1);
require __DIR__ . '/_cli.php';

cli_run(function () use ($argv): void {
    $a = cli_args($argv);
    if (!empty($a['archivos'])) {
        $in = (string) $a['archivos'];
        $tmp = sys_get_temp_dir() . '/agora-archivos-' . bin2hex(random_bytes(4));
        \Agora\Security\Crypto::decryptFile($in, $tmp);
        $j = json_decode((string) file_get_contents($tmp), true) ?: [];
        @unlink($tmp);
        $dest = rtrim((string) ($a['salida'] ?? sys_get_temp_dir() . '/agora-recuperado'), '/');
        @mkdir($dest, 0700, true);
        foreach ($j['archivos'] ?? [] as $name => $b64) {
            $path = $dest . '/' . str_replace(['..', '/'], ['', '__'], (string) $name);
            file_put_contents($path, base64_decode((string) $b64));
            chmod($path, 0600);
            cli_ok('Recuperado: ' . $path);
        }
        return;
    }
    $file = (string) ($a['archivo'] ?? '');
    if ($file === '' || !is_file($file)) {
        throw new RuntimeException('Indica el respaldo con --archivo=ruta');
    }
    if (!empty($a['probar'])) {
        $tmp = sys_get_temp_dir() . '/agora-prueba-' . bin2hex(random_bytes(4)) . '.sql.gz';
        \Agora\Security\Crypto::decryptFile($file, $tmp);
        $gz = gzopen($tmp, 'rb');
        $n = 0;
        $ins = 0;
        while (($l = gzgets($gz, 1 << 20)) !== false) {
            $n++;
            if (str_starts_with($l, 'INSERT INTO')) {
                $ins++;
            }
        }
        gzclose($gz);
        @unlink($tmp);
        cli_ok("El respaldo se descifra bien: {$n} líneas, {$ins} bloques de datos. No se tocó la base.");
        return;
    }
    if (empty($a['confirmar'])) {
        throw new RuntimeException('Esto reemplaza toda la base. Repite con --confirmar (o usa --probar para revisar el archivo).');
    }
    $app = new \Agora\App();
    $r = $app->backup()->restore($file);
    cli_ok('Restaurado: ' . $r['sentencias'] . ' sentencias. Corre tools/manifiesto.php si también reinstalaste los archivos.');
});
