import "server-only";
import {
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
 * Resuelve el alcance de centros de una consulta.
 * - Con `centroId`: valida el acceso y devuelve `[centroId]`.
 * - Sin `centroId`: `null` para quien ve toda la red (sin filtro) o los
 *   centros asignados del actor.
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
