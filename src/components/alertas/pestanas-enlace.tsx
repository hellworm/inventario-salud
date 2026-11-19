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
 * recargar y volver atrás) y no requieren JavaScript. Misma apariencia que
 * `Tabs` del UI kit.
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
  return (
    <nav aria-label={etiqueta} className={cn("print:hidden", className)}>
      <ul className="relative -mb-px flex gap-1 overflow-x-auto border-b border-borde [scrollbar-width:none]">
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
    </nav>
  );
}
