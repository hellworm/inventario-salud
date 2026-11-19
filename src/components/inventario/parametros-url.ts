"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type CambiosUrl = Record<string, string | null | undefined>;

/**
 * Estado en la URL para filtros y paneles: cambia `searchParams` sin perder
 * los demás ni saltar al inicio de la página, y expone `pendiente` mientras el
 * servidor responde (para atenuar el listado).
 */
export function useParametrosUrl() {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [pendiente, iniciar] = React.useTransition();

  /** URL actual con los cambios aplicados (`null`/"" elimina el parámetro). */
  const urlCon = React.useCallback(
    (cambios: CambiosUrl, opciones: { conservarPagina?: boolean } = {}) => {
      const copia = new URLSearchParams(params.toString());
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor) copia.set(clave, valor);
        else copia.delete(clave);
      }
      if (!opciones.conservarPagina) copia.delete("pagina");
      const consulta = copia.toString();
      return consulta ? `${ruta}?${consulta}` : ruta;
    },
    [params, ruta],
  );

  /** Aplica filtros (reemplaza la entrada del historial y vuelve a la página 1). */
  const filtrar = React.useCallback(
    (cambios: CambiosUrl) => iniciar(() => router.replace(urlCon(cambios), { scroll: false })),
    [router, urlCon],
  );

  return { params, urlCon, filtrar, pendiente, iniciar, router };
}

/**
 * Devuelve el foco a la fila que abrió un panel o diálogo controlado por URL
 * (no hay `Trigger` de Radix que lo haga). Las filas se marcan con
 * `data-fila={id}`; se elige la visible (tabla en escritorio, tarjeta en móvil).
 */
export function enfocarFila(id: string | null): void {
  if (!id) return;
  const candidatos = document.querySelectorAll<HTMLElement>(`[data-fila="${CSS.escape(id)}"]`);
  for (const el of candidatos) {
    if (el.offsetParent !== null) {
      el.focus();
      return;
    }
  }
}
