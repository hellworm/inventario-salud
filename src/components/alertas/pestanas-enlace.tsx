"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatearNumero } from "@/lib/formato";

export interface PestanaEnlace {
  href: string;
  etiqueta: string;
  activa: boolean;
  /** Cantidad de elementos de la pestaña. */
  contador?: number;
  /** Color del contador cuando es mayor que cero. */
  tono?: "neutro" | "alerta" | "peligro";
}

const TONO_CONTADOR = {
  neutro: "bg-superficie-2 text-texto-suave ring-borde",
  alerta: "bg-alerta-50 text-alerta-800 ring-alerta-500/40",
  peligro: "bg-peligro-50 text-peligro-800 ring-peligro-600/25",
} as const;

/**
 * Pestañas basadas en enlaces: el estado vive en la URL (se puede compartir,
 * recargar y volver atrás). Misma apariencia que `Tabs` del UI kit.
 *
 * Cuando no caben (móvil) la fila se desplaza en horizontal: la pestaña activa
 * se lleva a la vista y un degradado en el borde indica que hay más a ese lado.
 */
export function PestanasEnlace({
  pestanas,
  etiqueta,
  className,
}: {
  pestanas: readonly PestanaEnlace[];
  /** Nombre accesible del grupo de pestañas. */
  etiqueta: string;
  className?: string;
}) {
  const lista = React.useRef<HTMLUListElement>(null);
  const [bordes, setBordes] = React.useState({ izquierda: false, derecha: false });
  const hrefActiva = pestanas.find((p) => p.activa)?.href;

  const medir = React.useCallback(() => {
    const ul = lista.current;
    if (!ul) return;
    const izquierda = ul.scrollLeft > 4;
    const derecha = ul.scrollLeft + ul.clientWidth < ul.scrollWidth - 4;
    setBordes((b) => (b.izquierda === izquierda && b.derecha === derecha ? b : { izquierda, derecha }));
  }, []);

  // Lleva la pestaña activa a la vista (solo desplaza la fila, nunca la página).
  React.useEffect(() => {
    const ul = lista.current;
    const activa = ul?.querySelector<HTMLElement>("[aria-current='page']")?.parentElement;
    if (ul && activa) {
      const margen = 28;
      const inicio = activa.offsetLeft - margen;
      const fin = activa.offsetLeft + activa.offsetWidth + margen;
      if (inicio < ul.scrollLeft) ul.scrollLeft = Math.max(0, inicio);
      else if (fin > ul.scrollLeft + ul.clientWidth) ul.scrollLeft = fin - ul.clientWidth;
    }
    medir();
  }, [hrefActiva, medir]);

  React.useEffect(() => {
    const ul = lista.current;
    if (!ul) return;
    const observador = new ResizeObserver(medir);
    observador.observe(ul);
    return () => observador.disconnect();
  }, [medir]);

  return (
    <nav aria-label={etiqueta} className={cn("relative print:hidden", className)}>
      <ul
        ref={lista}
        onScroll={medir}
        className="relative -mb-px flex gap-1 overflow-x-auto border-b border-borde [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {pestanas.map((p) => (
          <li key={p.href} className="shrink-0">
            <Link
              href={p.href}
              scroll={false}
              aria-current={p.activa ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 border-b-2 px-3.5 text-[0.9375rem] font-medium whitespace-nowrap transition-colors",
                p.activa
                  ? "border-marca-600 text-marca-800"
                  : "border-transparent text-texto-suave hover:border-borde-fuerte hover:text-texto",
              )}
            >
              {p.etiqueta}
              {p.contador !== undefined ? (
                <span
                  className={cn(
                    "cifras rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
                    TONO_CONTADOR[p.contador > 0 ? (p.tono ?? "neutro") : "neutro"],
                  )}
                >
                  {formatearNumero(p.contador)}
                  <span className="sr-only"> elementos</span>
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-fondo to-transparent transition-opacity",
          bordes.izquierda ? "opacity-100" : "opacity-0",
        )}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-fondo to-transparent transition-opacity",
          bordes.derecha ? "opacity-100" : "opacity-0",
        )}
      />
    </nav>
  );
}
