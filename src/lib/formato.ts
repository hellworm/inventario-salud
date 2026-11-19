/** Formato de números y moneda para Chile (es-CL). */

const fmtEntero = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const fmtDecimal = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });
const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const fmtPorcentaje = new Intl.NumberFormat("es-CL", {
  style: "percent",
  maximumFractionDigits: 1,
});

/** 12500 → "12.500" */
export function formatearNumero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  return fmtEntero.format(valor);
}

/** 1234.5 → "1.234,5" */
export function formatearDecimal(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  return fmtDecimal.format(valor);
}

/** 12500 → "$12.500" */
export function formatearCLP(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  return fmtCLP.format(valor);
}

/** 0.125 → "12,5 %" */
export function formatearPorcentaje(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  return fmtPorcentaje.format(valor);
}

/** Cantidad con su unidad de medida: (3, "caja") → "3 caja". */
export function formatearCantidad(cantidad: number, unidadMedida?: string | null): string {
  const n = formatearNumero(cantidad);
  return unidadMedida ? `${n} ${unidadMedida}` : n;
}

/** "1 lote" / "3 lotes" */
export function pluralizar(cantidad: number, singular: string, plural?: string): string {
  return `${formatearNumero(cantidad)} ${cantidad === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/** Interpreta un número escrito al estilo chileno ("1.250", "1.250,5"). */
export function parsearNumero(texto: string | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  const limpio = texto.trim().replace(/\s|\$/g, "").replace(/\./g, "").replace(",", ".");
  if (limpio === "" || !/^-?\d+(\.\d+)?$/.test(limpio)) return null;
  return Number(limpio);
}

/** Normaliza texto para búsquedas: minúsculas y sin tildes. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
