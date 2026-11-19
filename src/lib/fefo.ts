/**
 * Plan de retiro FEFO (first expired, first out) para previsualizar en la UI
 * de qué lotes se descontará. El servidor aplica la misma regla en
 * `registrarRetiro` y es la fuente de verdad: esto es solo una vista previa.
 */
import type { EstadoVencimiento } from "./estados";
import type { DiaISO } from "./fechas";

export interface LoteParaFefo {
  loteId: string;
  numeroLote: string;
  fechaVencimiento: DiaISO | null;
  estadoVencimiento: EstadoVencimiento;
  cantidad: number;
}

export interface LineaFefo<L extends LoteParaFefo = LoteParaFefo> {
  lote: L;
  /** Unidades que se tomarán de este lote. */
  tomar: number;
  /** Saldo del lote en la ubicación después del retiro. */
  queda: number;
}

export interface PlanFefo<L extends LoteParaFefo = LoteParaFefo> {
  /** Lotes de los que se descuenta, en orden FEFO. */
  lineas: LineaFefo<L>[];
  /** Stock retirable (excluye lotes vencidos). */
  disponible: number;
  /** Unidades en lotes vencidos (no retirables). */
  vencido: number;
  /** Unidades pedidas que no se pueden cubrir (0 si alcanza). */
  faltante: number;
}

const SIN_FECHA = "9999-12-31";

/** Ordena por vencimiento ascendente; los lotes sin fecha van al final (orden estable). */
export function ordenarFefo<L extends LoteParaFefo>(lotes: readonly L[]): L[] {
  return lotes
    .map((lote, i) => ({ lote, i }))
    .sort(
      (a, b) =>
        (a.lote.fechaVencimiento ?? SIN_FECHA).localeCompare(b.lote.fechaVencimiento ?? SIN_FECHA) || a.i - b.i,
    )
    .map(({ lote }) => lote);
}

/**
 * Calcula de qué lotes saldría un retiro de `cantidad` unidades. Los lotes
 * vencidos nunca se usan. Si no alcanza, `faltante` > 0 y `lineas` consume
 * todo lo disponible.
 */
export function planificarFefo<L extends LoteParaFefo>(lotes: readonly L[], cantidad: number): PlanFefo<L> {
  const conStock = lotes.filter((l) => l.cantidad > 0);
  const vigentes = ordenarFefo(conStock.filter((l) => l.estadoVencimiento !== "VENCIDO"));
  const vencido = conStock
    .filter((l) => l.estadoVencimiento === "VENCIDO")
    .reduce((s, l) => s + l.cantidad, 0);
  const disponible = vigentes.reduce((s, l) => s + l.cantidad, 0);
  const pedido = Number.isFinite(cantidad) && cantidad > 0 ? Math.trunc(cantidad) : 0;

  const lineas: LineaFefo<L>[] = [];
  let pendiente = pedido;
  for (const lote of vigentes) {
    if (pendiente === 0) break;
    const tomar = Math.min(lote.cantidad, pendiente);
    lineas.push({ lote, tomar, queda: lote.cantidad - tomar });
    pendiente -= tomar;
  }
  return { lineas, disponible, vencido, faltante: pendiente };
}
