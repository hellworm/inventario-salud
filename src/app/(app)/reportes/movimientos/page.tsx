import type { Metadata } from "next";
import Link from "next/link";
import { History, X } from "lucide-react";
import { BarraFiltros, FiltroBusqueda, FiltroCentro, FiltroPeriodo, FiltroSelect } from "@/components/admin/filtros-url";
import {
  AccionesReporte,
  CantidadUnidad,
  CeldaInsumo,
  CLASE_ENCABEZADO_IMPRIMIBLE,
  DosLineas,
  NavReportes,
  VistaReporte,
} from "@/components/reportes/piezas";
import {
  BadgeTipoMovimiento,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  PageHeader,
  Pagination,
  type Columna,
} from "@/components/ui";
import { ETIQUETA_TIPO_MOVIMIENTO, SIGNO_MOVIMIENTO, TIPOS_MOVIMIENTO } from "@/lib/estados";
import { formatearDia, formatearFechaHora } from "@/lib/fechas";
import { leerFiltros } from "@/lib/filtros-reportes";
import { formatearNumero, pluralizar } from "@/lib/formato";
import { construirHref, resolverCentro } from "@/lib/parametros-url";
import { contextoPagina } from "@/server/auth/sesion";
import { reporteMovimientos, type FilaReporteMovimiento } from "@/server/servicios";

export const metadata: Metadata = { title: "Reporte de movimientos" };

function columnas(mostrarCentro: boolean): Columna<FilaReporteMovimiento>[] {
  return [
    {
      clave: "insumo",
      encabezado: "Insumo y lote",
      movil: "titulo",
      className: "md:w-[30%]",
      celda: (m) => <CeldaInsumo nombre={m.nombre} codigo={m.codigo} extra={`Lote ${m.numeroLote}`} />,
    },
    {
      clave: "tipo",
      encabezado: "Tipo y motivo",
      movil: "destacado",
      celda: (m) => (
        <span className="inline-flex flex-col items-end gap-1 md:items-start">
          <BadgeTipoMovimiento tipo={m.tipo} />
          {m.motivo || m.documentoRef ? (
            <span className="text-xs text-texto-suave break-words max-md:hidden">{m.motivo ?? m.documentoRef}</span>
          ) : null}
        </span>
      ),
    },
    {
      clave: "cantidad",
      encabezado: "Cantidad",
      alinear: "derecha",
      celda: (m) => <CantidadUnidad cantidad={m.cantidad} unidad={m.unidadMedida} signo={SIGNO_MOVIMIENTO[m.tipo]} />,
    },
    {
      clave: "ubicacion",
      encabezado: "Ubicación",
      celda: (m) => <DosLineas principal={m.ubicacion} secundario={mostrarCentro ? m.centro : undefined} />,
    },
    {
      clave: "fecha",
      encabezado: "Fecha y usuario",
      alinear: "derecha",
      celda: (m) => (
        <DosLineas
          principal={<span className="cifras whitespace-nowrap text-texto-suave">{formatearFechaHora(m.creadoEn)}</span>}
          secundario={<span className="max-md:hidden">{m.usuario}</span>}
        />
      ),
    },
  ];
}

export default async function PaginaReporteMovimientos({ searchParams }: PageProps<"/reportes/movimientos">) {
  const { sesion, actor, centroId: centroActivoId, centro, centros } = await contextoPagina("reportes:ver");
  const f = leerFiltros(await searchParams);
  const centroId = resolverCentro(centroActivoId, centros, f.centro);
  const reporte = await reporteMovimientos(actor, {
    centroId,
    tipo: f.tipo,
    insumoId: f.insumoId,
    texto: f.texto,
    desde: f.desde,
    hasta: f.hasta,
    pagina: f.pagina,
  });
  const { periodo } = reporte;
  const alcance = centro?.nombre ?? centros.find((c) => c.id === centroId)?.nombre ?? "Toda la red";
  const filtrosUrl = {
    centro: centroActivoId ? undefined : (centroId ?? undefined),
    tipo: f.tipo,
    insumo: f.insumoId,
    q: f.texto,
    desde: periodo.desde,
    hasta: periodo.hasta,
  };
  const maximoMovimientos = Math.max(1, ...reporte.porTipo.map((t) => t.movimientos));

  return (
    <VistaReporte
      contexto={`${alcance} · Movimientos del ${formatearDia(periodo.desde)} al ${formatearDia(periodo.hasta)}`}
      generadoPor={sesion.usuario.nombre}
      generadoEl={formatearFechaHora(new Date())}
    >
      <PageHeader
        className={CLASE_ENCABEZADO_IMPRIMIBLE}
        titulo="Reporte de movimientos"
        descripcion={
          <>
            {alcance} · Del {formatearDia(periodo.desde)} al {formatearDia(periodo.hasta)} · {pluralizar(reporte.total, "movimiento")}
          </>
        }
        volver={{ href: "/reportes", label: "Reportes" }}
        acciones={<AccionesReporte hrefCsv={construirHref("/reportes/exportar/movimientos", { ...filtrosUrl, centro: centroId })} />}
      />
      <NavReportes activo="movimientos" />

      <BarraFiltros parametros={["q", "tipo", "centro", "insumo", "desde", "hasta"]}>
        <FiltroPeriodo desde={periodo.desde} hasta={periodo.hasta} />
        <FiltroBusqueda placeholder="Insumo, código, lote o documento…" />
        <FiltroSelect
          parametro="tipo"
          etiqueta="Tipo de movimiento"
          todos="Todos"
          opciones={TIPOS_MOVIMIENTO.map((t) => ({ value: t, label: ETIQUETA_TIPO_MOVIMIENTO[t] }))}
        />
        <FiltroCentro centroActivoId={centroActivoId} centros={centros} />
        {reporte.insumo ? (
          <p className="col-span-2 flex w-full flex-wrap items-center gap-2 text-sm text-texto-suave">
            Solo movimientos de
            <Link
              href={construirHref("/reportes/movimientos", { ...filtrosUrl, insumo: undefined })}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-marca-200 bg-marca-50 py-1 pr-2 pl-3 font-medium text-marca-800 hover:border-marca-300 md:min-h-9 md:pointer-coarse:min-h-11"
            >
              {reporte.insumo.nombre}
              <X className="size-4" aria-hidden />
              <span className="sr-only">Quitar filtro de insumo</span>
            </Link>
          </p>
        ) : null}
      </BarraFiltros>

      {reporte.porTipo.length > 0 ? (
        <Card className="mb-4">
          <CardHeader titulo="Resumen por tipo" descripcion="Cantidad de movimientos registrados en el período" />
          <table className="w-full text-sm">
            <caption className="sr-only">Movimientos por tipo</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Tipo</th>
                <th scope="col">Proporción</th>
                <th scope="col">Movimientos</th>
              </tr>
            </thead>
            <tbody>
              {reporte.porTipo.map((t) => (
                <tr key={t.tipo}>
                  <th scope="row" className="w-px py-1.5 pr-3 text-left font-normal whitespace-nowrap">
                    <BadgeTipoMovimiento tipo={t.tipo} />
                  </th>
                  <td className="hidden w-full py-1.5 sm:table-cell" aria-hidden>
                    <span
                      className="block h-2.5 min-w-[3px] rounded-r-[4px] bg-marca-500"
                      style={{ width: `${(t.movimientos / maximoMovimientos) * 100}%` }}
                    />
                  </td>
                  <td className="cifras py-1.5 pl-4 text-right font-semibold whitespace-nowrap">
                    {formatearNumero(t.movimientos)}{" "}
                    <span className="font-normal text-texto-suave">{t.movimientos === 1 ? "movimiento" : "movimientos"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      <Card relleno={false} className="overflow-hidden">
        <DataTable
          titulo="Movimientos del período"
          columnas={columnas(centroId === null && centros.length > 1)}
          filas={reporte.items}
          claveFila={(m) => m.id}
          vacio={
            <EmptyState
              compacto
              icono={History}
              titulo="Sin movimientos"
              descripcion="No hay movimientos en el período con los filtros aplicados."
            />
          }
        />
      </Card>
      <Pagination {...reporte} className="mt-4 print:hidden" />
    </VistaReporte>
  );
}
