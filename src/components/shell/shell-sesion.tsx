import type * as React from "react";
import { cookies } from "next/headers";
import { COOKIE_SIDEBAR } from "@/server/auth/constantes";
import { obtenerCentroActivo, type Sesion } from "@/server/auth/sesion";
import { AppShell } from "./app-shell";

/** Shell de la aplicación (menú, selector de centro, usuario) para una sesión ya validada. */
export async function ShellSesion({ sesion, children }: { sesion: Sesion; children: React.ReactNode }) {
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
