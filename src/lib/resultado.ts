/** Resultado uniforme de toda Server Action (ver `accionSegura`). */

export type ErroresCampo = Record<string, string[]>;

export type ResultadoOk<T> = { ok: true; datos: T };
export type ResultadoError = {
  ok: false;
  /** Mensaje en español, listo para mostrar al usuario. */
  error: string;
  /** Código estable del error de dominio (p. ej. `STOCK_INSUFICIENTE`). */
  codigo?: string;
  /** Errores por campo (validación zod), con la ruta del campo como clave. */
  erroresCampo?: ErroresCampo;
};
export type ResultadoAccion<T> = ResultadoOk<T> | ResultadoError;

/** Resultado paginado estándar de los listados. */
export interface Paginado<T> {
  items: T[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
}

export const POR_PAGINA_DEFECTO = 25;
export const POR_PAGINA_MAXIMO = 100;
