import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/cn";

export interface PageHeaderProps {
  titulo: string;
  descripcion?: React.ReactNode;
  /** Botones de acción (se apilan bajo el título en móvil). */
  acciones?: React.ReactNode;
  /** Enlace "volver" sobre el título. */
  volver?: { href: string; label: string };
  className?: string;
}

/** Encabezado estándar de página: `<h1>`, descripción y acciones. */
export function PageHeader({ titulo, descripcion, acciones, volver, className }: PageHeaderProps) {
  return (
    <header className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {/* Objetivo táctil de 44 px en tablet y celular; más compacto con mouse. */}
        {volver ? (
          <Link
            href={volver.href}
            className="-ml-1 inline-flex min-h-11 items-center gap-0.5 rounded-md pr-3 text-sm font-medium text-texto-suave hover:text-marca-700 pointer-fine:mb-1 pointer-fine:min-h-9"
          >
            <ChevronLeft className="size-4" aria-hidden />
            {volver.label}
          </Link>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-texto sm:text-[1.75rem]">{titulo}</h1>
        {descripcion ? <p className="mt-1 max-w-2xl text-[0.9375rem] text-texto-suave">{descripcion}</p> : null}
      </div>
      {acciones ? <div className="flex flex-wrap items-center gap-2 sm:shrink-0 [&>*]:flex-1 sm:[&>*]:flex-none">{acciones}</div> : null}
    </header>
  );
}
