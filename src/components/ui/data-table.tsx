import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export interface Columna<T> {
  /** Identificador único de la columna. */
  clave: string;
  /** Texto del encabezado (y de la etiqueta en la vista de tarjetas). */
  encabezado: string;
  /** Contenido de la celda. */
  celda: (fila: T) => React.ReactNode;
  alinear?: "izquierda" | "derecha" | "centro";
  /**
   * Rol de la columna en la vista de tarjetas (móvil):
   * - "titulo": texto principal de la tarjeta (sin etiqueta).
   * - "destacado": arriba a la derecha, junto al título (p. ej. estado o cantidad).
   * - "oculto": no se muestra en móvil.
   * - por defecto: par etiqueta / valor.
   */
  movil?: "titulo" | "destacado" | "oculto";
  /** Clases para `<td>` (escritorio), p. ej. anchos. */
  className?: string;
}

export interface DataTableProps<T> {
  columnas: readonly Columna<T>[];
  filas: readonly T[];
  /** Clave estable de cada fila. */
  claveFila: (fila: T) => string;
  /** Nombre accesible de la tabla. */
  titulo: string;
  /** Qué mostrar si no hay filas (normalmente un `<EmptyState compacto />`). */
  vacio?: React.ReactNode;
  /** Si se indica, la fila/tarjeta completa enlaza a esa URL (además de las celdas). */
  hrefFila?: (fila: T) => string;
  /** Clases extra por fila (p. ej. resaltar vencidos). */
  claseFila?: (fila: T) => string | undefined;
  className?: string;
}

const ALINEAR = { izquierda: "text-left", derecha: "text-right", centro: "text-center" } as const;

/**
 * Tabla responsive: tabla clásica desde `md` y lista de tarjetas en móvil.
 * No usa hooks, así que funciona en Server y Client Components.
 */
export function DataTable<T>({ columnas, filas, claveFila, titulo, vacio, hrefFila, claseFila, className }: DataTableProps<T>) {
  if (filas.length === 0) {
    return <div className={className}>{vacio ?? <p className="px-4 py-10 text-center text-sm text-texto-suave">Sin resultados.</p>}</div>;
  }

  const colTitulo = columnas.find((c) => c.movil === "titulo") ?? columnas[0];
  const colsDestacadas = columnas.filter((c) => c.movil === "destacado");
  const colsDetalle = columnas.filter((c) => c !== colTitulo && c.movil !== "destacado" && c.movil !== "oculto");

  return (
    <div className={className}>
      {/* Escritorio / tablet */}
      {/* `relative`: los textos `sr-only` (absolutos) no deben ensanchar la página si la tabla hace scroll. */}
      <div className="relative hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{titulo}</caption>
          <thead>
            <tr className="border-b border-borde bg-superficie-2 text-xs tracking-wide text-texto-suave uppercase">
              {columnas.map((c) => (
                <th key={c.clave} scope="col" className={cn("px-4 py-3 font-semibold whitespace-nowrap", ALINEAR[c.alinear ?? "izquierda"])}>
                  {c.encabezado}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {filas.map((fila) => {
              const href = hrefFila?.(fila);
              return (
                <tr key={claveFila(fila)} className={cn("transition-colors hover:bg-marca-50/50", href && "relative", claseFila?.(fila))}>
                  {columnas.map((c, i) => (
                    <td key={c.clave} className={cn("px-4 py-3 align-middle text-texto", ALINEAR[c.alinear ?? "izquierda"], c.className)}>
                      {href && i === 0 ? (
                        <Link href={href} className="font-medium text-texto after:absolute after:inset-0 hover:text-marca-700">
                          {c.celda(fila)}
                        </Link>
                      ) : (
                        c.celda(fila)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Móvil: tarjetas */}
      <ul className="divide-y divide-borde md:hidden" aria-label={titulo}>
        {filas.map((fila) => {
          const href = hrefFila?.(fila);
          return (
            <li key={claveFila(fila)} className={cn("relative px-4 py-3.5", href && "active:bg-marca-50", claseFila?.(fila))}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-[0.9375rem] font-semibold text-texto">
                  {href ? (
                    <Link href={href} className="after:absolute after:inset-0">
                      {colTitulo?.celda(fila)}
                    </Link>
                  ) : (
                    colTitulo?.celda(fila)
                  )}
                </div>
                {colsDestacadas.length > 0 ? (
                  <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
                    {colsDestacadas.map((c) => (
                      <div key={c.clave}>{c.celda(fila)}</div>
                    ))}
                  </div>
                ) : null}
              </div>
              {colsDetalle.length > 0 ? (
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  {colsDetalle.map((c) => (
                    <div key={c.clave} className="min-w-0">
                      <dt className="text-xs text-texto-tenue">{c.encabezado}</dt>
                      <dd className="truncate text-texto">{c.celda(fila)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
