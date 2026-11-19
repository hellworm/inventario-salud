import Link from "next/link";
import { SearchX } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NoEncontrado() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl items-center px-4">
      <EmptyState
        className="w-full"
        icono={SearchX}
        titulo="No encontramos esta página"
        descripcion="Puede que el enlace esté incompleto o que el registro ya no exista."
        accion={
          <Link href="/panel" className={buttonClasses()}>
            Ir al panel
          </Link>
        }
      />
    </main>
  );
}
