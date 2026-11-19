import Link from "next/link";
import { Logo } from "@/components/shell/logo";
import { NoEncontrado } from "@/components/shell/no-encontrado";

/** 404 fuera del shell (rutas sin layout de la aplicación). */
export default function PaginaNoEncontrada() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-8 px-4 py-10">
      <Link href="/" aria-label="RedInsumos, ir al inicio" className="rounded-lg">
        <Logo />
      </Link>
      <NoEncontrado />
    </main>
  );
}
