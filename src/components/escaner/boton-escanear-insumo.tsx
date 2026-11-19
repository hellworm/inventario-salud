"use client";

import * as React from "react";
import { ScanBarcode } from "lucide-react";
import { buscarPorCodigoAccion } from "@/acciones/consultas";
import type { InsumoOpcion } from "@/components/movimientos/combobox-insumo";
import { avisarSesionVencida, buttonClasses, esSesionVencida, toast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { BotonEscanear } from "./boton-escanear";

/**
 * Botón "Escanear" para poner junto a un buscador de insumos: lee el código
 * con la cámara, lo busca en el servidor y entrega el insumo. Si el código no
 * coincide con un insumo activo, lo avisa y deja buscar a mano.
 */
export function BotonEscanearInsumo({
  alEncontrar,
  disabled,
  className,
}: {
  alEncontrar: (insumo: InsumoOpcion) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [buscando, setBuscando] = React.useState(false);

  const alLeer = async (texto: string) => {
    setBuscando(true);
    let r: Awaited<ReturnType<typeof buscarPorCodigoAccion>>;
    try {
      r = await buscarPorCodigoAccion({ codigo: texto });
    } catch {
      r = { ok: false, error: "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo." };
    }
    setBuscando(false);
    if (esSesionVencida(r)) return avisarSesionVencida();
    if (!r.ok) return void toast.error(r.error);
    const activos = r.datos.coincidencias.filter((c) => c.activo);
    if (r.datos.codigo && activos.length === 1 && r.datos.coincidencias.length === 1) return alEncontrar(activos[0]!);
    toast.error(
      r.datos.codigo
        ? `No reconocemos el código ${r.datos.codigo.codigo}. Busca el insumo por su nombre.`
        : "Ese código no se puede leer. Inténtalo de nuevo.",
    );
  };

  return (
    <BotonEscanear
      alLeer={(texto) => void alLeer(texto)}
      disabled={disabled || buscando}
      aria-label="Escanear el código del envase"
      titulo="Escanear el insumo"
      className={cn(buttonClasses({ variant: "secundario" }), "shrink-0 max-sm:px-3", className)}
    >
      <ScanBarcode aria-hidden />
      <span className="max-sm:sr-only">Escanear</span>
    </BotonEscanear>
  );
}
