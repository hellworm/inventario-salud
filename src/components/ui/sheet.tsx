"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useDevolverFoco } from "./foco";

/** Panel lateral deslizante (drawer). Misma API que Dialog (incluida la devolución del foco). */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export interface SheetContentProps extends Omit<React.ComponentProps<typeof DialogPrimitive.Content>, "title"> {
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  lado?: "izquierda" | "derecha";
  /**
   * Oculta visualmente el encabezado (el título sigue disponible para lectores
   * de pantalla). El botón "Cerrar" no se dibuja: agrega un `<SheetClose>` visible.
   */
  sinEncabezado?: boolean;
}

export function SheetContent({
  titulo,
  descripcion,
  lado = "derecha",
  sinEncabezado = false,
  className,
  children,
  onCloseAutoFocus,
  ...props
}: SheetContentProps) {
  const { captura, alCerrar } = useDevolverFoco(onCloseAutoFocus);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-velo backdrop-blur-[2px] data-[state=open]:animate-aparecer" />
      <DialogPrimitive.Content
        {...(descripcion ? {} : { "aria-describedby": undefined })}
        className={cn(
          "fixed inset-y-0 z-50 flex w-[min(22rem,88vw)] flex-col bg-superficie-alta shadow-flotante focus:outline-none",
          lado === "derecha"
            ? "right-0 data-[state=open]:animate-entrar-derecha"
            : "left-0 data-[state=open]:animate-entrar-izquierda",
          className,
        )}
        {...props}
        onCloseAutoFocus={alCerrar}
      >
        {captura}
        <div className={cn("flex items-start justify-between gap-4 border-b border-borde px-5 py-4", sinEncabezado && "sr-only")}>
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-lg font-semibold tracking-tight text-texto">{titulo}</DialogPrimitive.Title>
            {descripcion ? (
              <DialogPrimitive.Description className="mt-0.5 text-sm text-texto-suave">{descripcion}</DialogPrimitive.Description>
            ) : null}
          </div>
          {/* Sin encabezado visible no se deja un "Cerrar" invisible pero enfocable: quien lo use agrega su propio `SheetClose`. */}
          {sinEncabezado ? null : (
            <DialogPrimitive.Close
              className="-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full text-texto-suave hover:bg-superficie-2 hover:text-texto"
              aria-label="Cerrar"
            >
              <X className="size-5" aria-hidden />
            </DialogPrimitive.Close>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
