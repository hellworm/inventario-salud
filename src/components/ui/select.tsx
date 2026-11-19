"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { controlClasses, useCampo } from "./field";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Opciones; alternativamente se pueden pasar `<option>` como hijos. */
  opciones?: readonly SelectOption[];
  /** Texto de la opción vacía inicial (p. ej. "Selecciona…"). */
  placeholder?: string;
}

/** Select nativo (mejor experiencia en celular y tablet) con estilo propio. */
export function Select({ className, opciones, placeholder, children, ...props }: SelectProps) {
  const { invalido, ...campo } = useCampo(props);
  return (
    <div className={cn("relative", className)}>
      <select {...props} {...campo} className={cn(controlClasses(invalido), "appearance-none pr-10")}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {opciones?.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-[1.125rem] -translate-y-1/2 text-texto-tenue"
        aria-hidden
      />
    </div>
  );
}
