import * as React from "react";
import { Download } from "lucide-react";
import { FiltroSelect } from "@/components/alertas/filtro-select";
import { PestanasEnlace } from "@/components/alertas/pestanas-enlace";
import { buttonClasses } from "@/components/ui";
import { cn } from "@/lib/cn";

export const REPORTES = [
  {
    clave: "existencias",
    href: "/reportes/existencias",
    titulo: "Existencias",
    descripcion: "Stock actual valorizado por centro, ubicación y lote.",
  },
  {
    clave: "movimientos",
    href: "/reportes/movimientos",
    titulo: "Movimientos",
    descripcion: "Ingresos, retiros, ajustes, mermas y traslados de un período.",
  },
  {
    clave: "consumo",
    href: "/reportes/consumo",
    titulo: "Consumo y cobertura",
    descripcion: "Retiros por insumo, promedio diario y días de cobertura estimados.",
  },
  {
    clave: "vencimientos",
    href: "/reportes/vencimientos",
    titulo: "Vencimientos y mermas",
    descripcion: "Lotes vencidos o por vencer y bajas registradas en el período.",
  },
] as const;

export type ClaveReporte = (typeof REPORTES)[number]["clave"];

/** Navegación entre reportes (pestañas con enlaces). */
export function NavReportes({ activo }: { activo: ClaveReporte }) {
  return (
    <PestanasEnlace
      etiqueta="Reportes"
      className="mb-4"
      pestanas={REPORTES.map((r) => ({ href: r.href, etiqueta: r.titulo, activa: r.clave === activo }))}
    />
  );
}

/**
 * Enlace de descarga del CSV. Es un `<a download>` a un Route Handler que
 * vuelve a validar sesión, rol y centro: no depende de lo que muestre la UI.
 */
export function BotonExportar({
  href,
  children = "Exportar CSV",
  variante = "primario",
}: {
  href: string;
  children?: React.ReactNode;
  variante?: "primario" | "secundario";
}) {
  return (
    <a href={href} download className={buttonClasses({ variant: variante })}>
      <Download aria-hidden />
      {children}
    </a>
  );
}

/** Filtro por centro: solo se muestra en "Toda la red" (con un centro activo manda el selector global). */
export function FiltroCentro({
  centroActivoId,
  centros,
  className,
}: {
  centroActivoId: string | null;
  centros: readonly { id: string; nombre: string }[];
  className?: string;
}) {
  if (centroActivoId || centros.length < 2) return null;
  return (
    <FiltroSelect
      parametro="centro"
      etiqueta="Centro"
      todos="Todos los centros"
      opciones={centros.map((c) => ({ value: c.id, label: c.nombre }))}
      className={className}
    />
  );
}

export interface Cifra {
  etiqueta: string;
  valor: React.ReactNode;
  detalle?: React.ReactNode;
}

/** Cifras de resumen sobre la tabla de un reporte (pensado para 2 o 4 cifras). */
export function Cifras({ cifras, className }: { cifras: readonly Cifra[]; className?: string }) {
  return (
    <dl
      className={cn(
        "mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-tarjeta border border-borde bg-borde shadow-tarjeta",
        cifras.length >= 4 && "lg:grid-cols-4",
        className,
      )}
    >
      {cifras.map((c) => (
        <div key={c.etiqueta} className="min-w-0 bg-superficie px-4 py-3 sm:px-5">
          <dt className="truncate text-xs font-medium text-texto-suave">{c.etiqueta}</dt>
          <dd className="cifras mt-0.5 truncate text-xl font-semibold tracking-tight">{c.valor}</dd>
          {c.detalle ? <dd className="truncate text-xs text-texto-tenue">{c.detalle}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/** Celda de insumo con nombre y código (misma forma en todos los reportes). */
export function CeldaInsumo({ nombre, codigo, extra }: { nombre: string; codigo: string; extra?: string | null }) {
  return (
    <span className="block min-w-0">
      <span className="block truncate font-medium">{nombre}</span>
      <span className="block truncate text-xs font-normal text-texto-tenue">
        {codigo}
        {extra ? ` · ${extra}` : ""}
      </span>
    </span>
  );
}
