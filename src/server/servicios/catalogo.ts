import "server-only";
import { Prisma, type TipoUbicacion } from "@prisma/client";
import { calcularEstadoVencimiento, diasParaVencer, type EstadoVencimiento } from "@/lib/estados";
import { dateADia, hoyEnSantiago, type DiaISO } from "@/lib/fechas";
import type { Actor } from "@/lib/permisos";
import { alcanceDeCentros, verificarPermiso } from "../autorizacion";
import { db } from "../db";
import { noEncontrado } from "../errores";
import { patronLike, textoDeBusqueda } from "./apoyo-admin";

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
  /**
   * Solo con `priorizarRetirosDeCentroId`: `true` si el insumo tuvo retiros en
   * ese centro en los últimos `DIAS_PRIORIDAD_RETIROS` días (van primero).
   */
  masUsado?: boolean;
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

/** Días hacia atrás que se miran para priorizar los insumos más retirados. */
export const DIAS_PRIORIDAD_RETIROS = 30;

export interface FiltrosBuscarInsumos {
  /** Nombre, código o código de barras. No distingue tildes ni mayúsculas. */
  texto?: string | null;
  categoriaId?: string | null;
  /** Por defecto `true`. */
  soloActivos?: boolean;
  /** Por defecto 50 (máximo 500). */
  limite?: number;
  /**
   * Centro cuyos retiros recientes definen el orden cuando NO hay texto de
   * búsqueda: primero los insumos más retirados (unidades) en ese centro en los
   * últimos `DIAS_PRIORIDAD_RETIROS` días y luego el resto por nombre. Con
   * texto se ignora (orden alfabético). El actor debe tener acceso al centro
   * (`SIN_ACCESO_AL_CENTRO` si no).
   */
  priorizarRetirosDeCentroId?: string | null;
}

/**
 * Busca insumos del catálogo por nombre, código o código de barras, sin
 * distinguir tildes ni mayúsculas ("jeringa" encuentra "Jeringá", "dialisis"
 * encuentra "Diálisis"). Permiso: `catalogo:ver`.
 */
export async function buscarInsumos(
  actor: Actor,
  filtros: FiltrosBuscarInsumos = {},
  opciones: { ahora?: Date } = {},
): Promise<OpcionInsumo[]> {
  verificarPermiso(actor, "catalogo:ver");
  const texto = textoDeBusqueda(filtros.texto);
  const limite = Math.min(Math.max(Math.trunc(filtros.limite ?? 50) || 50, 1), 500);

  const condiciones: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (filtros.soloActivos !== false) condiciones.push(Prisma.sql`i."activo"`);
  if (filtros.categoriaId) condiciones.push(Prisma.sql`i."categoriaId" = ${filtros.categoriaId}`);
  if (texto) {
    const patron = patronLike(texto);
    condiciones.push(Prisma.sql`(
      unaccent(i."nombre") ILIKE unaccent(${patron})
      OR unaccent(i."codigo") ILIKE unaccent(${patron})
      OR i."codigoBarras" = ${texto}
    )`);
  }

  let unionRetiros = Prisma.empty;
  let orden = Prisma.sql`i."nombre" ASC, i."id" ASC`;
  let columnaUso = Prisma.empty;
  if (!texto && filtros.priorizarRetirosDeCentroId) {
    const [centroId] = alcanceDeCentros(actor, filtros.priorizarRetirosDeCentroId)!;
    const desde = new Date((opciones.ahora ?? new Date()).getTime() - DIAS_PRIORIDAD_RETIROS * 86_400_000);
    unionRetiros = Prisma.sql`
      LEFT JOIN (
        SELECT m."insumoId", SUM(m."cantidad") AS "retirado"
        FROM "movimientos" m
        WHERE m."tipo" = 'RETIRO'::"TipoMovimiento" AND m."centroId" = ${centroId} AND m."creadoEn" >= ${desde}
        GROUP BY m."insumoId"
      ) r ON r."insumoId" = i."id"`;
    orden = Prisma.sql`COALESCE(r."retirado", 0) DESC, i."nombre" ASC, i."id" ASC`;
    columnaUso = Prisma.sql`, (COALESCE(r."retirado", 0) > 0) AS "masUsado"`;
  }

  return db.$queryRaw<OpcionInsumo[]>(Prisma.sql`
    SELECT i."id", i."codigo", i."nombre", i."presentacion", i."unidadMedida", c."nombre" AS "categoria",
           i."controlaVencimiento", i."requiereCadenaFrio", i."codigoBarras"${columnaUso}
    FROM "insumos" i
    JOIN "categorias" c ON c."id" = i."categoriaId"
    ${unionRetiros}
    WHERE ${Prisma.join(condiciones, " AND ")}
    ORDER BY ${orden}
    LIMIT ${limite}
  `);
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
 * duplicar un lote con otra fecha), más recientes primero.
 *
 * Respeta el alcance del actor: quien no ve toda la red solo recibe los lotes
 * que tienen (o tuvieron) existencias o movimientos en SUS centros; los lotes
 * que solo han pasado por otros centros no se revelan.
 * Permiso: `catalogo:ver`.
 */
export async function lotesDeInsumo(
  actor: Actor,
  insumoId: string,
  limite = 30,
): Promise<{ loteId: string; numeroLote: string; fechaVencimiento: DiaISO | null }[]> {
  verificarPermiso(actor, "catalogo:ver");
  const centros = alcanceDeCentros(actor);
  if (centros !== null && centros.length === 0) return [];
  const filas = await db.lote.findMany({
    where: {
      insumoId,
      ...(centros === null
        ? {}
        : {
            OR: [
              { existencias: { some: { ubicacion: { centroId: { in: centros } } } } },
              { movimientos: { some: { centroId: { in: centros } } } },
            ],
          }),
    },
    select: { id: true, numeroLote: true, fechaVencimiento: true },
    orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(Math.trunc(limite) || 30, 1), 200),
  });
  return filas.map((l) => ({
    loteId: l.id,
    numeroLote: l.numeroLote,
    fechaVencimiento: l.fechaVencimiento ? dateADia(l.fechaVencimiento) : null,
  }));
}

/**
 * Un insumo del catálogo como opción de formulario (para pre-rellenar desde un
 * enlace). Devuelve `null` si no existe. Permiso: `catalogo:ver`.
 */
export async function obtenerOpcionInsumo(
  actor: Actor,
  insumoId: string,
): Promise<(OpcionInsumo & { activo: boolean }) | null> {
  verificarPermiso(actor, "catalogo:ver");
  const fila = await db.insumo.findUnique({
    where: { id: insumoId },
    select: {
      id: true,
      codigo: true,
      nombre: true,
      presentacion: true,
      unidadMedida: true,
      controlaVencimiento: true,
      requiereCadenaFrio: true,
      codigoBarras: true,
      activo: true,
      categoria: { select: { nombre: true } },
    },
  });
  if (!fila) return null;
  const { categoria, ...resto } = fila;
  return { ...resto, categoria: categoria.nombre };
}
