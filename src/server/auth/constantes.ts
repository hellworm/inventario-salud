/** Constantes de sesión. Sin dependencias: también las usa `proxy.ts`. */

export const COOKIE_SESION = "ri_sesion";
export const COOKIE_CENTRO = "ri_centro";
export const COOKIE_SIDEBAR = "ri_sidebar";

/** Valor de la cookie de centro que significa "Toda la red". */
export const CENTRO_TODOS = "todos";

const horas = Number(process.env.SESION_HORAS);
/** Duración de la expiración deslizante. */
export const DURACION_SESION_MS = (Number.isFinite(horas) && horas > 0 ? horas : 12) * 3_600_000;
/** Vida máxima absoluta de una sesión, aunque se siga usando. */
export const VIDA_MAXIMA_SESION_MS = 7 * 24 * 3_600_000;
/** La expiración en BD se renueva como máximo cada este intervalo. */
export const INTERVALO_RENOVACION_MS = 5 * 60_000;

export const MAX_INTENTOS_FALLIDOS = 5;
export const BLOQUEO_MS = 15 * 60_000;

export function opcionesCookieSesion() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(DURACION_SESION_MS / 1000),
  };
}
