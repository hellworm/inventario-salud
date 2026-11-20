"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useDevolverFoco } from "./foco";

/**
 * Diálogo modal accesible (Radix): atrapa el foco, cierra con Esc y devuelve
 * el foco al disparador. Si se usa controlado y sin `DialogTrigger`, al cerrar
 * el foco vuelve al elemento que lo tenía al abrir (ver `useDevolverFoco`);
 * para otro destino, pasa `onCloseAutoFocus` y llama `preventDefault()`.
 * En móvil se presenta como hoja inferior.
 *
 * ```tsx
 * <Dialog open={abierto} onOpenChange={setAbierto}>
 *   <DialogTrigger asChild><Button>Nuevo</Button></DialogTrigger>
 *   <DialogContent titulo="Nuevo proveedor" descripcion="Completa los datos.">
 *     …formulario…
 *     <DialogFooter>…botones…</DialogFooter>
 *   </DialogContent>
 * </Dialog>
 * ```
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const ANCHOS = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" } as const;

export interface DialogContentProps extends Omit<React.ComponentProps<typeof DialogPrimitive.Content>, "title"> {
  /** Título visible (obligatorio por accesibilidad). */
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  ancho?: keyof typeof ANCHOS;
}

export function DialogContent({
  titulo,
  descripcion,
  ancho = "md",
  className,
  children,
  onCloseAutoFocus,
  ...props
}: DialogContentProps) {
  const { captura, alCerrar } = useDevolverFoco(onCloseAutoFocus);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-velo backdrop-blur-[2px] data-[state=open]:animate-aparecer" />
      <DialogPrimitive.Content
        {...(descripcion ? {} : { "aria-describedby": undefined })}
        className={cn(
          "fixed z-50 flex max-h-[92dvh] w-full flex-col bg-superficie-alta shadow-flotante focus:outline-none",
          "inset-x-0 bottom-0 rounded-t-2xl data-[state=open]:animate-entrar-abajo",
          "sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:data-[state=open]:animate-subir",
          ANCHOS[ancho],
          className,
        )}
        {...props}
        onCloseAutoFocus={alCerrar}
      >
        {captura}
        <div className="flex items-start justify-between gap-4 border-b border-borde px-5 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-lg font-semibold tracking-tight text-texto">{titulo}</DialogPrimitive.Title>
            {descripcion ? (
              <DialogPrimitive.Description className="mt-0.5 text-sm text-texto-suave">{descripcion}</DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close
            className="-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full text-texto-suave hover:bg-superficie-2 hover:text-texto"
            aria-label="Cerrar"
          >
            <X className="size-5" aria-hidden />
          </DialogPrimitive.Close>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Pie con botones: apilados en móvil (acción principal arriba), en fila en escritorio. */
export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}
