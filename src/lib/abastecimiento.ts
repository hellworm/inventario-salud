/**
 * Cálculos puros de abastecimiento: reposición y cobertura. Código isomórfico
 * (lo usan los servicios, las pantallas y los tests).
 */

export interface Reposicion {
  /** Unidades que faltan para alcanzar el stock mínimo (0 si ya lo cumple). */
  faltaParaMinimo: number;
  /** Unidades para llegar al stock máximo; `null` si el insumo no tiene máximo definido. */
  faltaParaMaximo: number | null;
  /**
   * Cantidad sugerida a pedir: hasta el máximo si existe (para no volver a
   * quedar bajo el mínimo de inmediato) o, si no, hasta el mínimo.
   */
  sugerido: number;
}

/**
 * Cuánto reponer dado el stock utilizable (`disponible`, sin vencidos).
 * Un máximo menor que el mínimo se considera mal configurado y se ignora.
 */
export function calcularReposicion(disponible: number, stockMinimo: number, stockMaximo: number | null): Reposicion {
  const actual = Math.max(0, disponible);
  const faltaParaMinimo = Math.max(0, stockMinimo - actual);
  const maximoValido = stockMaximo !== null && stockMaximo >= stockMinimo ? stockMaximo : null;
  const faltaParaMaximo = maximoValido === null ? null : Math.max(0, maximoValido - actual);
  return { faltaParaMinimo, faltaParaMaximo, sugerido: faltaParaMaximo ?? faltaParaMinimo };
}

export interface Cobertura {
  /** Consumo promedio por día del período (unidades/día). */
  promedioDiario: number;
  /**
   * Días que alcanza el stock disponible al ritmo de consumo del período
   * (disponible ÷ promedio diario). `null` si no hubo consumo: no se puede
   * estimar (no significa cobertura infinita ni cero).
   */
  diasCobertura: number | null;
}

/**
 * Cobertura estimada. `diasPeriodo` es la cantidad de días calendario del
 * período observado (mínimo 1). El resultado se trunca a un decimal, para no
 * prometer más días de los que hay.
 */
export function calcularCobertura(disponible: number, consumoPeriodo: number, diasPeriodo: number): Cobertura {
  const dias = Math.max(1, Math.trunc(diasPeriodo) || 1);
  const consumo = Math.max(0, consumoPeriodo);
  const promedioDiario = consumo / dias;
  if (promedioDiario <= 0) return { promedioDiario: 0, diasCobertura: null };
  // disponible ÷ (consumo ÷ días) = disponible × días ÷ consumo (evita errores de coma flotante).
  const diasCobertura = Math.floor((Math.max(0, disponible) * dias * 10) / consumo) / 10;
  return { promedioDiario, diasCobertura };
}

export const NIVELES_COBERTURA = ["CRITICA", "BAJA", "ADECUADA", "SIN_CONSUMO"] as const;
export type NivelCobertura = (typeof NIVELES_COBERTURA)[number];

/** Menos de una semana es crítico; menos de un mes, bajo. */
export const DIAS_COBERTURA_CRITICA = 7;
export const DIAS_COBERTURA_BAJA = 30;

export function nivelDeCobertura(diasCobertura: number | null): NivelCobertura {
  if (diasCobertura === null) return "SIN_CONSUMO";
  if (diasCobertura < DIAS_COBERTURA_CRITICA) return "CRITICA";
  if (diasCobertura < DIAS_COBERTURA_BAJA) return "BAJA";
  return "ADECUADA";
}

export const ETIQUETA_NIVEL_COBERTURA: Readonly<Record<NivelCobertura, string>> = {
  CRITICA: "Menos de 7 días",
  BAJA: "Menos de 30 días",
  ADECUADA: "30 días o más",
  SIN_CONSUMO: "Sin consumo",
};
