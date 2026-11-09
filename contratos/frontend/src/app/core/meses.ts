export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const ABREVIADOS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Fecha de inicio en el formato que entiende el servidor: "Nov 1, 2026". */
export function mesInicio(anio: number, mes: number): string {
  return `${ABREVIADOS[mes - 1]} 1, ${anio}`;
}
