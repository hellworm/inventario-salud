import type { Metadata } from "next";
import { EnConstruccion } from "@/components/en-construccion";
import { contextoPagina } from "@/server/auth/sesion";

export const metadata: Metadata = { title: "Usuarios" };

export default async function PaginaAdminUsuarios() {
  await contextoPagina("usuarios:gestionar");
  return (
    <EnConstruccion
      titulo="Usuarios"
      descripcion="Cuentas, roles y centros asignados."
    />
  );
}
