import { Skeleton, SkeletonTabla } from "@/components/ui/skeleton";

function EsqueletoEncabezado({ conVolver = false }: { conVolver?: boolean }) {
  return (
    <div className="mb-6 space-y-2">
      {conVolver ? <Skeleton className="h-5 w-24" /> : null}
      <Skeleton className="h-8 w-64 max-w-full" />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
  );
}

/** Esqueleto de los formularios de movimiento: misma grilla que el formulario real (sin saltos al cargar). */
export function EsqueletoFormularioMovimiento({ campos = 5 }: { campos?: number }) {
  return (
    <div role="status" aria-label="Cargando formulario">
      <EsqueletoEncabezado conVolver />
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-5 rounded-tarjeta border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5">
          {Array.from({ length: campos }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-11 w-full rounded-control" />
            </div>
          ))}
          <div className="flex justify-end border-t border-borde pt-5">
            <Skeleton className="h-12 w-full rounded-control sm:w-52" />
          </div>
        </div>
        <div className="space-y-3 rounded-tarjeta border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56 max-w-full" />
          <Skeleton className="h-14 w-full rounded-control" />
        </div>
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

/** Esqueleto del historial de movimientos: buscador con filtros, contador y tabla. */
export function EsqueletoHistorial() {
  return (
    <div>
      <EsqueletoEncabezado />
      <div className="mb-4 space-y-4 rounded-tarjeta border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5">
        <Skeleton className="h-11 w-full rounded-control" />
        <div className="hidden grid-cols-3 gap-3 lg:grid xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-11 w-full rounded-control" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="mb-3 ml-1 h-5 w-64 max-w-full" />
      <SkeletonTabla filas={8} />
    </div>
  );
}
