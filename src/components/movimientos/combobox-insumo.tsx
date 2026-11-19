"use client";

import * as React from "react";
import { Loader2, PackageSearch, Search, Snowflake, X } from "lucide-react";
import { buscarInsumosAccion } from "@/acciones/consultas";
import { controlClasses, useCampo, useDebounce } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Insumo del catálogo tal como lo usa el buscador (serializable). */
export interface InsumoOpcion {
  id: string;
  codigo: string;
  nombre: string;
  presentacion: string | null;
  unidadMedida: string;
  categoria: string;
  controlaVencimiento: boolean;
  requiereCadenaFrio: boolean;
  codigoBarras: string | null;
}

export interface ComboboxInsumoProps {
  valor: InsumoOpcion | null;
  onCambiar: (insumo: InsumoOpcion | null) => void;
  /** Primeras opciones del catálogo, para mostrar antes de escribir. */
  iniciales: readonly InsumoOpcion[];
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Versión compacta (filtros): sin línea de detalle en la selección. */
  compacto?: boolean;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

/**
 * Buscador de insumos accesible (patrón combobox de WAI-ARIA): se escribe
 * nombre, código o se escanea el código de barras (el placeholder es corto
 * para que no se corte en celular); flechas para recorrer,
 * Enter para elegir, Esc para cerrar. Dentro de `<Field>` toma id y aria.
 */
export function ComboboxInsumo({
  valor,
  onCambiar,
  iniciales,
  placeholder = "Buscar nombre o código",
  autoFocus,
  disabled,
  compacto = false,
  ...propias
}: ComboboxInsumoProps) {
  const { invalido, ...campo } = useCampo(propias);
  const idLista = React.useId();
  const refInput = React.useRef<HTMLInputElement>(null);
  const refBotonCambiar = React.useRef<HTMLButtonElement>(null);
  const refLista = React.useRef<HTMLUListElement>(null);
  const enfocarAlCambiar = React.useRef<"input" | "boton" | null>(null);

  const [texto, setTexto] = React.useState("");
  const [abierto, setAbierto] = React.useState(false);
  const [activo, setActivo] = React.useState(0);
  const [resultado, setResultado] = React.useState<{ texto: string; opciones: InsumoOpcion[]; error: boolean }>({
    texto: "",
    opciones: [...iniciales],
    error: false,
  });
  const consulta = useDebounce(texto.trim(), 250);
  const buscando = texto.trim() !== resultado.texto;
  const opciones = resultado.opciones;

  React.useEffect(() => {
    let vigente = true;
    if (consulta === "") {
      // Sin texto se muestran las opciones iniciales (no hace falta ir al servidor).
      Promise.resolve().then(() => {
        if (vigente) setResultado({ texto: "", opciones: [...iniciales], error: false });
      });
    } else {
      buscarInsumosAccion({ texto: consulta })
        .then((r) => {
          if (!vigente) return;
          setResultado({ texto: consulta, opciones: r.ok ? r.datos : [], error: !r.ok });
          setActivo(0);
        })
        .catch(() => {
          if (vigente) setResultado({ texto: consulta, opciones: [], error: true });
        });
    }
    return () => {
      vigente = false;
    };
  }, [consulta, iniciales]);

  // Tras elegir o quitar la selección, el foco sigue en el control.
  React.useEffect(() => {
    if (enfocarAlCambiar.current === "input") refInput.current?.focus();
    if (enfocarAlCambiar.current === "boton") refBotonCambiar.current?.focus();
    enfocarAlCambiar.current = null;
  }, [valor]);

  React.useEffect(() => {
    if (!abierto) return;
    refLista.current?.querySelector<HTMLElement>(`[data-indice="${activo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activo, abierto]);

  const elegir = (opcion: InsumoOpcion) => {
    enfocarAlCambiar.current = "boton";
    setAbierto(false);
    setTexto("");
    onCambiar(opcion);
  };

  const quitar = () => {
    enfocarAlCambiar.current = "input";
    onCambiar(null);
  };

  if (valor) {
    return (
      <div
        className={cn(
          "flex min-h-11 items-center gap-3 rounded-control border bg-marca-50/60 py-1.5 pr-1.5 pl-3.5",
          invalido ? "border-peligro-600" : "border-marca-200",
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="text-base leading-snug font-semibold text-texto sm:truncate">{valor.nombre}</p>
          {compacto ? null : (
            <p className="flex items-center gap-x-2 text-sm text-texto-suave">
              <span className="min-w-0 truncate">
                <span className="cifras">{valor.codigo}</span> · {valor.categoria}
                {valor.presentacion ? ` · ${valor.presentacion}` : ""}
              </span>
              {valor.requiereCadenaFrio ? (
                <span className="inline-flex shrink-0 items-center gap-1 font-medium text-info-700">
                  <Snowflake className="size-3.5" aria-hidden />
                  <span className="max-sm:sr-only">Cadena de frío</span>
                </span>
              ) : null}
            </p>
          )}
        </div>
        <button
          ref={refBotonCambiar}
          type="button"
          id={campo.id}
          disabled={disabled}
          aria-describedby={campo["aria-describedby"]}
          aria-label={`Cambiar insumo (seleccionado: ${valor.nombre})`}
          onClick={quitar}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control px-3 text-sm font-medium text-marca-800 hover:bg-marca-100 disabled:opacity-55"
        >
          <X className="size-4" aria-hidden />
          Cambiar
        </button>
      </div>
    );
  }

  const idOpcion = (i: number) => `${idLista}-op-${i}`;
  const hayLista = abierto && !disabled;

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setAbierto(false);
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[1.125rem] -translate-y-1/2 text-texto-tenue" aria-hidden />
      <input
        ref={refInput}
        type="text"
        role="combobox"
        aria-expanded={hayLista}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={hayLista && opciones[activo] ? idOpcion(activo) : undefined}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        value={texto}
        {...campo}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          setActivo(0);
        }}
        onFocus={() => setAbierto(true)}
        onClick={() => setAbierto(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!abierto) setAbierto(true);
            else setActivo((i) => Math.min(i + 1, opciones.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActivo((i) => Math.max(i - 1, 0));
          } else if (e.key === "Home" && abierto) {
            e.preventDefault();
            setActivo(0);
          } else if (e.key === "End" && abierto) {
            e.preventDefault();
            setActivo(Math.max(opciones.length - 1, 0));
          } else if (e.key === "Enter") {
            // Enter nunca envía el formulario desde el buscador (los lectores de
            // código de barras terminan con Enter).
            e.preventDefault();
            const opcion = opciones[activo];
            if (abierto && !buscando && opcion) elegir(opcion);
          } else if (e.key === "Escape" && abierto) {
            e.preventDefault();
            setAbierto(false);
          }
        }}
        className={cn(controlClasses(invalido), "pr-10 pl-10")}
      />
      {buscando ? (
        <Loader2 className="absolute top-1/2 right-3.5 size-[1.125rem] -translate-y-1/2 animate-spin text-texto-tenue" aria-hidden />
      ) : null}

      <ul
        ref={refLista}
        id={idLista}
        role="listbox"
        aria-label="Insumos"
        hidden={!hayLista}
        className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto overscroll-contain rounded-control border border-borde bg-superficie py-1 shadow-flotante"
      >
        {opciones.map((o, i) => (
          <li
            key={o.id}
            id={idOpcion(i)}
            role="option"
            aria-selected={i === activo}
            data-indice={i}
            // Evita que el input pierda el foco antes del clic.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => elegir(o)}
            onMouseMove={() => setActivo(i)}
            className={cn(
              "flex min-h-12 cursor-pointer items-center gap-3 px-3.5 py-2",
              i === activo ? "bg-marca-50" : "bg-superficie",
              buscando && "opacity-60",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.9375rem] font-medium text-texto">{o.nombre}</span>
              <span className="block truncate text-xs text-texto-suave">
                <span className="cifras">{o.codigo}</span> · {o.categoria}
                {o.presentacion ? ` · ${o.presentacion}` : ""}
              </span>
            </span>
            {o.requiereCadenaFrio ? <Snowflake className="size-4 shrink-0 text-info-700" aria-label="Cadena de frío" /> : null}
          </li>
        ))}
        {opciones.length === 0 && !buscando ? (
          <li role="presentation" className="flex items-center gap-3 px-3.5 py-4 text-sm text-texto-suave">
            <PackageSearch className="size-5 shrink-0 text-texto-tenue" aria-hidden />
            {resultado.error
              ? "No pudimos buscar. Revisa tu conexión e intenta de nuevo."
              : resultado.texto
                ? `Ningún insumo activo coincide con "${resultado.texto}".`
                : "No hay insumos activos en el catálogo."}
          </li>
        ) : null}
        {opciones.length === 0 && buscando ? (
          <li role="presentation" className="px-3.5 py-4 text-sm text-texto-suave">
            Buscando…
          </li>
        ) : null}
      </ul>
      <p className="sr-only" role="status" aria-live="polite">
        {hayLista && !buscando
          ? opciones.length === 0
            ? "Sin resultados"
            : `${opciones.length} ${opciones.length === 1 ? "resultado" : "resultados"}. Usa las flechas para recorrer y Enter para elegir.`
          : ""}
      </p>
    </div>
  );
}
