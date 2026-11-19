import type { Metadata } from "next";
import Link from "next/link";
import { Tags } from "lucide-react";
import { FormularioInsumo } from "@/components/admin/formulario-insumo";
import { Alert, buttonClasses, Card, EmptyState, PageHeader } from "@/components/ui";
import { RE_CODIGO_BARRAS } from "@/lib/esquemas/catalogo";
import { textoParam } from "@/lib/parametros";
import { puede } from "@/lib/permisos";
import { contextoPagina } from "@/server/auth/sesion";
import { listarCategorias } from "@/server/servicios";

export const metadata: Metadata = { title: "Nuevo insumo" };

export default async function PaginaNuevoInsumo({ searchParams }: PageProps<"/admin/insumos/nuevo">) {
  const { actor } = await contextoPagina("catalogo:crear");
  const puedeModificar = puede(actor.rol, "catalogo:gestionar");
  // `?codigoBarras=`: llega desde el escáner ("crear el insumo con este código").
  const codigoPedido = textoParam((await searchParams).codigoBarras);
  const codigoBarrasInicial = codigoPedido && codigoPedido.length <= 64 && RE_CODIGO_BARRAS.test(codigoPedido) ? codigoPedido : undefined;
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
        <>
          {!puedeModificar ? (
            <Alert tono="info" titulo="El insumo quedará compartido con toda la red" className="mb-4">
              Antes de crearlo, busca en el catálogo que no exista ya. Una vez creado lo usan todas las instituciones: revisa bien
              los datos, porque después solo el administrador de la red puede modificarlo o desactivarlo.
            </Alert>
          ) : null}
          <Card className="sm:p-6">
            <FormularioInsumo categorias={categorias} codigoBarrasInicial={codigoBarrasInicial} />
          </Card>
        </>
      )}
    </>
  );
}
