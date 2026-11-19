import type { Metadata } from "next";
import { EnConstruccion } from "@/components/en-construccion";
import { contextoPagina } from "@/server/auth/sesion";

export const metadata: Metadata = { title: "Insumos" };

export default async function PaginaAdminInsumos() {
  await contextoPagina("catalogo:gestionar");
  return (
    <EnConstruccion
      titulo="Insumos"
      descripcion="Catálogo común a toda la red."
    />
  );
}
