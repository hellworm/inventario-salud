import type { Metadata } from "next";
import { Boxes } from "lucide-react";
import { FiltroSelect } from "@/components/alertas/filtro-select";
import { BotonExportar, CeldaInsumo, Cifras, FiltroCentro, NavReportes } from "@/components/reportes/piezas";
import { Card, DataTable, EmptyState, PageHeader, Pagination, SearchInput, type Columna } from "@/components/ui";
import { formatearDia } from "@/lib/fechas";
import { leerFiltros } from "@/lib/filtros-reportes";
import { formatearCLP, formatearNumero, pluralizar } from "@/lib/formato";
import { construirHref, resolverCentro } from "@/lib/parametros-url";
import { contextoPagina } from "@/server/auth/sesion";
import { listarCategorias, reporteExistencias, type FilaExistencia } from "@/server/servicios";

export const metadata: Metadata = { title: "Reporte de existencias" };

function columnas(mostrarCentro: boolean): Columna<FilaExistencia>[] {
  return [
    {
      clave: "insumo",
      encabezado: "Insumo",
      movil: "titulo",
      celda: (f) => <CeldaInsumo nombre={f.nombre} codigo={f.codigo} extra={f.categoria} />,
    },
    {
      clave: "ubicacion",
      encabezado: mostrarCentro ? "Centro y ubicación" : "Ubicación",
      celda: (f) => (mostrarCentro ? `${f.centro} · ${f.ubicacion}` : f.ubicacion),
    },
    { clave: "lote", encabezado: "Lote", celda: (f) => <span className="cifras whitespace-nowrap">{f.numeroLote}</span> },
    {
      clave: "vencimiento",
      encabezado: "Vencimiento",
      celda: (f) =>
        f.fechaVencimiento ? (
          <span className={f.diasParaVencer !== null && f.diasParaVencer < 0 ? "cifras font-medium text-peligro-700" : "cifras"}>
            {formatearDia(f.fechaVencimiento)}
            {f.diasParaVencer !== null && f.diasParaVencer < 0 ? " (vencido)" : ""}
          </span>
        ) : (
          <span className="text-texto-tenue">Sin vencimiento</span>
        ),
    },
    {
      clave: "cantidad",
      encabezado: "Cantidad",
      alinear: "derecha",
      movil: "destacado",
      celda: (f) => (
        <span className="cifras whitespace-nowrap font-semibold">
          {formatearNumero(f.cantidad)} <span className="font-normal text-texto-tenue">{f.unidadMedida}</span>
        </span>
      ),
    },
    {
      clave: "costo",
      encabezado: "Costo unitario",
      alinear: "derecha",
      movil: "oculto",
      celda: (f) =>
        f.costoUnitario === null ? (
          <span className="text-texto-tenue">Sin costo</span>
        ) : (
          <span className="cifras">{formatearCLP(f.costoUnitario)}</span>
        ),
    },
    {
      clave: "valor",
      encabezado: "Valor",
      alinear: "derecha",
      celda: (f) => (f.valor === null ? <span className="text-texto-tenue">—</span> : <span className="cifras">{formatearCLP(f.valor)}</span>),
    },
  ];
}

export default async function PaginaReporteExistencias({ searchParams }: PageProps<"/reportes/existencias">) {
  const { actor, centroId: centroActivoId, centro, centros } = await contextoPagina("reportes:ver");
  const f = leerFiltros(await searchParams);
  const centroId = resolverCentro(centroActivoId, centros, f.centro);
  const [reporte, categorias] = await Promise.all([
    reporteExistencias(actor, { centroId, categoriaId: f.categoriaId, texto: f.texto, pagina: f.pagina }),
    listarCategorias(actor),
  ]);
  const { totales } = reporte;
  const alcance = centro?.nombre ?? centros.find((c) => c.id === centroId)?.nombre ?? "Toda la red";

  return (
    <>
      <PageHeader
        titulo="Existencias"
        descripcion={<>{alcance} · Stock actual por centro, ubicación y lote, valorizado al costo de ingreso.</>}
        volver={{ href: "/reportes", label: "Reportes" }}
        acciones={
          <BotonExportar href={construirHref("/reportes/exportar/existencias", { centro: centroId, categoria: f.categoriaId, q: f.texto })} />
        }
      />
      <NavReportes activo="existencias" />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:flex">
        <SearchInput placeholder="Buscar insumo, código o lote…" label="Buscar en existencias" className="sm:col-span-2 lg:w-80" />
        <FiltroSelect
          parametro="categoria"
          etiqueta="Categoría"
          todos="Todas las categorías"
          opciones={categorias.map((c) => ({ value: c.id, label: c.nombre }))}
          className="lg:w-64"
        />
        <FiltroCentro centroActivoId={centroActivoId} centros={centros} className="lg:w-64" />
      </div>

      <Cifras
        cifras={[
          { etiqueta: "Valor del inventario", valor: formatearCLP(totales.valor), detalle: "Costo promedio de ingreso por lote" },
          { etiqueta: "Unidades", valor: formatearNumero(totales.unidades), detalle: "Incluye lotes vencidos" },
          { etiqueta: "Lotes por ubicación", valor: formatearNumero(totales.filas), detalle: "Filas del reporte" },
          {
            etiqueta: "Sin costo registrado",
            valor: formatearNumero(totales.filasSinCosto),
            detalle: totales.filasSinCosto === 0 ? "Todo está valorizado" : `${pluralizar(totales.filasSinCosto, "fila")} no suman al valor`,
          },
        ]}
      />

      <Card relleno={false} className="overflow-hidden">
        <DataTable
          titulo="Existencias por centro, ubicación y lote"
          columnas={columnas(centroId === null && centros.length > 1)}
          filas={reporte.items}
          claveFila={(x) => x.existenciaId}
          hrefFila={(x) => `/inventario/${x.insumoId}`}
          vacio={
            <EmptyState
              compacto
              icono={Boxes}
              titulo="Sin existencias"
              descripcion="No hay stock que coincida con los filtros aplicados."
            />
          }
        />
      </Card>
      <Pagination {...reporte} className="mt-4" />
    </>
  );
}
