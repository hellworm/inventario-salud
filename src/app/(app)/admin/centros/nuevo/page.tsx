import type { Metadata } from "next";
import { FormularioCentro } from "@/components/admin/formulario-centro";
import { Card, PageHeader } from "@/components/ui";
import { contextoPagina } from "@/server/auth/sesion";

export const metadata: Metadata = { title: "Nuevo centro" };

export default async function PaginaNuevoCentro() {
  await contextoPagina("centros:gestionar");
  return (
    <>
      <PageHeader
        titulo="Nuevo centro"
        descripcion="Se crea con una «Bodega principal» para que puedas registrar stock de inmediato. Después puedes agregar más ubicaciones."
        volver={{ href: "/admin/centros", label: "Centros y ubicaciones" }}
      />
      <Card className="max-w-3xl sm:p-6">
        <FormularioCentro />
      </Card>
    </>
  );
}
