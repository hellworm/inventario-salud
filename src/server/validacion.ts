import "server-only";
import { z } from "zod";
import type { ErroresCampo } from "@/lib/resultado";
import { ErrorDominio } from "./errores";

/** Convierte los issues de zod en `{ "ruta.del.campo": [mensajes] }`. */
export function erroresDeZod(error: z.ZodError): ErroresCampo {
  const salida: ErroresCampo = {};
  for (const issue of error.issues) {
    const clave = issue.path.length > 0 ? issue.path.join(".") : "_";
    (salida[clave] ??= []).push(issue.message);
  }
  return salida;
}

/**
 * Valida `datos` contra un esquema. Si falla lanza `ErrorDominio("VALIDACION")`
 * con `detalle.erroresCampo`.
 */
export function validar<E extends z.ZodType>(esquema: E, datos: unknown): z.output<E> {
  const resultado = esquema.safeParse(datos);
  if (resultado.success) return resultado.data;
  const erroresCampo = erroresDeZod(resultado.error);
  const primero = Object.values(erroresCampo)[0]?.[0];
  throw new ErrorDominio("VALIDACION", primero ?? "Revisa los datos ingresados.", {
    detalle: { erroresCampo },
  });
}
