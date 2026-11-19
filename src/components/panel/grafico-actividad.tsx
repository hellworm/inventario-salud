"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { formatearNumero, pluralizar } from "@/lib/formato";

export interface DiaActividad {
  /** Día ISO (clave). */
  dia: string;
  /** Etiqueta corta del eje (p. ej. "19-11"). */
  etiqueta: string;
  /** Etiqueta completa para el detalle (p. ej. "Jueves 19-11-2026"). */
  titulo: string;
  /** Número de movimientos de entrada del día (no unidades). */
  entradas: number;
  /** Número de movimientos de salida del día (no unidades). */
  salidas: number;
  movimientos: number;
}

/**
 * Colores de serie (identidad, no estado): las entradas usan el teal de la
 * marca; las salidas, un cobre con trama diagonal para que la diferencia no
 * dependa solo del color. Contraste ≥ 3:1 sobre la superficie.
 */
const COLOR_ENTRADAS = "var(--color-marca-500)";
const COLOR_SALIDAS = "#b8683a";
const TRAMA_SALIDAS = `repeating-linear-gradient(135deg, ${COLOR_SALIDAS} 0 3px, #cf8a62 3px 5px)`;

/** Redondea hacia arriba a un valor "limpio" para el tope del eje (1, 2, 2,5 o 5 × 10ⁿ). */
function topeLimpio(valor: number): number {
  if (valor <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(valor));
  const fraccion = valor / potencia;
  const paso = fraccion <= 1 ? 1 : fraccion <= 2 ? 2 : fraccion <= 2.5 ? 2.5 : fraccion <= 5 ? 5 : 10;
  const tope = paso * potencia;
  // Son conteos: la marca intermedia del eje (tope / 2) también debe ser entera.
  return Math.max(2, Math.ceil(tope / 2) * 2);
}

function Muestra({ trama }: { trama?: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block size-3 shrink-0 rounded-[3px]"
      style={{ background: trama ? TRAMA_SALIDAS : COLOR_ENTRADAS }}
    />
  );
}

/**
 * Barras agrupadas con el NÚMERO DE MOVIMIENTOS de entrada y de salida por día
 * (no unidades: los insumos se miden en cajas, ampollas, litros…). Cada día es un
 * objetivo enfocable (teclado, mouse o toque) que muestra su detalle; la tabla
 * alternativa entrega los mismos datos en texto.
 */
export function GraficoActividad({ dias }: { dias: readonly DiaActividad[] }) {
  const [activo, setActivo] = React.useState<number | null>(null);
  const tope = topeLimpio(Math.max(...dias.flatMap((d) => [d.entradas, d.salidas]), 1));
  const marcas = [tope, tope / 2, 0];
  const totalEntradas = dias.reduce((s, d) => s + d.entradas, 0);
  const totalSalidas = dias.reduce((s, d) => s + d.salidas, 0);
  const seleccionado = activo === null ? null : dias[activo];
  const alto = (valor: number) => (valor <= 0 ? "0%" : `${Math.max((valor / tope) * 100, 1.5)}%`);

  return (
    <figure>
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 text-sm text-texto-suave">
        <ul className="flex flex-wrap gap-x-5 gap-y-1" aria-label="Series">
          <li className="inline-flex items-center gap-1.5">
            <Muestra />
            Movimientos de entrada <strong className="cifras font-semibold text-texto">{formatearNumero(totalEntradas)}</strong>
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Muestra trama />
            Movimientos de salida <strong className="cifras font-semibold text-texto">{formatearNumero(totalSalidas)}</strong>
          </li>
        </ul>
        <p className="cifras min-h-5 text-right" aria-live="polite">
          {seleccionado ? (
            <>
              <span className="font-medium text-texto">{seleccionado.titulo}</span>: {formatearNumero(seleccionado.entradas)} de entrada ·{" "}
              {formatearNumero(seleccionado.salidas)} de salida
            </>
          ) : (
            <span className="text-texto-tenue">N.º de movimientos por día</span>
          )}
        </p>
      </div>

      <div className="mt-3 flex gap-2">
        <div className="cifras relative h-44 w-9 shrink-0 text-right text-[0.6875rem] text-texto-tenue" aria-hidden>
          {marcas.map((m, i) => (
            <span key={m} className="absolute right-0 -translate-y-1/2" style={{ top: `${(i / (marcas.length - 1)) * 100}%` }}>
              {m >= 10_000 ? `${formatearNumero(m / 1000)} mil` : formatearNumero(m)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-44" onMouseLeave={() => setActivo(null)}>
            {marcas.map((m, i) => (
              <span
                key={m}
                aria-hidden
                className={cn("absolute inset-x-0 border-t", m === 0 ? "border-borde-fuerte" : "border-dashed border-borde")}
                style={{ top: `${(i / (marcas.length - 1)) * 100}%` }}
              />
            ))}
            <ul className="relative flex h-full items-stretch" aria-label="Actividad por día">
              {dias.map((d, i) => (
                <li key={d.dia} className="min-w-0 flex-1">
                  <button
                    type="button"
                    onMouseEnter={() => setActivo(i)}
                    onFocus={() => setActivo(i)}
                    onBlur={() => setActivo(null)}
                    onClick={() => setActivo(i)}
                    aria-label={`${d.titulo}: ${pluralizar(d.entradas, "movimiento")} de entrada y ${pluralizar(d.salidas, "movimiento")} de salida`}
                    className={cn(
                      "flex h-full w-full cursor-default items-end justify-center gap-[2px] rounded-t-md px-[2px] outline-offset-0 transition-colors sm:px-1",
                      activo === i && "bg-marca-50",
                    )}
                  >
                    <span className="w-1/2 max-w-3.5 rounded-t-[4px]" style={{ height: alto(d.entradas), background: COLOR_ENTRADAS }} />
                    <span className="w-1/2 max-w-3.5 rounded-t-[4px]" style={{ height: alto(d.salidas), background: TRAMA_SALIDAS }} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <ul className="cifras mt-1.5 flex text-[0.6875rem] text-texto-tenue" aria-hidden>
            {dias.map((d, i) => {
              const esUltimo = i === dias.length - 1;
              // Una etiqueta cada 2 días (siempre la última) para que no se monten en pantallas angostas.
              const visible = (dias.length - 1 - i) % 2 === 0;
              return (
                <li key={d.dia} className={cn("min-w-0 flex-1 text-center whitespace-nowrap", esUltimo && "font-semibold text-texto-suave")}>
                  {visible ? (esUltimo ? "Hoy" : d.etiqueta) : ""}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <details className="group mt-3 text-sm">
        <summary className="inline-flex min-h-11 items-center rounded-md font-medium text-marca-700 underline-offset-4 hover:underline">
          <span className="group-open:hidden">Ver los datos como tabla</span>
          <span className="hidden group-open:inline">Ocultar la tabla</span>
        </summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-borde">
          <table className="w-full text-sm">
            <caption className="sr-only">Número de movimientos de entrada y de salida por día</caption>
            <thead className="sticky top-0 bg-superficie-2 text-xs text-texto-suave uppercase">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-semibold">Día</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">De entrada</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">De salida</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {[...dias].reverse().map((d) => (
                <tr key={d.dia}>
                  <th scope="row" className="px-3 py-1.5 text-left font-normal whitespace-nowrap">{d.titulo}</th>
                  <td className="cifras px-3 py-1.5 text-right">{formatearNumero(d.entradas)}</td>
                  <td className="cifras px-3 py-1.5 text-right">{formatearNumero(d.salidas)}</td>
                  <td className="cifras px-3 py-1.5 text-right">{formatearNumero(d.movimientos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
