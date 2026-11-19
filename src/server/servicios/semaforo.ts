import "server-only";
import { Prisma } from "@prisma/client";
import {
  COLORES_SEMAFORO,
  limitesSemaforo,
  type ColorSemaforo,
  type EstadoVencimiento,
  type LimitesSemaforo,
} from "@/lib/estados";
import { dateADia, diasEntre, hoyEnSantiago, type DiaISO } from "@/lib/fechas";
import type { Actor } from "@/lib/permisos";
import { alcanceDeCentros, verificarPermiso } from "../autorizacion";
import { db } from "../db";
import { patronLike, textoDeBusqueda } from "./apoyo-admin";

/**
 * Semáforo de vencimiento en SQL. La regla (meses calendario, hora de Chile)
 * vive en `@/lib/estados` (`limitesSemaforo`); aquí solo se traduce a SQL con
 * las fechas límite ya calculadas, de modo que la base y el código clasifican
 * exactamente igual.
 *
 * Unidad de conteo: un "lote" del semáforo es un lote CON STOCK EN UNA
 * UBICACIÓN (fila de `existencias` con cantidad > 0). Es lo que se lista en
 * alertas, en el panel y en los reportes; un lote repartido en dos ubicaciones
 * cuenta en cada una.
 */

/** `CASE` que clasifica una columna DATE en VENCIDO / ROJO / AMARILLO / VERDE / SIN_VENCIMIENTO. */
export function sqlColorSemaforo(columna: Prisma.Sql, l: LimitesSemaforo): Prisma.Sql {
  return Prisma.sql`CASE
    WHEN ${columna} IS NULL THEN 'SIN_VENCIMIENTO'
    WHEN ${columna} < ${l.hoy}::date THEN 'VENCIDO'
    WHEN ${columna} < ${l.amarilloDesde}::date THEN 'ROJO'
    WHEN ${columna} < ${l.verdeDesde}::date THEN 'AMARILLO'
    ELSE 'VERDE'
  END`;
}

/** Condición SQL "la columna DATE es de este color". */
export function sqlEsColor(columna: Prisma.Sql, color: ColorSemaforo, l: LimitesSemaforo): Prisma.Sql {
  switch (color) {
    case "VENCIDO":
      return Prisma.sql`${columna} < ${l.hoy}::date`;
    case "ROJO":
      return Prisma.sql`(${columna} >= ${l.hoy}::date AND ${columna} < ${l.amarilloDesde}::date)`;
    case "AMARILLO":
      return Prisma.sql`(${columna} >= ${l.amarilloDesde}::date AND ${columna} < ${l.verdeDesde}::date)`;
    case "VERDE":
      return Prisma.sql`${columna} >= ${l.verdeDesde}::date`;
  }
}

/** Condición SQL "la columna DATE es de alguno de estos colores" (`TRUE` si la lista está vacía). */
export function sqlEsAlgunColor(
  columna: Prisma.Sql,
  colores: readonly ColorSemaforo[] | null | undefined,
  l: LimitesSemaforo,
): Prisma.Sql {
  const validos = COLORES_SEMAFORO.filter((c) => colores?.includes(c));
  if (validos.length === 0) return Prisma.sql`TRUE`;
  return Prisma.sql`(${Prisma.join(
    validos.map((c) => sqlEsColor(columna, c, l)),
    " OR ",
  )})`;
}

function filtroCentros(columna: Prisma.Sql, centros: string[] | null): Prisma.Sql {
  if (centros === null) return Prisma.empty;
  if (centros.length === 0) return Prisma.sql`AND FALSE`;
  return Prisma.sql`AND ${columna} IN (${Prisma.join(centros)})`;
}

export interface FiltrosSemaforo {
  /** `null`/omitido = todos los centros visibles del actor. */
  centroId?: string | null;
  categoriaId?: string | null;
  /** Busca en nombre y código del insumo y en el número de lote (sin tildes ni mayúsculas). */
  texto?: string | null;
}

export interface ConteoColor {
  /** Insumos distintos con al menos un lote con stock de este color. */
  insumos: number;
  /** Lotes con stock por ubicación (filas lote × ubicación) de este color. */
  lotes: number;
  /** Unidades físicas en esos lotes. */
  unidades: number;
}

export type ResumenSemaforo = Readonly<Record<EstadoVencimiento, ConteoColor>> & {
  /** Fechas límite usadas (para mostrar "antes del dd-MM-yyyy"). */
  limites: LimitesSemaforo;
};

function condicionesComunes(centros: string[] | null, filtros: FiltrosSemaforo): Prisma.Sql {
  const texto = textoDeBusqueda(filtros.texto);
  const patron = texto ? patronLike(texto) : null;
  return Prisma.sql`
    e."cantidad" > 0
    ${filtroCentros(Prisma.sql`u."centroId"`, centros)}
    ${filtros.categoriaId ? Prisma.sql`AND i."categoriaId" = ${filtros.categoriaId}` : Prisma.empty}
    ${
      patron
        ? Prisma.sql`AND (
            unaccent(i."nombre") ILIKE unaccent(${patron})
            OR i."codigo" ILIKE ${patron}
            OR l."numeroLote" ILIKE ${patron}
          )`
        : Prisma.empty
    }
  `;
}

/**
 * Conteos del semáforo (insumos, lotes y unidades por color) del alcance del
 * actor, agregados en SQL. Es la fuente de las tarjetas del panel y de los
 * contadores de alertas; coincide con el inventario filtrado por `semaforo`
 * (insumos) y con los reportes de existencias y vencimientos (lotes).
 * Permiso: `inventario:ver` (y acceso al centro si se indica).
 */
export async function resumenSemaforo(
  actor: Actor,
  filtros: FiltrosSemaforo = {},
  opciones: { ahora?: Date } = {},
): Promise<ResumenSemaforo> {
  verificarPermiso(actor, "inventario:ver");
  const centros = alcanceDeCentros(actor, filtros.centroId);
  const limites = limitesSemaforo(hoyEnSantiago(opciones.ahora));
  const filas = await db.$queryRaw<{ color: EstadoVencimiento; insumos: number; lotes: number; unidades: number }[]>(Prisma.sql`
    SELECT
      ${sqlColorSemaforo(Prisma.sql`l."fechaVencimiento"`, limites)} AS color,
      COUNT(DISTINCT l."insumoId")::int AS insumos,
      COUNT(*)::int AS lotes,
      COALESCE(SUM(e."cantidad"), 0)::int AS unidades
    FROM "existencias" e
    JOIN "lotes" l ON l."id" = e."loteId"
    JOIN "insumos" i ON i."id" = l."insumoId"
    JOIN "ubicaciones" u ON u."id" = e."ubicacionId"
    JOIN "centros" ce ON ce."id" = u."centroId" AND ce."activo"
    WHERE ${condicionesComunes(centros, filtros)}
    GROUP BY 1
  `);
  const cero = (): ConteoColor => ({ insumos: 0, lotes: 0, unidades: 0 });
  const resumen = { VENCIDO: cero(), ROJO: cero(), AMARILLO: cero(), VERDE: cero(), SIN_VENCIMIENTO: cero() };
  for (const f of filas) resumen[f.color] = { insumos: f.insumos, lotes: f.lotes, unidades: f.unidades };
  return { ...resumen, limites };
}

/** Un lote con stock en una ubicación, con su color. */
export interface LoteSemaforo {
  existenciaId: string;
  color: ColorSemaforo;
  insumoId: string;
  codigo: string;
  nombre: string;
  unidadMedida: string;
  loteId: string;
  numeroLote: string;
  fechaVencimiento: DiaISO;
  /** Días para vencer (negativo si ya venció). */
  dias: number;
  centroId: string;
  centro: string;
  ubicacionId: string;
  ubicacion: string;
  cantidad: number;
}

/**
 * Los primeros lotes con stock de un color, del que vence antes al que vence
 * después (para la lista "Productos en rojo" del panel). Límite 1–50.
 * Permiso: `inventario:ver` (y acceso al centro si se indica).
 */
export async function lotesPorColor(
  actor: Actor,
  filtros: FiltrosSemaforo & { color: ColorSemaforo; limite?: number },
  opciones: { ahora?: Date } = {},
): Promise<LoteSemaforo[]> {
  verificarPermiso(actor, "inventario:ver");
  const centros = alcanceDeCentros(actor, filtros.centroId);
  const hoy = hoyEnSantiago(opciones.ahora);
  const limites = limitesSemaforo(hoy);
  const limite = Math.min(Math.max(Math.trunc(filtros.limite ?? 6), 1), 50);
  const filas = await db.$queryRaw<
    (Omit<LoteSemaforo, "fechaVencimiento" | "dias" | "color"> & { fechaVencimiento: Date })[]
  >(Prisma.sql`
    SELECT
      e."id" AS "existenciaId", e."cantidad",
      i."id" AS "insumoId", i."codigo", i."nombre", i."unidadMedida",
      l."id" AS "loteId", l."numeroLote", l."fechaVencimiento",
      ce."id" AS "centroId", ce."nombre" AS centro,
      u."id" AS "ubicacionId", u."nombre" AS ubicacion
    FROM "existencias" e
    JOIN "lotes" l ON l."id" = e."loteId"
    JOIN "insumos" i ON i."id" = l."insumoId"
    JOIN "ubicaciones" u ON u."id" = e."ubicacionId"
    JOIN "centros" ce ON ce."id" = u."centroId" AND ce."activo"
    WHERE ${condicionesComunes(centros, filtros)}
      AND ${sqlEsColor(Prisma.sql`l."fechaVencimiento"`, filtros.color, limites)}
    ORDER BY l."fechaVencimiento" ASC, i."nombre" ASC, l."numeroLote" ASC, u."nombre" ASC, e."id" ASC
    LIMIT ${limite}
  `);
  return filas.map((f) => {
    const fecha = dateADia(f.fechaVencimiento);
    return { ...f, color: filtros.color, fechaVencimiento: fecha, dias: diasEntre(hoy, fecha) };
  });
}
