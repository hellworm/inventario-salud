import "server-only";
import {
  alcanzaInstitucion,
  puede,
  tieneAccesoACentro,
  veTodaLaRed,
  type Actor,
  type Permiso,
} from "@/lib/permisos";
import { ErrorDominio } from "./errores";

/**
 * Verificación de autorización para servicios y acciones. Lanza
 * `ErrorDominio` si el rol no tiene el permiso o el actor no pertenece al
 * centro. Si la operación ocurre en un centro, SIEMPRE se debe pasar `centroId`.
 */
export function verificarPermiso(actor: Actor, permiso: Permiso, centroId?: string): void {
  if (!puede(actor.rol, permiso)) {
    throw new ErrorDominio("SIN_PERMISO", "No tienes permiso para realizar esta acción.");
  }
  if (centroId !== undefined && !tieneAccesoACentro(actor, centroId)) {
    throw new ErrorDominio("SIN_ACCESO_AL_CENTRO", "No tienes acceso a este centro.");
  }
}

/**
 * Exige que el actor alcance la institución (ADMIN_RED todas; los demás solo
 * la propia). Se responde `NO_ENCONTRADO` a propósito: quien no alcanza una
 * institución no debe poder distinguir "no existe" de "es de otra institución".
 */
export function verificarInstitucion(actor: Actor, institucionId: string | null, queEs = "El registro"): void {
  if (!alcanzaInstitucion(actor, institucionId)) {
    throw new ErrorDominio("NO_ENCONTRADO", `${queEs} no existe.`);
  }
}

/**
 * Resuelve el alcance de centros de una consulta.
 * - Con `centroId`: valida el acceso y devuelve `[centroId]`.
 * - Sin `centroId`: `null` para quien ve toda la red (ADMIN_RED, sin filtro) o
 *   los centros del actor (`actor.centroIds`: los asignados o, para un ADMIN,
 *   todos los de su institución).
 */
export function alcanceDeCentros(actor: Actor, centroId?: string | null): string[] | null {
  if (centroId) {
    if (!tieneAccesoACentro(actor, centroId)) {
      throw new ErrorDominio("SIN_ACCESO_AL_CENTRO", "No tienes acceso a este centro.");
    }
    return [centroId];
  }
  return veTodaLaRed(actor) ? null : [...actor.centroIds];
}
