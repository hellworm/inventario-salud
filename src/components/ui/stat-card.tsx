import * as React from "react";
import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type StatTono = "neutro" | "marca" | "exito" | "alerta" | "peligro";

const ICONO: Record<StatTono, string> = {
  neutro: "bg-superficie-2 text-texto-suave",
  marca: "bg-marca-50 text-marca-700",
  exito: "bg-exito-50 text-exito-700",
  alerta: "bg-alerta-50 text-alerta-700",
  peligro: "bg-peligro-50 text-peligro-700",
};

export interface StatCardProps {
  etiqueta: string;
  /** Valor ya formateado (usar `formatearNumero`). */
  valor: React.ReactNode;
  /** Texto secundario bajo el valor. */
  detalle?: React.ReactNode;
  icono?: LucideIcon;
  tono?: StatTono;
  /** Si se indica, toda la tarjeta es un enlace. */
  href?: string;
  className?: string;
}

/** Tarjeta de indicador (KPI). */
export function StatCard({ etiqueta, valor, detalle, icono: Icono, tono = "neutro", href, className }: StatCardProps) {
  const contenido = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-texto-suave">{etiqueta}</p>
        {Icono ? (
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", ICONO[tono])}>
            <Icono className="size-[1.125rem]" aria-hidden />
          </span>
        ) : null}
      </div>
      <p className="cifras mt-1 text-[1.75rem] leading-9 font-semibold tracking-tight text-texto">{valor}</p>
      {detalle || href ? (
        <p className="mt-1 flex items-center gap-1 text-sm text-texto-suave">
          <span className="min-w-0 truncate">{detalle}</span>
          {href ? (
            <ArrowRight className="ml-auto size-4 shrink-0 text-texto-tenue transition-transform group-hover:translate-x-0.5 group-hover:text-marca-700" aria-hidden />
          ) : null}
        </p>
      ) : null}
    </>
  );
  const clases = cn(
    "block rounded-tarjeta border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5",
    href && "group transition-colors hover:border-marca-300",
    className,
  );
  return href ? (
    <Link href={href} className={clases}>
      {contenido}
    </Link>
  ) : (
    <div className={clases}>{contenido}</div>
  );
}
