<?php

declare(strict_types=1);

namespace Agora\Plataforma\Persistencia;

use PDO;

/**
 * Migraciones versionadas: archivos migraciones/<motor>/NNN_nombre.sql, aplicados en orden una sola vez.
 * Cada versión aplicada queda en la tabla `migraciones`. Para un cambio de esquema se añade un archivo nuevo
 * en las dos carpetas (sqlite y mysql); nunca se edita uno ya aplicado.
 */
final class Migrador
{
    private const BLOQUEO = 'contratos_migraciones';

    public function __construct(private readonly PDO $pdo)
    {
    }

    /** 'sqlite' o 'mysql' (MySQL y MariaDB usan las mismas migraciones). */
    public function motor(): string
    {
        $driver = (string) $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
        return match ($driver) {
            'sqlite' => 'sqlite',
            'mysql' => 'mysql',
            default => throw new \RuntimeException("Motor de base no admitido: {$driver}"),
        };
    }

    /**
     * Aplica las migraciones pendientes.
     * @return list<string> versiones aplicadas en esta llamada
     */
    public function aplicar(): array
    {
        $this->crearTablaDeControl();
        if ($this->pendientes() === []) {
            return [];
        }
        $mysql = $this->motor() === 'mysql';
        // En MySQL, un bloqueo con nombre impide que dos peticiones migren a la vez.
        if ($mysql && (int) $this->pdo->query("SELECT GET_LOCK('" . self::BLOQUEO . "', 30)")->fetchColumn() !== 1) {
            throw new \RuntimeException('No se pudo obtener el bloqueo de migraciones.');
        }
        $aplicadas = [];
        try {
            // Se vuelve a leer tras el bloqueo: otra petición pudo haberlas aplicado mientras tanto.
            foreach ($this->pendientes() as $version => $archivo) {
                $this->aplicarArchivo($version, $archivo, $mysql);
                $aplicadas[] = $version;
            }
        } finally {
            if ($mysql) {
                $this->pdo->query("SELECT RELEASE_LOCK('" . self::BLOQUEO . "')");
            }
        }
        return $aplicadas;
    }

    /** @return array<string,string> versión => ruta del archivo, en orden */
    public function pendientes(): array
    {
        $hechas = array_flip($this->pdo->query('SELECT version FROM migraciones')->fetchAll(PDO::FETCH_COLUMN));
        $pendientes = [];
        foreach ($this->archivos() as $version => $archivo) {
            if (!isset($hechas[$version])) {
                $pendientes[$version] = $archivo;
            }
        }
        return $pendientes;
    }

    /** @return array<string,string> */
    private function archivos(): array
    {
        $archivos = glob(__DIR__ . '/migraciones/' . $this->motor() . '/*.sql') ?: [];
        sort($archivos, SORT_STRING);
        $salida = [];
        foreach ($archivos as $archivo) {
            $salida[basename($archivo, '.sql')] = $archivo;
        }
        return $salida;
    }

    private function crearTablaDeControl(): void
    {
        $this->pdo->exec($this->motor() === 'mysql'
            ? 'CREATE TABLE IF NOT EXISTS migraciones (version VARCHAR(100) NOT NULL PRIMARY KEY, aplicada_en DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
            : 'CREATE TABLE IF NOT EXISTS migraciones (version TEXT PRIMARY KEY, aplicada_en TEXT NOT NULL)');
    }

    private function aplicarArchivo(string $version, string $archivo, bool $mysql): void
    {
        $sentencias = self::sentencias((string) file_get_contents($archivo));
        // En SQLite el DDL es transaccional: la migración entra entera o no entra.
        // En MySQL cada CREATE/ALTER confirma solo; por eso las migraciones se escriben idempotentes.
        if (!$mysql) {
            $this->pdo->beginTransaction();
        }
        try {
            foreach ($sentencias as $sql) {
                $this->pdo->exec($sql);
            }
            $this->pdo->prepare('INSERT INTO migraciones (version, aplicada_en) VALUES (?, ?)')
                ->execute([$version, gmdate('Y-m-d H:i:s')]);
            if (!$mysql) {
                $this->pdo->commit();
            }
        } catch (\Throwable $e) {
            if (!$mysql && $this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw new \RuntimeException("Falló la migración {$version}: " . $e->getMessage(), 0, $e);
        }
    }

    /**
     * Divide un archivo SQL en sentencias: quita comentarios de línea («--») y corta en «;» al final de línea.
     * @return list<string>
     */
    public static function sentencias(string $sql): array
    {
        $lineas = array_filter(
            preg_split('/\R/', $sql) ?: [],
            static fn (string $l): bool => !str_starts_with(ltrim($l), '--'),
        );
        $partes = preg_split('/;\s*$/m', implode("\n", $lineas)) ?: [];
        return array_values(array_filter(array_map('trim', $partes), static fn (string $s): bool => $s !== ''));
    }
}
