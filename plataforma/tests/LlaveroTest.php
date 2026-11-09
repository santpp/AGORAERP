<?php

declare(strict_types=1);

namespace Agora\Plataforma\Tests;

use Agora\Plataforma\Seguridad\Llavero;
use PHPUnit\Framework\TestCase;

final class LlaveroTest extends TestCase
{
    private string $carpeta;

    protected function setUp(): void
    {
        $this->carpeta = sys_get_temp_dir() . '/llavero-' . bin2hex(random_bytes(4));
    }

    protected function tearDown(): void
    {
        foreach (glob($this->carpeta . '/*') ?: [] as $f) {
            @unlink($f);
        }
        @rmdir($this->carpeta);
    }

    public function test_crea_v1_cifra_con_prefijo_y_descifra(): void
    {
        $l = new Llavero($this->carpeta);
        $c = $l->cifrar('secreto', 'enlaces-firma');
        $this->assertTrue(str_starts_with((string) $c, 'v1:'), (string) $c);
        $this->assertSame('secreto', $l->descifrar((string) $c, 'enlaces-firma'));
        $this->assertSame([1], $l->versiones());
        $this->assertSame('600', substr(sprintf('%o', fileperms($this->carpeta . '/v1.key')), -3));
    }

    public function test_tras_rotar_cifra_la_nueva_y_la_anterior_sigue_descifrando(): void
    {
        $l = new Llavero($this->carpeta);
        $viejo = (string) $l->cifrar('a', 'enlaces-firma');
        $this->assertSame(2, $l->crearVersion());
        $nuevo = (string) $l->cifrar('b', 'enlaces-firma');
        $this->assertTrue(str_starts_with($nuevo, 'v2:'));
        // Otra instancia (otra petición) lee las dos versiones de disco.
        $otra = new Llavero($this->carpeta);
        $this->assertSame('a', $otra->descifrar($viejo, 'enlaces-firma'));
        $this->assertSame('b', $otra->descifrar($nuevo, 'enlaces-firma'));
        // Retirada la v1, sus valores ya no se pueden leer (por eso se recifra antes de borrarla).
        unlink($this->carpeta . '/v1.key');
        $this->assertSame(null, (new Llavero($this->carpeta))->descifrar($viejo, 'enlaces-firma'));
    }

    public function test_cada_uso_tiene_su_subclave_y_la_version_va_autenticada(): void
    {
        $l = new Llavero($this->carpeta);
        $c = (string) $l->cifrar('x', 'enlaces-firma');
        $this->assertSame(null, $l->descifrar($c, 'otro-uso'));
        $l->crearVersion();
        // Cambiar el prefijo a otra versión existente no engaña al descifrado.
        $this->assertSame(null, $l->descifrar('v2:' . substr($c, 3), 'enlaces-firma'));
        // Un byte alterado tampoco pasa.
        $bruto = base64_decode(substr($c, 3));
        $bruto[20] = chr(ord($bruto[20]) ^ 1);
        $this->assertSame(null, $l->descifrar('v1:' . base64_encode($bruto), 'enlaces-firma'));
    }

    public function test_descifra_el_formato_anterior_sin_prefijo(): void
    {
        $clave = random_bytes(32);
        // Formato de contratos/: base64(iv | tag | cifrado) con la clave tal cual, sin HKDF ni prefijo.
        $iv = random_bytes(12);
        $tag = '';
        $cifrado = openssl_encrypt('token-viejo', 'aes-256-gcm', $clave, OPENSSL_RAW_DATA, $iv, $tag);
        $antiguo = base64_encode($iv . $tag . $cifrado);
        $this->assertSame(0, Llavero::versionDe($antiguo));
        $this->assertSame(0, Llavero::versionDe('vXYZ' . $antiguo), 'el base64 puede empezar por v');
        $this->assertSame('token-viejo', (new Llavero($this->carpeta, [random_bytes(32), $clave]))->descifrar($antiguo, 'enlaces-firma'));
        $this->assertSame(null, (new Llavero($this->carpeta))->descifrar($antiguo, 'enlaces-firma'));
    }

    public function test_sin_carpeta_no_cifra(): void
    {
        $l = new Llavero(null);
        $this->assertTrue(!$l->disponible());
        $this->assertSame(null, $l->cifrar('x', 'enlaces-firma'));
    }
}
