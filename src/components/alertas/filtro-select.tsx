"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, type SelectOption } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Select que sincroniza un filtro con la URL (`?parametro=valor`) y vuelve a
 * la página 1. La opción vacía quita el filtro.
 */
export function FiltroSelect({
  parametro,
  etiqueta,
  opciones,
  todos,
  className,
}: {
  parametro: string;
  /** Nombre accesible del filtro (p. ej. "Categoría"). */
  etiqueta: string;
  opciones: readonly SelectOption[];
  /** Texto de la opción "sin filtro" (p. ej. "Todas las categorías"). Sin él, no hay opción vacía. */
  todos?: string;
  className?: string;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [pendiente, iniciar] = React.useTransition();
  const actual = params.get(parametro) ?? "";
  const valor = opciones.some((o) => o.value === actual) ? actual : todos !== undefined ? "" : (opciones[0]?.value ?? "");

  return (
    <Select
      aria-label={etiqueta}
      className={cn(pendiente && "opacity-70", className)}
      value={valor}
      opciones={opciones}
      placeholder={todos}
      onChange={(e) => {
        const copia = new URLSearchParams(params.toString());
        if (e.target.value) copia.set(parametro, e.target.value);
        else copia.delete(parametro);
        copia.delete("pagina");
        const consulta = copia.toString();
        iniciar(() => router.replace(consulta ? `${ruta}?${consulta}` : ruta, { scroll: false }));
      }}
    />
  );
}
