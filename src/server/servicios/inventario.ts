import "server-only";
import { Prisma } from "@prisma/client";
import {
  calcularEstadoStock,
  calcularEstadoVencimiento,
  diasParaVencer,
  DIAS_POR_VENCER,
  type EstadoStock,
  type EstadoVencimiento,
} from "@/lib/estados";
import { dateADia, hoyEnSantiago, sumarDias, type DiaISO } from "@/lib/fechas";
import type { Actor } from "@/lib/permisos";
import { POR_PAGINA_DEFECTO, POR_PAGINA_MAXIMO, type Paginado } from "@/lib/resultado";
import { alcanceDeCentros, verificarPermiso } from "../autorizacion";
import { db } from "../db";
import { noEncontrado } from "../errores";

/**
 * Consultas de inventario. Conceptos:
 *  - `total`: unidades físicas (incluye lotes vencidos).
 *  - `vencido`: unidades en lotes vencidos.
 *  - `disponible` = total − vencido. El estado de stock se calcula sobre
 *    `disponible` contra el mínimo (suma de mínimos de los centros del alcance).
 *  - Solo aparecen insumos con existencias registradas o con parámetro de
 *    stock en los centros del alcance.
 */

/** Estados por los que se puede filtrar el inventario. */
export const FILTROS_ESTADO_INVENTARIO = [
  "SIN_STOCK",
  "BAJO_MINIMO",
  "OK",
  "VENCIDO",
  "POR_VENCER",
] as const;
export type FiltroEstadoInventario = (typeof FILTROS_ESTADO_INVENTARIO)[number];

export interface FiltrosInventario {
  /** Centro a consultar. `null`/omitido = todos los centros visibles del actor. */
  centroId?: string | null;
  /** Limita a insumos con stock (> 0) en esa ubicación. */
  ubicacionId?: string | null;
  categoriaId?: string | null;
  /** Busca en nombre, código, código de barras y fabricante (sin tildes). */
  texto?: string | null;
  estado?: FiltroEstadoInventario | null;
  pagina?: number;
  porPagina?: number;
}

export interface FilaInventario {
  insumoId: string;
  codigo: string;
  nombre: string;
  presentacion: string | null;
  unidadMedida: string;
  categoriaId: string;
  categoria: string;
  requiereCadenaFrio: boolean;
  activo: boolean;
  total: number;
  vencido: number;
  disponible: number;
  /** Unidades (no vencidas) que vencen dentro de `DIAS_POR_VENCER` días. */
  porVencer: number;
  /** Stock en la ubicación filtrada; `null` si no se filtró por ubicación. */
  enUbicacion: number | null;
  /** Lotes con stock > 0. */
  lotes: number;
  stockMinimo: number | null;
  stockMaximo: number | null;
  /** Vencimiento más próximo entre lotes vigentes con stock. */
  proximoVencimiento: DiaISO | null;
  diasParaVencer: number | null;
  estadoStock: EstadoStock;
  estadoVencimiento: EstadoVencimiento;
}

interface FilaSql {
  id: string;
  codigo: string;
  nombre: string;
  presentacion: string | null;
  unidadMedida: string;
  categoriaId: string;
  categoria: string;
  requiereCadenaFrio: boolean;
  activo: boolean;
  total: number;
  vencido: number;
  por_vencer: number;
  en_ubicacion: number;
  lotes: number;
  con_fecha: number;
  minimo: number | null;
  maximo: number | null;
  proximo: Date | null;
  estado_stock: EstadoStock;
  total_filas: number;
}

function normalizarPaginacion(pagina?: number, porPagina?: number) {
  const pp = Math.min(Math.max(Math.trunc(porPagina ?? POR_PAGINA_DEFECTO) || POR_PAGINA_DEFECTO, 1), POR_PAGINA_MAXIMO);
  const p = Math.max(Math.trunc(pagina ?? 1) || 1, 1);
  return { pagina: p, porPagina: pp, saltar: (p - 1) * pp };
}

/** Fragmento `AND columna IN (...)` para el alcance de centros (o vacío). */
function filtroCentros(columna: Prisma.Sql, centros: string[] | null): Prisma.Sql {
  if (centros === null) return Prisma.empty;
  if (centros.length === 0) return Prisma.sql`AND FALSE`;
  return Prisma.sql`AND ${columna} IN (${Prisma.join(centros)})`;
}

/**
 * Inventario agregado por insumo, con filtros y paginación.
 * Permiso: `inventario:ver` (y acceso al centro si se indica).
 */
export async function listarInventario(
  actor: Actor,
  filtros: FiltrosInventario = {},
  opciones: { ahora?: Date } = {},
): Promise<Paginado<FilaInventario>> {
  verificarPermiso(actor, "inventario:ver");
  const centros = alcanceDeCentros(actor, filtros.centroId);
  const hoy = hoyEnSantiago(opciones.ahora);
  const limite = sumarDias(hoy, DIAS_POR_VENCER);
  const { pagina, porPagina, saltar } = normalizarPaginacion(filtros.pagina, filtros.porPagina);
  const ubicacionId = filtros.ubicacionId || null;
  const texto = filtros.texto?.trim() || null;
  const patron = texto ? `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;

  const condiciones: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (filtros.categoriaId) condiciones.push(Prisma.sql`b."categoriaId" = ${filtros.categoriaId}`);
  if (ubicacionId) condiciones.push(Prisma.sql`b.en_ubicacion > 0`);
  if (patron) {
    condiciones.push(Prisma.sql`(
      unaccent(b."nombre") ILIKE unaccent(${patron})
      OR b."codigo" ILIKE ${patron}
      OR b."codigoBarras" ILIKE ${patron}
      OR unaccent(COALESCE(b."fabricante", '')) ILIKE unaccent(${patron})
    )`);
  }
  switch (filtros.estado) {
    case "SIN_STOCK":
    case "BAJO_MINIMO":
    case "OK":
      condiciones.push(Prisma.sql`b.estado_stock = ${filtros.estado}`);
      break;
    case "VENCIDO":
      condiciones.push(Prisma.sql`b.vencido > 0`);
      break;
    case "POR_VENCER":
      condiciones.push(Prisma.sql`b.por_vencer > 0`);
      break;
    default:
      break;
  }

  const filas = await db.$queryRaw<FilaSql[]>(Prisma.sql`
    WITH ex AS (
      SELECT
        l."insumoId" AS insumo_id,
        SUM(e."cantidad")::int AS total,
        COALESCE(SUM(e."cantidad") FILTER (WHERE l."fechaVencimiento" < ${hoy}::date), 0)::int AS vencido,
        COALESCE(SUM(e."cantidad") FILTER (
          WHERE l."fechaVencimiento" >= ${hoy}::date AND l."fechaVencimiento" <= ${limite}::date
        ), 0)::int AS por_vencer,
        COALESCE(SUM(e."cantidad") FILTER (WHERE e."ubicacionId" = ${ubicacionId}), 0)::int AS en_ubicacion,
        (COUNT(DISTINCT l."id") FILTER (WHERE e."cantidad" > 0))::int AS lotes,
        (COUNT(DISTINCT l."id") FILTER (WHERE e."cantidad" > 0 AND l."fechaVencimiento" IS NOT NULL))::int AS con_fecha,
        MIN(l."fechaVencimiento") FILTER (
          WHERE e."cantidad" > 0 AND l."fechaVencimiento" >= ${hoy}::date
        ) AS proximo
      FROM "existencias" e
      JOIN "lotes" l ON l."id" = e."loteId"
      JOIN "ubicaciones" u ON u."id" = e."ubicacionId"
      JOIN "centros" ce ON ce."id" = u."centroId" AND ce."activo"
      WHERE TRUE ${filtroCentros(Prisma.sql`u."centroId"`, centros)}
      GROUP BY l."insumoId"
    ),
    par AS (
      SELECT
        p."insumoId" AS insumo_id,
        SUM(p."stockMinimo")::int AS minimo,
        SUM(p."stockMaximo")::int AS maximo
      FROM "parametros_stock" p
      JOIN "centros" ce ON ce."id" = p."centroId" AND ce."activo"
      WHERE TRUE ${filtroCentros(Prisma.sql`p."centroId"`, centros)}
      GROUP BY p."insumoId"
    ),
    b AS (
      SELECT
        i."id", i."codigo", i."nombre", i."presentacion", i."unidadMedida", i."categoriaId",
        i."codigoBarras", i."fabricante", i."requiereCadenaFrio", i."activo",
        c."nombre" AS categoria,
        COALESCE(ex.total, 0) AS total,
        COALESCE(ex.vencido, 0) AS vencido,
        COALESCE(ex.por_vencer, 0) AS por_vencer,
        COALESCE(ex.en_ubicacion, 0) AS en_ubicacion,
        COALESCE(ex.lotes, 0) AS lotes,
        COALESCE(ex.con_fecha, 0) AS con_fecha,
        par.minimo, par.maximo, ex.proximo,
        CASE
          WHEN COALESCE(ex.total, 0) - COALESCE(ex.vencido, 0) <= 0 THEN 'SIN_STOCK'
          WHEN par.minimo IS NOT NULL
               AND COALESCE(ex.total, 0) - COALESCE(ex.vencido, 0) < par.minimo THEN 'BAJO_MINIMO'
          ELSE 'OK'
        END AS estado_stock
      FROM "insumos" i
      JOIN "categorias" c ON c."id" = i."categoriaId"
      LEFT JOIN ex ON ex.insumo_id = i."id"
      LEFT JOIN par ON par.insumo_id = i."id"
      WHERE ex.insumo_id IS NOT NULL OR (par.insumo_id IS NOT NULL AND i."activo")
    )
    SELECT b.*, (COUNT(*) OVER ())::int AS total_filas
    FROM b
    WHERE ${Prisma.join(condiciones, " AND ")}
    ORDER BY b."nombre" ASC, b."id" ASC
    LIMIT ${porPagina} OFFSET ${saltar}
  `);

  const total = filas[0]?.total_filas ?? 0;
  const items = filas.map((f): FilaInventario => {
    const disponible = f.total - f.vencido;
    const proximo = f.proximo ? dateADia(f.proximo) : null;
    let estadoVencimiento: EstadoVencimiento;
    if (f.vencido > 0) estadoVencimiento = "VENCIDO";
    else if (f.por_vencer > 0) estadoVencimiento = "POR_VENCER";
    else if (f.con_fecha > 0) estadoVencimiento = "VIGENTE";
    else estadoVencimiento = "SIN_VENCIMIENTO";
    return {
      insumoId: f.id,
      codigo: f.codigo,
      nombre: f.nombre,
      presentacion: f.presentacion,
      unidadMedida: f.unidadMedida,
      categoriaId: f.categoriaId,
      categoria: f.categoria,
      requiereCadenaFrio: f.requiereCadenaFrio,
      activo: f.activo,
      total: f.total,
      vencido: f.vencido,
      disponible,
      porVencer: f.por_vencer,
      enUbicacion: ubicacionId ? f.en_ubicacion : null,
      lotes: f.lotes,
      stockMinimo: f.minimo,
      stockMaximo: f.maximo,
      proximoVencimiento: proximo,
      diasParaVencer: diasParaVencer(proximo, hoy),
      estadoStock: f.estado_stock,
      estadoVencimiento,
    };
  });

  // Si la página pedida quedó fuera de rango, el total real se obtiene aparte.
  let totalReal = total;
  if (items.length === 0 && pagina > 1) {
    const primera = await listarInventario(actor, { ...filtros, pagina: 1, porPagina: 1 }, opciones);
    totalReal = primera.total;
  }
  return {
    items,
    total: totalReal,
    pagina,
    porPagina,
    totalPaginas: Math.max(1, Math.ceil(totalReal / porPagina)),
  };
}

// ---------------------------------------------------------------------------
// Detalle de un insumo
// ---------------------------------------------------------------------------

export interface ExistenciaDetalle {
  existenciaId: string;
  loteId: string;
  numeroLote: string;
  fechaVencimiento: DiaISO | null;
  fechaFabricacion: DiaISO | null;
  diasParaVencer: number | null;
  estadoVencimiento: EstadoVencimiento;
  ubicacionId: string;
  ubicacion: string;
  tipoUbicacion: string;
  centroId: string;
  centro: string;
  cantidad: number;
}

export interface ParametroDetalle {
  centroId: string;
  centro: string;
  stockMinimo: number;
  stockMaximo: number | null;
  /** Disponible (no vencido) del insumo en ese centro. */
  disponible: number;
  estadoStock: EstadoStock;
}

export interface DetalleInsumo {
  insumo: {
    id: string;
    codigo: string;
    nombre: string;
    descripcion: string | null;
    categoriaId: string;
    categoria: string;
    unidadMedida: string;
    presentacion: string | null;
    fabricante: string | null;
    registroSanitario: string | null;
    codigoBarras: string | null;
    requiereCadenaFrio: boolean;
    controlaVencimiento: boolean;
    activo: boolean;
  };
  total: number;
  vencido: number;
  disponible: number;
  porVencer: number;
  stockMinimo: number | null;
  estadoStock: EstadoStock;
  estadoVencimiento: EstadoVencimiento;
  proximoVencimiento: DiaISO | null;
  /** Existencias con stock > 0, en orden FEFO. */
  existencias: ExistenciaDetalle[];
  /** Parámetros de stock por centro (dentro del alcance). */
  parametros: ParametroDetalle[];
}

/**
 * Detalle de un insumo: ficha, totales y existencias por lote/ubicación.
 * Permiso: `inventario:ver` (y acceso al centro si se indica).
 * Lanza NO_ENCONTRADO si el insumo no existe.
 */
export async function detalleInsumo(
  actor: Actor,
  insumoId: string,
  filtros: { centroId?: string | null } = {},
  opciones: { ahora?: Date } = {},
): Promise<DetalleInsumo> {
  verificarPermiso(actor, "inventario:ver");
  const centros = alcanceDeCentros(actor, filtros.centroId);
  const hoy = hoyEnSantiago(opciones.ahora);
  const filtroCentro = centros === null ? { activo: true } : { activo: true, id: { in: centros } };

  const insumo = await db.insumo.findUnique({
    where: { id: insumoId },
    include: { categoria: { select: { nombre: true } } },
  });
  if (!insumo) throw noEncontrado("El insumo");

  const [existencias, parametros] = await Promise.all([
    db.existencia.findMany({
      where: { cantidad: { gt: 0 }, lote: { insumoId }, ubicacion: { centro: filtroCentro } },
      select: {
        id: true,
        cantidad: true,
        lote: {
          select: { id: true, numeroLote: true, fechaVencimiento: true, fechaFabricacion: true, creadoEn: true },
        },
        ubicacion: {
          select: { id: true, nombre: true, tipo: true, centro: { select: { id: true, nombre: true } } },
        },
      },
    }),
    db.parametroStock.findMany({
      where: { insumoId, centro: filtroCentro },
      select: { stockMinimo: true, stockMaximo: true, centro: { select: { id: true, nombre: true } } },
      orderBy: { centro: { nombre: "asc" } },
    }),
  ]);

  const detalle = existencias
    .map((e): ExistenciaDetalle & { orden: number } => {
      const venc = e.lote.fechaVencimiento ? dateADia(e.lote.fechaVencimiento) : null;
      return {
        existenciaId: e.id,
        loteId: e.lote.id,
        numeroLote: e.lote.numeroLote,
        fechaVencimiento: venc,
        fechaFabricacion: e.lote.fechaFabricacion ? dateADia(e.lote.fechaFabricacion) : null,
        diasParaVencer: diasParaVencer(venc, hoy),
        estadoVencimiento: calcularEstadoVencimiento(venc, hoy),
        ubicacionId: e.ubicacion.id,
        ubicacion: e.ubicacion.nombre,
        tipoUbicacion: e.ubicacion.tipo,
        centroId: e.ubicacion.centro.id,
        centro: e.ubicacion.centro.nombre,
        cantidad: e.cantidad,
        orden: e.lote.creadoEn.getTime(),
      };
    })
    .sort(
      (a, b) =>
        (a.fechaVencimiento ?? "9999-12-31").localeCompare(b.fechaVencimiento ?? "9999-12-31") ||
        a.orden - b.orden ||
        a.centro.localeCompare(b.centro, "es") ||
        a.ubicacion.localeCompare(b.ubicacion, "es"),
    )
    .map(({ orden, ...resto }) => {
      void orden;
      return resto;
    });

  const total = detalle.reduce((s, e) => s + e.cantidad, 0);
  const vencido = detalle.filter((e) => e.estadoVencimiento === "VENCIDO").reduce((s, e) => s + e.cantidad, 0);
  const porVencer = detalle
    .filter((e) => e.estadoVencimiento === "POR_VENCER")
    .reduce((s, e) => s + e.cantidad, 0);
  const disponible = total - vencido;
  const stockMinimo = parametros.length > 0 ? parametros.reduce((s, p) => s + p.stockMinimo, 0) : null;
  const vigentes = detalle.filter((e) => e.estadoVencimiento !== "VENCIDO" && e.fechaVencimiento);

  let estadoVencimiento: EstadoVencimiento = "SIN_VENCIMIENTO";
  if (vencido > 0) estadoVencimiento = "VENCIDO";
  else if (porVencer > 0) estadoVencimiento = "POR_VENCER";
  else if (detalle.some((e) => e.fechaVencimiento)) estadoVencimiento = "VIGENTE";

  const disponiblePorCentro = new Map<string, number>();
  for (const e of detalle) {
    if (e.estadoVencimiento === "VENCIDO") continue;
    disponiblePorCentro.set(e.centroId, (disponiblePorCentro.get(e.centroId) ?? 0) + e.cantidad);
  }

  return {
    insumo: {
      id: insumo.id,
      codigo: insumo.codigo,
      nombre: insumo.nombre,
      descripcion: insumo.descripcion,
      categoriaId: insumo.categoriaId,
      categoria: insumo.categoria.nombre,
      unidadMedida: insumo.unidadMedida,
      presentacion: insumo.presentacion,
      fabricante: insumo.fabricante,
      registroSanitario: insumo.registroSanitario,
      codigoBarras: insumo.codigoBarras,
      requiereCadenaFrio: insumo.requiereCadenaFrio,
      controlaVencimiento: insumo.controlaVencimiento,
      activo: insumo.activo,
    },
    total,
    vencido,
    disponible,
    porVencer,
    stockMinimo,
    estadoStock: calcularEstadoStock(disponible, stockMinimo),
    estadoVencimiento,
    proximoVencimiento: vigentes[0]?.fechaVencimiento ?? null,
    existencias: detalle,
    parametros: parametros.map((p) => {
      const disp = disponiblePorCentro.get(p.centro.id) ?? 0;
      return {
        centroId: p.centro.id,
        centro: p.centro.nombre,
        stockMinimo: p.stockMinimo,
        stockMaximo: p.stockMaximo,
        disponible: disp,
        estadoStock: calcularEstadoStock(disp, p.stockMinimo),
      };
    }),
  };
}
