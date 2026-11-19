import type { Instrumentation } from "next";

/**
 * Se ejecuta una vez al iniciar el servidor de Next (no durante `next build`).
 * Valida la configuración antes de aceptar solicitudes: si falta una variable
 * requerida, el proceso termina con un mensaje claro.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validarEntorno } = await import("@/server/entorno");
  const entorno = validarEntorno();
  const { registrarInfo } = await import("@/server/registro");
  registrarInfo("arranque", "Configuración válida; servidor iniciando.", {
    entorno: entorno.NODE_ENV,
    sesionHoras: entorno.SESION_HORAS,
  });
}

/**
 * Errores del servidor que Next captura al renderizar páginas, en manejadores
 * de ruta y en Server Actions. Quedan en la salida de errores sin cabeceras
 * (que incluyen la cookie de sesión) ni parámetros de la URL.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, solicitud, contexto) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registrarError } = await import("@/server/registro");
  registrarError("solicitud", "Error del servidor al atender una solicitud.", error, {
    metodo: solicitud.method,
    ruta: solicitud.path.split("?")[0],
    tipo: contexto.routeType,
    archivoRuta: contexto.routePath,
  });
};
