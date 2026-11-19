import type { Metadata } from "next";
import { Truck } from "lucide-react";
import { BarraFiltros, FiltroBusqueda, FiltroSelect } from "@/components/admin/filtros-url";
import { AccionesProveedor, BotonNuevoProveedor } from "@/components/admin/proveedores";
import { BadgeActivo, Card, DataTable, EmptyState, PageHeader, Pagination, type Columna } from "@/components/ui";
import { formatearRut } from "@/lib/chile/rut";
import { formatearNumero } from "@/lib/formato";
import { contextoPagina } from "@/server/auth/sesion";
import { listarProveedoresAdmin, type FilaProveedor } from "@/server/servicios";
import { paginaParam, textoParam } from "@/lib/parametros";

export const metadata: Metadata = { title: "Proveedores" };

const COLUMNAS: Columna<FilaProveedor>[] = [
  {
    clave: "razonSocial",
    encabezado: "Proveedor",
    movil: "titulo",
    celda: (p) => (
      <span className="block min-w-0">
        <span className="block font-medium break-words">{p.razonSocial}</span>
        <span className="cifras block text-xs font-normal text-texto-tenue">{formatearRut(p.rut)}</span>
      </span>
    ),
  },
  {
    clave: "contacto",
    encabezado: "Contacto",
    celda: (p) =>
      p.contacto || p.telefono || p.email ? (
        <span className="block min-w-0">
          {p.contacto ? <span className="block break-words">{p.contacto}</span> : null}
          {p.telefono ? (
            <a
              href={`tel:${p.telefono.replace(/[^\d+]/g, "")}`}
              className="cifras relative z-10 flex items-center whitespace-nowrap text-marca-700 underline-offset-4 hover:underline max-md:min-h-11 pointer-coarse:min-h-11"
            >
              {p.telefono}
            </a>
          ) : null}
          {p.email ? (
            <a
              href={`mailto:${p.email}`}
              aria-label={`Correo electrónico: ${p.email}`}
              className="relative z-10 flex items-center break-all text-marca-700 underline-offset-4 hover:underline max-md:min-h-11 pointer-coarse:min-h-11"
            >
              {p.email}
            </a>
          ) : null}
        </span>
      ) : (
        <span className="text-texto-tenue">—</span>
      ),
  },
  {
    clave: "ingresos",
    encabezado: "Ingresos",
    alinear: "derecha",
    movil: "oculto",
    celda: (p) => <span className="cifras text-texto-suave">{formatearNumero(p.ingresos)}</span>,
  },
  { clave: "estado", encabezado: "Estado", celda: (p) => <BadgeActivo activo={p.activo} /> },
  {
    clave: "acciones",
    encabezado: "Acciones",
    alinear: "derecha",
    movil: "destacado",
    className: "w-16 py-1.5",
    celda: (p) => (
      <AccionesProveedor
        proveedor={{ id: p.id, rut: p.rut, razonSocial: p.razonSocial, contacto: p.contacto, telefono: p.telefono, email: p.email, activo: p.activo }}
      />
    ),
  },
];

const ESTADOS = [
  { value: "activos", label: "Solo activos" },
  { value: "inactivos", label: "Solo inactivos" },
];

export default async function PaginaAdminProveedores({ searchParams }: PageProps<"/admin/proveedores">) {
  const { actor } = await contextoPagina("proveedores:gestionar");
  const sp = await searchParams;
  const texto = textoParam(sp.q) ?? undefined;
  const estado = sp.estado === "activos" || sp.estado === "inactivos" ? sp.estado : undefined;
  const proveedores = await listarProveedoresAdmin(actor, { texto, estado, pagina: paginaParam(sp.pagina) });
  const hayFiltros = Boolean(texto || estado);

  return (
    <>
      <PageHeader
        titulo="Proveedores"
        descripcion="Empresas que abastecen a la red. Se eligen al registrar un ingreso de insumos."
        acciones={<BotonNuevoProveedor />}
      />

      <BarraFiltros parametros={["q", "estado"]}>
        <FiltroBusqueda placeholder="Razón social, RUT o contacto…" />
        <FiltroSelect parametro="estado" etiqueta="Estado" todos="Activos e inactivos" opciones={ESTADOS} />
      </BarraFiltros>

      <Card relleno={false} className="overflow-hidden">
        <DataTable
          titulo="Proveedores"
          columnas={COLUMNAS}
          filas={proveedores.items}
          claveFila={(p) => p.id}
          claseFila={(p) => (p.activo ? undefined : "bg-superficie-2/60 [&_td]:text-texto-suave")}
          vacio={
            hayFiltros ? (
              <EmptyState compacto icono={Truck} titulo="Ningún proveedor coincide" descripcion="Revisa el texto buscado o quita el filtro de estado." />
            ) : (
              <EmptyState
                compacto
                icono={Truck}
                titulo="Aún no hay proveedores"
                descripcion="Agrégalos para dejar registrado de dónde viene cada ingreso."
                accion={<BotonNuevoProveedor />}
              />
            )
          }
        />
      </Card>
      <Pagination {...proveedores} className="mt-4" />
    </>
  );
}
