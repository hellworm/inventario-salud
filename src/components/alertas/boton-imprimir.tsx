"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui";

/** Abre el diálogo de impresión del navegador (también sirve para "Guardar como PDF"). */
export function BotonImprimir({ children = "Imprimir" }: { children?: React.ReactNode }) {
  return (
    <Button variant="secundario" onClick={() => window.print()}>
      <Printer aria-hidden />
      {children}
    </Button>
  );
}
