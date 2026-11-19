import { Alert } from "@/components/ui";

/**
 * Aviso para el administrador de institución: el catálogo (insumos y
 * categorías) es común a toda la red, así que puede crear pero no modificar lo
 * que ya existe. El servidor lo impide de todos modos (`catalogo:gestionar`).
 */
export function AvisoCatalogoCompartido({ que, className }: { que: "insumo" | "insumos" | "categorias"; className?: string }) {
  return (
    <Alert tono="info" className={className} data-aviso-catalogo-compartido>
      {que === "insumo"
        ? "Este insumo es compartido por toda la red; para modificarlo contacta al administrador de la red."
        : que === "insumos"
          ? "Los insumos son compartidos por toda la red: puedes crear insumos nuevos y definir los mínimos y máximos de tus centros. Para modificar o desactivar un insumo existente contacta al administrador de la red."
          : "Las categorías son compartidas por toda la red: puedes crear categorías nuevas. Para renombrar o eliminar una existente contacta al administrador de la red."}
    </Alert>
  );
}
