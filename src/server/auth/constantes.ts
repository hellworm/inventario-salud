/** Constantes de sesión. Sin dependencias: también las usa `proxy.ts`. */

export const COOKIE_SESION = "ri_sesion";
export const COOKIE_CENTRO = "ri_centro";
export const COOKIE_SIDEBAR = "ri_sidebar";

/** Valor de la cookie de centro que significa "todos mis centros" (toda la red o toda mi institución). */
export const CENTRO_TODOS = "todos";

const horas = Number(process.env.SESION_HORAS);
/** Duración de la expiración deslizante. */
export const DURACION_SESION_MS = (Number.isFinite(horas) && horas > 0 ? horas : 12) * 3_600_000;
/** Vida máxima absoluta de una sesión, aunque se siga usando. */
export const VIDA_MAXIMA_SESION_MS = 7 * 24 * 3_600_000;
/** La expiración en BD se renueva como máximo cada este intervalo. */
export const INTERVALO_RENOVACION_MS = 5 * 60_000;

// --- Límites de intentos de inicio de sesión (ver `autenticacion.ts`) ---

/** Intentos por IP (con cualquier email) dentro de `VENTANA_LOGIN_IP_MS`. */
export const MAX_INTENTOS_POR_IP = 20;
export const VENTANA_LOGIN_IP_MS = 5 * 60_000;
/**
 * Intentos fallidos por par IP + email antes de bloquear ESE par durante
 * `BLOQUEO_MS`. Sin IP confiable (TRUST_PROXY apagado) el par degrada a la
 * cuenta completa.
 */
export const MAX_INTENTOS_FALLIDOS = 5;
export const BLOQUEO_MS = 15 * 60_000;
/**
 * Fallos consecutivos de una cuenta (desde cualquier IP) a partir de los cuales
 * se aplica un retardo global progresivo y acotado a las IP desde las que esa
 * cuenta NO ha iniciado sesión en los últimos `DIAS_IP_CONOCIDA` días.
 */
export const UMBRAL_BLOQUEO_GLOBAL = 30;
export const RETARDO_GLOBAL_BASE_MS = 30_000;
export const RETARDO_GLOBAL_MAXIMO_MS = 15 * 60_000;
export const DIAS_IP_CONOCIDA = 30;
/** Registros LOGIN_FALLIDO/LOGIN_BLOQUEADO por IP y minuto; el resto se agrega. */
export const MAX_AUDITORIA_LOGIN_POR_MINUTO = 10;
/** Igual, cuando no hay IP confiable (un solo contador para todo el sistema). */
export const MAX_AUDITORIA_LOGIN_SIN_IP_POR_MINUTO = 60;

/** Vigencia de una contraseña temporal (usuario nuevo o restablecida por un ADMIN). */
export const VIGENCIA_PASSWORD_TEMPORAL_MS = 72 * 3_600_000;
/** Intentos fallidos sobre la contraseña actual al cambiarla, por usuario. */
export const MAX_INTENTOS_PASSWORD_ACTUAL = 5;
export const VENTANA_PASSWORD_ACTUAL_MS = 15 * 60_000;

/**
 * Opciones de la cookie de sesión. Dura lo mismo que la vida máxima absoluta de
 * la sesión y NO se renueva: la inactividad (expiración deslizante) se controla
 * solo en el servidor (BD). Así una cookie con un token ya inválido nunca se
 * prolonga.
 */
export function opcionesCookieSesion() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(VIDA_MAXIMA_SESION_MS / 1000),
  };
}

/** Forma de un token de sesión bien formado (32 bytes en base64url). */
export const PATRON_TOKEN_SESION = /^[A-Za-z0-9_-]{20,200}$/;
