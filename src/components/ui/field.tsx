"use client";

import * as React from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

interface ContextoCampo {
  id: string;
  idError: string | undefined;
  idAyuda: string | undefined;
  invalido: boolean;
  requerido: boolean;
}

const CampoContext = React.createContext<ContextoCampo | null>(null);

/** Props de accesibilidad que un control toma del `<Field>` que lo envuelve. */
export function useCampo(propio: { id?: string; "aria-describedby"?: string; "aria-invalid"?: React.AriaAttributes["aria-invalid"]; required?: boolean }) {
  const ctx = React.useContext(CampoContext);
  const describedBy = [propio["aria-describedby"], ctx?.idError, ctx?.idAyuda].filter(Boolean).join(" ");
  return {
    id: propio.id ?? ctx?.id,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": propio["aria-invalid"] ?? (ctx?.invalido ? true : undefined),
    required: propio.required ?? (ctx?.requerido ? true : undefined),
    invalido: Boolean(propio["aria-invalid"] ?? ctx?.invalido),
  };
}

export function Label({
  className,
  requerido,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { requerido?: boolean }) {
  return (
    <label className={cn("block text-sm font-medium text-texto", className)} {...props}>
      {children}
      {requerido ? (
        <span className="ml-0.5 text-peligro-600" aria-hidden>
          *
        </span>
      ) : null}
    </label>
  );
}

export interface FieldProps {
  /** Texto de la etiqueta. */
  label: React.ReactNode;
  /** Mensaje(s) de error. Acepta el arreglo de `erroresCampo` directamente. */
  error?: string | string[] | null;
  /** Texto de ayuda bajo el control. */
  ayuda?: React.ReactNode;
  requerido?: boolean;
  /** Etiqueta "Opcional" discreta junto al label. */
  opcional?: boolean;
  /** Id del control; si se omite se genera uno. */
  id?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Envuelve un control (Input, Select, Textarea…) con su etiqueta, ayuda y
 * error, y conecta `id`, `aria-describedby` y `aria-invalid` automáticamente.
 */
export function Field({ label, error, ayuda, requerido = false, opcional = false, id, className, children }: FieldProps) {
  const generado = React.useId();
  const idControl = id ?? generado;
  const mensaje = Array.isArray(error) ? error[0] : error;
  const idError = mensaje ? `${idControl}-error` : undefined;
  const idAyuda = ayuda ? `${idControl}-ayuda` : undefined;
  const valor = React.useMemo(
    () => ({ id: idControl, idError, idAyuda, invalido: Boolean(mensaje), requerido }),
    [idControl, idError, idAyuda, mensaje, requerido],
  );

  return (
    <CampoContext.Provider value={valor}>
      <div className={cn("space-y-1.5", className)}>
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor={idControl} requerido={requerido}>
            {label}
          </Label>
          {opcional ? <span className="text-xs text-texto-tenue">Opcional</span> : null}
        </div>
        {children}
        {mensaje ? (
          <p id={idError} className="flex items-start gap-1.5 text-sm font-medium text-peligro-700">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{mensaje}</span>
          </p>
        ) : null}
        {ayuda ? (
          <p id={idAyuda} className="text-sm text-texto-suave">
            {ayuda}
          </p>
        ) : null}
      </div>
    </CampoContext.Provider>
  );
}

/** Clases compartidas por Input, Select y Textarea. */
export function controlClasses(invalido: boolean, className?: string): string {
  return cn(
    "block w-full min-h-11 rounded-control border bg-superficie px-3.5 py-2 text-base text-texto shadow-sm",
    "placeholder:text-texto-tenue transition-[border-color,box-shadow] duration-150",
    "focus-visible:outline-none focus-visible:ring-4",
    "disabled:cursor-not-allowed disabled:bg-superficie-2 disabled:text-texto-tenue",
    "read-only:bg-superficie-2",
    invalido
      ? "border-peligro-600 focus-visible:border-peligro-600 focus-visible:ring-peligro-100"
      : "border-borde-fuerte/80 hover:border-borde-fuerte focus-visible:border-marca-600 focus-visible:ring-marca-100",
    className,
  );
}
