import "server-only";
import { Prisma } from "@prisma/client";
import { calcularReposicion } from "@/lib/abastecimiento";
import { nombreArchivoCsv, type CeldaCsv } from "@/lib/csv";
import { DIAS_POR_VENCER, tramoDeVencimiento, type TramoVencimiento } from "@/lib/estados";
import { dateADia, diaADate, diasEntre, formatearDia, hoyEnSantiago, sumarDias, type DiaISO } from "@/lib/fechas";
import { normalizarTexto } from "@/lib/formato";
import type { Actor } from "@/lib/permisos";
import { alcanceDeCentros, verificarPermiso } from "../autorizacion";
import { db } from "../db";
import { textoDeBusqueda } from "./apoyo-admin";
import { auditarExportacion, type ExportacionCsv } from "./exportaciones";

/** Alerta de stock: un insumo bajo su mínimo (o sin stock) en un centro. */
export interface AlertaStock {
  tipo: "SIN_STOCK" | "BAJO_MINIMO";
  insumoId: string;
  codigo: string;
  nombre: string;
  unidadMedida: string;
  categoriaId: string;
  categoria: string;
  centroId: string;
  centro: string;
  /** Stock utilizable (excluye vencidos) en el centro. */
  disponible: number;
  stockMinimo: number;
  /** `null` si el insumo no tiene máximo definido en el centro. */
  stockMaximo: number | null;
  /** Unidades que faltan para alcanzar el mínimo. */
  faltante: number;
  /** Unidades para llegar al máximo; `null` sin máximo definido. */
  faltaParaMaximo: number | null;
  /** Cantidad sugerida a pedir (hasta el máximo si existe; si no, hasta el mínimo). */
  sugerido: number;
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
  categoriaId: string;
  categoria: string;
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

export interface FiltrosAlertas {
  /** `null`/omitido = todos los centros visibles del actor. */
  centroId?: string | null;
  categoriaId?: string | null;
  /** Busca en nombre y código del insumo y en el número de lote (sin tildes ni mayúsculas). */
  texto?: string | null;
}

interface FilaStockSql {
  insumoId: string;
  codigo: string;
  nombre: string;
  unidadMedida: string;
  categoriaId: string;
  categoria: string;
  centroId: string;
  centro: string;
  stockMinimo: number;
  stockMaximo: number | null;
  disponible: number;
}

/**
 * Alertas de stock y de vencimiento del alcance del actor.
 * Permiso: `alertas:ver` (y acceso al centro si se indica).
 *
 * El resultado está acotado por el catálogo (insumo × centro con mínimo) y por
 * los lotes con stock que vencen en ≤ 90 días; no crece con el historial.
 */
export async function obtenerAlertas(
  actor: Actor,
  filtros: FiltrosAlertas = {},
  opciones: { ahora?: Date } = {},
): Promise<Alertas> {
  verificarPermiso(actor, "alertas:ver");
  const centros = alcanceDeCentros(actor, filtros.centroId);
  const hoy = hoyEnSantiago(opciones.ahora);
  const limite = sumarDias(hoy, DIAS_POR_VENCER);
  const categoriaId = filtros.categoriaId || null;
  const filtroCentroSql =
    centros === null
      ? Prisma.empty
      : centros.length === 0
        ? Prisma.sql`AND FALSE`
        : Prisma.sql`AND p."centroId" IN (${Prisma.join(centros)})`;
  const filtroCategoriaSql = categoriaId ? Prisma.sql`AND i."categoriaId" = ${categoriaId}` : Prisma.empty;

  const [filasStock, existencias] = await Promise.all([
    db.$queryRaw<FilaStockSql[]>(Prisma.sql`
      SELECT
        p."insumoId", i."codigo", i."nombre", i."unidadMedida", i."categoriaId", c."nombre" AS categoria,
        p."centroId", ce."nombre" AS centro, p."stockMinimo", p."stockMaximo",
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
      WHERE COALESCE(d.disponible, 0) < p."stockMinimo" ${filtroCentroSql} ${filtroCategoriaSql}
    `),
    db.existencia.findMany({
      where: {
        cantidad: { gt: 0 },
        lote: {
          fechaVencimiento: { lte: diaADate(limite) },
          ...(categoriaId ? { insumo: { categoriaId } } : {}),
        },
        ubicacion: { centro: centros === null ? { activo: true } : { activo: true, id: { in: centros } } },
      },
      select: {
        cantidad: true,
        lote: {
          select: {
            id: true,
            numeroLote: true,
            fechaVencimiento: true,
            insumo: {
              select: {
                id: true,
                codigo: true,
                nombre: true,
                unidadMedida: true,
                categoria: { select: { id: true, nombre: true } },
              },
            },
          },
        },
        ubicacion: {
          select: { id: true, nombre: true, centro: { select: { id: true, nombre: true } } },
        },
      },
    }),
  ]);

  const buscado = filtros.texto ? normalizarTexto(filtros.texto) : "";
  const coincide = (...campos: string[]) => buscado === "" || campos.some((c) => normalizarTexto(c).includes(buscado));

  const stock = filasStock
    .filter((f) => coincide(f.nombre, f.codigo))
    .map((f): AlertaStock => {
      const reposicion = calcularReposicion(f.disponible, f.stockMinimo, f.stockMaximo);
      return {
        tipo: f.disponible <= 0 ? "SIN_STOCK" : "BAJO_MINIMO",
        insumoId: f.insumoId,
        codigo: f.codigo,
        nombre: f.nombre,
        unidadMedida: f.unidadMedida,
        categoriaId: f.categoriaId,
        categoria: f.categoria,
        centroId: f.centroId,
        centro: f.centro,
        disponible: f.disponible,
        stockMinimo: f.stockMinimo,
        stockMaximo: f.stockMaximo,
        faltante: reposicion.faltaParaMinimo,
        faltaParaMaximo: reposicion.faltaParaMaximo,
        sugerido: reposicion.sugerido,
      };
    })
    .sort(
      (a, b) =>
        a.disponible / a.stockMinimo - b.disponible / b.stockMinimo ||
        a.nombre.localeCompare(b.nombre, "es") ||
        a.centro.localeCompare(b.centro, "es"),
    );

  const vencimientos = existencias
    .filter((e) => coincide(e.lote.insumo.nombre, e.lote.insumo.codigo, e.lote.numeroLote))
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
        categoriaId: e.lote.insumo.categoria.id,
        categoria: e.lote.insumo.categoria.nombre,
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
    .sort(
      (a, b) =>
        a.dias - b.dias ||
        a.nombre.localeCompare(b.nombre, "es") ||
        a.numeroLote.localeCompare(b.numeroLote, "es") ||
        a.ubicacion.localeCompare(b.ubicacion, "es"),
    );

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

// ---------------------------------------------------------------------------
// Lista de reposición
// ---------------------------------------------------------------------------

export interface GrupoReposicion {
  centroId: string;
  centro: string;
  /** Ordenados por categoría y nombre (como se recorre una bodega o un pedido). */
  items: AlertaStock[];
}

export interface ListaReposicion {
  /** Día (Santiago) en que se generó la lista. */
  dia: DiaISO;
  grupos: GrupoReposicion[];
  totalItems: number;
  sinStock: number;
}

/**
 * Lista de reposición: todo insumo bajo su mínimo, agrupado por centro, con lo
 * que falta para llegar al mínimo y al máximo y la cantidad sugerida a pedir.
 * Permiso: `alertas:ver` (y acceso al centro si se indica).
 */
export async function listaReposicion(
  actor: Actor,
  filtros: FiltrosAlertas = {},
  opciones: { ahora?: Date } = {},
): Promise<ListaReposicion> {
  const { stock } = await obtenerAlertas(actor, filtros, opciones);
  const grupos = new Map<string, GrupoReposicion>();
  for (const item of stock) {
    let grupo = grupos.get(item.centroId);
    if (!grupo) {
      grupo = { centroId: item.centroId, centro: item.centro, items: [] };
      grupos.set(item.centroId, grupo);
    }
    grupo.items.push(item);
  }
  for (const grupo of grupos.values()) {
    grupo.items.sort((a, b) => a.categoria.localeCompare(b.categoria, "es") || a.nombre.localeCompare(b.nombre, "es"));
  }
  return {
    dia: hoyEnSantiago(opciones.ahora),
    grupos: [...grupos.values()].sort((a, b) => a.centro.localeCompare(b.centro, "es")),
    totalItems: stock.length,
    sinStock: stock.filter((s) => s.tipo === "SIN_STOCK").length,
  };
}

export const ENCABEZADOS_REPOSICION = [
  "Centro",
  "Categoría",
  "Código",
  "Insumo",
  "Unidad",
  "Estado",
  "Disponible",
  "Stock mínimo",
  "Stock máximo",
  "Falta para el mínimo",
  "Falta para el máximo",
  "Cantidad sugerida",
] as const;

/** Fila CSV de un ítem de reposición (mismo orden que `ENCABEZADOS_REPOSICION`). */
export function filaCsvReposicion(item: AlertaStock): CeldaCsv[] {
  return [
    item.centro,
    item.categoria,
    item.codigo,
    item.nombre,
    item.unidadMedida,
    item.tipo === "SIN_STOCK" ? "Sin stock" : "Bajo mínimo",
    item.disponible,
    item.stockMinimo,
    item.stockMaximo,
    item.faltante,
    item.faltaParaMaximo,
    item.sugerido,
  ];
}

/**
 * Exportación CSV de la lista de reposición. Queda registrada en la auditoría.
 * Permiso: `alertas:ver` (y acceso al centro si se indica).
 */
export async function exportarReposicion(
  actor: Actor,
  filtros: FiltrosAlertas = {},
  opciones: { ahora?: Date } = {},
): Promise<ExportacionCsv> {
  const lista = await listaReposicion(actor, filtros, opciones);
  await auditarExportacion(actor, "reposicion", {
    centroId: filtros.centroId ?? null,
    categoriaId: filtros.categoriaId ?? null,
    texto: textoDeBusqueda(filtros.texto),
    filas: lista.totalItems,
  });
  const items = lista.grupos.flatMap((g) => g.items);
  return {
    archivo: nombreArchivoCsv("lista-reposicion", formatearDia(lista.dia)),
    encabezados: [...ENCABEZADOS_REPOSICION],
    filas: (async function* () {
      for (const item of items) yield filaCsvReposicion(item);
    })(),
  };
}
