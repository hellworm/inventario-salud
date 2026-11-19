import type { Metadata } from "next";
import { EnConstruccion } from "@/components/en-construccion";
import { contextoPagina } from "@/server/auth/sesion";

export const metadata: Metadata = { title: "Centros y ubicaciones" };

export default async function PaginaAdminCentros() {
  await contextoPagina("centros:gestionar");
  return (
    <EnConstruccion
      titulo="Centros y ubicaciones"
      descripcion="Centros de la red y sus bodegas, salas y refrigeradores."
    />
  );
}
