import * as React from "react";
import { cn } from "@/lib/cn";

/** Bloque de carga. Dar tamaño con clases (`h-4 w-32`). */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-borde/70", className)} {...props} />;
}

/** Esqueleto de una tabla/listado mientras carga. */
export function SkeletonTabla({ filas = 6 }: { filas?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Cargando">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: filas }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

/** Esqueleto de una grilla de tarjetas de indicadores. */
export function SkeletonTarjetas({ cantidad = 4 }: { cantidad?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="status" aria-label="Cargando">
      {Array.from({ length: cantidad }, (_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-tarjeta" />
      ))}
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
