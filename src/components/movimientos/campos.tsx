"use client";

/**
 * Piezas compartidas por los formularios de movimientos (ingreso, retiro,
 * traslado, ajuste): cantidad con botones grandes, grupos de opciones tipo
 * tarjeta, selector de lote y de ubicación. Pensadas para tablet/celular con
 * guantes: objetivos ≥ 44 px y estados visibles sin depender del color.
 */
import * as React from "react";
import { Check, CircleAlert, Minus, Plus, type LucideIcon } from "lucide-react";
import { BadgeEstadoVencimiento, controlClasses, Select, useCampo } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ETIQUETA_TIPO_UBICACION, type EstadoVencimiento, type TipoUbicacion } from "@/lib/estados";
import { formatearDia, type DiaISO } from "@/lib/fechas";
import { formatearNumero } from "@/lib/formato";
import { unidadSegun } from "@/lib/unidades";

// ---------------------------------------------------------------------------
// Cantidad
// ---------------------------------------------------------------------------

/** Convierte el texto de un campo de cantidad en entero positivo (o `null`). */
export function leerCantidad(texto: string): number | null {
  const limpio = texto.trim();
  if (!/^\d{1,7}$/.test(limpio)) return null;
  const n = Number(limpio);
  return n > 0 ? n : null;
}

export interface CampoCantidadProps {
  valor: string;
  onCambiar: (valor: string) => void;
  /** Unidad de medida en singular (se concuerda con la cantidad). */
  unidad?: string;
  /** Tope para el botón "+", p. ej. el stock disponible. */
  maximo?: number;
  disabled?: boolean;
  name?: string;
  id?: string;
  "aria-describedby"?: string;
}

/** Cantidad entera con botones − / + grandes. Dentro de `<Field>` toma id y aria. */
export function CampoCantidad({ valor, onCambiar, unidad, maximo, disabled, name = "cantidad", ...propias }: CampoCantidadProps) {
  const { invalido, ...campo } = useCampo(propias);
  const actual = leerCantidad(valor) ?? 0;
  const claseBoton =
    "flex size-12 shrink-0 items-center justify-center rounded-control border border-borde-fuerte/70 bg-superficie text-texto shadow-sm " +
    "hover:bg-superficie-2 active:bg-marca-50 disabled:pointer-events-none disabled:opacity-45";
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={claseBoton}
        disabled={disabled || actual <= 1}
        onClick={() => onCambiar(String(Math.max(actual - 1, 1)))}
        aria-label="Restar una unidad"
      >
        <Minus className="size-5" aria-hidden />
      </button>
      <div className="relative min-w-0 flex-1">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          enterKeyHint="done"
          name={name}
          disabled={disabled}
          placeholder="0"
          value={valor}
          {...campo}
          onChange={(e) => onCambiar(e.target.value.replace(/[^\d]/g, "").slice(0, 7))}
          className={cn(controlClasses(invalido), "cifras min-h-12 text-center text-xl font-semibold", unidad && "px-3")}
        />
      </div>
      <button
        type="button"
        className={claseBoton}
        disabled={disabled || (maximo !== undefined && actual >= maximo)}
        onClick={() => onCambiar(String(actual + 1))}
        aria-label="Sumar una unidad"
      >
        <Plus className="size-5" aria-hidden />
      </button>
      {unidad ? (
        <span className="w-20 shrink-0 truncate text-[0.9375rem] text-texto-suave" aria-hidden>
          {unidadSegun(actual || 2, unidad)}
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grupo de opciones (radio) con leyenda y error
// ---------------------------------------------------------------------------

export interface GrupoProps {
  leyenda: React.ReactNode;
  requerido?: boolean;
  error?: string | string[] | null;
  ayuda?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** `<fieldset>` con la misma presentación que `<Field>`, para grupos de radios. */
export function Grupo({ leyenda, requerido, error, ayuda, className, children }: GrupoProps) {
  const id = React.useId();
  const mensaje = Array.isArray(error) ? error[0] : error;
  return (
    <fieldset
      className={cn("min-w-0 space-y-1.5", className)}
      aria-invalid={mensaje ? true : undefined}
      aria-describedby={[mensaje ? `${id}-error` : null, ayuda ? `${id}-ayuda` : null].filter(Boolean).join(" ") || undefined}
    >
      <legend className="mb-1.5 block text-sm font-medium text-texto">
        {leyenda}
        {requerido ? (
          <span className="ml-0.5 text-peligro-600" aria-hidden>
            *
          </span>
        ) : null}
      </legend>
      {children}
      {mensaje ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-sm font-medium text-peligro-700">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{mensaje}</span>
        </p>
      ) : null}
      {ayuda ? (
        <p id={`${id}-ayuda`} className="text-sm text-texto-suave">
          {ayuda}
        </p>
      ) : null}
    </fieldset>
  );
}

export interface OpcionTarjeta<V extends string> {
  valor: V;
  titulo: string;
  descripcion?: string;
  icono?: LucideIcon;
}

/** Radios presentados como tarjetas grandes (una opción siempre visible y clara). */
export function OpcionesTarjeta<V extends string>({
  name,
  opciones,
  valor,
  onCambiar,
  columnas = 2,
}: {
  name: string;
  opciones: readonly OpcionTarjeta<V>[];
  valor: V;
  onCambiar: (valor: V) => void;
  columnas?: 2 | 3;
}) {
  return (
    <div className={cn("grid gap-2", columnas === 3 ? "sm:grid-cols-3" : "grid-cols-2")}>
      {opciones.map((o) => {
        const marcado = o.valor === valor;
        const Icono = o.icono;
        return (
          <label
            key={o.valor}
            className={cn(
              "relative flex min-h-12 cursor-pointer items-center gap-3 rounded-control border px-3.5 py-2.5 transition-colors",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-marca-600",
              marcado
                ? "border-marca-600 bg-marca-50 ring-1 ring-marca-600"
                : "border-borde-fuerte/70 bg-superficie hover:border-borde-fuerte hover:bg-superficie-2",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.valor}
              checked={marcado}
              onChange={() => onCambiar(o.valor)}
              className="sr-only"
            />
            {Icono ? <Icono className={cn("size-5 shrink-0", marcado ? "text-marca-700" : "text-texto-tenue")} aria-hidden /> : null}
            <span className="min-w-0 flex-1">
              <span className={cn("block text-[0.9375rem] font-semibold", marcado ? "text-marca-900" : "text-texto")}>{o.titulo}</span>
              {o.descripcion ? <span className="block text-sm text-texto-suave">{o.descripcion}</span> : null}
            </span>
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border",
                marcado ? "border-marca-600 bg-marca-600 text-white" : "border-borde-fuerte bg-superficie",
              )}
              aria-hidden
            >
              {marcado ? <Check className="size-3.5" strokeWidth={3} /> : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selector de lote
// ---------------------------------------------------------------------------

export interface LoteSeleccionable {
  loteId: string;
  numeroLote: string;
  fechaVencimiento: DiaISO | null;
  diasParaVencer: number | null;
  estadoVencimiento: EstadoVencimiento;
  /** Stock del lote en la ubicación elegida. */
  cantidad: number;
}

/** Lista de lotes como radios-tarjeta: número, vencimiento y stock en la ubicación. */
export function SelectorLote({
  name,
  lotes,
  valor,
  onCambiar,
  unidad,
  bloquearVencidos = false,
}: {
  name: string;
  lotes: readonly LoteSeleccionable[];
  valor: string;
  onCambiar: (loteId: string) => void;
  unidad: string;
  /** Los lotes vencidos se muestran pero no se pueden elegir (retiros). */
  bloquearVencidos?: boolean;
}) {
  return (
    <div className="grid gap-2">
      {lotes.map((l) => {
        const marcado = l.loteId === valor;
        const bloqueado = bloquearVencidos && l.estadoVencimiento === "VENCIDO";
        return (
          <label
            key={l.loteId}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-control border px-3.5 py-2.5 transition-colors",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-marca-600",
              bloqueado
                ? "cursor-not-allowed border-borde bg-superficie-2"
                : marcado
                  ? "cursor-pointer border-marca-600 bg-marca-50 ring-1 ring-marca-600"
                  : "cursor-pointer border-borde-fuerte/70 bg-superficie hover:border-borde-fuerte hover:bg-superficie-2",
            )}
          >
            <input
              type="radio"
              name={name}
              value={l.loteId}
              checked={marcado}
              disabled={bloqueado}
              onChange={() => onCambiar(l.loteId)}
              className="sr-only"
            />
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border",
                marcado ? "border-marca-600 bg-marca-600 text-white" : "border-borde-fuerte bg-superficie",
                bloqueado && "opacity-40",
              )}
              aria-hidden
            >
              {marcado ? <Check className="size-3.5" strokeWidth={3} /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("cifras block truncate text-[0.9375rem] font-semibold", bloqueado ? "text-texto-suave" : "text-texto")}>
                Lote {l.numeroLote}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-texto-suave">
                {l.fechaVencimiento ? <span className="cifras">Vence {formatearDia(l.fechaVencimiento)}</span> : null}
                {l.estadoVencimiento !== "VIGENTE" ? (
                  <BadgeEstadoVencimiento estado={l.estadoVencimiento} dias={l.diasParaVencer} />
                ) : null}
                {bloqueado ? <span>No se puede retirar</span> : null}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="cifras block text-base font-semibold text-texto">{formatearNumero(l.cantidad)}</span>
              <span className="block text-xs text-texto-tenue">{unidadSegun(l.cantidad, unidad)}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ubicación
// ---------------------------------------------------------------------------

export interface UbicacionOpcion {
  id: string;
  nombre: string;
  tipo: TipoUbicacion;
  centroId: string;
  centro: string;
}

/**
 * Ubicación con la que parte un formulario: la pedida por enlace, la única
 * disponible o la única bodega del centro. Si hay ambigüedad, ninguna.
 */
export function ubicacionPorDefecto(ubicaciones: readonly UbicacionOpcion[], preferida?: string | null): string {
  if (preferida && ubicaciones.some((u) => u.id === preferida)) return preferida;
  if (ubicaciones.length === 1) return ubicaciones[0]!.id;
  const bodegas = ubicaciones.filter((u) => u.tipo === "BODEGA");
  return bodegas.length === 1 ? bodegas[0]!.id : "";
}

/**
 * Select de ubicaciones. Si hay más de un centro agrupa por centro. `detalle`
 * agrega un texto por opción (p. ej. "34 disponibles") y `deshabilitar`
 * bloquea opciones (p. ej. sin stock).
 */
export function SelectUbicacion({
  ubicaciones,
  valor,
  onCambiar,
  placeholder = "Selecciona la ubicación…",
  detalle,
  deshabilitar,
  ...props
}: {
  ubicaciones: readonly UbicacionOpcion[];
  valor: string;
  onCambiar: (ubicacionId: string) => void;
  placeholder?: string;
  detalle?: (u: UbicacionOpcion) => string | null;
  deshabilitar?: (u: UbicacionOpcion) => boolean;
  name?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}) {
  const centros = [...new Map(ubicaciones.map((u) => [u.centroId, u.centro])).entries()];
  const opcion = (u: UbicacionOpcion) => {
    const extra = detalle?.(u);
    return (
      <option key={u.id} value={u.id} disabled={deshabilitar?.(u)}>
        {u.nombre}
        {u.tipo !== "BODEGA" && !u.nombre.toLowerCase().includes(ETIQUETA_TIPO_UBICACION[u.tipo].toLowerCase())
          ? ` (${ETIQUETA_TIPO_UBICACION[u.tipo]})`
          : ""}
        {extra ? ` — ${extra}` : ""}
      </option>
    );
  };
  return (
    <Select value={valor} onChange={(e) => onCambiar(e.target.value)} placeholder={placeholder} {...props}>
      {centros.length > 1
        ? centros.map(([centroId, centro]) => (
            <optgroup key={centroId} label={centro}>
              {ubicaciones.filter((u) => u.centroId === centroId).map(opcion)}
            </optgroup>
          ))
        : ubicaciones.map(opcion)}
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Sugerencias rápidas
// ---------------------------------------------------------------------------

/** Botones-pastilla que rellenan un campo de texto con un valor frecuente. */
export function Sugerencias({
  etiqueta,
  opciones,
  seleccionada,
  onElegir,
}: {
  etiqueta: string;
  opciones: readonly { valor: string; texto: React.ReactNode }[];
  seleccionada?: string;
  onElegir: (valor: string) => void;
}) {
  if (opciones.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={etiqueta}>
      {opciones.map((o) => {
        const activa = o.valor === seleccionada;
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={activa}
            onClick={() => onElegir(o.valor)}
            className={cn(
              "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
              activa
                ? "border-marca-600 bg-marca-50 text-marca-900 ring-1 ring-marca-600"
                : "border-borde-fuerte/70 bg-superficie text-texto-suave hover:border-borde-fuerte hover:text-texto",
            )}
          >
            {o.texto}
          </button>
        );
      })}
    </div>
  );
}
