"use client";

import * as React from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

export interface ConfirmDialogProps {
  /** Elemento que abre el diálogo (modo no controlado). */
  disparador?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (abierto: boolean) => void;
  titulo: string;
  descripcion?: React.ReactNode;
  textoConfirmar?: string;
  textoCancelar?: string;
  /** Estilo destructivo (rojo) para acciones irreversibles. */
  peligro?: boolean;
  /** Se ejecuta al confirmar; el diálogo queda "cargando" hasta que la promesa termina. */
  onConfirmar: () => void | Promise<void>;
}

/**
 * Confirmación modal para acciones delicadas (desactivar, mermar, etc.).
 * Usa AlertDialog de Radix: el foco inicial queda en "Cancelar".
 */
export function ConfirmDialog({
  disparador,
  open,
  onOpenChange,
  titulo,
  descripcion,
  textoConfirmar = "Confirmar",
  textoCancelar = "Cancelar",
  peligro = false,
  onConfirmar,
}: ConfirmDialogProps) {
  const [interno, setInterno] = React.useState(false);
  const [cargando, setCargando] = React.useState(false);
  const abierto = open ?? interno;
  const cambiar = (valor: boolean) => {
    if (cargando) return;
    setInterno(valor);
    onOpenChange?.(valor);
  };

  async function confirmar(evento: React.MouseEvent) {
    evento.preventDefault();
    setCargando(true);
    try {
      await onConfirmar();
      setInterno(false);
      onOpenChange?.(false);
    } finally {
      setCargando(false);
    }
  }

  return (
    <AlertDialog.Root open={abierto} onOpenChange={cambiar}>
      {disparador ? <AlertDialog.Trigger asChild>{disparador}</AlertDialog.Trigger> : null}
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-marca-950/45 backdrop-blur-[2px] data-[state=open]:animate-aparecer" />
        <AlertDialog.Content
          {...(descripcion ? {} : { "aria-describedby": undefined })}
          className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-superficie p-5 shadow-flotante focus:outline-none data-[state=open]:animate-subir sm:p-6"
        >
          <div className="flex gap-4">
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full",
                peligro ? "bg-peligro-50 text-peligro-700" : "bg-marca-50 text-marca-700",
              )}
            >
              <TriangleAlert className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <AlertDialog.Title className="text-lg font-semibold tracking-tight text-texto">{titulo}</AlertDialog.Title>
              {descripcion ? (
                <AlertDialog.Description className="mt-1 text-sm text-texto-suave">{descripcion}</AlertDialog.Description>
              ) : null}
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variant="secundario" disabled={cargando}>
                {textoCancelar}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant={peligro ? "peligro" : "primario"} cargando={cargando} onClick={confirmar}>
                {textoConfirmar}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
