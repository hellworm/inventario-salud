/**
 * Unidades de medida en textos para personas: "1 caja", "20 cajas",
 * "3 bidones". El catálogo guarda la unidad en singular (`UNIDADES_MEDIDA`).
 */
import { formatearNumero } from "./formato";

const PLURALES_IRREGULARES: Readonly<Record<string, string>> = {
  kit: "kits",
  set: "sets",
  pack: "packs",
};

/** Plural en español de una unidad de medida escrita en singular. */
export function pluralUnidad(unidad: string): string {
  const u = unidad.trim();
  if (!u) return u;
  const base = u.toLowerCase();
  const irregular = PLURALES_IRREGULARES[base];
  if (irregular) return irregular;
  if (/[aeiouáéó]$/.test(base)) return `${u}s`;
  if (/ón$/.test(base)) return `${u.slice(0, -2)}ones`;
  if (/z$/.test(base)) return `${u.slice(0, -1)}ces`;
  if (/s$/.test(base)) return u;
  return `${u}es`;
}

/** Unidad en singular o plural según la cantidad ("caja" / "cajas"). */
export function unidadSegun(cantidad: number, unidad: string): string {
  return Math.abs(cantidad) === 1 ? unidad : pluralUnidad(unidad);
}

/** Cantidad con su unidad concordada: `cantidadConUnidad(20, "caja")` → "20 cajas". */
export function cantidadConUnidad(cantidad: number, unidad: string): string {
  return `${formatearNumero(cantidad)} ${unidadSegun(cantidad, unidad)}`;
}

/**
 * Cantidad con signo y unidad concordada, para movimientos:
 * `cantidadConSigno(3, "caja", 1)` → "+3 cajas"; `cantidadConSigno(1, "caja", -1)` → "−1 caja".
 */
export function cantidadConSigno(cantidad: number, unidad: string, signo: number): string {
  return `${signo > 0 ? "+" : "−"}${cantidadConUnidad(cantidad, unidad)}`;
}
