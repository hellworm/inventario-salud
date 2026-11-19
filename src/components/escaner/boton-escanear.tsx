"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ScanBarcode } from "lucide-react";
import { toast } from "@/components/ui";
import { hrefEscaneo } from "@/lib/escaneo";

// El escáner (y con él el lector de códigos) se descarga solo al abrirlo.
const DialogoEscaner = dynamic(() => import("./dialogo-escaner"), { ssr: false });

export interface BotonEscanearProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type"> {
  /**
   * Qué hacer con el código leído (texto crudo). Si se omite, se navega a
   * `/movimientos/escanear`, que busca el insumo y abre el ingreso prellenado.
   */
  alLeer?: (texto: string) => void;
  /** Ubicación de destino que se conserva al navegar al ingreso. */
  ubicacion?: string | null;
  /** Título del diálogo. */
  titulo?: string;
  /** Texto de ayuda del diálogo. */
  descripcion?: string;
}

/**
 * Botón que abre el escáner de la cámara. No impone estilo: se viste con
 * `className` y `children` (botón grande del panel, ítem de la barra inferior,
 * botón junto al buscador de insumos). Sin `children` muestra ícono + "Escanear".
 */
export function BotonEscanear({ alLeer, ubicacion, titulo, descripcion, children, ...props }: BotonEscanearProps) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  // El diálogo queda montado tras el primer uso para conservar su animación de cierre.
  const [montado, setMontado] = React.useState(false);
  const refBoton = React.useRef<HTMLButtonElement>(null);

  const alCodigo = (texto: string) => {
    setAbierto(false);
    if (alLeer) return alLeer(texto);
    const href = hrefEscaneo(texto, { ubicacion });
    if (!href) return toast.error("Ese código no se puede leer. Inténtalo de nuevo.");
    router.push(href);
  };

  return (
    <>
      <button
        ref={refBoton}
        type="button"
        aria-haspopup="dialog"
        {...props}
        onClick={() => {
          setMontado(true);
          setAbierto(true);
        }}
      >
        {children ?? (
          <>
            <ScanBarcode aria-hidden />
            Escanear
          </>
        )}
      </button>
      {montado ? (
        <DialogoEscaner
          abierto={abierto}
          onCerrar={() => setAbierto(false)}
          onCodigo={alCodigo}
          titulo={titulo}
          descripcion={descripcion}
          // Al cerrar, el foco vuelve siempre al botón que abrió el escáner.
          onCloseAutoFocus={(evento) => {
            evento.preventDefault();
            refBoton.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}
