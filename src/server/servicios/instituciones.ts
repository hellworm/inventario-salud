import "server-only";
import { Prisma } from "@prisma/client";
import {
  esquemaActualizarInstitucion,
  esquemaInstitucion,
  type EntradaActualizarInstitucion,
  type EntradaInstitucion,
} from "@/lib/esquemas/instituciones";
import { formatearNumero, pluralizar } from "@/lib/formato";
import { esAdministrador, veTodaLaRed, type Actor } from "@/lib/permisos";
import { registrarAuditoria } from "../auditoria";
import { verificarPermiso } from "../autorizacion";
import { db, enTransaccion, type Tx } from "../db";
import { ErrorDominio, noEncontrado } from "../errores";
import { validar } from "../validacion";
import { calcularCambios, comoJson, conUnicidad } from "./apoyo-admin";
import type { ResumenCentro } from "./panel";
import {
  crearUsuarioEnTransaccion,
  prepararPasswordTemporal,
  type UsuarioConPasswordTemporal,
} from "./usuarios";

/**
 * Instituciones: el nivel superior de la red. Solo el administrador de la red
 * (`instituciones:gestionar`) las crea, edita y desactiva. Nunca se eliminan.
 * Los eventos de este servicio son de red (`institucionId = null` en la
 * auditoría): solo los ve el administrador de la red.
 */

export interface FilaInstitucion {
  id: string;
  nombre: string;
  rut: string | null;
  activo: boolean;
  centros: number;
  centrosActivos: number;
  usuarios: number;
  usuariosActivos: number;
  /** Administradores de institución activos. */
  administradores: number;
  /** Unidades físicas en sus centros. */
  existencias: number;
}

/** Unidades en stock por institución (opcionalmente solo en centros activos). */
async function existenciasPorInstitucion(
  cliente: Tx | typeof db,
  opciones: { institucionId?: string; soloCentrosActivos?: boolean } = {},
): Promise<Map<string, { unidades: number; centrosConStock: number }>> {
  const filas = await cliente.$queryRaw<{ institucionId: string; unidades: bigint; centros: bigint }[]>(Prisma.sql`
    SELECT c."institucionId", COALESCE(SUM(e."cantidad"), 0) AS unidades, COUNT(DISTINCT c."id") AS centros
    FROM "existencias" e
    JOIN "ubicaciones" u ON u."id" = e."ubicacionId"
    JOIN "centros" c ON c."id" = u."centroId"
    WHERE e."cantidad" > 0
      ${opciones.soloCentrosActivos ? Prisma.sql`AND c."activo"` : Prisma.empty}
      ${opciones.institucionId ? Prisma.sql`AND c."institucionId" = ${opciones.institucionId}` : Prisma.empty}
    GROUP BY c."institucionId"
  `);
  return new Map(filas.map((f) => [f.institucionId, { unidades: Number(f.unidades), centrosConStock: Number(f.centros) }]));
}

/** Todas las instituciones con sus conteos (activas primero). Permiso: `instituciones:gestionar`. */
export async function listarInstituciones(actor: Actor): Promise<FilaInstitucion[]> {
  verificarPermiso(actor, "instituciones:gestionar");
  const [instituciones, centros, usuarios, existencias] = await Promise.all([
    db.institucion.findMany({
      select: { id: true, nombre: true, rut: true, activo: true },
      orderBy: [{ activo: "desc" }, { nombre: "asc" }],
    }),
    db.centro.groupBy({ by: ["institucionId", "activo"], _count: { _all: true } }),
    db.usuario.groupBy({ by: ["institucionId", "activo", "rol"], _count: { _all: true } }),
    existenciasPorInstitucion(db),
  ]);
  return instituciones.map((i) => {
    const susCentros = centros.filter((c) => c.institucionId === i.id);
    const susUsuarios = usuarios.filter((u) => u.institucionId === i.id);
    const suma = (filas: { _count: { _all: number } }[]) => filas.reduce((s, f) => s + f._count._all, 0);
    return {
      ...i,
      centros: suma(susCentros),
      centrosActivos: suma(susCentros.filter((c) => c.activo)),
      usuarios: suma(susUsuarios),
      usuariosActivos: suma(susUsuarios.filter((u) => u.activo)),
      administradores: suma(susUsuarios.filter((u) => u.activo && u.rol === "ADMIN")),
      existencias: existencias.get(i.id)?.unidades ?? 0,
    };
  });
}

export interface OpcionInstitucion {
  id: string;
  nombre: string;
  activo: boolean;
}

/**
 * Instituciones que el actor puede elegir en un formulario o filtro: todas
 * para el administrador de la red; SOLO la propia para un administrador de
 * institución. Los demás roles no tienen acceso.
 */
export async function listarOpcionesInstitucion(actor: Actor): Promise<OpcionInstitucion[]> {
  if (!esAdministrador(actor.rol)) {
    throw new ErrorDominio("SIN_PERMISO", "No tienes permiso para realizar esta acción.");
  }
  return db.institucion.findMany({
    where: veTodaLaRed(actor) ? {} : { id: actor.institucionId ?? "__sin_institucion__" },
    select: { id: true, nombre: true, activo: true },
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
  });
}

const MENSAJE_NOMBRE_DUPLICADO = "Ya existe una institución con ese nombre.";

async function exigirNombreLibre(tx: Tx, nombre: string, exceptoId?: string): Promise<void> {
  const existente = await tx.institucion.findFirst({
    where: { nombre: { equals: nombre, mode: "insensitive" }, ...(exceptoId ? { id: { not: exceptoId } } : {}) },
    select: { id: true },
  });
  if (existente) throw new ErrorDominio("DUPLICADO", MENSAJE_NOMBRE_DUPLICADO, { campo: "nombre" });
}

export interface InstitucionCreada {
  id: string;
  nombre: string;
  /** Primer administrador, si se pidió: su contraseña temporal se entrega UNA sola vez. */
  administrador: UsuarioConPasswordTemporal | null;
}

/**
 * Crea una institución y, opcionalmente, su primer administrador (rol ADMIN,
 * contraseña temporal de 72 horas). Todo ocurre en una transacción: si el
 * correo del administrador ya existe, no se crea nada.
 * Permiso: `instituciones:gestionar` (y `usuarios:gestionar` para el administrador).
 */
export async function crearInstitucion(actor: Actor, entrada: EntradaInstitucion): Promise<InstitucionCreada> {
  verificarPermiso(actor, "instituciones:gestionar");
  const datos = validar(esquemaInstitucion, entrada);
  const temporal = datos.administrador ? await prepararPasswordTemporal() : null;
  return conUnicidad(
    () =>
      enTransaccion(async (tx) => {
        await exigirNombreLibre(tx, datos.nombre);
        const institucion = await tx.institucion.create({
          data: { nombre: datos.nombre, rut: datos.rut ?? null },
          select: { id: true, nombre: true },
        });
        await registrarAuditoria(tx, actor, {
          accion: "INSTITUCION_CREADA",
          entidad: "Institucion",
          entidadId: institucion.id,
          institucionId: null,
          detalle: { nombre: institucion.nombre, rut: datos.rut ?? null },
        });
        let administrador: UsuarioConPasswordTemporal | null = null;
        if (datos.administrador && temporal) {
          try {
            const usuario = await crearUsuarioEnTransaccion(
              tx,
              actor,
              { ...datos.administrador, rol: "ADMIN", institucionId: institucion.id, centroIds: [] },
              temporal,
            );
            administrador = {
              ...usuario,
              passwordTemporal: temporal.passwordTemporal,
              passwordTemporalExpira: temporal.passwordTemporalExpira,
            };
          } catch (error) {
            // Los errores del administrador se muestran bajo sus campos del formulario.
            if (error instanceof ErrorDominio && error.campo && !error.campo.startsWith("administrador.")) {
              throw new ErrorDominio(error.codigo, error.message, { campo: `administrador.${error.campo}` });
            }
            throw error;
          }
        }
        return { ...institucion, administrador };
      }),
    "Ya existe una institución con ese nombre o un usuario con ese correo electrónico.",
    "nombre",
  );
}

/** Actualiza nombre y RUT de una institución. Permiso: `instituciones:gestionar`. */
export async function actualizarInstitucion(
  actor: Actor,
  entrada: EntradaActualizarInstitucion,
): Promise<{ id: string; nombre: string }> {
  verificarPermiso(actor, "instituciones:gestionar");
  const { id, ...datos } = validar(esquemaActualizarInstitucion, entrada);
  return conUnicidad(
    () =>
      enTransaccion(async (tx) => {
        const actual = await tx.institucion.findUnique({ where: { id } });
        if (!actual) throw noEncontrado("La institución");
        const nuevos = { nombre: datos.nombre, rut: datos.rut ?? null };
        const cambios = calcularCambios({ nombre: actual.nombre, rut: actual.rut }, nuevos);
        if (Object.keys(cambios).length === 0) return { id, nombre: actual.nombre };
        await exigirNombreLibre(tx, datos.nombre, id);
        const institucion = await tx.institucion.update({ where: { id }, data: nuevos, select: { id: true, nombre: true } });
        await registrarAuditoria(tx, actor, {
          accion: "INSTITUCION_ACTUALIZADA",
          entidad: "Institucion",
          entidadId: id,
          institucionId: null,
          detalle: comoJson({ nombre: institucion.nombre, cambios }),
        });
        return institucion;
      }),
    MENSAJE_NOMBRE_DUPLICADO,
    "nombre",
  );
}

/**
 * Activa o desactiva una institución. Desactivada, sus usuarios no pueden
 * ingresar (sus sesiones se cierran en la misma transacción) y no se le
 * pueden crear centros ni usuarios; sus datos e historial se conservan.
 *
 * No se puede desactivar mientras tenga centros ACTIVOS con stock: primero
 * hay que dar de baja o retirar ese stock, o desactivar esos centros.
 * Permiso: `instituciones:gestionar`.
 */
export async function establecerInstitucionActiva(
  actor: Actor,
  institucionId: string,
  activo: boolean,
): Promise<{ id: string; activo: boolean; sesionesCerradas: number }> {
  verificarPermiso(actor, "instituciones:gestionar");
  return enTransaccion(async (tx) => {
    const [institucion] = await tx.$queryRaw<{ id: string; nombre: string; activo: boolean }[]>(Prisma.sql`
      SELECT "id", "nombre", "activo" FROM "instituciones" WHERE "id" = ${institucionId} FOR UPDATE
    `);
    if (!institucion) throw noEncontrado("La institución");
    if (institucion.activo === activo) return { id: institucionId, activo, sesionesCerradas: 0 };

    let sesionesCerradas = 0;
    if (!activo) {
      // Bloquea sus centros (los movimientos los leen con FOR SHARE) antes de contar el stock.
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "centros" WHERE "institucionId" = ${institucionId} ORDER BY "id" FOR UPDATE`);
      const stock = (await existenciasPorInstitucion(tx, { institucionId, soloCentrosActivos: true })).get(institucionId);
      if (stock && stock.unidades > 0) {
        throw new ErrorDominio(
          "EN_USO",
          `"${institucion.nombre}" tiene ${pluralizar(stock.centrosConStock, "centro activo", "centros activos")} con stock (${formatearNumero(stock.unidades)} unidades). Da de baja o retira ese stock, o desactiva esos centros, antes de desactivar la institución.`,
          { detalle: { existencias: stock.unidades, centrosConStock: stock.centrosConStock } },
        );
      }
      sesionesCerradas = (await tx.sesion.deleteMany({ where: { usuario: { institucionId } } })).count;
    }
    await tx.institucion.update({ where: { id: institucionId }, data: { activo } });
    await registrarAuditoria(tx, actor, {
      accion: activo ? "INSTITUCION_ACTIVADA" : "INSTITUCION_DESACTIVADA",
      entidad: "Institucion",
      entidadId: institucionId,
      institucionId: null,
      detalle: { nombre: institucion.nombre, ...(activo ? {} : { sesionesCerradas }) },
    });
    return { id: institucionId, activo, sesionesCerradas };
  });
}

// ---------------------------------------------------------------------------
// Resumen de la red por institución (panel del administrador de la red)
// ---------------------------------------------------------------------------

export interface ResumenCentroInstitucion extends ResumenCentro {
  comuna: string;
}

export interface ResumenInstitucion {
  institucionId: string;
  institucion: string;
  /** Centros activos. */
  centros: number;
  sinStock: number;
  bajoMinimo: number;
  vencidos: number;
  porVencer: number;
  /** Desglose por centro activo (también los que no tienen alertas). */
  detalle: ResumenCentroInstitucion[];
}

/**
 * "El complejo total": una fila por institución activa con sus centros y sus
 * alertas (sin stock, bajo mínimo, lotes vencidos y por vencer), más el
 * desglose por centro. Recibe el desglose de alertas por centro que ya calculó
 * `resumenPanel` para toda la red (`ResumenPanel.porCentro`), así no se
 * recalculan las alertas. Solo para quien ve toda la red (ADMIN_RED).
 */
export async function resumenPorInstitucion(
  actor: Actor,
  alertasPorCentro: readonly ResumenCentro[],
): Promise<ResumenInstitucion[]> {
  verificarPermiso(actor, "panel:ver");
  if (!veTodaLaRed(actor)) {
    throw new ErrorDominio("SIN_PERMISO", "No tienes permiso para realizar esta acción.");
  }
  const instituciones = await db.institucion.findMany({
    where: { activo: true },
    select: {
      id: true,
      nombre: true,
      centros: { where: { activo: true }, select: { id: true, nombre: true, comuna: true }, orderBy: { nombre: "asc" } },
    },
    orderBy: { nombre: "asc" },
  });
  const alertas = new Map(alertasPorCentro.map((a) => [a.centroId, a]));
  return instituciones.map((i) => {
    const detalle = i.centros.map((c) => {
      const a = alertas.get(c.id);
      return {
        centroId: c.id,
        centro: c.nombre,
        comuna: c.comuna,
        sinStock: a?.sinStock ?? 0,
        bajoMinimo: a?.bajoMinimo ?? 0,
        vencidos: a?.vencidos ?? 0,
        porVencer: a?.porVencer ?? 0,
      };
    });
    const total = (clave: "sinStock" | "bajoMinimo" | "vencidos" | "porVencer") => detalle.reduce((s, d) => s + d[clave], 0);
    return {
      institucionId: i.id,
      institucion: i.nombre,
      centros: detalle.length,
      sinStock: total("sinStock"),
      bajoMinimo: total("bajoMinimo"),
      vencidos: total("vencidos"),
      porVencer: total("porVencer"),
      detalle,
    };
  });
}
