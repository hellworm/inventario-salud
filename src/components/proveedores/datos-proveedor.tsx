import * as React from "react";
import { Building2, ExternalLink, Globe2, History, Mail, Phone, Truck, UserRound } from "lucide-react";
import { Alert, Badge, buttonClasses } from "@/components/ui";
import { formatearRut } from "@/lib/chile/rut";
import { cn } from "@/lib/cn";
import { dominioDeSitioWeb, normalizarSitioWeb } from "@/lib/esquemas/proveedores";
import { formatearDia, diaEnSantiago } from "@/lib/fechas";
import type { DetalleProveedorInsumo, OrigenProveedor, ProveedorDeInsumo } from "@/server/servicios";

/**
 * Piezas para mostrar el PROVEEDOR de un insumo (ficha, panel lateral del
 * inventario, alertas, reposición). No usan hooks: sirven en Server y Client
 * Components. Los enlaces reutilizan la validación del directorio de
 * proveedores (`normalizarSitioWeb`): nunca se arma un `href` que no sea http(s).
 */

/** Lo mínimo que necesita un enlace "Ir a comprar". */
type ConSitio = Pick<ProveedorDeInsumo, "razonSocial" | "sitioWeb">;

/** Sitio web validado de un proveedor (o `null`): la última defensa antes de usarlo como `href`. */
export function sitioDeCompra(proveedor: ConSitio | null | undefined): { href: string; dominio: string } | null {
  const href = proveedor?.sitioWeb ? normalizarSitioWeb(proveedor.sitioWeb) : null;
  return href ? { href, dominio: dominioDeSitioWeb(href) } : null;
}

/**
 * "Ir a comprar": abre el sitio web del proveedor en una pestaña nueva
 * (`rel="noopener noreferrer"`). No se dibuja si el proveedor no tiene sitio.
 * `variante="enlace"` es el enlace secundario de las filas de alertas.
 */
export function EnlaceComprar({
  proveedor,
  variante = "boton",
  className,
}: {
  proveedor: ConSitio | null | undefined;
  variante?: "boton" | "enlace";
  className?: string;
}) {
  const sitio = sitioDeCompra(proveedor);
  if (!sitio || !proveedor) return null;
  return (
    <a
      href={sitio.href}
      target="_blank"
      rel="noopener noreferrer"
      data-ir-a-comprar
      aria-label={`Ir a comprar en ${proveedor.razonSocial}: ${sitio.dominio} (se abre en una pestaña nueva)`}
      className={cn(
        variante === "boton"
          ? buttonClasses({ variant: "secundario", size: "sm" })
          : "relative z-10 inline-flex min-h-6 items-center gap-1 text-xs font-medium whitespace-nowrap text-marca-700 underline-offset-2 hover:underline pointer-coarse:min-h-11 [&_svg]:size-3.5 [&_svg]:shrink-0",
        className,
      )}
    >
      Ir a comprar
      <ExternalLink aria-hidden />
    </a>
  );
}

const ETIQUETA_ORIGEN: Record<OrigenProveedor, string> = {
  INSTITUCION: "De la institución",
  RED: "Predeterminado de la red",
};

/** De dónde sale el proveedor efectivo: la institución o el predeterminado de la red. */
export function BadgeOrigenProveedor({ origen, propia = false }: { origen: OrigenProveedor; propia?: boolean }) {
  return origen === "INSTITUCION" ? (
    <Badge tono="marca" icono={Building2}>
      {propia ? "De tu institución" : ETIQUETA_ORIGEN.INSTITUCION}
    </Badge>
  ) : (
    <Badge tono="neutro" icono={Globe2}>
      {ETIQUETA_ORIGEN.RED}
    </Badge>
  );
}

/** Marca "Inactivo" para un proveedor desactivado que sigue asignado. */
export function BadgeProveedorInactivo() {
  return <Badge tono="alerta">Inactivo</Badge>;
}

/**
 * Nombre del proveedor para grillas: una línea que se trunca, con "(inactivo)"
 * a la vista si corresponde. `null` = "Sin proveedor".
 */
export function NombreProveedor({
  proveedor,
  lineas = 1,
  className,
}: {
  proveedor: Pick<ProveedorDeInsumo, "razonSocial" | "activo"> | null;
  /** Con 2, el nombre ocupa hasta dos líneas antes de cortarse (columnas angostas). */
  lineas?: 1 | 2;
  className?: string;
}) {
  if (!proveedor) return <span className={cn("text-texto-tenue", className)}>Sin proveedor</span>;
  return (
    <span className={cn("block min-w-0", className)} title={proveedor.razonSocial}>
      <span className={lineas === 2 ? "line-clamp-2 break-words" : "block truncate"}>{proveedor.razonSocial}</span>
      {proveedor.activo ? null : <span className="block text-xs font-medium text-alerta-800">Proveedor inactivo</span>}
    </span>
  );
}

const CLASE_DATO =
  "flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg px-2 text-[0.9375rem] text-marca-700 underline-offset-4 hover:bg-marca-50/60 hover:underline pointer-fine:min-h-9";
const CLASE_ICONO = "size-4 shrink-0 text-texto-tenue";

/** Teléfono (`tel:`), correo (`mailto:`), contacto y RUT de un proveedor, a la vista. */
export function ContactoProveedor({ proveedor, className }: { proveedor: ProveedorDeInsumo; className?: string }) {
  return (
    <ul className={cn("-mx-2", className)} aria-label={`Datos de contacto de ${proveedor.razonSocial}`}>
      {proveedor.telefono ? (
        <li>
          <a href={`tel:${proveedor.telefono.replace(/[^\d+]/g, "")}`} className={CLASE_DATO}>
            <Phone className={CLASE_ICONO} aria-hidden />
            <span className="sr-only">Teléfono: </span>
            <span className="cifras">{proveedor.telefono}</span>
          </a>
        </li>
      ) : null}
      {proveedor.email ? (
        <li>
          <a href={`mailto:${proveedor.email}`} className={CLASE_DATO}>
            <Mail className={CLASE_ICONO} aria-hidden />
            <span className="sr-only">Correo electrónico: </span>
            <span className="min-w-0 break-all">{proveedor.email}</span>
          </a>
        </li>
      ) : null}
      <li className="flex min-h-9 min-w-0 items-center gap-2.5 px-2 text-sm text-texto-suave">
        <UserRound className={CLASE_ICONO} aria-hidden />
        <span className="min-w-0">
          {proveedor.contacto ? `${proveedor.contacto} · ` : ""}
          RUT <span className="cifras">{formatearRut(proveedor.rut)}</span>
        </span>
      </li>
      {!proveedor.telefono && !proveedor.email ? (
        <li className="px-2 pb-1 text-sm text-texto-suave">Sin teléfono ni correo registrados.</li>
      ) : null}
    </ul>
  );
}

/**
 * Bloque "Proveedor" de un insumo: el proveedor efectivo con su origen, "Ir a
 * comprar", teléfono y correo; si está inactivo, se marca y se sugiere
 * cambiarlo; si no hay ninguno, el del último ingreso (rotulado como tal).
 * `acciones` recibe los botones de quien puede cambiarlo.
 */
export function BloqueProveedor({
  detalle,
  acciones,
  accionUltimo,
  compacto = false,
  className,
}: {
  detalle: DetalleProveedorInsumo;
  /** Botones (p. ej. "Cambiar proveedor"); se muestran bajo los datos. */
  acciones?: React.ReactNode;
  /** Acción junto al "último proveedor" (p. ej. "Usar como predeterminado"). */
  accionUltimo?: React.ReactNode;
  /** Sin el desglose por institución (panel lateral). */
  compacto?: boolean;
  className?: string;
}) {
  const { efectivo, red, institucion, porInstitucion, ultimoIngreso } = detalle;
  const puedeCambiar = detalle.permisos.cambiarRed || detalle.permisos.cambiarInstitucion;
  const otras = porInstitucion.filter((p) => p.institucionId !== institucion?.id && p.proveedor.id !== red?.id);

  return (
    <div className={cn("space-y-3", className)} data-bloque-proveedor>
      {efectivo ? (
        <>
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-marca-50 text-marca-700">
              <Truck className="size-[1.125rem]" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.9375rem] leading-snug font-semibold break-words text-texto" data-proveedor-efectivo>
                {efectivo.razonSocial}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-1.5">
                <BadgeOrigenProveedor origen={efectivo.origen} propia={!detalle.permisos.cambiarRed} />
                {efectivo.activo ? null : <BadgeProveedorInactivo />}
              </p>
            </div>
          </div>
          {efectivo.activo ? null : (
            <Alert tono="alerta" titulo="Este proveedor está inactivo">
              Ya no se ofrece al registrar ingresos.{" "}
              {puedeCambiar ? "Conviene cambiarlo por uno activo." : "Avisa a tu administrador para que lo cambie por uno activo."}
            </Alert>
          )}
          {sitioDeCompra(efectivo) ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <EnlaceComprar proveedor={efectivo} />
              <span className="min-w-0 truncate text-xs text-texto-suave">{sitioDeCompra(efectivo)?.dominio}</span>
            </div>
          ) : null}
          <ContactoProveedor proveedor={efectivo} />
          {efectivo.origen === "INSTITUCION" ? (
            <p className="text-sm text-texto-suave" data-proveedor-red>
              Predeterminado de la red:{" "}
              <strong className="font-medium text-texto">{red ? red.razonSocial : "sin definir"}</strong>
              {red && !red.activo ? " (inactivo)" : ""}
            </p>
          ) : null}
        </>
      ) : (
        <div className="space-y-2" data-sin-proveedor>
          <p className="text-sm text-texto-suave">
            <strong className="font-semibold text-texto">Sin proveedor definido.</strong>{" "}
            {puedeCambiar ? "Defínelo para saber dónde comprarlo cuando falte." : "Tu administrador aún no lo define."}
          </p>
          {ultimoIngreso ? (
            <div className="rounded-control border border-borde bg-superficie-2 px-3 py-2.5" data-ultimo-proveedor>
              <p className="flex items-start gap-2 text-sm text-texto">
                <History className="mt-0.5 size-4 shrink-0 text-texto-tenue" aria-hidden />
                <span className="min-w-0">
                  <span className="text-texto-suave">Último proveedor: </span>
                  <strong className="font-semibold break-words">{ultimoIngreso.proveedor.razonSocial}</strong>
                  {ultimoIngreso.proveedor.activo ? "" : " (inactivo)"}
                  <span className="block text-xs text-texto-suave">
                    Según el último ingreso registrado, el {formatearDia(diaEnSantiago(ultimoIngreso.fecha))}. No es el proveedor definido.
                  </span>
                </span>
              </p>
              {ultimoIngreso.proveedor.activo ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <EnlaceComprar proveedor={ultimoIngreso.proveedor} />
                  {accionUltimo}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {!compacto && otras.length > 0 ? (
        <div className="border-t border-borde pt-3" data-desglose-instituciones>
          <p className="text-xs font-medium tracking-wide text-texto-suave uppercase">Instituciones con otro proveedor</p>
          <ul className="mt-1.5 space-y-1 text-sm">
            {otras.map((p) => (
              <li key={p.institucionId} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="min-w-0 text-texto-suave">{p.institucion}</span>
                <span className="min-w-0 font-medium break-words text-texto">
                  {p.proveedor.razonSocial}
                  {p.proveedor.activo ? "" : " (inactivo)"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {acciones ? <div className="flex flex-wrap items-center gap-2">{acciones}</div> : null}
    </div>
  );
}
