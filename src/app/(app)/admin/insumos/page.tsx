import type { Metadata } from "next";
import Link from "next/link";
import { CalendarOff, PackagePlus, PackageSearch, Snowflake } from "lucide-react";
import { BarraFiltros, FiltroBusqueda, FiltroSelect } from "@/components/admin/filtros-url";
import {
  Badge,
  BadgeActivo,
  buttonClasses,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  Pagination,
  type Columna,
} from "@/components/ui";
import { DosLineas } from "@/components/reportes/piezas";
import { pluralizar } from "@/lib/formato";
import { AvisoCatalogoCompartido } from "@/components/admin/aviso-catalogo-compartido";
import { puede } from "@/lib/permisos";
import { contextoPagina } from "@/server/auth/sesion";
import { listarCategorias, listarInsumosAdmin, type FilaInsumoAdmin } from "@/server/servicios";
import { paginaParam, textoParam } from "@/lib/parametros";

export const metadata: Metadata = { title: "Insumos" };

const COLUMNAS: Columna<FilaInsumoAdmin>[] = [
  {
    clave: "nombre",
    encabezado: "Insumo",
    movil: "titulo",
    className: "md:w-[34%]",
    celda: (i) => (
      <DosLineas
        principal={<span className="font-medium">{i.nombre}</span>}
        secundario={`${i.codigo}${i.presentacion ? ` · ${i.presentacion}` : ""}`}
      />
    ),
  },
  {
    clave: "categoria",
    encabezado: "Categoría y unidad",
    celda: (i) => <DosLineas principal={i.categoria} secundario={`Se cuenta por ${i.unidadMedida}`} />,
  },
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
    encabezado: "Mínimos",
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
  const { actor } = await contextoPagina("catalogo:crear");
  const puedeModificar = puede(actor.rol, "catalogo:gestionar");
  const sp = await searchParams;
  const texto = textoParam(sp.q) ?? undefined;
  const categoriaId = textoParam(sp.categoria) ?? undefined;
  const estado = sp.estado === "activos" || sp.estado === "inactivos" ? sp.estado : undefined;
  const [insumos, categorias] = await Promise.all([
    listarInsumosAdmin(actor, { texto, categoriaId, estado, pagina: paginaParam(sp.pagina) }),
    listarCategorias(actor),
  ]);
  const hayFiltros = Boolean(texto || categoriaId || estado);

  return (
    <>
      <PageHeader
        titulo="Insumos"
        descripcion={
          puedeModificar
            ? "Catálogo común a toda la red. Aquí defines qué insumos existen y sus mínimos por centro."
            : "Catálogo compartido por toda la red. Puedes crear insumos nuevos y definir los mínimos y máximos de tus centros."
        }
        acciones={
          <Link href="/admin/insumos/nuevo" className={buttonClasses()}>
            <PackagePlus aria-hidden />
            Nuevo insumo
          </Link>
        }
      />

      {!puedeModificar ? <AvisoCatalogoCompartido que="insumos" className="mb-4" /> : null}

      <BarraFiltros parametros={["q", "categoria", "estado"]}>
        <FiltroBusqueda placeholder="Nombre, código o fabricante…" />
        <FiltroSelect
          parametro="categoria"
          etiqueta="Categoría"
          todos="Todas"
          opciones={categorias.map((c) => ({ value: c.id, label: c.nombre }))}
        />
        <FiltroSelect parametro="estado" etiqueta="Estado" todos="Activos e inactivos" opciones={ESTADOS} />
      </BarraFiltros>

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
