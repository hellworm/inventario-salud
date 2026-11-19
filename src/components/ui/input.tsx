"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { controlClasses, useCampo } from "./field";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Ícono o texto decorativo a la izquierda. */
  inicio?: React.ReactNode;
  /** Ícono, unidad o botón a la derecha. */
  fin?: React.ReactNode;
  /** Referencia al `<input>` (p. ej. para devolverle el foco). */
  ref?: React.Ref<HTMLInputElement>;
}

/** Campo de texto. Dentro de `<Field>` toma id y aria automáticamente. */
export function Input({ className, inicio, fin, type = "text", ...props }: InputProps) {
  const { invalido, ...campo } = useCampo(props);
  const input = (
    <input
      type={type}
      {...props}
      {...campo}
      className={cn(controlClasses(invalido), inicio && "pl-10", fin && "pr-11", !inicio && !fin && className)}
    />
  );
  if (!inicio && !fin) return input;
  return (
    <div className={cn("relative", className)}>
      {inicio ? (
        <span className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-texto-tenue [&_svg]:size-[1.125rem]">
          {inicio}
        </span>
      ) : null}
      {input}
      {fin ? (
        <span className="absolute inset-y-0 right-0 flex items-center pr-1.5 text-sm text-texto-suave [&_svg]:size-[1.125rem]">
          {fin}
        </span>
      ) : null}
    </div>
  );
}
