import "server-only";
import type { Prisma, TipoMovimiento } from "@prisma/client";
import { dateADia, finDelDia, inicioDelDia, parsearDia, type DiaISO } from "@/lib/fechas";
import type { Actor } from "@/lib/permisos";
import { POR_PAGINA_DEFECTO, POR_PAGINA_MAXIMO, type Paginado } from "@/lib/resultado";
import { alcanceDeCentros, verificarPermiso } from "../autorizacion";
import { db } from "../db";

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
  /** Busca en nombre/código del insumo, número de lote y documento. */
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

/** Construye el `where` de Prisma respetando el alcance del actor. */
export function condicionMovimientos(actor: Actor, filtros: FiltrosMovimientos): Prisma.MovimientoWhereInput {
  const centros = alcanceDeCentros(actor, filtros.centroId);
  const desde = parsearDia(filtros.desde ?? null);
  const hasta = parsearDia(filtros.hasta ?? null);
  const texto = filtros.texto?.trim();
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
    ...(texto
      ? {
          OR: [
            { insumo: { nombre: { contains: texto, mode: "insensitive" } } },
            { insumo: { codigo: { contains: texto, mode: "insensitive" } } },
            { lote: { numeroLote: { contains: texto, mode: "insensitive" } } },
            { documentoRef: { contains: texto, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

/**
 * Historial de movimientos (más recientes primero), con filtros y paginación.
 * Permiso: `movimientos:ver` (y acceso al centro si se indica).
 */
export async function listarMovimientos(
  actor: Actor,
  filtros: FiltrosMovimientos = {},
): Promise<Paginado<FilaMovimiento>> {
  verificarPermiso(actor, "movimientos:ver");
  const where = condicionMovimientos(actor, filtros);
  const porPagina = Math.min(
    Math.max(Math.trunc(filtros.porPagina ?? POR_PAGINA_DEFECTO) || POR_PAGINA_DEFECTO, 1),
    POR_PAGINA_MAXIMO,
  );
  const pagina = Math.max(Math.trunc(filtros.pagina ?? 1) || 1, 1);

  const [total, filas] = await Promise.all([
    db.movimiento.count({ where }),
    db.movimiento.findMany({
      where,
      select: SELECCION,
      orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
  ]);
  return {
    items: filas.map(aFila),
    total,
    pagina,
    porPagina,
    totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
  };
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
