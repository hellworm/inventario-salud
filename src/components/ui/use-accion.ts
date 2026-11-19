"use client";

import * as React from "react";
import type { ErroresCampo, ResultadoAccion } from "@/lib/resultado";
import { toast } from "./toast";

export interface OpcionesUseAccion<S> {
  /** Toast de éxito (texto fijo o función del resultado). Omitir para no mostrar. */
  exito?: string | ((datos: S) => string);
  /** Se llama tras un resultado `ok`. */
  alExito?: (datos: S) => void;
  /** Mostrar toast con el error (por defecto `true`). */
  toastError?: boolean;
}

export interface EstadoAccion<E, S> {
  /** Ejecuta la acción. Devuelve el resultado por si se necesita encadenar. */
  ejecutar: (entrada: E) => Promise<ResultadoAccion<S>>;
  pendiente: boolean;
  /** Mensaje general del último error (o `null`). */
  error: string | null;
  /** Errores por campo del último intento: `erroresCampo.cantidad?.[0]`. */
  erroresCampo: ErroresCampo;
  /** Limpia errores (p. ej. al reabrir un diálogo). */
  limpiar: () => void;
}

/**
 * Ejecuta una Server Action creada con `accionSegura` manejando estado
 * pendiente, errores por campo y toasts.
 *
 * ```tsx
 * const ingreso = useAccion(registrarIngresoAccion, {
 *   exito: "Ingreso registrado",
 *   alExito: () => router.push("/movimientos"),
 * });
 * <form onSubmit={(e) => { e.preventDefault(); ingreso.ejecutar(valores); }}>
 *   <Field label="Cantidad" error={ingreso.erroresCampo.cantidad}>…</Field>
 *   <Button type="submit" cargando={ingreso.pendiente}>Registrar</Button>
 * </form>
 * ```
 */
export function useAccion<E, S>(
  accion: (entrada: E) => Promise<ResultadoAccion<S>>,
  opciones: OpcionesUseAccion<S> = {},
): EstadoAccion<E, S> {
  const [pendiente, setPendiente] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [erroresCampo, setErroresCampo] = React.useState<ErroresCampo>({});
  const refOpciones = React.useRef(opciones);
  React.useEffect(() => {
    refOpciones.current = opciones;
  });

  const ejecutar = React.useCallback(
    async (entrada: E): Promise<ResultadoAccion<S>> => {
      setPendiente(true);
      setError(null);
      setErroresCampo({});
      let resultado: ResultadoAccion<S>;
      try {
        resultado = await accion(entrada);
      } catch {
        resultado = { ok: false, error: "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo." };
      }
      const o = refOpciones.current;
      if (resultado.ok) {
        if (o.exito) toast.exito(typeof o.exito === "function" ? o.exito(resultado.datos) : o.exito);
        o.alExito?.(resultado.datos);
      } else {
        setError(resultado.error);
        setErroresCampo(resultado.erroresCampo ?? {});
        if (o.toastError !== false) toast.error(resultado.error);
      }
      setPendiente(false);
      return resultado;
    },
    [accion],
  );

  const limpiar = React.useCallback(() => {
    setError(null);
    setErroresCampo({});
  }, []);

  return { ejecutar, pendiente, error, erroresCampo, limpiar };
}
