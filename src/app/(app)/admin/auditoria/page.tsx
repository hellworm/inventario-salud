import type { Metadata } from "next";
import { EnConstruccion } from "@/components/en-construccion";
import { contextoPagina } from "@/server/auth/sesion";

export const metadata: Metadata = { title: "Auditoría" };

export default async function PaginaAdminAuditoria() {
  await contextoPagina("auditoria:ver");
  return (
    <EnConstruccion
      titulo="Auditoría"
      descripcion="Registro de acciones realizadas en el sistema."
    />
  );
}
