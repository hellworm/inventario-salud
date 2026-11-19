import Link from "next/link";
import { Logo } from "@/components/shell/logo";
import { ShellSesion } from "@/components/shell/shell-sesion";
import { obtenerSesion } from "@/server/auth/sesion";

/**
 * Grupo "directo": páginas del área autenticada que NO tienen `loading.tsx`
 * por encima. Así `notFound()` se resuelve antes de que empiece el streaming y
 * la respuesta sale con estado HTTP 404 real (bajo `(app)/loading.tsx` saldría
 * 200). Aquí viven la ficha del insumo y el comodín de rutas inexistentes.
 *
 * Con sesión se muestra el mismo shell que en `(app)`. Sin sesión (solo ocurre
 * con rutas con extensión, que `proxy.ts` no intercepta) se muestra la página
 * tal cual; las páginas reales exigen sesión con `contextoPagina`.
 */
export default async function LayoutDirecto({ children }: LayoutProps<"/">) {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.usuario.debeCambiarPassword) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-8 px-4 py-10">
        <Link href="/" aria-label="RedInsumos, ir al inicio" className="rounded-lg">
          <Logo />
        </Link>
        {children}
      </main>
    );
  }
  return <ShellSesion sesion={sesion}>{children}</ShellSesion>;
}
