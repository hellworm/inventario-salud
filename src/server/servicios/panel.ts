import "server-only";
import { Prisma } from "@prisma/client";
import { SIGNO_MOVIMIENTO, type TipoMovimiento } from "@/lib/estados";
import { hoyEnSantiago, inicioDelDia, sumarDias, ZONA_HORARIA, type DiaISO } from "@/lib/fechas";
import { puede, type Actor } from "@/lib/permisos";
import { alcanceDeCentros, verificarPermiso } from "../autorizacion";
import { db } from "../db";
import { obtenerAlertas, type AlertaStock, type AlertaVencimiento, type ResumenAlertas } from "./alertas";
import { listarMovimientos, type FilaMovimiento } from "./consultas-movimientos";

export interface ActividadDia {
  dia: DiaISO;
  /** Unidades que entraron (ingresos, ajustes +, traslados de entrada). */
  entradas: number;
  /** Unidades que salieron (retiros, mermas, ajustes −, traslados de salida). */
  salidas: number;
  movimientos: number;
}

export interface ResumenCentro {
  centroId: string;
  centro: string;
  sinStock: number;
  bajoMinimo: number;
  vencidos: number;
  porVencer: number;
}

/** Un grupo de la lista "Qué requiere atención hoy": los primeros ítems y el total real. */
export interface GrupoAtencion<T> {
  items: T[];
  total: number;
}

/** Lista priorizada de lo que hay que resolver primero. */
export interface AtencionHoy {
  /** 1.º Insumos sin stock utilizable (con mínimo definido). */
  sinStock: GrupoAtencion<AlertaStock>;
  /** 2.º Lotes vencidos con stock físico: hay que darlos de baja (los más antiguos primero). */
  vencidos: GrupoAtencion<AlertaVencimiento>;
  /** 3.º Lotes que vencen dentro de `DIAS_VENCE_ESTA_SEMANA` días. */
  venceEstaSemana: GrupoAtencion<AlertaVencimiento>;
  total: number;
}

/** Lotes y unidades por tramo de vencimiento (para el gráfico del panel). */
export interface TramoVencimientoPanel {
  clave: "VENCIDO" | "30" | "60" | "90";
  lotes: number;
  unidades: number;
}

/** "Vence esta semana" = hoy + 7 días. */
export const DIAS_VENCE_ESTA_SEMANA = 7;

export interface ResumenPanel {
  /** Insumos distintos con stock > 0. */
  insumosConStock: number;
  /** Lotes distintos con stock > 0. */
  lotesConStock: number;
  /** Unidades físicas totales (incluye vencidas). */
  unidadesTotales: number;
  alertas: ResumenAlertas;
  atencion: AtencionHoy;
  /** Siempre los 4 tramos, en orden: vencido, ≤30, 31–60, 61–90. */
  vencimientos: TramoVencimientoPanel[];
  /** Desglose de alertas por centro del alcance. */
  porCentro: ResumenCentro[];
  /** `false` si el rol no puede ver movimientos (los campos siguientes van vacíos). */
  puedeVerMovimientos: boolean;
  movimientosHoy: number;
  /** Últimos `diasActividad` días, del más antiguo al más reciente. */
  actividad: ActividadDia[];
  ultimosMovimientos: FilaMovimiento[];
}

/**
 * KPIs del panel para el alcance del actor.
 * Permiso: `panel:ver` (y acceso al centro si se indica).
 */
export async function resumenPanel(
  actor: Actor,
  filtros: { centroId?: string | null; diasActividad?: number; ultimos?: number; porGrupoAtencion?: number } = {},
  opciones: { ahora?: Date } = {},
): Promise<ResumenPanel> {
  verificarPermiso(actor, "panel:ver");
  const centros = alcanceDeCentros(actor, filtros.centroId);
  const hoy = hoyEnSantiago(opciones.ahora);
  const dias = Math.min(Math.max(filtros.diasActividad ?? 14, 1), 90);
  const puedeVerMovimientos = puede(actor.rol, "movimientos:ver");
  const filtroCentroSql = (columna: Prisma.Sql) =>
    centros === null
      ? Prisma.empty
      : centros.length === 0
        ? Prisma.sql`AND FALSE`
        : Prisma.sql`AND ${columna} IN (${Prisma.join(centros)})`;

  const desde = inicioDelDia(sumarDias(hoy, -(dias - 1)));

  const [totales, alertas, actividadSql, ultimos] = await Promise.all([
    db.$queryRaw<{ insumos: number; lotes: number; unidades: number }[]>(Prisma.sql`
      SELECT
        COUNT(DISTINCT l."insumoId")::int AS insumos,
        COUNT(DISTINCT l."id")::int AS lotes,
        COALESCE(SUM(e."cantidad"), 0)::int AS unidades
      FROM "existencias" e
      JOIN "lotes" l ON l."id" = e."loteId"
      JOIN "ubicaciones" u ON u."id" = e."ubicacionId"
      JOIN "centros" ce ON ce."id" = u."centroId" AND ce."activo"
      WHERE e."cantidad" > 0 ${filtroCentroSql(Prisma.sql`u."centroId"`)}
    `),
    obtenerAlertas(actor, { centroId: filtros.centroId }, opciones),
    puedeVerMovimientos
      ? db.$queryRaw<{ dia: string; tipo: TipoMovimiento; unidades: number; movimientos: number }[]>(Prisma.sql`
          SELECT
            to_char(m."creadoEn" AT TIME ZONE 'UTC' AT TIME ZONE ${ZONA_HORARIA}, 'YYYY-MM-DD') AS dia,
            m."tipo",
            SUM(m."cantidad")::int AS unidades,
            COUNT(*)::int AS movimientos
          FROM "movimientos" m
          WHERE m."creadoEn" >= ${desde} ${filtroCentroSql(Prisma.sql`m."centroId"`)}
          GROUP BY 1, 2
        `)
      : Promise.resolve([]),
    puedeVerMovimientos
      ? listarMovimientos(actor, { centroId: filtros.centroId, porPagina: filtros.ultimos ?? 8 })
      : Promise.resolve(null),
  ]);

  const actividad: ActividadDia[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    actividad.push({ dia: sumarDias(hoy, -i), entradas: 0, salidas: 0, movimientos: 0 });
  }
  const porDia = new Map(actividad.map((a) => [a.dia, a]));
  for (const fila of actividadSql) {
    const destino = porDia.get(fila.dia);
    if (!destino) continue;
    if (SIGNO_MOVIMIENTO[fila.tipo] > 0) destino.entradas += fila.unidades;
    else destino.salidas += fila.unidades;
    destino.movimientos += fila.movimientos;
  }

  const centrosMapa = new Map<string, ResumenCentro>();
  const delCentro = (centroId: string, centro: string): ResumenCentro => {
    let r = centrosMapa.get(centroId);
    if (!r) {
      r = { centroId, centro, sinStock: 0, bajoMinimo: 0, vencidos: 0, porVencer: 0 };
      centrosMapa.set(centroId, r);
    }
    return r;
  };
  for (const a of alertas.stock) {
    const r = delCentro(a.centroId, a.centro);
    if (a.tipo === "SIN_STOCK") r.sinStock++;
    else r.bajoMinimo++;
  }
  for (const a of alertas.vencimientos) {
    const r = delCentro(a.centroId, a.centro);
    if (a.tipo === "VENCIDO") r.vencidos++;
    else r.porVencer++;
  }

  const porGrupo = Math.min(Math.max(filtros.porGrupoAtencion ?? 4, 1), 20);
  const grupo = <T>(todos: T[]): GrupoAtencion<T> => ({ items: todos.slice(0, porGrupo), total: todos.length });
  const sinStock = alertas.stock.filter((a) => a.tipo === "SIN_STOCK");
  const vencidos = alertas.vencimientos.filter((a) => a.tipo === "VENCIDO");
  const estaSemana = alertas.vencimientos.filter((a) => a.tipo === "POR_VENCER" && a.dias <= DIAS_VENCE_ESTA_SEMANA);
  const atencion: AtencionHoy = {
    sinStock: grupo(sinStock),
    vencidos: grupo(vencidos),
    venceEstaSemana: grupo(estaSemana),
    total: sinStock.length + vencidos.length + estaSemana.length,
  };

  const vencimientos: TramoVencimientoPanel[] = (["VENCIDO", "30", "60", "90"] as const).map((clave) => {
    const delTramo = alertas.vencimientos.filter((a) =>
      clave === "VENCIDO" ? a.tipo === "VENCIDO" : String(a.tramo) === clave,
    );
    return { clave, lotes: delTramo.length, unidades: delTramo.reduce((s, a) => s + a.cantidad, 0) };
  });

  return {
    atencion,
    vencimientos,
    insumosConStock: totales[0]?.insumos ?? 0,
    lotesConStock: totales[0]?.lotes ?? 0,
    unidadesTotales: totales[0]?.unidades ?? 0,
    alertas: alertas.resumen,
    porCentro: [...centrosMapa.values()].sort((a, b) => a.centro.localeCompare(b.centro, "es")),
    puedeVerMovimientos,
    movimientosHoy: porDia.get(hoy)?.movimientos ?? 0,
    actividad,
    ultimosMovimientos: ultimos?.items ?? [],
  };
}
