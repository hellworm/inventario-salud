import { headers } from "next/headers";
import { resolverVolver, type DestinoVolver } from "@/lib/navegacion";
import { textoParam, type ValorParametro } from "@/lib/parametros";

/**
 * Enlace "volver" de los formularios de movimientos: respeta `?volver=/ruta`
 * (validado como ruta interna) y, si no viene, la página desde la que se llegó
 * (panel, alertas, inventario, ficha, historial). Por defecto, Inventario.
 */
export async function volverDeFormulario(parametro: ValorParametro): Promise<DestinoVolver> {
  const cabeceras = await headers();
  return resolverVolver(textoParam(parametro), cabeceras.get("referer"), cabeceras.get("host"));
}
