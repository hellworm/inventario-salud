import type { Metadata } from "next";
import { EnConstruccion } from "@/components/en-construccion";
import { contextoPagina } from "@/server/auth/sesion";

export const metadata: Metadata = { title: "Movimientos" };

export default async function PaginaMovimientos() {
  await contextoPagina("movimientos:ver");
  return (
    <EnConstruccion
      titulo="Movimientos"
      descripcion="Historial de ingresos, retiros, traslados y ajustes."
    />
  );
}
