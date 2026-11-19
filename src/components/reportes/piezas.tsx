import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { BotonImprimir } from "@/components/alertas/boton-imprimir";
import "@/components/alertas/impresion.css";
import { PestanasEnlace } from "@/components/alertas/pestanas-enlace";
import { buttonClasses } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatearNumero } from "@/lib/formato";
import { unidadSegun } from "@/lib/unidades";

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
  variante = "primario",
  de,
}: {
  href: string;
  variante?: "primario" | "secundario";
  /** Qué se exporta, para distinguir varios botones en una misma página (solo lectores de pantalla). */
  de?: string;
}) {
  return (
    <a href={href} download className={buttonClasses({ variant: variante })}>
      <Download aria-hidden />
      Exportar CSV
      {de ? <span className="sr-only"> de {de}</span> : null}
    </a>
  );
}

/**
 * Cantidad con su unidad concordada ("4 frascos", "1 caja") y la unidad en
 * tono suave. `signo` antepone "+" o "−" (movimientos).
 */
export function CantidadUnidad({
  cantidad,
  unidad,
  signo,
  className,
}: {
  cantidad: number;
  unidad: string;
  signo?: number;
  className?: string;
}) {
  return (
    <span className={cn("cifras whitespace-nowrap font-semibold", className)}>
      {signo === undefined ? "" : signo > 0 ? "+" : "−"}
      {formatearNumero(cantidad)} <span className="font-normal text-texto-tenue">{unidadSegun(cantidad, unidad)}</span>
    </span>
  );
}

export interface Cifra {
  etiqueta: string;
  valor: React.ReactNode;
  detalle?: React.ReactNode;
}

/** Cifras de resumen sobre la tabla de un reporte (2, 3 o 4 cifras). */
export function Cifras({ cifras, className }: { cifras: readonly Cifra[]; className?: string }) {
  return (
    <dl
      className={cn(
        "mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-tarjeta border border-borde bg-borde shadow-tarjeta",
        cifras.length === 3 && "sm:grid-cols-3",
        cifras.length >= 4 && "lg:grid-cols-4",
        className,
      )}
    >
      {cifras.map((c, i) => (
        <div
          key={c.etiqueta}
          className={cn("min-w-0 bg-superficie px-4 py-3 sm:px-5", cifras.length === 3 && i === 2 && "col-span-2 sm:col-span-1")}
        >
          <dt className="truncate text-xs font-medium text-texto-suave">{c.etiqueta}</dt>
          <dd className="cifras mt-0.5 truncate text-xl font-semibold tracking-tight">{c.valor}</dd>
          {c.detalle ? <dd className="truncate text-xs text-texto-tenue">{c.detalle}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/**
 * Celda de dos líneas: dato principal y contexto en tono suave. El texto
 * envuelve (no se trunca) para que las tablas quepan en tablets sin scroll
 * horizontal; agrupar datos afines en una celda ahorra columnas.
 */
export function DosLineas({
  principal,
  secundario,
  className,
}: {
  principal: React.ReactNode;
  secundario?: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("block min-w-0 break-words", className)}>
      <span className="block">{principal}</span>
      {secundario ? <span className="block text-xs font-normal text-texto-tenue">{secundario}</span> : null}
    </span>
  );
}

/** Celda de insumo con nombre y código (misma forma en todos los reportes y alertas). */
export function CeldaInsumo({ nombre, codigo, extra }: { nombre: string; codigo: string; extra?: string | null }) {
  return <DosLineas principal={<span className="font-medium">{nombre}</span>} secundario={`${codigo}${extra ? ` · ${extra}` : ""}`} />;
}

/**
 * Clases para el `PageHeader` de una vista imprimible: en la hoja queda solo el
 * título (se ocultan el enlace "volver", la descripción y los botones).
 */
export const CLASE_ENCABEZADO_IMPRIMIBLE =
  "print:mb-1 print:[&_a]:hidden print:[&_p]:hidden print:[&>div:last-child]:hidden print:[&_h1]:text-[18pt] print:[&_h1]:leading-tight";

/**
 * Contenedor de un reporte: en pantalla no cambia nada; al imprimir oculta la
 * aplicación, usa hoja apaisada y agrega la línea de contexto (`contexto`).
 */
export function VistaReporte({
  contexto,
  generadoPor,
  generadoEl,
  children,
}: {
  /** Alcance, período y filtros aplicados, en una línea. */
  contexto: React.ReactNode;
  generadoPor: string;
  /** Fecha y hora ya formateadas. */
  generadoEl: string;
  children: React.ReactNode;
}) {
  return (
    <div data-imprimible="horizontal">
      {children}
      <p className="mt-4 hidden border-t border-texto pt-2 text-[9pt] text-texto-suave print:block">
        {contexto} · RedInsumos · Generado el {generadoEl} por {generadoPor}. Vista previa de la página en pantalla: el detalle completo
        está en la exportación CSV.
      </p>
    </div>
  );
}

/** Acciones del encabezado de un reporte: imprimir la vista previa y exportar el CSV. */
export function AccionesReporte({ hrefCsv }: { hrefCsv?: string }) {
  return (
    <>
      <BotonImprimir />
      {hrefCsv ? <BotonExportar href={hrefCsv} /> : null}
    </>
  );
}

/**
 * Paginación con nombre propio, para páginas con más de una lista paginada
 * (dos `nav` no pueden llamarse igual). Misma apariencia que `Pagination`.
 */
export function PaginacionNombrada({
  etiqueta,
  pagina,
  totalPaginas,
  total,
  porPagina,
  hrefDe,
  className,
}: {
  /** Nombre accesible del `nav` (p. ej. "Paginación de mermas"). */
  etiqueta: string;
  pagina: number;
  totalPaginas: number;
  total: number;
  porPagina: number;
  hrefDe: (pagina: number) => string;
  className?: string;
}) {
  if (total === 0) return null;
  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);
  const clase = buttonClasses({ variant: "secundario", size: "sm" });
  return (
    <nav className={cn("flex flex-col items-center justify-between gap-3 sm:flex-row print:hidden", className)} aria-label={etiqueta}>
      <p className="cifras text-sm text-texto-suave" aria-live="polite">
        {formatearNumero(desde)}–{formatearNumero(hasta)} de {formatearNumero(total)}
      </p>
      <div className="flex items-center gap-2">
        {pagina > 1 ? (
          <Link href={hrefDe(pagina - 1)} className={clase} rel="prev" scroll={false}>
            <ChevronLeft aria-hidden />
            Anterior
          </Link>
        ) : (
          <span className={clase} aria-disabled="true">
            <ChevronLeft aria-hidden />
            Anterior
          </span>
        )}
        <span className="cifras px-1 text-sm text-texto-suave">
          Página {formatearNumero(pagina)} de {formatearNumero(totalPaginas)}
        </span>
        {pagina < totalPaginas ? (
          <Link href={hrefDe(pagina + 1)} className={clase} rel="next" scroll={false}>
            Siguiente
            <ChevronRight aria-hidden />
          </Link>
        ) : (
          <span className={clase} aria-disabled="true">
            Siguiente
            <ChevronRight aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}
