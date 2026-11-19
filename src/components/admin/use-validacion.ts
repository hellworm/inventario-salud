"use client";

import * as React from "react";
import type { z } from "zod";
import type { ErroresCampo } from "@/lib/resultado";

export interface Validacion<E extends z.ZodType> {
  /** Errores a mostrar por campo (locales + los que devolvió el servidor). */
  errores: ErroresCampo;
  /**
   * Valida en el navegador con el mismo esquema del servidor. Devuelve los
   * datos de entrada si son válidos o `null` si hay errores (ya visibles).
   */
  validar: (valores: z.input<E>) => z.input<E> | null;
  /** Oculta el error de un campo cuando la persona empieza a corregirlo. */
  limpiarCampo: (campo: string) => void;
  /** Limpia todo (p. ej. al reabrir un diálogo). */
  reiniciar: () => void;
  /** `onChange` listo para poner en el `<form>`: limpia el error del campo editado. */
  alCambiar: (evento: React.FormEvent<HTMLFormElement>) => void;
}

/**
 * Los mensajes de validación terminan siempre en punto ("Selecciona un rol.")
 * y usan el vocabulario de la interfaz ("correo electrónico", no "email").
 */
export function conPuntoFinal(mensaje: string): string {
  const limpio = mensaje.trim().replace(/\be-?mail\b/gi, "correo electrónico");
  return /[.!?…:]$/.test(limpio) || limpio === "" ? limpio : `${limpio}.`;
}

/**
 * Validación en línea para formularios de administración: valida con el
 * esquema zod isomórfico antes de enviar, combina los errores del servidor
 * (unicidad, reglas de negocio) y borra el error de un campo al editarlo.
 */
export function useValidacion<E extends z.ZodType>(esquema: E, erroresServidor: ErroresCampo): Validacion<E> {
  const [locales, setLocales] = React.useState<ErroresCampo>({});
  const [editados, setEditados] = React.useState<ReadonlySet<string>>(new Set());

  const validar = React.useCallback(
    (valores: z.input<E>) => {
      setEditados(new Set());
      const resultado = esquema.safeParse(valores);
      if (resultado.success) {
        setLocales({});
        return valores;
      }
      const errores: ErroresCampo = {};
      for (const issue of resultado.error.issues) {
        const clave = issue.path.length > 0 ? issue.path.join(".") : "_";
        (errores[clave] ??= []).push(issue.message);
      }
      setLocales(errores);
      // Lleva el foco al primer campo con error.
      requestAnimationFrame(() => {
        const primero = document.querySelector<HTMLElement>("form [aria-invalid='true']");
        primero?.focus();
      });
      return null;
    },
    [esquema],
  );

  const limpiarCampo = React.useCallback((campo: string) => {
    setEditados((previos) => (previos.has(campo) ? previos : new Set(previos).add(campo)));
  }, []);

  const reiniciar = React.useCallback(() => {
    setLocales({});
    setEditados(new Set());
  }, []);

  const alCambiar = React.useCallback(
    (evento: React.FormEvent<HTMLFormElement>) => {
      const nombre = (evento.target as { name?: string }).name;
      if (nombre) limpiarCampo(nombre);
    },
    [limpiarCampo],
  );

  const errores = React.useMemo(() => {
    const combinados: ErroresCampo = {};
    for (const [campo, mensajes] of Object.entries({ ...erroresServidor, ...locales })) {
      if (!editados.has(campo)) combinados[campo] = mensajes.map(conPuntoFinal);
    }
    return combinados;
  }, [erroresServidor, locales, editados]);

  return { errores, validar, limpiarCampo, reiniciar, alCambiar };
}

/** Texto de un campo de `FormData` (cadena vacía si no existe). */
export function texto(datos: FormData, campo: string): string {
  const valor = datos.get(campo);
  return typeof valor === "string" ? valor : "";
}
