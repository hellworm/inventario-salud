import type { Metadata } from "next";
import { EnConstruccion } from "@/components/en-construccion";
import { contextoPagina } from "@/server/auth/sesion";

export const metadata: Metadata = { title: "Categorías" };

export default async function PaginaAdminCategorias() {
  await contextoPagina("catalogo:gestionar");
  return (
    <EnConstruccion
      titulo="Categorías"
      descripcion="Agrupan los insumos del catálogo."
    />
  );
}
