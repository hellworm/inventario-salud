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

/** Decimales fijos para columnas alineadas: (5.8, 1) → "5,8"; (6.07, 1) → "6,1"; (66, 1) → "66,0". */
export function formatearDecimalFijo(valor: number | null | undefined, decimales = 1): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  return new Intl.NumberFormat("es-CL", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(valor);
}

/** 12500 → "$12.500" */
export function formatearCLP(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  return fmtCLP.format(valor);
}

/** Monto en pesos conservando hasta 2 decimales: 1250.5 → "$1.250,5"; 1250 → "$1.250". */
export function formatearMonto(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  return `${valor < 0 ? "-" : ""}$${fmtDecimal.format(Math.abs(valor))}`;
}

/** 0.125 → "12,5 %" */
export function formatearPorcentaje(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  return fmtPorcentaje.format(valor);
}

/** "1 lote" / "3 lotes" */
export function pluralizar(cantidad: number, singular: string, plural?: string): string {
  return `${formatearNumero(cantidad)} ${cantidad === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/** Resultado de interpretar un número escrito por una persona. */
export type NumeroInterpretado =
  | { ok: true; valor: number }
  | { ok: false; motivo: "vacio" | "invalido" }
  /**
   * Se escribió un punto como separador decimal ("1250.5", "1.5"). En Chile el
   * punto separa miles: no se adivina, se pide usar coma. `sugerencia` trae el
   * mismo texto con coma ("1250,5").
   */
  | { ok: false; motivo: "punto_decimal"; sugerencia: string };

/**
 * Interpreta un número escrito al estilo chileno, sin adivinar:
 *  - la coma es el separador decimal ("1250,5");
 *  - el punto es separador de miles SOLO si agrupa de a tres ("1.250",
 *    "1.250.000,5");
 *  - un punto usado como decimal ("1250.5", "1.5") se rechaza con una
 *    sugerencia; cualquier otra forma ("1.25.0", "1,2,3", "12abc") es inválida.
 */
export function interpretarNumero(texto: string | null | undefined): NumeroInterpretado {
  if (texto === null || texto === undefined) return { ok: false, motivo: "vacio" };
  const limpio = texto.trim().replace(/[\s$]/g, "");
  if (limpio === "") return { ok: false, motivo: "vacio" };
  if (/^-?\d+(,\d+)?$/.test(limpio)) return { ok: true, valor: Number(limpio.replace(",", ".")) };
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(limpio)) {
    return { ok: true, valor: Number(limpio.replace(/\./g, "").replace(",", ".")) };
  }
  if (/^-?\d+\.\d+$/.test(limpio)) {
    return { ok: false, motivo: "punto_decimal", sugerencia: limpio.replace(".", ",") };
  }
  return { ok: false, motivo: "invalido" };
}

/**
 * Número escrito al estilo chileno ("1.250", "1.250,5"), o `null` si no se
 * puede interpretar con certeza (ver `interpretarNumero`).
 */
export function parsearNumero(texto: string | null | undefined): number | null {
  const r = interpretarNumero(texto);
  return r.ok ? r.valor : null;
}

/** Normaliza texto para búsquedas: minúsculas y sin tildes. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
