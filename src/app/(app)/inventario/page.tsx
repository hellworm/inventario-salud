import type { Metadata } from "next";
import { EnConstruccion } from "@/components/en-construccion";
import { contextoPagina } from "@/server/auth/sesion";

export const metadata: Metadata = { title: "Inventario" };

export default async function PaginaInventario() {
  await contextoPagina("inventario:ver");
  return (
    <EnConstruccion
      titulo="Inventario"
      descripcion="Existencias por insumo, lote y ubicación del centro activo."
    />
  );
}
