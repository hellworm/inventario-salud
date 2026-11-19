import "server-only";
import { Prisma } from "@prisma/client";
import { formatearRut, limpiarRut } from "@/lib/chile/rut";
import {
  normalizarSitioWeb,
  esquemaActualizarProveedor,
  esquemaProveedor,
  type DatosProveedor,
  type EntradaActualizarProveedor,
  type EntradaProveedor,
} from "@/lib/esquemas/proveedores";
import { puede, type Actor } from "@/lib/permisos";
import type { Paginado } from "@/lib/resultado";
import { registrarAuditoria } from "../auditoria";
import { alcanceDeCentros, verificarPermiso } from "../autorizacion";
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
  textoDeBusqueda,
} from "./apoyo-admin";
import { contarInsumosPorProveedor } from "./inventario";

export interface FilaProveedor {
  id: string;
  /** Normalizado: `76123456-7`. Mostrar con `formatearRut`. */
  rut: string;
  razonSocial: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  /** Sitio web para comprar (`http(s)://…`), ya validado. */
  sitioWeb: string | null;
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
  const texto = textoDeBusqueda(filtros.texto);

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
      SELECT p."id", p."rut", p."razonSocial", p."contacto", p."telefono", p."email", p."sitioWeb", p."activo",
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
    sitioWeb: datos.sitioWeb ?? null,
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
            telefono: actual.telefono, email: actual.email, sitioWeb: actual.sitioWeb,
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

// ---------------------------------------------------------------------------
// Directorio de proveedores (panel y /proveedores): solo lectura
// ---------------------------------------------------------------------------

/** Proveedor activo con sus datos de contacto, para el directorio. */
export interface ProveedorDirectorio {
  id: string;
  /** Normalizado: `76123456-7`. Mostrar con `formatearRut`. */
  rut: string;
  razonSocial: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  /** Sitio web para comprar (`http(s)://…`); `null` si no tiene o si lo guardado no es un enlace http(s) válido. */
  sitioWeb: string | null;
  /** Último ingreso registrado con este proveedor en los centros del alcance. */
  ultimoIngreso: Date | null;
  /**
   * "Insumos que le compras": insumos del inventario del alcance cuyo proveedor
   * EFECTIVO es este (coincide con `/inventario?proveedor=<id>`).
   */
  insumos: number;
}

export interface DirectorioProveedores {
  items: ProveedorDirectorio[];
  /** Proveedores activos que coinciden (puede ser mayor que `items.length`). */
  total: number;
}

/**
 * Directorio de proveedores ACTIVOS con teléfono, correo, contacto y sitio web.
 * Orden `uso`: primero los usados más recientemente en ingresos de los centros
 * del alcance, luego el resto por nombre; `nombre`: alfabético.
 * Permiso: `proveedores:ver` (los cuatro roles; solo lectura) y acceso al centro si se indica.
 */
export async function listarDirectorioProveedores(
  actor: Actor,
  filtros: { centroId?: string | null; texto?: string | null; orden?: "uso" | "nombre"; limite?: number } = {},
): Promise<DirectorioProveedores> {
  verificarPermiso(actor, "proveedores:ver");
  const centros = alcanceDeCentros(actor, filtros.centroId);
  const limite = Math.min(Math.max(Math.trunc(filtros.limite ?? 6), 1), 500);
  const texto = textoDeBusqueda(filtros.texto);
  const filtroTexto = texto
    ? Prisma.sql`AND (unaccent(p."razonSocial") ILIKE unaccent(${patronLike(texto)}) OR unaccent(COALESCE(p."contacto", '')) ILIKE unaccent(${patronLike(texto)}))`
    : Prisma.empty;
  const filtroCentro =
    centros === null
      ? Prisma.empty
      : centros.length === 0
        ? Prisma.sql`AND FALSE`
        : Prisma.sql`AND m."centroId" IN (${Prisma.join(centros)})`;
  const orden =
    filtros.orden === "nombre"
      ? Prisma.sql`p."razonSocial" ASC, p."id" ASC`
      : Prisma.sql`u.ultimo DESC NULLS LAST, p."razonSocial" ASC, p."id" ASC`;
  // Los cuatro roles tienen `inventario:ver`; si alguno no lo tuviera, simplemente no hay conteo.
  const conteoInsumos = puede(actor.rol, "inventario:ver") ? contarInsumosPorProveedor(actor, { centroId: filtros.centroId }) : {};
  const filas = await db.$queryRaw<(Omit<ProveedorDirectorio, "ultimoIngreso" | "insumos"> & { ultimo: Date | null; total: number })[]>(Prisma.sql`
    SELECT p."id", p."rut", p."razonSocial", p."contacto", p."telefono", p."email", p."sitioWeb",
           u.ultimo, (COUNT(*) OVER ())::int AS total
    FROM "proveedores" p
    LEFT JOIN LATERAL (
      SELECT MAX(m."creadoEn") AS ultimo
      FROM "movimientos" m
      WHERE m."proveedorId" = p."id" AND m."tipo" = 'INGRESO' ${filtroCentro}
    ) u ON TRUE
    WHERE p."activo" ${filtroTexto}
    ORDER BY ${orden}
    LIMIT ${limite}
  `);
  const insumosPorProveedor: Record<string, number> = await conteoInsumos;
  return {
    total: filas[0]?.total ?? 0,
    items: filas.map(({ ultimo, total, ...p }) => {
      void total;
      // Nunca se entrega a la interfaz un enlace que no sea http(s) (defensa ante datos antiguos o importados).
      return {
        ...p,
        sitioWeb: p.sitioWeb ? normalizarSitioWeb(p.sitioWeb) : null,
        ultimoIngreso: ultimo,
        insumos: insumosPorProveedor[p.id] ?? 0,
      };
    }),
  };
}
