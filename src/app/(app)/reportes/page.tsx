import type { Metadata } from "next";
import { EnConstruccion } from "@/components/en-construccion";
import { contextoPagina } from "@/server/auth/sesion";

export const metadata: Metadata = { title: "Reportes" };

export default async function PaginaReportes() {
  await contextoPagina("reportes:ver");
  return (
    <EnConstruccion
      titulo="Reportes"
      descripcion="Consumo, valorización y vencimientos por período."
    />
  );
}
