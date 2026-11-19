import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScrollText, Users } from "lucide-react";
import { BotonCambiarActivo } from "@/components/admin/boton-cambiar-activo";
import { FormularioCentro } from "@/components/admin/formulario-centro";
import { GestorUbicaciones } from "@/components/admin/ubicaciones";
import { Alert, Badge, BadgeActivo, buttonClasses, Card, CardHeader, PageHeader } from "@/components/ui";
import { ETIQUETA_TIPO_CENTRO } from "@/lib/estados";
import { formatearNumero, pluralizar } from "@/lib/formato";
import { contextoPagina } from "@/server/auth/sesion";
import { esErrorDominio } from "@/server/errores";
import { obtenerCentroAdmin, type CentroAdmin } from "@/server/servicios";

export const metadata: Metadata = { title: "Centro" };

export default async function PaginaCentro({ params }: PageProps<"/admin/centros/[centroId]">) {
  const { actor } = await contextoPagina("centros:gestionar");
  const { centroId } = await params;

  let centro: CentroAdmin;
  try {
    centro = await obtenerCentroAdmin(actor, centroId);
  } catch (error) {
    if (esErrorDominio(error) && error.codigo === "NO_ENCONTRADO") notFound();
    throw error;
  }

  return (
    <>
      <PageHeader
        titulo={centro.nombre}
        descripcion={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Badge tono="marca">{ETIQUETA_TIPO_CENTRO[centro.tipo]}</Badge>
            <BadgeActivo activo={centro.activo} />
            <span>
              {centro.comuna} · {formatearNumero(centro.existencias)} unidades en stock
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
              descripcion={`${pluralizar(centro.usuariosAsignados, "usuario asignado", "usuarios asignados")} a este centro (los administradores ven toda la red).`}
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
                    ? `Hoy tiene ${formatearNumero(centro.existencias)} unidades en stock: tendrás que trasladarlas o darlas de baja antes.`
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
