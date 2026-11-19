import Link from "next/link";
import { ChevronDown, ExternalLink, IdCard, Mail, Pencil, Phone, Truck, UserRound } from "lucide-react";
import { buttonClasses, EmptyState } from "@/components/ui";
import { formatearRut } from "@/lib/chile/rut";
import { cn } from "@/lib/cn";
import { dominioDeSitioWeb, normalizarSitioWeb } from "@/lib/esquemas/proveedores";
import { construirHref } from "@/lib/parametros-url";
import type { ProveedorDirectorio } from "@/server/servicios";

const CLASE_DATO =
  "flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg px-2 text-[0.9375rem] text-marca-700 underline-offset-4 hover:bg-marca-50/60 hover:underline";
const CLASE_DATO_FIJO = "flex min-h-9 min-w-0 items-center gap-2.5 px-2 text-[0.9375rem] text-texto";
const CLASE_ICONO = "size-4 shrink-0 text-texto-tenue";

/**
 * Directorio de proveedores (distribuidores). Cada uno:
 *  - botón "Ir a comprar" que abre su sitio web en una pestaña nueva (solo si
 *    tiene sitio; siempre http/https, con el dominio a la vista);
 *  - es DESPLEGABLE (`<details>`: se abre con clic, Enter o Espacio) y muestra
 *    teléfono (tel:), correo (mailto:), persona de contacto y RUT;
 *  - "Editar", solo para quien puede gestionar proveedores.
 */
export function DirectorioProveedores({
  proveedores,
  puedeEditar,
  className,
}: {
  proveedores: readonly ProveedorDirectorio[];
  /** Muestra "Editar" (permiso `proveedores:gestionar`; la página de destino lo vuelve a exigir). */
  puedeEditar: boolean;
  className?: string;
}) {
  if (proveedores.length === 0) {
    return (
      <EmptyState
        compacto
        icono={Truck}
        titulo="Sin proveedores"
        descripcion={puedeEditar ? "Agrégalos en Administración › Proveedores." : "Tu administrador aún no registra proveedores."}
      />
    );
  }
  return (
    <ul className={cn("divide-y divide-borde", className)}>
      {proveedores.map((p) => {
        // Defensa final: el enlace solo existe si es http(s) válido.
        const sitio = p.sitioWeb ? normalizarSitioWeb(p.sitioWeb) : null;
        const dominio = sitio ? dominioDeSitioWeb(sitio) : "";
        const sinDatos = !p.telefono && !p.email && !p.contacto;
        return (
          <li key={p.id} className="relative" data-proveedor={p.id}>
            <details className="group/prov">
              <summary
                className={cn(
                  "flex min-h-14 cursor-pointer list-none items-center gap-2.5 py-2 pl-4 hover:bg-marca-50/60 sm:pl-5 [&::-webkit-details-marker]:hidden",
                  sitio ? "pr-[9.75rem] sm:pr-[10.25rem]" : "pr-4 sm:pr-5",
                )}
              >
                <ChevronDown
                  className="size-4 shrink-0 text-texto-tenue transition-transform group-open/prov:rotate-180"
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] leading-snug font-medium text-texto">{p.razonSocial}</span>
                  <span className="block text-xs break-all text-texto-suave">
                    {dominio || "Sin sitio web"}
                    <span className="sr-only">. Ver teléfono, correo y contacto</span>
                  </span>
                </span>
              </summary>
              <div className="border-t border-borde bg-superficie-2 px-2 py-2 sm:px-3">
                <ul aria-label={`Datos de contacto de ${p.razonSocial}`}>
                  {p.telefono ? (
                    <li>
                      <a href={`tel:${p.telefono.replace(/[^\d+]/g, "")}`} className={CLASE_DATO}>
                        <Phone className={CLASE_ICONO} aria-hidden />
                        <span className="sr-only">Teléfono: </span>
                        <span className="cifras">{p.telefono}</span>
                      </a>
                    </li>
                  ) : null}
                  {p.email ? (
                    <li>
                      <a href={`mailto:${p.email}`} className={CLASE_DATO}>
                        <Mail className={CLASE_ICONO} aria-hidden />
                        <span className="sr-only">Correo electrónico: </span>
                        <span className="min-w-0 break-all">{p.email}</span>
                      </a>
                    </li>
                  ) : null}
                  {p.contacto ? (
                    <li className={CLASE_DATO_FIJO}>
                      <UserRound className={CLASE_ICONO} aria-hidden />
                      <span>
                        <span className="text-texto-suave">Contacto: </span>
                        {p.contacto}
                      </span>
                    </li>
                  ) : null}
                  <li className={CLASE_DATO_FIJO}>
                    <IdCard className={CLASE_ICONO} aria-hidden />
                    <span>
                      <span className="text-texto-suave">RUT: </span>
                      <span className="cifras">{formatearRut(p.rut)}</span>
                    </span>
                  </li>
                </ul>
                {sinDatos ? <p className="px-2 pb-1 text-sm text-texto-suave">Sin teléfono ni correo registrados.</p> : null}
                {puedeEditar ? (
                  <Link
                    href={construirHref("/admin/proveedores", { q: formatearRut(p.rut) })}
                    className={cn(buttonClasses({ variant: "fantasma", size: "sm" }), "mt-1")}
                  >
                    <Pencil aria-hidden />
                    Editar<span className="sr-only"> {p.razonSocial}</span>
                  </Link>
                ) : null}
              </div>
            </details>
            {sitio ? (
              <a
                href={sitio}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Ir a comprar en ${p.razonSocial}: ${dominio} (se abre en una pestaña nueva)`}
                className={cn(buttonClasses({ variant: "secundario", size: "sm" }), "absolute top-1.5 right-3 sm:right-4")}
              >
                Ir a comprar
                <ExternalLink aria-hidden />
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
