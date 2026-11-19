import "server-only";
import { BOM_UTF8, filaCsv } from "@/lib/csv";
import type { Actor } from "@/lib/permisos";
import { obtenerSesion } from "./auth/sesion";
import { ErrorDominio, type CodigoError } from "./errores";
import { registrarError } from "./registro";
import { consumirLimite } from "./limitador";
import {
  conAvisoDeTope,
  MAXIMO_EXPORTACIONES_POR_MINUTO,
  type ExportacionCsv,
} from "./servicios/exportaciones";

const ESTADO_HTTP: Partial<Record<CodigoError, number>> = {
  NO_AUTENTICADO: 401,
  SIN_PERMISO: 403,
  SIN_ACCESO_AL_CENTRO: 403,
  VALIDACION: 400,
  NO_ENCONTRADO: 404,
  DEMASIADOS_INTENTOS: 429,
};

function respuestaTexto(estado: number, mensaje: string): Response {
  return new Response(mensaje, {
    status: estado,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Convierte la exportación en un cuerpo que se envía por partes (BOM + encabezados + filas). */
function cuerpoCsv(exportacion: ExportacionCsv): ReadableStream<Uint8Array> {
  const codificador = new TextEncoder();
  // Si se alcanza el tope de filas, el archivo termina con una fila de aviso.
  const iterador = conAvisoDeTope(exportacion.filas)[Symbol.asyncIterator]();
  const FILAS_POR_PARTE = 500;
  return new ReadableStream<Uint8Array>({
    start(controlador) {
      controlador.enqueue(codificador.encode(BOM_UTF8 + filaCsv(exportacion.encabezados)));
    },
    async pull(controlador) {
      try {
        let parte = "";
        for (let i = 0; i < FILAS_POR_PARTE; i++) {
          const siguiente = await iterador.next();
          if (siguiente.done) {
            if (parte) controlador.enqueue(codificador.encode(parte));
            controlador.close();
            return;
          }
          parte += filaCsv(siguiente.value);
        }
        controlador.enqueue(codificador.encode(parte));
      } catch (error) {
        registrarError("exportacion", "Error al generar el CSV.", error);
        controlador.error(error);
      }
    },
    async cancel() {
      await iterador.return?.(undefined);
    },
  });
}

/**
 * Patrón de todo Route Handler de exportación CSV:
 *  1. exige sesión vigente (sin cambio de contraseña pendiente);
 *  2. limita las descargas por usuario (`MAXIMO_EXPORTACIONES_POR_MINUTO`; 429 si se excede);
 *  3. delega en el servicio, que valida rol + centro y audita la exportación;
 *  4. traduce los errores de dominio a 401 / 403 / 400 sin filtrar detalles;
 *  5. responde el archivo como descarga, sin caché. Si se alcanzó el tope de
 *     filas, la última fila del archivo lo avisa y, cuando se sabe de antemano,
 *     también la cabecera `X-Exportacion-Truncada: 1`.
 */
export async function responderCsv(preparar: (actor: Actor) => Promise<ExportacionCsv>): Promise<Response> {
  const sesion = await obtenerSesion();
  if (!sesion) return respuestaTexto(401, "Tu sesión expiró. Vuelve a iniciar sesión.");
  if (sesion.usuario.debeCambiarPassword) {
    return respuestaTexto(403, "Debes cambiar tu contraseña antes de continuar.");
  }
  const limite = await consumirLimite({
    tipo: "EXPORTACION",
    identificador: sesion.usuario.id,
    maximo: MAXIMO_EXPORTACIONES_POR_MINUTO,
    ventanaMs: 60_000,
  });
  if (limite.excedido) {
    const espera = Math.max(1, Math.ceil((limite.expiraEn.getTime() - Date.now()) / 1000));
    const respuesta = respuestaTexto(429, "Demasiadas exportaciones seguidas. Espera un minuto y vuelve a intentarlo.");
    respuesta.headers.set("Retry-After", String(espera));
    return respuesta;
  }
  let exportacion: ExportacionCsv;
  try {
    exportacion = await preparar(sesion.actor);
  } catch (error) {
    if (error instanceof ErrorDominio) {
      return respuestaTexto(ESTADO_HTTP[error.codigo] ?? 400, error.message);
    }
    registrarError("exportacion", "Error inesperado al preparar la exportación.", error);
    return respuestaTexto(500, "Ocurrió un error inesperado. Intenta nuevamente.");
  }
  return new Response(cuerpoCsv(exportacion), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportacion.archivo}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(exportacion.truncada ? { "X-Exportacion-Truncada": "1" } : {}),
    },
  });
}
