import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, LogOut } from "lucide-react";
import { cerrarSesionAccion } from "@/acciones/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requerirSesion } from "@/server/auth/sesion";
import { FormularioPassword } from "./formulario-password";

export const metadata: Metadata = { title: "Cambiar contraseña" };

export default async function PaginaCambiarPassword() {
  const sesion = await requerirSesion({ permitirCambioPendiente: true });
  const obligatorio = sesion.usuario.debeCambiarPassword;

  return (
    <>
      {!obligatorio ? (
        <Link
          href="/panel"
          className="-ml-1 mb-2 flex min-h-11 w-fit items-center gap-0.5 rounded-md pr-3 text-sm font-medium text-texto-suave hover:text-marca-700"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Volver al panel
        </Link>
      ) : null}
      <h1 className="text-2xl font-semibold tracking-tight text-texto sm:text-[1.75rem]">
        {obligatorio ? "Crea tu contraseña" : "Cambiar contraseña"}
      </h1>
      <p className="mt-1.5 mb-6 text-[0.9375rem] text-texto-suave">
        Sesión de <span className="font-medium text-texto">{sesion.usuario.email}</span>
      </p>
      {obligatorio ? (
        <Alert tono="info" className="mb-6" titulo="Es tu primer ingreso">
          Por seguridad debes reemplazar la contraseña temporal antes de continuar.
        </Alert>
      ) : null}
      <FormularioPassword />
      {obligatorio ? (
        <form action={cerrarSesionAccion} className="mt-4">
          <Button type="submit" variant="fantasma" bloque>
            <LogOut aria-hidden />
            Salir
          </Button>
        </form>
      ) : null}
    </>
  );
}
