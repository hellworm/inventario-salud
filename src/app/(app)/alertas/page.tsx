import type { Metadata } from "next";
import { EnConstruccion } from "@/components/en-construccion";
import { contextoPagina } from "@/server/auth/sesion";

export const metadata: Metadata = { title: "Alertas" };

export default async function PaginaAlertas() {
  await contextoPagina("alertas:ver");
  return (
    <EnConstruccion
      titulo="Alertas"
      descripcion="Insumos sin stock, bajo el mínimo, por vencer y vencidos."
    />
  );
}
