import Link from "next/link";
import { CalendarClock, CalendarX2, ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { pluralizar } from "@/lib/formato";
import type { TramoVencimientoPanel } from "@/server/servicios";

const TRAMO: Record<TramoVencimientoPanel["clave"], { etiqueta: string; href: string; barra: string; icono: LucideIcon; iconoColor: string }> = {
  VENCIDO: { etiqueta: "Vencidos", href: "/alertas?tab=vencidos", barra: "bg-peligro-600", icono: CalendarX2, iconoColor: "text-peligro-700" },
  "30": { etiqueta: "30 días o menos", href: "/alertas?tab=por-vencer&tramo=30", barra: "bg-alerta-500", icono: CalendarClock, iconoColor: "text-alerta-700" },
  "60": { etiqueta: "31 a 60 días", href: "/alertas?tab=por-vencer&tramo=60", barra: "bg-marca-400", icono: CalendarClock, iconoColor: "text-texto-tenue" },
  "90": { etiqueta: "61 a 90 días", href: "/alertas?tab=por-vencer&tramo=90", barra: "bg-marca-300", icono: CalendarClock, iconoColor: "text-texto-tenue" },
};

/**
 * Lotes con stock por tramo de vencimiento. Barras horizontales con el valor
 * escrito al lado (no hay que estimar largos) y cada fila enlaza a /alertas
 * con el filtro correspondiente.
 */
export function GraficoVencimientos({ tramos }: { tramos: readonly TramoVencimientoPanel[] }) {
  const maximo = Math.max(1, ...tramos.map((t) => t.lotes));
  return (
    <ul className="-mx-2" aria-label="Lotes con stock por tramo de vencimiento">
      {tramos.map((t) => {
        const { etiqueta, href, barra, icono: Icono, iconoColor } = TRAMO[t.clave];
        return (
          <li key={t.clave}>
            <Link href={href} className="group block rounded-lg px-2 py-2.5 hover:bg-marca-50/60">
              <span className="flex items-center gap-2 text-sm">
                <Icono className={cn("size-4 shrink-0", iconoColor)} aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium">{etiqueta}</span>
                <span className="cifras shrink-0 text-right">
                  <strong className="font-semibold">{pluralizar(t.lotes, "lote")}</strong>
                </span>
                <ChevronRight className="size-4 shrink-0 text-texto-tenue group-hover:text-marca-700" aria-hidden />
              </span>
              <span className="mt-1.5 block h-2 rounded-full bg-superficie-2 ring-1 ring-borde ring-inset" aria-hidden>
                <span
                  className={cn("block h-full rounded-full", barra)}
                  style={{ width: t.lotes === 0 ? 0 : `${Math.max((t.lotes / maximo) * 100, 3)}%` }}
                />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
