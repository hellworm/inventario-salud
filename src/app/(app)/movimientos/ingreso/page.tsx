import type { Metadata } from "next";
import { EnConstruccion } from "@/components/en-construccion";
import { contextoPagina } from "@/server/auth/sesion";

export const metadata: Metadata = { title: "Registrar ingreso" };

export default async function PaginaIngreso() {
  await contextoPagina("movimientos:ingreso");
  return (
    <EnConstruccion
      titulo="Registrar ingreso"
      descripcion="Recepción de insumos por lote, con guía o factura."
      volver={{ href: "/movimientos", label: "Movimientos" }}
    />
  );
}
