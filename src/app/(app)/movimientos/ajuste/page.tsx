import type { Metadata } from "next";
import { EnConstruccion } from "@/components/en-construccion";
import { contextoPagina } from "@/server/auth/sesion";

export const metadata: Metadata = { title: "Ajuste o merma" };

export default async function PaginaAjuste() {
  await contextoPagina("movimientos:ajuste");
  return (
    <EnConstruccion
      titulo="Ajuste o merma"
      descripcion="Corrige diferencias de inventario o da de baja stock vencido o dañado."
      volver={{ href: "/movimientos", label: "Movimientos" }}
    />
  );
}
