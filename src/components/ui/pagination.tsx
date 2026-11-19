"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatearNumero } from "@/lib/formato";
import { buttonClasses } from "./button";

export interface PaginationProps {
  pagina: number;
  totalPaginas: number;
  total: number;
  porPagina: number;
  /** Nombre del parámetro de URL (por defecto `pagina`). */
  parametro?: string;
  className?: string;
}

/**
 * Paginación basada en la URL (`?pagina=2`): conserva el resto de los filtros.
 * Recibe directamente los campos de un resultado `Paginado<T>`.
 */
export function Pagination({ pagina, totalPaginas, total, porPagina, parametro = "pagina", className }: PaginationProps) {
  const ruta = usePathname();
  const params = useSearchParams();
  if (total === 0) return null;

  const hrefDe = (n: number) => {
    const copia = new URLSearchParams(params.toString());
    if (n <= 1) copia.delete(parametro);
    else copia.set(parametro, String(n));
    const consulta = copia.toString();
    return consulta ? `${ruta}?${consulta}` : ruta;
  };
  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);
  const hayAnterior = pagina > 1;
  const haySiguiente = pagina < totalPaginas;
  const claseBoton = buttonClasses({ variant: "secundario", size: "sm" });

  return (
    <nav className={cn("flex flex-col items-center justify-between gap-3 sm:flex-row", className)} aria-label="Paginación">
      <p className="cifras text-sm text-texto-suave" aria-live="polite">
        {formatearNumero(desde)}–{formatearNumero(hasta)} de {formatearNumero(total)}
      </p>
      <div className="flex items-center gap-2">
        {hayAnterior ? (
          <Link href={hrefDe(pagina - 1)} className={claseBoton} rel="prev" scroll={false}>
            <ChevronLeft aria-hidden />
            Anterior
          </Link>
        ) : (
          <span className={claseBoton} aria-disabled="true">
            <ChevronLeft aria-hidden />
            Anterior
          </span>
        )}
        <span className="cifras px-1 text-sm text-texto-suave">
          Página {formatearNumero(pagina)} de {formatearNumero(totalPaginas)}
        </span>
        {haySiguiente ? (
          <Link href={hrefDe(pagina + 1)} className={claseBoton} rel="next" scroll={false}>
            Siguiente
            <ChevronRight aria-hidden />
          </Link>
        ) : (
          <span className={claseBoton} aria-disabled="true">
            Siguiente
            <ChevronRight aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}
