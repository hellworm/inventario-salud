"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  ChevronRight,
  FileText,
  FilterX,
  PackageSearch,
  SearchX,
  Snowflake,
  Trash2,
} from "lucide-react";
import {
  Alert,
  BadgeActivo,
  BadgeEstadoStock,
  Button,
  buttonClasses,
  Card,
  EmptyState,
  Pagination,
  SearchInput,
  Select,
  LeyendaSemaforo,
  SEMAFORO_UI,
  Sheet,
  SheetContent,
  Skeleton,
} from "@/components/ui";
import { ExistenciasPorUbicacion, SemaforoInsumo } from "@/components/inventario/existencias";
import { COLOR_DE_FILTRO, ETIQUETA_ESTADO_VENCIMIENTO, FILTROS_SEMAFORO, type EstadoStock, type FiltroSemaforo } from "@/lib/estados";
import { enfocarFila, useParametrosUrl } from "@/components/inventario/parametros-url";
import { cn } from "@/lib/cn";
import { formatearDia } from "@/lib/fechas";
import { formatearNumero } from "@/lib/formato";
import type { Paginado } from "@/lib/resultado";
import { unidadSegun } from "@/lib/unidades";
import type {
  DetalleInsumo,
  FilaInventario,
  OpcionCategoria,
  OpcionUbicacion,
  OrdenInventario,
} from "@/server/servicios";

// El filtro `?estado=` es solo de STOCK (`ESTADOS_STOCK`); el vencimiento se filtra con `?semaforo=`.
const ESTADOS: readonly { valor: EstadoStock | ""; etiqueta: string }[] = [
  { valor: "", etiqueta: "Todos" },
  { valor: "SIN_STOCK", etiqueta: "Sin stock" },
  { valor: "BAJO_MINIMO", etiqueta: "Bajo mínimo" },
  { valor: "OK", etiqueta: "Stock suficiente" },
];

const CLASE_CHIP =
  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors pointer-fine:min-h-10";
const CLASE_CHIP_ACTIVO = "border-marca-600 bg-marca-600 text-white";
const CLASE_CHIP_INACTIVO = "border-borde-fuerte/70 bg-superficie text-texto-suave hover:border-borde-fuerte hover:text-texto";
const CLASE_ETIQUETA_FILTRO = "w-24 shrink-0 text-xs font-medium text-texto-suave max-sm:hidden";

const ORDENES: readonly { valor: OrdenInventario; etiqueta: string }[] = [
  { valor: "NOMBRE", etiqueta: "Nombre (A–Z)" },
  { valor: "CODIGO", etiqueta: "Código" },
  { valor: "DISPONIBLE_ASC", etiqueta: "Menos stock primero" },
  { valor: "DISPONIBLE_DESC", etiqueta: "Más stock primero" },
  { valor: "VENCIMIENTO", etiqueta: "Vence antes primero" },
];

export interface FiltrosVista {
  q: string;
  categoria: string;
  ubicacion: string;
  estado: EstadoStock | "";
  /** Valor canónico de `?semaforo=` ("rojo", "rojo,amarillo"…) o vacío. */
  semaforo: string;
  orden: OrdenInventario | "";
}

export interface PermisosVista {
  ingresar: boolean;
  retirar: boolean;
  darDeBaja: boolean;
  trasladar: boolean;
}

export interface VistaInventarioProps {
  inventario: Paginado<FilaInventario>;
  categorias: OpcionCategoria[];
  ubicaciones: OpcionUbicacion[];
  filtros: FiltrosVista;
  /** Insumo abierto en el panel lateral (`?ver=`). */
  verId: string | null;
  detalle: DetalleInsumo | null;
  mostrarCentro: boolean;
  permisos: PermisosVista;
}

export function VistaInventario({ inventario, categorias, ubicaciones, filtros, verId, detalle, mostrarCentro, permisos }: VistaInventarioProps) {
  const { urlCon, filtrar, pendiente, iniciar, router } = useParametrosUrl();
  // El panel se abre al instante (optimista) mientras el servidor trae los lotes.
  const [idAbierto, setIdAbierto] = React.useOptimistic(verId);
  const [navegando, iniciarPanel] = React.useTransition();

  const ultimoAbierto = React.useRef<string | null>(verId);
  const abrir = (insumoId: string) =>
    iniciarPanel(() => {
      ultimoAbierto.current = insumoId;
      setIdAbierto(insumoId);
      router.push(urlCon({ ver: insumoId }, { conservarPagina: true }), { scroll: false });
    });
  const cerrar = () =>
    iniciarPanel(() => {
      setIdAbierto(null);
      router.replace(urlCon({ ver: null }, { conservarPagina: true }), { scroll: false });
    });

  // "Limpiar filtros" también vacía el buscador (se vuelve a montar sin texto).
  const [limpiezas, setLimpiezas] = React.useState(0);
  const limpiar = () => {
    setLimpiezas((n) => n + 1);
    iniciar(() => router.replace("/inventario", { scroll: false }));
  };

  const hayFiltros = Boolean(filtros.q || filtros.categoria || filtros.ubicacion || filtros.estado || filtros.semaforo);
  const semaforoActivo = new Set(filtros.semaforo ? filtros.semaforo.split(",") : []);
  /** Un toque elige ese color; tocar el único color elegido lo quita. */
  const alternarSemaforo = (f: FiltroSemaforo) =>
    filtrar({ semaforo: semaforoActivo.size === 1 && semaforoActivo.has(f) ? null : f });
  const centros = [...new Map(ubicaciones.map((u) => [u.centroId, u.centro])).entries()];
  const filaAbierta = inventario.items.find((f) => f.insumoId === idAbierto) ?? null;
  const detalleAbierto = detalle && detalle.insumo.id === idAbierto ? detalle : null;
  const ubicacionFiltrada = ubicaciones.find((u) => u.id === filtros.ubicacion) ?? null;
  const cargando = pendiente;

  return (
    <>
      <Card className="mb-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_14rem_14rem_15rem]">
          <SearchInput
            key={limpiezas}
            valorInicial={limpiezas > 0 ? "" : undefined}
            placeholder="Nombre, código o lote"
            label="Buscar en el inventario"
          />
          <Select
            aria-label="Categoría"
            value={filtros.categoria}
            onChange={(e) => filtrar({ categoria: e.target.value })}
            placeholder="Todas las categorías"
            opciones={categorias.map((c) => ({ value: c.id, label: c.nombre }))}
          />
          <Select aria-label="Ubicación" value={filtros.ubicacion} onChange={(e) => filtrar({ ubicacion: e.target.value })} placeholder="Todas las ubicaciones">
            {centros.length > 1
              ? centros.map(([centroId, centro]) => (
                  <optgroup key={centroId} label={centro}>
                    {ubicaciones
                      .filter((u) => u.centroId === centroId)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nombre}
                        </option>
                      ))}
                  </optgroup>
                ))
              : ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
          </Select>
          <Select
            aria-label="Ordenar por"
            value={filtros.orden || "NOMBRE"}
            onChange={(e) => filtrar({ orden: e.target.value === "NOMBRE" ? null : e.target.value })}
            opciones={ORDENES.map((o) => ({ value: o.valor, label: `Orden: ${o.etiqueta}` }))}
          />
        </div>
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:-mx-5 sm:px-5" role="group" aria-label="Filtrar por estado de stock">
          <span className={CLASE_ETIQUETA_FILTRO} aria-hidden>
            Stock
          </span>
          {ESTADOS.map((e) => {
            const activo = filtros.estado === e.valor;
            return (
              <button
                key={e.valor || "todos"}
                type="button"
                aria-pressed={activo}
                onClick={() => filtrar({ estado: e.valor || null })}
                className={cn(CLASE_CHIP, activo ? CLASE_CHIP_ACTIVO : CLASE_CHIP_INACTIVO)}
              >
                {e.valor === "" ? (
                  <>
                    <span className="sm:hidden">Todo el stock</span>
                    <span className="max-sm:hidden">Todos</span>
                  </>
                ) : (
                  e.etiqueta
                )}
              </button>
            );
          })}
        </div>
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:-mx-5 sm:px-5" role="group" aria-label="Filtrar por semáforo de vencimiento">
          <span className={CLASE_ETIQUETA_FILTRO} aria-hidden>
            Vencimiento
          </span>
          <button
            type="button"
            aria-pressed={semaforoActivo.size === 0}
            onClick={() => filtrar({ semaforo: null })}
            className={cn(CLASE_CHIP, semaforoActivo.size === 0 ? CLASE_CHIP_ACTIVO : CLASE_CHIP_INACTIVO)}
          >
            <span className="sm:hidden">Todo vencimiento</span>
            <span className="max-sm:hidden">Todos</span>
          </button>
          {FILTROS_SEMAFORO.map((f) => {
            const color = COLOR_DE_FILTRO[f];
            const { icono: Icono, texto } = SEMAFORO_UI[color];
            const activo = semaforoActivo.has(f);
            return (
              <button
                key={f}
                type="button"
                aria-pressed={activo}
                onClick={() => alternarSemaforo(f)}
                className={cn(CLASE_CHIP, activo ? CLASE_CHIP_ACTIVO : CLASE_CHIP_INACTIVO)}
              >
                <Icono className={cn("size-4 shrink-0", activo ? "text-white" : texto)} aria-hidden />
                {color === "VENCIDO" ? "Vencidos" : ETIQUETA_ESTADO_VENCIMIENTO[color]}
              </button>
            );
          })}
        </div>
        <LeyendaSemaforo conVencido={false} className="border-t border-borde pt-3" />
      </Card>

      <div className="mb-2 flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1">
        <p className="text-sm text-texto-suave" role="status" aria-live="polite">
          <strong className="cifras font-semibold text-texto">{formatearNumero(inventario.total)}</strong>{" "}
          {inventario.total === 1 ? "insumo" : "insumos"}
          {hayFiltros ? " con estos filtros" : ""}
          {ubicacionFiltrada ? ` · con stock en ${ubicacionFiltrada.nombre}` : ""}
        </p>
        {hayFiltros ? (
          <Button variant="fantasma" size="sm" onClick={limpiar}>
            <FilterX aria-hidden />
            Limpiar filtros
          </Button>
        ) : null}
      </div>

      <Card relleno={false} className={cn("overflow-hidden transition-opacity", cargando && "opacity-60")} aria-busy={cargando || undefined}>
        {inventario.items.length === 0 ? (
          hayFiltros ? (
            <EmptyState
              compacto
              icono={SearchX}
              titulo="Ningún insumo coincide"
              descripcion="Prueba con otra palabra, revisa el número de lote o quita algún filtro."
              accion={
                <Button variant="secundario" onClick={limpiar}>
                  Limpiar filtros
                </Button>
              }
            />
          ) : (
            <EmptyState
              compacto
              icono={PackageSearch}
              titulo="Aún no hay insumos en el inventario"
              descripcion={
                permisos.ingresar
                  ? "Registra el primer ingreso para empezar a ver existencias, lotes y vencimientos."
                  : "Cuando se registren ingresos aparecerán aquí."
              }
              accion={
                permisos.ingresar ? (
                  <Link href="/movimientos/ingreso" className={buttonClasses()}>
                    <ArrowDownToLine aria-hidden />
                    Registrar ingreso
                  </Link>
                ) : undefined
              }
            />
          )
        ) : (
          <>
            {/* Escritorio / tablet */}
            <div className="relative hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">Inventario por insumo. Elige un insumo para ver sus lotes y ubicaciones.</caption>
                <thead>
                  <tr className="border-b border-borde bg-superficie-2 text-xs tracking-wide text-texto-suave uppercase">
                    <th scope="col" className="px-4 py-3 text-left font-semibold">Insumo</th>
                    <th scope="col" className="hidden px-4 py-3 text-left font-semibold xl:table-cell">Categoría</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold whitespace-nowrap">Disponible</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Lotes</th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold whitespace-nowrap">Vencimiento</th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold">Stock</th>
                    <th scope="col" className="w-10 px-2 py-3">
                      <span className="sr-only">Ver lotes</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {inventario.items.map((f) => (
                    <tr
                      key={f.insumoId}
                      onClick={() => abrir(f.insumoId)}
                      className={cn("cursor-pointer transition-colors hover:bg-marca-50/50", idAbierto === f.insumoId && "bg-marca-50")}
                    >
                      <td className="max-w-0 px-4 py-3 align-middle lg:w-[34%]">
                        <button
                          type="button"
                          aria-haspopup="dialog"
                          data-fila={f.insumoId}
                          onClick={(e) => {
                            e.stopPropagation();
                            abrir(f.insumoId);
                          }}
                          className="block max-w-full rounded-md text-left pointer-coarse:min-h-11"
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[0.9375rem] font-semibold text-texto">{f.nombre}</span>
                            {f.requiereCadenaFrio ? <Snowflake className="size-4 shrink-0 text-info-700" aria-label="Requiere cadena de frío" /> : null}
                            {!f.activo ? <BadgeActivo activo={false} /> : null}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-texto-suave">
                            <span className="cifras">{f.codigo}</span>
                            {f.presentacion ? ` · ${f.presentacion}` : ""}
                          </span>
                        </button>
                      </td>
                      <td className="hidden max-w-56 truncate px-4 py-3 align-middle text-texto-suave xl:table-cell" title={f.categoria}>
                        {f.categoria}
                      </td>
                      <td className="px-4 py-3 text-right align-middle whitespace-nowrap">
                        <span className="cifras text-base font-semibold text-texto">{formatearNumero(f.disponible)}</span>{" "}
                        <span className="text-texto-suave">{unidadSegun(f.disponible, f.unidadMedida)}</span>
                        {f.enUbicacion !== null || f.stockMinimo !== null ? (
                          <span className="cifras block text-xs text-texto-tenue">
                            {f.enUbicacion !== null ? `${formatearNumero(f.enUbicacion)} en esta ubicación` : `mínimo ${formatearNumero(f.stockMinimo)}`}
                          </span>
                        ) : null}
                      </td>
                      <td className="cifras px-4 py-3 text-right align-middle text-texto">{formatearNumero(f.lotes)}</td>
                      <td className="px-4 py-3 align-middle">
                        {f.lotes > 0 ? (
                          <>
                            <SemaforoInsumo fila={f} />
                            {f.proximoVencimiento ? (
                              <span className="cifras mt-0.5 block text-xs whitespace-nowrap text-texto-tenue">
                                {f.semaforo.VENCIDO > 0 ? "Próximo: " : "Vence el "}
                                {formatearDia(f.proximoVencimiento)}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-texto-tenue">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <BadgeEstadoStock estado={f.estadoStock} />
                      </td>
                      <td className="px-2 py-3 align-middle text-texto-tenue">
                        <ChevronRight className="size-5" aria-hidden />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Móvil: tarjetas */}
            <ul className="divide-y divide-borde md:hidden" aria-label="Inventario por insumo">
              {inventario.items.map((f) => (
                <li key={f.insumoId}>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    data-fila={f.insumoId}
                    onClick={() => abrir(f.insumoId)}
                    className={cn("block w-full px-4 py-3.5 text-left active:bg-marca-50", idAbierto === f.insumoId && "bg-marca-50")}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="text-[0.9375rem] leading-snug font-semibold text-texto">{f.nombre}</span>
                          {f.requiereCadenaFrio ? <Snowflake className="size-4 shrink-0 text-info-700" aria-label="Requiere cadena de frío" /> : null}
                        </span>
                        <span className="mt-0.5 block text-xs text-texto-suave">
                          <span className="cifras">{f.codigo}</span> · {f.categoria}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="cifras block text-xl leading-tight font-semibold text-texto">{formatearNumero(f.disponible)}</span>
                        <span className="block text-xs text-texto-suave">{unidadSegun(f.disponible, f.unidadMedida)}</span>
                      </span>
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-1.5">
                      <BadgeEstadoStock estado={f.estadoStock} />
                      {f.lotes > 0 ? <SemaforoInsumo fila={f} /> : null}
                    </span>
                    <span className="mt-2 flex items-center justify-between gap-3 text-xs text-texto-suave">
                      <span className="cifras">
                        {formatearNumero(f.lotes)} {f.lotes === 1 ? "lote" : "lotes"}
                        {f.proximoVencimiento ? ` · próx. venc. ${formatearDia(f.proximoVencimiento)}` : ""}
                        {f.stockMinimo !== null ? ` · mín. ${formatearNumero(f.stockMinimo)}` : ""}
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-texto-tenue" aria-hidden />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Pagination {...inventario} className="mt-4" />

      <Sheet
        open={idAbierto !== null}
        onOpenChange={(abierto) => {
          if (!abierto) cerrar();
        }}
      >
        <SheetContent
          titulo={detalleAbierto?.insumo.nombre ?? filaAbierta?.nombre ?? "Insumo"}
          descripcion={
            detalleAbierto
              ? `${detalleAbierto.insumo.codigo} · ${detalleAbierto.insumo.categoria}`
              : filaAbierta
                ? `${filaAbierta.codigo} · ${filaAbierta.categoria}`
                : "Lotes y ubicaciones"
          }
          className="w-full sm:w-[30rem]"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            enfocarFila(ultimoAbierto.current);
          }}
        >
          {idAbierto === null ? null : detalleAbierto ? (
            <PanelInsumo detalle={detalleAbierto} mostrarCentro={mostrarCentro} permisos={permisos} />
          ) : navegando || verId !== idAbierto ? (
            <div className="space-y-4 p-5" role="status" aria-label="Cargando lotes">
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : (
            <div className="p-5">
              <Alert tono="alerta" titulo="No encontramos este insumo">
                Puede que el enlace esté incompleto o que el insumo ya no exista.
              </Alert>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function Cifra({ etiqueta, valor, nota, tono }: { etiqueta: string; valor: string; nota?: string; tono?: "peligro" | "alerta" }) {
  return (
    <div className="rounded-control bg-superficie-2 px-3 py-2.5 ring-1 ring-borde ring-inset">
      <dt className="text-xs text-texto-suave">{etiqueta}</dt>
      <dd
        className={cn(
          "cifras text-xl leading-tight font-semibold tracking-tight",
          tono === "peligro" ? "text-peligro-700" : tono === "alerta" ? "text-alerta-800" : "text-texto",
        )}
      >
        {valor}
      </dd>
      {nota ? <dd className="truncate text-xs text-texto-tenue">{nota}</dd> : null}
    </div>
  );
}

function PanelInsumo({ detalle, mostrarCentro, permisos }: { detalle: DetalleInsumo; mostrarCentro: boolean; permisos: PermisosVista }) {
  const { insumo } = detalle;
  const unidad = insumo.unidadMedida;
  const claseAccion = buttonClasses({ variant: "fantasma", size: "sm" }) + " !px-2.5";
  return (
    <>
      <div className="flex-1 space-y-5 p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <BadgeEstadoStock estado={detalle.estadoStock} />
          {detalle.existencias.length > 0 ? (
            <SemaforoInsumo
              fila={{
                estadoVencimiento: detalle.estadoVencimiento,
                semaforo: detalle.semaforo,
                diasParaVencer: detalle.existencias.find((e) => e.estadoVencimiento !== "VENCIDO" && e.fechaVencimiento)?.diasParaVencer ?? null,
              }}
            />
          ) : null}
          {insumo.requiereCadenaFrio ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-info-700">
              <Snowflake className="size-3.5" aria-hidden />
              Cadena de frío
            </span>
          ) : null}
          {!insumo.activo ? <BadgeActivo activo={false} /> : null}
        </div>

        <dl className="grid grid-cols-3 gap-2">
          <Cifra etiqueta="Disponible" valor={formatearNumero(detalle.disponible)} nota={unidadSegun(detalle.disponible, unidad)} />
          <Cifra
            etiqueta="Mínimo"
            valor={detalle.stockMinimo !== null ? formatearNumero(detalle.stockMinimo) : "—"}
            nota={detalle.stockMinimo !== null ? unidadSegun(detalle.stockMinimo, unidad) : "sin definir"}
          />
          <Cifra
            etiqueta="Vencido"
            valor={formatearNumero(detalle.vencido)}
            nota={detalle.vencido > 0 ? "no se puede usar" : "sin vencidos"}
            tono={detalle.vencido > 0 ? "peligro" : undefined}
          />
        </dl>

        <section aria-labelledby="titulo-donde">
          <h3 id="titulo-donde" className="mb-3 text-sm font-semibold tracking-wide text-texto-suave uppercase">
            Dónde está
          </h3>
          {detalle.existencias.length === 0 ? (
            <EmptyState
              compacto
              icono={PackageSearch}
              titulo="Sin existencias"
              descripcion={mostrarCentro ? "No hay stock de este insumo en la red." : "No hay stock de este insumo en este centro."}
            />
          ) : (
            <ExistenciasPorUbicacion
              existencias={detalle.existencias}
              unidad={unidad}
              mostrarCentro={mostrarCentro}
              accionesUbicacion={(g) => (
                <>
                  {permisos.darDeBaja && g.vencido > 0 ? (
                    <Link href={`/movimientos/ajuste?tipo=merma&insumo=${insumo.id}&ubicacion=${g.ubicacionId}`} className={claseAccion}>
                      <Trash2 aria-hidden />
                      Dar de baja
                    </Link>
                  ) : null}
                  {permisos.retirar && g.total - g.vencido > 0 ? (
                    <Link href={`/movimientos/retiro?insumo=${insumo.id}&ubicacion=${g.ubicacionId}`} className={claseAccion}>
                      <ArrowUpFromLine aria-hidden />
                      Retirar
                    </Link>
                  ) : null}
                </>
              )}
            />
          )}
        </section>
      </div>

      <div className="sticky bottom-0 grid gap-2 border-t border-borde bg-superficie p-4">
        {permisos.ingresar || permisos.retirar ? (
          <div className="grid grid-cols-2 gap-2">
            {permisos.retirar ? (
              <Link
                href={`/movimientos/retiro?insumo=${insumo.id}`}
                aria-disabled={detalle.disponible === 0 || undefined}
                className={buttonClasses({ variant: "secundario", size: "lg" })}
              >
                <ArrowUpFromLine aria-hidden />
                Retirar
              </Link>
            ) : null}
            {permisos.ingresar ? (
              <Link
                href={`/movimientos/ingreso?insumo=${insumo.id}`}
                aria-disabled={!insumo.activo || undefined}
                className={cn(buttonClasses({ size: "lg" }), !permisos.retirar && "col-span-2")}
              >
                <ArrowDownToLine aria-hidden />
                Ingresar
              </Link>
            ) : null}
          </div>
        ) : null}
        <div className="flex gap-2">
          <Link href={`/inventario/${insumo.id}`} className={buttonClasses({ variant: "fantasma", bloque: true })}>
            <FileText aria-hidden />
            Ver ficha completa
          </Link>
          {permisos.trasladar && detalle.total > 0 ? (
            <Link href={`/movimientos/traslado?insumo=${insumo.id}`} className={buttonClasses({ variant: "fantasma", bloque: true })}>
              <ArrowLeftRight aria-hidden />
              Trasladar
            </Link>
          ) : null}
        </div>
      </div>
    </>
  );
}
