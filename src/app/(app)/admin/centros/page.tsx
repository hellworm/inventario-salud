import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ChevronRight, Landmark, MapPin, Phone, Plus } from "lucide-react";
import { Badge, BadgeActivo, buttonClasses, EmptyState, PageHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ETIQUETA_TIPO_CENTRO } from "@/lib/estados";
import { formatearNumero, pluralizar } from "@/lib/formato";
import { veTodaLaRed } from "@/lib/permisos";
import { contextoPagina } from "@/server/auth/sesion";
import { listarCentrosAdmin, listarOpcionesInstitucion, type FilaCentroAdmin } from "@/server/servicios";

export const metadata: Metadata = { title: "Centros y ubicaciones" };

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-texto-tenue">{etiqueta}</dt>
      <dd className="cifras text-base font-semibold text-texto">{valor}</dd>
    </div>
  );
}

/** Tarjeta de un centro. `nivel` es el nivel del encabezado (3 cuando va dentro de un grupo por institución). */
function TarjetaCentro({ c, nivel }: { c: FilaCentroAdmin; nivel: 2 | 3 }) {
  const Titulo = nivel === 2 ? "h2" : "h3";
  return (
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
          <Titulo className="text-base leading-snug font-semibold text-texto group-hover:text-marca-800">{c.nombre}</Titulo>
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
          <Dato etiqueta="Stock" valor={c.existencias > 0 ? "Con stock" : "Sin stock"} />
        </dl>
      </div>
    </Link>
  );
}

const GRILLA = "grid gap-4 md:grid-cols-2 xl:grid-cols-3";

export default async function PaginaAdminCentros() {
  const { actor, sesion } = await contextoPagina("centros:gestionar");
  const esRed = veTodaLaRed(actor);
  const [centros, instituciones] = await Promise.all([
    listarCentrosAdmin(actor),
    // El administrador de la red ve los centros agrupados por institución
    // (también las instituciones que aún no tienen centros).
    esRed ? listarOpcionesInstitucion(actor) : null,
  ]);
  const institucionPropia = sesion.usuario.institucion?.nombre ?? null;

  const botonNuevo = (
    <Link href="/admin/centros/nuevo" className={buttonClasses()}>
      <Plus aria-hidden />
      Nuevo centro
    </Link>
  );

  return (
    <>
      <PageHeader
        titulo="Centros y ubicaciones"
        descripcion={
          esRed
            ? "Los establecimientos de cada institución de la red y los lugares donde guardan su stock."
            : `Los establecimientos de ${institucionPropia ?? "tu institución"} y los lugares donde cada uno guarda su stock.`
        }
        acciones={botonNuevo}
      />

      {instituciones ? (
        instituciones.length === 0 ? (
          <EmptyState
            icono={Landmark}
            titulo="Aún no hay instituciones"
            descripcion="Cada centro pertenece a una institución. Crea primero la institución y después agrégale sus centros."
            accion={
              <Link href="/admin/instituciones" className={buttonClasses()}>
                Ir a Instituciones
              </Link>
            }
          />
        ) : (
          <div className="space-y-8">
            {instituciones.map((i) => {
              const suyos = centros.filter((c) => c.institucionId === i.id);
              const activos = suyos.filter((c) => c.activo).length;
              return (
                <section key={i.id} aria-labelledby={`institucion-${i.id}`} data-institucion={i.nombre}>
                  <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-superficie-2 text-texto-suave">
                      <Landmark className="size-[1.125rem]" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 id={`institucion-${i.id}`} className="text-lg leading-snug font-semibold tracking-tight text-texto">
                        {i.nombre}
                      </h2>
                      <p className="flex flex-wrap items-center gap-2 text-sm text-texto-suave">
                        {suyos.length === 0
                          ? "Sin centros"
                          : `${pluralizar(activos, "centro activo", "centros activos")}${suyos.length > activos ? ` · ${suyos.length - activos} inactivo${suyos.length - activos === 1 ? "" : "s"}` : ""}`}
                        {!i.activo ? <BadgeActivo activo={false} /> : null}
                      </p>
                    </div>
                    {i.activo ? (
                      <Link
                        href={`/admin/centros/nuevo?institucion=${i.id}`}
                        className={buttonClasses({ variant: "secundario", size: "sm" })}
                        aria-label={`Agregar centro a ${i.nombre}`}
                      >
                        <Plus aria-hidden />
                        Agregar centro
                      </Link>
                    ) : null}
                  </div>
                  {suyos.length === 0 ? (
                    <p className="rounded-tarjeta border border-dashed border-borde-fuerte bg-superficie px-4 py-5 text-sm text-texto-suave">
                      Esta institución aún no tiene centros.
                    </p>
                  ) : (
                    <ul className={GRILLA} aria-label={`Centros de ${i.nombre}`}>
                      {suyos.map((c) => (
                        <li key={c.id}>
                          <TarjetaCentro c={c} nivel={3} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )
      ) : centros.length === 0 ? (
        <EmptyState
          icono={Building2}
          titulo="Aún no hay centros"
          descripcion="Crea el primer centro de tu institución para empezar a registrar su inventario."
          accion={
            <Link href="/admin/centros/nuevo" className={buttonClasses()}>
              Nuevo centro
            </Link>
          }
        />
      ) : (
        <ul className={GRILLA} aria-label="Centros de tu institución">
          {centros.map((c) => (
            <li key={c.id}>
              <TarjetaCentro c={c} nivel={2} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
