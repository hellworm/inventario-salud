import "server-only";
import { Prisma } from "@prisma/client";
import { SIGNO_MOVIMIENTO, type TipoMovimiento } from "@/lib/estados";
import { hoyEnSantiago, inicioDelDia, sumarDias, ZONA_HORARIA, type DiaISO } from "@/lib/fechas";
import { puede, type Actor } from "@/lib/permisos";
import { alcanceDeCentros, verificarPermiso } from "../autorizacion";
import { db } from "../db";
import { obtenerAlertas, type AlertaStock, type AlertaVencimiento, type ResumenAlertas } from "./alertas";
import { listarMovimientos, type FilaMovimiento } from "./consultas-movimientos";
import { lotesPorColor, resumenSemaforo, type LoteSemaforo, type ResumenSemaforo } from "./semaforo";

export interface ActividadDia {
  dia: DiaISO;
  /**
   * NÚMERO DE MOVIMIENTOS de entrada (ingresos, ajustes +, traslados de
   * entrada). No son unidades: sumar cajas, ampollas y litros no significa nada.
   */
  entradas: number;
  /** Número de movimientos de salida (retiros, mermas, ajustes −, traslados de salida). */
  salidas: number;
  /** Total de movimientos del día (`entradas + salidas`). */
  movimientos: number;
}

export interface ResumenCentro {
  centroId: string;
  centro: string;
  sinStock: number;
  bajoMinimo: number;
  vencidos: number;
  /** Lotes con stock en rojo (vencen en menos de 3 meses). */
  rojo: number;
  /** Lotes con stock en amarillo (vencen en 3 a 6 meses). */
  amarillo: number;
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

/** Cuántos "productos en rojo" lista el panel. */
export const LOTES_EN_ROJO_PANEL = 6;

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
  /** Semáforo de vencimientos: insumos, lotes y unidades por color (agregado en SQL). */
  semaforo: ResumenSemaforo;
  /** Los primeros lotes en rojo, del que vence antes al que vence después. */
  enRojo: LoteSemaforo[];
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

  const [totales, alertas, semaforo, enRojo, actividadSql, ultimos] = await Promise.all([
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
    resumenSemaforo(actor, { centroId: filtros.centroId }, opciones),
    lotesPorColor(actor, { centroId: filtros.centroId, color: "ROJO", limite: LOTES_EN_ROJO_PANEL }, opciones),
    puedeVerMovimientos
      ? db.$queryRaw<{ dia: string; tipo: TipoMovimiento; movimientos: number }[]>(Prisma.sql`
          SELECT
            to_char(m."creadoEn" AT TIME ZONE 'UTC' AT TIME ZONE ${ZONA_HORARIA}, 'YYYY-MM-DD') AS dia,
            m."tipo",
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
    if (SIGNO_MOVIMIENTO[fila.tipo] > 0) destino.entradas += fila.movimientos;
    else destino.salidas += fila.movimientos;
    destino.movimientos += fila.movimientos;
  }

  const centrosMapa = new Map<string, ResumenCentro>();
  const delCentro = (centroId: string, centro: string): ResumenCentro => {
    let r = centrosMapa.get(centroId);
    if (!r) {
      r = { centroId, centro, sinStock: 0, bajoMinimo: 0, vencidos: 0, rojo: 0, amarillo: 0 };
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
    else if (a.tipo === "ROJO") r.rojo++;
    else r.amarillo++;
  }

  const porGrupo = Math.min(Math.max(filtros.porGrupoAtencion ?? 4, 1), 20);
  const grupo = <T>(todos: T[]): GrupoAtencion<T> => ({ items: todos.slice(0, porGrupo), total: todos.length });
  const sinStock = alertas.stock.filter((a) => a.tipo === "SIN_STOCK");
  const vencidos = alertas.vencimientos.filter((a) => a.tipo === "VENCIDO");
  const estaSemana = alertas.vencimientos.filter((a) => a.tipo === "ROJO" && a.dias <= DIAS_VENCE_ESTA_SEMANA);
  const atencion: AtencionHoy = {
    sinStock: grupo(sinStock),
    vencidos: grupo(vencidos),
    venceEstaSemana: grupo(estaSemana),
    total: sinStock.length + vencidos.length + estaSemana.length,
  };

  return {
    atencion,
    semaforo,
    enRojo,
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
