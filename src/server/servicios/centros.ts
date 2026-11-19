import "server-only";
import { Prisma, type TipoCentro, type TipoUbicacion } from "@prisma/client";
import {
  esquemaActualizarCentro,
  esquemaActualizarUbicacion,
  esquemaCentro,
  esquemaUbicacion,
  type DatosCentro,
  type EntradaActualizarCentro,
  type EntradaActualizarUbicacion,
  type EntradaCentro,
  type EntradaUbicacion,
} from "@/lib/esquemas/centros";
import { formatearNumero } from "@/lib/formato";
import { veTodaLaRed, type Actor } from "@/lib/permisos";
import { registrarAuditoria } from "../auditoria";
import { verificarInstitucion, verificarPermiso } from "../autorizacion";
import { db, enTransaccion, type Tx } from "../db";
import { ErrorDominio, noEncontrado } from "../errores";
import { validar } from "../validacion";
import { calcularCambios, comoJson, conUnicidad } from "./apoyo-admin";

export interface FilaCentroAdmin {
  id: string;
  institucionId: string;
  /** Nombre de la institución dueña del centro. */
  institucion: string;
  nombre: string;
  tipo: TipoCentro;
  rut: string | null;
  direccion: string;
  comuna: string;
  region: string;
  telefono: string | null;
  activo: boolean;
  ubicacionesActivas: number;
  usuariosAsignados: number;
  /** Unidades físicas en el centro. */
  existencias: number;
}

/** Suma de existencias por centro (o de un solo centro). */
async function existenciasPorCentro(cliente: Tx | typeof db, centroId?: string): Promise<Map<string, number>> {
  const filas = await cliente.$queryRaw<{ centroId: string; cantidad: bigint }[]>(Prisma.sql`
    SELECT u."centroId", COALESCE(SUM(e."cantidad"), 0) AS cantidad
    FROM "existencias" e
    JOIN "ubicaciones" u ON u."id" = e."ubicacionId"
    ${centroId ? Prisma.sql`WHERE u."centroId" = ${centroId}` : Prisma.empty}
    GROUP BY u."centroId"
  `);
  return new Map(filas.map((f) => [f.centroId, Number(f.cantidad)]));
}

/** Condición de alcance sobre `Centro`: toda la red (ADMIN_RED) o la institución del actor. */
function centrosDelAlcance(actor: Actor): Prisma.CentroWhereInput {
  if (veTodaLaRed(actor)) return {};
  // Sin institución (no debería ocurrir fuera de ADMIN_RED) no se ve nada.
  return { institucionId: actor.institucionId ?? "__sin_institucion__" };
}

/**
 * Centros que el actor administra, agrupables por institución (activos
 * primero): toda la red para ADMIN_RED; SOLO los de su institución para un
 * ADMIN. Permiso: `centros:gestionar`.
 */
export async function listarCentrosAdmin(
  actor: Actor,
  filtros: { institucionId?: string | null } = {},
): Promise<FilaCentroAdmin[]> {
  verificarPermiso(actor, "centros:gestionar");
  const centros = await db.centro.findMany({
    where: { ...centrosDelAlcance(actor), ...(filtros.institucionId ? { AND: { institucionId: filtros.institucionId } } : {}) },
    select: {
      id: true, institucionId: true, nombre: true, tipo: true, rut: true, direccion: true, comuna: true, region: true,
      telefono: true, activo: true, _count: { select: { usuarios: true } }, institucion: { select: { nombre: true } },
    },
    orderBy: [{ institucion: { nombre: "asc" } }, { activo: "desc" }, { nombre: "asc" }],
  });
  const ids = centros.map((c) => c.id);
  const [ubicaciones, existencias] = await Promise.all([
    db.ubicacion.groupBy({ by: ["centroId"], where: { activo: true, centroId: { in: ids } }, _count: { _all: true } }),
    existenciasPorCentro(db),
  ]);
  const ubicacionesPorCentro = new Map(ubicaciones.map((u) => [u.centroId, u._count._all]));
  return centros.map(({ _count, institucion, ...c }) => ({
    ...c,
    institucion: institucion.nombre,
    ubicacionesActivas: ubicacionesPorCentro.get(c.id) ?? 0,
    usuariosAsignados: _count.usuarios,
    existencias: existencias.get(c.id) ?? 0,
  }));
}

export interface UbicacionAdmin {
  id: string;
  nombre: string;
  tipo: TipoUbicacion;
  descripcion: string | null;
  activo: boolean;
  /** Unidades físicas guardadas en la ubicación. */
  existencias: number;
  /** Lotes distintos con stock. */
  lotesConStock: number;
}

export interface CentroAdmin extends Omit<FilaCentroAdmin, "ubicacionesActivas"> {
  ubicaciones: UbicacionAdmin[];
}

/**
 * Ficha de un centro con sus ubicaciones. Un centro de otra institución
 * responde `NO_ENCONTRADO`. Permiso: `centros:gestionar`.
 */
export async function obtenerCentroAdmin(actor: Actor, centroId: string): Promise<CentroAdmin> {
  verificarPermiso(actor, "centros:gestionar");
  const [centro, stock] = await Promise.all([
    db.centro.findFirst({
      where: { id: centroId, ...centrosDelAlcance(actor) },
      select: {
        institucionId: true, institucion: { select: { nombre: true } },
        id: true, nombre: true, tipo: true, rut: true, direccion: true, comuna: true, region: true,
        telefono: true, activo: true, _count: { select: { usuarios: true } },
        ubicaciones: {
          select: { id: true, nombre: true, tipo: true, descripcion: true, activo: true },
          orderBy: [{ activo: "desc" }, { nombre: "asc" }],
        },
      },
    }),
    db.$queryRaw<{ ubicacionId: string; cantidad: bigint; lotes: bigint }[]>(Prisma.sql`
      SELECT e."ubicacionId", COALESCE(SUM(e."cantidad"), 0) AS cantidad,
             COUNT(*) FILTER (WHERE e."cantidad" > 0) AS lotes
      FROM "existencias" e
      JOIN "ubicaciones" u ON u."id" = e."ubicacionId"
      WHERE u."centroId" = ${centroId}
      GROUP BY e."ubicacionId"
    `),
  ]);
  if (!centro) throw noEncontrado("El centro");
  const stockPorUbicacion = new Map(stock.map((s) => [s.ubicacionId, s]));
  const { _count, ubicaciones, institucion, ...datos } = centro;
  const conStock = ubicaciones.map((u) => ({
    ...u,
    existencias: Number(stockPorUbicacion.get(u.id)?.cantidad ?? 0),
    lotesConStock: Number(stockPorUbicacion.get(u.id)?.lotes ?? 0),
  }));
  return {
    ...datos,
    institucion: institucion.nombre,
    usuariosAsignados: _count.usuarios,
    existencias: conStock.reduce((s, u) => s + u.existencias, 0),
    ubicaciones: conStock,
  };
}

async function exigirNombreCentroLibre(tx: Tx, nombre: string, exceptoId?: string): Promise<void> {
  const existente = await tx.centro.findFirst({
    where: { nombre: { equals: nombre, mode: "insensitive" }, ...(exceptoId ? { id: { not: exceptoId } } : {}) },
    select: { id: true },
  });
  if (existente) throw new ErrorDominio("DUPLICADO", "Ya existe un centro con ese nombre.", { campo: "nombre" });
}

function camposCentro(datos: Omit<DatosCentro, "institucionId">) {
  return {
    nombre: datos.nombre,
    tipo: datos.tipo,
    rut: datos.rut ?? null,
    direccion: datos.direccion,
    region: datos.region,
    comuna: datos.comuna,
    telefono: datos.telefono ?? null,
  };
}

const MENSAJE_CENTRO_DUPLICADO = "Ya existe un centro con ese nombre.";

/**
 * Crea un centro con una primera ubicación "Bodega principal" para que se
 * pueda empezar a registrar stock de inmediato.
 *
 * Institución: el administrador de la red la elige (`institucionId`
 * obligatorio); un administrador de institución SOLO crea centros en la suya
 * (si envía otra se rechaza). La institución debe estar activa.
 * Permiso: `centros:gestionar`.
 */
export async function crearCentro(actor: Actor, entrada: EntradaCentro): Promise<{ id: string; nombre: string }> {
  verificarPermiso(actor, "centros:gestionar");
  const datos = validar(esquemaCentro, entrada);
  const institucionId = veTodaLaRed(actor) ? datos.institucionId : (datos.institucionId ?? actor.institucionId ?? undefined);
  if (!institucionId) {
    throw new ErrorDominio("VALIDACION", "Selecciona la institución del centro.", { campo: "institucionId" });
  }
  verificarInstitucion(actor, institucionId, "La institución");
  return conUnicidad(
    () =>
      enTransaccion(async (tx) => {
        const institucion = await tx.institucion.findUnique({
          where: { id: institucionId },
          select: { id: true, nombre: true, activo: true },
        });
        if (!institucion) throw new ErrorDominio("NO_ENCONTRADO", "La institución no existe.", { campo: "institucionId" });
        if (!institucion.activo) {
          throw new ErrorDominio("INACTIVO", `La institución "${institucion.nombre}" está desactivada.`, { campo: "institucionId" });
        }
        await exigirNombreCentroLibre(tx, datos.nombre);
        const centro = await tx.centro.create({
          data: {
            ...camposCentro(datos),
            institucionId: institucion.id,
            ubicaciones: { create: { nombre: "Bodega principal", tipo: "BODEGA" } },
          },
          select: { id: true, nombre: true },
        });
        await registrarAuditoria(tx, actor, {
          accion: "CENTRO_CREADO",
          entidad: "Centro",
          entidadId: centro.id,
          institucionId: institucion.id,
          detalle: {
            nombre: centro.nombre, tipo: datos.tipo, comuna: datos.comuna, region: datos.region,
            institucion: institucion.nombre,
          },
        });
        return centro;
      }),
    MENSAJE_CENTRO_DUPLICADO,
    "nombre",
  );
}

/**
 * Actualiza los datos de un centro (nunca su institución). Un centro de otra
 * institución responde `NO_ENCONTRADO`. Permiso: `centros:gestionar`.
 */
export async function actualizarCentro(actor: Actor, entrada: EntradaActualizarCentro): Promise<{ id: string; nombre: string }> {
  verificarPermiso(actor, "centros:gestionar");
  const { id, ...datos } = validar(esquemaActualizarCentro, entrada);
  return conUnicidad(
    () =>
      enTransaccion(async (tx) => {
        const actual = await tx.centro.findFirst({ where: { id, ...centrosDelAlcance(actor) } });
        if (!actual) throw noEncontrado("El centro");
        const nuevos = camposCentro(datos);
        const cambios = calcularCambios(
          {
            nombre: actual.nombre, tipo: actual.tipo, rut: actual.rut, direccion: actual.direccion,
            region: actual.region, comuna: actual.comuna, telefono: actual.telefono,
          },
          nuevos,
        );
        if (Object.keys(cambios).length === 0) return { id, nombre: actual.nombre };
        await exigirNombreCentroLibre(tx, datos.nombre, id);
        const centro = await tx.centro.update({ where: { id }, data: nuevos, select: { id: true, nombre: true } });
        await registrarAuditoria(tx, actor, {
          accion: "CENTRO_ACTUALIZADO",
          entidad: "Centro",
          entidadId: id,
          institucionId: actual.institucionId,
          detalle: comoJson({ nombre: centro.nombre, cambios }),
        });
        return centro;
      }),
    MENSAJE_CENTRO_DUPLICADO,
    "nombre",
  );
}

/**
 * Activa o desactiva un centro. No se puede desactivar mientras tenga
 * existencias (hay que trasladarlas o darlas de baja primero). Un centro
 * inactivo deja de aparecer en el selector de centros y no admite movimientos.
 * Permiso: `centros:gestionar`.
 */
export async function establecerCentroActivo(actor: Actor, centroId: string, activo: boolean): Promise<{ id: string; activo: boolean }> {
  verificarPermiso(actor, "centros:gestionar");
  return enTransaccion(async (tx) => {
    // FOR UPDATE sobre el centro ANTES de contar existencias: los movimientos
    // leen el centro con FOR SHARE, así que un ingreso simultáneo espera a que
    // esto termine (y ve el centro inactivo) o termina antes (y aquí se cuenta).
    const [centro] = await tx.$queryRaw<{ id: string; nombre: string; activo: boolean; institucionId: string }[]>(Prisma.sql`
      SELECT "id", "nombre", "activo", "institucionId" FROM "centros" WHERE "id" = ${centroId} FOR UPDATE
    `);
    if (!centro) throw noEncontrado("El centro");
    verificarInstitucion(actor, centro.institucionId, "El centro");
    if (centro.activo === activo) return { id: centroId, activo };
    if (!activo) {
      const existencias = (await existenciasPorCentro(tx, centroId)).get(centroId) ?? 0;
      if (existencias > 0) {
        throw new ErrorDominio(
          "EN_USO",
          `"${centro.nombre}" aún tiene ${formatearNumero(existencias)} unidades en stock. Trasládalas a otro centro o dalas de baja antes de desactivarlo.`,
          { detalle: { existencias } },
        );
      }
      const centrosActivos = await tx.centro.count({ where: { activo: true } });
      if (centrosActivos <= 1) {
        throw new ErrorDominio("OPERACION_INVALIDA", "La red debe tener al menos un centro activo.");
      }
    }
    if (activo) {
      const institucion = await tx.institucion.findUnique({ where: { id: centro.institucionId }, select: { nombre: true, activo: true } });
      if (!institucion?.activo) {
        throw new ErrorDominio("INACTIVO", `La institución "${institucion?.nombre ?? ""}" está desactivada: actívala antes de reactivar sus centros.`);
      }
    }
    await tx.centro.update({ where: { id: centroId }, data: { activo } });
    await registrarAuditoria(tx, actor, {
      accion: activo ? "CENTRO_ACTIVADO" : "CENTRO_DESACTIVADO",
      entidad: "Centro",
      entidadId: centroId,
      institucionId: centro.institucionId,
      detalle: { nombre: centro.nombre },
    });
    return { id: centroId, activo };
  });
}

// ---------------------------------------------------------------------------
// Ubicaciones
// ---------------------------------------------------------------------------

async function exigirNombreUbicacionLibre(tx: Tx, centroId: string, nombre: string, exceptoId?: string): Promise<void> {
  const existente = await tx.ubicacion.findFirst({
    where: {
      centroId,
      nombre: { equals: nombre, mode: "insensitive" },
      ...(exceptoId ? { id: { not: exceptoId } } : {}),
    },
    select: { id: true },
  });
  if (existente) {
    throw new ErrorDominio("DUPLICADO", "Este centro ya tiene una ubicación con ese nombre.", { campo: "nombre" });
  }
}

const MENSAJE_UBICACION_DUPLICADA = "Este centro ya tiene una ubicación con ese nombre.";

/** Crea una ubicación dentro de un centro. Permiso: `centros:gestionar`. */
export async function crearUbicacion(actor: Actor, entrada: EntradaUbicacion): Promise<{ id: string; nombre: string; centroId: string }> {
  verificarPermiso(actor, "centros:gestionar");
  const datos = validar(esquemaUbicacion, entrada);
  return conUnicidad(
    () =>
      enTransaccion(async (tx) => {
        const centro = await tx.centro.findFirst({
          where: { id: datos.centroId, ...centrosDelAlcance(actor) },
          select: { id: true, nombre: true, institucionId: true },
        });
        if (!centro) throw noEncontrado("El centro");
        await exigirNombreUbicacionLibre(tx, centro.id, datos.nombre);
        const ubicacion = await tx.ubicacion.create({
          data: { centroId: centro.id, nombre: datos.nombre, tipo: datos.tipo, descripcion: datos.descripcion ?? null },
          select: { id: true, nombre: true, centroId: true },
        });
        await registrarAuditoria(tx, actor, {
          accion: "UBICACION_CREADA",
          entidad: "Ubicacion",
          entidadId: ubicacion.id,
          institucionId: centro.institucionId,
          detalle: { nombre: ubicacion.nombre, tipo: datos.tipo, centro: centro.nombre },
        });
        return ubicacion;
      }),
    MENSAJE_UBICACION_DUPLICADA,
    "nombre",
  );
}

/** Edita nombre, tipo y descripción de una ubicación. Permiso: `centros:gestionar`. */
export async function actualizarUbicacion(
  actor: Actor,
  entrada: EntradaActualizarUbicacion,
): Promise<{ id: string; nombre: string; centroId: string }> {
  verificarPermiso(actor, "centros:gestionar");
  const { id, ...datos } = validar(esquemaActualizarUbicacion, entrada);
  return conUnicidad(
    () =>
      enTransaccion(async (tx) => {
        const actual = await tx.ubicacion.findFirst({
          where: { id, centro: centrosDelAlcance(actor) },
          include: { centro: { select: { nombre: true, institucionId: true } } },
        });
        if (!actual) throw noEncontrado("La ubicación");
        const nuevos = { nombre: datos.nombre, tipo: datos.tipo, descripcion: datos.descripcion ?? null };
        const cambios = calcularCambios(
          { nombre: actual.nombre, tipo: actual.tipo, descripcion: actual.descripcion },
          nuevos,
        );
        if (Object.keys(cambios).length === 0) return { id, nombre: actual.nombre, centroId: actual.centroId };
        await exigirNombreUbicacionLibre(tx, actual.centroId, datos.nombre, id);
        const ubicacion = await tx.ubicacion.update({
          where: { id },
          data: nuevos,
          select: { id: true, nombre: true, centroId: true },
        });
        await registrarAuditoria(tx, actor, {
          accion: "UBICACION_ACTUALIZADA",
          entidad: "Ubicacion",
          entidadId: id,
          institucionId: actual.centro.institucionId,
          detalle: comoJson({ nombre: ubicacion.nombre, centro: actual.centro.nombre, cambios }),
        });
        return ubicacion;
      }),
    MENSAJE_UBICACION_DUPLICADA,
    "nombre",
  );
}

/**
 * Activa o desactiva una ubicación. No se puede desactivar con existencias
 * mayores que cero: primero hay que trasladar o dar de baja ese stock.
 * Permiso: `centros:gestionar`.
 */
export async function establecerUbicacionActiva(
  actor: Actor,
  ubicacionId: string,
  activo: boolean,
): Promise<{ id: string; activo: boolean; centroId: string }> {
  verificarPermiso(actor, "centros:gestionar");
  return enTransaccion(async (tx) => {
    // FOR UPDATE sobre la ubicación ANTES de contar existencias (ver
    // `establecerCentroActivo`): serializa con los movimientos, que la leen
    // con FOR SHARE.
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ubicaciones" WHERE "id" = ${ubicacionId} FOR UPDATE`);
    const ubicacion = await tx.ubicacion.findFirst({
      where: { id: ubicacionId, centro: centrosDelAlcance(actor) },
      select: { id: true, nombre: true, activo: true, centroId: true, centro: { select: { nombre: true, institucionId: true } } },
    });
    if (!ubicacion) throw noEncontrado("La ubicación");
    if (ubicacion.activo === activo) return { id: ubicacionId, activo, centroId: ubicacion.centroId };
    if (!activo) {
      // Bloquea las existencias de la ubicación para que un movimiento
      // concurrente sobre ellas espere a que termine esta transacción.
      const filas = await tx.$queryRaw<{ cantidad: number }[]>(Prisma.sql`
        SELECT e."cantidad" FROM "existencias" e WHERE e."ubicacionId" = ${ubicacionId} FOR UPDATE
      `);
      const existencias = filas.reduce((s, f) => s + f.cantidad, 0);
      if (existencias > 0) {
        throw new ErrorDominio(
          "EN_USO",
          `"${ubicacion.nombre}" aún guarda ${formatearNumero(existencias)} unidades. Trasládalas a otra ubicación o dalas de baja antes de desactivarla.`,
          { detalle: { existencias } },
        );
      }
    }
    await tx.ubicacion.update({ where: { id: ubicacionId }, data: { activo } });
    await registrarAuditoria(tx, actor, {
      accion: activo ? "UBICACION_ACTIVADA" : "UBICACION_DESACTIVADA",
      entidad: "Ubicacion",
      entidadId: ubicacionId,
      institucionId: ubicacion.centro.institucionId,
      detalle: { nombre: ubicacion.nombre, centro: ubicacion.centro.nombre },
    });
    return { id: ubicacionId, activo, centroId: ubicacion.centroId };
  });
}
