"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ETIQUETA_TEMA, TEMAS, atributoTema, cookieTema, leerTema, type Tema } from "@/lib/tema";

const ContextoTema = React.createContext<{ tema: Tema; cambiar: (tema: Tema) => void } | null>(null);

/**
 * Preferencia de tema para toda la aplicación. El layout raíz la monta con el
 * valor leído de la cookie, así el control aparece ya marcado desde el servidor.
 */
export function ProveedorTema({ inicial, children }: { inicial: Tema; children: React.ReactNode }) {
  const router = useRouter();
  const [tema, setTema] = React.useState<Tema>(inicial);

  const cambiar = React.useCallback(
    (nuevo: Tema) => {
      setTema(nuevo);
      document.cookie = cookieTema(nuevo, window.location.protocol === "https:");
      // Se aplica de inmediato en el documento…
      const forzado = atributoTema(nuevo);
      if (forzado) document.documentElement.dataset.tema = forzado;
      else delete document.documentElement.dataset.tema;
      // …y el servidor vuelve a renderizar con la cookie nueva (atributo y `theme-color`).
      router.refresh();
    },
    [router],
  );

  const valor = React.useMemo(() => ({ tema, cambiar }), [tema, cambiar]);
  return <ContextoTema.Provider value={valor}>{children}</ContextoTema.Provider>;
}

export function useTema(): { tema: Tema; cambiar: (tema: Tema) => void } {
  const contexto = React.useContext(ContextoTema);
  if (!contexto) throw new Error("useTema requiere <ProveedorTema> (layout raíz).");
  return contexto;
}

const ICONO_TEMA: Readonly<Record<Tema, LucideIcon>> = { claro: Sun, oscuro: Moon, sistema: Monitor };
/** En el control compacto no cabe "Según el dispositivo": se abrevia (el nombre accesible va completo). */
const ETIQUETA_CORTA: Readonly<Record<Tema, string>> = { claro: "Claro", oscuro: "Oscuro", sistema: "Dispositivo" };

// Sin `outline-none`: al recorrer el menú con el teclado se ve el contorno de foco global.
const CLASE_OPCION =
  "flex min-h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border px-1 text-xs font-medium select-none transition-colors";
const CLASE_MARCADA = "border-marca-600 bg-marca-50 text-marca-800";
const CLASE_SIN_MARCAR = "border-transparent text-texto-suave";

/**
 * Selector de tema para el menú de usuario: grupo de tres opciones
 * (`menuitemradio`) que se recorre con las flechas como el resto del menú.
 * Elegir no cierra el menú, para ver el cambio.
 */
export function TemaEnMenu() {
  const { tema, cambiar } = useTema();
  return (
    <>
      <DropdownMenuLabel id="ri-etiqueta-tema">Tema</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={tema}
        onValueChange={(valor) => cambiar(leerTema(valor))}
        aria-labelledby="ri-etiqueta-tema"
        className="grid grid-cols-3 gap-1 px-1.5 pb-1.5"
        data-selector-tema
      >
        {TEMAS.map((opcion) => {
          const Icono = ICONO_TEMA[opcion];
          return (
            <DropdownMenuRadioItem
              key={opcion}
              value={opcion}
              aria-label={ETIQUETA_TEMA[opcion]}
              title={ETIQUETA_TEMA[opcion]}
              onSelect={(e) => e.preventDefault()}
              className={cn(
                CLASE_OPCION,
                "data-[highlighted]:bg-superficie-2 data-[highlighted]:text-texto",
                "data-[state=checked]:border-marca-600 data-[state=checked]:bg-marca-50 data-[state=checked]:text-marca-800",
                "data-[state=unchecked]:border-transparent data-[state=unchecked]:text-texto-suave",
              )}
            >
              <Icono className="size-[1.125rem] shrink-0" aria-hidden />
              <span aria-hidden>{ETIQUETA_CORTA[opcion]}</span>
            </DropdownMenuRadioItem>
          );
        })}
      </DropdownMenuRadioGroup>
    </>
  );
}

/**
 * Selector de tema discreto para las pantallas sin menú de usuario (login,
 * cambio de contraseña): tres radios nativos con forma de íconos.
 */
export function SelectorTema({ className }: { className?: string }) {
  const { tema, cambiar } = useTema();
  const nombre = React.useId();
  return (
    <fieldset className={cn("inline-flex rounded-full border border-borde bg-superficie p-0.5", className)} data-selector-tema>
      <legend className="sr-only">Tema</legend>
      {TEMAS.map((opcion) => {
        const Icono = ICONO_TEMA[opcion];
        const marcado = tema === opcion;
        return (
          <label
            key={opcion}
            title={ETIQUETA_TEMA[opcion]}
            className={cn(
              "flex size-10 cursor-pointer items-center justify-center rounded-full border transition-colors pointer-coarse:size-11",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-foco",
              marcado ? CLASE_MARCADA : cn(CLASE_SIN_MARCAR, "hover:bg-superficie-2 hover:text-texto"),
            )}
          >
            <input
              type="radio"
              name={nombre}
              value={opcion}
              checked={marcado}
              onChange={() => cambiar(opcion)}
              className="sr-only"
            />
            <Icono className="size-[1.125rem] shrink-0" aria-hidden />
            <span className="sr-only">{ETIQUETA_TEMA[opcion]}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
