/**
 * Estados derivados de stock y vencimiento, y etiquetas del dominio.
 * Es código isomórfico: lo usan los servicios y los componentes (badges).
 */
import { diasEntre, type DiaISO } from "./fechas";

export const ESTADOS_STOCK = ["SIN_STOCK", "BAJO_MINIMO", "OK"] as const;
export type EstadoStock = (typeof ESTADOS_STOCK)[number];

export const ESTADOS_VENCIMIENTO = ["VENCIDO", "POR_VENCER", "VIGENTE", "SIN_VENCIMIENTO"] as const;
export type EstadoVencimiento = (typeof ESTADOS_VENCIMIENTO)[number];

/** Un lote está "por vencer" si vence dentro de esta cantidad de días. */
export const DIAS_POR_VENCER = 90;
/** Tramos de alerta de vencimiento. */
export const TRAMOS_VENCIMIENTO = [30, 60, 90] as const;
export type TramoVencimiento = (typeof TRAMOS_VENCIMIENTO)[number];

/**
 * Estado de stock. `disponible` es el stock utilizable (excluye lotes
 * vencidos). Sin mínimo definido solo distingue SIN_STOCK / OK.
 */
export function calcularEstadoStock(disponible: number, stockMinimo: number | null): EstadoStock {
  if (disponible <= 0) return "SIN_STOCK";
  if (stockMinimo !== null && disponible < stockMinimo) return "BAJO_MINIMO";
  return "OK";
}

/** Días que faltan para el vencimiento (negativo si ya venció). */
export function diasParaVencer(fechaVencimiento: DiaISO | null, hoy: DiaISO): number | null {
  if (!fechaVencimiento) return null;
  return diasEntre(hoy, fechaVencimiento);
}

/**
 * Un lote vence al terminar su día de vencimiento: el mismo día todavía se
 * puede usar; desde el día siguiente está VENCIDO.
 */
export function calcularEstadoVencimiento(
  fechaVencimiento: DiaISO | null,
  hoy: DiaISO,
): EstadoVencimiento {
  const dias = diasParaVencer(fechaVencimiento, hoy);
  if (dias === null) return "SIN_VENCIMIENTO";
  if (dias < 0) return "VENCIDO";
  if (dias <= DIAS_POR_VENCER) return "POR_VENCER";
  return "VIGENTE";
}

/** Tramo de alerta (30/60/90) para un lote por vencer; `null` si no aplica. */
export function tramoDeVencimiento(dias: number | null): TramoVencimiento | null {
  if (dias === null || dias < 0) return null;
  for (const tramo of TRAMOS_VENCIMIENTO) if (dias <= tramo) return tramo;
  return null;
}

export const ETIQUETA_ESTADO_STOCK: Readonly<Record<EstadoStock, string>> = {
  SIN_STOCK: "Sin stock",
  BAJO_MINIMO: "Bajo mínimo",
  OK: "Stock suficiente",
};

export const ETIQUETA_ESTADO_VENCIMIENTO: Readonly<Record<EstadoVencimiento, string>> = {
  VENCIDO: "Vencido",
  POR_VENCER: "Por vencer",
  VIGENTE: "Vigente",
  SIN_VENCIMIENTO: "Sin vencimiento",
};

export const TIPOS_MOVIMIENTO = [
  "INGRESO",
  "RETIRO",
  "AJUSTE_POSITIVO",
  "AJUSTE_NEGATIVO",
  "MERMA",
  "TRASLADO_SALIDA",
  "TRASLADO_ENTRADA",
] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

export const ETIQUETA_TIPO_MOVIMIENTO: Readonly<Record<TipoMovimiento, string>> = {
  INGRESO: "Ingreso",
  RETIRO: "Retiro",
  AJUSTE_POSITIVO: "Ajuste (+)",
  AJUSTE_NEGATIVO: "Ajuste (−)",
  MERMA: "Merma",
  TRASLADO_SALIDA: "Traslado (salida)",
  TRASLADO_ENTRADA: "Traslado (entrada)",
};

/** +1 si el movimiento suma stock, −1 si resta. */
export const SIGNO_MOVIMIENTO: Readonly<Record<TipoMovimiento, 1 | -1>> = {
  INGRESO: 1,
  RETIRO: -1,
  AJUSTE_POSITIVO: 1,
  AJUSTE_NEGATIVO: -1,
  MERMA: -1,
  TRASLADO_SALIDA: -1,
  TRASLADO_ENTRADA: 1,
};

export const MOTIVOS_MERMA = [
  "Vencimiento",
  "Daño o rotura",
  "Contaminación",
  "Quiebre de cadena de frío",
  "Pérdida o extravío",
  "Otro",
] as const;

export const MOTIVOS_AJUSTE = [
  "Conteo de inventario",
  "Error de digitación",
  "Stock inicial",
  "Otro",
] as const;

export const TIPOS_CENTRO = ["DIALISIS", "CONSULTORIO", "CLINICA", "HOSPITAL", "OTRO"] as const;
export type TipoCentro = (typeof TIPOS_CENTRO)[number];
export const ETIQUETA_TIPO_CENTRO: Readonly<Record<TipoCentro, string>> = {
  DIALISIS: "Centro de diálisis",
  CONSULTORIO: "Consultorio",
  CLINICA: "Clínica",
  HOSPITAL: "Hospital",
  OTRO: "Otro",
};

export const TIPOS_UBICACION = ["BODEGA", "SALA", "REFRIGERADO", "OTRO"] as const;
export type TipoUbicacion = (typeof TIPOS_UBICACION)[number];
export const ETIQUETA_TIPO_UBICACION: Readonly<Record<TipoUbicacion, string>> = {
  BODEGA: "Bodega",
  SALA: "Sala",
  REFRIGERADO: "Refrigerado",
  OTRO: "Otro",
};

export const UNIDADES_MEDIDA = [
  "unidad",
  "caja",
  "bolsa",
  "frasco",
  "ampolla",
  "litro",
  "bidón",
  "cartucho",
  "rollo",
  "par",
  "paquete",
  "kit",
] as const;
