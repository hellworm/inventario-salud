import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ChevronRight, MapPin, Phone, Plus } from "lucide-react";
import { Badge, BadgeActivo, buttonClasses, EmptyState, PageHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ETIQUETA_TIPO_CENTRO } from "@/lib/estados";
import { formatearNumero } from "@/lib/formato";
import { contextoPagina } from "@/server/auth/sesion";
import { listarCentrosAdmin } from "@/server/servicios";

export const metadata: Metadata = { title: "Centros y ubicaciones" };

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-texto-tenue">{etiqueta}</dt>
      <dd className="cifras text-base font-semibold text-texto">{valor}</dd>
    </div>
  );
}

export default async function PaginaAdminCentros() {
  const { actor } = await contextoPagina("centros:gestionar");
  const centros = await listarCentrosAdmin(actor);

  return (
    <>
      <PageHeader
        titulo="Centros y ubicaciones"
        descripcion="Los establecimientos de la red y los lugares donde cada uno guarda su stock."
        acciones={
          <Link href="/admin/centros/nuevo" className={buttonClasses()}>
            <Plus aria-hidden />
            Nuevo centro
          </Link>
        }
      />

      {centros.length === 0 ? (
        <EmptyState
          icono={Building2}
          titulo="Aún no hay centros"
          descripcion="Crea el primer centro de la red para empezar a registrar su inventario."
          accion={
            <Link href="/admin/centros/nuevo" className={buttonClasses()}>
              Nuevo centro
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Centros de la red">
          {centros.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/centros/${c.id}`}
                className={cn(
                  "group flex h-full flex-col rounded-tarjeta border border-borde bg-superficie p-4 shadow-tarjeta transition-colors hover:border-marca-300 sm:p-5",
                  !c.activo && "bg-superficie-2/70",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-xl",
                      c.activo ? "bg-marca-50 text-marca-700" : "bg-superficie-2 text-texto-tenue",
                    )}
                  >
                    <Building2 className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base leading-snug font-semibold text-texto group-hover:text-marca-800">{c.nombre}</h2>
                    <p className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge tono="marca">{ETIQUETA_TIPO_CENTRO[c.tipo]}</Badge>
                      {!c.activo ? <BadgeActivo activo={false} /> : null}
                    </p>
                  </div>
                  <ChevronRight className="mt-1 size-5 shrink-0 text-texto-tenue transition-transform group-hover:translate-x-0.5 group-hover:text-marca-700" aria-hidden />
                </div>

                <div className="mt-4 space-y-1.5 text-sm text-texto-suave">
                  <p className="flex items-start gap-2">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-texto-tenue" aria-hidden />
                    <span>
                      {c.direccion}, {c.comuna}
                      <span className="block text-texto-tenue">{c.region}</span>
                    </span>
                  </p>
                  {c.telefono ? (
                    <p className="flex items-center gap-2">
                      <Phone className="size-4 shrink-0 text-texto-tenue" aria-hidden />
                      <span className="cifras">{c.telefono}</span>
                    </p>
                  ) : null}
                </div>

                <div className="mt-auto pt-4">
                <dl className="grid grid-cols-3 gap-3 border-t border-borde pt-4">
                  <Dato etiqueta="Ubicaciones" valor={formatearNumero(c.ubicacionesActivas)} />
                  <Dato etiqueta="Usuarios" valor={formatearNumero(c.usuariosAsignados)} />
                  <Dato etiqueta="Unidades" valor={formatearNumero(c.existencias)} />
                </dl>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
