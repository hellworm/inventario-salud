import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScrollText, Users } from "lucide-react";
import { BotonCambiarActivo } from "@/components/admin/boton-cambiar-activo";
import { FormularioCentro } from "@/components/admin/formulario-centro";
import { GestorUbicaciones } from "@/components/admin/ubicaciones";
import { Alert, Badge, BadgeActivo, buttonClasses, Card, CardHeader, PageHeader } from "@/components/ui";
import { ETIQUETA_TIPO_CENTRO } from "@/lib/estados";
import { pluralizar } from "@/lib/formato";
import { veTodaLaRed, type Actor } from "@/lib/permisos";
import { contextoPagina, obtenerSesion } from "@/server/auth/sesion";
import { esErrorDominio } from "@/server/errores";
import { obtenerCentroAdmin, type CentroAdmin } from "@/server/servicios";

/** Una sola lectura por solicitud: la comparten el título de la pestaña y la página. */
const cargarCentro = cache((actor: Actor, centroId: string) => obtenerCentroAdmin(actor, centroId));

/** Título de la pestaña con el nombre real del centro. */
export async function generateMetadata({ params }: PageProps<"/admin/centros/[centroId]">): Promise<Metadata> {
  const sesion = await obtenerSesion();
  if (!sesion) return { title: "Centro" };
  try {
    const { centroId } = await params;
    const centro = await cargarCentro(sesion.actor, centroId);
    return { title: `${centro.nombre} · Centros` };
  } catch {
    return { title: "Centro" };
  }
}

export default async function PaginaCentro({ params }: PageProps<"/admin/centros/[centroId]">) {
  const { actor } = await contextoPagina("centros:gestionar");
  const { centroId } = await params;

  let centro: CentroAdmin;
  try {
    centro = await cargarCentro(actor, centroId);

  } catch (error) {
    if (esErrorDominio(error) && error.codigo === "NO_ENCONTRADO") notFound();
    throw error;
  }

  const lotesConStock = centro.ubicaciones.reduce((suma, u) => suma + u.lotesConStock, 0);
  const esRed = veTodaLaRed(actor);

  return (
    <>
      <PageHeader
        titulo={centro.nombre}
        descripcion={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Badge tono="marca">{ETIQUETA_TIPO_CENTRO[centro.tipo]}</Badge>
            <BadgeActivo activo={centro.activo} />
            <span>
              {esRed ? <>{centro.institucion} · </> : null}
              {centro.comuna} · {lotesConStock > 0 ? `${pluralizar(lotesConStock, "lote")} con stock` : "sin stock"}
            </span>
          </span>
        }
        volver={{ href: "/admin/centros", label: "Centros y ubicaciones" }}
      />

      {!centro.activo ? (
        <Alert tono="alerta" titulo="Centro inactivo" className="mb-4">
          No aparece en el selector de centros ni admite movimientos. Puedes reactivarlo más abajo.
        </Alert>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-5">
        <Card className="sm:p-6 xl:col-span-3">
          <GestorUbicaciones centroId={centro.id} ubicaciones={centro.ubicaciones} />
        </Card>

        <div className="space-y-4 xl:col-span-2">
          <Card className="sm:p-6">
            <CardHeader titulo="Datos del centro" className="mb-5" />
            <FormularioCentro
              centro={{
                id: centro.id,
                nombre: centro.nombre,
                tipo: centro.tipo,
                rut: centro.rut,
                direccion: centro.direccion,
                region: centro.region,
                comuna: centro.comuna,
                telefono: centro.telefono,
              }}
            />
          </Card>

          <Card className="sm:p-6">
            <CardHeader
              titulo="Estado y accesos"
              descripcion={`${pluralizar(centro.usuariosAsignados, "usuario asignado", "usuarios asignados")} a este centro (los administradores de la institución ven todos sus centros).`}
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Link href={`/admin/usuarios?centro=${centro.id}`} className={buttonClasses({ variant: "secundario" })}>
                <Users aria-hidden />
                Ver usuarios
              </Link>
              <Link href={`/admin/auditoria?entidad=Centro&entidadId=${centro.id}`} className={buttonClasses({ variant: "secundario" })}>
                <ScrollText aria-hidden />
                Historial de cambios
              </Link>
              <BotonCambiarActivo
                entidad="centro"
                id={centro.id}
                nombre={centro.nombre}
                activo={centro.activo}
                aviso={
                  centro.activo && centro.existencias > 0
                    ? "Hoy tiene stock: tendrás que trasladarlo o darlo de baja antes."
                    : undefined
                }
              />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
