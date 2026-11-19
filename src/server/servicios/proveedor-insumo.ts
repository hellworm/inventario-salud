import "server-only";
import { Prisma } from "@prisma/client";
import {
  esquemaProveedorInstitucion,
  esquemaProveedorRed,
  type EntradaProveedorInstitucion,
  type EntradaProveedorRed,
} from "@/lib/esquemas/proveedor-insumo";
import { normalizarSitioWeb } from "@/lib/esquemas/proveedores";
import { puede, veTodaLaRed, type Actor } from "@/lib/permisos";
import { registrarAuditoria } from "../auditoria";
import { alcanceDeCentros, verificarInstitucion, verificarPermiso } from "../autorizacion";
import { db, enTransaccion, type Tx } from "../db";
import { ErrorDominio, noEncontrado } from "../errores";
import { validar } from "../validacion";
import { comoJson } from "./apoyo-admin";

/**
 * Proveedor de un insumo, en dos niveles (el catálogo es compartido por toda la red):
 *
 *  - RED: `Insumo.proveedorId`, el proveedor predeterminado para todas las
 *    instituciones. Lo define quien puede modificar el catálogo
 *    (`catalogo:gestionar`) o quien crea el insumo (`catalogo:crear`).
 *  - INSTITUCIÓN: `ProveedorInsumoInstitucion`, la preferencia de UNA institución,
 *    que sobrescribe la de la red solo para ella (`proveedores-insumo:gestionar`).
 *
 * PROVEEDOR EFECTIVO de un insumo en un contexto = el de la institución del
 * contexto si existe → si no, el predeterminado de la red → si no, ninguno. El
 * contexto es la institución del centro (o la del usuario); el administrador de
 * la red en "Toda la red" no tiene institución de contexto y ve el de la red.
 *
 * Este módulo es el ÚNICO lugar que resuelve esa regla: en SQL para los
 * listados (`sqlProveedorEfectivo`, sin consultas por fila) y por insumo para la
 * ficha y el formulario de ingreso.
 */

export type OrigenProveedor = "INSTITUCION" | "RED";

/** Datos de un proveedor tal como se muestran junto a un insumo. */
export interface ProveedorDeInsumo {
  id: string;
  /** Normalizado: `76123456-7`. Mostrar con `formatearRut`. */
  rut: string;
  razonSocial: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  /** Sitio web para comprar (`http(s)://…`), ya validado; `null` si no tiene. */
  sitioWeb: string | null;
  /** `false`: el proveedor fue desactivado; se muestra marcado y conviene cambiarlo. */
  activo: boolean;
}

/** Proveedor efectivo de un insumo en un contexto, con su origen. */
export interface ProveedorEfectivo extends ProveedorDeInsumo {
  /** `INSTITUCION`: preferencia de la institución del contexto; `RED`: predeterminado de la red. */
  origen: OrigenProveedor;
}

// ---------------------------------------------------------------------------
// Resolución en SQL (listados)
// ---------------------------------------------------------------------------

/** Columnas que agrega `sqlProveedorEfectivo` a una consulta. */
export interface ColumnasProveedorSql {
  provId: string | null;
  provRut: string | null;
  provRazonSocial: string | null;
  provContacto: string | null;
  provTelefono: string | null;
  provEmail: string | null;
  provSitioWeb: string | null;
  provActivo: boolean | null;
  provDeInstitucion: boolean | null;
}

/**
 * Fragmentos SQL que resuelven el proveedor efectivo de cada insumo de una
 * consulta, sin consultas por fila:
 *
 * ```ts
 * const prov = sqlProveedorEfectivo({ insumoId: Prisma.sql`i."id"`, predeterminado: Prisma.sql`i."proveedorId"`, institucionId });
 * Prisma.sql`SELECT i."id" ${prov.columnas} FROM "insumos" i ${prov.uniones} WHERE ${prov.id} = ${proveedorId}`
 * ```
 *
 * `institucionId` es la institución del contexto: un valor (o `null` = solo el
 * predeterminado de la red) o una expresión SQL (p. ej. `ce."institucionId"`,
 * la institución del centro de cada fila).
 */
export function sqlProveedorEfectivo(o: {
  insumoId: Prisma.Sql;
  predeterminado: Prisma.Sql;
  institucionId: Prisma.Sql | string | null;
}): { uniones: Prisma.Sql; columnas: Prisma.Sql; id: Prisma.Sql } {
  // Un texto viaja como parámetro; una expresión SQL (columna) se inserta tal cual.
  const institucion = o.institucionId === null ? Prisma.sql`FALSE` : Prisma.sql`pvi."institucionId" = ${o.institucionId}`;
  return {
    uniones: Prisma.sql`
      LEFT JOIN "proveedores_insumo_institucion" pvi ON pvi."insumoId" = ${o.insumoId} AND ${institucion}
      LEFT JOIN "proveedores" pve ON pve."id" = COALESCE(pvi."proveedorId", ${o.predeterminado})`,
    columnas: Prisma.sql`,
      pve."id" AS "provId", pve."rut" AS "provRut", pve."razonSocial" AS "provRazonSocial",
      pve."contacto" AS "provContacto", pve."telefono" AS "provTelefono", pve."email" AS "provEmail",
      pve."sitioWeb" AS "provSitioWeb", pve."activo" AS "provActivo", (pvi."id" IS NOT NULL) AS "provDeInstitucion"`,
    id: Prisma.sql`pve."id"`,
  };
}

/** Convierte las columnas de `sqlProveedorEfectivo` en el proveedor efectivo (o `null`). */
export function proveedorDeFila(f: ColumnasProveedorSql): ProveedorEfectivo | null {
  if (!f.provId || !f.provRut || f.provRazonSocial === null) return null;
  return {
    id: f.provId,
    rut: f.provRut,
    razonSocial: f.provRazonSocial,
    contacto: f.provContacto,
    telefono: f.provTelefono,
    email: f.provEmail,
    // Nunca se entrega a la interfaz un enlace que no sea http(s).
    sitioWeb: f.provSitioWeb ? normalizarSitioWeb(f.provSitioWeb) : null,
    activo: f.provActivo !== false,
    origen: f.provDeInstitucion ? "INSTITUCION" : "RED",
  };
}

/**
 * Institución del contexto de una consulta: la del usuario (BODEGUERO,
 * VISITANTE, ADMIN) o, para el administrador de la red, la del centro elegido
 * (`null` en "Toda la red"). Nunca viene de la entrada del usuario: quien no es
 * administrador de la red solo puede resolver con SU institución.
 * Llamar después de validar el acceso al centro (`alcanceDeCentros`).
 */
export async function institucionDeContexto(actor: Actor, centroId?: string | null): Promise<string | null> {
  if (!veTodaLaRed(actor)) return actor.institucionId;
  if (!centroId) return null;
  const centro = await db.centro.findUnique({ where: { id: centroId }, select: { institucionId: true } });
  return centro?.institucionId ?? null;
}

// ---------------------------------------------------------------------------
// Lectura por insumo (ficha, panel lateral, formulario de ingreso)
// ---------------------------------------------------------------------------

const SELECCION_PROVEEDOR = {
  id: true,
  rut: true,
  razonSocial: true,
  contacto: true,
  telefono: true,
  email: true,
  sitioWeb: true,
  activo: true,
} as const;

function aProveedor(p: ProveedorDeInsumo): ProveedorDeInsumo {
  return { ...p, sitioWeb: p.sitioWeb ? normalizarSitioWeb(p.sitioWeb) : null };
}

/**
 * Proveedor efectivo de un insumo para el contexto del actor (la institución de
 * `centroId` o la suya). `null` si no hay ninguno definido o el insumo no existe.
 * Permiso: `proveedores:ver` (y acceso al centro si se indica).
 */
export async function proveedorEfectivoDeInsumo(
  actor: Actor,
  insumoId: string,
  filtros: { centroId?: string | null } = {},
): Promise<ProveedorEfectivo | null> {
  verificarPermiso(actor, "proveedores:ver");
  alcanceDeCentros(actor, filtros.centroId);
  const institucionId = await institucionDeContexto(actor, filtros.centroId);
  const prov = sqlProveedorEfectivo({
    insumoId: Prisma.sql`i."id"`,
    predeterminado: Prisma.sql`i."proveedorId"`,
    institucionId,
  });
  const filas = await db.$queryRaw<ColumnasProveedorSql[]>(Prisma.sql`
    SELECT i."id" ${prov.columnas}
    FROM "insumos" i ${prov.uniones}
    WHERE i."id" = ${insumoId}
  `);
  return filas[0] ? proveedorDeFila(filas[0]) : null;
}

export interface DetalleProveedorInsumo {
  insumoId: string;
  /** El que vale en el contexto: institución → red → ninguno. */
  efectivo: ProveedorEfectivo | null;
  /** Proveedor predeterminado de la red (`null` = sin definir). */
  red: ProveedorDeInsumo | null;
  /**
   * Institución del contexto y su preferencia (`proveedor: null` = usa el de la
   * red). `null` para el administrador de la red en "Toda la red".
   */
  institucion: { id: string; nombre: string; proveedor: ProveedorDeInsumo | null } | null;
  /**
   * SOLO para el administrador de la red: todas las instituciones con un
   * proveedor propio para este insumo (el desglose). Vacío para los demás:
   * nadie ve la preferencia de otra institución.
   */
  porInstitucion: { institucionId: string; institucion: string; proveedor: ProveedorDeInsumo }[];
  /**
   * Solo cuando no hay proveedor efectivo: el del último INGRESO del insumo
   * dentro del alcance del actor. Es informativo; no es el proveedor definido.
   */
  ultimoIngreso: { proveedor: ProveedorDeInsumo; fecha: Date } | null;
  /** Lo que el actor puede cambiar (el servicio lo vuelve a exigir). */
  permisos: { cambiarRed: boolean; cambiarInstitucion: boolean };
}

/**
 * Proveedor de un insumo con todo lo que muestran la ficha y el panel lateral:
 * el efectivo, el de la red, el de la institución del contexto, el desglose por
 * institución (solo ADMIN_RED) y, si no hay ninguno, el del último ingreso.
 * Permiso: `proveedores:ver` (y acceso al centro si se indica).
 * Lanza NO_ENCONTRADO si el insumo no existe.
 */
export async function detalleProveedorInsumo(
  actor: Actor,
  insumoId: string,
  filtros: { centroId?: string | null } = {},
): Promise<DetalleProveedorInsumo> {
  verificarPermiso(actor, "proveedores:ver");
  const centros = alcanceDeCentros(actor, filtros.centroId);
  const institucionId = await institucionDeContexto(actor, filtros.centroId);
  const esRed = veTodaLaRed(actor);

  const [insumo, institucion, preferencias] = await Promise.all([
    db.insumo.findUnique({ where: { id: insumoId }, select: { id: true, proveedor: { select: SELECCION_PROVEEDOR } } }),
    institucionId ? db.institucion.findUnique({ where: { id: institucionId }, select: { id: true, nombre: true } }) : null,
    // Aislamiento: quien no es administrador de la red solo lee la fila de SU institución.
    db.proveedorInsumoInstitucion.findMany({
      where: { insumoId, ...(esRed ? {} : { institucionId: institucionId ?? "__ninguna__" }) },
      select: {
        institucionId: true,
        institucion: { select: { nombre: true } },
        proveedor: { select: SELECCION_PROVEEDOR },
      },
      orderBy: { institucion: { nombre: "asc" } },
    }),
  ]);
  if (!insumo) throw noEncontrado("El insumo");

  const red = insumo.proveedor ? aProveedor(insumo.proveedor) : null;
  const propia = institucionId ? (preferencias.find((p) => p.institucionId === institucionId) ?? null) : null;
  const deInstitucion = propia ? aProveedor(propia.proveedor) : null;
  const efectivo: ProveedorEfectivo | null = deInstitucion
    ? { ...deInstitucion, origen: "INSTITUCION" }
    : red
      ? { ...red, origen: "RED" }
      : null;

  let ultimoIngreso: DetalleProveedorInsumo["ultimoIngreso"] = null;
  if (!efectivo && !(centros !== null && centros.length === 0)) {
    const ultimo = await db.movimiento.findFirst({
      where: {
        insumoId,
        tipo: "INGRESO",
        proveedorId: { not: null },
        ...(centros === null ? {} : { centroId: { in: centros } }),
      },
      orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
      select: { creadoEn: true, proveedor: { select: SELECCION_PROVEEDOR } },
    });
    if (ultimo?.proveedor) ultimoIngreso = { proveedor: aProveedor(ultimo.proveedor), fecha: ultimo.creadoEn };
  }

  return {
    insumoId,
    efectivo,
    red,
    institucion: institucion ? { id: institucion.id, nombre: institucion.nombre, proveedor: deInstitucion } : null,
    porInstitucion: esRed
      ? preferencias.map((p) => ({
          institucionId: p.institucionId,
          institucion: p.institucion.nombre,
          proveedor: aProveedor(p.proveedor),
        }))
      : [],
    ultimoIngreso,
    permisos: {
      cambiarRed: puede(actor.rol, "catalogo:gestionar"),
      cambiarInstitucion: puede(actor.rol, "proveedores-insumo:gestionar"),
    },
  };
}

// ---------------------------------------------------------------------------
// Mutaciones
// ---------------------------------------------------------------------------

/** Bloquea la fila del insumo: dos cambios simultáneos de su proveedor se serializan. */
async function bloquearInsumo(tx: Tx, insumoId: string): Promise<{ id: string; codigo: string; nombre: string; proveedorId: string | null }> {
  const filas = await tx.$queryRaw<{ id: string; codigo: string; nombre: string; proveedorId: string | null }[]>(
    Prisma.sql`SELECT "id", "codigo", "nombre", "proveedorId" FROM "insumos" WHERE "id" = ${insumoId} FOR UPDATE`,
  );
  if (!filas[0]) throw noEncontrado("El insumo");
  return filas[0];
}

/**
 * El proveedor que se quiere asignar debe existir y estar ACTIVO (uno inactivo
 * no se ofrece para elegir). Devuelve su razón social.
 */
export async function exigirProveedorAsignable(tx: Tx, proveedorId: string): Promise<string> {
  const proveedor = await tx.proveedor.findUnique({ where: { id: proveedorId }, select: { razonSocial: true, activo: true } });
  if (!proveedor) {
    throw new ErrorDominio("NO_ENCONTRADO", "El proveedor seleccionado ya no existe.", { campo: "proveedorId" });
  }
  if (!proveedor.activo) {
    throw new ErrorDominio("INACTIVO", `"${proveedor.razonSocial}" está inactivo: elige un proveedor activo.`, { campo: "proveedorId" });
  }
  return proveedor.razonSocial;
}

async function nombreProveedor(tx: Tx, proveedorId: string | null): Promise<string | null> {
  if (!proveedorId) return null;
  return (await tx.proveedor.findUnique({ where: { id: proveedorId }, select: { razonSocial: true } }))?.razonSocial ?? null;
}

export interface ResultadoCambioProveedor {
  insumoId: string;
  /** Proveedor que quedó definido en ese nivel (`null` = ninguno). */
  proveedorId: string | null;
  proveedor: string | null;
  /** `false` si ya estaba así (no se escribió nada ni se auditó). */
  cambiado: boolean;
}

/**
 * Define, cambia o quita (`proveedorId` vacío) el proveedor predeterminado de la
 * RED de un insumo. No toca las preferencias de las instituciones.
 * Permiso: `catalogo:gestionar` (solo ADMIN_RED: el catálogo es compartido).
 * Audita `INSUMO_PROVEEDOR_RED_ACTUALIZADO` como evento de red.
 */
export async function definirProveedorRed(actor: Actor, entrada: EntradaProveedorRed): Promise<ResultadoCambioProveedor> {
  verificarPermiso(actor, "catalogo:gestionar");
  const datos = validar(esquemaProveedorRed, entrada);
  return enTransaccion(async (tx) => {
    const insumo = await bloquearInsumo(tx, datos.insumoId);
    if (insumo.proveedorId === datos.proveedorId) {
      return { insumoId: insumo.id, proveedorId: insumo.proveedorId, proveedor: await nombreProveedor(tx, insumo.proveedorId), cambiado: false };
    }
    const despues = datos.proveedorId ? await exigirProveedorAsignable(tx, datos.proveedorId) : null;
    const antes = await nombreProveedor(tx, insumo.proveedorId);
    await tx.insumo.update({ where: { id: insumo.id }, data: { proveedorId: datos.proveedorId } });
    await registrarAuditoria(tx, actor, {
      accion: "INSUMO_PROVEEDOR_RED_ACTUALIZADO",
      entidad: "Insumo",
      entidadId: insumo.id,
      // El predeterminado de la red es parte del catálogo compartido: evento de red.
      institucionId: null,
      detalle: comoJson({ codigo: insumo.codigo, nombre: insumo.nombre, cambios: { proveedor: { antes, despues } } }),
    });
    return { insumoId: insumo.id, proveedorId: datos.proveedorId, proveedor: despues, cambiado: true };
  });
}

/**
 * Define, cambia o quita (`proveedorId` vacío = volver al predeterminado de la
 * red) el proveedor preferido de UNA institución para un insumo.
 *
 * Permiso: `proveedores-insumo:gestionar`. Un administrador de institución solo
 * puede hacerlo para la SUYA (si indica otra: `NO_ENCONTRADO`, como todo lo que
 * es de otra institución); el administrador de la red debe indicar cuál.
 * Audita `INSUMO_PROVEEDOR_INSTITUCION_ACTUALIZADO` con la institución afectada.
 */
export async function definirProveedorInstitucion(
  actor: Actor,
  entrada: EntradaProveedorInstitucion,
): Promise<ResultadoCambioProveedor & { institucionId: string }> {
  verificarPermiso(actor, "proveedores-insumo:gestionar");
  const datos = validar(esquemaProveedorInstitucion, entrada);
  const institucionId = veTodaLaRed(actor) ? (datos.institucionId ?? null) : (datos.institucionId ?? actor.institucionId);
  if (!institucionId) {
    throw new ErrorDominio("VALIDACION", "Indica para qué institución es el proveedor.", { campo: "institucionId" });
  }
  verificarInstitucion(actor, institucionId, "La institución");

  return enTransaccion(async (tx) => {
    const insumo = await bloquearInsumo(tx, datos.insumoId);
    const institucion = await tx.institucion.findUnique({ where: { id: institucionId }, select: { id: true, nombre: true } });
    if (!institucion) throw noEncontrado("La institución");
    const actual = await tx.proveedorInsumoInstitucion.findUnique({
      where: { insumoId_institucionId: { insumoId: insumo.id, institucionId } },
      select: { id: true, proveedorId: true },
    });
    const anteriorId = actual?.proveedorId ?? null;
    if (anteriorId === datos.proveedorId) {
      return { insumoId: insumo.id, institucionId, proveedorId: anteriorId, proveedor: await nombreProveedor(tx, anteriorId), cambiado: false };
    }
    const despues = datos.proveedorId ? await exigirProveedorAsignable(tx, datos.proveedorId) : null;
    const antes = await nombreProveedor(tx, anteriorId);
    if (datos.proveedorId === null) {
      await tx.proveedorInsumoInstitucion.delete({ where: { id: actual!.id } });
    } else if (actual) {
      await tx.proveedorInsumoInstitucion.update({ where: { id: actual.id }, data: { proveedorId: datos.proveedorId } });
    } else {
      await tx.proveedorInsumoInstitucion.create({ data: { insumoId: insumo.id, institucionId, proveedorId: datos.proveedorId } });
    }
    await registrarAuditoria(tx, actor, {
      accion: "INSUMO_PROVEEDOR_INSTITUCION_ACTUALIZADO",
      entidad: "Insumo",
      entidadId: insumo.id,
      // Pertenece a la institución afectada, lo haga su administrador o el de la red.
      institucionId,
      detalle: comoJson({
        codigo: insumo.codigo,
        nombre: insumo.nombre,
        institucion: institucion.nombre,
        cambios: { proveedor: { antes: antes ?? "Predeterminado de la red", despues: despues ?? "Predeterminado de la red" } },
        predeterminadoRed: await nombreProveedor(tx, insumo.proveedorId),
      }),
    });
    return { insumoId: insumo.id, institucionId, proveedorId: datos.proveedorId, proveedor: despues, cambiado: true };
  });
}
