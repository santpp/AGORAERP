<?php

declare(strict_types=1);

namespace Agora\Plataforma\Seguridad;

/**
 * Claves de cifrado con versión, para datos guardados (hoy: los enlaces de firma).
 *
 * - Cada versión es una clave maestra aleatoria de 32 bytes en storage/claves/v{n}.key (fuera de public/).
 *   La versión más alta cifra; todas descifran. Rotar = crear una versión nueva y recifrar (scripts/rotar-claves.php).
 * - De la maestra se deriva una subclave por uso con HKDF-SHA256 (info = "agora-plataforma/{uso}"): una clave nunca
 *   sirve para dos cosas distintas.
 * - Formato guardado: "v{n}:" + base64(iv 12 | tag 16 | cifrado), AES-256-GCM. El encabezado "v{n}:{uso}" va como dato
 *   autenticado: un valor no se puede presentar como de otra versión ni de otro uso.
 * - Valores sin prefijo (formato anterior, también los copiados desde contratos/): se descifran con sha256(APP_CLAVE)
 *   o con storage/clave-enlaces.key, sin derivación. La rotación los pasa al formato nuevo.
 */
final class Llavero
{
    /** @var array<int,string>|null versión => clave maestra */
    private ?array $maestras = null;

    /** @param list<string> $herencia claves de 32 bytes del formato anterior (solo para descifrar) */
    public function __construct(private readonly ?string $carpeta, private readonly array $herencia = [])
    {
    }

    /** Llavero en storage/claves, con las claves del formato anterior que haya (APP_CLAVE, clave-enlaces.key). */
    public static function desdeStorage(?string $storage): self
    {
        $herencia = [];
        $env = getenv('APP_CLAVE') ?: '';
        if ($env !== '') {
            $herencia[] = hash('sha256', $env, true);
        }
        $archivo = $storage === null ? null : $storage . '/clave-enlaces.key';
        if ($archivo !== null && is_file($archivo)) {
            $clave = base64_decode(trim((string) @file_get_contents($archivo)), true);
            if ($clave !== false && strlen($clave) === 32) {
                $herencia[] = $clave;
            }
        }
        return new self($storage === null ? null : $storage . '/claves', $herencia);
    }

    /** ¿Se puede cifrar? Hace falta la carpeta de claves (se crea v1 la primera vez). */
    public function disponible(): bool
    {
        return $this->versionActual() !== null;
    }

    /** Versión que cifra hoy. Si no hay ninguna, crea v1. Null si no hay carpeta o no se puede escribir. */
    public function versionActual(): ?int
    {
        if ($this->carpeta === null) {
            return null;
        }
        if ($this->cargar() === []) {
            $this->escribir(1);
            $this->maestras = null;
        }
        $versiones = array_keys($this->cargar());
        return $versiones === [] ? null : max($versiones);
    }

    /** Crea la versión siguiente (rotación). Desde ese momento cifra la nueva; las anteriores siguen descifrando. */
    public function crearVersion(): int
    {
        if ($this->carpeta === null) {
            throw new \RuntimeException('No hay carpeta de claves.');
        }
        $nueva = ($this->versionActual() ?? 0) + 1;
        if (!$this->escribir($nueva)) {
            throw new \RuntimeException("No se pudo crear la clave v{$nueva} en {$this->carpeta}.");
        }
        $this->maestras = null;
        return $nueva;
    }

    public function cifrar(string $texto, string $uso): ?string
    {
        $version = $this->versionActual();
        if ($version === null) {
            return null;
        }
        $iv = random_bytes(12);
        $tag = '';
        $cifrado = openssl_encrypt($texto, 'aes-256-gcm', $this->subclave($this->cargar()[$version], $uso), OPENSSL_RAW_DATA, $iv, $tag, "v{$version}:{$uso}");
        return "v{$version}:" . base64_encode($iv . $tag . $cifrado);
    }

    /** Texto original, o null si el valor está dañado o su clave ya no existe. */
    public function descifrar(string $guardado, string $uso): ?string
    {
        $version = self::versionDe($guardado);
        if ($version === 0) {
            foreach ($this->herencia as $clave) {
                $texto = $this->abrir($guardado, $clave, '');
                if ($texto !== null) {
                    return $texto;
                }
            }
            return null;
        }
        $maestra = $this->cargar()[$version] ?? null;
        if ($maestra === null) {
            return null;
        }
        return $this->abrir(substr($guardado, strlen("v{$version}:")), $this->subclave($maestra, $uso), "v{$version}:{$uso}");
    }

    /**
     * Versión con que se cifró un valor; 0 = formato anterior. El base64 puede empezar por "v" pero nunca lleva ":",
     * así que solo el prefijo completo "v{n}:" marca el formato nuevo.
     */
    public static function versionDe(string $guardado): int
    {
        return preg_match('/^v([1-9][0-9]{0,5}):/', $guardado, $m) ? (int) $m[1] : 0;
    }

    /** @return list<int> versiones que hay en la carpeta, de menor a mayor */
    public function versiones(): array
    {
        $v = array_keys($this->cargar());
        sort($v);
        return $v;
    }

    private function subclave(string $maestra, string $uso): string
    {
        return hash_hkdf('sha256', $maestra, 32, 'agora-plataforma/' . $uso);
    }

    private function abrir(string $base64, string $clave, string $aad): ?string
    {
        $bruto = base64_decode($base64, true);
        if ($bruto === false || strlen($bruto) < 28) {
            return null;
        }
        $texto = openssl_decrypt(substr($bruto, 28), 'aes-256-gcm', $clave, OPENSSL_RAW_DATA, substr($bruto, 0, 12), substr($bruto, 12, 16), $aad);
        return $texto === false ? null : $texto;
    }

    /** @return array<int,string> */
    private function cargar(): array
    {
        if ($this->maestras !== null) {
            return $this->maestras;
        }
        $this->maestras = [];
        foreach (glob($this->carpeta . '/v*.key') ?: [] as $archivo) {
            if (!preg_match('/^v([1-9][0-9]{0,5})\.key$/', basename($archivo), $m)) {
                continue;
            }
            $clave = base64_decode(trim((string) @file_get_contents($archivo)), true);
            if ($clave === false || strlen($clave) !== 32) {
                error_log('[plataforma] Clave dañada, se ignora: ' . basename($archivo));
                continue;
            }
            $this->maestras[(int) $m[1]] = $clave;
        }
        return $this->maestras;
    }

    /** 'x' crea el archivo solo si no existe: dos peticiones a la vez no generan claves distintas. */
    private function escribir(int $version): bool
    {
        @mkdir($this->carpeta, 0700, true);
        $f = @fopen("{$this->carpeta}/v{$version}.key", 'x');
        if ($f === false) {
            return is_file("{$this->carpeta}/v{$version}.key");
        }
        fwrite($f, base64_encode(random_bytes(32)));
        fclose($f);
        @chmod("{$this->carpeta}/v{$version}.key", 0600);
        return true;
    }
}
