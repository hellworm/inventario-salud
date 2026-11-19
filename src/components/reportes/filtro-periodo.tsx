"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { hoyEnSantiago, parsearDia, sumarDias, type DiaISO } from "@/lib/fechas";

const ATAJOS = [7, 30, 90] as const;

/**
 * Período del reporte (`?desde=&hasta=`, días inclusive en hora de Chile).
 * Los atajos fijan "últimos N días" terminando hoy.
 */
export function FiltroPeriodo({ desde, hasta, className }: { desde: DiaISO; hasta: DiaISO; className?: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [pendiente, iniciar] = React.useTransition();
  const idDesde = React.useId();
  const idHasta = React.useId();
  const hoy = hoyEnSantiago();

  const aplicar = (nuevoDesde: string, nuevoHasta: string) => {
    const d = parsearDia(nuevoDesde);
    const h = parsearDia(nuevoHasta);
    if (!d || !h) return;
    const copia = new URLSearchParams(params.toString());
    copia.set("desde", d <= h ? d : h);
    copia.set("hasta", d <= h ? h : d);
    copia.delete("pagina");
    copia.delete("paginaMermas");
    iniciar(() => router.replace(`${ruta}?${copia.toString()}`, { scroll: false }));
  };

  return (
    <fieldset className={cn("flex flex-wrap items-end gap-2", pendiente && "opacity-70", className)}>
      <legend className="sr-only">Período</legend>
      <div className="min-w-[9.5rem] flex-1 sm:flex-none">
        <label htmlFor={idDesde} className="mb-1 block text-xs font-medium text-texto-suave">
          Desde
        </label>
        <Input id={idDesde} type="date" value={desde} max={hasta} onChange={(e) => aplicar(e.target.value, hasta)} />
      </div>
      <div className="min-w-[9.5rem] flex-1 sm:flex-none">
        <label htmlFor={idHasta} className="mb-1 block text-xs font-medium text-texto-suave">
          Hasta
        </label>
        <Input id={idHasta} type="date" value={hasta} min={desde} onChange={(e) => aplicar(desde, e.target.value)} />
      </div>
      <div className="flex gap-1.5" role="group" aria-label="Atajos de período">
        {ATAJOS.map((dias) => {
          const inicio = sumarDias(hoy, -(dias - 1));
          const activo = desde === inicio && hasta === hoy;
          return (
            <button
              key={dias}
              type="button"
              aria-pressed={activo}
              onClick={() => aplicar(inicio, hoy)}
              className={cn(
                "min-h-11 rounded-control border px-3 text-sm font-medium whitespace-nowrap transition-colors",
                activo
                  ? "border-marca-600 bg-marca-50 text-marca-800"
                  : "border-borde-fuerte/70 bg-superficie text-texto-suave hover:border-borde-fuerte hover:text-texto",
              )}
            >
              {dias} días
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
