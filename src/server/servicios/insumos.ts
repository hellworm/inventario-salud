import "server-only";
import { Prisma } from "@prisma/client";
import {
  esquemaActualizarInsumo,
  esquemaInsumo,
  esquemaParametrosStock,
  type DatosInsumo,
  type EntradaActualizarInsumo,
  type EntradaInsumo,
  type EntradaParametrosStock,
} from "@/lib/esquemas/catalogo";
import type { Actor } from "@/lib/permisos";
import type { Paginado } from "@/lib/resultado";
import { registrarAuditoria } from "../auditoria";
import { verificarPermiso } from "../autorizacion";
import { db, enTransaccion, type Tx } from "../db";
import { ErrorDominio, noEncontrado } from "../errores";
import { validar } from "../validacion";
import {
  armarPaginado,
  calcularCambios,
  comoJson,
  conUnicidad,
  normalizarPagina,
  patronLike,
  type FiltroEstado,
  type OpcionesPagina,
} from "./apoyo-admin";

export interface FilaInsumoAdmin {
  id: string;
  codigo: string;
  nombre: string;
  categoriaId: string;
  categoria: string;
  unidadMedida: string;
  presentacion: string | null;
  fabricante: string | null;
  requiereCadenaFrio: boolean;
  controlaVencimiento: boolean;
  activo: boolean;
  /** Centros con stock mínimo o máximo definido. */
  centrosConParametro: number;
}

export interface FiltrosInsumosAdmin extends OpcionesPagina {
  texto?: string | null;
  categoriaId?: string | null;
  estado?: FiltroEstado | null;
}

/**
 * Catálogo completo (activos e inactivos) para administración. Busca por
 * nombre, código, fabricante o código de barras, sin distinguir tildes.
 * Permiso: `catalogo:gestionar`.
 */
export async function listarInsumosAdmin(actor: Actor, filtros: FiltrosInsumosAdmin = {}): Promise<Paginado<FilaInsumoAdmin>> {
  verificarPermiso(actor, "catalogo:gestionar");
  const { pagina, porPagina, saltar } = normalizarPagina(filtros);
  const texto = filtros.texto?.trim();

  const condiciones: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (texto) {
    const patron = patronLike(texto);
    condiciones.push(Prisma.sql`(
      unaccent(i."nombre") ILIKE unaccent(${patron})
      OR i."codigo" ILIKE ${patron}
      OR unaccent(COALESCE(i."fabricante", '')) ILIKE unaccent(${patron})
      OR i."codigoBarras" = ${texto}
    )`);
  }
  if (filtros.categoriaId) condiciones.push(Prisma.sql`i."categoriaId" = ${filtros.categoriaId}`);
  if (filtros.estado === "activos") condiciones.push(Prisma.sql`i."activo"`);
  if (filtros.estado === "inactivos") condiciones.push(Prisma.sql`NOT i."activo"`);
  const donde = Prisma.join(condiciones, " AND ");

  const [conteo, filas] = await Promise.all([
    db.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS total FROM "insumos" i WHERE ${donde}`),
    db.$queryRaw<(Omit<FilaInsumoAdmin, "centrosConParametro"> & { centrosConParametro: bigint })[]>(Prisma.sql`
      SELECT i."id", i."codigo", i."nombre", i."categoriaId", c."nombre" AS "categoria", i."unidadMedida",
             i."presentacion", i."fabricante", i."requiereCadenaFrio", i."controlaVencimiento", i."activo",
             (SELECT COUNT(*) FROM "parametros_stock" p WHERE p."insumoId" = i."id") AS "centrosConParametro"
      FROM "insumos" i
      JOIN "categorias" c ON c."id" = i."categoriaId"
      WHERE ${donde}
      ORDER BY i."activo" DESC, i."nombre" ASC, i."id" ASC
      LIMIT ${porPagina} OFFSET ${saltar}
    `),
  ]);
  return armarPaginado(
    filas.map((f) => ({ ...f, centrosConParametro: Number(f.centrosConParametro) })),
    Number(conteo[0]?.total ?? 0),
    pagina,
    porPagina,
  );
}

export interface ParametroCentro {
  centroId: string;
  centro: string;
  centroActivo: boolean;
  stockMinimo: number | null;
  stockMaximo: number | null;
  /** Unidades físicas del insumo hoy en el centro (referencia para definir el mínimo). */
  stockActual: number;
}

export interface InsumoAdmin {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  categoriaId: string;
  unidadMedida: string;
  presentacion: string | null;
  fabricante: string | null;
  registroSanitario: string | null;
  codigoBarras: string | null;
  requiereCadenaFrio: boolean;
  controlaVencimiento: boolean;
  activo: boolean;
  creadoEn: Date;
  actualizadoEn: Date;
  /** Tiene lotes o movimientos: no se puede eliminar, solo desactivar. */
  tieneHistoria: boolean;
  /** Unidades físicas en toda la red. */
  stockTotal: number;
  /** Una fila por centro (los inactivos solo si ya tienen parámetro). */
  parametros: ParametroCentro[];
}

/** Ficha de un insumo para editar, con sus parámetros de stock por centro. Permiso: `catalogo:gestionar`. */
export async function obtenerInsumoAdmin(actor: Actor, insumoId: string): Promise<InsumoAdmin> {
  verificarPermiso(actor, "catalogo:gestionar");
  const [insumo, centros, stock] = await Promise.all([
    db.insumo.findUnique({
      where: { id: insumoId },
      include: { parametros: true, _count: { select: { lotes: true, movimientos: true } } },
    }),
    db.centro.findMany({ select: { id: true, nombre: true, activo: true }, orderBy: { nombre: "asc" } }),
    db.$queryRaw<{ centroId: string; cantidad: bigint }[]>(Prisma.sql`
      SELECT u."centroId", COALESCE(SUM(e."cantidad"), 0) AS cantidad
      FROM "existencias" e
      JOIN "lotes" l ON l."id" = e."loteId"
      JOIN "ubicaciones" u ON u."id" = e."ubicacionId"
      WHERE l."insumoId" = ${insumoId}
      GROUP BY u."centroId"
    `),
  ]);
  if (!insumo) throw noEncontrado("El insumo");

  const stockPorCentro = new Map(stock.map((s) => [s.centroId, Number(s.cantidad)]));
  const parametroPorCentro = new Map(insumo.parametros.map((p) => [p.centroId, p]));
  const { parametros: _parametros, _count, ...datos } = insumo;
  void _parametros;
  return {
    ...datos,
    tieneHistoria: _count.lotes > 0 || _count.movimientos > 0,
    stockTotal: [...stockPorCentro.values()].reduce((s, n) => s + n, 0),
    parametros: centros
      .filter((c) => c.activo || parametroPorCentro.has(c.id))
      .map((c) => {
        const p = parametroPorCentro.get(c.id);
        return {
          centroId: c.id,
          centro: c.nombre,
          centroActivo: c.activo,
          stockMinimo: p ? p.stockMinimo : null,
          stockMaximo: p ? p.stockMaximo : null,
          stockActual: stockPorCentro.get(c.id) ?? 0,
        };
      }),
  };
}

async function exigirInsumoValido(tx: Tx, datos: DatosInsumo, exceptoId?: string): Promise<void> {
  const otro = exceptoId ? { id: { not: exceptoId } } : {};
  const mismoCodigo = await tx.insumo.findFirst({
    where: { codigo: { equals: datos.codigo, mode: "insensitive" }, ...otro },
    select: { nombre: true },
  });
  if (mismoCodigo) {
    throw new ErrorDominio("DUPLICADO", `El código ${datos.codigo} ya lo usa "${mismoCodigo.nombre}".`, { campo: "codigo" });
  }
  if (datos.codigoBarras) {
    const mismaBarra = await tx.insumo.findFirst({
      where: { codigoBarras: datos.codigoBarras, ...otro },
      select: { nombre: true },
    });
    if (mismaBarra) {
      throw new ErrorDominio("DUPLICADO", `Ese código de barras ya lo usa "${mismaBarra.nombre}".`, {
        campo: "codigoBarras",
      });
    }
  }
  const categoria = await tx.categoria.findUnique({ where: { id: datos.categoriaId }, select: { id: true } });
  if (!categoria) {
    throw new ErrorDominio("NO_ENCONTRADO", "La categoría seleccionada ya no existe.", { campo: "categoriaId" });
  }
}

function camposInsumo(datos: DatosInsumo) {
  return {
    codigo: datos.codigo,
    nombre: datos.nombre,
    descripcion: datos.descripcion ?? null,
    categoriaId: datos.categoriaId,
    unidadMedida: datos.unidadMedida,
    presentacion: datos.presentacion ?? null,
    fabricante: datos.fabricante ?? null,
    registroSanitario: datos.registroSanitario ?? null,
    codigoBarras: datos.codigoBarras ?? null,
    requiereCadenaFrio: datos.requiereCadenaFrio,
    controlaVencimiento: datos.controlaVencimiento,
  };
}

/** Crea un insumo en el catálogo común. Permiso: `catalogo:gestionar`. */
export async function crearInsumo(actor: Actor, entrada: EntradaInsumo): Promise<{ id: string; codigo: string; nombre: string }> {
  verificarPermiso(actor, "catalogo:gestionar");
  const datos = validar(esquemaInsumo, entrada);
  return conUnicidad(
    () =>
      enTransaccion(async (tx) => {
        await exigirInsumoValido(tx, datos);
        const insumo = await tx.insumo.create({
          data: camposInsumo(datos),
          select: { id: true, codigo: true, nombre: true },
        });
        await registrarAuditoria(tx, actor, {
          accion: "INSUMO_CREADO",
          entidad: "Insumo",
          entidadId: insumo.id,
          detalle: {
            codigo: insumo.codigo,
            nombre: insumo.nombre,
            unidadMedida: datos.unidadMedida,
            requiereCadenaFrio: datos.requiereCadenaFrio,
            controlaVencimiento: datos.controlaVencimiento,
          },
        });
        return insumo;
      }),
    "Ya existe un insumo con ese código.",
    "codigo",
  );
}

/** Actualiza los datos de un insumo. Permiso: `catalogo:gestionar`. */
export async function actualizarInsumo(
  actor: Actor,
  entrada: EntradaActualizarInsumo,
): Promise<{ id: string; codigo: string; nombre: string }> {
  verificarPermiso(actor, "catalogo:gestionar");
  const { id, ...datos } = validar(esquemaActualizarInsumo, entrada);
  return conUnicidad(
    () =>
      enTransaccion(async (tx) => {
        const actual = await tx.insumo.findUnique({ where: { id } });
        if (!actual) throw noEncontrado("El insumo");
        await exigirInsumoValido(tx, datos, id);
        const nuevos = camposInsumo(datos);
        const cambios = calcularCambios(
          {
            codigo: actual.codigo,
            nombre: actual.nombre,
            descripcion: actual.descripcion,
            categoriaId: actual.categoriaId,
            unidadMedida: actual.unidadMedida,
            presentacion: actual.presentacion,
            fabricante: actual.fabricante,
            registroSanitario: actual.registroSanitario,
            codigoBarras: actual.codigoBarras,
            requiereCadenaFrio: actual.requiereCadenaFrio,
            controlaVencimiento: actual.controlaVencimiento,
          },
          nuevos,
        );
        if (Object.keys(cambios).length === 0) return { id, codigo: actual.codigo, nombre: actual.nombre };

        if (cambios.categoriaId) {
          // En la auditoría se guarda el nombre de la categoría, no su id.
          const nombres = await tx.categoria.findMany({
            where: { id: { in: [actual.categoriaId, datos.categoriaId] } },
            select: { id: true, nombre: true },
          });
          const nombreDe = (catId: string) => nombres.find((c) => c.id === catId)?.nombre ?? catId;
          cambios.categoria = { antes: nombreDe(actual.categoriaId), despues: nombreDe(datos.categoriaId) };
          delete cambios.categoriaId;
        }
        const insumo = await tx.insumo.update({
          where: { id },
          data: nuevos,
          select: { id: true, codigo: true, nombre: true },
        });
        await registrarAuditoria(tx, actor, {
          accion: "INSUMO_ACTUALIZADO",
          entidad: "Insumo",
          entidadId: id,
          detalle: comoJson({ codigo: insumo.codigo, nombre: insumo.nombre, cambios }),
        });
        return insumo;
      }),
    "Ya existe un insumo con ese código.",
    "codigo",
  );
}

/**
 * Activa o desactiva un insumo. Un insumo inactivo no admite nuevos ingresos,
 * pero su stock e historial se conservan. Permiso: `catalogo:gestionar`.
 */
export async function establecerInsumoActivo(
  actor: Actor,
  insumoId: string,
  activo: boolean,
): Promise<{ id: string; activo: boolean }> {
  verificarPermiso(actor, "catalogo:gestionar");
  return enTransaccion(async (tx) => {
    const insumo = await tx.insumo.findUnique({
      where: { id: insumoId },
      select: { id: true, codigo: true, nombre: true, activo: true },
    });
    if (!insumo) throw noEncontrado("El insumo");
    if (insumo.activo !== activo) {
      await tx.insumo.update({ where: { id: insumoId }, data: { activo } });
      await registrarAuditoria(tx, actor, {
        accion: activo ? "INSUMO_ACTIVADO" : "INSUMO_DESACTIVADO",
        entidad: "Insumo",
        entidadId: insumoId,
        detalle: { codigo: insumo.codigo, nombre: insumo.nombre },
      });
    }
    return { id: insumoId, activo };
  });
}

/**
 * Elimina un insumo SOLO si nunca tuvo lotes ni movimientos (p. ej. creado
 * por error). Con historia se debe desactivar. Permiso: `catalogo:gestionar`.
 */
export async function eliminarInsumo(actor: Actor, insumoId: string): Promise<{ id: string }> {
  verificarPermiso(actor, "catalogo:gestionar");
  return enTransaccion(async (tx) => {
    const insumo = await tx.insumo.findUnique({
      where: { id: insumoId },
      select: { id: true, codigo: true, nombre: true, _count: { select: { lotes: true, movimientos: true } } },
    });
    if (!insumo) throw noEncontrado("El insumo");
    if (insumo._count.lotes > 0 || insumo._count.movimientos > 0) {
      throw new ErrorDominio(
        "EN_USO",
        `"${insumo.nombre}" tiene movimientos registrados y no se puede eliminar. Puedes desactivarlo.`,
      );
    }
    await tx.insumo.delete({ where: { id: insumoId } });
    await registrarAuditoria(tx, actor, {
      accion: "INSUMO_ELIMINADO",
      entidad: "Insumo",
      entidadId: insumoId,
      detalle: { codigo: insumo.codigo, nombre: insumo.nombre },
    });
    return { id: insumoId };
  });
}

/**
 * Guarda los parámetros de stock (mínimo / máximo) de un insumo para varios
 * centros a la vez. Una fila sin mínimo ni máximo elimina el parámetro de ese
 * centro. Solo se auditan los centros que realmente cambian.
 * Permiso: `parametros:gestionar`.
 */
export async function guardarParametrosStock(
  actor: Actor,
  entrada: EntradaParametrosStock,
): Promise<{ insumoId: string; actualizados: number }> {
  verificarPermiso(actor, "parametros:gestionar");
  const datos = validar(esquemaParametrosStock, entrada);
  const ids = datos.parametros.map((p) => p.centroId);
  if (new Set(ids).size !== ids.length) {
    throw new ErrorDominio("VALIDACION", "Hay centros repetidos en los parámetros.");
  }

  return enTransaccion(async (tx) => {
    const insumo = await tx.insumo.findUnique({ where: { id: datos.insumoId }, select: { id: true, codigo: true, nombre: true } });
    if (!insumo) throw noEncontrado("El insumo");
    const [centros, actuales] = await Promise.all([
      tx.centro.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } }),
      tx.parametroStock.findMany({ where: { insumoId: insumo.id, centroId: { in: ids } } }),
    ]);
    const nombreCentro = new Map(centros.map((c) => [c.id, c.nombre]));
    const actualPorCentro = new Map(actuales.map((p) => [p.centroId, p]));

    const cambios: { centro: string; minimoAntes: number | null; minimoDespues: number | null; maximoAntes: number | null; maximoDespues: number | null }[] = [];
    for (const p of datos.parametros) {
      const centro = nombreCentro.get(p.centroId);
      if (centro === undefined) throw noEncontrado("El centro");
      const actual = actualPorCentro.get(p.centroId);
      const vacio = p.stockMinimo === undefined && p.stockMaximo === undefined;
      const minimo = vacio ? null : (p.stockMinimo ?? 0);
      const maximo = vacio ? null : (p.stockMaximo ?? null);
      const minimoAntes = actual ? actual.stockMinimo : null;
      const maximoAntes = actual ? actual.stockMaximo : null;
      if (minimo === minimoAntes && maximo === maximoAntes) continue;

      if (minimo === null) {
        await tx.parametroStock.deleteMany({ where: { insumoId: insumo.id, centroId: p.centroId } });
      } else {
        await tx.parametroStock.upsert({
          where: { insumoId_centroId: { insumoId: insumo.id, centroId: p.centroId } },
          create: { insumoId: insumo.id, centroId: p.centroId, stockMinimo: minimo, stockMaximo: maximo },
          update: { stockMinimo: minimo, stockMaximo: maximo },
        });
      }
      cambios.push({ centro, minimoAntes, minimoDespues: minimo, maximoAntes, maximoDespues: maximo });
    }

    if (cambios.length > 0) {
      await registrarAuditoria(tx, actor, {
        accion: "PARAMETROS_STOCK_ACTUALIZADOS",
        entidad: "Insumo",
        entidadId: insumo.id,
        detalle: comoJson({ codigo: insumo.codigo, nombre: insumo.nombre, centros: cambios }),
      });
    }
    return { insumoId: insumo.id, actualizados: cambios.length };
  });
}
