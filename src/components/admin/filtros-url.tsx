"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { buttonClasses, Input, Select, type SelectOption } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Actualiza un parámetro de la URL conservando los demás y volviendo a la página 1. */
function useParametroUrl(parametro: string): [string, (valor: string) => void, boolean] {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [pendiente, iniciar] = React.useTransition();
  const actual = params.get(parametro) ?? "";
  const cambiar = (valor: string) => {
    const copia = new URLSearchParams(params.toString());
    if (valor) copia.set(parametro, valor);
    else copia.delete(parametro);
    copia.delete("pagina");
    const consulta = copia.toString();
    iniciar(() => router.replace(consulta ? `${ruta}?${consulta}` : ruta, { scroll: false }));
  };
  return [actual, cambiar, pendiente];
}

export interface FiltroSelectProps {
  /** Parámetro de la URL (p. ej. `estado`). */
  parametro: string;
  /** Nombre accesible del filtro. */
  label: string;
  opciones: readonly SelectOption[];
  /** Texto de la opción "sin filtro". */
  todos: string;
  className?: string;
}

/** Filtro de lista sincronizado con la URL (la página servidor relee `searchParams`). */
export function FiltroSelect({ parametro, label, opciones, todos, className }: FiltroSelectProps) {
  const [actual, cambiar, pendiente] = useParametroUrl(parametro);
  return (
    <Select
      aria-label={label}
      value={actual}
      onChange={(e) => cambiar(e.target.value)}
      opciones={opciones}
      placeholder={todos}
      className={cn(pendiente && "opacity-70", className)}
    />
  );
}

/** Filtro de fecha (`YYYY-MM-DD`) sincronizado con la URL. */
export function FiltroFecha({ parametro, label, className, min, max }: { parametro: string; label: string; className?: string; min?: string; max?: string }) {
  const [actual, cambiar] = useParametroUrl(parametro);
  const id = React.useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-texto-suave">
        {label}
      </label>
      <Input id={id} type="date" value={actual} min={min} max={max} onChange={(e) => cambiar(e.target.value)} />
    </div>
  );
}

/** Enlace "Limpiar filtros": visible solo si hay alguno de los parámetros indicados. */
export function LimpiarFiltros({ parametros }: { parametros: readonly string[] }) {
  const ruta = usePathname();
  const params = useSearchParams();
  if (!parametros.some((p) => params.get(p))) return null;
  const copia = new URLSearchParams(params.toString());
  for (const p of [...parametros, "pagina"]) copia.delete(p);
  const consulta = copia.toString();
  return (
    <Link href={consulta ? `${ruta}?${consulta}` : ruta} className={buttonClasses({ variant: "fantasma", size: "sm" })} scroll={false}>
      <X aria-hidden />
      Limpiar filtros
    </Link>
  );
}
