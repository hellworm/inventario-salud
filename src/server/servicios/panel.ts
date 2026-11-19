import "server-only";
import { Prisma } from "@prisma/client";
import { SIGNO_MOVIMIENTO, type TipoMovimiento } from "@/lib/estados";
import { hoyEnSantiago, inicioDelDia, sumarDias, ZONA_HORARIA, type DiaISO } from "@/lib/fechas";
import { puede, type Actor } from "@/lib/permisos";
import { alcanceDeCentros, verificarPermiso } from "../autorizacion";
import { db } from "../db";
import { obtenerAlertas, type ResumenAlertas } from "./alertas";
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

export interface ResumenPanel {
  /** Insumos distintos con stock > 0. */
  insumosConStock: number;
  /** Lotes distintos con stock > 0. */
  lotesConStock: number;
  /** Unidades físicas totales (incluye vencidas). */
  unidadesTotales: number;
  alertas: ResumenAlertas;
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
  filtros: { centroId?: string | null; diasActividad?: number; ultimos?: number } = {},
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

  return {
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
