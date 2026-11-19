"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { controlClasses } from "./field";

/** Devuelve `valor` con retardo: útil para búsquedas mientras se escribe. */
export function useDebounce<T>(valor: T, retardoMs = 350): T {
  const [diferido, setDiferido] = React.useState(valor);
  React.useEffect(() => {
    const id = setTimeout(() => setDiferido(valor), retardoMs);
    return () => clearTimeout(id);
  }, [valor, retardoMs]);
  return diferido;
}

export interface SearchInputProps {
  /** Parámetro de URL que se actualiza (por defecto `q`). */
  parametro?: string;
  placeholder?: string;
  /** Nombre accesible del buscador. */
  label?: string;
  retardoMs?: number;
  className?: string;
  /**
   * Modo controlado: si se entrega, NO toca la URL y solo avisa el texto
   * (ya con debounce). Útil para buscadores dentro de formularios.
   */
  onBuscar?: (texto: string) => void;
  valorInicial?: string;
  autoFocus?: boolean;
}

/**
 * Buscador con debounce. Por defecto sincroniza `?q=` en la URL (y vuelve a
 * la página 1), de modo que la página servidor relea sus `searchParams`.
 */
export function SearchInput({
  parametro = "q",
  placeholder = "Buscar…",
  label = "Buscar",
  retardoMs = 350,
  className,
  onBuscar,
  valorInicial,
  autoFocus,
}: SearchInputProps) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const enUrl = params.get(parametro) ?? "";
  const [texto, setTexto] = React.useState(valorInicial ?? (onBuscar ? "" : enUrl));
  const [pendiente, iniciar] = React.useTransition();
  const diferido = useDebounce(texto, retardoMs);
  const ultimoEnviado = React.useRef(texto);

  React.useEffect(() => {
    const limpio = diferido.trim();
    if (limpio === ultimoEnviado.current.trim()) return;
    ultimoEnviado.current = limpio;
    if (onBuscar) {
      onBuscar(limpio);
      return;
    }
    const copia = new URLSearchParams(params.toString());
    if (limpio) copia.set(parametro, limpio);
    else copia.delete(parametro);
    copia.delete("pagina");
    const consulta = copia.toString();
    iniciar(() => router.replace(consulta ? `${ruta}?${consulta}` : ruta, { scroll: false }));
    // Solo debe reaccionar al texto diferido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diferido]);

  return (
    <div className={cn("relative", className)} role="search">
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[1.125rem] -translate-y-1/2 text-texto-tenue" aria-hidden />
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoFocus={autoFocus}
        aria-label={label}
        placeholder={placeholder}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        className={cn(controlClasses(false), "pr-11 pl-10 [&::-webkit-search-cancel-button]:hidden")}
      />
      <div className="absolute inset-y-0 right-0 flex items-center">
        {pendiente ? (
          <Loader2 className="mr-3 size-[1.125rem] animate-spin text-texto-tenue" aria-label="Buscando" />
        ) : texto ? (
          <button
            type="button"
            onClick={() => setTexto("")}
            className="flex size-11 items-center justify-center rounded-full text-texto-suave hover:bg-superficie-2 hover:text-texto"
            aria-label="Limpiar búsqueda"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}
