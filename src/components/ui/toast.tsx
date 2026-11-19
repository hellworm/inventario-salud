"use client";

import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { CircleAlert, CircleCheck, Info, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type ToastTono = "exito" | "error" | "info";

interface ToastItem {
  id: number;
  tono: ToastTono;
  titulo: string;
  descripcion?: string;
  duracion: number;
}

// Almacén mínimo fuera de React: permite llamar `toast.*` desde cualquier parte del cliente.
let contador = 0;
let items: ToastItem[] = [];
const oyentes = new Set<() => void>();

function emitir() {
  for (const oyente of oyentes) oyente();
}

function agregar(tono: ToastTono, titulo: string, descripcion?: string, duracion?: number) {
  items = [...items, { id: ++contador, tono, titulo, descripcion, duracion: duracion ?? (tono === "error" ? 8000 : 4500) }];
  emitir();
}

function quitar(id: number) {
  items = items.filter((t) => t.id !== id);
  emitir();
}

/**
 * Notificaciones breves. Usar desde Client Components:
 * `toast.exito("Ingreso registrado")`, `toast.error("No se pudo guardar", detalle)`.
 */
export const toast = {
  exito: (titulo: string, descripcion?: string) => agregar("exito", titulo, descripcion),
  error: (titulo: string, descripcion?: string) => agregar("error", titulo, descripcion),
  info: (titulo: string, descripcion?: string) => agregar("info", titulo, descripcion),
};

const ESTILO: Record<ToastTono, { icono: LucideIcon; clases: string }> = {
  exito: { icono: CircleCheck, clases: "text-exito-600" },
  error: { icono: CircleAlert, clases: "text-peligro-600" },
  info: { icono: Info, clases: "text-info-700" },
};

const VACIO: ToastItem[] = [];

/** Contenedor de toasts. Se monta UNA vez en el layout raíz. */
export function Toaster() {
  const actuales = React.useSyncExternalStore(
    (oyente) => {
      oyentes.add(oyente);
      return () => oyentes.delete(oyente);
    },
    () => items,
    () => VACIO,
  );

  return (
    <ToastPrimitive.Provider swipeDirection="right" label="Notificaciones">
      {actuales.map((t) => {
        const { icono: Icono, clases } = ESTILO[t.tono];
        return (
          <ToastPrimitive.Root
            key={t.id}
            duration={t.duracion}
            type={t.tono === "error" ? "foreground" : "background"}
            onOpenChange={(abierto) => {
              if (!abierto) quitar(t.id);
            }}
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-borde bg-superficie p-4 shadow-flotante data-[state=open]:animate-subir data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]"
          >
            <Icono className={cn("mt-0.5 size-5 shrink-0", clases)} aria-hidden />
            <div className="min-w-0 flex-1">
              <ToastPrimitive.Title className="text-[0.9375rem] font-semibold text-texto">{t.titulo}</ToastPrimitive.Title>
              {t.descripcion ? (
                <ToastPrimitive.Description className="mt-0.5 text-sm text-texto-suave">{t.descripcion}</ToastPrimitive.Description>
              ) : null}
            </div>
            <ToastPrimitive.Close
              className="-m-3 flex size-11 shrink-0 items-center justify-center rounded-full text-texto-tenue hover:bg-superficie-2 hover:text-texto"
              aria-label="Cerrar notificación"
            >
              <X className="size-4" aria-hidden />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
      <ToastPrimitive.Viewport className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col gap-2 px-4 outline-none sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96 sm:px-0 lg:bottom-6 lg:right-6" />
    </ToastPrimitive.Provider>
  );
}
