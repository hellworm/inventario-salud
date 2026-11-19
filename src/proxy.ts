import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, opcionesCookieSesion } from "@/server/auth/constantes";

/**
 * Proxy (ex "middleware") de Next 16. Hace solo comprobaciones optimistas y
 * baratas, SIN consultar la base de datos:
 *  - sin cookie de sesión → redirige a /login (conservando el destino);
 *  - con cookie → renueva su vigencia en el navegador (expiración deslizante).
 *
 * La validación real de la sesión (BD) y de los permisos ocurre en los
 * layouts, páginas, acciones y servicios.
 */

const RUTAS_PUBLICAS = ["/login", "/api/salud"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(COOKIE_SESION)?.value;
  const esPublica = RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(`${r}/`));

  if (!token && !esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("destino", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  const respuesta = NextResponse.next();
  // No se renueva en prefetch ni en Server Actions (que pueden borrar la cookie al salir).
  const esNavegacion =
    request.method === "GET" && !request.headers.has("next-router-prefetch") && !request.headers.has("next-action");
  if (token && esNavegacion) {
    respuesta.cookies.set(COOKIE_SESION, token, opcionesCookieSesion());
  }
  return respuesta;
}

export const config = {
  // Todo excepto estáticos de Next y archivos con extensión.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.[\\w]+$).*)"],
};
