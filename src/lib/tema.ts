/**
 * Tema de la interfaz: "claro", "oscuro" o "sistema" (según el dispositivo).
 *
 * La preferencia vive en la cookie `ri_tema` (no es httpOnly: la escribe el
 * navegador desde `useTema`; no guarda nada sensible). El layout raíz la lee y
 * pone `data-tema="claro|oscuro"` en `<html>`; con "sistema" no hay cookie ni
 * atributo y decide el CSS (`prefers-color-scheme`, ver `globals.css`). Así el
 * primer HTML ya llega con el tema correcto, sin script en línea ni parpadeo.
 *
 * Sin dependencias: lo usan el servidor y el cliente.
 */

export const COOKIE_TEMA = "ri_tema";

export const TEMAS = ["claro", "oscuro", "sistema"] as const;
export type Tema = (typeof TEMAS)[number];
/** Tema forzado: el valor del atributo `data-tema` de `<html>`. */
export type TemaForzado = Exclude<Tema, "sistema">;

export const TEMA_POR_DEFECTO: Tema = "sistema";

export const ETIQUETA_TEMA: Readonly<Record<Tema, string>> = {
  claro: "Claro",
  oscuro: "Oscuro",
  sistema: "Según el dispositivo",
};

/** Un año, en segundos. */
export const DURACION_COOKIE_TEMA_S = 365 * 24 * 3600;

/**
 * Color de la barra del navegador (`<meta name="theme-color">`): el teal de la
 * marca en claro y la superficie del encabezado en oscuro.
 */
export const COLOR_BARRA: Readonly<Record<TemaForzado, string>> = {
  claro: "#1a7480",
  oscuro: "#12161a",
};

/** Valor de la cookie → tema. Todo lo que no sea "claro" u "oscuro" es "sistema". */
export function leerTema(valor: string | undefined | null): Tema {
  return valor === "claro" || valor === "oscuro" ? valor : TEMA_POR_DEFECTO;
}

/** Valor de `data-tema` para `<html>`; `undefined` deja decidir al dispositivo. */
export function atributoTema(tema: Tema): TemaForzado | undefined {
  return tema === "sistema" ? undefined : tema;
}

/**
 * Texto de `document.cookie` que guarda la preferencia. "sistema" borra la
 * cookie (es el valor por defecto). `segura` agrega `Secure` (sitio en HTTPS).
 */
export function cookieTema(tema: Tema, segura: boolean): string {
  const base = `${COOKIE_TEMA}=${tema === "sistema" ? "" : tema}; Path=/; Max-Age=${tema === "sistema" ? 0 : DURACION_COOKIE_TEMA_S}; SameSite=Lax`;
  return segura ? `${base}; Secure` : base;
}
