import type { Metadata } from "next";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { DirectorioProveedores } from "@/components/panel/directorio-proveedores";
import { buttonClasses, Card, EmptyState, PageHeader, SearchInput } from "@/components/ui";
import { pluralizar } from "@/lib/formato";
import { textoParam } from "@/lib/parametros";
import { puede } from "@/lib/permisos";
import { contextoPagina } from "@/server/auth/sesion";
import { listarDirectorioProveedores } from "@/server/servicios";

export const metadata: Metadata = { title: "Proveedores" };

/** Directorio completo de proveedores activos (solo lectura; los cuatro roles). */
export default async function PaginaProveedores({ searchParams }: PageProps<"/proveedores">) {
  const { actor, centroId } = await contextoPagina("proveedores:ver");
  const texto = textoParam((await searchParams).q) ?? undefined;
  const directorio = await listarDirectorioProveedores(actor, { centroId, texto, orden: "nombre", limite: 500 });
  const puedeEditar = puede(actor.rol, "proveedores:gestionar");
  return (
    <>
      <PageHeader
        titulo="Proveedores"
        descripcion="Dónde comprar y a quién llamar. Despliega un proveedor para ver su teléfono y su correo."
        volver={{ href: "/panel", label: "Panel" }}
        acciones={
          puedeEditar ? (
            <Link href="/admin/proveedores" className={buttonClasses({ variant: "secundario" })}>
              <Settings2 aria-hidden />
              Administrar proveedores
            </Link>
          ) : undefined
        }
      />
      <Card className="mb-4">
        <SearchInput placeholder="Nombre o persona de contacto" label="Buscar proveedor" />
      </Card>
      <p className="mb-2 px-1 text-sm text-texto-suave" role="status" aria-live="polite">
        {pluralizar(directorio.total, "proveedor activo", "proveedores activos")}
        {texto ? " con esta búsqueda" : ""}
      </p>
      <Card relleno={false} className="overflow-hidden">
        {directorio.items.length === 0 && texto ? (
          <EmptyState compacto titulo="Ningún proveedor coincide" descripcion="Prueba con otra palabra." />
        ) : (
          <DirectorioProveedores proveedores={directorio.items} puedeEditar={puedeEditar} />
        )}
      </Card>
    </>
  );
}
