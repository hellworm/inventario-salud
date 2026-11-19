"use client";

import * as React from "react";
import { PencilLine } from "lucide-react";
import { Badge } from "@/components/ui";

const PREGUNTA = "Hay cambios sin guardar en esta página. Si sales ahora se perderán. ¿Salir de todos modos?";

/** Secciones con cambios pendientes en la página (varios formularios pueden estar sucios a la vez). */
const pendientes = new Set<symbol>();

function alDescargar(evento: BeforeUnloadEvent) {
  if (pendientes.size === 0) return;
  evento.preventDefault();
}

/** Enlaces internos (menú, "volver", migas): se confirma antes de navegar. */
function alHacerClic(evento: MouseEvent) {
  if (pendientes.size === 0 || evento.defaultPrevented || evento.button !== 0) return;
  if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
  const enlace = evento.target instanceof Element ? evento.target.closest("a[href]") : null;
  if (!(enlace instanceof HTMLAnchorElement) || enlace.target === "_blank" || enlace.hasAttribute("download")) return;
  const destino = new URL(enlace.href, window.location.href);
  if (destino.origin !== window.location.origin) return;
  if (destino.pathname === window.location.pathname && destino.search === window.location.search) return;
  if (!window.confirm(PREGUNTA)) {
    evento.preventDefault();
    evento.stopPropagation();
  }
}

/**
 * Evita perder cambios en silencio: mientras `sucio` sea verdadero, pide
 * confirmación al cerrar o recargar la pestaña y al seguir un enlace interno.
 * Pensado para páginas con más de un formulario y más de un botón de guardar.
 */
export function useCambiosSinGuardar(sucio: boolean) {
  const [clave] = React.useState(() => Symbol("seccion"));
  React.useEffect(() => {
    if (!sucio) return;
    if (pendientes.size === 0) {
      window.addEventListener("beforeunload", alDescargar);
      document.addEventListener("click", alHacerClic, true);
    }
    pendientes.add(clave);
    return () => {
      pendientes.delete(clave);
      if (pendientes.size === 0) {
        window.removeEventListener("beforeunload", alDescargar);
        document.removeEventListener("click", alHacerClic, true);
      }
    };
  }, [sucio, clave]);
}

/** Indicador visible de la sección: "Cambios sin guardar" (se anuncia a lectores de pantalla). */
export function AvisoCambiosSinGuardar({ visible, detalle }: { visible: boolean; detalle?: string }) {
  return (
    <span aria-live="polite" className="inline-flex min-h-6 items-center">
      {visible ? (
        <Badge tono="alerta" icono={PencilLine}>
          Cambios sin guardar{detalle ? ` · ${detalle}` : ""}
        </Badge>
      ) : null}
    </span>
  );
}
