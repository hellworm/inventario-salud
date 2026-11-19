import type { Metadata } from "next";
import { EnConstruccion } from "@/components/en-construccion";
import { contextoPagina } from "@/server/auth/sesion";

export const metadata: Metadata = { title: "Detalle de insumo" };

export default async function PaginaDetalleInsumo() {
  await contextoPagina("inventario:ver");
  return (
    <EnConstruccion
      titulo="Detalle de insumo"
      descripcion="Existencias por lote y ubicación, y movimientos recientes."
      volver={{ href: "/inventario", label: "Inventario" }}
    />
  );
}
