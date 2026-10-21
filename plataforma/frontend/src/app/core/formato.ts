const ESTADOS: Record<string, string> = {
  BORRADOR: 'Borrador',
  ENVIADO: 'Enviado',
  FIRMADO: 'Firmado',
  REVOCADA: 'Revocada',
};

export function etiquetaEstado(estado: string): string {
  return ESTADOS[estado] ?? estado;
}

/** "1260.00" → "1.260,00" (formato de ASOCIM). */
export function dinero(valor: string): string {
  const numero = Number(valor);
  if (Number.isNaN(numero)) {
    return valor;
  }
  return numero.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "2026-11-30" → "11/30/2026". Las fechas se muestran como MM/DD/AAAA. */
export function fecha(valor: string): string {
  const [dia, hora = ''] = valor.split(' ');
  const [anio, mes, dd] = dia.split('-');
  if (!anio || !mes || !dd) {
    return valor;
  }
  const base = `${mes}/${dd}/${anio}`;
  return hora ? `${base} ${hora.slice(0, 5)}` : base;
}
