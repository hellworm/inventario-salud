import type { Metadata } from "next";
import { CalendarCheck2, CalendarX2, Trash2 } from "lucide-react";
import { FiltroSelect } from "@/components/alertas/filtro-select";
import { FiltroPeriodo } from "@/components/reportes/filtro-periodo";
import { BotonExportar, CeldaInsumo, Cifras, FiltroCentro, NavReportes } from "@/components/reportes/piezas";
import {
  Badge,
  BadgeEstadoVencimiento,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  PageHeader,
  Pagination,
  SearchInput,
  type Columna,
} from "@/components/ui";
import { describirVencimiento, formatearDia, formatearFechaHora } from "@/lib/fechas";
import { leerFiltros } from "@/lib/filtros-reportes";
import { formatearCLP, formatearNumero, pluralizar } from "@/lib/formato";
import { construirHref, leerEntero, resolverCentro } from "@/lib/parametros-url";
import { contextoPagina } from "@/server/auth/sesion";
import {
  reporteMermas,
  reporteVencimientos,
  type FilaExistencia,
  type FilaReporteMovimiento,
} from "@/server/servicios";

export const metadata: Metadata = { title: "Reporte de vencimientos y mermas" };

function columnasVencimientos(mostrarCentro: boolean): Columna<FilaExistencia>[] {
  return [
    {
      clave: "insumo",
      encabezado: "Insumo",
      movil: "titulo",
      celda: (f) => <CeldaInsumo nombre={f.nombre} codigo={f.codigo} extra={f.categoria} />,
    },
    {
      clave: "estado",
      encabezado: "Días restantes",
      movil: "destacado",
      celda: (f) =>
        f.diasParaVencer !== null && f.diasParaVencer < 0 ? (
          <Badge tono="peligro" icono={CalendarX2}>
            {describirVencimiento(f.diasParaVencer)}
          </Badge>
        ) : (
          <BadgeEstadoVencimiento estado="POR_VENCER" dias={f.diasParaVencer} />
        ),
    },
    { clave: "lote", encabezado: "Lote", celda: (f) => <span className="cifras whitespace-nowrap">{f.numeroLote}</span> },
    {
      clave: "ubicacion",
      encabezado: mostrarCentro ? "Centro y ubicación" : "Ubicación",
      celda: (f) => (mostrarCentro ? `${f.centro} · ${f.ubicacion}` : f.ubicacion),
    },
    {
      clave: "vencimiento",
      encabezado: "Vencimiento",
      alinear: "derecha",
      celda: (f) => <span className="cifras whitespace-nowrap">{formatearDia(f.fechaVencimiento)}</span>,
    },
    {
      clave: "cantidad",
      encabezado: "Cantidad",
      alinear: "derecha",
      celda: (f) => (
        <span className="cifras whitespace-nowrap font-semibold">
          {formatearNumero(f.cantidad)} <span className="font-normal text-texto-tenue">{f.unidadMedida}</span>
        </span>
      ),
    },
    {
      clave: "valor",
      encabezado: "Valor en riesgo",
      alinear: "derecha",
      movil: "oculto",
      celda: (f) =>
        f.valor === null ? <span className="text-texto-tenue">Sin costo</span> : <span className="cifras">{formatearCLP(f.valor)}</span>,
    },
  ];
}

function columnasMermas(mostrarCentro: boolean): Columna<FilaReporteMovimiento>[] {
  return [
    {
      clave: "insumo",
      encabezado: "Insumo",
      movil: "titulo",
      celda: (m) => <CeldaInsumo nombre={m.nombre} codigo={m.codigo} extra={`Lote ${m.numeroLote}`} />,
    },
    {
      clave: "cantidad",
      encabezado: "Cantidad",
      alinear: "derecha",
      movil: "destacado",
      celda: (m) => (
        <span className="cifras whitespace-nowrap font-semibold">
          −{formatearNumero(m.cantidad)} <span className="font-normal text-texto-tenue">{m.unidadMedida}</span>
        </span>
      ),
    },
    { clave: "motivo", encabezado: "Motivo", celda: (m) => m.motivo ?? "Sin motivo" },
    {
      clave: "ubicacion",
      encabezado: mostrarCentro ? "Centro y ubicación" : "Ubicación",
      celda: (m) => (mostrarCentro ? `${m.centro} · ${m.ubicacion}` : m.ubicacion),
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

export default async function PaginaReporteVencimientos({ searchParams }: PageProps<"/reportes/vencimientos">) {
  const { actor, centroId: centroActivoId, centro, centros } = await contextoPagina("reportes:ver");
  const sp = await searchParams;
  const f = leerFiltros(sp);
  const centroId = resolverCentro(centroActivoId, centros, f.centro);
  const [vencimientos, mermas] = await Promise.all([
    reporteVencimientos(actor, { centroId, texto: f.texto, dias: f.dias, pagina: f.pagina, porPagina: 15 }),
    reporteMermas(actor, {
      centroId,
      texto: f.texto,
      desde: f.desde,
      hasta: f.hasta,
      pagina: leerEntero(sp, "paginaMermas"),
      porPagina: 15,
    }),
  ]);
  const alcance = centro?.nombre ?? centros.find((c) => c.id === centroId)?.nombre ?? "Toda la red";
  const mostrarCentro = centroId === null && centros.length > 1;
  const { periodo } = mermas;
  const principalMotivo = mermas.porMotivo[0];

  return (
    <>
      <PageHeader
        titulo="Vencimientos y mermas"
        descripcion={<>{alcance} · Lo que está por perderse y lo que ya se dio de baja.</>}
        volver={{ href: "/reportes", label: "Reportes" }}
      />
      <NavReportes activo="vencimientos" />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:flex">
        <SearchInput placeholder="Buscar insumo, código o lote…" label="Buscar en vencimientos y mermas" className="sm:col-span-2 lg:w-80" />
        <FiltroCentro centroActivoId={centroActivoId} centros={centros} className="lg:w-64" />
      </div>

      <section aria-labelledby="titulo-vencimientos">
        <Card relleno={false} className="overflow-hidden">
          <CardHeader
            className="mb-0 p-4 sm:p-5"
            titulo={<span id="titulo-vencimientos">Vencimientos próximos</span>}
            descripcion={`Lotes con stock vencidos o que vencen en ${vencimientos.horizonte} días o menos`}
            acciones={
              <>
                <FiltroSelect
                  parametro="dias"
                  etiqueta="Horizonte de vencimiento"
                  opciones={[
                    { value: "90", label: "Próximos 90 días" },
                    { value: "60", label: "Próximos 60 días" },
                    { value: "30", label: "Próximos 30 días" },
                  ]}
                  className="w-48"
                />
                <BotonExportar
                  variante="secundario"
                  href={construirHref("/reportes/exportar/vencimientos", { centro: centroId, q: f.texto, dias: vencimientos.horizonte })}
                >
                  CSV
                </BotonExportar>
              </>
            }
          />
          <div className="px-4 sm:px-5">
            <Cifras
              cifras={[
                { etiqueta: "Lotes por ubicación", valor: formatearNumero(vencimientos.totales.filas) },
                { etiqueta: "Unidades", valor: formatearNumero(vencimientos.totales.unidades) },
                { etiqueta: "Valor en riesgo", valor: formatearCLP(vencimientos.totales.valor) },
                { etiqueta: "Sin costo registrado", valor: formatearNumero(vencimientos.totales.filasSinCosto) },
              ]}
            />
          </div>
          <DataTable
            className="border-t border-borde"
            titulo="Lotes vencidos o por vencer"
            columnas={columnasVencimientos(mostrarCentro)}
            filas={vencimientos.items}
            claveFila={(x) => x.existenciaId}
            hrefFila={(x) => `/inventario/${x.insumoId}`}
            vacio={
              <EmptyState
                compacto
                icono={CalendarCheck2}
                titulo="Nada vencido ni por vencer"
                descripcion="Ningún lote con stock vence dentro del horizonte elegido."
              />
            }
          />
        </Card>
        <Pagination {...vencimientos} className="mt-4" />
      </section>

      <section aria-labelledby="titulo-mermas" className="mt-8">
        <Card relleno={false} className="overflow-hidden">
          <CardHeader
            className="mb-0 p-4 sm:p-5"
            titulo={<span id="titulo-mermas">Mermas del período</span>}
            descripcion={`Bajas registradas del ${formatearDia(periodo.desde)} al ${formatearDia(periodo.hasta)}`}
            acciones={
              <BotonExportar
                variante="secundario"
                href={construirHref("/reportes/exportar/mermas", { centro: centroId, q: f.texto, desde: periodo.desde, hasta: periodo.hasta })}
              >
                CSV
              </BotonExportar>
            }
          />
          <div className="px-4 pb-4 sm:px-5">
            <FiltroPeriodo desde={periodo.desde} hasta={periodo.hasta} />
          </div>
          <div className="px-4 sm:px-5">
            <Cifras
              cifras={[
                { etiqueta: "Bajas registradas", valor: formatearNumero(mermas.total) },
                { etiqueta: "Unidades dadas de baja", valor: formatearNumero(mermas.unidades) },
                {
                  etiqueta: "Motivo principal",
                  valor: principalMotivo?.motivo ?? "—",
                  detalle: principalMotivo ? `${formatearNumero(principalMotivo.unidades)} unidades` : undefined,
                },
                { etiqueta: "Motivos distintos", valor: formatearNumero(mermas.porMotivo.length) },
              ]}
            />
            {mermas.porMotivo.length > 1 ? (
              <ul className="mb-4 flex flex-wrap gap-2 text-sm" aria-label="Unidades por motivo">
                {mermas.porMotivo.map((m) => (
                  <li key={m.motivo} className="rounded-full bg-superficie-2 px-3 py-1 ring-1 ring-borde ring-inset">
                    {m.motivo}: <strong className="cifras font-semibold">{formatearNumero(m.unidades)}</strong>{" "}
                    <span className="text-texto-tenue">({pluralizar(m.movimientos, "baja")})</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <DataTable
            className="border-t border-borde"
            titulo="Mermas del período"
            columnas={columnasMermas(mostrarCentro)}
            filas={mermas.items}
            claveFila={(m) => m.id}
            vacio={
              <EmptyState compacto icono={Trash2} titulo="Sin mermas en el período" descripcion="No se registraron bajas en estas fechas." />
            }
          />
        </Card>
        <Pagination {...mermas} parametro="paginaMermas" className="mt-4" />
      </section>
    </>
  );
}
