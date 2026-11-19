import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Eye,
  History,
  PackageX,
  TriangleAlert,
} from "lucide-react";
import { AccesosRapidos, AccionesPrincipales, BotonEscanearPanel } from "@/components/panel/accesos-rapidos";
import { ubicacionesDeIngreso } from "@/components/alertas/acciones";
import { AtencionHoy } from "@/components/panel/atencion-hoy";
import { GraficoActividad, type DiaActividad } from "@/components/panel/grafico-actividad";
import { DirectorioProveedores } from "@/components/panel/directorio-proveedores";
import { SemaforoVencimientos } from "@/components/panel/semaforo-vencimientos";
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
import { textoParam } from "@/lib/parametros";
import { esAdministrador, fraseAlcanceTotal, puede, veTodaLaRed } from "@/lib/permisos";
import { ResumenInstituciones } from "@/components/panel/resumen-instituciones";
import { contextoPagina } from "@/server/auth/sesion";
import {
  listarDirectorioProveedores,
  listarUbicaciones,
  resumenPanel,
  resumenPorInstitucion,
  type ActividadDia,
  type FilaMovimiento,
  type ResumenCentro,
} from "@/server/servicios";
import { SinCentroActivo } from "@/components/shell/sin-centro";

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
    clave: "rojo",
    encabezado: "Rojo",
    alinear: "derecha",
    celda: (c) => (
      <ConteoCentro valor={c.rojo} tono="peligro" href={`/alertas?tab=rojo&centro=${c.centroId}`} etiqueta={`${c.rojo} lotes en rojo en ${c.centro}`} />
    ),
  },
  {
    clave: "amarillo",
    encabezado: "Amarillo",
    alinear: "derecha",
    celda: (c) => (
      <ConteoCentro valor={c.amarillo} tono="alerta" href={`/alertas?tab=amarillo&centro=${c.centroId}`} etiqueta={`${c.amarillo} lotes en amarillo en ${c.centro}`} />
    ),
  },
];

/** Proveedores que se listan en el panel (el resto, en /proveedores). */
const PROVEEDORES_EN_PANEL = 6;

export default async function PaginaPanel({ searchParams }: PageProps<"/panel">) {
  const { sesion, actor, centroId, centro, centros, sinCentro } = await contextoPagina("panel:ver");
  if (sinCentro) return <SinCentroActivo titulo="Panel" />;
  const [{ aviso, institucion }, resumen, ubicaciones, directorio] = await Promise.all([
    searchParams,
    resumenPanel(actor, { centroId }),
    puede(actor.rol, "movimientos:ingreso") ? listarUbicaciones(actor, { centroId }) : [],
    puede(actor.rol, "proveedores:ver") ? listarDirectorioProveedores(actor, { centroId, limite: PROVEEDORES_EN_PANEL }) : null,
  ]);
  const { alertas } = resumen;
  const nombre = sesion.usuario.nombre.split(" ")[0];
  // "El complejo total": solo el administrador de la red, en la vista "Toda la red".
  const redPorInstitucion = veTodaLaRed(actor) && !centro ? await resumenPorInstitucion(actor, resumen.porCentro) : null;
  const esAdmin = esAdministrador(actor.rol);
  const esVisitante = !puede(actor.rol, "movimientos:ingreso") && !puede(actor.rol, "movimientos:retiro");
  const puedeRegistrar = puede(actor.rol, "movimientos:ingreso") || puede(actor.rol, "movimientos:retiro");
  const totalMovimientos = resumen.actividad.reduce((s, d) => s + d.movimientos, 0);

  return (
    <>
      <PageHeader
        titulo={`Hola, ${nombre}`}
        descripcion={
          <>
            {centro ? centro.nombre : `Resumen de ${fraseAlcanceTotal(actor.rol)}`} · {formatearDia(hoyEnSantiago())}
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

      {/* Celular y tablet: escanear con la cámara para ingresar un producto. */}
      <BotonEscanearPanel rol={actor.rol} className="mb-3" />
      {/* Bodeguero: sus dos tareas del día, grandes y arriba. */}
      {!esAdmin && puedeRegistrar ? <AccionesPrincipales rol={actor.rol} className="mb-4" /> : null}

      <section
        aria-label="Indicadores"
        className={cn("grid grid-cols-2 gap-3 sm:gap-4", resumen.puedeVerMovimientos ? "xl:grid-cols-4" : "md:grid-cols-3")}
      >
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
          etiqueta="Insumos con stock"
          valor={formatearNumero(resumen.insumosConStock)}
          detalle={`en ${pluralizar(resumen.lotesConStock, "lote")}${centro ? "" : ` · ${fraseAlcanceTotal(actor.rol)}`}`}
          icono={Boxes}
          tono="marca"
          href="/inventario"
          // En celular quedan solo "qué falta"; el semáforo sube a la primera pantalla.
          className="max-md:hidden"
        />
        {resumen.puedeVerMovimientos ? (
          <StatCard
            etiqueta="Movimientos de hoy"
            valor={formatearNumero(resumen.movimientosHoy)}
            detalle="Ingresos, retiros y ajustes"
            icono={History}
            tono="neutro"
            href="/movimientos"
            className="max-md:hidden"
          />
        ) : null}
      </section>

      {redPorInstitucion ? (
        <ResumenInstituciones instituciones={redPorInstitucion} seleccionadaId={textoParam(institucion)} className="mt-4" />
      ) : null}

      <SemaforoVencimientos
        className="mt-4"
        semaforo={resumen.semaforo}
        enRojo={resumen.enRojo}
        mostrarCentro={!centro && centros.length > 1}
        rol={actor.rol}
      />

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
              // El gráfico cuenta movimientos, no unidades (cajas + ampollas + litros no se suman).
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
          {directorio ? (
            <Card relleno={false} className="min-w-0 overflow-hidden">
              <CardHeader
                className="mb-0 p-4 sm:p-5"
                titulo="Proveedores"
                descripcion="Dónde comprar y a quién llamar"
                acciones={
                  // Siempre visible: es la entrada al directorio completo (con buscador) para los cuatro roles.
                  directorio.total > 0 ? (
                    <Link href="/proveedores" className={buttonClasses({ variant: "fantasma", size: "sm" })}>
                      Ver todos{directorio.total > directorio.items.length ? ` (${formatearNumero(directorio.total)})` : ""}
                    </Link>
                  ) : undefined
                }
              />
              <div className="border-t border-borde">
                <DirectorioProveedores proveedores={directorio.items} puedeEditar={puede(actor.rol, "proveedores:gestionar")} />
              </div>
            </Card>
          ) : null}
          <Card className="min-w-0">
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
