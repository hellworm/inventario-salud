import type { Metadata } from "next";
import { CalendarCheck2, Trash2 } from "lucide-react";
import { BarraFiltros, FiltroBusqueda, FiltroCentro, FiltroPeriodo, FiltroSelect } from "@/components/admin/filtros-url";
import {
  AccionesReporte,
  BotonExportar,
  CantidadUnidad,
  Cifras,
  CLASE_ENCABEZADO_IMPRIMIBLE,
  DosLineas,
  NavReportes,
  VistaReporte,
} from "@/components/reportes/piezas";
import {
  BadgeEstadoVencimiento,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  LeyendaSemaforo,
  PageHeader,
  Pagination,
  type Columna,
} from "@/components/ui";
import { escribirSemaforo, ETIQUETA_ESTADO_VENCIMIENTO, OPCIONES_FILTRO_SEMAFORO } from "@/lib/estados";
import { formatearDia, formatearFechaHora } from "@/lib/fechas";
import { leerFiltros } from "@/lib/filtros-reportes";
import { formatearCLP, formatearNumero, pluralizar } from "@/lib/formato";
import { construirHref, leerPagina, resolverCentro } from "@/lib/parametros-url";
import { etiquetaAlcanceTotal } from "@/lib/permisos";
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
      encabezado: "Insumo y lote",
      movil: "titulo",
      className: "md:w-[30%]",
      celda: (f) => <DosLineas principal={<span className="font-medium">{f.nombre}</span>} secundario={`${f.codigo} · Lote ${f.numeroLote}`} />,
    },
    {
      clave: "estado",
      encabezado: "Vencimiento",
      movil: "destacado",
      celda: (f) => (
        <span className="inline-flex flex-col items-end gap-1 md:items-start">
          <BadgeEstadoVencimiento estado={f.estadoVencimiento} dias={f.diasParaVencer} />
          <span className="cifras text-xs whitespace-nowrap text-texto-suave">{formatearDia(f.fechaVencimiento)}</span>
        </span>
      ),
    },
    {
      clave: "ubicacion",
      encabezado: "Ubicación",
      celda: (f) => <DosLineas principal={f.ubicacion} secundario={mostrarCentro ? f.centro : undefined} />,
    },
    {
      clave: "cantidad",
      encabezado: "Cantidad",
      alinear: "derecha",
      celda: (f) => <CantidadUnidad cantidad={f.cantidad} unidad={f.unidadMedida} />,
    },
    {
      clave: "valor",
      encabezado: "En riesgo",
      alinear: "derecha",
      movil: "oculto",
      celda: (f) =>
        f.valor === null ? (
          <span className="whitespace-nowrap text-texto-tenue">Sin costo</span>
        ) : (
          <span className="cifras whitespace-nowrap">{formatearCLP(f.valor)}</span>
        ),
    },
  ];
}

function columnasMermas(mostrarCentro: boolean): Columna<FilaReporteMovimiento>[] {
  return [
    {
      clave: "insumo",
      encabezado: "Insumo y lote",
      movil: "titulo",
      className: "md:w-[30%]",
      celda: (m) => <DosLineas principal={<span className="font-medium">{m.nombre}</span>} secundario={`${m.codigo} · Lote ${m.numeroLote}`} />,
    },
    {
      clave: "cantidad",
      encabezado: "Cantidad",
      alinear: "derecha",
      movil: "destacado",
      celda: (m) => <CantidadUnidad cantidad={m.cantidad} unidad={m.unidadMedida} signo={-1} />,
    },
    { clave: "motivo", encabezado: "Motivo", celda: (m) => m.motivo ?? "Sin motivo" },
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
        <span className="block">
          <span className="cifras block whitespace-nowrap text-texto-suave">{formatearFechaHora(m.creadoEn)}</span>
          <span className="block text-xs text-texto-tenue max-md:hidden">{m.usuario}</span>
        </span>
      ),
    },
  ];
}

export default async function PaginaReporteVencimientos({ searchParams }: PageProps<"/reportes/vencimientos">) {
  const { sesion, actor, centroId: centroActivoId, centro, centros } = await contextoPagina("reportes:ver");
  const sp = await searchParams;
  const f = leerFiltros(sp);
  const centroId = resolverCentro(centroActivoId, centros, f.centro);
  const [vencimientos, mermas] = await Promise.all([
    reporteVencimientos(actor, { centroId, texto: f.texto, semaforo: f.semaforo, pagina: f.pagina, porPagina: 15 }),
    reporteMermas(actor, {
      centroId,
      texto: f.texto,
      desde: f.desde,
      hasta: f.hasta,
      pagina: leerPagina(sp, "paginaMermas"),
      porPagina: 15,
    }),
  ]);
  const alcance = centro?.nombre ?? centros.find((c) => c.id === centroId)?.nombre ?? etiquetaAlcanceTotal(actor.rol);
  const mostrarCentro = centroId === null && centros.length > 1;
  const { periodo } = mermas;
  // Los insumos se cuentan en unidades de medida distintas: los motivos se comparan por número de bajas.
  const motivos = [...mermas.porMotivo].sort((a, b) => b.movimientos - a.movimientos || a.motivo.localeCompare(b.motivo, "es"));
  const principalMotivo = motivos[0];
  const colores = vencimientos.semaforo.map((c) => (c === "VENCIDO" ? "vencidos" : ETIQUETA_ESTADO_VENCIMIENTO[c].toLowerCase()));
  const listaColores = colores.length > 1 ? `${colores.slice(0, -1).join(", ")} y ${colores.at(-1)}` : (colores[0] ?? "");

  return (
    <VistaReporte
      contexto={`${alcance} · Vencimientos (${listaColores}) y mermas del ${formatearDia(periodo.desde)} al ${formatearDia(periodo.hasta)}`}
      generadoPor={sesion.usuario.nombre}
      generadoEl={formatearFechaHora(new Date())}
    >
      <PageHeader
        className={CLASE_ENCABEZADO_IMPRIMIBLE}
        titulo="Vencimientos y mermas"
        descripcion={<>{alcance} · Lo que está por perderse y lo que ya se dio de baja.</>}
        volver={{ href: "/reportes", label: "Reportes" }}
        acciones={<AccionesReporte />}
      />
      <NavReportes activo="vencimientos" />

      <BarraFiltros parametros={["q", "centro", "semaforo", "desde", "hasta"]}>
        <FiltroBusqueda placeholder="Insumo, código o lote…" />
        <FiltroCentro centroActivoId={centroActivoId} centros={centros} />
        <FiltroSelect
          parametro="semaforo"
          etiqueta="Semáforo"
          todos="Vencidos, rojo y amarillo"
          opciones={[...OPCIONES_FILTRO_SEMAFORO]}
        />
        <FiltroPeriodo de="Mermas" desde={periodo.desde} hasta={periodo.hasta} />
      </BarraFiltros>

      <section aria-labelledby="titulo-vencimientos">
        <Card relleno={false} className="overflow-hidden">
          <CardHeader
            className="mb-0 p-4 sm:p-5"
            titulo={<span id="titulo-vencimientos">Vencimientos por semáforo</span>}
            descripcion={`Lotes con stock: ${listaColores} · del que vence antes al que vence después`}
            acciones={
              <span className="print:hidden">
                <BotonExportar
                  variante="secundario"
                  de="vencimientos"
                  href={construirHref("/reportes/exportar/vencimientos", { centro: centroId, q: f.texto, semaforo: escribirSemaforo(f.semaforo) })}
                />
              </span>
            }
          />
          <div className="px-4 sm:px-5">
            <LeyendaSemaforo className="mb-3 print:hidden" />
            <Cifras
              cifras={[
                { etiqueta: "Lotes por ubicación", valor: formatearNumero(vencimientos.totales.filas) },
                { etiqueta: "Valor en riesgo", valor: formatearCLP(vencimientos.totales.valor) },
                { etiqueta: "Sin costo registrado", valor: formatearNumero(vencimientos.totales.filasSinCosto) },
              ]}
            />
          </div>
          <DataTable
            className="border-t border-borde"
            titulo="Lotes por semáforo de vencimiento"
            columnas={columnasVencimientos(mostrarCentro)}
            filas={vencimientos.items}
            claveFila={(x) => x.existenciaId}
            hrefFila={(x) => `/inventario/${x.insumoId}`}
            vacio={
              <EmptyState
                compacto
                icono={CalendarCheck2}
                titulo="Ningún lote con ese semáforo"
                descripcion="No hay lotes con stock que coincidan con el semáforo y los filtros elegidos."
              />
            }
          />
        </Card>
        <Pagination etiqueta="Paginación de vencimientos" {...vencimientos} className="mt-4" />
      </section>

      <section aria-labelledby="titulo-mermas" className="mt-8">
        <Card relleno={false} className="overflow-hidden">
          <CardHeader
            className="mb-0 p-4 sm:p-5"
            titulo={<span id="titulo-mermas">Mermas del período</span>}
            descripcion={`Bajas registradas del ${formatearDia(periodo.desde)} al ${formatearDia(periodo.hasta)}`}
            acciones={
              <span className="print:hidden">
                <BotonExportar
                  variante="secundario"
                  de="mermas"
                  href={construirHref("/reportes/exportar/mermas", { centro: centroId, q: f.texto, desde: periodo.desde, hasta: periodo.hasta })}
                />
              </span>
            }
          />
          <div className="px-4 sm:px-5">
            <Cifras
              cifras={[
                { etiqueta: "Bajas registradas", valor: formatearNumero(mermas.total) },
                {
                  etiqueta: "Motivo principal",
                  valor: principalMotivo?.motivo ?? "—",
                  detalle: principalMotivo ? pluralizar(principalMotivo.movimientos, "baja") : undefined,
                },
                { etiqueta: "Motivos distintos", valor: formatearNumero(motivos.length) },
              ]}
            />
            {motivos.length > 1 ? (
              <ul className="mb-4 flex flex-wrap gap-2 text-sm" aria-label="Bajas por motivo">
                {motivos.map((m) => (
                  <li key={m.motivo} className="rounded-full bg-superficie-2 px-3 py-1 ring-1 ring-borde ring-inset">
                    {m.motivo}: <strong className="cifras font-semibold">{pluralizar(m.movimientos, "baja")}</strong>
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
        <Pagination etiqueta="Paginación de mermas" {...mermas} parametro="paginaMermas" className="mt-4" />
      </section>
    </VistaReporte>
  );
}
