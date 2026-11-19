import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Sin permiso" };

export default function SinPermiso() {
  return (
    <EmptyState
      nivelTitulo={1}
      icono={ShieldAlert}
      titulo="No tienes permiso para ver esta sección"
      descripcion="Tu rol o tus centros asignados no incluyen este contenido. Si crees que es un error, pide acceso a un administrador de la red."
      accion={
        <Link href="/panel" className={buttonClasses()}>
          Volver al panel
        </Link>
      }
    />
  );
}
