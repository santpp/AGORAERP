<?php
declare(strict_types=1);

namespace Agora\Security;

use Agora\Core\Env;

/** Cifrado de archivos (respaldos) con libsodium: XChaCha20-Poly1305 por bloques (secretstream). */
final class Crypto
{
    private const MAGIC = "AGBK1\n";
    private const CHUNK = 65536;

    public static function backupKey(): string
    {
        // la clave real es un derivado de 32 bytes del secreto del .env
        return sodium_crypto_generichash(Env::secret('BACKUP_KEY'), 'agora-respaldo-v1', SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_KEYBYTES);
    }

    public static function encryptFile(string $in, string $out, ?string $key = null): void
    {
        $key ??= self::backupKey();
        $fi = fopen($in, 'rb');
        $fo = fopen($out, 'wb');
        if (!$fi || !$fo) {
            throw new \RuntimeException('No se pudo abrir el archivo para cifrar');
        }
        [$state, $header] = sodium_crypto_secretstream_xchacha20poly1305_init_push($key);
        fwrite($fo, self::MAGIC . $header);
        $size = filesize($in);
        $read = 0;
        do {
            $chunk = (string) fread($fi, self::CHUNK);
            $read += strlen($chunk);
            $tag = $read >= $size ? SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_FINAL : SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_MESSAGE;
            fwrite($fo, sodium_crypto_secretstream_xchacha20poly1305_push($state, $chunk, '', $tag));
        } while ($read < $size);
        fclose($fi);
        fclose($fo);
        sodium_memzero($key);
    }

    public static function decryptFile(string $in, string $out, ?string $key = null): void
    {
        $key ??= self::backupKey();
        $fi = fopen($in, 'rb');
        $fo = fopen($out, 'wb');
        if (!$fi || !$fo) {
            throw new \RuntimeException('No se pudo abrir el respaldo');
        }
        if (fread($fi, strlen(self::MAGIC)) !== self::MAGIC) {
            throw new \RuntimeException('El archivo no es un respaldo cifrado de Agora');
        }
        $header = (string) fread($fi, SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_HEADERBYTES);
        $state = sodium_crypto_secretstream_xchacha20poly1305_init_pull($header, $key);
        $done = false;
        while (!feof($fi)) {
            $c = (string) fread($fi, self::CHUNK + SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_ABYTES);
            if ($c === '') {
                break;
            }
            $r = sodium_crypto_secretstream_xchacha20poly1305_pull($state, $c);
            if ($r === false) {
                throw new \RuntimeException('El respaldo está dañado o la clave no corresponde');
            }
            [$plain, $tag] = $r;
            fwrite($fo, $plain);
            if ($tag === SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_FINAL) {
                $done = true;
                break;
            }
        }
        fclose($fi);
        fclose($fo);
        if (!$done) {
            throw new \RuntimeException('El respaldo está incompleto (truncado)');
        }
    }
}
