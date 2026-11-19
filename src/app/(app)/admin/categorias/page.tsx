import type { Metadata } from "next";
import Link from "next/link";
import { Tags } from "lucide-react";
import { AccionesCategoria, BotonNuevaCategoria } from "@/components/admin/categorias";
import { Card, DataTable, EmptyState, PageHeader, type Columna } from "@/components/ui";
import { pluralizar } from "@/lib/formato";
import { contextoPagina } from "@/server/auth/sesion";
import { listarCategoriasAdmin, type FilaCategoria } from "@/server/servicios";

export const metadata: Metadata = { title: "Categorías" };

const COLUMNAS: Columna<FilaCategoria>[] = [
  { clave: "nombre", encabezado: "Categoría", movil: "titulo", celda: (c) => <span className="font-medium">{c.nombre}</span> },
  {
    clave: "insumos",
    encabezado: "Insumos",
    celda: (c) =>
      c.insumos === 0 ? (
        <span className="text-texto-tenue">Sin insumos</span>
      ) : (
        <Link
          href={`/admin/insumos?categoria=${c.id}`}
          className="cifras font-medium text-marca-700 underline-offset-4 hover:underline"
        >
          {pluralizar(c.insumos, "insumo")}
        </Link>
      ),
  },
  {
    clave: "inactivos",
    encabezado: "Inactivos",
    movil: "oculto",
    celda: (c) =>
      c.insumos - c.insumosActivos > 0 ? (
        <span className="cifras text-texto-suave">{c.insumos - c.insumosActivos}</span>
      ) : (
        <span className="text-texto-tenue">—</span>
      ),
  },
  {
    clave: "acciones",
    encabezado: "Acciones",
    alinear: "derecha",
    movil: "destacado",
    className: "w-28 py-1.5",
    celda: (c) => <AccionesCategoria categoria={{ id: c.id, nombre: c.nombre }} insumos={c.insumos} />,
  },
];

export default async function PaginaAdminCategorias() {
  const { actor } = await contextoPagina("catalogo:gestionar");
  const categorias = await listarCategoriasAdmin(actor);

  return (
    <>
      <PageHeader
        titulo="Categorías"
        descripcion="Agrupan los insumos del catálogo. Una categoría solo se puede eliminar cuando no tiene insumos."
        acciones={<BotonNuevaCategoria />}
      />
      <Card relleno={false} className="max-w-3xl overflow-hidden">
        <DataTable
          titulo="Categorías"
          columnas={COLUMNAS}
          filas={categorias}
          claveFila={(c) => c.id}
          vacio={
            <EmptyState
              compacto
              icono={Tags}
              titulo="Aún no hay categorías"
              descripcion="Crea la primera para poder agregar insumos al catálogo."
              accion={<BotonNuevaCategoria />}
            />
          }
        />
      </Card>
    </>
  );
}
