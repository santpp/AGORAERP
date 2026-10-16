<?php

declare(strict_types=1);

namespace Asocim\Contratos\Servicio;

use Asocim\Contratos\Calculo\CalculadoraContrato;
use Asocim\Contratos\Calculo\Cargo;
use Asocim\Contratos\Calculo\DatosInvalidos;
use Asocim\Contratos\Calculo\Dinero;
use Asocim\Contratos\Calculo\Resultado;
use Asocim\Contratos\Calculo\Terminos;
use Asocim\Contratos\Documento\Formato;
use Asocim\Contratos\Documento\GeneradorPdf;
use Asocim\Contratos\Ghl\ClienteGhl;
use PDO;

/**
 * Reglas de negocio de los contratos: borradores, versiones, envío, revocación y firma.
 * Cada acción valida el estado actual antes de cambiar algo.
 */
final class ContratoServicio
{
    public const DIAS_VALIDEZ_ENLACE = 7;
    private const DIAS_DESCARGA = 30;

    private CalculadoraContrato $calculadora;

    public function __construct(
        private readonly PDO $pdo,
        private readonly ?\Closure $ahora = null,
        private readonly ?GeneradorPdf $generador = null,
        private readonly ?string $carpetaDocumentos = null,
        private readonly ?ClienteGhl $ghl = null,
        private readonly string $appUrl = 'https://asocim.agoradigital.app',
    ) {
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
    public function enviar(string $uid, string $personalAsocim = ''): array
    {
        $contrato = $this->contrato($uid);
        $version = $this->ultimaVersion((int) $contrato['id']);
        if ($version['estado'] !== 'BORRADOR') {
            throw new ErrorContrato('Solo se puede enviar un borrador. Crea una versión nueva para corregirlo.', 409);
        }
        $terminos = json_decode($version['terminos'], true);
        $r = $this->calculadora->calcular($this->construirTerminos($terminos));
        if (count($r->cuotas) > 0 && (int) $terminos['meses'] > 20) {
            throw new ErrorContrato('El convenio admite hasta 20 meses.');
        }

        // Primero el PDF: si falla, el contrato sigue como borrador.
        $pdf = null;
        if ($this->generador !== null && $this->carpetaDocumentos !== null) {
            $datos = $this->datosPdf($contrato, $terminos, $r, $personalAsocim);
            $ruta = $this->carpetaDocumentos . '/' . $uid . '-v' . $version['numero'] . '.pdf';
            $this->generador->generar($datos, $ruta);
            $pdf = ['ruta' => $ruta, 'sha256' => hash_file('sha256', $ruta)];
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
            if ($pdf !== null) {
                $this->insertar('documentos', [
                    'version_id' => $version['id'],
                    'ruta' => $pdf['ruta'],
                    'sha256' => $pdf['sha256'],
                    'creado_en' => $this->ahora(),
                ]);
            }
            $this->evento((int) $contrato['id'], (int) $version['id'], 'ENVIADO', ['numero' => (int) $version['numero'], 'pdf' => $pdf !== null, 'personal' => $personalAsocim]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
        return ['token' => $token, 'version' => (int) $version['numero'], 'vence' => $vence];
    }

    /**
     * Datos que llena el script de Python (claves del convenio original).
     * @param array<string,mixed> $contrato
     * @param array<string,mixed> $terminos
     * @return array<string,mixed>
     */
    private function datosPdf(array $contrato, array $terminos, \Asocim\Contratos\Calculo\Resultado $r, string $personalAsocim, ?\DateTimeImmutable $fecha = null): array
    {
        $meses = (int) $terminos['meses'];
        $cuotasPorMes = (int) ($terminos['cuotas_por_mes'] ?? 1);
        $inscripcion = '0';
        foreach ($r->cargos as $c) {
            if (stripos($c->concepto, 'inscrip') !== false) {
                $inscripcion = Formato::dinero($c->monto);
            }
        }
        $cronograma = [];
        $vistos = [];
        foreach ($r->cuotas as $q) {
            if (isset($vistos[$q->mesNumero])) {
                continue;
            }
            $vistos[$q->mesNumero] = true;
            $fecha = new \DateTimeImmutable($q->vencimiento);
            $cronograma[] = [
                'mes' => ucfirst(Formato::mes((int) $fecha->format('n'))),
                'anio' => $fecha->format('Y'),
                'modalidad' => Formato::modalidad($cuotasPorMes),
            ];
        }
        // La fecha del convenio es la del envío: al firmar se conserva la misma.
        $hoy = $fecha ?? new \DateTimeImmutable('now', new \DateTimeZone('America/Caracas'));
        return [
            'nombre' => mb_strtoupper($contrato['cliente_nombre']),
            'cedula' => $contrato['cliente_cedula'],
            'telefono' => $contrato['cliente_telefono'] ?? '',
            'meses' => (string) $meses,
            'meses_texto' => Formato::palabras($meses),
            'precio' => Formato::dinero($r->precioCurso),
            'cuota' => Formato::dinero(\Asocim\Contratos\Calculo\Dinero::desde((string) $terminos['cuota'])),
            'inscripcion' => $inscripcion,
            'descuento' => '0',
            'modalidad' => Formato::modalidad($cuotasPorMes),
            'fecha_dia' => $hoy->format('j'),
            'fecha_mes' => Formato::mes((int) $hoy->format('n')),
            'fecha_anio' => $hoy->format('Y'),
            'staff' => $personalAsocim,
            'cronograma' => $cronograma,
        ];
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
        $this->validarPng($firma['firma_png']);

        // El convenio firmado se genera antes de cambiar nada: si falla, el enlace sigue activo.
        $rutaFirmado = null;
        $sha = null;
        if ($this->generador !== null && $this->carpetaDocumentos !== null) {
            $terminos = json_decode($version['terminos'], true);
            $r = $this->calculadora->calcular($this->construirTerminos($terminos));
            $fecha = $this->fechaDeEnvio($version);
            $datos = $this->datosPdf($contrato, $terminos, $r, $this->personalDeEnvio((int) $version['id']), $fecha);
            $png = $this->carpetaTemporalFirma($firma['firma_png']);
            try {
                $rutaFirmado = $this->carpetaDocumentos . '/' . $contrato['uid'] . '-v' . $version['numero'] . '-firmado.pdf';
                $this->generador->generar($datos, $rutaFirmado, $png);
                $sha = hash_file('sha256', $rutaFirmado);
            } finally {
                @unlink($png);
            }
        }
        $documento = $sha ?? hash('sha256', (string) $version['terminos'] . '|' . $firma['firma_png']);

        $descarga = null;
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
            if ($rutaFirmado !== null) {
                $this->insertar('documentos_firmados', [
                    'version_id' => $version['id'],
                    'ruta' => $rutaFirmado,
                    'sha256' => $sha,
                    'creado_en' => $this->ahora(),
                ]);
            }
            if ($rutaFirmado !== null) {
                $descarga = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
                $this->insertar('descargas_firma', [
                    'version_id' => $version['id'],
                    'hash' => hash('sha256', $descarga),
                    'expira_en' => $this->sumarDias(self::DIAS_DESCARGA),
                    'creado_en' => $this->ahora(),
                ]);
            }
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

        if ($descarga !== null) {
            $this->avisarCliente($contrato, $descarga);
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

    /** Ruta del convenio firmado para el enlace de descarga (vence a los 30 días). */
    public function documentoFirmadoDeDescarga(string $token): string
    {
        $fila = $this->fila(
            'SELECT d.ruta, dg.expira_en FROM descargas_firma dg JOIN documentos_firmados d ON d.version_id = dg.version_id WHERE dg.hash = ?',
            [hash('sha256', $token)]
        );
        if (!$fila || $fila['expira_en'] < $this->ahora()) {
            throw new ErrorContrato('Este enlace no es válido o ya venció.', 404);
        }
        if (!is_file($fila['ruta'])) {
            throw new ErrorContrato('El convenio firmado no está disponible.', 404);
        }
        return $fila['ruta'];
    }

    /**
     * Envía al cliente el enlace a su convenio firmado. El id de contacto de GHL
     * es la primera parte de clave_webhook. Si GHL falla, la firma ya quedó guardada.
     * @param array<string,mixed> $contrato
     */
    private function avisarCliente(array $contrato, string $descarga): void
    {
        if ($this->ghl === null) {
            return;
        }
        try {
            // Si el webhook no trajo el contact_id de GHL, se busca o crea el contacto por correo.
            $contactoId = empty($contrato['clave_webhook'])
                ? $this->ghl->contactoPara((string) $contrato['cliente_correo'], (string) $contrato['cliente_nombre'], $contrato['cliente_telefono'] ?? null)
                : explode(':', (string) $contrato['clave_webhook'])[0];
            $enlace = rtrim($this->appUrl, '/') . '/firmar?descarga=' . $descarga;
            $html = '<p>Hola ' . htmlspecialchars((string) $contrato['cliente_nombre']) . ',</p>'
                . '<p>Tu convenio de pago con ASOCIM ya está firmado. Puedes descargar tu copia aquí:</p>'
                . '<p><a href="' . $enlace . '">Descargar convenio firmado</a></p>'
                . '<p>El enlace estará disponible durante 30 días.</p>';
            $this->ghl->enviarCorreo($contactoId, 'Tu convenio firmado · ASOCIM', $html);
        } catch (\Throwable $e) {
            error_log('[contratos] No se envió el correo de firma: ' . $e->getMessage());
        }
    }

    /**
     * Ruta del PDF enviado, para que el cliente lo revise antes de firmar.
     */
    public function documentoDeEnlace(string $token): string
    {
        [, $version] = $this->validarEnlace($token);
        $fila = $this->fila('SELECT ruta FROM documentos WHERE version_id = ?', [$version['id']]);
        if (!$fila || !is_file($fila['ruta'])) {
            throw new ErrorContrato('El documento no está disponible. Pide a la institución que lo reenvíe.', 404);
        }
        return $fila['ruta'];
    }

    /** Solo se aceptan PNG de tamaño razonable (la firma dibujada en pantalla). */
    private function validarPng(string $datos): void
    {
        if (strlen($datos) > 400 * 1024 || !str_starts_with($datos, "\x89PNG\r\n\x1a\n")) {
            throw new ErrorContrato('La firma no es válida. Vuelve a firmar en el recuadro.');
        }
    }

    /** Guarda la firma en un archivo temporal para el generador de PDF. */
    private function carpetaTemporalFirma(string $png): string
    {
        $dir = dirname((string) $this->carpetaDocumentos) . '/tmp';
        @mkdir($dir, 0700, true);
        $ruta = $dir . '/firma-' . bin2hex(random_bytes(8)) . '.png';
        file_put_contents($ruta, $png);
        @chmod($ruta, 0600);
        return $ruta;
    }

    /** Personal de ASOCIM que envió la versión (quedó en el evento ENVIADO). */
    private function personalDeEnvio(int $versionId): string
    {
        $fila = $this->fila("SELECT detalle FROM eventos WHERE version_id = ? AND tipo = 'ENVIADO' ORDER BY id DESC LIMIT 1", [$versionId]);
        $detalle = $fila ? json_decode((string) $fila['detalle'], true) : null;
        return is_array($detalle) ? (string) ($detalle['personal'] ?? '') : '';
    }

    /** Fecha del envío en hora de Caracas, para que el convenio conserve su fecha original. */
    private function fechaDeEnvio(array $version): ?\DateTimeImmutable
    {
        if (empty($version['enviado_en'])) {
            return null;
        }
        return (new \DateTimeImmutable($version['enviado_en'], new \DateTimeZone('UTC')))
            ->setTimezone(new \DateTimeZone('America/Caracas'));
    }

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
