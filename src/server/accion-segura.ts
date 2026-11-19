import "server-only";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { puede, type Actor, type Permiso } from "@/lib/permisos";
import type { ErroresCampo, ResultadoAccion, ResultadoError } from "@/lib/resultado";
import { obtenerSesion, type Sesion } from "./auth/sesion";
import { ErrorDominio } from "./errores";
import { erroresDeZod } from "./validacion";

export interface ContextoAccion<D> {
  /** Datos ya validados y normalizados por el esquema. */
  datos: D;
  /** Identidad para pasar a los servicios. */
  actor: Actor;
  sesion: Sesion;
}

export interface ConfigAccion<E extends z.ZodType> {
  /** Esquema zod de la entrada (compartido con el formulario). */
  esquema: E;
  /**
   * Permiso requerido por rol. Es un primer filtro: el servicio vuelve a
   * validar rol + pertenencia al centro con los datos reales.
   */
  permiso: Permiso;
  /**
   * Rutas a revalidar tras el éxito. Por defecto se revalida toda la app
   * (`"/"` con alcance layout), que es lo correcto para cambios de stock.
   * Pasar `false` si la acción no cambia nada visible.
   */
  revalidar?: readonly string[] | false;
}

/** Convierte cualquier error en un `ResultadoError` seguro para el cliente. */
export function aResultadoError(error: unknown): ResultadoError {
  if (error instanceof ErrorDominio) {
    const deDetalle = error.detalle?.erroresCampo as ErroresCampo | undefined;
    const erroresCampo = deDetalle ?? (error.campo ? { [error.campo]: [error.message] } : undefined);
    return { ok: false, error: error.message, codigo: error.codigo, ...(erroresCampo ? { erroresCampo } : {}) };
  }
  // Error inesperado: se registra en el servidor y NO se filtra al cliente.
  console.error("[accion] error inesperado:", error);
  return { ok: false, error: "Ocurrió un error inesperado. Intenta nuevamente.", codigo: "ERROR_INTERNO" };
}

/**
 * Crea una Server Action segura y uniforme:
 *  1. exige sesión vigente (y que no tenga cambio de contraseña pendiente);
 *  2. verifica el permiso del rol;
 *  3. valida la entrada con zod (errores por campo);
 *  4. ejecuta el manejador, que llama a la capa de servicios;
 *  5. traduce errores de dominio a `{ ok: false, error, codigo, erroresCampo }`;
 *  6. revalida las rutas afectadas.
 *
 * Nunca lanza hacia el cliente: siempre devuelve `ResultadoAccion<S>`.
 */
export function accionSegura<E extends z.ZodType, S>(
  config: ConfigAccion<E>,
  manejador: (ctx: ContextoAccion<z.output<E>>) => Promise<S>,
): (entrada: z.input<E>) => Promise<ResultadoAccion<S>> {
  return async (entrada) => {
    try {
      const sesion = await obtenerSesion();
      if (!sesion) {
        return { ok: false, codigo: "NO_AUTENTICADO", error: "Tu sesión expiró. Vuelve a iniciar sesión." };
      }
      if (sesion.usuario.debeCambiarPassword) {
        return { ok: false, codigo: "NO_AUTENTICADO", error: "Debes cambiar tu contraseña antes de continuar." };
      }
      if (!puede(sesion.actor.rol, config.permiso)) {
        return { ok: false, codigo: "SIN_PERMISO", error: "No tienes permiso para realizar esta acción." };
      }

      const validado = config.esquema.safeParse(entrada);
      if (!validado.success) {
        return {
          ok: false,
          codigo: "VALIDACION",
          error: "Revisa los campos marcados.",
          erroresCampo: erroresDeZod(validado.error),
        };
      }

      const datos = await manejador({ datos: validado.data, actor: sesion.actor, sesion });

      if (config.revalidar === undefined) revalidatePath("/", "layout");
      else if (config.revalidar) for (const ruta of config.revalidar) revalidatePath(ruta);

      return { ok: true, datos };
    } catch (error) {
      // redirect()/notFound() lanzan errores de control de Next: deben seguir su curso.
      unstable_rethrow(error);
      return aResultadoError(error);
    }
  };
}
