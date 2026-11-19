import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CalendarClock,
  CalendarX2,
  History,
  PackageX,
  TriangleAlert,
} from "lucide-react";
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
import { SIGNO_MOVIMIENTO } from "@/lib/estados";
import { formatearDia, formatearFechaHora, hoyEnSantiago } from "@/lib/fechas";
import { formatearNumero, pluralizar } from "@/lib/formato";
import { puede } from "@/lib/permisos";
import { contextoPagina } from "@/server/auth/sesion";
import { resumenPanel, type ActividadDia, type FilaMovimiento } from "@/server/servicios";

export const metadata: Metadata = { title: "Panel" };

const COLUMNAS_MOVIMIENTOS: Columna<FilaMovimiento>[] = [
  {
    clave: "insumo",
    encabezado: "Insumo",
    movil: "titulo",
    celda: (m) => (
      <span className="block min-w-0">
        <span className="block truncate font-medium">{m.insumoNombre}</span>
        <span className="block truncate text-xs font-normal text-texto-tenue">
          Lote {m.numeroLote} · {m.ubicacion}
        </span>
      </span>
    ),
  },
  { clave: "tipo", encabezado: "Tipo", movil: "destacado", celda: (m) => <BadgeTipoMovimiento tipo={m.tipo} /> },
  {
    clave: "cantidad",
    encabezado: "Cantidad",
    alinear: "derecha",
    celda: (m) => (
      <span className="cifras font-semibold">
        {SIGNO_MOVIMIENTO[m.tipo] > 0 ? "+" : "−"}
        {formatearNumero(m.cantidad)} <span className="font-normal text-texto-tenue">{m.unidadMedida}</span>
      </span>
    ),
  },
  { clave: "centro", encabezado: "Centro", celda: (m) => m.centro },
  { clave: "usuario", encabezado: "Usuario", movil: "oculto", celda: (m) => m.usuario },
  {
    clave: "fecha",
    encabezado: "Fecha",
    alinear: "derecha",
    celda: (m) => <span className="cifras whitespace-nowrap text-texto-suave">{formatearFechaHora(m.creadoEn)}</span>,
  },
];

function GraficoActividad({ actividad }: { actividad: ActividadDia[] }) {
  const maximo = Math.max(1, ...actividad.flatMap((d) => [d.entradas, d.salidas]));
  const totalEntradas = actividad.reduce((s, d) => s + d.entradas, 0);
  const totalSalidas = actividad.reduce((s, d) => s + d.salidas, 0);
  if (totalEntradas + totalSalidas === 0) {
    return <EmptyState compacto icono={History} titulo="Sin actividad en el período" />;
  }
  return (
    <figure>
      <div className="flex h-36 items-end gap-1 sm:gap-1.5" aria-hidden>
        {actividad.map((d) => (
          <div key={d.dia} className="flex h-full min-w-0 flex-1 items-end justify-center gap-px sm:gap-0.5" title={`${formatearDia(d.dia)}: +${formatearNumero(d.entradas)} / −${formatearNumero(d.salidas)}`}>
            <span className="w-1/2 max-w-3 rounded-t-sm bg-marca-500" style={{ height: `${Math.max((d.entradas / maximo) * 100, d.entradas > 0 ? 3 : 0)}%` }} />
            <span className="w-1/2 max-w-3 rounded-t-sm bg-alerta-500" style={{ height: `${Math.max((d.salidas / maximo) * 100, d.salidas > 0 ? 3 : 0)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between border-t border-borde pt-1.5 text-xs text-texto-tenue" aria-hidden>
        <span>{formatearDia(actividad[0]?.dia).slice(0, 5)}</span>
        <span>Hoy</span>
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-texto-suave">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-marca-500" aria-hidden />
          Entradas: <strong className="cifras font-semibold text-texto">{formatearNumero(totalEntradas)}</strong>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-alerta-500" aria-hidden />
          Salidas: <strong className="cifras font-semibold text-texto">{formatearNumero(totalSalidas)}</strong>
        </span>
      </figcaption>
    </figure>
  );
}

export default async function PaginaPanel({ searchParams }: PageProps<"/panel">) {
  const { sesion, actor, centroId, centro } = await contextoPagina("panel:ver");
  const [{ aviso }, resumen] = await Promise.all([searchParams, resumenPanel(actor, { centroId })]);
  const { alertas } = resumen;
  const nombre = sesion.usuario.nombre.split(" ")[0];
  const porVencerMasAdelante = alertas.porVencer60 + alertas.porVencer90;

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
          <>
            {puede(actor.rol, "movimientos:retiro") ? (
              <Link href="/movimientos/retiro" className={buttonClasses({ variant: "secundario" })}>
                <ArrowUpFromLine aria-hidden />
                Registrar retiro
              </Link>
            ) : null}
            {puede(actor.rol, "movimientos:ingreso") ? (
              <Link href="/movimientos/ingreso" className={buttonClasses()}>
                <ArrowDownToLine aria-hidden />
                Registrar ingreso
              </Link>
            ) : null}
          </>
        }
      />

      {aviso === "password-actualizada" ? (
        <Alert tono="exito" className="mb-5">
          Tu contraseña se actualizó correctamente.
        </Alert>
      ) : null}

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          etiqueta="Sin stock"
          valor={formatearNumero(alertas.sinStock)}
          detalle={alertas.sinStock === 0 ? "Todo con existencias" : "Requieren reposición"}
          icono={PackageX}
          tono={alertas.sinStock > 0 ? "peligro" : "exito"}
          href="/alertas"
        />
        <StatCard
          etiqueta="Bajo el mínimo"
          valor={formatearNumero(alertas.bajoMinimo)}
          detalle={alertas.bajoMinimo === 0 ? "Sobre el mínimo" : "Conviene reponer pronto"}
          icono={TriangleAlert}
          tono={alertas.bajoMinimo > 0 ? "alerta" : "exito"}
          href="/alertas"
        />
        <StatCard
          etiqueta="Lotes vencidos"
          valor={formatearNumero(alertas.vencidos)}
          detalle={alertas.vencidos === 0 ? "Sin vencidos en stock" : "Retirar y dar de baja"}
          icono={CalendarX2}
          tono={alertas.vencidos > 0 ? "peligro" : "exito"}
          href="/alertas"
        />
        <StatCard
          etiqueta="Vencen en 30 días"
          valor={formatearNumero(alertas.porVencer30)}
          detalle={`${formatearNumero(porVencerMasAdelante)} más entre 31 y 90 días`}
          icono={CalendarClock}
          tono={alertas.porVencer30 > 0 ? "alerta" : "exito"}
          href="/alertas"
        />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader titulo="Existencias" descripcion={centro ? "En este centro" : "En toda la red"} />
          <div className="flex items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-marca-50 text-marca-700">
              <Boxes className="size-6" aria-hidden />
            </span>
            <div>
              <p className="cifras text-3xl font-semibold tracking-tight">{formatearNumero(resumen.insumosConStock)}</p>
              <p className="text-sm text-texto-suave">insumos con stock</p>
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-borde pt-4 text-sm">
            <div>
              <dt className="text-texto-tenue">Lotes</dt>
              <dd className="cifras text-lg font-semibold">{formatearNumero(resumen.lotesConStock)}</dd>
            </div>
            <div>
              <dt className="text-texto-tenue">Unidades</dt>
              <dd className="cifras text-lg font-semibold">{formatearNumero(resumen.unidadesTotales)}</dd>
            </div>
          </dl>
          <Link href="/inventario" className={buttonClasses({ variant: "secundario", bloque: true }) + " mt-5"}>
            Ver inventario
          </Link>
        </Card>

        {resumen.puedeVerMovimientos ? (
          <Card className="lg:col-span-2">
            <CardHeader
              titulo="Actividad de los últimos 14 días"
              descripcion={`${pluralizar(resumen.movimientosHoy, "movimiento")} hoy · unidades que entran y salen por día`}
            />
            <GraficoActividad actividad={resumen.actividad} />
          </Card>
        ) : (
          <Card className="lg:col-span-2">
            <CardHeader titulo="Tu acceso" descripcion="Perfil de solo lectura" />
            <p className="text-[0.9375rem] text-texto-suave">
              Puedes consultar qué hay en inventario, qué falta y qué está por vencer en tus centros. Para registrar
              movimientos, pide a un administrador que cambie tu rol.
            </p>
            <Link href="/alertas" className={buttonClasses({ variant: "secundario" }) + " mt-5"}>
              Ver alertas
            </Link>
          </Card>
        )}
      </div>

      {!centro && resumen.porCentro.length > 0 ? (
        <Card relleno={false} className="mt-4 overflow-hidden">
          <CardHeader className="mb-0 p-4 sm:p-5" titulo="Alertas por centro" descripcion="Dónde poner atención primero" />
          <DataTable
            titulo="Alertas por centro"
            filas={resumen.porCentro}
            claveFila={(c) => c.centroId}
            columnas={[
              { clave: "centro", encabezado: "Centro", movil: "titulo", celda: (c) => <span className="font-medium">{c.centro}</span> },
              { clave: "sinStock", encabezado: "Sin stock", alinear: "derecha", celda: (c) => <span className="cifras">{formatearNumero(c.sinStock)}</span> },
              { clave: "bajoMinimo", encabezado: "Bajo mínimo", alinear: "derecha", celda: (c) => <span className="cifras">{formatearNumero(c.bajoMinimo)}</span> },
              { clave: "vencidos", encabezado: "Vencidos", alinear: "derecha", celda: (c) => <span className="cifras">{formatearNumero(c.vencidos)}</span> },
              { clave: "porVencer", encabezado: "Por vencer (90 días)", alinear: "derecha", celda: (c) => <span className="cifras">{formatearNumero(c.porVencer)}</span> },
            ]}
          />
        </Card>
      ) : null}

      {resumen.puedeVerMovimientos ? (
        <Card relleno={false} className="mt-4 overflow-hidden">
          <CardHeader
            className="mb-0 p-4 sm:p-5"
            titulo="Últimos movimientos"
            acciones={
              <Link href="/movimientos" className={buttonClasses({ variant: "fantasma", size: "sm" })}>
                Ver todos
              </Link>
            }
          />
          <DataTable
            titulo="Últimos movimientos"
            columnas={COLUMNAS_MOVIMIENTOS}
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
