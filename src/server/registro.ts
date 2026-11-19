import "server-only";

/**
 * Registro (log) mínimo del servidor, sin dependencias.
 *
 * - Escribe en la salida estándar/de error, que es lo que recogen Docker y las
 *   plataformas gestionadas (`docker compose logs app`).
 * - En producción emite una línea JSON por evento (fácil de filtrar y de
 *   enviar a un agregador); en desarrollo, texto legible.
 * - Nunca escribe secretos: se ocultan los valores de claves sensibles
 *   (contraseñas, tokens, cookies) y las credenciales incluidas en
 *   direcciones de conexión.
 */

type Nivel = "info" | "aviso" | "error";

const CLAVE_SENSIBLE = /pass|clave|contrase|token|secret|cookie|authorization|hash/i;
const OCULTO = "[oculto]";
const PROFUNDIDAD_MAXIMA = 4;
const LARGO_MAXIMO_TEXTO = 4000;

/** Oculta credenciales incrustadas en direcciones (postgresql://usuario:clave@…). */
export function limpiarTexto(texto: string): string {
  const limpio = texto.replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^\s:/@]+):([^\s@/]+)@/gi, `$1$2:${OCULTO}@`);
  return limpio.length > LARGO_MAXIMO_TEXTO ? `${limpio.slice(0, LARGO_MAXIMO_TEXTO)}… (recortado)` : limpio;
}

/** Copia segura para el registro: oculta los valores de claves sensibles. */
export function limpiarDatos(valor: unknown, profundidad = 0): unknown {
  if (valor === null || valor === undefined) return valor;
  if (typeof valor === "string") return limpiarTexto(valor);
  if (typeof valor === "number" || typeof valor === "boolean") return valor;
  if (typeof valor === "bigint") return valor.toString();
  if (valor instanceof Date) return valor.toISOString();
  if (valor instanceof Error) return describirError(valor, profundidad);
  if (profundidad >= PROFUNDIDAD_MAXIMA) return "[…]";
  if (Array.isArray(valor)) return valor.slice(0, 50).map((v) => limpiarDatos(v, profundidad + 1));
  if (typeof valor === "object") {
    const salida: Record<string, unknown> = {};
    for (const [clave, contenido] of Object.entries(valor)) {
      salida[clave] = CLAVE_SENSIBLE.test(clave) ? OCULTO : limpiarDatos(contenido, profundidad + 1);
    }
    return salida;
  }
  return String(valor);
}

/** Resumen seguro de un error: nombre, mensaje, código y pila, sin secretos. */
export function describirError(error: unknown, profundidad = 0): Record<string, unknown> {
  if (!(error instanceof Error)) return { mensaje: limpiarTexto(String(error)) };
  const extra = error as Error & { code?: unknown; codigo?: unknown; digest?: unknown; meta?: unknown };
  const codigo = extra.codigo ?? extra.code;
  return {
    nombre: error.name,
    mensaje: limpiarTexto(error.message),
    ...(codigo !== undefined ? { codigo: String(codigo) } : {}),
    ...(extra.digest !== undefined ? { digest: String(extra.digest) } : {}),
    ...(extra.meta !== undefined ? { meta: limpiarDatos(extra.meta, profundidad + 1) } : {}),
    ...(error.stack ? { pila: limpiarTexto(error.stack) } : {}),
    ...(error.cause !== undefined && profundidad < 2 ? { causa: describirError(error.cause, profundidad + 1) } : {}),
  };
}

function escribir(nivel: Nivel, contexto: string, mensaje: string, datos?: Record<string, unknown>): void {
  const salida = nivel === "error" ? console.error : nivel === "aviso" ? console.warn : console.log;
  const limpio = datos ? (limpiarDatos(datos) as Record<string, unknown>) : undefined;
  if (process.env.NODE_ENV === "production") {
    salida(JSON.stringify({ hora: new Date().toISOString(), nivel, contexto, mensaje, ...limpio }));
    return;
  }
  const { error, ...resto } = limpio ?? {};
  const detalle = Object.keys(resto).length > 0 ? ` ${JSON.stringify(resto)}` : "";
  salida(`[${contexto}] ${mensaje}${detalle}`);
  if (error && typeof error === "object") {
    const e = error as { pila?: string; mensaje?: string };
    salida(e.pila ?? e.mensaje ?? JSON.stringify(error));
  }
}

/** Registra un error inesperado del servidor. `datos` no debe incluir secretos (igual se filtran). */
export function registrarError(contexto: string, mensaje: string, error: unknown, datos?: Record<string, unknown>): void {
  escribir("error", contexto, mensaje, { ...datos, error: describirError(error) });
}

export function registrarAviso(contexto: string, mensaje: string, datos?: Record<string, unknown>): void {
  escribir("aviso", contexto, mensaje, datos);
}

export function registrarInfo(contexto: string, mensaje: string, datos?: Record<string, unknown>): void {
  escribir("info", contexto, mensaje, datos);
}
