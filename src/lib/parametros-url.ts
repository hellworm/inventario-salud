/**
 * Utilidades para leer y escribir filtros en la URL (`searchParams`).
 * Las comparten las páginas y los Route Handlers de exportación, de modo que
 * la descarga use exactamente los mismos filtros que la vista previa.
 */
import type { DiaISO } from "./fechas";
import { acotarPagina, diaParam, textoParam } from "./parametros";

export type ParametrosUrl = Record<string, string | string[] | undefined>;

/** Lee los parámetros de un `URLSearchParams` (Route Handlers) con la misma forma que `searchParams`. */
export function parametrosDe(consulta: URLSearchParams): ParametrosUrl {
  const salida: ParametrosUrl = {};
  for (const [clave, valor] of consulta) if (salida[clave] === undefined) salida[clave] = valor;
  return salida;
}

/** Primer valor no vacío del parámetro (saneado: sin caracteres de control, recortado), o `undefined`. */
export function leerTexto(sp: ParametrosUrl, clave: string): string | undefined {
  const bruto = sp[clave];
  return textoParam(Array.isArray(bruto) ? bruto[0] : bruto) ?? undefined;
}

/** Valor del parámetro solo si pertenece a la lista permitida. */
export function leerOpcion<T extends string>(sp: ParametrosUrl, clave: string, permitidos: readonly T[]): T | undefined {
  const valor = leerTexto(sp, clave);
  return permitidos.find((p) => p === valor);
}

/** Entero positivo pequeño del parámetro (p. ej. `dias=30`), o `undefined`. Para páginas usa `leerPagina`. */
export function leerEntero(sp: ParametrosUrl, clave: string): number | undefined {
  const texto = leerTexto(sp, clave);
  if (!texto || !/^\d{1,6}$/.test(texto)) return undefined;
  const valor = Number(texto);
  return valor > 0 ? valor : undefined;
}

/** Página acotada (1..1.000.000) del parámetro; inválida o ausente → 1. */
export function leerPagina(sp: ParametrosUrl, clave = "pagina"): number {
  return acotarPagina(leerTexto(sp, clave));
}

/** Día de un filtro (`YYYY-MM-DD`, entre 2000 y 2100), o `undefined`. */
export function leerDia(sp: ParametrosUrl, clave: string): DiaISO | undefined {
  return diaParam(leerTexto(sp, clave)) ?? undefined;
}

/** `ruta?a=1&b=2` omitiendo los valores vacíos. */
export function construirHref(ruta: string, parametros: Record<string, string | number | null | undefined>): string {
  const consulta = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor !== null && valor !== undefined && valor !== "") consulta.set(clave, String(valor));
  }
  const texto = consulta.toString();
  return texto ? `${ruta}?${texto}` : ruta;
}

/**
 * Centro efectivo de una vista con filtro por centro:
 *  - con un centro activo en el selector global, manda ese centro;
 *  - en "Toda la red", vale `?centro=` solo si es uno de los centros visibles.
 * Los servicios vuelven a validar el acceso de todos modos.
 */
export function resolverCentro(
  centroActivoId: string | null,
  centrosVisibles: readonly { id: string }[],
  pedido: string | undefined,
): string | null {
  if (centroActivoId) return centroActivoId;
  return pedido && centrosVisibles.some((c) => c.id === pedido) ? pedido : null;
}
