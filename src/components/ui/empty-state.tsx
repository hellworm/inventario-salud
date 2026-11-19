import * as React from "react";
import { Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  icono?: LucideIcon;
  titulo: string;
  descripcion?: React.ReactNode;
  /** Botón o enlace de acción principal. */
  accion?: React.ReactNode;
  className?: string;
  /** Versión compacta para usar dentro de tarjetas. */
  compacto?: boolean;
  /**
   * Nivel del encabezado del título (por defecto `3`). Usa `1` cuando el estado
   * vacío ES la página (404, sin permiso, error) para que tenga su `<h1>`.
   */
  nivelTitulo?: 1 | 2 | 3;
}

/** Estado vacío: explica qué falta y, si corresponde, ofrece la acción siguiente. */
export function EmptyState({
  icono: Icono = Inbox,
  titulo,
  descripcion,
  accion,
  className,
  compacto = false,
  nivelTitulo = 3,
}: EmptyStateProps) {
  const Titulo = `h${nivelTitulo}` as const;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compacto ? "px-4 py-8" : "rounded-tarjeta border border-dashed border-borde-fuerte/70 bg-superficie px-6 py-14",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-marca-50 text-marca-700">
        <Icono className="size-6" aria-hidden />
      </span>
      <Titulo className={cn("mt-4 font-semibold text-texto", nivelTitulo === 1 ? "text-xl tracking-tight sm:text-2xl" : "text-base")}>{titulo}</Titulo>
      {descripcion ? <p className="mt-1 max-w-md text-sm text-texto-suave">{descripcion}</p> : null}
      {accion ? <div className="mt-5">{accion}</div> : null}
    </div>
  );
}
