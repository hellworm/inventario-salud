import "server-only";
import { Prisma } from "@prisma/client";
import { DIAS_POR_VENCER, tramoDeVencimiento, type TramoVencimiento } from "@/lib/estados";
import { dateADia, diaADate, diasEntre, hoyEnSantiago, sumarDias, type DiaISO } from "@/lib/fechas";
import type { Actor } from "@/lib/permisos";
import { alcanceDeCentros, verificarPermiso } from "../autorizacion";
import { db } from "../db";

/** Alerta de stock: un insumo bajo su mínimo (o sin stock) en un centro. */
export interface AlertaStock {
  tipo: "SIN_STOCK" | "BAJO_MINIMO";
  insumoId: string;
  codigo: string;
  nombre: string;
  unidadMedida: string;
  categoria: string;
  centroId: string;
  centro: string;
  /** Stock utilizable (excluye vencidos) en el centro. */
  disponible: number;
  stockMinimo: number;
  /** Unidades que faltan para alcanzar el mínimo. */
  faltante: number;
}

/** Alerta de vencimiento: un lote vencido o por vencer en una ubicación. */
export interface AlertaVencimiento {
  tipo: "VENCIDO" | "POR_VENCER";
  /** 30 = vence en ≤30 días; 60 = entre 31 y 60; 90 = entre 61 y 90. `null` si ya venció. */
  tramo: TramoVencimiento | null;
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

export interface ResumenAlertas {
  sinStock: number;
  bajoMinimo: number;
  /** Existencias (lote × ubicación) vencidas con stock. */
  vencidos: number;
  /** Tramos excluyentes: ≤30, 31–60 y 61–90 días. */
  porVencer30: number;
  porVencer60: number;
  porVencer90: number;
  total: number;
}

export interface Alertas {
  /** Ordenadas por gravedad: primero sin stock, luego mayor faltante relativo. */
  stock: AlertaStock[];
  /** Ordenadas por fecha de vencimiento (lo más urgente primero). */
  vencimientos: AlertaVencimiento[];
  resumen: ResumenAlertas;
}

interface FilaStockSql {
  insumoId: string;
  codigo: string;
  nombre: string;
  unidadMedida: string;
  categoria: string;
  centroId: string;
  centro: string;
  stockMinimo: number;
  disponible: number;
}

/**
 * Alertas de stock y de vencimiento del alcance del actor.
 * Permiso: `alertas:ver` (y acceso al centro si se indica).
 */
export async function obtenerAlertas(
  actor: Actor,
  filtros: { centroId?: string | null } = {},
  opciones: { ahora?: Date } = {},
): Promise<Alertas> {
  verificarPermiso(actor, "alertas:ver");
  const centros = alcanceDeCentros(actor, filtros.centroId);
  const hoy = hoyEnSantiago(opciones.ahora);
  const limite = sumarDias(hoy, DIAS_POR_VENCER);
  const filtroCentroSql =
    centros === null
      ? Prisma.empty
      : centros.length === 0
        ? Prisma.sql`AND FALSE`
        : Prisma.sql`AND p."centroId" IN (${Prisma.join(centros)})`;

  const [filasStock, existencias] = await Promise.all([
    db.$queryRaw<FilaStockSql[]>(Prisma.sql`
      SELECT
        p."insumoId", i."codigo", i."nombre", i."unidadMedida", c."nombre" AS categoria,
        p."centroId", ce."nombre" AS centro, p."stockMinimo",
        COALESCE(d.disponible, 0)::int AS disponible
      FROM "parametros_stock" p
      JOIN "insumos" i ON i."id" = p."insumoId" AND i."activo"
      JOIN "categorias" c ON c."id" = i."categoriaId"
      JOIN "centros" ce ON ce."id" = p."centroId" AND ce."activo"
      LEFT JOIN (
        SELECT l."insumoId" AS insumo_id, u."centroId" AS centro_id, SUM(e."cantidad") AS disponible
        FROM "existencias" e
        JOIN "lotes" l ON l."id" = e."loteId"
        JOIN "ubicaciones" u ON u."id" = e."ubicacionId"
        WHERE l."fechaVencimiento" IS NULL OR l."fechaVencimiento" >= ${hoy}::date
        GROUP BY l."insumoId", u."centroId"
      ) d ON d.insumo_id = p."insumoId" AND d.centro_id = p."centroId"
      WHERE COALESCE(d.disponible, 0) < p."stockMinimo" ${filtroCentroSql}
    `),
    db.existencia.findMany({
      where: {
        cantidad: { gt: 0 },
        lote: { fechaVencimiento: { lte: diaADate(limite) } },
        ubicacion: { centro: centros === null ? { activo: true } : { activo: true, id: { in: centros } } },
      },
      select: {
        cantidad: true,
        lote: {
          select: {
            id: true,
            numeroLote: true,
            fechaVencimiento: true,
            insumo: { select: { id: true, codigo: true, nombre: true, unidadMedida: true } },
          },
        },
        ubicacion: {
          select: { id: true, nombre: true, centro: { select: { id: true, nombre: true } } },
        },
      },
    }),
  ]);

  const stock = filasStock
    .map(
      (f): AlertaStock => ({
        tipo: f.disponible <= 0 ? "SIN_STOCK" : "BAJO_MINIMO",
        insumoId: f.insumoId,
        codigo: f.codigo,
        nombre: f.nombre,
        unidadMedida: f.unidadMedida,
        categoria: f.categoria,
        centroId: f.centroId,
        centro: f.centro,
        disponible: f.disponible,
        stockMinimo: f.stockMinimo,
        faltante: f.stockMinimo - f.disponible,
      }),
    )
    .sort(
      (a, b) =>
        a.disponible / a.stockMinimo - b.disponible / b.stockMinimo ||
        a.nombre.localeCompare(b.nombre, "es") ||
        a.centro.localeCompare(b.centro, "es"),
    );

  const vencimientos = existencias
    .map((e): AlertaVencimiento => {
      const fecha = dateADia(e.lote.fechaVencimiento as Date);
      const dias = diasEntre(hoy, fecha);
      return {
        tipo: dias < 0 ? "VENCIDO" : "POR_VENCER",
        tramo: tramoDeVencimiento(dias),
        insumoId: e.lote.insumo.id,
        codigo: e.lote.insumo.codigo,
        nombre: e.lote.insumo.nombre,
        unidadMedida: e.lote.insumo.unidadMedida,
        loteId: e.lote.id,
        numeroLote: e.lote.numeroLote,
        fechaVencimiento: fecha,
        dias,
        centroId: e.ubicacion.centro.id,
        centro: e.ubicacion.centro.nombre,
        ubicacionId: e.ubicacion.id,
        ubicacion: e.ubicacion.nombre,
        cantidad: e.cantidad,
      };
    })
    .sort((a, b) => a.dias - b.dias || a.nombre.localeCompare(b.nombre, "es"));

  const resumen: ResumenAlertas = {
    sinStock: stock.filter((a) => a.tipo === "SIN_STOCK").length,
    bajoMinimo: stock.filter((a) => a.tipo === "BAJO_MINIMO").length,
    vencidos: vencimientos.filter((a) => a.tipo === "VENCIDO").length,
    porVencer30: vencimientos.filter((a) => a.tramo === 30).length,
    porVencer60: vencimientos.filter((a) => a.tramo === 60).length,
    porVencer90: vencimientos.filter((a) => a.tramo === 90).length,
    total: 0,
  };
  resumen.total = stock.length + vencimientos.length;
  return { stock, vencimientos, resumen };
}
