"use client";

import * as React from "react";

/**
 * Devuelve el foco al control que abrió un diálogo cuando este se cierra
 * (Esc, "Cancelar", guardar…).
 *
 * Los diálogos de administración se montan al abrirse y sin `DialogTrigger`,
 * y varios se abren desde un menú cuyo ítem desaparece: Radix no tiene a quién
 * devolverle el foco y este se pierde en `<body>`. Uso:
 *
 * ```tsx
 * const contenedor = React.useRef<HTMLSpanElement>(null);
 * const foco = useFocoAlCerrar(contenedor);
 * <span ref={contenedor}>
 *   <Button onClick={() => { foco.recordar(); setAbierto(true); }}>Nuevo</Button>
 * </span>
 * {abierto ? <Dialogo onCerrar={() => { setAbierto(false); foco.devolver(); }} /> : null}
 * ```
 *
 * `devolver` enfoca el elemento recordado si sigue en la página; si no (ítem
 * de menú), el primer botón o enlace dentro de `contenedor`.
 */
export function useFocoAlCerrar(contenedor?: React.RefObject<HTMLElement | null>) {
  const previo = React.useRef<HTMLElement | null>(null);

  const recordar = () => {
    previo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };

  const devolver = () => {
    // Después de que Radix termine su propio manejo de foco al desmontar.
    window.setTimeout(() => {
      // Si se abrió otro diálogo a continuación, el foco le pertenece.
      if (document.querySelector("[role='dialog'], [role='alertdialog']")) return;
      const recordado = previo.current;
      const destino =
        recordado && recordado.isConnected && recordado !== document.body
          ? recordado
          : contenedor?.current?.querySelector<HTMLElement>("button:not([disabled]), a[href]");
      destino?.focus();
    }, 60);
  };

  return { recordar, devolver };
}
