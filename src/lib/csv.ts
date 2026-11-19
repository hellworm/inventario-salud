/**
 * Generación de CSV pensada para Excel en español de Chile:
 *  - UTF-8 con BOM (para que Excel detecte la codificación);
 *  - separador `;` (el separador de listas de es-CL);
 *  - fin de línea CRLF;
 *  - decimales con coma;
 *  - protección contra inyección de fórmulas: a todo texto que comience con
 *    `=`, `+`, `-`, `@`, tabulador o retorno de carro se le antepone `'`.
 */

export type CeldaCsv = string | number | boolean | null | undefined;

export const BOM_UTF8 = "﻿";
export const SEPARADOR_CSV = ";";
export const FIN_LINEA_CSV = "\r\n";

const INICIO_PELIGROSO = /^[=+\-@\t\r]/;
const REQUIERE_COMILLAS = /[";\r\n]/;

/** Neutraliza un texto que una planilla podría interpretar como fórmula. */
export function neutralizarFormula(texto: string): string {
  return INICIO_PELIGROSO.test(texto) ? `'${texto}` : texto;
}

/** Convierte un valor en una celda CSV segura (escapada y, si hace falta, entrecomillada). */
export function escaparCeldaCsv(valor: CeldaCsv): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return "";
    // Los números van sin separador de miles y con coma decimal (Excel es-CL).
    return String(valor).replace(".", ",");
  }
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  const texto = neutralizarFormula(valor);
  return REQUIERE_COMILLAS.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Una línea CSV (con su fin de línea). */
export function filaCsv(celdas: readonly CeldaCsv[]): string {
  return celdas.map(escaparCeldaCsv).join(SEPARADOR_CSV) + FIN_LINEA_CSV;
}

/** Documento CSV completo: BOM + encabezados + filas. */
export function generarCsv(encabezados: readonly string[], filas: Iterable<readonly CeldaCsv[]>): string {
  let salida = BOM_UTF8 + filaCsv(encabezados);
  for (const fila of filas) salida += filaCsv(fila);
  return salida;
}

/** Nombre de archivo seguro: minúsculas, sin tildes ni caracteres especiales. */
export function nombreArchivoCsv(base: string, sufijo?: string): string {
  const limpiar = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const partes = [limpiar(base), sufijo ? limpiar(sufijo) : ""].filter(Boolean);
  return `${partes.join("_") || "exportacion"}.csv`;
}
