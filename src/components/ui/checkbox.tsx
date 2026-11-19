"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Etiqueta visible a la derecha de la casilla. */
  label: React.ReactNode;
  /** Texto secundario bajo la etiqueta. */
  descripcion?: React.ReactNode;
}

/** Casilla con etiqueta; toda la fila es clicable (objetivo táctil ≥ 44 px). */
export function Checkbox({ label, descripcion, className, id, disabled, ...props }: CheckboxProps) {
  const generado = React.useId();
  const idControl = id ?? generado;
  return (
    <label
      htmlFor={idControl}
      className={cn(
        "flex min-h-11 items-start gap-3 py-2.5",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        className,
      )}
    >
      <span className="relative mt-0.5 flex size-5 shrink-0 items-center justify-center">
        <input
          id={idControl}
          type="checkbox"
          disabled={disabled}
          aria-describedby={descripcion ? `${idControl}-desc` : undefined}
          className="peer size-5 appearance-none rounded-md border border-borde-fuerte bg-superficie shadow-sm transition-colors checked:border-marca-600 checked:bg-marca-600 focus-visible:outline-offset-2"
          {...props}
        />
        <Check className="pointer-events-none absolute size-3.5 text-white opacity-0 peer-checked:opacity-100" strokeWidth={3} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-[0.9375rem] font-medium text-texto">{label}</span>
        {descripcion ? (
          <span id={`${idControl}-desc`} className="block text-sm text-texto-suave">
            {descripcion}
          </span>
        ) : null}
      </span>
    </label>
  );
}
