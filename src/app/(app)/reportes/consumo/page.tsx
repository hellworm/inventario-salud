import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, CircleSlash, Hourglass, TrendingDown, TriangleAlert, type LucideIcon } from "lucide-react";
import { BarraFiltros, FiltroBusqueda, FiltroCentro, FiltroPeriodo, FiltroSelect } from "@/components/admin/filtros-url";
import {
  AccionesReporte,
  CantidadUnidad,
  CeldaInsumo,
  Cifras,
  CLASE_ENCABEZADO_IMPRIMIBLE,
  NavReportes,
  VistaReporte,
} from "@/components/reportes/piezas";
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  Pagination,
  type BadgeTono,
  type Columna,
} from "@/components/ui";
import { ETIQUETA_NIVEL_COBERTURA, nivelDeCobertura, type NivelCobertura } from "@/lib/abastecimiento";
import { formatearDia, formatearFechaHora } from "@/lib/fechas";
import { leerFiltros } from "@/lib/filtros-reportes";
import { formatearDecimalFijo, formatearNumero, pluralizar } from "@/lib/formato";
import { construirHref, resolverCentro } from "@/lib/parametros-url";
import { contextoPagina } from "@/server/auth/sesion";
import { listarCategorias, reporteConsumo, type FilaConsumo } from "@/server/servicios";

export const metadata: Metadata = { title: "Reporte de consumo y cobertura" };

const NIVEL: Record<NivelCobertura, { tono: BadgeTono; icono: LucideIcon }> = {
  CRITICA: { tono: "peligro", icono: TriangleAlert },
  BAJA: { tono: "alerta", icono: Hourglass },
  ADECUADA: { tono: "exito", icono: CircleCheck },
  SIN_CONSUMO: { tono: "neutro", icono: CircleSlash },
};

function Cobertura({ dias }: { dias: number | null }) {
  const nivel = nivelDeCobertura(dias);
  const { tono, icono } = NIVEL[nivel];
  return (
    <Badge tono={tono} icono={icono} title={ETIQUETA_NIVEL_COBERTURA[nivel]}>
      {dias === null ? "Sin consumo" : dias >= 365 ? "Más de 1 año" : `${formatearDecimalFijo(dias)} días`}
    </Badge>
  );
}

export default async function PaginaReporteConsumo({ searchParams }: PageProps<"/reportes/consumo">) {
  const { sesion, actor, centroId: centroActivoId, centro, centros } = await contextoPagina("reportes:ver");
  const f = leerFiltros(await searchParams);
  const centroId = resolverCentro(centroActivoId, centros, f.centro);
  const [reporte, categorias] = await Promise.all([
    reporteConsumo(actor, {
      centroId,
      categoriaId: f.categoriaId,
      texto: f.texto,
      desde: f.desde,
      hasta: f.hasta,
      orden: f.orden,
      pagina: f.pagina,
    }),
    listarCategorias(actor),
  ]);
  const { periodo } = reporte;
  const alcance = centro?.nombre ?? centros.find((c) => c.id === centroId)?.nombre ?? "Toda la red";
  const filtrosUrl = {
    centro: centroId,
    categoria: f.categoriaId,
    q: f.texto,
    desde: periodo.desde,
    hasta: periodo.hasta,
    orden: f.orden,
  };

  const columnas: Columna<FilaConsumo>[] = [
    {
      clave: "insumo",
      encabezado: "Insumo",
      movil: "titulo",
      className: "md:w-[32%]",
      celda: (c) => <CeldaInsumo nombre={c.nombre} codigo={c.codigo} extra={c.categoria} />,
    },
    {
      clave: "cobertura",
      encabezado: "Cobertura",
      movil: "destacado",
      celda: (c) => <Cobertura dias={c.diasCobertura} />,
    },
    {
      clave: "consumo",
      encabezado: "Consumo",
      alinear: "derecha",
      celda: (c) => <CantidadUnidad cantidad={c.consumo} unidad={c.unidadMedida} />,
    },
    {
      clave: "promedio",
      encabezado: "Por día",
      alinear: "derecha",
      celda: (c) => <span className="cifras whitespace-nowrap">{c.consumo > 0 ? formatearDecimalFijo(c.promedioDiario) : "—"}</span>,
    },
    {
      clave: "disponible",
      encabezado: "Disponible",
      alinear: "derecha",
      celda: (c) => <span className="cifras">{formatearNumero(c.disponible)}</span>,
    },
    {
      clave: "retiros",
      encabezado: "Retiros",
      alinear: "derecha",
      movil: "oculto",
      celda: (c) =>
        c.retiros > 0 ? (
          <Link
            href={construirHref("/reportes/movimientos", {
              insumo: c.insumoId,
              tipo: "RETIRO",
              desde: periodo.desde,
              hasta: periodo.hasta,
              centro: centroActivoId ? undefined : centroId,
            })}
            className="cifras relative z-10 font-medium text-marca-700 underline-offset-4 hover:underline"
            aria-label={`Ver los ${c.retiros} retiros de ${c.nombre}`}
          >
            {formatearNumero(c.retiros)}
          </Link>
        ) : (
          <span className="cifras text-texto-tenue">0</span>
        ),
    },
  ];

  return (
    <VistaReporte
      contexto={`${alcance} · Consumo del ${formatearDia(periodo.desde)} al ${formatearDia(periodo.hasta)}`}
      generadoPor={sesion.usuario.nombre}
      generadoEl={formatearFechaHora(new Date())}
    >
      <PageHeader
        className={CLASE_ENCABEZADO_IMPRIMIBLE}
        titulo="Consumo y cobertura"
        descripcion={
          <>
            {alcance} · Del {formatearDia(periodo.desde)} al {formatearDia(periodo.hasta)} ({pluralizar(periodo.dias, "día")})
          </>
        }
        volver={{ href: "/reportes", label: "Reportes" }}
        acciones={<AccionesReporte hrefCsv={construirHref("/reportes/exportar/consumo", filtrosUrl)} />}
      />
      <NavReportes activo="consumo" />

      <BarraFiltros parametros={["q", "categoria", "centro", "orden", "desde", "hasta"]}>
        <FiltroPeriodo desde={periodo.desde} hasta={periodo.hasta} />
        <FiltroBusqueda placeholder="Insumo o código…" />
        <FiltroSelect
          parametro="categoria"
          etiqueta="Categoría"
          todos="Todas"
          opciones={categorias.map((c) => ({ value: c.id, label: c.nombre }))}
        />
        <FiltroCentro centroActivoId={centroActivoId} centros={centros} />
        <FiltroSelect
          parametro="orden"
          etiqueta="Orden"
          opciones={[
            { value: "cobertura", label: "Menor cobertura primero" },
            { value: "consumo", label: "Mayor consumo primero" },
          ]}
        />
      </BarraFiltros>

      <Cifras
        cifras={[
          { etiqueta: "Cobertura menor a 7 días", valor: formatearNumero(reporte.coberturaCritica), detalle: "Reponer de inmediato" },
          { etiqueta: "Cobertura de 7 a 29 días", valor: formatearNumero(reporte.coberturaBaja), detalle: "Planificar la compra" },
          { etiqueta: "Insumos con consumo", valor: formatearNumero(reporte.conConsumo), detalle: "Con retiros en el período" },
          { etiqueta: "Insumos en el reporte", valor: formatearNumero(reporte.total), detalle: "Con consumo o con stock" },
        ]}
      />

      <Card relleno={false} className="overflow-hidden">
        <DataTable
          titulo="Consumo por insumo y días de cobertura"
          columnas={columnas}
          filas={reporte.items}
          claveFila={(c) => c.insumoId}
          hrefFila={(c) => `/inventario/${c.insumoId}`}
          vacio={
            <EmptyState
              compacto
              icono={TrendingDown}
              titulo="Sin datos de consumo"
              descripcion="No hay retiros ni stock que coincidan con los filtros aplicados."
            />
          }
        />
      </Card>
      <Pagination {...reporte} className="mt-4 print:hidden" />

      <p className="mt-4 max-w-3xl text-sm text-texto-suave">
        <strong className="font-semibold text-texto">Cómo se calcula:</strong> cobertura = stock disponible hoy (sin lotes vencidos) ÷
        consumo promedio por día del período (retiros ÷ días transcurridos). Es una estimación: supone que el consumo se mantiene.
        Promedio y stock disponible van en la unidad de medida de cada insumo.
      </p>
    </VistaReporte>
  );
}
