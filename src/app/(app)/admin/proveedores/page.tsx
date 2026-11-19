import type { Metadata } from "next";
import { EnConstruccion } from "@/components/en-construccion";
import { contextoPagina } from "@/server/auth/sesion";

export const metadata: Metadata = { title: "Proveedores" };

export default async function PaginaAdminProveedores() {
  await contextoPagina("proveedores:gestionar");
  return (
    <EnConstruccion
      titulo="Proveedores"
      descripcion="Proveedores de insumos de la red."
    />
  );
}
