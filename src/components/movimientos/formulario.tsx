"use client";

/**
 * Infraestructura común de los formularios de movimientos: existencias en
 * vivo del insumo elegido, panel lateral de existencias, confirmación tras
 * guardar y manejo de foco / anuncios de errores.
 */
import * as React from "react";
import type { z } from "zod";
import { Boxes, CircleCheck, MapPin } from "lucide-react";
import { existenciasInsumoAccion, type ExistenciasInsumo } from "@/acciones/consultas";
import {
  Alert,
  avisarSesionVencida,
  BadgeEstadoVencimiento,
  Card,
  CardHeader,
  esSesionVencida,
  Skeleton,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { conPuntoFinal, erroresSinControl, unirErrores } from "@/lib/errores-formulario";
import { formatearDia } from "@/lib/fechas";
import { formatearNumero } from "@/lib/formato";
import type { ErroresCampo } from "@/lib/resultado";
import { cantidadConUnidad } from "@/lib/unidades";
import type { ExistenciaDetalle } from "@/server/servicios";

// ---------------------------------------------------------------------------
// Existencias en vivo
// ---------------------------------------------------------------------------

export interface EstadoExistencias {
  /** Existencias del insumo consultado (o `null` mientras no haya respuesta). */
  datos: ExistenciasInsumo | null;
  cargando: boolean;
  error: string | null;
  /** Vuelve a consultar (p. ej. después de registrar un movimiento). */
  recargar: () => void;
}

/**
 * Consulta las existencias (lote × ubicación) del insumo elegido dentro del
 * centro indicado (`null` = todos los centros visibles) y las mantiene al día.
 */
export function useExistenciasInsumo(insumoId: string | null, centroId: string | null): EstadoExistencias {
  const [version, setVersion] = React.useState(0);
  const [respuesta, setRespuesta] = React.useState<{
    clave: string;
    datos: ExistenciasInsumo | null;
    error: string | null;
  } | null>(null);
  const clave = insumoId ? `${insumoId}|${centroId ?? ""}|${version}` : null;

  React.useEffect(() => {
    if (!insumoId || !clave) return;
    let vigente = true;
    existenciasInsumoAccion({ insumoId, centroId })
      .then((r) => {
        if (esSesionVencida(r)) avisarSesionVencida();
        if (!vigente) return;
        setRespuesta({ clave, datos: r.ok ? r.datos : null, error: r.ok ? null : r.error });
      })
      .catch(() => {
        if (vigente) setRespuesta({ clave, datos: null, error: "No pudimos consultar las existencias. Revisa tu conexión." });
      });
    return () => {
      vigente = false;
    };
  }, [clave, insumoId, centroId]);

  const recargar = React.useCallback(() => setVersion((v) => v + 1), []);
  const corresponde = insumoId !== null && respuesta?.datos?.insumoId === insumoId;
  return {
    datos: corresponde ? (respuesta?.datos ?? null) : null,
    cargando: clave !== null && respuesta?.clave !== clave,
    error: clave !== null && respuesta?.clave === clave ? respuesta.error : null,
    recargar,
  };
}

/** Stock por ubicación: disponible (no vencido), vencido y número de lotes. */
export interface StockUbicacion {
  disponible: number;
  vencido: number;
  lotes: number;
}

export function stockPorUbicacion(existencias: readonly ExistenciaDetalle[]): Map<string, StockUbicacion> {
  const mapa = new Map<string, StockUbicacion>();
  for (const e of existencias) {
    const s = mapa.get(e.ubicacionId) ?? { disponible: 0, vencido: 0, lotes: 0 };
    if (e.estadoVencimiento === "VENCIDO") s.vencido += e.cantidad;
    else s.disponible += e.cantidad;
    s.lotes += 1;
    mapa.set(e.ubicacionId, s);
  }
  return mapa;
}

// ---------------------------------------------------------------------------
// Panel lateral: existencias actuales del insumo
// ---------------------------------------------------------------------------

export function PanelExistencias({
  insumo,
  estado,
  mostrarCentro,
  ubicacionDestacada,
  className,
}: {
  insumo: { nombre: string; unidadMedida: string } | null;
  estado: EstadoExistencias;
  /** Muestra el centro de cada ubicación (vista de toda la red). */
  mostrarCentro: boolean;
  ubicacionDestacada?: string;
  className?: string;
}) {
  const grupos = React.useMemo(() => {
    const porUbicacion = new Map<string, { nombre: string; centro: string; filas: ExistenciaDetalle[] }>();
    for (const e of estado.datos?.existencias ?? []) {
      const g = porUbicacion.get(e.ubicacionId) ?? { nombre: e.ubicacion, centro: e.centro, filas: [] };
      g.filas.push(e);
      porUbicacion.set(e.ubicacionId, g);
    }
    // La ubicación elegida en el formulario va primero.
    return [...porUbicacion.entries()].sort(
      ([a], [b]) => Number(b === ubicacionDestacada) - Number(a === ubicacionDestacada),
    );
  }, [estado.datos, ubicacionDestacada]);

  return (
    <Card className={className} aria-busy={estado.cargando || undefined}>
      <CardHeader
        titulo="Existencias actuales"
        descripcion={insumo ? insumo.nombre : "Elige un insumo para ver dónde hay stock."}
      />
      {!insumo ? (
        <div className="flex items-center gap-3 rounded-control border border-dashed border-borde-fuerte/70 px-3.5 py-4 text-sm text-texto-suave">
          <Boxes className="size-5 shrink-0 text-texto-tenue" aria-hidden />
          Verás aquí los lotes, su vencimiento y en qué ubicación están.
        </div>
      ) : estado.error ? (
        <p className="text-sm font-medium text-peligro-700" role="alert">
          {estado.error}
        </p>
      ) : !estado.datos ? (
        <div className="space-y-2" role="status" aria-label="Cargando existencias">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : grupos.length === 0 ? (
        <div className="flex items-center gap-3 rounded-control border border-dashed border-borde-fuerte/70 px-3.5 py-4 text-sm text-texto-suave">
          <Boxes className="size-5 shrink-0 text-texto-tenue" aria-hidden />
          Sin existencias de este insumo{mostrarCentro ? " en tus centros" : " en este centro"}.
        </div>
      ) : (
        <ul className={cn("space-y-4 transition-opacity", estado.cargando && "opacity-60")}>
          {grupos.map(([ubicacionId, g]) => {
            const total = g.filas.reduce((s, e) => s + e.cantidad, 0);
            return (
              <li key={ubicacionId}>
                <div
                  className={cn(
                    "flex items-baseline justify-between gap-3 rounded-md px-2 py-1",
                    ubicacionId === ubicacionDestacada ? "bg-marca-50 text-marca-900" : "bg-superficie-2 text-texto",
                  )}
                >
                  <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                    <MapPin className="size-3.5 shrink-0 text-texto-tenue" aria-hidden />
                    <span className="truncate">
                      {g.nombre}
                      {mostrarCentro ? <span className="font-normal text-texto-suave"> · {g.centro}</span> : null}
                    </span>
                  </p>
                  <p className="cifras shrink-0 text-sm font-semibold">{cantidadConUnidad(total, insumo.unidadMedida)}</p>
                </div>
                <ul className="mt-1 divide-y divide-borde">
                  {g.filas.map((e) => (
                    <li key={e.existenciaId} className="flex items-center justify-between gap-3 px-2 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="cifras truncate font-medium text-texto">Lote {e.numeroLote}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-texto-suave">
                          {e.fechaVencimiento ? <span className="cifras">Vence {formatearDia(e.fechaVencimiento)}</span> : <span>Sin vencimiento</span>}
                          {e.estadoVencimiento !== "SIN_VENCIMIENTO" ? (
                            <BadgeEstadoVencimiento estado={e.estadoVencimiento} dias={e.diasParaVencer} />
                          ) : null}
                        </p>
                      </div>
                      <span className={cn("cifras shrink-0 font-semibold", e.estadoVencimiento === "VENCIDO" ? "text-peligro-700" : "text-texto")}>
                        {formatearNumero(e.cantidad)}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Confirmación tras guardar
// ---------------------------------------------------------------------------

/**
 * Pantalla de confirmación: reemplaza al formulario, recibe el foco y se
 * anuncia a lectores de pantalla. `children` es la frase principal y
 * `detalle` las cifras resultantes.
 */
export function Confirmacion({
  titulo,
  children,
  detalle,
  acciones,
  centro,
  repetido = false,
}: {
  titulo: string;
  children: React.ReactNode;
  detalle?: React.ReactNode;
  acciones: React.ReactNode;
  /**
   * Centro REAL del movimiento registrado (según el resultado del servidor).
   * Se muestra siempre: el centro activo pudo cambiar en otra pestaña.
   */
  centro?: string | null;
  /** El servidor ya tenía registrada esta operación (reenvío): no se duplicó. */
  repetido?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    ref.current?.focus();
    ref.current?.scrollIntoView({ block: "nearest" });
  }, []);
  return (
    <Card className="border-exito-600/30">
      <div ref={ref} tabIndex={-1} role="status" aria-live="polite" className="outline-none">
        <div className="flex items-start gap-3.5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-exito-50 text-exito-700 ring-1 ring-exito-600/25 ring-inset">
            <CircleCheck className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-texto">{titulo}</h2>
            <p className="mt-1 text-base text-texto">{children}</p>
            {centro ? (
              <p className="mt-1 text-sm text-texto-suave" data-centro-movimiento>
                Registrado en <strong className="font-semibold text-texto">{centro}</strong>.
              </p>
            ) : null}
          </div>
        </div>
        {repetido ? (
          <Alert tono="info" className="mt-4">
            {MENSAJE_REPETIDO}
          </Alert>
        ) : null}
        {detalle ? <div className="mt-4">{detalle}</div> : null}
      </div>
      <div className="mt-5 flex flex-col gap-2 border-t border-borde pt-4 sm:flex-row sm:flex-wrap">{acciones}</div>
    </Card>
  );
}

/** Aviso cuando el servidor devuelve `repetido: true` (misma clave de idempotencia). */
export const MENSAJE_REPETIDO = "Este movimiento ya estaba registrado; no se duplicó.";

/** Ayuda de los campos de texto libre (nota, motivo): el sistema no guarda datos de pacientes. */
export const AYUDA_SIN_PACIENTES = "No incluyas datos de pacientes.";

/** Cifras destacadas dentro de la confirmación (saldo resultante, etc.). */
export function CifrasConfirmacion({ cifras }: { cifras: readonly { etiqueta: string; valor: React.ReactNode; nota?: React.ReactNode }[] }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {cifras.map((c) => (
        <div key={c.etiqueta} className="rounded-control bg-superficie-2 px-3.5 py-3 ring-1 ring-borde ring-inset">
          <dt className="text-sm text-texto-suave">{c.etiqueta}</dt>
          <dd className="cifras mt-0.5 text-xl font-semibold tracking-tight text-texto">{c.valor}</dd>
          {c.nota ? <dd className="mt-0.5 text-sm text-texto-suave">{c.nota}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

export { conPuntoFinal, erroresSinControl, unirErrores };

// ---------------------------------------------------------------------------
// Errores: foco y anuncio
// ---------------------------------------------------------------------------

/** Lleva el foco al primer campo inválido del formulario (tras intentar guardar). */
export function enfocarPrimerError(formulario: HTMLFormElement | null): void {
  if (!formulario) return;
  requestAnimationFrame(() => {
    const destino = formulario.querySelector<HTMLElement>(
      'input[aria-invalid="true"], select[aria-invalid="true"], textarea[aria-invalid="true"], button[aria-invalid="true"], fieldset[aria-invalid="true"] input:not(:disabled)',
    );
    destino?.focus();
    destino?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

/** Valida con un esquema zod en el cliente y devuelve los errores por campo. */
export function erroresDeEsquema(esquema: z.ZodType, valores: unknown): ErroresCampo {
  const r = esquema.safeParse(valores);
  if (r.success) return {};
  const errores: ErroresCampo = {};
  for (const problema of r.error.issues) {
    const campo = problema.path.join(".") || "_";
    (errores[campo] ??= []).push(problema.message);
  }
  return errores;
}

/** Resumen visible de los errores que no se pueden mostrar junto a un campo. */
export function ResumenErrores({ errores, camposVisibles }: { errores: ErroresCampo; camposVisibles: readonly string[] }) {
  const mensajes = erroresSinControl(errores, camposVisibles);
  if (mensajes.length === 0) return null;
  return (
    <Alert tono="peligro" titulo="No se pudo registrar" data-resumen-errores>
      {mensajes.length === 1 ? (
        mensajes[0]
      ) : (
        <ul className="list-disc space-y-0.5 pl-4">
          {mensajes.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </Alert>
  );
}

/** Región `aria-live` que anuncia cuántos campos hay que corregir. */
export function AnuncioErrores({ errores, visible }: { errores: ErroresCampo; visible: boolean }) {
  const cantidad = Object.keys(errores).length;
  return (
    <p className="sr-only" role="alert">
      {visible && cantidad > 0
        ? `Hay ${cantidad} ${cantidad === 1 ? "campo" : "campos"} por corregir: ${Object.values(errores)
            .map((m) => conPuntoFinal(m[0] ?? ""))
            .join(" ")}`
        : ""}
    </p>
  );
}
