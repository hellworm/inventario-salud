import { MapPinOff } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui";

/** Texto único del estado "sin centro activo" (lo citan las pruebas y la ayuda). */
export const MENSAJE_SIN_CENTRO = "No tienes un centro activo asignado. Pide a tu administrador que te asigne uno.";

/**
 * Página de quien NO ve toda la red y no tiene ningún centro activo asignado
 * (p. ej. su único centro fue desactivado). No es lo mismo que "Toda la red":
 * no hay nada que mostrar ni dónde registrar.
 */
export function SinCentroActivo({ titulo }: { titulo: string }) {
  return (
    <>
      <PageHeader titulo={titulo} />
      <EmptyState icono={MapPinOff} titulo="Sin centro activo" descripcion={MENSAJE_SIN_CENTRO} />
    </>
  );
}
