import type { Metadata } from "next";
import Link from "next/link";
import { History, X } from "lucide-react";
import { FiltroSelect } from "@/components/alertas/filtro-select";
import { FiltroPeriodo } from "@/components/reportes/filtro-periodo";
import { BotonExportar, CeldaInsumo, FiltroCentro, NavReportes } from "@/components/reportes/piezas";
import {
  BadgeTipoMovimiento,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  PageHeader,
  Pagination,
  SearchInput,
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
      encabezado: "Insumo",
      movil: "titulo",
      celda: (m) => <CeldaInsumo nombre={m.nombre} codigo={m.codigo} extra={`Lote ${m.numeroLote}`} />,
    },
    { clave: "tipo", encabezado: "Tipo", movil: "destacado", celda: (m) => <BadgeTipoMovimiento tipo={m.tipo} /> },
    {
      clave: "cantidad",
      encabezado: "Cantidad",
      alinear: "derecha",
      celda: (m) => (
        <span className="cifras whitespace-nowrap font-semibold">
          {SIGNO_MOVIMIENTO[m.tipo] > 0 ? "+" : "−"}
          {formatearNumero(m.cantidad)} <span className="font-normal text-texto-tenue">{m.unidadMedida}</span>
        </span>
      ),
    },
    {
      clave: "ubicacion",
      encabezado: mostrarCentro ? "Centro y ubicación" : "Ubicación",
      celda: (m) => (mostrarCentro ? `${m.centro} · ${m.ubicacion}` : m.ubicacion),
    },
    {
      clave: "detalle",
      encabezado: "Motivo / documento",
      movil: "oculto",
      celda: (m) => m.motivo ?? m.documentoRef ?? <span className="text-texto-tenue">—</span>,
    },
    { clave: "usuario", encabezado: "Usuario", movil: "oculto", celda: (m) => m.usuario },
    {
      clave: "fecha",
      encabezado: "Fecha",
      alinear: "derecha",
      celda: (m) => <span className="cifras whitespace-nowrap text-texto-suave">{formatearFechaHora(m.creadoEn)}</span>,
    },
  ];
}

export default async function PaginaReporteMovimientos({ searchParams }: PageProps<"/reportes/movimientos">) {
  const { actor, centroId: centroActivoId, centro, centros } = await contextoPagina("reportes:ver");
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
  const maximoUnidades = Math.max(1, ...reporte.porTipo.map((t) => t.unidades));

  return (
    <>
      <PageHeader
        titulo="Movimientos"
        descripcion={
          <>
            {alcance} · Del {formatearDia(periodo.desde)} al {formatearDia(periodo.hasta)} · {pluralizar(reporte.total, "movimiento")}
          </>
        }
        volver={{ href: "/reportes", label: "Reportes" }}
        acciones={<BotonExportar href={construirHref("/reportes/exportar/movimientos", { ...filtrosUrl, centro: centroId })} />}
      />
      <NavReportes activo="movimientos" />

      <div className="mb-4 flex flex-col gap-3">
        <FiltroPeriodo desde={periodo.desde} hasta={periodo.hasta} />
        <div className="grid gap-2 sm:grid-cols-2 lg:flex">
          <SearchInput placeholder="Buscar insumo, código, lote o documento…" label="Buscar en movimientos" className="sm:col-span-2 lg:w-96" />
          <FiltroSelect
            parametro="tipo"
            etiqueta="Tipo de movimiento"
            todos="Todos los tipos"
            opciones={TIPOS_MOVIMIENTO.map((t) => ({ value: t, label: ETIQUETA_TIPO_MOVIMIENTO[t] }))}
            className="lg:w-56"
          />
          <FiltroCentro centroActivoId={centroActivoId} centros={centros} className="lg:w-64" />
        </div>
        {reporte.insumo ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-texto-suave">
            Solo movimientos de
            <Link
              href={construirHref("/reportes/movimientos", { ...filtrosUrl, insumo: undefined })}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-marca-200 bg-marca-50 py-1 pr-2 pl-3 font-medium text-marca-800 hover:border-marca-300"
            >
              {reporte.insumo.nombre}
              <X className="size-4" aria-hidden />
              <span className="sr-only">Quitar filtro de insumo</span>
            </Link>
          </p>
        ) : null}
      </div>

      {reporte.porTipo.length > 0 ? (
        <Card className="mb-4">
          <CardHeader titulo="Resumen por tipo" descripcion="Unidades movidas en el período (las unidades de medida difieren entre insumos)" />
          <table className="w-full text-sm">
            <caption className="sr-only">Movimientos y unidades por tipo</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Tipo</th>
                <th scope="col">Proporción</th>
                <th scope="col">Unidades</th>
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
                      style={{ width: `${(t.unidades / maximoUnidades) * 100}%` }}
                    />
                  </td>
                  <td className="cifras py-1.5 pl-3 text-right font-semibold whitespace-nowrap">{formatearNumero(t.unidades)} u.</td>
                  <td className="cifras py-1.5 pl-4 text-right whitespace-nowrap text-texto-suave">
                    {pluralizar(t.movimientos, "movimiento")}
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
      <Pagination {...reporte} className="mt-4" />
    </>
  );
}
