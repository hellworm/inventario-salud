import type { Metadata } from "next";
import Link from "next/link";
import { Landmark } from "lucide-react";
import { FormularioCentro } from "@/components/admin/formulario-centro";
import { buttonClasses, Card, EmptyState, PageHeader } from "@/components/ui";
import { textoParam } from "@/lib/parametros";
import { veTodaLaRed } from "@/lib/permisos";
import { contextoPagina } from "@/server/auth/sesion";
import { listarOpcionesInstitucion } from "@/server/servicios";

export const metadata: Metadata = { title: "Nuevo centro" };

export default async function PaginaNuevoCentro({ searchParams }: PageProps<"/admin/centros/nuevo">) {
  const { actor, sesion } = await contextoPagina("centros:gestionar");
  const esRed = veTodaLaRed(actor);
  // El administrador de la red elige la institución; el de institución crea en la suya.
  const instituciones = esRed ? (await listarOpcionesInstitucion(actor)).filter((i) => i.activo) : undefined;
  const institucionInicial = textoParam((await searchParams).institucion) ?? undefined;
  const propia = sesion.usuario.institucion?.nombre;

  return (
    <>
      <PageHeader
        titulo="Nuevo centro"
        descripcion={
          <>
            {propia ? <>Se agrega a {propia}. </> : null}
            Se crea con una «Bodega principal» para que puedas registrar stock de inmediato. Después puedes agregar más ubicaciones.
          </>
        }
        volver={{ href: "/admin/centros", label: "Centros y ubicaciones" }}
      />
      {instituciones && instituciones.length === 0 ? (
        <EmptyState
          icono={Landmark}
          titulo="Primero crea una institución"
          descripcion="Cada centro pertenece a una institución. Crea la institución y después agrégale sus centros."
          accion={
            <Link href="/admin/instituciones" className={buttonClasses()}>
              Ir a Instituciones
            </Link>
          }
        />
      ) : (
        <Card className="max-w-3xl sm:p-6">
          <FormularioCentro instituciones={instituciones} institucionInicial={institucionInicial} />
        </Card>
      )}
    </>
  );
}
