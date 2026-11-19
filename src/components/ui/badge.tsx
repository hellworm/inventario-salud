import * as React from "react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  CalendarX2,
  CircleCheck,
  CircleSlash,
  Infinity as InfinityIcon,
  OctagonAlert,
  PackageX,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  DESCRIPCION_SEMAFORO,
  ETIQUETA_ESTADO_STOCK,
  ETIQUETA_ESTADO_VENCIMIENTO,
  ETIQUETA_TIPO_MOVIMIENTO,
  type EstadoStock,
  type EstadoVencimiento,
  type TipoMovimiento,
} from "@/lib/estados";
import { NOMBRE_ROL, type Rol } from "@/lib/permisos";

export type BadgeTono = "neutro" | "marca" | "exito" | "alerta" | "peligro" | "info";

const TONOS: Record<BadgeTono, string> = {
  neutro: "bg-superficie-2 text-texto-suave ring-borde-fuerte/60",
  marca: "bg-marca-50 text-marca-800 ring-marca-200",
  exito: "bg-exito-50 text-exito-800 ring-exito-600/25",
  alerta: "bg-alerta-50 text-alerta-800 ring-alerta-500/40",
  peligro: "bg-peligro-50 text-peligro-800 ring-peligro-600/25",
  info: "bg-info-50 text-info-800 ring-info-700/20",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tono?: BadgeTono;
  icono?: LucideIcon;
}

/** Etiqueta compacta. El estado nunca se comunica solo con color: lleva ícono y texto. */
export function Badge({ tono = "neutro", icono: Icono, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset",
        TONOS[tono],
        className,
      )}
      {...props}
    >
      {Icono ? <Icono className="size-3.5 shrink-0" aria-hidden /> : null}
      {children}
    </span>
  );
}

const ESTADO_STOCK: Record<EstadoStock, { tono: BadgeTono; icono: LucideIcon }> = {
  SIN_STOCK: { tono: "peligro", icono: PackageX },
  BAJO_MINIMO: { tono: "alerta", icono: TriangleAlert },
  OK: { tono: "exito", icono: CircleCheck },
};

/** Estado de stock con color + ícono + texto. */
export function BadgeEstadoStock({ estado, className }: { estado: EstadoStock; className?: string }) {
  const { tono, icono } = ESTADO_STOCK[estado];
  return (
    <Badge tono={tono} icono={icono} className={className}>
      {ETIQUETA_ESTADO_STOCK[estado]}
    </Badge>
  );
}

/**
 * Apariencia del SEMÁFORO DE VENCIMIENTO. Cada color tiene además una FORMA
 * propia (octágono, triángulo, círculo) y siempre va con su nombre escrito:
 * se distingue sin ver el color (daltonismo, impresión en blanco y negro).
 * VENCIDO no es un color del semáforo: es un estado aparte y más grave (sólido).
 */
export const SEMAFORO_UI: Readonly<
  Record<
    EstadoVencimiento,
    {
      tono: BadgeTono;
      icono: LucideIcon;
      /** Clases extra del badge. */
      badge?: string;
      /** Color del ícono suelto (leyendas, desgloses). */
      texto: string;
      /** Fondo suave + texto, para íconos en recuadro. */
      suave: string;
      /** Borde de acento (tarjetas del panel). */
      acento: string;
    }
  >
> = {
  VENCIDO: {
    tono: "peligro",
    icono: CalendarX2,
    badge: "bg-peligro-700 text-white ring-peligro-800",
    texto: "text-peligro-800",
    suave: "bg-peligro-700 text-white",
    acento: "border-l-peligro-800",
  },
  ROJO: { tono: "peligro", icono: OctagonAlert, texto: "text-peligro-700", suave: "bg-peligro-50 text-peligro-700", acento: "border-l-peligro-600" },
  AMARILLO: { tono: "alerta", icono: TriangleAlert, texto: "text-alerta-700", suave: "bg-alerta-100 text-alerta-800", acento: "border-l-alerta-500" },
  VERDE: { tono: "exito", icono: CircleCheck, texto: "text-exito-700", suave: "bg-exito-50 text-exito-700", acento: "border-l-exito-600" },
  SIN_VENCIMIENTO: { tono: "neutro", icono: InfinityIcon, texto: "text-texto-suave", suave: "bg-superficie-2 text-texto-suave", acento: "border-l-borde-fuerte" },
};

/** "12 días", "hoy", "mañana", "hace 3 días": cuánto falta (o pasó) en palabras breves. */
function plazoBreve(dias: number): string {
  if (dias < -1) return `hace ${-dias} días`;
  if (dias === -1) return "ayer";
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";
  return `${dias} días`;
}

/**
 * Semáforo de vencimiento: color + forma + nombre del color. Con `dias`
 * agrega el plazo ("Rojo · 12 días", "Vencido · hace 3 días"); en verde y sin
 * vencimiento no hace falta (la fecha va al lado).
 */
export function BadgeEstadoVencimiento({
  estado,
  dias,
  className,
}: {
  estado: EstadoVencimiento;
  dias?: number | null;
  className?: string;
}) {
  const { tono, icono, badge } = SEMAFORO_UI[estado];
  const conPlazo = dias !== undefined && dias !== null && (estado === "VENCIDO" || estado === "ROJO" || estado === "AMARILLO");
  return (
    <Badge tono={tono} icono={icono} className={cn(badge, className)} title={DESCRIPCION_SEMAFORO[estado]}>
      {ETIQUETA_ESTADO_VENCIMIENTO[estado]}
      {conPlazo ? (
        <span className="cifras font-medium">
          <span aria-hidden>· </span>
          <span className="sr-only">{estado === "VENCIDO" ? ", venció " : ", vence "}</span>
          {dias >= 0 && dias > 1 ? <span className="sr-only">en </span> : null}
          {plazoBreve(dias)}
        </span>
      ) : null}
    </Badge>
  );
}

const TIPO_MOVIMIENTO: Record<TipoMovimiento, { tono: BadgeTono; icono: LucideIcon }> = {
  INGRESO: { tono: "exito", icono: ArrowDownToLine },
  RETIRO: { tono: "info", icono: ArrowUpFromLine },
  AJUSTE_POSITIVO: { tono: "marca", icono: SlidersHorizontal },
  AJUSTE_NEGATIVO: { tono: "marca", icono: SlidersHorizontal },
  MERMA: { tono: "peligro", icono: Trash2 },
  TRASLADO_SALIDA: { tono: "neutro", icono: ArrowLeftRight },
  TRASLADO_ENTRADA: { tono: "neutro", icono: ArrowLeftRight },
};

export function BadgeTipoMovimiento({ tipo, className }: { tipo: TipoMovimiento; className?: string }) {
  const { tono, icono } = TIPO_MOVIMIENTO[tipo];
  return (
    <Badge tono={tono} icono={icono} className={className}>
      {ETIQUETA_TIPO_MOVIMIENTO[tipo]}
    </Badge>
  );
}

export function BadgeRol({ rol, className }: { rol: Rol; className?: string }) {
  const tono: BadgeTono = rol === "ADMIN" ? "marca" : rol === "BODEGUERO" ? "info" : "neutro";
  return (
    <Badge tono={tono} className={className}>
      {NOMBRE_ROL[rol]}
    </Badge>
  );
}

/** Activo / Inactivo para catálogos y usuarios. */
export function BadgeActivo({ activo, className }: { activo: boolean; className?: string }) {
  return (
    <Badge tono={activo ? "exito" : "neutro"} icono={activo ? CircleCheck : CircleSlash} className={className}>
      {activo ? "Activo" : "Inactivo"}
    </Badge>
  );
}
