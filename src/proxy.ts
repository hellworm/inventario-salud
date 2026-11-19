import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, PATRON_TOKEN_SESION } from "@/server/auth/constantes";

/**
 * Proxy (ex "middleware") de Next 16. Hace solo comprobaciones optimistas y
 * baratas, SIN consultar la base de datos:
 *  - sin cookie de sesión (o con una mal formada) → redirige a /login
 *    conservando el destino, y borra la cookie mal formada;
 *  - NO renueva la cookie: dura lo mismo que la vida máxima de la sesión y la
 *    inactividad se controla en el servidor (BD). Una cookie con un token que
 *    ya no vale nunca se prolonga; además, las Server Actions la borran al
 *    detectarla (`descartarCookieSesionInvalida`);
 *  - las Server Actions (cabecera `next-action`) NO se redirigen: un 307 a
 *    /login haría que el formulario viera un error de red. Pasan al servidor,
 *    donde `accionSegura` responde `NO_AUTENTICADO` y el cliente avisa "Tu
 *    sesión venció" y lleva al login (`useAccion`);
 *  - genera la Content-Security-Policy con un nonce por solicitud.
 *
 * La validación real de la sesión (BD) y de los permisos ocurre en los
 * layouts, páginas, acciones y servicios.
 */

const RUTAS_PUBLICAS = ["/login", "/api/salud"];

const esDesarrollo = process.env.NODE_ENV !== "production";

/**
 * CSP con nonce por solicitud. `script-src` NO lleva 'unsafe-inline': solo
 * corren los scripts que Next marca con el nonce (lo toma de esta misma
 * cabecera en la solicitud) y los que ellos cargan ('strict-dynamic'). Por eso
 * todas las páginas deben renderizarse por solicitud (ver `src/app/layout.tsx`).
 * `style-src` conserva 'unsafe-inline': React y Radix escriben estilos en línea.
 *
 * Las respuestas que no pasan por el proxy (archivos estáticos) reciben la CSP
 * fija de `next.config.ts`.
 */
export function construirCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${esDesarrollo ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${esDesarrollo ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const cookie = request.cookies.get(COOKIE_SESION)?.value;
  const token = cookie && PATRON_TOKEN_SESION.test(cookie) ? cookie : undefined;
  const cookieMalFormada = cookie !== undefined && token === undefined;
  const esPublica = RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(`${r}/`));

  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString("base64");
  const csp = construirCsp(nonce);

  // Las Server Actions validan la sesión por sí mismas y responden un resultado legible.
  const esAccion = request.method === "POST" && request.headers.has("next-action");

  let respuesta: NextResponse;
  if (!token && !esPublica && !esAccion) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("destino", `${pathname}${search}`);
    respuesta = NextResponse.redirect(url);
  } else {
    // Next lee el nonce de la CSP de la SOLICITUD para marcar sus scripts.
    const cabeceras = new Headers(request.headers);
    cabeceras.set("x-nonce", nonce);
    cabeceras.set("Content-Security-Policy", csp);
    respuesta = NextResponse.next({ request: { headers: cabeceras } });
  }
  respuesta.headers.set("Content-Security-Policy", csp);
  if (cookieMalFormada) respuesta.cookies.delete(COOKIE_SESION);
  return respuesta;
}

export const config = {
  // Todo excepto estáticos de Next y archivos con extensión.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.[\\w]+$).*)"],
};
