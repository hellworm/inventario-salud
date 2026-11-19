import "server-only";
import { Prisma, type TipoMovimiento } from "@prisma/client";
import { dateADia, finDelDia, inicioDelDia, parsearDiaFiltro, type DiaISO } from "@/lib/fechas";
import type { Actor } from "@/lib/permisos";
import type { Paginado } from "@/lib/resultado";
import { alcanceDeCentros, verificarPermiso } from "../autorizacion";
import { db } from "../db";
import { armarPaginado, normalizarPagina, patronLike, textoDeBusqueda } from "./apoyo-admin";

export interface FiltrosMovimientos {
  /** `null`/omitido = todos los centros visibles del actor. */
  centroId?: string | null;
  ubicacionId?: string | null;
  insumoId?: string | null;
  loteId?: string | null;
  tipo?: TipoMovimiento | TipoMovimiento[] | null;
  usuarioId?: string | null;
  proveedorId?: string | null;
  /** Día inicial inclusive (`YYYY-MM-DD` o `dd-MM-yyyy`), hora de Santiago. */
  desde?: string | null;
  /** Día final inclusive. */
  hasta?: string | null;
  /** Busca en nombre/código del insumo, número de lote y documento (sin distinguir tildes ni mayúsculas). */
  texto?: string | null;
  pagina?: number;
  porPagina?: number;
}

export interface FilaMovimiento {
  id: string;
  tipo: TipoMovimiento;
  creadoEn: Date;
  cantidad: number;
  saldoPosterior: number;
  insumoId: string;
  insumoCodigo: string;
  insumoNombre: string;
  unidadMedida: string;
  loteId: string;
  numeroLote: string;
  fechaVencimiento: DiaISO | null;
  ubicacionId: string;
  ubicacion: string;
  centroId: string;
  centro: string;
  usuarioId: string;
  usuario: string;
  proveedorId: string | null;
  proveedor: string | null;
  motivo: string | null;
  documentoRef: string | null;
  costoUnitario: number | null;
  nota: string | null;
  trasladoGrupoId: string | null;
}

const SELECCION = {
  id: true,
  tipo: true,
  creadoEn: true,
  cantidad: true,
  saldoPosterior: true,
  motivo: true,
  documentoRef: true,
  costoUnitario: true,
  nota: true,
  trasladoGrupoId: true,
  insumo: { select: { id: true, codigo: true, nombre: true, unidadMedida: true } },
  lote: { select: { id: true, numeroLote: true, fechaVencimiento: true } },
  ubicacion: { select: { id: true, nombre: true } },
  centro: { select: { id: true, nombre: true } },
  usuario: { select: { id: true, nombre: true } },
  proveedor: { select: { id: true, razonSocial: true } },
} satisfies Prisma.MovimientoSelect;

type MovimientoSeleccionado = Prisma.MovimientoGetPayload<{ select: typeof SELECCION }>;

function aFila(m: MovimientoSeleccionado): FilaMovimiento {
  return {
    id: m.id,
    tipo: m.tipo,
    creadoEn: m.creadoEn,
    cantidad: m.cantidad,
    saldoPosterior: m.saldoPosterior,
    insumoId: m.insumo.id,
    insumoCodigo: m.insumo.codigo,
    insumoNombre: m.insumo.nombre,
    unidadMedida: m.insumo.unidadMedida,
    loteId: m.lote.id,
    numeroLote: m.lote.numeroLote,
    fechaVencimiento: m.lote.fechaVencimiento ? dateADia(m.lote.fechaVencimiento) : null,
    ubicacionId: m.ubicacion.id,
    ubicacion: m.ubicacion.nombre,
    centroId: m.centro.id,
    centro: m.centro.nombre,
    usuarioId: m.usuario.id,
    usuario: m.usuario.nombre,
    proveedorId: m.proveedor?.id ?? null,
    proveedor: m.proveedor?.razonSocial ?? null,
    motivo: m.motivo,
    documentoRef: m.documentoRef,
    costoUnitario: m.costoUnitario === null ? null : Number(m.costoUnitario),
    nota: m.nota,
    trasladoGrupoId: m.trasladoGrupoId,
  };
}

/**
 * Construye el `where` de Prisma respetando el alcance del actor (centros
 * visibles, ubicación, insumo, lote, usuario, proveedor, tipo y fechas).
 *
 * NO incluye la búsqueda por `texto`: Prisma no expone `unaccent`, así que el
 * texto se resuelve aparte con SQL, sin distinguir tildes, mediante
 * `consultaPorTexto(where, texto)`. Así el historial, el reporte de
 * movimientos, el de mermas y sus CSV buscan igual.
 */
export function condicionMovimientos(actor: Actor, filtros: FiltrosMovimientos): Prisma.MovimientoWhereInput {
  const centros = alcanceDeCentros(actor, filtros.centroId);
  const desde = parsearDiaFiltro(filtros.desde ?? null);
  const hasta = parsearDiaFiltro(filtros.hasta ?? null);
  const tipos = filtros.tipo ? (Array.isArray(filtros.tipo) ? filtros.tipo : [filtros.tipo]) : null;

  return {
    ...(centros === null ? {} : { centroId: { in: centros } }),
    ...(filtros.ubicacionId ? { ubicacionId: filtros.ubicacionId } : {}),
    ...(filtros.insumoId ? { insumoId: filtros.insumoId } : {}),
    ...(filtros.loteId ? { loteId: filtros.loteId } : {}),
    ...(filtros.usuarioId ? { usuarioId: filtros.usuarioId } : {}),
    ...(filtros.proveedorId ? { proveedorId: filtros.proveedorId } : {}),
    ...(tipos && tipos.length > 0 ? { tipo: { in: tipos } } : {}),
    ...(desde || hasta
      ? {
          creadoEn: {
            ...(desde ? { gte: inicioDelDia(desde) } : {}),
            ...(hasta ? { lt: finDelDia(hasta) } : {}),
          },
        }
      : {}),
  };
}

/**
 * Condición SQL (alias `m`) equivalente a un `where` de `condicionMovimientos`
 * MÁS la búsqueda por texto con `unaccent` ("dialisis" encuentra "Diálisis",
 * "guia" encuentra "GUÍA 123") en nombre/código del insumo, número de lote y
 * documento.
 */
function sqlPorTexto(where: Prisma.MovimientoWhereInput, texto: string): Prisma.Sql {
  const patron = patronLike(texto);
  // Candidatos por texto. El catálogo y los lotes son acotados; los documentos
  // se buscan directo en movimientos.
  const coincide = Prisma.sql`(
    m."insumoId" IN (
      SELECT i."id" FROM "insumos" i
      WHERE unaccent(i."nombre") ILIKE unaccent(${patron}) OR unaccent(i."codigo") ILIKE unaccent(${patron})
    )
    OR m."loteId" IN (SELECT l."id" FROM "lotes" l WHERE unaccent(l."numeroLote") ILIKE unaccent(${patron}))
    OR unaccent(COALESCE(m."documentoRef", '')) ILIKE unaccent(${patron})
  )`;
  // Los demás filtros (centros visibles, fechas, tipo…) se traducen a SQL.
  const condiciones: Prisma.Sql[] = [coincide];
  const centro = where.centroId as { in: string[] } | undefined;
  if (centro) {
    condiciones.push(
      centro.in.length > 0 ? Prisma.sql`m."centroId" IN (${Prisma.join(centro.in)})` : Prisma.sql`FALSE`,
    );
  }
  for (const columna of ["ubicacionId", "insumoId", "loteId", "usuarioId", "proveedorId"] as const) {
    const valor = where[columna];
    if (typeof valor === "string") condiciones.push(Prisma.sql`m.${Prisma.raw(`"${columna}"`)} = ${valor}`);
  }
  const tipos = (where.tipo as { in: TipoMovimiento[] } | undefined)?.in;
  if (tipos) {
    condiciones.push(Prisma.sql`m."tipo" IN (${Prisma.join(tipos.map((t) => Prisma.sql`${t}::"TipoMovimiento"`))})`);
  }
  const periodo = where.creadoEn as { gte?: Date; lt?: Date } | undefined;
  if (periodo?.gte) condiciones.push(Prisma.sql`m."creadoEn" >= ${periodo.gte}`);
  if (periodo?.lt) condiciones.push(Prisma.sql`m."creadoEn" < ${periodo.lt}`);
  return Prisma.join(condiciones, " AND ");
}

/** Posición en el orden del historial (más recientes primero) para leer por lotes sin OFFSET. */
export interface CursorMovimiento {
  creadoEn: Date;
  id: string;
}

export interface ConsultaPorTexto {
  contar(): Promise<number>;
  /** Ids en el orden del historial; con `despuesDe` continúa desde ese movimiento (sin OFFSET). */
  ids(opciones: { limite: number; saltar?: number; despuesDe?: CursorMovimiento }): Promise<CursorMovimiento[]>;
  /** Conteo y unidades agrupados por tipo o por motivo. */
  agrupar(columna: "tipo" | "motivo"): Promise<{ clave: string | null; movimientos: number; unidades: number }[]>;
}

/**
 * Consultas del libro mayor filtradas por un `where` de `condicionMovimientos`
 * y, además, por texto sin distinguir tildes ni mayúsculas. La usan el
 * historial, los reportes de movimientos y mermas y sus exportaciones.
 */
export function consultaPorTexto(where: Prisma.MovimientoWhereInput, texto: string): ConsultaPorTexto {
  const donde = sqlPorTexto(where, texto);
  return {
    async contar() {
      const [fila] = await db.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT COUNT(*) AS "total" FROM "movimientos" m WHERE ${donde}`,
      );
      return Number(fila?.total ?? 0);
    },
    ids({ limite, saltar = 0, despuesDe }) {
      const desde = despuesDe
        ? Prisma.sql`AND (m."creadoEn", m."id") < (${despuesDe.creadoEn}, ${despuesDe.id})`
        : Prisma.empty;
      return db.$queryRaw<CursorMovimiento[]>(Prisma.sql`
        SELECT m."id", m."creadoEn" FROM "movimientos" m
        WHERE ${donde} ${desde}
        ORDER BY m."creadoEn" DESC, m."id" DESC
        LIMIT ${limite} OFFSET ${saltar}
      `);
    },
    async agrupar(columna) {
      const filas = await db.$queryRaw<{ clave: string | null; movimientos: bigint; unidades: bigint | null }[]>(Prisma.sql`
        SELECT m.${Prisma.raw(`"${columna}"`)}::text AS "clave", COUNT(*) AS "movimientos", SUM(m."cantidad") AS "unidades"
        FROM "movimientos" m
        WHERE ${donde}
        GROUP BY 1
      `);
      return filas.map((f) => ({ clave: f.clave, movimientos: Number(f.movimientos), unidades: Number(f.unidades ?? 0) }));
    },
  };
}

/**
 * Historial de movimientos (más recientes primero), con filtros y paginación.
 * La búsqueda por texto no distingue tildes ni mayúsculas.
 * Permiso: `movimientos:ver` (y acceso al centro si se indica).
 */
export async function listarMovimientos(
  actor: Actor,
  filtros: FiltrosMovimientos = {},
): Promise<Paginado<FilaMovimiento>> {
  verificarPermiso(actor, "movimientos:ver");
  const texto = textoDeBusqueda(filtros.texto);
  const where = condicionMovimientos(actor, filtros);
  const { pagina, porPagina, saltar } = normalizarPagina(filtros);

  if (texto) {
    const consulta = consultaPorTexto(where, texto);
    const [total, ids] = await Promise.all([consulta.contar(), consulta.ids({ limite: porPagina, saltar })]);
    const filas = await db.movimiento.findMany({
      where: { id: { in: ids.map((f) => f.id) } },
      select: SELECCION,
      orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
    });
    return armarPaginado(filas.map(aFila), total, pagina, porPagina);
  }

  const [total, filas] = await Promise.all([
    db.movimiento.count({ where }),
    db.movimiento.findMany({
      where,
      select: SELECCION,
      orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
      skip: saltar,
      take: porPagina,
    }),
  ]);
  return armarPaginado(filas.map(aFila), total, pagina, porPagina);
}

/**
 * Los movimientos de un traslado (salida y entrada) a partir de su grupo.
 * Solo devuelve los de centros visibles para el actor.
 */
export async function obtenerTraslado(actor: Actor, trasladoGrupoId: string): Promise<FilaMovimiento[]> {
  verificarPermiso(actor, "movimientos:ver");
  const centros = alcanceDeCentros(actor);
  const filas = await db.movimiento.findMany({
    where: { trasladoGrupoId, ...(centros === null ? {} : { centroId: { in: centros } }) },
    select: SELECCION,
    orderBy: { tipo: "desc" },
  });
  return filas.map(aFila);
}

/**
 * Un movimiento por id, con todos sus campos (detalle del historial).
 * Devuelve `null` si no existe o pertenece a un centro fuera del alcance.
 */
export async function obtenerMovimiento(actor: Actor, movimientoId: string): Promise<FilaMovimiento | null> {
  verificarPermiso(actor, "movimientos:ver");
  const centros = alcanceDeCentros(actor);
  const fila = await db.movimiento.findFirst({
    where: { id: movimientoId, ...(centros === null ? {} : { centroId: { in: centros } }) },
    select: SELECCION,
  });
  return fila ? aFila(fila) : null;
}

export interface OpcionUsuarioMovimientos {
  id: string;
  nombre: string;
}

/**
 * Usuarios que registraron movimientos dentro del alcance (para el filtro
 * "Usuario" del historial). Permiso: `movimientos:ver`.
 */
export async function usuariosConMovimientos(
  actor: Actor,
  filtros: { centroId?: string | null } = {},
): Promise<OpcionUsuarioMovimientos[]> {
  verificarPermiso(actor, "movimientos:ver");
  const centros = alcanceDeCentros(actor, filtros.centroId);
  return db.usuario.findMany({
    where: { movimientos: { some: centros === null ? {} : { centroId: { in: centros } } } },
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
}
