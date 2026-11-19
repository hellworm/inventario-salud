"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@/components/ui";

/**
 * El centro activo vive en una cookie compartida por todas las pestañas: si se
 * cambia en otra, esta página queda mostrando un centro que ya no es el activo.
 *
 *  - Al volver a la pestaña (o a la ventana) se refrescan los datos del
 *    servidor, sin perder lo escrito en el formulario.
 *  - Si el centro con el que se cargó la página ya no es el activo, se avisa
 *    con claridad hasta que la persona lo confirme.
 */
export function AvisoCambioCentro({ centroId, nombre }: { centroId: string | null; nombre: string | null }) {
  const router = useRouter();
  const [reconocido, setReconocido] = React.useState(centroId);

  React.useEffect(() => {
    let ultimo = Date.now();
    const refrescar = () => {
      if (document.visibilityState !== "visible") return;
      // Foco y visibilidad suelen dispararse juntos: un solo refresco.
      if (Date.now() - ultimo < 2000) return;
      ultimo = Date.now();
      router.refresh();
    };
    document.addEventListener("visibilitychange", refrescar);
    window.addEventListener("focus", refrescar);
    return () => {
      document.removeEventListener("visibilitychange", refrescar);
      window.removeEventListener("focus", refrescar);
    };
  }, [router]);

  if (reconocido === centroId) return null;
  return (
    <Alert tono="alerta" titulo="Cambió el centro activo" className="mb-4" data-aviso-centro>
      <p>
        El centro activo se cambió desde otra pestaña o ventana. Ahora estás en{" "}
        <strong className="font-semibold">{nombre ?? "todos tus centros"}</strong>: actualizamos las ubicaciones de este formulario.
        Revisa la ubicación antes de registrar.
      </p>
      <Button size="sm" variant="secundario" className="mt-2" onClick={() => setReconocido(centroId)}>
        Entendido
      </Button>
    </Alert>
  );
}
