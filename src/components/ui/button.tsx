import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primario" | "secundario" | "fantasma" | "peligro" | "enlace";
export type ButtonSize = "sm" | "md" | "lg" | "icono";

const BASE =
  // `ri-boton`: marca estable para ocultar los botones al imprimir (globals.css).
  "ri-boton inline-flex items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap select-none " +
  "transition-colors duration-150 disabled:pointer-events-none disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55 " +
  "[&_svg]:size-[1.15em] [&_svg]:shrink-0";

const VARIANTES: Record<ButtonVariant, string> = {
  primario: "bg-marca-600 text-white shadow-sm hover:bg-marca-700 active:bg-marca-800",
  secundario:
    "bg-superficie text-texto border border-borde-fuerte/70 shadow-sm hover:bg-superficie-2 hover:border-borde-fuerte active:bg-marca-50",
  fantasma: "text-texto-suave hover:bg-marca-50 hover:text-marca-800 active:bg-marca-100",
  peligro: "bg-peligro-600 text-white shadow-sm hover:bg-peligro-700 active:bg-peligro-800",
  enlace: "text-marca-700 underline-offset-4 hover:underline !h-auto !min-h-0 !px-0",
};

// Todos los tamaños respetan un objetivo táctil mínimo de 44 px. `sm` solo baja
// a 40 px cuando el puntero principal es preciso (mouse), no en tablet o celular.
const TAMANOS: Record<ButtonSize, string> = {
  sm: "min-h-11 px-3.5 text-sm pointer-fine:min-h-10",
  md: "min-h-11 px-4 text-[0.9375rem]",
  lg: "min-h-12 px-5 text-base",
  icono: "size-11 shrink-0",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Muestra un spinner y deshabilita el botón. */
  cargando?: boolean;
  /** Renderiza el hijo (p. ej. `<Link>`) con el estilo del botón. */
  asChild?: boolean;
  /** Ocupa todo el ancho disponible. */
  bloque?: boolean;
}

/** Clases del botón, por si se necesita aplicar el estilo a otro elemento. */
export function buttonClasses(opciones: { variant?: ButtonVariant; size?: ButtonSize; bloque?: boolean } = {}): string {
  return cn(BASE, VARIANTES[opciones.variant ?? "primario"], TAMANOS[opciones.size ?? "md"], opciones.bloque && "w-full");
}

export function Button({
  variant = "primario",
  size = "md",
  cargando = false,
  asChild = false,
  bloque = false,
  className,
  children,
  disabled,
  type,
  ...props
}: ButtonProps) {
  const clases = cn(buttonClasses({ variant, size, bloque }), className);
  if (asChild) {
    return (
      <Slot className={clases} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <button
      type={type ?? "button"}
      className={clases}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      {...props}
    >
      {cargando ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
