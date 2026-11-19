"use client";

import { esSesionVencida, rutaLoginConDestino } from "@/lib/errores-formulario";
import { toast } from "./toast";

export { esSesionVencida, rutaLoginConDestino };

/** Mensaje único para toda la app cuando el servidor responde `NO_AUTENTICADO`. */
export const MENSAJE_SESION_VENCIDA = "Tu sesión venció. Inicia sesión de nuevo para continuar.";

let redirigiendo = false;

/**
 * Avisa que la sesión venció y lleva a /login conservando la ruta actual como
 * destino. Deja un instante para que el aviso se alcance a leer. Varias
 * acciones que fallen a la vez provocan una sola redirección.
 */
export function avisarSesionVencida(): void {
  if (redirigiendo || typeof window === "undefined") return;
  redirigiendo = true;
  toast.error(MENSAJE_SESION_VENCIDA);
  window.setTimeout(() => {
    window.location.assign(rutaLoginConDestino(window.location));
  }, 1500);
}
