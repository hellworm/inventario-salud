import "server-only";
import { Prisma } from "@prisma/client";
import { formatearRut, limpiarRut } from "@/lib/chile/rut";
import {
  esquemaActualizarProveedor,
  esquemaProveedor,
  type DatosProveedor,
  type EntradaActualizarProveedor,
  type EntradaProveedor,
} from "@/lib/esquemas/proveedores";
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

export interface FilaProveedor {
  id: string;
  /** Normalizado: `76123456-7`. Mostrar con `formatearRut`. */
  rut: string;
  razonSocial: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  activo: boolean;
  /** Ingresos registrados con este proveedor. */
  ingresos: number;
}

export interface FiltrosProveedores extends OpcionesPagina {
  texto?: string | null;
  estado?: FiltroEstado | null;
}

/**
 * Proveedores (activos e inactivos). Busca por razón social, contacto o RUT
 * (con o sin puntos). Permiso: `proveedores:gestionar`.
 */
export async function listarProveedoresAdmin(actor: Actor, filtros: FiltrosProveedores = {}): Promise<Paginado<FilaProveedor>> {
  verificarPermiso(actor, "proveedores:gestionar");
  const { pagina, porPagina, saltar } = normalizarPagina(filtros);
  const texto = filtros.texto?.trim();

  const condiciones: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (texto) {
    const patron = patronLike(texto);
    const rutLimpio = limpiarRut(texto);
    const porRut =
      rutLimpio.length >= 3
        ? Prisma.sql`OR REPLACE(p."rut", '-', '') ILIKE ${patronLike(rutLimpio)}`
        : Prisma.empty;
    condiciones.push(Prisma.sql`(
      unaccent(p."razonSocial") ILIKE unaccent(${patron})
      OR unaccent(COALESCE(p."contacto", '')) ILIKE unaccent(${patron})
      ${porRut}
    )`);
  }
  if (filtros.estado === "activos") condiciones.push(Prisma.sql`p."activo"`);
  if (filtros.estado === "inactivos") condiciones.push(Prisma.sql`NOT p."activo"`);
  const donde = Prisma.join(condiciones, " AND ");

  const [conteo, filas] = await Promise.all([
    db.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS total FROM "proveedores" p WHERE ${donde}`),
    db.$queryRaw<(Omit<FilaProveedor, "ingresos"> & { ingresos: bigint })[]>(Prisma.sql`
      SELECT p."id", p."rut", p."razonSocial", p."contacto", p."telefono", p."email", p."activo",
             (SELECT COUNT(*) FROM "movimientos" m WHERE m."proveedorId" = p."id") AS "ingresos"
      FROM "proveedores" p
      WHERE ${donde}
      ORDER BY p."activo" DESC, p."razonSocial" ASC, p."id" ASC
      LIMIT ${porPagina} OFFSET ${saltar}
    `),
  ]);
  return armarPaginado(
    filas.map((f) => ({ ...f, ingresos: Number(f.ingresos) })),
    Number(conteo[0]?.total ?? 0),
    pagina,
    porPagina,
  );
}

async function exigirRutLibre(tx: Tx, rut: string, exceptoId?: string): Promise<void> {
  const existente = await tx.proveedor.findUnique({ where: { rut }, select: { id: true, razonSocial: true } });
  if (existente && existente.id !== exceptoId) {
    throw new ErrorDominio("DUPLICADO", `El RUT ${formatearRut(rut)} ya está registrado para "${existente.razonSocial}".`, {
      campo: "rut",
    });
  }
}

function camposProveedor(datos: DatosProveedor) {
  return {
    rut: datos.rut,
    razonSocial: datos.razonSocial,
    contacto: datos.contacto ?? null,
    telefono: datos.telefono ?? null,
    email: datos.email ?? null,
  };
}

const MENSAJE_RUT_DUPLICADO = "Ya existe un proveedor con ese RUT.";

/** Crea un proveedor. Permiso: `proveedores:gestionar`. */
export async function crearProveedor(actor: Actor, entrada: EntradaProveedor): Promise<{ id: string; rut: string; razonSocial: string }> {
  verificarPermiso(actor, "proveedores:gestionar");
  const datos = validar(esquemaProveedor, entrada);
  return conUnicidad(
    () =>
      enTransaccion(async (tx) => {
        await exigirRutLibre(tx, datos.rut);
        const proveedor = await tx.proveedor.create({
          data: camposProveedor(datos),
          select: { id: true, rut: true, razonSocial: true },
        });
        await registrarAuditoria(tx, actor, {
          accion: "PROVEEDOR_CREADO",
          entidad: "Proveedor",
          entidadId: proveedor.id,
          detalle: { rut: proveedor.rut, razonSocial: proveedor.razonSocial },
        });
        return proveedor;
      }),
    MENSAJE_RUT_DUPLICADO,
    "rut",
  );
}

/** Actualiza un proveedor. Permiso: `proveedores:gestionar`. */
export async function actualizarProveedor(
  actor: Actor,
  entrada: EntradaActualizarProveedor,
): Promise<{ id: string; rut: string; razonSocial: string }> {
  verificarPermiso(actor, "proveedores:gestionar");
  const { id, ...datos } = validar(esquemaActualizarProveedor, entrada);
  return conUnicidad(
    () =>
      enTransaccion(async (tx) => {
        const actual = await tx.proveedor.findUnique({ where: { id } });
        if (!actual) throw noEncontrado("El proveedor");
        const nuevos = camposProveedor(datos);
        const cambios = calcularCambios(
          {
            rut: actual.rut, razonSocial: actual.razonSocial, contacto: actual.contacto,
            telefono: actual.telefono, email: actual.email,
          },
          nuevos,
        );
        if (Object.keys(cambios).length === 0) return { id, rut: actual.rut, razonSocial: actual.razonSocial };
        await exigirRutLibre(tx, datos.rut, id);
        const proveedor = await tx.proveedor.update({
          where: { id },
          data: nuevos,
          select: { id: true, rut: true, razonSocial: true },
        });
        await registrarAuditoria(tx, actor, {
          accion: "PROVEEDOR_ACTUALIZADO",
          entidad: "Proveedor",
          entidadId: id,
          detalle: comoJson({ rut: proveedor.rut, razonSocial: proveedor.razonSocial, cambios }),
        });
        return proveedor;
      }),
    MENSAJE_RUT_DUPLICADO,
    "rut",
  );
}

/**
 * Activa o desactiva un proveedor. Inactivo deja de ofrecerse al registrar
 * ingresos; su historial se conserva. Permiso: `proveedores:gestionar`.
 */
export async function establecerProveedorActivo(
  actor: Actor,
  proveedorId: string,
  activo: boolean,
): Promise<{ id: string; activo: boolean }> {
  verificarPermiso(actor, "proveedores:gestionar");
  return enTransaccion(async (tx) => {
    const proveedor = await tx.proveedor.findUnique({
      where: { id: proveedorId },
      select: { id: true, rut: true, razonSocial: true, activo: true },
    });
    if (!proveedor) throw noEncontrado("El proveedor");
    if (proveedor.activo !== activo) {
      await tx.proveedor.update({ where: { id: proveedorId }, data: { activo } });
      await registrarAuditoria(tx, actor, {
        accion: activo ? "PROVEEDOR_ACTIVADO" : "PROVEEDOR_DESACTIVADO",
        entidad: "Proveedor",
        entidadId: proveedorId,
        detalle: { rut: proveedor.rut, razonSocial: proveedor.razonSocial },
      });
    }
    return { id: proveedorId, activo };
  });
}
