import type { Metadata } from "next";
import { Boxes } from "lucide-react";
import { BarraFiltros, FiltroBusqueda, FiltroCentro, FiltroSelect } from "@/components/admin/filtros-url";
import {
  AccionesReporte,
  CantidadUnidad,
  CeldaInsumo,
  Cifras,
  DosLineas,
  CLASE_ENCABEZADO_IMPRIMIBLE,
  NavReportes,
  VistaReporte,
} from "@/components/reportes/piezas";
import { BadgeEstadoVencimiento, Card, DataTable, EmptyState, LeyendaSemaforo, PageHeader, Pagination, type Columna } from "@/components/ui";
import { escribirSemaforo, OPCIONES_FILTRO_SEMAFORO } from "@/lib/estados";
import { formatearDia, formatearFechaHora, hoyEnSantiago } from "@/lib/fechas";
import { leerFiltros } from "@/lib/filtros-reportes";
import { formatearCLP, formatearNumero, pluralizar } from "@/lib/formato";
import { construirHref, resolverCentro } from "@/lib/parametros-url";
import { etiquetaAlcanceTotal } from "@/lib/permisos";
import { contextoPagina } from "@/server/auth/sesion";
import { listarCategorias, reporteExistencias, type FilaExistencia } from "@/server/servicios";

export const metadata: Metadata = { title: "Reporte de existencias" };

function columnas(mostrarCentro: boolean): Columna<FilaExistencia>[] {
  return [
    {
      clave: "insumo",
      encabezado: "Insumo y lote",
      movil: "titulo",
      className: "md:w-[30%]",
      celda: (f) => <CeldaInsumo nombre={f.nombre} codigo={f.codigo} extra={`Lote ${f.numeroLote}`} />,
    },
    {
      clave: "ubicacion",
      encabezado: "Ubicación",
      celda: (f) => <DosLineas principal={f.ubicacion} secundario={mostrarCentro ? f.centro : f.categoria} />,
    },
    {
      clave: "vencimiento",
      encabezado: "Vencimiento",
      celda: (f) => {
        if (!f.fechaVencimiento) return <span className="text-texto-tenue">Sin vencimiento</span>;
        return (
          <span className="inline-flex flex-col items-start gap-1 max-md:items-end">
            <BadgeEstadoVencimiento estado={f.estadoVencimiento} dias={f.diasParaVencer} />
            <span className="cifras text-xs whitespace-nowrap text-texto-suave">{formatearDia(f.fechaVencimiento)}</span>
          </span>
        );
      },
    },
    {
      clave: "cantidad",
      encabezado: "Cantidad",
      alinear: "derecha",
      movil: "destacado",
      celda: (f) => <CantidadUnidad cantidad={f.cantidad} unidad={f.unidadMedida} />,
    },
    {
      clave: "valor",
      encabezado: "Valor",
      alinear: "derecha",
      celda: (f) =>
        f.valor === null || f.costoUnitario === null ? (
          <span className="whitespace-nowrap text-texto-tenue">Sin costo</span>
        ) : (
          <DosLineas
            principal={<span className="cifras whitespace-nowrap">{formatearCLP(f.valor)}</span>}
            secundario={<span className="cifras whitespace-nowrap">{formatearCLP(f.costoUnitario)} c/u</span>}
          />
        ),
    },
  ];
}

export default async function PaginaReporteExistencias({ searchParams }: PageProps<"/reportes/existencias">) {
  const { sesion, actor, centroId: centroActivoId, centro, centros } = await contextoPagina("reportes:ver");
  const f = leerFiltros(await searchParams);
  const centroId = resolverCentro(centroActivoId, centros, f.centro);
  const [reporte, categorias] = await Promise.all([
    reporteExistencias(actor, { centroId, categoriaId: f.categoriaId, texto: f.texto, semaforo: f.semaforo, pagina: f.pagina }),
    listarCategorias(actor),
  ]);
  const { totales } = reporte;
  const alcance = centro?.nombre ?? centros.find((c) => c.id === centroId)?.nombre ?? etiquetaAlcanceTotal(actor.rol);

  return (
    <VistaReporte
      contexto={`${alcance} · Existencias al ${formatearDia(hoyEnSantiago())}`}
      generadoPor={sesion.usuario.nombre}
      generadoEl={formatearFechaHora(new Date())}
    >
      <PageHeader
        className={CLASE_ENCABEZADO_IMPRIMIBLE}
        titulo="Existencias"
        descripcion={<>{alcance} · Stock actual por centro, ubicación y lote, valorizado al costo de ingreso.</>}
        volver={{ href: "/reportes", label: "Reportes" }}
        acciones={
          <AccionesReporte hrefCsv={construirHref("/reportes/exportar/existencias", {
            centro: centroId,
            categoria: f.categoriaId,
            q: f.texto,
            semaforo: escribirSemaforo(f.semaforo),
          })} />
        }
      />
      <NavReportes activo="existencias" />

      <BarraFiltros parametros={["q", "categoria", "semaforo", "centro"]}>
        <FiltroBusqueda placeholder="Insumo, código o lote…" />
        <FiltroSelect
          parametro="categoria"
          etiqueta="Categoría"
          todos="Todas"
          opciones={categorias.map((c) => ({ value: c.id, label: c.nombre }))}
        />
        <FiltroSelect parametro="semaforo" etiqueta="Semáforo" todos="Todos" opciones={[...OPCIONES_FILTRO_SEMAFORO]} />
        <FiltroCentro centroActivoId={centroActivoId} centros={centros} />
      </BarraFiltros>
      <LeyendaSemaforo className="mb-4 px-1 print:hidden" />

      <Cifras
        cifras={[
          { etiqueta: "Valor del inventario", valor: formatearCLP(totales.valor), detalle: "Costo promedio de ingreso por lote" },
          { etiqueta: "Lotes por ubicación", valor: formatearNumero(totales.filas), detalle: "Filas del reporte (incluye vencidos)" },
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
      <Pagination {...reporte} className="mt-4 print:hidden" />
    </VistaReporte>
  );
}
