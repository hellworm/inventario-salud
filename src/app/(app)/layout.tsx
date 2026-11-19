import { cookies } from "next/headers";
import { AppShell } from "@/components/shell/app-shell";
import { COOKIE_SIDEBAR } from "@/server/auth/constantes";
import { obtenerCentroActivo, requerirSesion } from "@/server/auth/sesion";

/**
 * Layout de toda el área autenticada. Valida la sesión contra la BD en cada
 * solicitud; cada página exige además su propio permiso con `contextoPagina`.
 */
export default async function LayoutApp({ children }: LayoutProps<"/">) {
  const sesion = await requerirSesion();
  const [centroActivo, almacen] = await Promise.all([obtenerCentroActivo(sesion), cookies()]);

  return (
    <AppShell
      usuario={{ nombre: sesion.usuario.nombre, email: sesion.usuario.email, rol: sesion.usuario.rol }}
      centros={centroActivo.centros}
      centroActivoId={centroActivo.centroId}
      puedeVerTodaLaRed={centroActivo.puedeVerTodaLaRed}
      sidebarColapsadaInicial={almacen.get(COOKIE_SIDEBAR)?.value === "1"}
    >
      {children}
    </AppShell>
  );
}
