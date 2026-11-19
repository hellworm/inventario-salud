import "server-only";
import { isIP } from "node:net";

/**
 * IP y user-agent de una solicitud, a partir de sus cabeceras. Sin dependencias
 * de Next: se puede probar directamente.
 *
 * `X-Forwarded-For` lo puede escribir cualquier cliente, así que SOLO se usa si
 * `TRUST_PROXY` indica cuántos proxies inversos de confianza hay delante de la
 * aplicación. Cada proxy agrega al final la IP de quien se le conectó; por eso
 * la IP del cliente es la posición `TRUST_PROXY` contando desde la DERECHA
 * (nunca la primera, que es la que el cliente puede inventar).
 *
 * Sin `TRUST_PROXY` (0 o sin definir) no hay IP confiable y se devuelve `null`.
 */

export const LARGO_MAXIMO_USER_AGENT = 255;
const LARGO_MAXIMO_IP = 45; // IPv6 con IPv4 embebida

export interface MetaSolicitud {
  ip?: string | null;
  userAgent?: string | null;
}

/** Número de proxies de confianza según `TRUST_PROXY` (0 = no confiar). */
export function proxiesDeConfianza(valor: string | undefined = process.env.TRUST_PROXY): number {
  const limpio = valor?.trim() ?? "";
  if (!/^\d{1,2}$/.test(limpio)) return 0;
  return Math.min(Number(limpio), 10);
}

/** Valida y normaliza una IP; `null` si no es una IP v4/v6 válida. */
export function normalizarIp(valor: string | null | undefined): string | null {
  let ip = valor?.trim() ?? "";
  if (ip.length === 0 || ip.length > LARGO_MAXIMO_IP + 2) return null;
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  // IPv4 mapeada en IPv6 (::ffff:203.0.113.7) → IPv4.
  const mapeada = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapeada) ip = mapeada[1]!;
  if (isIP(ip) === 0) return null;
  return ip.toLowerCase().slice(0, LARGO_MAXIMO_IP);
}

/**
 * IP del cliente según `X-Forwarded-For` y la cantidad de proxies de confianza.
 * Devuelve `null` si no se confía en ningún proxy, si la cabecera trae menos
 * saltos que proxies declarados o si el valor no es una IP válida.
 */
export function extraerIpCliente(xForwardedFor: string | null | undefined, proxies: number): string | null {
  if (proxies <= 0 || !xForwardedFor) return null;
  // Tope defensivo: una cabecera gigante no se procesa.
  if (xForwardedFor.length > 2000) return null;
  const saltos = xForwardedFor.split(",").map((s) => s.trim());
  if (saltos.length < proxies) return null;
  return normalizarIp(saltos[saltos.length - proxies]);
}

export function normalizarUserAgent(valor: string | null | undefined): string | null {
  const limpio = valor?.trim();
  return limpio ? limpio.slice(0, LARGO_MAXIMO_USER_AGENT) : null;
}

/** Meta de la solicitud a partir de un lector de cabeceras. */
export function metaDeCabeceras(
  cabeceras: { get(nombre: string): string | null },
  proxies: number = proxiesDeConfianza(),
): MetaSolicitud {
  return {
    ip: extraerIpCliente(cabeceras.get("x-forwarded-for"), proxies),
    userAgent: normalizarUserAgent(cabeceras.get("user-agent")),
  };
}
