"use client";

/**
 * Filtros de lista sincronizados con la URL. Patrón único de panel, alertas,
 * reportes y administración:
 *
 * ```tsx
 * <BarraFiltros parametros={["q", "categoria", "centro"]}>
 *   <FiltroBusqueda placeholder="Insumo, código o lote…" />
 *   <FiltroSelect parametro="categoria" etiqueta="Categoría" todos="Todas" opciones={…} />
 * </BarraFiltros>
 * ```
 *
 * - La barra es una tarjeta; cada control lleva su etiqueta visible encima.
 * - "Limpiar filtros" aparece solo cuando hay alguno de `parametros` en la URL.
 * - El estado vive en la URL: la página servidor relee `searchParams`.
 */
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button, Input, SearchInput, Select, type SelectOption } from "@/components/ui";
import { cn } from "@/lib/cn";
import { hoyEnSantiago, parsearDia, sumarDias, type DiaISO } from "@/lib/fechas";

/** Se incrementa al limpiar: los buscadores se reinician aunque su texto aún no llegue a la URL. */
const ContextoBarra = React.createContext(0);

const CLASE_ETIQUETA = "mb-1 block text-xs font-medium text-texto-suave";

/** Quita los parámetros de paginación (`pagina`, `paginaMermas`…): todo filtro vuelve a la página 1. */
function quitarPaginas(consulta: URLSearchParams) {
  for (const clave of [...consulta.keys()]) if (clave.startsWith("pagina")) consulta.delete(clave);
}

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
    quitarPaginas(copia);
    const consulta = copia.toString();
    iniciar(() => router.replace(consulta ? `${ruta}?${consulta}` : ruta, { scroll: false }));
  };
  return [actual, cambiar, pendiente];
}

/**
 * Barra de filtros en tarjeta. En móvil los controles van en dos columnas (el
 * buscador y el período ocupan el ancho completo); desde `sm` fluyen en fila.
 */
export function BarraFiltros({
  parametros,
  etiqueta = "Filtros",
  className,
  children,
}: {
  /** Parámetros de la URL que cuentan como filtro activo y que borra "Limpiar filtros". */
  parametros: readonly string[];
  /** Nombre accesible de la barra. */
  etiqueta?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [version, setVersion] = React.useState(0);
  const hayActivos = parametros.some((p) => params.get(p));

  function limpiar() {
    const copia = new URLSearchParams(params.toString());
    for (const p of parametros) copia.delete(p);
    quitarPaginas(copia);
    const consulta = copia.toString();
    setVersion((v) => v + 1);
    router.replace(consulta ? `${ruta}?${consulta}` : ruta, { scroll: false });
  }

  return (
    <ContextoBarra.Provider value={version}>
      <section
        aria-label={etiqueta}
        className={cn("mb-4 rounded-tarjeta border border-borde bg-superficie p-3 shadow-tarjeta sm:p-4 print:hidden", className)}
      >
        <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
          {children}
          {hayActivos ? (
            <Button variant="fantasma" onClick={limpiar} className="col-span-2 shrink-0 sm:ml-auto">
              <X aria-hidden />
              Limpiar filtros
            </Button>
          ) : null}
        </div>
      </section>
    </ContextoBarra.Provider>
  );
}

/** Buscador de la barra (`?q=` por defecto) con su etiqueta visible. */
export function FiltroBusqueda({
  parametro = "q",
  etiqueta = "Buscar",
  placeholder,
  className,
}: {
  parametro?: string;
  /** Etiqueta visible y nombre accesible del buscador. */
  etiqueta?: string;
  placeholder: string;
  className?: string;
}) {
  const version = React.useContext(ContextoBarra);
  return (
    <div className={cn("col-span-2 min-w-0 sm:min-w-64 sm:flex-[2] sm:basis-64 lg:max-w-sm", className)}>
      <span className={CLASE_ETIQUETA} aria-hidden>
        {etiqueta}
      </span>
      <SearchInput
        key={version}
        parametro={parametro}
        label={etiqueta}
        placeholder={placeholder}
        valorInicial={version > 0 ? "" : undefined}
      />
    </div>
  );
}

export interface FiltroSelectProps {
  /** Parámetro de la URL (p. ej. `estado`). */
  parametro: string;
  /** Etiqueta visible del filtro (p. ej. "Categoría"). */
  etiqueta: string;
  opciones: readonly SelectOption[];
  /** Texto de la opción "sin filtro" (p. ej. "Todas"). Sin él no hay opción vacía y rige la primera. */
  todos?: string;
  className?: string;
}

/** Select de la barra: escribe `?parametro=valor`; la opción vacía quita el filtro. */
export function FiltroSelect({ parametro, etiqueta, opciones, todos, className }: FiltroSelectProps) {
  const [actual, cambiar, pendiente] = useParametroUrl(parametro);
  const id = React.useId();
  const valor = opciones.some((o) => o.value === actual) ? actual : todos !== undefined ? "" : (opciones[0]?.value ?? "");
  return (
    <div className={cn("min-w-0 sm:min-w-44 sm:flex-1 sm:basis-44 sm:max-w-64", className)}>
      <label htmlFor={id} className={CLASE_ETIQUETA}>
        {etiqueta}
      </label>
      <Select
        id={id}
        value={valor}
        onChange={(e) => cambiar(e.target.value)}
        opciones={opciones}
        placeholder={todos}
        className={cn(pendiente && "opacity-70")}
      />
    </div>
  );
}

/** Fecha suelta (`YYYY-MM-DD`) sincronizada con la URL; vacía quita el filtro. */
export function FiltroFecha({
  parametro,
  etiqueta,
  className,
  min,
  max,
}: {
  parametro: string;
  etiqueta: string;
  className?: string;
  min?: string;
  max?: string;
}) {
  const [actual, cambiar] = useParametroUrl(parametro);
  const id = React.useId();
  return (
    <div className={cn("min-w-0 sm:w-[10.5rem] sm:flex-none", className)}>
      <label htmlFor={id} className={CLASE_ETIQUETA}>
        {etiqueta}
      </label>
      <Input id={id} type="date" value={actual} min={min} max={max} onChange={(e) => cambiar(e.target.value)} />
    </div>
  );
}

const ATAJOS_PERIODO = [7, 30, 90] as const;

/**
 * Período de un reporte (`?desde=&hasta=`, días inclusive en hora de Chile).
 * Siempre hay un período vigente (lo resuelve el servicio); los atajos fijan
 * "últimos N días" terminando hoy.
 */
export function FiltroPeriodo({
  desde,
  hasta,
  de,
  className,
}: {
  desde: DiaISO;
  hasta: DiaISO;
  /** A qué se aplica el período cuando la barra filtra más de una lista (p. ej. "Mermas"). */
  de?: string;
  className?: string;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [pendiente, iniciar] = React.useTransition();
  const idDesde = React.useId();
  const idHasta = React.useId();
  const hoy = hoyEnSantiago();

  const aplicar = (nuevoDesde: string, nuevoHasta: string) => {
    const d = parsearDia(nuevoDesde);
    const h = parsearDia(nuevoHasta);
    if (!d || !h) return;
    const copia = new URLSearchParams(params.toString());
    copia.set("desde", d <= h ? d : h);
    copia.set("hasta", d <= h ? h : d);
    quitarPaginas(copia);
    iniciar(() => router.replace(`${ruta}?${copia.toString()}`, { scroll: false }));
  };

  return (
    <fieldset className={cn("col-span-2 flex min-w-0 flex-wrap items-end gap-x-3 gap-y-2", pendiente && "opacity-70", className)}>
      <legend className="sr-only">{de ? `Período de ${de.toLowerCase()}` : "Período"}</legend>
      <div className="min-w-[8.5rem] flex-1 sm:w-[10.5rem] sm:flex-none">
        <label htmlFor={idDesde} className={CLASE_ETIQUETA}>
          {de ? `${de} desde` : "Desde"}
        </label>
        <Input id={idDesde} type="date" value={desde} max={hasta} onChange={(e) => aplicar(e.target.value, hasta)} />
      </div>
      <div className="min-w-[8.5rem] flex-1 sm:w-[10.5rem] sm:flex-none">
        <label htmlFor={idHasta} className={CLASE_ETIQUETA}>
          {de ? `${de} hasta` : "Hasta"}
        </label>
        <Input id={idHasta} type="date" value={hasta} min={desde} onChange={(e) => aplicar(desde, e.target.value)} />
      </div>
      <div className="flex gap-1.5" role="group" aria-label="Atajos de período">
        {ATAJOS_PERIODO.map((dias) => {
          const inicio = sumarDias(hoy, -(dias - 1));
          const activo = desde === inicio && hasta === hoy;
          return (
            <button
              key={dias}
              type="button"
              aria-pressed={activo}
              onClick={() => aplicar(inicio, hoy)}
              className={cn(
                "min-h-11 rounded-control border px-3 text-sm font-medium whitespace-nowrap transition-colors",
                activo
                  ? "border-marca-600 bg-marca-50 text-marca-800"
                  : "border-borde-fuerte/70 bg-superficie text-texto-suave hover:border-borde-fuerte hover:text-texto",
              )}
            >
              {dias} días
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Filtro por centro: solo se muestra en "Toda la red" (con un centro activo manda el selector global). */
export function FiltroCentro({
  centroActivoId,
  centros,
  className,
}: {
  centroActivoId: string | null;
  centros: readonly { id: string; nombre: string }[];
  className?: string;
}) {
  if (centroActivoId || centros.length < 2) return null;
  return (
    <FiltroSelect
      parametro="centro"
      etiqueta="Centro"
      todos="Todos"
      opciones={centros.map((c) => ({ value: c.id, label: c.nombre }))}
      className={className}
    />
  );
}
