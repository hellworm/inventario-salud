import "server-only";
import type { TipoUbicacion } from "@prisma/client";
import { calcularEstadoVencimiento, diasParaVencer, type EstadoVencimiento } from "@/lib/estados";
import { dateADia, hoyEnSantiago, type DiaISO } from "@/lib/fechas";
import type { Actor } from "@/lib/permisos";
import { alcanceDeCentros, verificarPermiso } from "../autorizacion";
import { db } from "../db";
import { noEncontrado } from "../errores";

/**
 * Consultas livianas para poblar formularios (selects, buscadores).
 * Todas respetan el alcance de centros del actor.
 */

export interface OpcionCategoria {
  id: string;
  nombre: string;
}

export interface OpcionInsumo {
  id: string;
  codigo: string;
  nombre: string;
  presentacion: string | null;
  unidadMedida: string;
  categoria: string;
  controlaVencimiento: boolean;
  requiereCadenaFrio: boolean;
  codigoBarras: string | null;
}

export interface OpcionUbicacion {
  id: string;
  nombre: string;
  tipo: TipoUbicacion;
  centroId: string;
  centro: string;
}

export interface OpcionProveedor {
  id: string;
  rut: string;
  razonSocial: string;
}

export interface OpcionLote {
  loteId: string;
  numeroLote: string;
  fechaVencimiento: DiaISO | null;
  diasParaVencer: number | null;
  estadoVencimiento: EstadoVencimiento;
  /** Stock del lote en la ubicación consultada. */
  cantidad: number;
}

/** Categorías ordenadas por nombre. Permiso: `catalogo:ver`. */
export async function listarCategorias(actor: Actor): Promise<OpcionCategoria[]> {
  verificarPermiso(actor, "catalogo:ver");
  return db.categoria.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: "asc" } });
}

/**
 * Busca insumos del catálogo por nombre, código o código de barras.
 * Permiso: `catalogo:ver`.
 */
export async function buscarInsumos(
  actor: Actor,
  filtros: { texto?: string | null; categoriaId?: string | null; soloActivos?: boolean; limite?: number } = {},
): Promise<OpcionInsumo[]> {
  verificarPermiso(actor, "catalogo:ver");
  const texto = filtros.texto?.trim();
  const filas = await db.insumo.findMany({
    where: {
      ...(filtros.soloActivos === false ? {} : { activo: true }),
      ...(filtros.categoriaId ? { categoriaId: filtros.categoriaId } : {}),
      ...(texto
        ? {
            OR: [
              { nombre: { contains: texto, mode: "insensitive" } },
              { codigo: { contains: texto, mode: "insensitive" } },
              { codigoBarras: { equals: texto } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      codigo: true,
      nombre: true,
      presentacion: true,
      unidadMedida: true,
      controlaVencimiento: true,
      requiereCadenaFrio: true,
      codigoBarras: true,
      categoria: { select: { nombre: true } },
    },
    orderBy: { nombre: "asc" },
    take: Math.min(Math.max(filtros.limite ?? 50, 1), 500),
  });
  return filas.map(({ categoria, ...resto }) => ({ ...resto, categoria: categoria.nombre }));
}

/**
 * Ubicaciones de los centros visibles (o de un centro). Permiso: `inventario:ver`.
 */
export async function listarUbicaciones(
  actor: Actor,
  filtros: { centroId?: string | null; soloActivas?: boolean } = {},
): Promise<OpcionUbicacion[]> {
  verificarPermiso(actor, "inventario:ver");
  const centros = alcanceDeCentros(actor, filtros.centroId);
  const soloActivas = filtros.soloActivas !== false;
  const filas = await db.ubicacion.findMany({
    where: {
      ...(soloActivas ? { activo: true } : {}),
      centro: {
        ...(soloActivas ? { activo: true } : {}),
        ...(centros === null ? {} : { id: { in: centros } }),
      },
    },
    select: { id: true, nombre: true, tipo: true, centroId: true, centro: { select: { nombre: true } } },
    orderBy: [{ centro: { nombre: "asc" } }, { nombre: "asc" }],
  });
  return filas.map(({ centro, ...resto }) => ({ ...resto, centro: centro.nombre }));
}

/** Proveedores activos. Permiso: `proveedores:ver`. */
export async function listarProveedoresActivos(actor: Actor): Promise<OpcionProveedor[]> {
  verificarPermiso(actor, "proveedores:ver");
  return db.proveedor.findMany({
    where: { activo: true },
    select: { id: true, rut: true, razonSocial: true },
    orderBy: { razonSocial: "asc" },
  });
}

/**
 * Lotes de un insumo con stock en una ubicación, en orden FEFO.
 * Por defecto excluye los vencidos (no se pueden retirar); para mermas o
 * ajustes usar `incluirVencidos: true`.
 * Permiso: `inventario:ver` en el centro de la ubicación.
 */
export async function lotesDisponibles(
  actor: Actor,
  filtros: { insumoId: string; ubicacionId: string; incluirVencidos?: boolean },
  opciones: { ahora?: Date } = {},
): Promise<OpcionLote[]> {
  verificarPermiso(actor, "inventario:ver");
  const ubicacion = await db.ubicacion.findUnique({
    where: { id: filtros.ubicacionId },
    select: { centroId: true },
  });
  if (!ubicacion) throw noEncontrado("La ubicación");
  verificarPermiso(actor, "inventario:ver", ubicacion.centroId);

  const hoy = hoyEnSantiago(opciones.ahora);
  const filas = await db.existencia.findMany({
    where: { ubicacionId: filtros.ubicacionId, cantidad: { gt: 0 }, lote: { insumoId: filtros.insumoId } },
    select: {
      cantidad: true,
      lote: { select: { id: true, numeroLote: true, fechaVencimiento: true, creadoEn: true } },
    },
  });
  return filas
    .map((f) => {
      const venc = f.lote.fechaVencimiento ? dateADia(f.lote.fechaVencimiento) : null;
      return {
        loteId: f.lote.id,
        numeroLote: f.lote.numeroLote,
        fechaVencimiento: venc,
        diasParaVencer: diasParaVencer(venc, hoy),
        estadoVencimiento: calcularEstadoVencimiento(venc, hoy),
        cantidad: f.cantidad,
        creado: f.lote.creadoEn.getTime(),
      };
    })
    .filter((l) => filtros.incluirVencidos || l.estadoVencimiento !== "VENCIDO")
    .sort(
      (a, b) =>
        (a.fechaVencimiento ?? "9999-12-31").localeCompare(b.fechaVencimiento ?? "9999-12-31") ||
        a.creado - b.creado ||
        a.loteId.localeCompare(b.loteId),
    )
    .map(({ creado, ...resto }) => {
      void creado;
      return resto;
    });
}

/**
 * Lotes ya registrados de un insumo (para autocompletar al ingresar y evitar
 * duplicar un lote con otra fecha). Permiso: `catalogo:ver`.
 */
export async function lotesDeInsumo(
  actor: Actor,
  insumoId: string,
  limite = 30,
): Promise<{ loteId: string; numeroLote: string; fechaVencimiento: DiaISO | null }[]> {
  verificarPermiso(actor, "catalogo:ver");
  const filas = await db.lote.findMany({
    where: { insumoId },
    select: { id: true, numeroLote: true, fechaVencimiento: true },
    orderBy: { creadoEn: "desc" },
    take: Math.min(Math.max(limite, 1), 200),
  });
  return filas.map((l) => ({
    loteId: l.id,
    numeroLote: l.numeroLote,
    fechaVencimiento: l.fechaVencimiento ? dateADia(l.fechaVencimiento) : null,
  }));
}
