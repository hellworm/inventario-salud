import type * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Boxes,
  CalendarClock,
  CalendarX2,
  Gauge,
  History,
  PackageSearch,
  SlidersHorizontal,
  Snowflake,
  Trash2,
} from "lucide-react";
import {
  Alert,
  BadgeActivo,
  BadgeEstadoStock,
  BadgeEstadoVencimiento,
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
import { ETIQUETA_TIPO_UBICACION, SIGNO_MOVIMIENTO, type TipoUbicacion } from "@/lib/estados";
import { describirVencimiento, formatearDia, formatearFechaHora } from "@/lib/fechas";
import { formatearNumero } from "@/lib/formato";
import { esAdministrador, puede, veTodaLaRed } from "@/lib/permisos";
import { cantidadConUnidad, unidadSegun } from "@/lib/unidades";
import { contextoPagina, obtenerSesion } from "@/server/auth/sesion";
import { esErrorDominio } from "@/server/errores";
import {
  detalleInsumo,
  listarMovimientos,
  obtenerOpcionInsumo,
  type DetalleInsumo,
  type ExistenciaDetalle,
  type FilaMovimiento,
  type ParametroDetalle,
} from "@/server/servicios";
import { BotonCorregirVencimiento } from "@/components/inventario/corregir-vencimiento";
import { SinCentroActivo } from "@/components/shell/sin-centro";

/** Título de pestaña con el nombre real del insumo (o el genérico si no existe o no hay acceso). */
export async function generateMetadata({ params }: PageProps<"/inventario/[insumoId]">): Promise<Metadata> {
  const { insumoId } = await params;
  const sesion = await obtenerSesion();
  if (!sesion || !puede(sesion.usuario.rol, "catalogo:ver")) return { title: "Ficha del insumo" };
  const insumo = await obtenerOpcionInsumo(sesion.actor, insumoId).catch(() => null);
  return { title: insumo ? `${insumo.nombre} · Inventario` : "Insumo no encontrado" };
}

const ULTIMOS_MOVIMIENTOS = 10;

async function cargarDetalle(...args: Parameters<typeof detalleInsumo>): Promise<DetalleInsumo> {
  try {
    return await detalleInsumo(...args);
  } catch (error) {
    if (esErrorDominio(error) && error.codigo === "NO_ENCONTRADO") notFound();
    throw error;
  }
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-texto-suave">{etiqueta}</dt>
      <dd className="min-w-0 text-right text-sm font-medium break-words text-texto">{children}</dd>
    </div>
  );
}

function BarraMinimo({ parametro, unidad }: { parametro: ParametroDetalle; unidad: string }) {
  const tope = Math.max(parametro.stockMaximo ?? 0, parametro.stockMinimo * 2, parametro.disponible, 1);
  const porcentaje = Math.min((parametro.disponible / tope) * 100, 100);
  const marca = Math.min((parametro.stockMinimo / tope) * 100, 100);
  const color =
    parametro.estadoStock === "SIN_STOCK" ? "bg-peligro-600" : parametro.estadoStock === "BAJO_MINIMO" ? "bg-alerta-500" : "bg-marca-500";
  return (
    <li className="py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-semibold text-texto">{parametro.centro}</p>
        <BadgeEstadoStock estado={parametro.estadoStock} />
      </div>
      <div className="relative mt-2.5 h-2 rounded-full bg-borde/70" aria-hidden>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${porcentaje}%` }} />
        <div className="absolute -top-1 h-4 w-0.5 rounded-full bg-texto" style={{ left: `${marca}%` }} />
      </div>
      <p className="cifras mt-2 text-sm text-texto-suave">
        <strong className="font-semibold text-texto">{cantidadConUnidad(parametro.disponible, unidad)}</strong>{" "}
        {parametro.disponible === 1 ? "disponible" : "disponibles"} · mínimo {formatearNumero(parametro.stockMinimo)}
        {parametro.stockMaximo !== null ? ` · máximo ${formatearNumero(parametro.stockMaximo)}` : ""}
      </p>
    </li>
  );
}

export default async function PaginaInsumo({ params }: PageProps<"/inventario/[insumoId]">) {
  const { actor, centroId, centro, sinCentro } = await contextoPagina("inventario:ver");
  if (sinCentro) return <SinCentroActivo titulo="Inventario" />;
  const { insumoId } = await params;
  const puedeVerMovimientos = puede(actor.rol, "movimientos:ver");
  const [detalle, movimientos] = await Promise.all([
    cargarDetalle(actor, insumoId, { centroId }),
    puedeVerMovimientos ? listarMovimientos(actor, { centroId, insumoId, porPagina: ULTIMOS_MOVIMIENTOS }) : null,
  ]);
  const { insumo } = detalle;
  const unidad = insumo.unidadMedida;
  const mostrarCentro = centro === null;
  const permisos = {
    ingresar: puede(actor.rol, "movimientos:ingreso") && insumo.activo,
    retirar: puede(actor.rol, "movimientos:retiro"),
    trasladar: puede(actor.rol, "movimientos:traslado"),
    ajustar: puede(actor.rol, "movimientos:ajuste"),
    darDeBaja: puede(actor.rol, "movimientos:merma"),
    // Corregir la fecha de un lote es solo del administrador (el servicio lo vuelve a exigir).
    corregirVencimiento: esAdministrador(actor.rol) && puede(actor.rol, "movimientos:ajuste"),
  };
  const lotesConStock = new Set(detalle.existencias.map((e) => e.loteId)).size;
  const diasProximo = detalle.existencias.find((e) => e.fechaVencimiento === detalle.proximoVencimiento && e.estadoVencimiento !== "VENCIDO")?.diasParaVencer ?? null;
  const claseAccionFila = buttonClasses({ variant: "secundario", size: "sm" });

  const columnasExistencias: Columna<ExistenciaDetalle>[] = [
    {
      clave: "lote",
      encabezado: "Lote",
      movil: "titulo",
      celda: (e) => <span className="cifras font-semibold whitespace-nowrap">{e.numeroLote}</span>,
    },
    {
      clave: "ubicacion",
      encabezado: "Ubicación",
      celda: (e) => (
        <span className="block min-w-0">
          <span className="line-clamp-2">{e.ubicacion}</span>
          <span className="line-clamp-2 text-xs text-texto-suave">
            {mostrarCentro ? e.centro : ETIQUETA_TIPO_UBICACION[e.tipoUbicacion as TipoUbicacion]}
          </span>
        </span>
      ),
    },
    {
      clave: "vencimiento",
      encabezado: "Vencimiento",
      celda: (e) => (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {e.fechaVencimiento ? <span className="cifras whitespace-nowrap">{formatearDia(e.fechaVencimiento)}</span> : null}
          <BadgeEstadoVencimiento estado={e.estadoVencimiento} dias={e.diasParaVencer} />
        </span>
      ),
    },
    {
      clave: "cantidad",
      encabezado: "Cantidad",
      alinear: "derecha",
      movil: "destacado",
      celda: (e) => (
        <span className="cifras whitespace-nowrap">
          <strong className="text-base font-semibold">{formatearNumero(e.cantidad)}</strong>{" "}
          <span className="text-texto-suave">{unidadSegun(e.cantidad, unidad)}</span>
        </span>
      ),
    },
    ...(permisos.retirar || permisos.darDeBaja
      ? [
          {
            clave: "acciones",
            encabezado: "Acción",
            alinear: "derecha",
            className: "whitespace-nowrap",
            movilAncho: true,
            celda: (e) => (
              <span className="flex flex-wrap items-center justify-end gap-1.5 max-md:justify-start">
                {permisos.corregirVencimiento ? (
                  <BotonCorregirVencimiento
                    lote={{ loteId: e.loteId, numeroLote: e.numeroLote, fechaVencimiento: e.fechaVencimiento }}
                    insumo={insumo.nombre}
                    controlaVencimiento={insumo.controlaVencimiento}
                  />
                ) : null}
                {e.estadoVencimiento === "VENCIDO" ? (
                  permisos.darDeBaja ? (
                    <Link
                      href={`/movimientos/ajuste?tipo=merma&insumo=${insumo.id}&ubicacion=${e.ubicacionId}&lote=${e.loteId}`}
                      className={claseAccionFila}
                    >
                      <Trash2 aria-hidden />
                      Dar de baja
                    </Link>
                  ) : (
                    <span className="text-xs text-texto-tenue">No retirable</span>
                  )
                ) : permisos.retirar ? (
                  <Link href={`/movimientos/retiro?insumo=${insumo.id}&ubicacion=${e.ubicacionId}&lote=${e.loteId}`} className={claseAccionFila}>
                    <ArrowUpFromLine aria-hidden />
                    Retirar
                  </Link>
                ) : null}
              </span>
            ),
          } satisfies Columna<ExistenciaDetalle>,
        ]
      : []),
  ];

  const columnasMovimientos: Columna<FilaMovimiento>[] = [
    {
      clave: "fecha",
      encabezado: "Fecha",
      movil: "titulo",
      celda: (m) => <span className="cifras whitespace-nowrap">{formatearFechaHora(m.creadoEn)}</span>,
    },
    { clave: "tipo", encabezado: "Tipo", movil: "destacado", celda: (m) => <BadgeTipoMovimiento tipo={m.tipo} /> },
    {
      clave: "cantidad",
      encabezado: "Cantidad",
      alinear: "derecha",
      celda: (m) => (
        <span className={`cifras font-semibold ${SIGNO_MOVIMIENTO[m.tipo] > 0 ? "text-exito-700" : "text-texto"}`}>
          {SIGNO_MOVIMIENTO[m.tipo] > 0 ? "+" : "−"}
          {formatearNumero(m.cantidad)}
        </span>
      ),
    },
    {
      clave: "lote",
      encabezado: "Lote y ubicación",
      celda: (m) => (
        <span className="block min-w-0">
          <span className="cifras block">{m.numeroLote}</span>
          <span className="line-clamp-2 text-xs text-texto-suave">
            {m.ubicacion}
            {mostrarCentro ? ` · ${m.centro}` : ""}
          </span>
        </span>
      ),
    },
    { clave: "usuario", encabezado: "Usuario", celda: (m) => <span className="whitespace-nowrap">{m.usuario}</span> },
  ];

  return (
    <>
      <PageHeader
        titulo={insumo.nombre}
        descripcion={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="cifras">{insumo.codigo}</span>
            <span aria-hidden>·</span>
            <span>{insumo.categoria}</span>
            {insumo.requiereCadenaFrio ? (
              <span className="inline-flex items-center gap-1 font-medium text-info-700">
                <Snowflake className="size-4" aria-hidden />
                Cadena de frío
              </span>
            ) : null}
            {!insumo.activo ? <BadgeActivo activo={false} /> : null}
          </span>
        }
        volver={{ href: "/inventario", label: "Inventario" }}
        acciones={
          permisos.retirar || permisos.ingresar ? (
            <>
              {permisos.retirar ? (
                <Link
                  href={`/movimientos/retiro?insumo=${insumo.id}`}
                  aria-disabled={detalle.disponible === 0 || undefined}
                  className={buttonClasses({ variant: "secundario" })}
                >
                  <ArrowUpFromLine aria-hidden />
                  Registrar retiro
                </Link>
              ) : null}
              {permisos.ingresar ? (
                <Link href={`/movimientos/ingreso?insumo=${insumo.id}`} className={buttonClasses()}>
                  <ArrowDownToLine aria-hidden />
                  Registrar ingreso
                </Link>
              ) : null}
            </>
          ) : undefined
        }
      />

      {!insumo.activo ? (
        <Alert tono="alerta" titulo="Insumo inactivo en el catálogo" className="mb-4">
          No admite nuevos ingresos. El stock que queda se puede seguir retirando o dando de baja.
        </Alert>
      ) : null}

      <section aria-label="Resumen de stock" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          etiqueta={centro ? "Disponible en el centro" : veTodaLaRed(actor) ? "Disponible en la red" : "Disponible en tu institución"}
          valor={formatearNumero(detalle.disponible)}
          detalle={`${unidadSegun(detalle.disponible, unidad)} en ${lotesConStock} ${lotesConStock === 1 ? "lote" : "lotes"}`}
          icono={Boxes}
          tono={detalle.estadoStock === "SIN_STOCK" ? "peligro" : detalle.estadoStock === "BAJO_MINIMO" ? "alerta" : "exito"}
        />
        <StatCard
          etiqueta="Stock mínimo"
          valor={detalle.stockMinimo !== null ? formatearNumero(detalle.stockMinimo) : "—"}
          detalle={
            detalle.stockMinimo === null
              ? "Sin mínimo definido"
              : detalle.estadoStock === "OK"
                ? "Sobre el mínimo"
                : detalle.estadoStock === "SIN_STOCK"
                  ? "Sin stock disponible"
                  : `Faltan ${formatearNumero(detalle.stockMinimo - detalle.disponible)} para el mínimo`
          }
          icono={Gauge}
          tono={detalle.stockMinimo === null || detalle.estadoStock === "OK" ? "exito" : detalle.estadoStock === "SIN_STOCK" ? "peligro" : "alerta"}
        />
        <StatCard
          etiqueta="Próximo vencimiento"
          valor={detalle.proximoVencimiento ? formatearDia(detalle.proximoVencimiento) : "—"}
          detalle={
            detalle.proximoVencimiento
              ? `${describirVencimiento(diasProximo)}${detalle.porVencer > 0 ? ` · ${formatearNumero(detalle.porVencer)} por vencer` : ""}`
              : insumo.controlaVencimiento
                ? "Sin lotes vigentes con fecha"
                : "No controla vencimiento"
          }
          icono={CalendarClock}
          tono={detalle.porVencer > 0 ? "alerta" : "exito"}
        />
        <StatCard
          etiqueta="Vencido"
          valor={formatearNumero(detalle.vencido)}
          detalle={detalle.vencido > 0 ? "No se puede usar: dar de baja" : "Sin stock vencido"}
          icono={CalendarX2}
          tono={detalle.vencido > 0 ? "peligro" : "exito"}
        />
      </section>

      <div className="mt-4 grid grid-cols-1 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <Card relleno={false} className="overflow-hidden">
            <CardHeader
              className="mb-0 p-4 sm:p-5"
              titulo="Existencias por lote y ubicación"
              descripcion={
                detalle.existencias.length > 0
                  ? `${cantidadConUnidad(detalle.total, unidad)} en total${detalle.vencido > 0 ? `, ${formatearNumero(detalle.vencido)} en lotes vencidos` : ""} · ordenado por vencimiento`
                  : undefined
              }
              acciones={
                permisos.trasladar || permisos.ajustar ? (
                  <>
                    {permisos.trasladar && detalle.total > 0 ? (
                      <Link href={`/movimientos/traslado?insumo=${insumo.id}`} className={buttonClasses({ variant: "fantasma", size: "sm" })}>
                        <ArrowLeftRight aria-hidden />
                        Trasladar
                      </Link>
                    ) : null}
                    {permisos.ajustar ? (
                      <Link href={`/movimientos/ajuste?insumo=${insumo.id}`} className={buttonClasses({ variant: "fantasma", size: "sm" })}>
                        <SlidersHorizontal aria-hidden />
                        Ajustar
                      </Link>
                    ) : null}
                  </>
                ) : undefined
              }
            />
            <DataTable
              titulo="Existencias por lote y ubicación"
              columnas={columnasExistencias}
              filas={detalle.existencias}
              claveFila={(e) => e.existenciaId}
              claseFila={(e) => (e.estadoVencimiento === "VENCIDO" ? "bg-peligro-50/40" : undefined)}
              vacio={
                <EmptyState
                  compacto
                  icono={PackageSearch}
                  titulo="Sin existencias"
                  descripcion={
                    centro ? `No hay stock de este insumo en ${centro.nombre}.` : "No hay stock de este insumo en ninguno de tus centros."
                  }
                  accion={
                    permisos.ingresar ? (
                      <Link href={`/movimientos/ingreso?insumo=${insumo.id}`} className={buttonClasses()}>
                        <ArrowDownToLine aria-hidden />
                        Registrar ingreso
                      </Link>
                    ) : undefined
                  }
                />
              }
            />
          </Card>

          {movimientos ? (
            <Card relleno={false} className="overflow-hidden">
              <CardHeader
                className="mb-0 p-4 sm:p-5"
                titulo="Últimos movimientos"
                descripcion={
                  movimientos.total > ULTIMOS_MOVIMIENTOS
                    ? `Los ${ULTIMOS_MOVIMIENTOS} más recientes de ${formatearNumero(movimientos.total)}`
                    : undefined
                }
                acciones={
                  movimientos.total > 0 ? (
                    <Link href={`/movimientos?insumo=${insumo.id}`} className={buttonClasses({ variant: "fantasma", size: "sm" })}>
                      Ver todos
                    </Link>
                  ) : undefined
                }
              />
              <DataTable
                titulo="Últimos movimientos del insumo"
                columnas={columnasMovimientos}
                filas={movimientos.items}
                claveFila={(m) => m.id}
                vacio={
                  <EmptyState
                    compacto
                    icono={History}
                    titulo="Sin movimientos"
                    descripcion="Aún no se registran ingresos ni retiros de este insumo aquí."
                  />
                }
              />
            </Card>
          ) : null}
        </div>

        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 2xl:grid-cols-1">
          <Card>
            <CardHeader titulo="Ficha del catálogo" />
            <dl className="-my-2.5 divide-y divide-borde">
              <Dato etiqueta="Código">
                <span className="cifras">{insumo.codigo}</span>
              </Dato>
              <Dato etiqueta="Categoría">{insumo.categoria}</Dato>
              <Dato etiqueta="Unidad de medida">{unidad}</Dato>
              <Dato etiqueta="Presentación">{insumo.presentacion ?? "—"}</Dato>
              <Dato etiqueta="Fabricante">{insumo.fabricante ?? "—"}</Dato>
              <Dato etiqueta="Registro ISP">
                <span className="cifras">{insumo.registroSanitario ?? "—"}</span>
              </Dato>
              <Dato etiqueta="Código de barras">
                <span className="cifras">{insumo.codigoBarras ?? "—"}</span>
              </Dato>
              <Dato etiqueta="Cadena de frío">{insumo.requiereCadenaFrio ? "Sí, requiere refrigeración" : "No"}</Dato>
              <Dato etiqueta="Vencimiento">{insumo.controlaVencimiento ? "Se controla por lote" : "No se controla"}</Dato>
            </dl>
            {insumo.descripcion ? <p className="mt-4 border-t border-borde pt-4 text-sm text-texto-suave">{insumo.descripcion}</p> : null}
          </Card>

          <Card>
            <CardHeader
              titulo={mostrarCentro ? "Stock mínimo por centro" : "Stock mínimo del centro"}
              descripcion="Disponible frente al mínimo definido"
            />
            {detalle.parametros.length === 0 ? (
              <p className="text-sm text-texto-suave">
                No hay un mínimo definido{mostrarCentro ? " en ningún centro" : " para este centro"}: no se generan alertas de stock bajo.
              </p>
            ) : (
              <ul className="divide-y divide-borde">
                {detalle.parametros.map((p) => (
                  <BarraMinimo key={p.centroId} parametro={p} unidad={unidad} />
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
