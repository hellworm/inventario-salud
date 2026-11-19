"use client";

import { useEffect } from "react";
import { RotateCcw, ServerCrash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function ErrorApp({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      icono={ServerCrash}
      titulo="Algo salió mal"
      descripcion={
        <>
          No pudimos cargar esta sección. Intenta nuevamente; si el problema continúa, avisa a un administrador
          {error.digest ? <> indicando el código <span className="font-mono">{error.digest}</span></> : null}.
        </>
      }
      accion={
        <Button onClick={reset}>
          <RotateCcw aria-hidden />
          Reintentar
        </Button>
      }
    />
  );
}
