"use client";

import * as React from "react";

/** Se monta junto con el contenido del diálogo y anota quién tenía el foco. */
function CapturaFoco({ alAbrir }: { alAbrir: (elemento: HTMLElement | null) => void }) {
  // useLayoutEffect corre antes de que Radix mueva el foco al diálogo.
  React.useLayoutEffect(() => {
    const activo = document.activeElement;
    alAbrir(activo instanceof HTMLElement && activo !== document.body ? activo : null);
  }, [alAbrir]);
  return null;
}

/**
 * Devolución del foco para diálogos CONTROLADOS (sin `Trigger` de Radix).
 *
 * Radix solo devuelve el foco a su `Trigger`; si el diálogo se abre con
 * `open` desde otro botón, al cerrarse el foco se pierde en `<body>`. Este
 * hook recuerda qué elemento tenía el foco al abrir y lo restaura al cerrar.
 *
 * - `captura` va DENTRO del contenido del diálogo (se monta al abrir).
 * - `alCerrar` se pasa a `onCloseAutoFocus`. Respeta a quien ya manejó el
 *   evento (`preventDefault`) y, si el elemento original ya no existe, deja
 *   actuar a Radix (foco al `Trigger`, si lo hay).
 *
 * `DialogContent`, `SheetContent` y `ConfirmDialog` ya lo usan: quien abre un
 * diálogo sin trigger no necesita hacer nada más.
 */
export function useDevolverFoco(onCloseAutoFocus?: (evento: Event) => void) {
  const previo = React.useRef<HTMLElement | null>(null);
  const anotar = React.useCallback((elemento: HTMLElement | null) => {
    previo.current = elemento;
  }, []);

  const alCerrar = React.useCallback(
    (evento: Event) => {
      onCloseAutoFocus?.(evento);
      if (evento.defaultPrevented) return;
      const destino = previo.current;
      previo.current = null;
      if (destino && destino.isConnected && !destino.hasAttribute("disabled")) {
        evento.preventDefault();
        destino.focus();
      }
    },
    [onCloseAutoFocus],
  );

  return { captura: <CapturaFoco alAbrir={anotar} />, alCerrar };
}
