import type { Metadata } from "next";
import { EnConstruccion } from "@/components/en-construccion";
import { contextoPagina } from "@/server/auth/sesion";

export const metadata: Metadata = { title: "Registrar retiro" };

export default async function PaginaRetiro() {
  await contextoPagina("movimientos:retiro");
  return (
    <EnConstruccion
      titulo="Registrar retiro"
      descripcion="Salida de insumos para uso; por defecto sale primero lo que vence antes."
      volver={{ href: "/movimientos", label: "Movimientos" }}
    />
  );
}
