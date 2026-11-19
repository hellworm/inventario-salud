/** Lectura segura de `searchParams` (los valores llegan como texto, arreglo o `undefined`). */

export type ValorParametro = string | string[] | undefined;

/** Texto recortado, o `null` si falta, viene vacío o repetido. */
export function textoParam(valor: ValorParametro): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

/** Valor de una lista cerrada (en mayúsculas o tal cual), o `null`. */
export function enumParam<T extends string>(valor: ValorParametro, permitidos: readonly T[]): T | null {
  const texto = textoParam(valor);
  if (!texto) return null;
  const candidato = permitidos.find((p) => p === texto || p === texto.toUpperCase());
  return candidato ?? null;
}

/** Número de página ≥ 1 (valores inválidos caen en 1). */
export function paginaParam(valor: ValorParametro): number {
  const n = Number(textoParam(valor));
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** Día `YYYY-MM-DD` válido, o `null`. */
export function diaParam(valor: ValorParametro): string | null {
  const texto = textoParam(valor);
  if (!texto || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  const fecha = new Date(`${texto}T00:00:00.000Z`);
  return Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== texto ? null : texto;
}
