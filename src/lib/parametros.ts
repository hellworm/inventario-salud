/**
 * Lectura segura de `searchParams` (los valores llegan como texto, arreglo o
 * `undefined`). ÚNICO lugar donde se acotan página, texto y fechas que vienen
 * de la URL; `parametros-url.ts` y los servicios se apoyan en estas funciones.
 */
import { parsearDiaFiltro, type DiaISO } from "./fechas";

export type ValorParametro = string | string[] | undefined;

/** Última página que se acepta pedir (más allá no hay datos y el OFFSET desborda). */
export const PAGINA_MAXIMA = 1_000_000;

/** Largo máximo de un texto libre leído de la URL. */
export const LARGO_MAXIMO_TEXTO_URL = 200;

/**
 * Página acotada: un entero seguro entre 1 y `PAGINA_MAXIMA`. Todo lo demás
 * (`"abc"`, `-3`, `1.5`, `Infinity`, `99999999999999999999`, `NaN`) cae en 1.
 */
export function acotarPagina(valor: unknown): number {
  const n = typeof valor === "number" ? valor : typeof valor === "string" && /^\d{1,9}$/.test(valor.trim()) ? Number(valor.trim()) : NaN;
  return Number.isSafeInteger(n) && n >= 1 && n <= PAGINA_MAXIMA ? n : 1;
}

/**
 * Texto libre saneado: sin caracteres de control (incluido el byte nulo, que
 * PostgreSQL rechaza en un texto), recortado y acotado en largo.
 */
export function limpiarTexto(texto: string, maximo = LARGO_MAXIMO_TEXTO_URL): string {
  return texto.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").trim().slice(0, maximo);
}

/** Texto saneado y recortado, o `null` si falta, viene vacío o repetido. */
export function textoParam(valor: ValorParametro): string | null {
  if (typeof valor !== "string") return null;
  const texto = limpiarTexto(valor);
  return texto ? texto : null;
}

/** Valor de una lista cerrada (en mayúsculas o tal cual), o `null`. */
export function enumParam<T extends string>(valor: ValorParametro, permitidos: readonly T[]): T | null {
  const texto = textoParam(valor);
  if (!texto) return null;
  const candidato = permitidos.find((p) => p === texto || p === texto.toUpperCase());
  return candidato ?? null;
}

/** Número de página entre 1 y `PAGINA_MAXIMA` (valores inválidos caen en 1). */
export function paginaParam(valor: ValorParametro): number {
  return acotarPagina(textoParam(valor));
}

/** Día de un filtro (`YYYY-MM-DD`, entre 2000 y 2100), o `null`. */
export function diaParam(valor: ValorParametro): DiaISO | null {
  const texto = textoParam(valor);
  if (!texto || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  return parsearDiaFiltro(texto);
}
