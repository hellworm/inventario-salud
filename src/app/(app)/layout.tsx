import { ShellSesion } from "@/components/shell/shell-sesion";
import { requerirSesion } from "@/server/auth/sesion";

/**
 * Layout de toda el área autenticada. Valida la sesión contra la BD en cada
 * solicitud; cada página exige además su propio permiso con `contextoPagina`.
 */
export default async function LayoutApp({ children }: LayoutProps<"/">) {
  const sesion = await requerirSesion();
  return <ShellSesion sesion={sesion}>{children}</ShellSesion>;
}
