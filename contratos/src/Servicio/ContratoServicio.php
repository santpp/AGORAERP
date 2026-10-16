<?php

declare(strict_types=1);

namespace Asocim\Contratos\Servicio;

use Asocim\Contratos\Calculo\CalculadoraContrato;
use Asocim\Contratos\Calculo\Cargo;
use Asocim\Contratos\Calculo\DatosInvalidos;
use Asocim\Contratos\Calculo\Dinero;
use Asocim\Contratos\Calculo\Resultado;
use Asocim\Contratos\Calculo\Terminos;
use PDO;

/**
 * Reglas de negocio de los contratos: borradores, versiones, envío, revocación y firma.
 * Cada acción valida el estado actual antes de cambiar algo.
 */
final class ContratoServicio
{
    public const DIAS_VALIDEZ_ENLACE = 7;

    private CalculadoraContrato $calculadora;

    public function __construct(private readonly PDO $pdo, private readonly ?\Closure $ahora = null)
    {
        $this->calculadora = new CalculadoraContrato();
    }

    // ------------------------------------------------------------------ GHL

    /**
     * Crea un borrador a partir del webhook de GHL. Si la misma clave llega otra vez, devuelve el existente.
     * @param array<string,mixed> $p
     * @return array{uid:string,duplicado:bool}
     */
    public function crearDesdeWebhook(array $p): array
    {
        $clave = (string) ($p['clave'] ?? '');
        if ($clave !== '') {
            $existente = $this->fila('SELECT uid FROM contratos WHERE clave_webhook = ?', [$clave]);
            if ($existente) {
                return ['uid' => $existente['uid'], 'duplicado' => true];
            }
        }

        $p = self::normalizarPayload($p);
        $cliente = $this->seccion($p, 'cliente');
        $curso = $this->seccion($p, 'curso');
        $responsable = $this->seccion($p, 'responsable');

        $terminos = $this->terminosDesde($curso);
        $this->validarCalculo($terminos);

        $uid = bin2hex(random_bytes(12));
        $this->pdo->beginTransaction();
        try {
            $this->insertar('contratos', [
                'uid' => $uid,
                'sub_cuenta' => $this->texto($p, 'sub_cuenta', 'sub_cuenta'),
                'clave_webhook' => $clave !== '' ? $clave : null,
                'cliente_nombre' => $this->texto($cliente, 'nombre', 'cliente.nombre'),
                'cliente_cedula' => $this->texto($cliente, 'cedula', 'cliente.cedula'),
                'cliente_telefono' => (string) ($cliente['telefono'] ?? ''),
                'cliente_correo' => $this->correo($cliente, 'cliente.correo'),
                'responsable_nombre' => (string) ($responsable['nombre'] ?? ''),
                'responsable_correo' => $this->correo($responsable, 'responsable.correo'),
                'creado_en' => $this->ahora(),
            ]);
            $contratoId = (int) $this->pdo->lastInsertId();
            $this->insertar('versiones', [
                'contrato_id' => $contratoId,
                'numero' => 1,
                'estado' => 'BORRADOR',
                'terminos' => json_encode($terminos, JSON_UNESCAPED_UNICODE),
                'creado_en' => $this->ahora(),
            ]);
            $this->evento($contratoId, null, 'CREADO', ['origen' => 'ghl']);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
        return ['uid' => $uid, 'duplicado' => false];
    }

    // ------------------------------------------------------------------ personal

    /**
     * Cambia los términos. Si la versión ya fue enviada o firmada, crea una versión nueva
     * y revoca los enlaces anteriores. La versión firmada nunca cambia.
     * @param array<string,mixed> $cambios
     */
    public function editar(string $uid, array $cambios): int
    {
        $contrato = $this->contrato($uid);
        $ultima = $this->ultimaVersion((int) $contrato['id']);
        $terminos = array_merge(json_decode($ultima['terminos'], true), $this->terminosDesdeCambios($cambios));
        $this->validarCalculo($terminos);

        if ($ultima['estado'] === 'BORRADOR') {
            $this->pdo->prepare('UPDATE versiones SET terminos = ? WHERE id = ?')
                ->execute([json_encode($terminos, JSON_UNESCAPED_UNICODE), $ultima['id']]);
            return (int) $ultima['numero'];
        }

        $this->pdo->beginTransaction();
        try {
            if ($ultima['estado'] === 'ENVIADO') {
                $this->revocarEnlaces((int) $contrato['id'], (int) $ultima['id'], 'nueva_version');
                $this->pdo->prepare("UPDATE versiones SET estado = 'REVOCADA' WHERE id = ?")->execute([$ultima['id']]);
            }
            $numero = (int) $ultima['numero'] + 1;
            $this->insertar('versiones', [
                'contrato_id' => (int) $contrato['id'],
                'numero' => $numero,
                'estado' => 'BORRADOR',
                'terminos' => json_encode($terminos, JSON_UNESCAPED_UNICODE),
                'creado_en' => $this->ahora(),
            ]);
            $this->evento((int) $contrato['id'], null, 'NUEVA_VERSION', ['numero' => $numero, 'anterior' => $ultima['estado']]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
        return $numero;
    }

    /**
     * Envía la versión actual al cliente: la congela y devuelve el enlace de firma (solo se muestra una vez).
     * @return array{token:string,version:int,vence:string}
     */
    public function enviar(string $uid): array
    {
        $contrato = $this->contrato($uid);
        $version = $this->ultimaVersion((int) $contrato['id']);
        if ($version['estado'] !== 'BORRADOR') {
            throw new ErrorContrato('Solo se puede enviar un borrador. Crea una versión nueva para corregirlo.', 409);
        }
        $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $vence = $this->sumarDias(self::DIAS_VALIDEZ_ENLACE);

        $this->pdo->beginTransaction();
        try {
            $this->pdo->prepare("UPDATE versiones SET estado = 'ENVIADO', enviado_en = ? WHERE id = ?")
                ->execute([$this->ahora(), $version['id']]);
            $this->insertar('tokens_firma', [
                'version_id' => $version['id'],
                'hash' => hash('sha256', $token),
                'expira_en' => $vence,
            ]);
            $this->evento((int) $contrato['id'], (int) $version['id'], 'ENVIADO', ['numero' => (int) $version['numero']]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
        return ['token' => $token, 'version' => (int) $version['numero'], 'vence' => $vence];
    }

    /** Revoca el enlace activo: el cliente ya no puede firmar esa versión. */
    public function revocar(string $uid): void
    {
        $contrato = $this->contrato($uid);
        $version = $this->ultimaVersion((int) $contrato['id']);
        if ($version['estado'] !== 'ENVIADO') {
            throw new ErrorContrato('Solo se puede revocar un contrato enviado y sin firmar.', 409);
        }
        $this->pdo->beginTransaction();
        try {
            $this->revocarEnlaces((int) $contrato['id'], (int) $version['id'], 'revocado_por_personal');
            $this->pdo->prepare("UPDATE versiones SET estado = 'REVOCADA' WHERE id = ?")->execute([$version['id']]);
            $this->evento((int) $contrato['id'], (int) $version['id'], 'REVOCADO', []);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    // ------------------------------------------------------------------ cliente

    /**
     * Datos para la pantalla de firma. No cambia nada en la base.
     * @return array<string,mixed>
     */
    public function paraFirmar(string $token): array
    {
        [$contrato, $version, $enlace] = $this->validarEnlace($token);
        $resultado = $this->calcular($version);
        return [
            'cliente' => ['nombre' => $contrato['cliente_nombre'], 'cedula' => $contrato['cliente_cedula']],
            'version' => (int) $version['numero'],
            'resultado' => $resultado,
            'vence' => $enlace['expira_en'],
        ];
    }

    /**
     * Registra la firma. Copia la misma imagen a todas las cajas de firma del cliente
     * (la lógica del documento la coloca; aquí queda guardada una sola vez).
     * @param array{firma_png:string,nombre:string,ip:string,user_agent:string} $firma
     */
    public function firmar(string $token, array $firma): void
    {
        [$contrato, $version, $enlace] = $this->validarEnlace($token);
        if (trim($firma['nombre']) === '' || $firma['firma_png'] === '') {
            throw new ErrorContrato('Escribe tu nombre y firma en el recuadro.');
        }
        $documento = hash('sha256', (string) $version['terminos'] . '|' . $firma['firma_png']);

        $this->pdo->beginTransaction();
        try {
            $this->insertar('firmas', [
                'version_id' => $version['id'],
                'firma_png' => $firma['firma_png'],
                'nombre_firmante' => trim($firma['nombre']),
                'ip' => $firma['ip'],
                'user_agent' => mb_substr($firma['user_agent'], 0, 255),
                'firmado_en' => $this->ahora(),
                'hash_documento' => $documento,
            ]);
            $this->pdo->prepare("UPDATE versiones SET estado = 'FIRMADO', firmado_en = ? WHERE id = ?")
                ->execute([$this->ahora(), $version['id']]);
            $this->pdo->prepare('UPDATE tokens_firma SET usado_en = ? WHERE id = ?')
                ->execute([$this->ahora(), $enlace['id']]);
            $this->evento((int) $contrato['id'], (int) $version['id'], 'FIRMADO', ['ip' => $firma['ip']]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    // ------------------------------------------------------------------ consultas

    /** @return array<string,mixed> */
    public function ver(string $uid): array
    {
        $contrato = $this->contrato($uid);
        $versiones = $this->fila_todas('SELECT * FROM versiones WHERE contrato_id = ? ORDER BY numero', [$contrato['id']]);
        $ultima = end($versiones);
        return [
            'uid' => $contrato['uid'],
            'cliente' => ['nombre' => $contrato['cliente_nombre'], 'correo' => $contrato['cliente_correo']],
            'estado' => $ultima['estado'],
            'version' => (int) $ultima['numero'],
            'calculo' => $this->calcular($ultima),
        ];
    }

    /**
     * Lista de contratos con el estado de su última versión (más recientes primero).
     * @return list<array<string,mixed>>
     */
    public function listar(): array
    {
        $filas = $this->fila_todas(
            'SELECT c.uid, c.cliente_nombre, c.cliente_correo, c.creado_en,
                    v.numero, v.estado
               FROM contratos c
               JOIN versiones v ON v.contrato_id = c.id
              WHERE v.numero = (SELECT MAX(numero) FROM versiones WHERE contrato_id = c.id)
              ORDER BY c.creado_en DESC, c.id DESC'
        );
        return array_map(fn (array $f) => [
            'uid' => $f['uid'],
            'cliente' => $f['cliente_nombre'],
            'correo' => $f['cliente_correo'],
            'version' => (int) $f['numero'],
            'estado' => $f['estado'],
            'creado_en' => $f['creado_en'],
        ], $filas);
    }

    /** Vista previa de cálculo sin guardar nada (lo que el personal ve al editar). */
    public function previsualizar(array $terminos): Resultado
    {
        $t = $this->construirTerminos($terminos);
        return $this->calculadora->calcular($t);
    }

    // ------------------------------------------------------------------ internos

    /** @return array{0:array,1:array,2:array} contrato, versión y enlace válidos */
    private function validarEnlace(string $token): array
    {
        $enlace = $this->fila('SELECT * FROM tokens_firma WHERE hash = ?', [hash('sha256', $token)]);
        if (!$enlace || $enlace['revocado_en'] !== null) {
            throw new ErrorContrato('Este enlace no es válido.', 404);
        }
        if ($enlace['usado_en'] !== null) {
            throw new ErrorContrato('Este convenio ya fue firmado.', 409);
        }
        if ($enlace['expira_en'] < $this->ahora()) {
            throw new ErrorContrato('El enlace venció. Pide uno nuevo a la institución.', 410);
        }
        $version = $this->fila('SELECT * FROM versiones WHERE id = ?', [$enlace['version_id']]);
        if ($version['estado'] !== 'ENVIADO') {
            throw new ErrorContrato('Este enlace ya no está activo.', 410);
        }
        $contrato = $this->fila('SELECT * FROM contratos WHERE id = ?', [$version['contrato_id']]);
        return [$contrato, $version, $enlace];
    }

    /** @return array{precio_curso:string,cargos:list<array{concepto:string,monto:string}>,total_cargos:string,total_a_pagar:string,cuotas:list<array{numero:int,vencimiento:string,monto:string,mes:int}>} */
    private function calcular(array $version): array
    {
        $r = $this->calculadora->calcular($this->construirTerminos(json_decode($version['terminos'], true)));
        return [
            'precio_curso' => $r->precioCurso->aTexto(),
            'cargos' => array_map(fn (Cargo $c) => ['concepto' => $c->concepto, 'monto' => $c->monto->aTexto()], $r->cargos),
            'total_cargos' => $r->totalCargos->aTexto(),
            'total_a_pagar' => $r->totalAPagar->aTexto(),
            'cuotas' => array_map(fn ($q) => ['numero' => $q->numero, 'vencimiento' => $q->vencimiento, 'monto' => $q->monto->aTexto(), 'mes' => $q->mesNumero], $r->cuotas),
        ];
    }

    /** @param array<string,mixed> $t */
    private function construirTerminos(array $t): Terminos
    {
        $cargos = array_map(
            fn (array $c) => new Cargo((string) $c['concepto'], Dinero::desde((string) $c['monto'])),
            $t['cargos'] ?? [],
        );
        return new Terminos(
            Dinero::desde((string) $t['cuota']),
            (int) $t['meses'],
            (int) $t['anio'],
            (int) $t['mes'],
            (int) ($t['cuotas_por_mes'] ?? 1),
            $cargos,
        );
    }

    /** Convierte la sección "curso" del webhook a términos guardables (montos como texto). */
    private function terminosDesde(array $curso): array
    {
        [$anio, $mes] = self::mesDeInicio((string) ($curso['mes_inicio'] ?? ''));
        $cargos = [];
        foreach ($curso['cargos'] ?? [] as $c) {
            $cargos[] = ['concepto' => (string) $c['concepto'], 'monto' => (string) $c['monto']];
        }
        return [
            'cuota' => (string) ($curso['cuota_mensual'] ?? ''),
            'meses' => (int) ($curso['meses'] ?? 0),
            'anio' => $anio,
            'mes' => $mes,
            'cuotas_por_mes' => (int) ($curso['cuotas_por_mes'] ?? 1),
            'cargos' => $cargos,
        ];
    }

    /**
     * GHL "Custom Data" envía pares planos (cedula, cuota_mensual…). Los convierte a la forma por secciones.
     * Si ya viene por secciones (cliente, curso, responsable), la deja igual.
     * @param array<string,mixed> $p
     * @return array<string,mixed>
     */
    public static function normalizarPayload(array $p): array
    {
        if (isset($p['cliente'])) {
            return $p;
        }
        // Formato estándar de GHL: campos de contacto y de campos personalizados con su nombre
        if (isset($p['contact_id'])) {
            $nombre = trim(($p['first_name'] ?? '') . ' ' . ($p['last_name'] ?? ''));
            return [
                'clave' => (string) $p['contact_id'] . ':' . (string) ($p['workflow']['id'] ?? 'manual'),
                'sub_cuenta' => (string) ($p['location']['id'] ?? ''),
                'cliente' => [
                    'nombre' => $nombre !== '' ? $nombre : ($p['full_name'] ?? ''),
                    'cedula' => $p['Cédula'] ?? $p['cedula'] ?? '',
                    'telefono' => $p['phone'] ?? '',
                    'correo' => $p['email'] ?? '',
                ],
                'curso' => [
                    'cuota_mensual' => $p['cuota mensual'] ?? '',
                    'meses' => $p['meses'] ?? 0,
                    'mes_inicio' => $p['mes inicio'] ?? '',
                    'cuotas_por_mes' => $p['cuotas por mes'] ?? 1,
                    'cargos' => [],
                ],
                'responsable' => [
                    'nombre' => $p['user']['name'] ?? '',
                    'correo' => $p['user']['email'] ?? '',
                ],
            ];
        }
        return [
            'clave' => $p['clave'] ?? '',
            'sub_cuenta' => $p['sub_cuenta'] ?? '',
            'cliente' => [
                'nombre' => $p['nombre_cliente'] ?? '',
                'cedula' => $p['cedula'] ?? '',
                'telefono' => $p['telefono'] ?? '',
                'correo' => $p['correo_cliente'] ?? '',
            ],
            'curso' => [
                'cuota_mensual' => $p['cuota_mensual'] ?? '',
                'meses' => $p['meses'] ?? 0,
                'mes_inicio' => $p['mes_inicio'] ?? '',
                'cuotas_por_mes' => $p['cuotas_por_mes'] ?? 1,
                'cargos' => [],
            ],
            'responsable' => [
                'nombre' => $p['responsable_nombre'] ?? '',
                'correo' => $p['responsable_correo'] ?? '',
            ],
        ];
    }

    /**
     * Año y mes de inicio. Acepta lo que envía GHL en un campo de fecha ("Oct 6, 2026",
     * "10/06/2026" como MM/DD/AAAA, "2026-10-06") y también "2026-10" o "10/2026".
     * El día no importa: el convenio solo usa el mes.
     * @return array{0:int,1:int}
     */
    public static function mesDeInicio(string $texto): array
    {
        $texto = trim($texto);
        $formatos = ['Y-m-d', 'Y-m', 'm/d/Y', 'm/Y', 'M j, Y', 'F j, Y', 'M d, Y', 'F d, Y'];
        foreach ($formatos as $formato) {
            $fecha = \DateTimeImmutable::createFromFormat('!' . $formato, $texto);
            if ($fecha && $fecha->format($formato) === $texto) {
                return [(int) $fecha->format('Y'), (int) $fecha->format('n')];
            }
        }
        if (preg_match('/^(\d{4})-(\d{2})-\d{2}T/', $texto, $m)) {
            return [(int) $m[1], (int) $m[2]];
        }
        throw new ErrorContrato('No entiendo el mes de inicio «' . $texto . '». Usa un campo de fecha de GHL o el formato AAAA-MM.');
    }

    /** @param array<string,mixed> $c */
    private function terminosDesdeCambios(array $c): array
    {
        $salida = [];
        foreach (['cuota', 'meses', 'anio', 'mes', 'cuotas_por_mes', 'cargos'] as $campo) {
            if (array_key_exists($campo, $c)) {
                $salida[$campo] = $c[$campo];
            }
        }
        return $salida;
    }

    private function validarCalculo(array $terminos): void
    {
        try {
            $this->calculadora->calcular($this->construirTerminos($terminos));
        } catch (DatosInvalidos $e) {
            throw new ErrorContrato($e->getMessage());
        } catch (\TypeError | \ValueError $e) {
            throw new ErrorContrato('Hay datos del contrato con formato incorrecto (montos, meses o fechas).');
        }
    }

    private function revocarEnlaces(int $contratoId, int $versionId, string $motivo): void
    {
        $this->pdo->prepare('UPDATE tokens_firma SET revocado_en = ? WHERE version_id = ? AND revocado_en IS NULL AND usado_en IS NULL')
            ->execute([$this->ahora(), $versionId]);
        $this->evento($contratoId, $versionId, 'ENLACES_REVOCADOS', ['motivo' => $motivo]);
    }

    /** @return array<string,mixed> */
    private function contrato(string $uid): array
    {
        $c = $this->fila('SELECT * FROM contratos WHERE uid = ?', [$uid]);
        if (!$c) {
            throw new ErrorContrato('Contrato no encontrado.', 404);
        }
        return $c;
    }

    /** @return array<string,mixed> */
    private function ultimaVersion(int $contratoId): array
    {
        return $this->fila('SELECT * FROM versiones WHERE contrato_id = ? ORDER BY numero DESC LIMIT 1', [$contratoId]);
    }

    /** @return array<string,mixed> */
    private function seccion(array $p, string $nombre): array
    {
        if (!isset($p[$nombre]) || !is_array($p[$nombre])) {
            throw new ErrorContrato("Falta la sección «{$nombre}» en el webhook.");
        }
        return $p[$nombre];
    }

    private function texto(array $a, string $campo, string $nombre): string
    {
        $v = trim((string) ($a[$campo] ?? ''));
        if ($v === '') {
            throw new ErrorContrato("Falta el dato {$nombre}.");
        }
        return $v;
    }

    private function correo(array $a, string $nombre): string
    {
        $v = trim((string) ($a['correo'] ?? ''));
        if (!filter_var($v, FILTER_VALIDATE_EMAIL)) {
            throw new ErrorContrato("El correo de {$nombre} no es válido.");
        }
        return $v;
    }

    private function evento(int $contratoId, ?int $versionId, string $tipo, array $detalle): void
    {
        $this->insertar('eventos', [
            'contrato_id' => $contratoId,
            'version_id' => $versionId,
            'tipo' => $tipo,
            'detalle' => json_encode($detalle, JSON_UNESCAPED_UNICODE),
            'creado_en' => $this->ahora(),
        ]);
    }

    /** @param array<string,mixed> $datos */
    private function insertar(string $tabla, array $datos): void
    {
        $columnas = array_keys($datos);
        $sql = sprintf('INSERT INTO %s (%s) VALUES (%s)', $tabla, implode(',', $columnas), implode(',', array_fill(0, count($columnas), '?')));
        $this->pdo->prepare($sql)->execute(array_values($datos));
    }

    /** @return array<string,mixed>|null */
    private function fila(string $sql, array $params = []): ?array
    {
        $st = $this->pdo->prepare($sql);
        $st->execute($params);
        $r = $st->fetch();
        return $r === false ? null : $r;
    }

    /** @return list<array<string,mixed>> */
    private function fila_todas(string $sql, array $params = []): array
    {
        $st = $this->pdo->prepare($sql);
        $st->execute($params);
        return $st->fetchAll();
    }

    private function ahora(): string
    {
        return $this->ahora !== null ? ($this->ahora)() : gmdate('Y-m-d H:i:s');
    }

    private function sumarDias(int $dias): string
    {
        return gmdate('Y-m-d H:i:s', strtotime($this->ahora() . ' UTC') + $dias * 86400);
    }
}
