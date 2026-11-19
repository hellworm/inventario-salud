import type { Metadata } from "next";
import Link from "next/link";
import { Tags } from "lucide-react";
import { FormularioInsumo } from "@/components/admin/formulario-insumo";
import { buttonClasses, Card, EmptyState, PageHeader } from "@/components/ui";
import { contextoPagina } from "@/server/auth/sesion";
import { listarCategorias } from "@/server/servicios";

export const metadata: Metadata = { title: "Nuevo insumo" };

export default async function PaginaNuevoInsumo() {
  const { actor } = await contextoPagina("catalogo:gestionar");
  const categorias = await listarCategorias(actor);

  return (
    <>
      <PageHeader
        titulo="Nuevo insumo"
        descripcion="Se agrega al catálogo común: quedará disponible para todos los centros."
        volver={{ href: "/admin/insumos", label: "Insumos" }}
      />
      {categorias.length === 0 ? (
        <EmptyState
          icono={Tags}
          titulo="Primero crea una categoría"
          descripcion="Cada insumo pertenece a una categoría (p. ej. Diálisis, Curación, Protección personal)."
          accion={
            <Link href="/admin/categorias" className={buttonClasses()}>
              Ir a categorías
            </Link>
          }
        />
      ) : (
        <Card className="sm:p-6">
          <FormularioInsumo categorias={categorias} />
        </Card>
      )}
    </>
  );
}
