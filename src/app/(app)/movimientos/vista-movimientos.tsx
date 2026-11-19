"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight, FilterX, History, SearchX, SlidersHorizontal } from "lucide-react";
import {
  Alert,
  BadgeTipoMovimiento,
  Button,
  buttonClasses,
  Card,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  Field,
  Input,
  Pagination,
  SearchInput,
  Select,
  Skeleton,
} from "@/components/ui";
import { enfocarFila, useParametrosUrl } from "@/components/inventario/parametros-url";
import { SelectUbicacion } from "@/components/movimientos/campos";
import { ComboboxInsumo, type InsumoOpcion } from "@/components/movimientos/combobox-insumo";
import { cn } from "@/lib/cn";
import { ETIQUETA_TIPO_MOVIMIENTO, SIGNO_MOVIMIENTO, TIPOS_MOVIMIENTO, type TipoMovimiento } from "@/lib/estados";
import { formatearDia, formatearFechaHora } from "@/lib/fechas";
import { formatearCLP, formatearNumero } from "@/lib/formato";
import type { Paginado } from "@/lib/resultado";
import { cantidadConUnidad, unidadSegun } from "@/lib/unidades";
import type { FilaMovimiento, OpcionUbicacion, OpcionUsuarioMovimientos } from "@/server/servicios";

export interface FiltrosMovimientosVista {
  q: string;
  tipo: TipoMovimiento | "";
  desde: string;
  hasta: string;
  ubicacion: string;
  usuario: string;
  insumo: string;
}

export interface VistaMovimientosProps {
  movimientos: Paginado<FilaMovimiento>;
  ubicaciones: OpcionUbicacion[];
  usuarios: OpcionUsuarioMovimientos[];
  insumosIniciales: InsumoOpcion[];
  insumoFiltro: InsumoOpcion | null;
  filtros: FiltrosMovimientosVista;
  /** Movimiento abierto en el detalle (`?mov=`). */
  movId: string | null;
  detalle: FilaMovimiento | null;
  /** Salida y entrada del traslado al que pertenece el detalle (si aplica). */
  traslado: FilaMovimiento[];
  mostrarCentro: boolean;
}

function Cantidad({ m, conUnidad = true }: { m: FilaMovimiento; conUnidad?: boolean }) {
  const suma = SIGNO_MOVIMIENTO[m.tipo] > 0;
  return (
    <span className="cifras whitespace-nowrap">
      <strong className={cn("font-semibold", suma ? "text-exito-700" : "text-texto")}>
        {suma ? "+" : "−"}
        {formatearNumero(m.cantidad)}
      </strong>
      {conUnidad ? <span className="text-texto-suave"> {unidadSegun(m.cantidad, m.unidadMedida)}</span> : null}
    </span>
  );
}

export function VistaMovimientos({
  movimientos,
  ubicaciones,
  usuarios,
  insumosIniciales,
  insumoFiltro,
  filtros,
  movId,
  detalle,
  traslado,
  mostrarCentro,
}: VistaMovimientosProps) {
  const { urlCon, filtrar, pendiente, iniciar, router } = useParametrosUrl();
  const [idAbierto, setIdAbierto] = React.useOptimistic(movId);
  const [navegando, iniciarDetalle] = React.useTransition();
  const [filtrosAbiertos, setFiltrosAbiertos] = React.useState(false);
  const [limpiezas, setLimpiezas] = React.useState(0);

  const ultimoAbierto = React.useRef<string | null>(movId);
  const abrir = (id: string) =>
    iniciarDetalle(() => {
      ultimoAbierto.current = id;
      setIdAbierto(id);
      router.push(urlCon({ mov: id }, { conservarPagina: true }), { scroll: false });
    });
  const cerrar = () =>
    iniciarDetalle(() => {
      setIdAbierto(null);
      router.replace(urlCon({ mov: null }, { conservarPagina: true }), { scroll: false });
    });
  const limpiar = () => {
    setLimpiezas((n) => n + 1);
    iniciar(() => router.replace("/movimientos", { scroll: false }));
  };

  const activos = [filtros.tipo, filtros.desde, filtros.hasta, filtros.ubicacion, filtros.usuario, filtros.insumo].filter(Boolean).length;
  const hayFiltros = activos > 0 || Boolean(filtros.q);
  const rangoInvertido = Boolean(filtros.desde && filtros.hasta && filtros.desde > filtros.hasta);
  // Mientras llega el detalle del servidor se muestra la fila que ya está en pantalla.
  const abierto = idAbierto ? ((detalle?.id === idAbierto ? detalle : null) ?? movimientos.items.find((m) => m.id === idAbierto) ?? null) : null;

  return (
    <>
      <Card className="mb-4">
        <div className="flex gap-2">
          <SearchInput
            key={limpiezas}
            valorInicial={limpiezas > 0 ? "" : undefined}
            className="min-w-0 flex-1"
            placeholder="Insumo, lote o guía"
            label="Buscar en los movimientos"
          />
          <Button
            variant="secundario"
            className="shrink-0 lg:hidden"
            aria-expanded={filtrosAbiertos}
            aria-controls="filtros-movimientos"
            onClick={() => setFiltrosAbiertos((v) => !v)}
          >
            <SlidersHorizontal aria-hidden />
            <span className="max-sm:sr-only">Filtros</span>
            {activos > 0 ? (
              <span className="cifras flex size-5 items-center justify-center rounded-full bg-marca-600 text-xs font-semibold text-white">{activos}</span>
            ) : null}
          </Button>
        </div>
        <div
          id="filtros-movimientos"
          className={cn("mt-4 grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2 lg:grid lg:grid-cols-3 xl:grid-cols-6", !filtrosAbiertos && "hidden")}
        >
          <Field label="Tipo">
            <Select
              value={filtros.tipo}
              onChange={(e) => filtrar({ tipo: e.target.value })}
              placeholder="Todos"
              opciones={TIPOS_MOVIMIENTO.map((t) => ({ value: t, label: ETIQUETA_TIPO_MOVIMIENTO[t] }))}
            />
          </Field>
          <Field label="Desde" ayuda={filtros.desde ? `Desde el ${formatearDia(filtros.desde)}` : undefined}>
            <Input type="date" lang="es-CL" className="cifras" value={filtros.desde} max={filtros.hasta || undefined} onChange={(e) => filtrar({ desde: e.target.value })} />
          </Field>
          <Field label="Hasta" ayuda={filtros.hasta ? `Hasta el ${formatearDia(filtros.hasta)}` : undefined}>
            <Input type="date" lang="es-CL" className="cifras" value={filtros.hasta} min={filtros.desde || undefined} onChange={(e) => filtrar({ hasta: e.target.value })} />
          </Field>
          <Field label="Ubicación">
            <SelectUbicacion ubicaciones={ubicaciones} valor={filtros.ubicacion} onCambiar={(id) => filtrar({ ubicacion: id })} placeholder="Todas" />
          </Field>
          <Field label="Usuario">
            <Select
              value={filtros.usuario}
              onChange={(e) => filtrar({ usuario: e.target.value })}
              placeholder="Todos"
              opciones={usuarios.map((u) => ({ value: u.id, label: u.nombre }))}
            />
          </Field>
          <Field label="Insumo">
            <ComboboxInsumo
              key={`${limpiezas}-${insumoFiltro?.id ?? ""}`}
              compacto
              valor={insumoFiltro}
              onCambiar={(insumo) => filtrar({ insumo: insumo?.id ?? null })}
              iniciales={insumosIniciales}
              placeholder="Todos"
            />
          </Field>
        </div>
        {rangoInvertido ? (
          <Alert tono="alerta" className="mt-4">
            La fecha “Desde” es posterior a “Hasta”: no hay movimientos en ese rango.
          </Alert>
        ) : null}
      </Card>

      <div className="mb-2 flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1">
        <p className="text-sm text-texto-suave" role="status" aria-live="polite">
          <strong className="cifras font-semibold text-texto">{formatearNumero(movimientos.total)}</strong>{" "}
          {movimientos.total === 1 ? "movimiento" : "movimientos"}
          {hayFiltros ? " con estos filtros" : ""} · más recientes primero
        </p>
        {hayFiltros ? (
          <Button variant="fantasma" size="sm" onClick={limpiar}>
            <FilterX aria-hidden />
            Limpiar filtros
          </Button>
        ) : null}
      </div>

      <Card relleno={false} className={cn("overflow-hidden transition-opacity", pendiente && "opacity-60")} aria-busy={pendiente || undefined}>
        {movimientos.items.length === 0 ? (
          hayFiltros ? (
            <EmptyState
              compacto
              icono={SearchX}
              titulo="Ningún movimiento coincide"
              descripcion="Amplía el rango de fechas o quita algún filtro."
              accion={
                <Button variant="secundario" onClick={limpiar}>
                  Limpiar filtros
                </Button>
              }
            />
          ) : (
            <EmptyState
              compacto
              icono={History}
              titulo="Aún no hay movimientos"
              descripcion="Cuando se registren ingresos, retiros o traslados aparecerán aquí."
            />
          )
        ) : (
          <>
            {/* Tabla desde `lg`: a 768 px (tablet vertical) las 6 columnas no caben y se usan las tarjetas. */}
            <div className="relative hidden overflow-x-auto lg:block">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">Historial de movimientos. Elige un movimiento para ver su detalle.</caption>
                <thead>
                  <tr className="border-b border-borde bg-superficie-2 text-xs tracking-wide text-texto-suave uppercase">
                    <th scope="col" className="px-4 py-3 text-left font-semibold">
                      Fecha<span className="xl:hidden"> y usuario</span>
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold">Tipo</th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold">Insumo y lote</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Cantidad</th>
                    <th scope="col" className="hidden px-4 py-3 text-right font-semibold whitespace-nowrap xl:table-cell">Saldo del lote</th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold">Ubicación</th>
                    <th scope="col" className="hidden px-4 py-3 text-left font-semibold xl:table-cell">Usuario</th>
                    <th scope="col" className="w-10 px-2 py-3">
                      <span className="sr-only">Ver detalle</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {movimientos.items.map((m) => (
                    <tr
                      key={m.id}
                      onClick={() => abrir(m.id)}
                      className={cn("cursor-pointer transition-colors hover:bg-marca-50/50", idAbierto === m.id && "bg-marca-50")}
                    >
                      <td className="px-4 py-3 align-middle">
                        <button
                          type="button"
                          aria-haspopup="dialog"
                          data-fila={m.id}
                          aria-label={`Ver detalle: ${ETIQUETA_TIPO_MOVIMIENTO[m.tipo]} de ${m.insumoNombre}, ${formatearFechaHora(m.creadoEn)}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            abrir(m.id);
                          }}
                          className="cifras inline-flex items-center rounded-md whitespace-nowrap text-texto pointer-coarse:min-h-11"
                        >
                          {formatearFechaHora(m.creadoEn)}
                        </button>
                        <span className="block max-w-40 truncate text-xs text-texto-suave xl:hidden">{m.usuario}</span>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <BadgeTipoMovimiento tipo={m.tipo} />
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span className="line-clamp-2 font-medium text-texto" title={m.insumoNombre}>
                          {m.insumoNombre}
                        </span>
                        <span className="cifras block truncate text-xs text-texto-suave">Lote {m.numeroLote}</span>
                      </td>
                      <td className="px-4 py-3 text-right align-middle">
                        <Cantidad m={m} />
                      </td>
                      <td className="cifras hidden px-4 py-3 text-right align-middle text-texto-suave xl:table-cell">{formatearNumero(m.saldoPosterior)}</td>
                      <td className="px-4 py-3 align-middle">
                        <span className="line-clamp-2 text-texto">{m.ubicacion}</span>
                        {mostrarCentro ? <span className="line-clamp-2 text-xs text-texto-suave">{m.centro}</span> : null}
                      </td>
                      <td className="hidden px-4 py-3 align-middle whitespace-nowrap text-texto-suave xl:table-cell">{m.usuario}</td>
                      <td className="px-2 py-3 align-middle text-texto-tenue">
                        <ChevronRight className="size-5" aria-hidden />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-borde lg:hidden" aria-label="Historial de movimientos">
              {movimientos.items.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    data-fila={m.id}
                    onClick={() => abrir(m.id)}
                    className={cn("block w-full px-4 py-3.5 text-left active:bg-marca-50", idAbierto === m.id && "bg-marca-50")}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-[0.9375rem] leading-snug font-semibold text-texto">{m.insumoNombre}</span>
                        <span className="cifras mt-0.5 block text-xs text-texto-suave">Lote {m.numeroLote}</span>
                      </span>
                      <span className="shrink-0 text-right text-base">
                        <Cantidad m={m} conUnidad={false} />
                        <span className="block text-xs text-texto-suave">{unidadSegun(m.cantidad, m.unidadMedida)}</span>
                      </span>
                    </span>
                    <span className="mt-2 flex items-center justify-between gap-3">
                      <BadgeTipoMovimiento tipo={m.tipo} />
                      <span className="cifras text-xs text-texto-suave">{formatearFechaHora(m.creadoEn)}</span>
                    </span>
                    <span className="mt-1.5 flex items-center justify-between gap-3 text-xs text-texto-suave">
                      <span className="min-w-0">
                        {m.ubicacion}
                        {mostrarCentro ? ` · ${m.centro}` : ""} · {m.usuario}
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

      <Pagination {...movimientos} className="mt-4" />

      <Dialog
        open={idAbierto !== null}
        onOpenChange={(estaAbierto) => {
          if (!estaAbierto) cerrar();
        }}
      >
        <DialogContent
          ancho="lg"
          titulo={abierto ? `${ETIQUETA_TIPO_MOVIMIENTO[abierto.tipo]} · ${abierto.insumoNombre}` : "Detalle del movimiento"}
          descripcion={abierto ? `Registrado el ${formatearFechaHora(abierto.creadoEn)} por ${abierto.usuario}` : undefined}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            enfocarFila(ultimoAbierto.current);
          }}
        >
          {abierto ? (
            <DetalleMovimiento m={abierto} traslado={detalle?.id === abierto.id ? traslado : []} onCerrar={cerrar} />
          ) : navegando || movId !== idAbierto ? (
            <div className="space-y-3" role="status" aria-label="Cargando movimiento">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <Alert tono="alerta" titulo="No encontramos este movimiento">
              Puede que el enlace esté incompleto o que pertenezca a un centro al que no tienes acceso.
            </Alert>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Dato({ etiqueta, children, ancho }: { etiqueta: string; children: React.ReactNode; ancho?: boolean }) {
  return (
    <div className={cn("min-w-0", ancho && "sm:col-span-2")}>
      <dt className="text-xs font-medium tracking-wide text-texto-tenue uppercase">{etiqueta}</dt>
      <dd className="mt-0.5 text-[0.9375rem] break-words text-texto">{children}</dd>
    </div>
  );
}

function DetalleMovimiento({ m, traslado, onCerrar }: { m: FilaMovimiento; traslado: FilaMovimiento[]; onCerrar: () => void }) {
  const suma = SIGNO_MOVIMIENTO[m.tipo] > 0;
  const salida = traslado.find((t) => t.tipo === "TRASLADO_SALIDA");
  const entrada = traslado.find((t) => t.tipo === "TRASLADO_ENTRADA");
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-superficie-2 px-4 py-3 ring-1 ring-borde ring-inset">
        <div>
          <BadgeTipoMovimiento tipo={m.tipo} />
          <p className={cn("cifras mt-1.5 text-2xl font-semibold tracking-tight", suma ? "text-exito-700" : "text-texto")}>
            {suma ? "+" : "−"}
            {cantidadConUnidad(m.cantidad, m.unidadMedida)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-texto-suave">Saldo del lote después</p>
          <p className="cifras text-lg font-semibold text-texto">{cantidadConUnidad(m.saldoPosterior, m.unidadMedida)}</p>
          <p className="text-xs text-texto-tenue">en {m.ubicacion}</p>
        </div>
      </div>

      {salida && entrada ? (
        <div className="mt-4 grid items-center gap-x-4 gap-y-2 rounded-control border border-borde px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <p className="min-w-0">
            <span className="block text-xs font-medium tracking-wide text-texto-tenue uppercase">Origen</span>
            <span className="block font-medium text-texto">{salida.ubicacion}</span>
            <span className="block text-texto-suave">{salida.centro}</span>
          </p>
          <ArrowRight className="size-5 shrink-0 text-texto-tenue max-sm:rotate-90" aria-label="hacia" />
          <p className="min-w-0">
            <span className="block text-xs font-medium tracking-wide text-texto-tenue uppercase">Destino</span>
            <span className="block font-medium text-texto">{entrada.ubicacion}</span>
            <span className="block text-texto-suave">{entrada.centro}</span>
          </p>
        </div>
      ) : null}

      <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Dato etiqueta="Insumo">
          {m.insumoNombre}
          <span className="cifras block text-sm text-texto-suave">{m.insumoCodigo}</span>
        </Dato>
        <Dato etiqueta="Lote">
          <span className="cifras">{m.numeroLote}</span>
          <span className="cifras block text-sm text-texto-suave">
            {m.fechaVencimiento ? `Vence ${formatearDia(m.fechaVencimiento)}` : "Sin vencimiento"}
          </span>
        </Dato>
        <Dato etiqueta="Ubicación">
          {m.ubicacion}
          <span className="block text-sm text-texto-suave">{m.centro}</span>
        </Dato>
        <Dato etiqueta="Registrado por">
          {m.usuario}
          <span className="cifras block text-sm text-texto-suave">{formatearFechaHora(m.creadoEn)}</span>
        </Dato>
        {m.tipo === "INGRESO" || m.proveedor ? <Dato etiqueta="Proveedor">{m.proveedor ?? "—"}</Dato> : null}
        {m.tipo === "INGRESO" || m.documentoRef ? <Dato etiqueta="Guía o factura">{m.documentoRef ?? "—"}</Dato> : null}
        {m.costoUnitario !== null ? (
          <Dato etiqueta="Costo unitario">
            <span className="cifras">{formatearCLP(m.costoUnitario)}</span>
            <span className="cifras block text-sm text-texto-suave">Total {formatearCLP(m.costoUnitario * m.cantidad)}</span>
          </Dato>
        ) : null}
        {m.tipo !== "INGRESO" || m.motivo ? <Dato etiqueta={m.tipo === "RETIRO" ? "Destino o motivo" : "Motivo"}>{m.motivo ?? "—"}</Dato> : null}
        <Dato etiqueta="Nota" ancho>
          {m.nota ?? "—"}
        </Dato>
      </dl>

      {/* Dato técnico (útil para soporte o auditoría): discreto, fuera de la ficha. */}
      <p className="mt-5 border-t border-borde pt-3 text-xs text-texto-suave">
        Identificador del registro: <span className="font-mono break-all select-all">{m.id}</span>
      </p>

      <DialogFooter>
        <Button variant="secundario" onClick={onCerrar}>
          Cerrar
        </Button>
        <Link href={`/inventario/${m.insumoId}`} className={buttonClasses()}>
          Ver el insumo
        </Link>
      </DialogFooter>
    </>
  );
}
