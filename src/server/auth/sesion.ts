import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { puede, tieneAccesoACentro, veTodaLaRed, type Actor, type Permiso } from "@/lib/permisos";
import { db } from "../db";
import {
  cerrarSesionPorToken,
  iniciarSesion,
  validarTokenSesion,
  type MetaSolicitud,
  type UsuarioSesion,
} from "./autenticacion";
import { CENTRO_TODOS, COOKIE_CENTRO, COOKIE_SESION, opcionesCookieSesion } from "./constantes";

/** Sesión del usuario autenticado, lista para usar en páginas y acciones. */
export interface Sesion {
  sesionId: string;
  usuario: UsuarioSesion;
  /** Identidad para pasar a los servicios. */
  actor: Actor;
}

/** IP y user-agent de la solicitud actual. */
export async function obtenerMetaSolicitud(): Promise<MetaSolicitud> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent") };
}

/**
 * Devuelve la sesión actual o `null`. Se memoiza por solicitud: se puede
 * llamar desde layout, página y componentes sin repetir consultas.
 */
export const obtenerSesion = cache(async (): Promise<Sesion | null> => {
  const almacen = await cookies();
  const token = almacen.get(COOKIE_SESION)?.value;
  if (!token) return null;
  const valida = await validarTokenSesion(token);
  if (!valida) return null;
  const meta = await obtenerMetaSolicitud();
  return {
    sesionId: valida.sesionId,
    usuario: valida.usuario,
    actor: {
      usuarioId: valida.usuario.id,
      rol: valida.usuario.rol,
      centroIds: valida.usuario.centroIds,
      ip: meta.ip,
    },
  };
});

/**
 * Exige sesión. Sin sesión redirige a /login; si el usuario debe cambiar su
 * contraseña redirige a /cambiar-password (salvo `permitirCambioPendiente`).
 */
export async function requerirSesion(
  opciones: { permitirCambioPendiente?: boolean } = {},
): Promise<Sesion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  if (sesion.usuario.debeCambiarPassword && !opciones.permitirCambioPendiente) {
    redirect("/cambiar-password");
  }
  return sesion;
}

/**
 * Exige sesión + permiso (+ pertenencia al centro si se indica). Para usar en
 * páginas y layouts: si no cumple, redirige a /sin-permiso.
 * En servicios y acciones se usa `verificarPermiso` (lanza `ErrorDominio`).
 */
export async function requerirPermiso(permiso: Permiso, centroId?: string): Promise<Sesion> {
  const sesion = await requerirSesion();
  const autorizado =
    puede(sesion.actor.rol, permiso) &&
    (centroId === undefined || tieneAccesoACentro(sesion.actor, centroId));
  if (!autorizado) redirect("/sin-permiso");
  return sesion;
}

/** Inicia sesión y deja la cookie. Lanza `ErrorDominio` si las credenciales fallan. */
export async function iniciarSesionConCookie(email: string, password: string): Promise<UsuarioSesion> {
  const meta = await obtenerMetaSolicitud();
  const { token, usuario } = await iniciarSesion(email, password, meta);
  const almacen = await cookies();
  almacen.set(COOKIE_SESION, token, opcionesCookieSesion());
  return usuario;
}

/** Cierra la sesión actual y borra la cookie. */
export async function cerrarSesionActual(): Promise<void> {
  const almacen = await cookies();
  await cerrarSesionPorToken(almacen.get(COOKIE_SESION)?.value);
  almacen.delete(COOKIE_SESION);
}

// ---------------------------------------------------------------------------
// Centro activo
// ---------------------------------------------------------------------------

export interface CentroResumen {
  id: string;
  nombre: string;
  tipo: string;
  comuna: string;
}

export interface CentroActivo {
  /** Centro seleccionado, o `null` si es "Toda la red" (solo quien ve toda la red). */
  centroId: string | null;
  centro: CentroResumen | null;
  /** Centros activos que el usuario puede seleccionar. */
  centros: CentroResumen[];
  /** ¿Puede elegir "Toda la red"? */
  puedeVerTodaLaRed: boolean;
}

/** Centros activos visibles para el actor, ordenados por nombre. */
export const listarCentrosDelActor = cache(async (sesion: Sesion): Promise<CentroResumen[]> => {
  return db.centro.findMany({
    where: {
      activo: true,
      ...(veTodaLaRed(sesion.actor) ? {} : { id: { in: [...sesion.actor.centroIds] } }),
    },
    select: { id: true, nombre: true, tipo: true, comuna: true },
    orderBy: { nombre: "asc" },
  });
});

/**
 * Centro activo del usuario (persistido en cookie). Siempre devuelve un valor
 * válido para el actor: si la cookie apunta a un centro sin acceso, se ignora.
 * Los servicios vuelven a validar el acceso de todos modos.
 */
export async function obtenerCentroActivo(sesion: Sesion): Promise<CentroActivo> {
  const centros = await listarCentrosDelActor(sesion);
  const puedeVerTodaLaRed = veTodaLaRed(sesion.actor);
  const preferido = (await cookies()).get(COOKIE_CENTRO)?.value;

  // 1) el centro guardado, si sigue siendo visible; 2) "Toda la red" para
  // quien puede verla; 3) el primer centro asignado.
  let centro = centros.find((c) => c.id === preferido) ?? null;
  const quiereTodaLaRed = !preferido || preferido === CENTRO_TODOS;
  if (!centro && !(puedeVerTodaLaRed && quiereTodaLaRed)) centro = centros[0] ?? null;

  return { centroId: centro?.id ?? null, centro, centros, puedeVerTodaLaRed };
}

export interface ContextoPagina extends CentroActivo {
  sesion: Sesion;
  actor: Actor;
}

/**
 * Punto de entrada estándar de una página autenticada: exige el permiso y
 * devuelve sesión + centro activo.
 *
 * ```ts
 * const { actor, centroId } = await contextoPagina("inventario:ver");
 * const datos = await listarInventario(actor, { centroId });
 * ```
 */
export async function contextoPagina(permiso: Permiso): Promise<ContextoPagina> {
  const sesion = await requerirPermiso(permiso);
  const activo = await obtenerCentroActivo(sesion);
  return { ...activo, sesion, actor: sesion.actor };
}
