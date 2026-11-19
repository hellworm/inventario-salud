import type { Metadata } from "next";
import { EnConstruccion } from "@/components/en-construccion";
import { contextoPagina } from "@/server/auth/sesion";

export const metadata: Metadata = { title: "Registrar traslado" };

export default async function PaginaTraslado() {
  await contextoPagina("movimientos:traslado");
  return (
    <EnConstruccion
      titulo="Registrar traslado"
      descripcion="Mueve stock entre ubicaciones o entre centros de la red."
      volver={{ href: "/movimientos", label: "Movimientos" }}
    />
  );
}
