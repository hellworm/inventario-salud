import "server-only";
import { esquemaActualizarCategoria, esquemaCategoria, type EntradaActualizarCategoria, type EntradaCategoria } from "@/lib/esquemas/catalogo";
import type { Actor } from "@/lib/permisos";
import { registrarAuditoria } from "../auditoria";
import { verificarPermiso } from "../autorizacion";
import { db, enTransaccion, type Tx } from "../db";
import { ErrorDominio, noEncontrado } from "../errores";
import { validar } from "../validacion";

export interface FilaCategoria {
  id: string;
  nombre: string;
  /** Insumos (activos e inactivos) que pertenecen a la categoría. */
  insumos: number;
  insumosActivos: number;
}

/** Categorías con su conteo de insumos. Permiso: `catalogo:gestionar`. */
export async function listarCategoriasAdmin(actor: Actor): Promise<FilaCategoria[]> {
  verificarPermiso(actor, "catalogo:gestionar");
  const [categorias, activos] = await Promise.all([
    db.categoria.findMany({
      select: { id: true, nombre: true, _count: { select: { insumos: true } } },
      orderBy: { nombre: "asc" },
    }),
    db.insumo.groupBy({ by: ["categoriaId"], where: { activo: true }, _count: { _all: true } }),
  ]);
  const activosPorCategoria = new Map(activos.map((a) => [a.categoriaId, a._count._all]));
  return categorias.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    insumos: c._count.insumos,
    insumosActivos: activosPorCategoria.get(c.id) ?? 0,
  }));
}

async function exigirNombreLibre(tx: Tx, nombre: string, exceptoId?: string): Promise<void> {
  const existente = await tx.categoria.findFirst({
    where: { nombre: { equals: nombre, mode: "insensitive" }, ...(exceptoId ? { id: { not: exceptoId } } : {}) },
    select: { id: true },
  });
  if (existente) {
    throw new ErrorDominio("DUPLICADO", "Ya existe una categoría con ese nombre.", { campo: "nombre" });
  }
}

/** Crea una categoría. Permiso: `catalogo:gestionar`. */
export async function crearCategoria(actor: Actor, entrada: EntradaCategoria): Promise<{ id: string; nombre: string }> {
  verificarPermiso(actor, "catalogo:gestionar");
  const datos = validar(esquemaCategoria, entrada);
  return enTransaccion(async (tx) => {
    await exigirNombreLibre(tx, datos.nombre);
    const categoria = await tx.categoria.create({ data: { nombre: datos.nombre }, select: { id: true, nombre: true } });
    await registrarAuditoria(tx, actor, {
      accion: "CATEGORIA_CREADA",
      entidad: "Categoria",
      entidadId: categoria.id,
      detalle: { nombre: categoria.nombre },
    });
    return categoria;
  });
}

/** Cambia el nombre de una categoría. Permiso: `catalogo:gestionar`. */
export async function actualizarCategoria(
  actor: Actor,
  entrada: EntradaActualizarCategoria,
): Promise<{ id: string; nombre: string }> {
  verificarPermiso(actor, "catalogo:gestionar");
  const datos = validar(esquemaActualizarCategoria, entrada);
  return enTransaccion(async (tx) => {
    const actual = await tx.categoria.findUnique({ where: { id: datos.id }, select: { id: true, nombre: true } });
    if (!actual) throw noEncontrado("La categoría");
    if (actual.nombre === datos.nombre) return actual;
    await exigirNombreLibre(tx, datos.nombre, datos.id);
    const categoria = await tx.categoria.update({
      where: { id: datos.id },
      data: { nombre: datos.nombre },
      select: { id: true, nombre: true },
    });
    await registrarAuditoria(tx, actor, {
      accion: "CATEGORIA_ACTUALIZADA",
      entidad: "Categoria",
      entidadId: categoria.id,
      detalle: { nombre: categoria.nombre, cambios: { nombre: { antes: actual.nombre, despues: categoria.nombre } } },
    });
    return categoria;
  });
}

/**
 * Elimina una categoría SOLO si no tiene insumos (activos o inactivos).
 * Permiso: `catalogo:gestionar`.
 */
export async function eliminarCategoria(actor: Actor, categoriaId: string): Promise<{ id: string }> {
  verificarPermiso(actor, "catalogo:gestionar");
  return enTransaccion(async (tx) => {
    const categoria = await tx.categoria.findUnique({
      where: { id: categoriaId },
      select: { id: true, nombre: true, _count: { select: { insumos: true } } },
    });
    if (!categoria) throw noEncontrado("La categoría");
    if (categoria._count.insumos > 0) {
      const n = categoria._count.insumos;
      throw new ErrorDominio(
        "EN_USO",
        `No se puede eliminar "${categoria.nombre}": tiene ${n} ${n === 1 ? "insumo" : "insumos"}. Muévelos a otra categoría primero.`,
        { detalle: { insumos: n } },
      );
    }
    await tx.categoria.delete({ where: { id: categoriaId } });
    await registrarAuditoria(tx, actor, {
      accion: "CATEGORIA_ELIMINADA",
      entidad: "Categoria",
      entidadId: categoriaId,
      detalle: { nombre: categoria.nombre },
    });
    return { id: categoriaId };
  });
}
