import type { Metadata } from "next";
import Link from "next/link";
import { CalendarOff, PackagePlus, PackageSearch, Snowflake } from "lucide-react";
import { FiltroSelect, LimpiarFiltros } from "@/components/admin/filtros-url";
import {
  Badge,
  BadgeActivo,
  buttonClasses,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  Pagination,
  SearchInput,
  type Columna,
} from "@/components/ui";
import { pluralizar } from "@/lib/formato";
import { contextoPagina } from "@/server/auth/sesion";
import { listarCategorias, listarInsumosAdmin, type FilaInsumoAdmin } from "@/server/servicios";

export const metadata: Metadata = { title: "Insumos" };

const COLUMNAS: Columna<FilaInsumoAdmin>[] = [
  {
    clave: "nombre",
    encabezado: "Insumo",
    movil: "titulo",
    celda: (i) => (
      <span className="block min-w-0">
        <span className="block truncate font-medium">{i.nombre}</span>
        <span className="cifras block truncate text-xs font-normal text-texto-tenue">
          {i.codigo}
          {i.presentacion ? ` · ${i.presentacion}` : ""}
        </span>
      </span>
    ),
  },
  { clave: "categoria", encabezado: "Categoría", celda: (i) => i.categoria },
  { clave: "unidad", encabezado: "Unidad", movil: "oculto", celda: (i) => <span className="capitalize">{i.unidadMedida}</span> },
  {
    clave: "manejo",
    encabezado: "Manejo",
    movil: "oculto",
    celda: (i) => (
      <span className="flex flex-wrap gap-1.5">
        {i.requiereCadenaFrio ? (
          <Badge tono="info" icono={Snowflake}>
            Cadena de frío
          </Badge>
        ) : null}
        {!i.controlaVencimiento ? (
          <Badge tono="neutro" icono={CalendarOff}>
            Sin vencimiento
          </Badge>
        ) : null}
        {!i.requiereCadenaFrio && i.controlaVencimiento ? <span className="text-texto-tenue">—</span> : null}
      </span>
    ),
  },
  {
    clave: "parametros",
    encabezado: "Mínimos definidos",
    celda: (i) =>
      i.centrosConParametro > 0 ? (
        <span className="cifras">{pluralizar(i.centrosConParametro, "centro")}</span>
      ) : (
        <span className="text-texto-tenue">Sin definir</span>
      ),
  },
  { clave: "estado", encabezado: "Estado", movil: "destacado", celda: (i) => <BadgeActivo activo={i.activo} /> },
];

const ESTADOS = [
  { value: "activos", label: "Solo activos" },
  { value: "inactivos", label: "Solo inactivos" },
];

export default async function PaginaAdminInsumos({ searchParams }: PageProps<"/admin/insumos">) {
  const { actor } = await contextoPagina("catalogo:gestionar");
  const sp = await searchParams;
  const texto = typeof sp.q === "string" ? sp.q : undefined;
  const categoriaId = typeof sp.categoria === "string" ? sp.categoria : undefined;
  const estado = sp.estado === "activos" || sp.estado === "inactivos" ? sp.estado : undefined;
  const [insumos, categorias] = await Promise.all([
    listarInsumosAdmin(actor, { texto, categoriaId, estado, pagina: Number(sp.pagina) || 1 }),
    listarCategorias(actor),
  ]);
  const hayFiltros = Boolean(texto || categoriaId || estado);

  return (
    <>
      <PageHeader
        titulo="Insumos"
        descripcion="Catálogo común a toda la red. Aquí defines qué insumos existen y sus mínimos por centro."
        acciones={
          <Link href="/admin/insumos/nuevo" className={buttonClasses()}>
            <PackagePlus aria-hidden />
            Nuevo insumo
          </Link>
        }
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <SearchInput placeholder="Buscar por nombre, código o fabricante…" label="Buscar insumo" className="md:max-w-md md:flex-1" />
        <div className="grid grid-cols-2 gap-3 md:flex">
          <FiltroSelect
            parametro="categoria"
            label="Filtrar por categoría"
            todos="Todas las categorías"
            opciones={categorias.map((c) => ({ value: c.id, label: c.nombre }))}
            className="md:w-56"
          />
          <FiltroSelect parametro="estado" label="Filtrar por estado" todos="Activos e inactivos" opciones={ESTADOS} className="md:w-48" />
        </div>
        <LimpiarFiltros parametros={["categoria", "estado"]} />
      </div>

      <Card relleno={false} className="overflow-hidden">
        <DataTable
          titulo="Catálogo de insumos"
          columnas={COLUMNAS}
          filas={insumos.items}
          claveFila={(i) => i.id}
          hrefFila={(i) => `/admin/insumos/${i.id}`}
          claseFila={(i) => (i.activo ? undefined : "bg-superficie-2/60 [&_td]:text-texto-suave")}
          vacio={
            hayFiltros ? (
              <EmptyState
                compacto
                icono={PackageSearch}
                titulo="Ningún insumo coincide"
                descripcion="Prueba con otro nombre o código, o quita los filtros."
              />
            ) : (
              <EmptyState
                compacto
                icono={PackagePlus}
                titulo="El catálogo está vacío"
                descripcion="Crea el primer insumo para empezar a registrar stock."
                accion={
                  <Link href="/admin/insumos/nuevo" className={buttonClasses()}>
                    Nuevo insumo
                  </Link>
                }
              />
            )
          }
        />
      </Card>
      <Pagination {...insumos} className="mt-4" />
    </>
  );
}
