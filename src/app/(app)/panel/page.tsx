import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CalendarClock,
  CalendarX2,
  ChevronRight,
  Eye,
  History,
  PackageX,
  TriangleAlert,
} from "lucide-react";
import { AccesosRapidos, AccionesPrincipales } from "@/components/panel/accesos-rapidos";
import { ubicacionesDeIngreso } from "@/components/alertas/acciones";
import { AtencionHoy } from "@/components/panel/atencion-hoy";
import { GraficoActividad, type DiaActividad } from "@/components/panel/grafico-actividad";
import { GraficoVencimientos } from "@/components/panel/grafico-vencimientos";
import { CantidadUnidad, DosLineas } from "@/components/reportes/piezas";
import {
  Alert,
  BadgeTipoMovimiento,
  buttonClasses,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  PageHeader,
  StatCard,
  type Columna,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { SIGNO_MOVIMIENTO } from "@/lib/estados";
import { diaADate, formatearDia, formatearFechaHora, hoyEnSantiago } from "@/lib/fechas";
import { formatearNumero, pluralizar } from "@/lib/formato";
import { puede, type Rol } from "@/lib/permisos";
import { contextoPagina } from "@/server/auth/sesion";
import {
  listarUbicaciones,
  resumenPanel,
  type ActividadDia,
  type FilaMovimiento,
  type ResumenCentro,
} from "@/server/servicios";

export const metadata: Metadata = { title: "Panel" };

function columnasMovimientos(mostrarCentro: boolean): Columna<FilaMovimiento>[] {
  return [
    {
      clave: "insumo",
      encabezado: "Insumo",
      movil: "titulo",
      className: "md:w-[36%]",
      celda: (m) => (
        <DosLineas principal={<span className="font-medium">{m.insumoNombre}</span>} secundario={`Lote ${m.numeroLote} · ${m.ubicacion}`} />
      ),
    },
    { clave: "tipo", encabezado: "Tipo", movil: "destacado", celda: (m) => <BadgeTipoMovimiento tipo={m.tipo} /> },
    {
      clave: "cantidad",
      encabezado: "Cantidad",
      alinear: "derecha",
      celda: (m) => <CantidadUnidad cantidad={m.cantidad} unidad={m.unidadMedida} signo={SIGNO_MOVIMIENTO[m.tipo]} />,
    },
    ...(mostrarCentro
      ? [{ clave: "centro", encabezado: "Centro", celda: (m: FilaMovimiento) => m.centro } satisfies Columna<FilaMovimiento>]
      : []),
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

const fmtDiaSemana = new Intl.DateTimeFormat("es-CL", { weekday: "long", timeZone: "UTC" });

/** Prepara los días para el gráfico (etiquetas ya formateadas: el componente cliente solo dibuja). */
function diasParaGrafico(actividad: ActividadDia[]): DiaActividad[] {
  return actividad.map((d) => {
    const semana = fmtDiaSemana.format(diaADate(d.dia));
    return {
      dia: d.dia,
      etiqueta: formatearDia(d.dia).slice(0, 5),
      titulo: `${semana.charAt(0).toUpperCase()}${semana.slice(1)} ${formatearDia(d.dia)}`,
      entradas: d.entradas,
      salidas: d.salidas,
      movimientos: d.movimientos,
    };
  });
}

/** Conteo de la tabla "Alertas por centro": enlaza a /alertas ya filtrado por centro y tipo. */
function ConteoCentro({ valor, href, tono, etiqueta }: { valor: number; href: string; tono: "peligro" | "alerta"; etiqueta: string }) {
  if (valor === 0) return <span className="cifras inline-block min-w-9 text-center text-texto-tenue">0</span>;
  return (
    <Link
      href={href}
      aria-label={etiqueta}
      className={cn(
        "cifras relative inline-flex min-h-8 min-w-9 items-center justify-center rounded-full px-2.5 text-sm font-semibold ring-1 ring-inset after:absolute after:-inset-1.5 hover:ring-2",
        tono === "peligro" ? "bg-peligro-50 text-peligro-800 ring-peligro-600/25" : "bg-alerta-50 text-alerta-800 ring-alerta-500/40",
      )}
    >
      {formatearNumero(valor)}
    </Link>
  );
}

const COLUMNAS_CENTROS: Columna<ResumenCentro>[] = [
  { clave: "centro", encabezado: "Centro", movil: "titulo", celda: (c) => <span className="font-medium">{c.centro}</span> },
  {
    clave: "sinStock",
    encabezado: "Sin stock",
    alinear: "derecha",
    celda: (c) => (
      <ConteoCentro valor={c.sinStock} tono="peligro" href={`/alertas?tab=sin-stock&centro=${c.centroId}`} etiqueta={`${c.sinStock} sin stock en ${c.centro}`} />
    ),
  },
  {
    clave: "bajoMinimo",
    encabezado: "Bajo mínimo",
    alinear: "derecha",
    celda: (c) => (
      <ConteoCentro valor={c.bajoMinimo} tono="alerta" href={`/alertas?tab=bajo-minimo&centro=${c.centroId}`} etiqueta={`${c.bajoMinimo} bajo el mínimo en ${c.centro}`} />
    ),
  },
  {
    clave: "vencidos",
    encabezado: "Vencidos",
    alinear: "derecha",
    celda: (c) => (
      <ConteoCentro valor={c.vencidos} tono="peligro" href={`/alertas?tab=vencidos&centro=${c.centroId}`} etiqueta={`${c.vencidos} lotes vencidos en ${c.centro}`} />
    ),
  },
  {
    clave: "porVencer",
    encabezado: "Por vencer (90 días)",
    alinear: "derecha",
    celda: (c) => (
      <ConteoCentro valor={c.porVencer} tono="alerta" href={`/alertas?tab=por-vencer&centro=${c.centroId}`} etiqueta={`${c.porVencer} lotes por vencer en ${c.centro}`} />
    ),
  },
];

/** Atajos al inventario con el filtro de estado aplicado (`/inventario?estado=`). */
const ESTADOS_INVENTARIO = [
  { estado: "SIN_STOCK", etiqueta: "Sin stock" },
  { estado: "BAJO_MINIMO", etiqueta: "Bajo mínimo" },
  { estado: "POR_VENCER", etiqueta: "Por vencer" },
  { estado: "VENCIDO", etiqueta: "Vencidos" },
] as const;

/** Qué significa la tarjeta "Lotes vencidos" para cada rol (solo el administrador puede darlos de baja). */
const DETALLE_VENCIDOS: Record<Rol, string> = {
  ADMIN: "Dar de baja como merma",
  BODEGUERO: "Sepáralos y avisa a tu administrador para darlos de baja",
  VISITANTE: "Con stock físico aún registrado",
};

export default async function PaginaPanel({ searchParams }: PageProps<"/panel">) {
  const { sesion, actor, centroId, centro, centros } = await contextoPagina("panel:ver");
  const [{ aviso }, resumen, ubicaciones] = await Promise.all([
    searchParams,
    resumenPanel(actor, { centroId }),
    puede(actor.rol, "movimientos:ingreso") ? listarUbicaciones(actor, { centroId }) : [],
  ]);
  const { alertas } = resumen;
  const nombre = sesion.usuario.nombre.split(" ")[0];
  const porVencerMasAdelante = alertas.porVencer60 + alertas.porVencer90;
  const esAdmin = actor.rol === "ADMIN";
  const esVisitante = !puede(actor.rol, "movimientos:ingreso") && !puede(actor.rol, "movimientos:retiro");
  const puedeRegistrar = puede(actor.rol, "movimientos:ingreso") || puede(actor.rol, "movimientos:retiro");
  const totalMovimientos = resumen.actividad.reduce((s, d) => s + d.movimientos, 0);

  return (
    <>
      <PageHeader
        titulo={`Hola, ${nombre}`}
        descripcion={
          <>
            {centro ? centro.nombre : "Resumen de toda la red"} · {formatearDia(hoyEnSantiago())}
          </>
        }
        acciones={
          esAdmin ? (
            <>
              <Link href="/movimientos/retiro" className={buttonClasses({ variant: "secundario" })}>
                <ArrowUpFromLine aria-hidden />
                Registrar retiro
              </Link>
              <Link href="/movimientos/ingreso" className={buttonClasses()}>
                <ArrowDownToLine aria-hidden />
                Registrar ingreso
              </Link>
            </>
          ) : undefined
        }
      />

      {aviso === "password-actualizada" ? (
        <Alert tono="exito" className="mb-5">
          Tu contraseña se actualizó correctamente.
        </Alert>
      ) : null}

      {/* Bodeguero: sus dos tareas del día, grandes y arriba. */}
      {!esAdmin && puedeRegistrar ? <AccionesPrincipales rol={actor.rol} className="mb-4" /> : null}

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          etiqueta="Sin stock"
          valor={formatearNumero(alertas.sinStock)}
          detalle={alertas.sinStock === 0 ? "Todo con existencias" : esVisitante ? "Sin stock utilizable" : "Requieren reposición"}
          icono={PackageX}
          tono={alertas.sinStock > 0 ? "peligro" : "exito"}
          href="/alertas?tab=sin-stock"
        />
        <StatCard
          etiqueta="Bajo el mínimo"
          valor={formatearNumero(alertas.bajoMinimo)}
          detalle={alertas.bajoMinimo === 0 ? "Sobre el mínimo" : esVisitante ? "Con stock, pero bajo su mínimo" : "Conviene reponer pronto"}
          icono={TriangleAlert}
          tono={alertas.bajoMinimo > 0 ? "alerta" : "exito"}
          href="/alertas?tab=bajo-minimo"
        />
        <StatCard
          etiqueta="Lotes vencidos"
          valor={formatearNumero(alertas.vencidos)}
          detalle={alertas.vencidos === 0 ? "Sin vencidos en stock" : DETALLE_VENCIDOS[actor.rol]}
          icono={CalendarX2}
          tono={alertas.vencidos > 0 ? "peligro" : "exito"}
          href="/alertas?tab=vencidos"
        />
        <StatCard
          etiqueta="Vencen en 30 días"
          valor={formatearNumero(alertas.porVencer30)}
          detalle={`${formatearNumero(porVencerMasAdelante)} más entre 31 y 90 días`}
          icono={CalendarClock}
          tono={alertas.porVencer30 > 0 ? "alerta" : "exito"}
          href="/alertas?tab=por-vencer&tramo=30"
        />
      </section>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-3">
        <div className="grid min-w-0 gap-4 xl:col-span-2">
        <AtencionHoy
          atencion={resumen.atencion}
          mostrarCentro={!centro && centros.length > 1}
          rol={actor.rol}
          ubicacionesIngreso={ubicacionesDeIngreso(ubicaciones)}
        />

        {resumen.puedeVerMovimientos ? (
          <Card>
            <CardHeader
              titulo="Actividad de los últimos 14 días"
              descripcion={`${pluralizar(resumen.movimientosHoy, "movimiento")} hoy · ${pluralizar(totalMovimientos, "movimiento")} en el período`}
            />
            {totalMovimientos === 0 ? (
              <EmptyState compacto icono={History} titulo="Sin actividad en el período" />
            ) : (
              <GraficoActividad dias={diasParaGrafico(resumen.actividad)} />
            )}
          </Card>
        ) : (
          <Card>
            <div className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-info-50 text-info-700">
                <Eye className="size-[1.375rem]" aria-hidden />
              </span>
              <div>
                <h2 className="text-base font-semibold tracking-tight">Tu acceso es de solo lectura</h2>
                <p className="mt-1 max-w-prose text-[0.9375rem] text-texto-suave">
                  Puedes consultar qué hay en inventario, qué falta y qué está por vencer en tus centros, e imprimir o descargar la lista
                  de reposición. Tu rol no registra movimientos.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href="/alertas" className={buttonClasses()}>
                    Ver qué falta
                  </Link>
                  <Link href="/inventario" className={buttonClasses({ variant: "secundario" })}>
                    Ver inventario
                  </Link>
                </div>
              </div>
            </div>
          </Card>
        )}

        </div>

        <div className="grid min-w-0 gap-4 md:max-xl:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader
              titulo="Vencimientos"
              descripcion="Lotes con stock, por días restantes"
            />
            <GraficoVencimientos tramos={resumen.vencimientos} />
          </Card>

          <Card className="min-w-0">
            <CardHeader titulo="Existencias" descripcion={centro ? "Con stock en este centro" : "Con stock en toda la red"} />
            <div className="flex items-center gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-marca-50 text-marca-700">
                <Boxes className="size-6" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="cifras text-3xl font-semibold tracking-tight">{formatearNumero(resumen.insumosConStock)}</p>
                <p className="text-sm text-texto-suave">{resumen.insumosConStock === 1 ? "insumo" : "insumos"}</p>
              </div>
              <div className="ml-auto shrink-0 text-right">
                <p className="cifras text-3xl font-semibold tracking-tight">{formatearNumero(resumen.lotesConStock)}</p>
                <p className="text-sm text-texto-suave">{resumen.lotesConStock === 1 ? "lote" : "lotes"}</p>
              </div>
            </div>
            <div className="mt-4 border-t border-borde pt-3">
              <p className="text-xs font-medium text-texto-suave">Ver en inventario</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {ESTADOS_INVENTARIO.map((e) => (
                  <li key={e.estado}>
                    <Link
                      href={`/inventario?estado=${e.estado}`}
                      className="inline-flex min-h-9 items-center rounded-full border border-borde-fuerte/70 bg-superficie px-3 text-sm max-md:min-h-11 pointer-coarse:min-h-11 font-medium text-texto-suave hover:border-marca-400 hover:text-marca-800"
                    >
                      {e.etiqueta}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href="/inventario"
                    className="inline-flex min-h-9 items-center gap-0.5 rounded-full px-2 text-sm max-md:min-h-11 pointer-coarse:min-h-11 font-medium text-marca-700 underline-offset-4 hover:underline"
                  >
                    Todo
                    <ChevronRight className="size-4" aria-hidden />
                  </Link>
                </li>
              </ul>
            </div>
          </Card>
          <Card className="min-w-0 md:max-xl:col-span-2">
            <CardHeader titulo="Accesos rápidos" />
            <AccesosRapidos rol={actor.rol} incluirRegistro={esAdmin} />
          </Card>
        </div>
      </div>

      {!centro && resumen.porCentro.length > 0 ? (
        <Card relleno={false} className="mt-4 overflow-hidden">
          <CardHeader className="mb-0 p-4 sm:p-5" titulo="Alertas por centro" descripcion="Dónde poner atención primero" />
          <DataTable titulo="Alertas por centro" filas={resumen.porCentro} claveFila={(c) => c.centroId} columnas={COLUMNAS_CENTROS} />
        </Card>
      ) : null}

      {resumen.puedeVerMovimientos ? (
        <Card relleno={false} className="mt-4 overflow-hidden">
          <CardHeader
            className="mb-0 p-4 sm:p-5"
            titulo="Actividad reciente"
            descripcion="Últimos movimientos registrados"
            acciones={
              <Link href="/movimientos" className={buttonClasses({ variant: "fantasma", size: "sm" })}>
                Ver todos
              </Link>
            }
          />
          <DataTable
            titulo="Últimos movimientos"
            columnas={columnasMovimientos(!centro && centros.length > 1)}
            filas={resumen.ultimosMovimientos}
            claveFila={(m) => m.id}
            vacio={
              <EmptyState
                compacto
                icono={History}
                titulo="Aún no hay movimientos"
                descripcion="Cuando se registren ingresos o retiros aparecerán aquí."
              />
            }
          />
        </Card>
      ) : null}
    </>
  );
}
