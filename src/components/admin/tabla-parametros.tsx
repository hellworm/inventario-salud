"use client";

import * as React from "react";
import { CircleAlert, Save } from "lucide-react";
import { guardarParametrosStockAccion } from "@/acciones/admin-catalogo";
import { Alert, Badge, Button, controlClasses, EmptyState, useAccion } from "@/components/ui";
import { cn } from "@/lib/cn";
import { esquemaParametrosStock } from "@/lib/esquemas/catalogo";
import { formatearNumero, pluralizar } from "@/lib/formato";
import { cantidadConUnidad, pluralUnidad } from "@/lib/unidades";
import { AvisoCambiosSinGuardar, useCambiosSinGuardar } from "./use-cambios-sin-guardar";
import { useValidacion } from "./use-validacion";

export interface FilaParametro {
  centroId: string;
  centro: string;
  /** Institución del centro (se muestra cuando hay centros de varias). */
  institucion?: string;
  centroActivo: boolean;
  stockMinimo: number | null;
  stockMaximo: number | null;
  stockActual: number;
}

type Valores = Record<string, { minimo: string; maximo: string }>;

function aValores(filas: readonly FilaParametro[]): Valores {
  return Object.fromEntries(
    filas.map((f) => [f.centroId, { minimo: f.stockMinimo?.toString() ?? "", maximo: f.stockMaximo?.toString() ?? "" }]),
  );
}

/** Tabla centro × mínimo × máximo de un insumo. Se guarda todo junto. */
export function TablaParametros({
  insumoId,
  unidadMedida,
  filas,
  mostrarInstitucion = false,
}: {
  insumoId: string;
  unidadMedida: string;
  filas: FilaParametro[];
  mostrarInstitucion?: boolean;
}) {
  const [valores, setValores] = React.useState<Valores>(() => aValores(filas));
  const [guardados, setGuardados] = React.useState<Valores>(() => aValores(filas));
  const guardar = useAccion(guardarParametrosStockAccion, {
    exito: (r) =>
      r.actualizados === 0 ? "No había cambios que guardar" : `Parámetros guardados en ${pluralizar(r.actualizados, "centro")}`,
    alExito: () => setGuardados(valores),
    toastError: false,
  });
  const validacion = useValidacion(esquemaParametrosStock, guardar.erroresCampo);
  const idBase = React.useId();
  const modificados = filas.filter(
    (f) => valores[f.centroId]?.minimo !== guardados[f.centroId]?.minimo || valores[f.centroId]?.maximo !== guardados[f.centroId]?.maximo,
  ).length;
  useCambiosSinGuardar(modificados > 0);

  if (filas.length === 0) {
    return <EmptyState compacto titulo="Aún no hay centros" descripcion="Crea un centro para definir sus mínimos de stock." />;
  }

  function cambiar(indice: number, centroId: string, campo: "minimo" | "maximo", valor: string) {
    const limpio = valor.replace(/[^\d.]/g, "");
    setValores((v) => ({ ...v, [centroId]: { minimo: v[centroId]?.minimo ?? "", maximo: v[centroId]?.maximo ?? "", [campo]: limpio } }));
    validacion.limpiarCampo(`parametros.${indice}.${campo === "minimo" ? "stockMinimo" : "stockMaximo"}`);
  }

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const entrada = {
      insumoId,
      parametros: filas.map((f) => ({
        centroId: f.centroId,
        stockMinimo: valores[f.centroId]?.minimo ?? "",
        stockMaximo: valores[f.centroId]?.maximo ?? "",
      })),
    };
    if (!validacion.validar(entrada)) return;
    void guardar.ejecutar(entrada);
  }

  const e = validacion.errores;
  const hayErrores = Object.keys(e).length > 0;

  return (
    <form noValidate onSubmit={enviar}>
      {guardar.error && !hayErrores ? (
        <Alert tono="peligro" className="mb-4">
          {guardar.error}
        </Alert>
      ) : null}

      <div role="table" aria-label="Stock mínimo y máximo por centro" className="rounded-control border border-borde">
        <div
          role="row"
          className="hidden grid-cols-[minmax(0,1fr)_9rem_8rem_8rem] items-center gap-4 border-b border-borde bg-superficie-2 px-4 py-2.5 text-xs font-semibold tracking-wide text-texto-suave uppercase md:grid"
        >
          <span role="columnheader">Centro</span>
          <span role="columnheader" className="text-right">
            Stock hoy ({pluralUnidad(unidadMedida)})
          </span>
          <span role="columnheader">Mínimo</span>
          <span role="columnheader">Máximo</span>
        </div>
        <div role="rowgroup" className="divide-y divide-borde">
          {filas.map((f, i) => {
            const errorMinimo = e[`parametros.${i}.stockMinimo`]?.[0];
            const errorMaximo = e[`parametros.${i}.stockMaximo`]?.[0];
            const idMinimo = `${idBase}-min-${i}`;
            const idMaximo = `${idBase}-max-${i}`;
            const idError = `${idBase}-err-${i}`;
            const error = errorMinimo ?? errorMaximo;
            const v = valores[f.centroId] ?? { minimo: "", maximo: "" };
            const minimo = v.minimo === "" ? null : Number(v.minimo.replace(/\./g, ""));
            const bajo = minimo !== null && Number.isFinite(minimo) && minimo > 0 && f.stockActual < minimo;
            return (
              <div key={f.centroId} role="row" className="px-4 py-3.5 md:py-3">
                <div className="grid grid-cols-2 items-center gap-x-4 gap-y-2.5 md:grid-cols-[minmax(0,1fr)_9rem_8rem_8rem]">
                  <div role="cell" className="col-span-2 flex min-w-0 flex-col items-start gap-x-3 gap-y-0.5 md:col-span-1 md:flex-row md:flex-wrap md:items-center">
                    <span className="max-w-full min-w-0 text-[0.9375rem] font-medium break-words text-texto">
                      {f.centro}
                      {mostrarInstitucion && f.institucion ? (
                        <span className="block text-xs font-normal text-texto-tenue">{f.institucion}</span>
                      ) : null}
                    </span>
                    {!f.centroActivo ? <Badge tono="neutro">Centro inactivo</Badge> : null}
                    <span className="cifras text-sm text-texto-suave md:hidden">
                      Hoy: {cantidadConUnidad(f.stockActual, unidadMedida)}
                    </span>
                  </div>
                  <div role="cell" className="hidden text-right md:block">
                    <span className={cn("cifras text-sm", bajo ? "font-semibold text-alerta-800" : "text-texto-suave")}>
                      {formatearNumero(f.stockActual)}
                    </span>
                    {bajo ? <span className="block text-xs text-alerta-800">bajo el mínimo</span> : null}
                  </div>
                  <div role="cell">
                    <label htmlFor={idMinimo} className="mb-1 block text-xs font-medium text-texto-suave md:sr-only">
                      Mínimo <span className="sr-only">en {f.centro}</span>
                    </label>
                    <input
                      id={idMinimo}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="—"
                      value={v.minimo}
                      onChange={(ev) => cambiar(i, f.centroId, "minimo", ev.target.value)}
                      aria-invalid={errorMinimo ? true : undefined}
                      aria-describedby={error ? idError : undefined}
                      className={cn(controlClasses(Boolean(errorMinimo)), "cifras text-right")}
                    />
                  </div>
                  <div role="cell">
                    <label htmlFor={idMaximo} className="mb-1 block text-xs font-medium text-texto-suave md:sr-only">
                      Máximo <span className="sr-only">en {f.centro}</span>
                    </label>
                    <input
                      id={idMaximo}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="—"
                      value={v.maximo}
                      onChange={(ev) => cambiar(i, f.centroId, "maximo", ev.target.value)}
                      aria-invalid={errorMaximo ? true : undefined}
                      aria-describedby={error ? idError : undefined}
                      className={cn(controlClasses(Boolean(errorMaximo)), "cifras text-right")}
                    />
                  </div>
                </div>
                {error ? (
                  <p id={idError} className="mt-2 flex items-start gap-1.5 text-sm font-medium text-peligro-700 md:justify-end">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {error}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <AvisoCambiosSinGuardar visible={modificados > 0} detalle={`mínimos y máximos de ${pluralizar(modificados, "centro")}`} />
          <p className="text-sm text-texto-suave">
            Cantidades en {pluralUnidad(unidadMedida)}. Deja ambos campos vacíos si el centro no usa este insumo.
          </p>
        </div>
        <Button type="submit" cargando={guardar.pendiente} disabled={modificados === 0} className="shrink-0">
          {guardar.pendiente ? null : <Save aria-hidden />}
          Guardar mínimos y máximos
        </Button>
      </div>
    </form>
  );
}
