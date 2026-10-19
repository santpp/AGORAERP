<?php

declare(strict_types=1);

namespace Asocim\Contratos\Correo;

/**
 * Correos de ASOCIM: un solo diseño para el enlace de firma, la copia firmada y el aviso al personal.
 * HTML con tablas y estilos en línea, para que se vea bien en Gmail, Outlook y el móvil.
 */
final class Plantilla
{
    private const NAVY = '#1A1070';
    private const NARANJA = '#F86000';
    private const TEXTO = '#1B1B2F';
    private const SUAVE = '#5D6075';
    private const FONDO = '#F4F5F9';

    public function __construct(private readonly string $appUrl)
    {
    }

    /** Enlace para revisar y firmar el convenio. */
    public function enlaceFirma(string $nombre, string $enlace, string $vence, string $cuota, int $meses): string
    {
        return $this->pagina(
            'Tu convenio de pago está listo',
            'Hola ' . $this->e($this->primerNombre($nombre)) . ', tu convenio con ASOCIM está listo para revisar y firmar.',
            $this->resumen([
                'Cuota mensual' => '$ ' . $cuota,
                'Número de cuotas' => $meses . ' meses',
            ]),
            $this->boton('Revisar y firmar el convenio', $enlace),
            'El enlace vence el ' . $vence . '. Si no lo solicitaste, puedes ignorar este correo.',
        );
    }

    /** Copia firmada, con enlace de descarga de 30 días. */
    public function convenioFirmado(string $nombre, string $enlace, string $vence): string
    {
        return $this->pagina(
            'Gracias, tu convenio está firmado',
            'Hola ' . $this->e($this->primerNombre($nombre)) . ', recibimos tu firma. Guarda esta copia para tus registros.',
            '',
            $this->boton('Descargar convenio firmado', $enlace),
            'El enlace de descarga estará disponible hasta el ' . $vence . '.',
        );
    }

    /** Aviso interno a la persona responsable. */
    public function avisoPersonal(string $nombreCliente, string $enlacePanel): string
    {
        return $this->pagina(
            'Convenio firmado',
            $this->e($nombreCliente) . ' firmó el convenio de pago.',
            '',
            $this->boton('Ver el convenio en el panel', $enlacePanel),
            'Aviso automático de AGORA para el personal responsable.',
        );
    }

    private function pagina(string $titulo, string $intro, string $bloque, string $boton, string $nota): string
    {
        $logo = $this->e(rtrim($this->appUrl, '/') . '/logo.png');
        return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            . '<title>' . $this->e($titulo) . '</title></head>'
            . '<body style="margin:0;padding:0;background:' . self::FONDO . ';">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' . self::FONDO . ';padding:24px 12px;"><tr><td align="center">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;">'
            // Cabecera
            . '<tr><td style="background:' . self::NAVY . ';padding:22px 28px;">'
            . '<img src="' . $logo . '" width="44" height="44" alt="ASOCIM" style="display:inline-block;vertical-align:middle;border:0;background:#ffffff;border-radius:8px;">'
            . '<span style="display:inline-block;vertical-align:middle;margin-left:12px;color:#ffffff;font-size:17px;font-weight:700;letter-spacing:0.04em;">ASOCIM</span>'
            . '<span style="display:inline-block;vertical-align:middle;margin-left:8px;color:#D9D7F2;font-size:14px;">Convenios</span>'
            . '</td></tr>'
            // Cuerpo
            . '<tr><td style="padding:32px 28px 8px 28px;color:' . self::TEXTO . ';">'
            . '<h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.25;color:' . self::NAVY . ';">' . $this->e($titulo) . '</h1>'
            . '<p style="margin:0 0 20px 0;font-size:16px;line-height:1.6;">' . $intro . '</p>'
            . $bloque
            . '</td></tr>'
            // Botón
            . '<tr><td align="center" style="padding:12px 28px 28px 28px;">' . $boton . '</td></tr>'
            // Nota
            . '<tr><td style="padding:0 28px 28px 28px;color:' . self::SUAVE . ';font-size:13px;line-height:1.6;">' . $this->e($nota) . '</td></tr>'
            // Pie
            . '<tr><td style="background:#F7F7FB;border-top:1px solid #E4E5EE;padding:18px 28px;color:' . self::SUAVE . ';font-size:12px;line-height:1.6;">'
            . 'Academic &amp; Sociocultural Institute of Modern Languages ASOCIM C.A. · RIF J-50207138-5<br>'
            . 'Av. Las Delicias, Qta. Nro. 02, urb. La Soledad, Maracay, Estado Aragua<br>'
            . '+58 424 3580404 · asocimidiomas.com · Instagram @asocim_'
            . '</td></tr>'
            . '</table></td></tr></table></body></html>';
    }

    /** @param array<string,string> $datos */
    private function resumen(array $datos): string
    {
        if ($datos === []) {
            return '';
        }
        $filas = '';
        foreach ($datos as $etiqueta => $valor) {
            $filas .= '<tr><td style="padding:10px 0;border-bottom:1px solid #E4E5EE;color:' . self::SUAVE . ';font-size:14px;">' . $this->e($etiqueta)
                . '</td><td align="right" style="padding:10px 0;border-bottom:1px solid #E4E5EE;color:' . self::TEXTO . ';font-size:15px;font-weight:700;">' . $this->e($valor) . '</td></tr>';
        }
        return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px 0;">' . $filas . '</table>';
    }

    /** Botón que se ve igual en todos los clientes de correo. */
    private function boton(string $texto, string $enlace): string
    {
        return '<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="' . self::NARANJA . '" style="border-radius:8px;">'
            . '<a href="' . $this->e($enlace) . '" style="display:inline-block;padding:15px 28px;color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;text-decoration:none;border-radius:8px;">'
            . $this->e($texto) . '</a></td></tr></table>';
    }

    private function primerNombre(string $nombre): string
    {
        return explode(' ', trim($nombre))[0] ?: 'estimado/a';
    }

    private function e(string $texto): string
    {
        return htmlspecialchars($texto, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
