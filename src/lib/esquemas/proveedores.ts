import { z } from "zod";
import { zId, zRut, zTexto, zTextoOpcional } from "./base";
import { zTelefonoOpcional } from "./centros";

/** Email opcional: vacío → `undefined`; si viene, en minúsculas y válido. */
const zEmailOpcional = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Máximo 254 caracteres.")
  .nullish()
  .refine((v) => !v || z.email().safeParse(v).success, "Ingresa un correo electrónico válido.")
  .transform((v) => (v ? v : undefined));

/** Largo máximo de un sitio web ya normalizado. */
export const SITIO_WEB_MAXIMO = 300;

/**
 * Normaliza la dirección de un sitio web escrita por una persona y devuelve
 * una URL absoluta `http(s)://…`, o `null` si no es un sitio web válido.
 *
 * - Sin esquema se asume `https://` (`www.ejemplo.cl` → `https://www.ejemplo.cl/`).
 * - SOLO http y https: `javascript:`, `data:`, `file:`, `mailto:`… se rechazan.
 * - Sin usuario ni contraseña en la URL, sin espacios ni caracteres de control,
 *   dominio con al menos un punto y largo acotado.
 */
export function normalizarSitioWeb(texto: string): string | null {
  const bruto = texto.trim();
  if (bruto === "" || bruto.length > SITIO_WEB_MAXIMO) return null;
  // Espacios, caracteres de control, comillas, < > y barras invertidas no van en una URL escrita a mano.
  if (/[\s\u0000-\u001f\u007f"'<>`\\]/.test(bruto)) return null;
  let candidato: string;
  if (/^https?:\/\//i.test(bruto)) candidato = bruto;
  else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(bruto)) return null; // otro esquema con "//" (ftp://, file://…)
  else if (bruto.startsWith("/")) return null; // "//host" o una ruta: no es un sitio web
  else candidato = `https://${bruto}`; // "javascript:alert(1)" queda como host inválido y se rechaza abajo
  let url: URL;
  try {
    url = new URL(candidato);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  // Dominio real: etiquetas de letras, dígitos y guiones separadas por puntos (IDN llega en punycode).
  if (!/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/i.test(url.hostname)) return null;
  const normalizada = url.href;
  return normalizada.length <= SITIO_WEB_MAXIMO ? normalizada : null;
}

/** Dominio visible de un sitio web ya normalizado (`www.ejemplo.cl`); vacío si no se puede leer. */
export function dominioDeSitioWeb(sitioWeb: string): string {
  try {
    return new URL(sitioWeb).hostname;
  } catch {
    return "";
  }
}

/** Sitio web opcional: vacío → `undefined`; si viene, normalizado a `http(s)://…`. */
export const zSitioWebOpcional = z
  .string()
  .trim()
  .max(SITIO_WEB_MAXIMO, `Máximo ${SITIO_WEB_MAXIMO} caracteres.`)
  .nullish()
  .refine((v) => !v || normalizarSitioWeb(v) !== null, "Ingresa un sitio web válido, p. ej. www.ejemplo.cl.")
  .transform((v) => (v ? (normalizarSitioWeb(v) ?? undefined) : undefined));

export const esquemaProveedor = z.object({
  rut: zRut,
  razonSocial: zTexto(140, "Ingresa la razón social."),
  contacto: zTextoOpcional(100),
  telefono: zTelefonoOpcional,
  email: zEmailOpcional,
  sitioWeb: zSitioWebOpcional,
});
export type EntradaProveedor = z.input<typeof esquemaProveedor>;
export type DatosProveedor = z.output<typeof esquemaProveedor>;

export const esquemaActualizarProveedor = esquemaProveedor.extend({ id: zId });
export type EntradaActualizarProveedor = z.input<typeof esquemaActualizarProveedor>;
