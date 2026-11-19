import Link from "next/link";
import { SearchX } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** Contenido de la página 404 (con `<h1>` y título de pestaña propios). */
export function NoEncontrado({ haySesion = true }: { haySesion?: boolean }) {
  return (
    <>
      <title>Página no encontrada · RedInsumos</title>
      <EmptyState
        className="w-full"
        nivelTitulo={1}
        icono={SearchX}
        titulo="No encontramos esta página"
        descripcion="Puede que el enlace esté incompleto o que el registro ya no exista."
        accion={
          <Link href={haySesion ? "/panel" : "/login"} className={buttonClasses()}>
            {haySesion ? "Ir al panel" : "Ir al inicio"}
          </Link>
        }
      />
    </>
  );
}
