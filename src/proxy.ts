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
 *    detectarla (`descartarCookieSesionInvalida`).
 *
 * La validación real de la sesión (BD) y de los permisos ocurre en los
 * layouts, páginas, acciones y servicios.
 */

const RUTAS_PUBLICAS = ["/login", "/api/salud"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const cookie = request.cookies.get(COOKIE_SESION)?.value;
  const token = cookie && PATRON_TOKEN_SESION.test(cookie) ? cookie : undefined;
  const cookieMalFormada = cookie !== undefined && token === undefined;
  const esPublica = RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(`${r}/`));

  let respuesta: NextResponse;
  if (!token && !esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("destino", `${pathname}${search}`);
    respuesta = NextResponse.redirect(url);
  } else {
    respuesta = NextResponse.next();
  }
  if (cookieMalFormada) respuesta.cookies.delete(COOKIE_SESION);
  return respuesta;
}

export const config = {
  // Todo excepto estáticos de Next y archivos con extensión.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.[\\w]+$).*)"],
};
