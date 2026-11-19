/**
 * Estados derivados de stock y vencimiento, y etiquetas del dominio.
 * Es código isomórfico: lo usan los servicios y los componentes (badges).
 */
import { diasEntre, sumarMeses, type DiaISO } from "./fechas";

export const ESTADOS_STOCK = ["SIN_STOCK", "BAJO_MINIMO", "OK"] as const;
export type EstadoStock = (typeof ESTADOS_STOCK)[number];

/**
 * SEMÁFORO DE VENCIMIENTO (regla única de toda la aplicación).
 *
 * Se mide en MESES CALENDARIO desde hoy (día de Chile, America/Santiago):
 *  - ROJO:     vence en menos de 3 meses  (hoy ≤ vencimiento < hoy + 3 meses).
 *  - AMARILLO: vence en 3 meses o más y en menos de 6 (hoy + 3 meses ≤ v < hoy + 6 meses).
 *  - VERDE:    vence en 6 meses o más     (vencimiento ≥ hoy + 6 meses).
 *  - VENCIDO:  ya venció (vencimiento < hoy). Estado aparte, más grave que el rojo.
 *  - SIN_VENCIMIENTO: el lote no tiene fecha (insumos que no controlan vencimiento). Neutro.
 *
 * "hoy + N meses" es el mismo día del mes N meses después; si ese mes no tiene
 * ese día, su último día (30-11 + 3 meses = 28-02 o 29-02). Ver `sumarMeses`.
 * Los servicios aplican estos mismos límites en SQL (`limitesSemaforo`).
 */
export const ESTADOS_VENCIMIENTO = ["VENCIDO", "ROJO", "AMARILLO", "VERDE", "SIN_VENCIMIENTO"] as const;
export type EstadoVencimiento = (typeof ESTADOS_VENCIMIENTO)[number];

/** Menos de estos meses para vencer = ROJO. */
export const MESES_SEMAFORO_ROJO = 3;
/** Menos de estos meses para vencer (y no rojo) = AMARILLO; desde aquí, VERDE. */
export const MESES_SEMAFORO_AMARILLO = 6;

/** Colores del semáforo que tienen fecha (los que se pueden filtrar y contar). */
export const COLORES_SEMAFORO = ["VENCIDO", "ROJO", "AMARILLO", "VERDE"] as const;
export type ColorSemaforo = (typeof COLORES_SEMAFORO)[number];

/** Gravedad: menor = peor. A nivel de insumo manda el peor de sus lotes con stock. */
export const GRAVEDAD_SEMAFORO: Readonly<Record<EstadoVencimiento, number>> = {
  VENCIDO: 0,
  ROJO: 1,
  AMARILLO: 2,
  VERDE: 3,
  SIN_VENCIMIENTO: 4,
};

export interface LimitesSemaforo {
  /** Hoy (Santiago). Un lote con vencimiento anterior está VENCIDO. */
  hoy: DiaISO;
  /** Primer día AMARILLO (= hoy + 3 meses). Antes de este día, ROJO. */
  amarilloDesde: DiaISO;
  /** Primer día VERDE (= hoy + 6 meses). Antes de este día, AMARILLO. */
  verdeDesde: DiaISO;
}

/** Fechas límite del semáforo para un "hoy" dado. Único lugar donde se calculan. */
export function limitesSemaforo(hoy: DiaISO): LimitesSemaforo {
  return {
    hoy,
    amarilloDesde: sumarMeses(hoy, MESES_SEMAFORO_ROJO),
    verdeDesde: sumarMeses(hoy, MESES_SEMAFORO_AMARILLO),
  };
}

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
 * Color del semáforo de un lote. Un lote vence al terminar su día de
 * vencimiento: el mismo día todavía se puede usar (ROJO); desde el día
 * siguiente está VENCIDO.
 */
export function calcularEstadoVencimiento(
  fechaVencimiento: DiaISO | null,
  hoy: DiaISO,
): EstadoVencimiento {
  if (!fechaVencimiento) return "SIN_VENCIMIENTO";
  const limites = limitesSemaforo(hoy);
  if (fechaVencimiento < limites.hoy) return "VENCIDO";
  if (fechaVencimiento < limites.amarilloDesde) return "ROJO";
  if (fechaVencimiento < limites.verdeDesde) return "AMARILLO";
  return "VERDE";
}

/** El peor estado (el más grave) de una lista; `SIN_VENCIMIENTO` si está vacía. */
export function peorEstadoVencimiento(estados: Iterable<EstadoVencimiento>): EstadoVencimiento {
  let peor: EstadoVencimiento = "SIN_VENCIMIENTO";
  for (const e of estados) if (GRAVEDAD_SEMAFORO[e] < GRAVEDAD_SEMAFORO[peor]) peor = e;
  return peor;
}

/** Conteo de lotes con stock por color (desglose del semáforo de un insumo). */
export type ConteoSemaforo = Readonly<Record<ColorSemaforo, number>> & { readonly sinVencimiento: number };

/**
 * Valores del filtro `?semaforo=` de la URL (inventario, alertas, reportes).
 * Admite varios separados por coma (`rojo,amarillo`).
 */
export const FILTROS_SEMAFORO = ["rojo", "amarillo", "verde", "vencido"] as const;
export type FiltroSemaforo = (typeof FILTROS_SEMAFORO)[number];

export const COLOR_DE_FILTRO: Readonly<Record<FiltroSemaforo, ColorSemaforo>> = {
  rojo: "ROJO",
  amarillo: "AMARILLO",
  verde: "VERDE",
  vencido: "VENCIDO",
};

export const FILTRO_DE_COLOR: Readonly<Record<ColorSemaforo, FiltroSemaforo>> = {
  ROJO: "rojo",
  AMARILLO: "amarillo",
  VERDE: "verde",
  VENCIDO: "vencido",
};

/** Opciones del filtro de semáforo para un `<select>` (inventario y reportes). */
export const OPCIONES_FILTRO_SEMAFORO: readonly { value: FiltroSemaforo; label: string }[] = [
  { value: "rojo", label: `Rojo (menos de ${MESES_SEMAFORO_ROJO} meses)` },
  { value: "amarillo", label: `Amarillo (${MESES_SEMAFORO_ROJO} a ${MESES_SEMAFORO_AMARILLO} meses)` },
  { value: "verde", label: `Verde (${MESES_SEMAFORO_AMARILLO} meses o más)` },
  { value: "vencido", label: "Vencidos" },
];

/** Lee `?semaforo=` (uno o varios valores separados por coma). Lo desconocido se ignora. */
export function leerSemaforo(valor: string | null | undefined): ColorSemaforo[] {
  if (!valor) return [];
  const colores = new Set<ColorSemaforo>();
  for (const parte of valor.slice(0, 60).toLowerCase().split(",")) {
    const filtro = FILTROS_SEMAFORO.find((f) => f === parte.trim());
    if (filtro) colores.add(COLOR_DE_FILTRO[filtro]);
  }
  return COLORES_SEMAFORO.filter((c) => colores.has(c));
}

/** Inverso de `leerSemaforo`: valor canónico para la URL (`undefined` sin colores). */
export function escribirSemaforo(colores: readonly ColorSemaforo[]): string | undefined {
  if (colores.length === 0) return undefined;
  return FILTROS_SEMAFORO.filter((f) => colores.includes(COLOR_DE_FILTRO[f])).join(",");
}

export const ETIQUETA_ESTADO_STOCK: Readonly<Record<EstadoStock, string>> = {
  SIN_STOCK: "Sin stock",
  BAJO_MINIMO: "Bajo mínimo",
  OK: "Stock suficiente",
};

export const ETIQUETA_ESTADO_VENCIMIENTO: Readonly<Record<EstadoVencimiento, string>> = {
  VENCIDO: "Vencido",
  ROJO: "Rojo",
  AMARILLO: "Amarillo",
  VERDE: "Verde",
  SIN_VENCIMIENTO: "Sin vencimiento",
};

/** Qué significa cada color, en una frase (leyendas, tooltips, ayuda). */
export const DESCRIPCION_SEMAFORO: Readonly<Record<EstadoVencimiento, string>> = {
  VENCIDO: "Ya venció",
  ROJO: `Vence en menos de ${MESES_SEMAFORO_ROJO} meses`,
  AMARILLO: `Vence en ${MESES_SEMAFORO_ROJO} a ${MESES_SEMAFORO_AMARILLO} meses`,
  VERDE: `Vence en ${MESES_SEMAFORO_AMARILLO} meses o más`,
  SIN_VENCIMIENTO: "No controla vencimiento",
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
