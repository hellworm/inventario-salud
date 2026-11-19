import * as React from "react";
import { cn } from "@/lib/cn";
import {
  COLORES_SEMAFORO,
  DESCRIPCION_SEMAFORO,
  ETIQUETA_ESTADO_VENCIMIENTO,
  type ColorSemaforo,
  type ConteoSemaforo,
  type EstadoVencimiento,
} from "@/lib/estados";
import { formatearNumero } from "@/lib/formato";
import { SEMAFORO_UI } from "./badge";

const ORDEN_LEYENDA: readonly EstadoVencimiento[] = ["ROJO", "AMARILLO", "VERDE", "VENCIDO"];

/**
 * Leyenda del semáforo de vencimiento: qué significa cada color, con su ícono
 * y su nombre. Va donde el semáforo aparece por primera vez en una pantalla.
 */
export function LeyendaSemaforo({
  className,
  conVencido = true,
  titulo = "Semáforo de vencimiento",
}: {
  className?: string;
  /** Incluye "Vencido" (estado aparte del semáforo). */
  conVencido?: boolean;
  /** Nombre accesible de la lista. */
  titulo?: string;
}) {
  const estados = ORDEN_LEYENDA.filter((e) => conVencido || e !== "VENCIDO");
  return (
    <ul aria-label={titulo} className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs text-texto-suave", className)}>
      {estados.map((estado) => {
        const { icono: Icono, texto } = SEMAFORO_UI[estado];
        return (
          <li key={estado} className="inline-flex items-center gap-1.5">
            <Icono className={cn("size-3.5 shrink-0", texto)} aria-hidden />
            <span>
              <strong className="font-semibold text-texto">{ETIQUETA_ESTADO_VENCIMIENTO[estado]}:</strong>{" "}
              {DESCRIPCION_SEMAFORO[estado].charAt(0).toLowerCase()}
              {DESCRIPCION_SEMAFORO[estado].slice(1)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const NOMBRE_EN_FRASE: Readonly<Record<ColorSemaforo, (n: number) => string>> = {
  VENCIDO: (n) => (n === 1 ? "vencido" : "vencidos"),
  ROJO: () => "en rojo",
  AMARILLO: () => "en amarillo",
  VERDE: () => "en verde",
};

/** "2 vencidos, 1 en rojo, 3 en verde": el desglose en palabras (nombre accesible y tooltips). */
export function describirDesglose(conteo: ConteoSemaforo): string {
  const partes = COLORES_SEMAFORO.filter((c) => conteo[c] > 0).map((c) => `${formatearNumero(conteo[c])} ${NOMBRE_EN_FRASE[c](conteo[c])}`);
  if (conteo.sinVencimiento > 0) partes.push(`${formatearNumero(conteo.sinVencimiento)} sin vencimiento`);
  return partes.join(", ");
}

/**
 * Desglose del semáforo de un insumo: cuántos lotes con stock tiene de cada
 * color (ícono con forma propia + número). El texto completo va en el nombre
 * accesible y en el `title`.
 */
export function DesgloseSemaforo({ conteo, className }: { conteo: ConteoSemaforo; className?: string }) {
  const colores = COLORES_SEMAFORO.filter((c) => conteo[c] > 0);
  if (colores.length === 0) return null;
  const frase = `Lotes: ${describirDesglose(conteo)}`;
  return (
    <span role="img" aria-label={frase} title={frase} className={cn("inline-flex items-center gap-2 text-xs", className)}>
      {colores.map((c) => {
        const { icono: Icono, texto } = SEMAFORO_UI[c];
        return (
          <span key={c} aria-hidden className="inline-flex items-center gap-0.5">
            <Icono className={cn("size-3.5 shrink-0", texto)} />
            <span className="cifras font-semibold text-texto-suave">{formatearNumero(conteo[c])}</span>
          </span>
        );
      })}
    </span>
  );
}
