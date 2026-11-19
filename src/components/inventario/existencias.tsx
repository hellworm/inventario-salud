import * as React from "react";
import { CalendarX2, MapPin } from "lucide-react";
import { Badge, BadgeEstadoVencimiento } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatearDia } from "@/lib/fechas";
import { formatearNumero } from "@/lib/formato";
import { cantidadConUnidad } from "@/lib/unidades";
import type { ExistenciaDetalle, FilaInventario } from "@/server/servicios";

/** Agrupa las existencias (lote × ubicación) por ubicación, conservando el orden FEFO. */
export function agruparPorUbicacion(existencias: readonly ExistenciaDetalle[]) {
  const grupos = new Map<string, { ubicacionId: string; nombre: string; centro: string; filas: ExistenciaDetalle[]; total: number; vencido: number }>();
  for (const e of existencias) {
    const g = grupos.get(e.ubicacionId) ?? { ubicacionId: e.ubicacionId, nombre: e.ubicacion, centro: e.centro, filas: [], total: 0, vencido: 0 };
    g.filas.push(e);
    g.total += e.cantidad;
    if (e.estadoVencimiento === "VENCIDO") g.vencido += e.cantidad;
    grupos.set(e.ubicacionId, g);
  }
  return [...grupos.values()];
}

/**
 * "Dónde está": lotes del insumo agrupados por ubicación, con vencimiento y
 * cantidad. `accionesUbicacion` agrega botones por ubicación (p. ej. Retirar).
 */
export function ExistenciasPorUbicacion({
  existencias,
  unidad,
  mostrarCentro,
  accionesUbicacion,
}: {
  existencias: readonly ExistenciaDetalle[];
  unidad: string;
  mostrarCentro: boolean;
  accionesUbicacion?: (grupo: { ubicacionId: string; total: number; vencido: number }) => React.ReactNode;
}) {
  const grupos = agruparPorUbicacion(existencias);
  return (
    <ul className="space-y-5">
      {grupos.map((g) => (
        <li key={g.ubicacionId}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[0.9375rem] font-semibold text-texto">
                <MapPin className="size-4 shrink-0 text-marca-600" aria-hidden />
                <span className="truncate">{g.nombre}</span>
              </p>
              <p className="pl-[1.375rem] text-sm text-texto-suave">
                {mostrarCentro ? `${g.centro} · ` : ""}
                <span className="cifras">{cantidadConUnidad(g.total, unidad)}</span> en {g.filas.length}{" "}
                {g.filas.length === 1 ? "lote" : "lotes"}
              </p>
            </div>
            {accionesUbicacion ? <div className="flex shrink-0 items-center gap-1.5">{accionesUbicacion(g)}</div> : null}
          </div>
          <ul className="mt-2 divide-y divide-borde overflow-hidden rounded-control border border-borde">
            {g.filas.map((e) => (
              <li
                key={e.existenciaId}
                className={cn("flex items-center justify-between gap-3 px-3.5 py-2.5", e.estadoVencimiento === "VENCIDO" && "bg-peligro-50/50")}
              >
                <div className="min-w-0">
                  <p className="cifras truncate text-sm font-semibold text-texto">Lote {e.numeroLote}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-texto-suave">
                    {e.fechaVencimiento ? <span className="cifras">Vence {formatearDia(e.fechaVencimiento)}</span> : null}
                    {e.estadoVencimiento !== "VIGENTE" ? (
                      <BadgeEstadoVencimiento estado={e.estadoVencimiento} dias={e.diasParaVencer} />
                    ) : null}
                  </p>
                </div>
                <p className="shrink-0 text-right">
                  <span className={cn("cifras block text-base font-semibold", e.estadoVencimiento === "VENCIDO" ? "text-peligro-700" : "text-texto")}>
                    {formatearNumero(e.cantidad)}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/** Badges de vencimiento a nivel de insumo: stock vencido y lo que vence pronto. */
export function BadgesVencimientoInsumo({
  fila,
}: {
  fila: Pick<FilaInventario, "vencido" | "porVencer" | "diasParaVencer">;
}) {
  return (
    <>
      {fila.vencido > 0 ? (
        <Badge tono="peligro" icono={CalendarX2}>
          <span className="cifras">{formatearNumero(fila.vencido)}</span> {fila.vencido === 1 ? "vencido" : "vencidos"}
        </Badge>
      ) : null}
      {fila.porVencer > 0 ? <BadgeEstadoVencimiento estado="POR_VENCER" dias={fila.diasParaVencer} /> : null}
    </>
  );
}
