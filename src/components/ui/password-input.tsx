"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input, type InputProps } from "./input";

/** Campo de contraseña con botón para mostrar u ocultar el texto. */
export function PasswordInput(props: Omit<InputProps, "type" | "fin">) {
  const [visible, setVisible] = React.useState(false);
  return (
    <Input
      {...props}
      type={visible ? "text" : "password"}
      fin={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="-mr-1.5 flex size-11 items-center justify-center rounded-full text-texto-suave hover:bg-superficie-2 hover:text-texto"
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
        >
          {visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </button>
      }
    />
  );
}
