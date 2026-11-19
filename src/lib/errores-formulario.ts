/**
 * Utilidades puras para los errores de formulario (las usan los formularios de
 * movimientos; viven aquí para poder probarlas sin React).
 */
import type { ErroresCampo } from "./resultado";

/** Puntuación uniforme de los mensajes de validación: siempre terminan en punto. */
export function conPuntoFinal(mensaje: string): string {
  const limpio = mensaje.trim();
  return limpio === "" || /[.!?…:]$/.test(limpio) ? limpio : `${limpio}.`;
}

/** Une errores del servidor con los de la validación local (gana el local) y uniforma su puntuación. */
export function unirErrores(servidor: ErroresCampo, locales: ErroresCampo): ErroresCampo {
  const unidos: ErroresCampo = {};
  for (const [campo, mensajes] of Object.entries({ ...servidor, ...locales })) {
    unidos[campo] = mensajes.map(conPuntoFinal);
  }
  return unidos;
}

/**
 * Mensajes de los campos con error que NO tienen un control visible en el
 * formulario (p. ej. el servidor rechaza un campo que la pantalla no muestra
 * en ese modo). Regla: ningún error del servidor puede quedar invisible; lo
 * que no se puede mostrar junto a un campo va al resumen del formulario.
 */
export function erroresSinControl(errores: ErroresCampo, camposVisibles: readonly string[]): string[] {
  const mensajes = Object.entries(errores)
    .filter(([campo]) => !camposVisibles.includes(campo))
    .map(([, m]) => conPuntoFinal(m[0] ?? ""))
    .filter((m) => m !== "");
  return [...new Set(mensajes)];
}

/** ¿El resultado de una acción indica que ya no hay sesión? */
export function esSesionVencida(resultado: { ok: boolean; codigo?: string }): boolean {
  return !resultado.ok && resultado.codigo === "NO_AUTENTICADO";
}

/** Ruta de login que devuelve a la pantalla actual (con sus filtros y prellenado) tras ingresar. */
export function rutaLoginConDestino(ubicacion: { pathname: string; search: string }): string {
  const destino = `${ubicacion.pathname}${ubicacion.search}`;
  const consulta = new URLSearchParams({ motivo: "sesion" });
  if (destino !== "/" && !destino.startsWith("/login")) consulta.set("destino", destino);
  return `/login?${consulta.toString()}`;
}
