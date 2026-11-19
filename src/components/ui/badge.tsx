import * as React from "react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  CalendarClock,
  CalendarX2,
  CircleCheck,
  CircleSlash,
  Infinity as InfinityIcon,
  PackageX,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
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

const ESTADO_VENCIMIENTO: Record<EstadoVencimiento, { tono: BadgeTono; icono: LucideIcon }> = {
  VENCIDO: { tono: "peligro", icono: CalendarX2 },
  POR_VENCER: { tono: "alerta", icono: CalendarClock },
  VIGENTE: { tono: "exito", icono: CircleCheck },
  SIN_VENCIMIENTO: { tono: "neutro", icono: InfinityIcon },
};

/**
 * Estado de vencimiento con color + ícono + texto. Con `dias` muestra el
 * detalle ("Vence en 12 días") en vez de la etiqueta genérica.
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
  const { tono, icono } = ESTADO_VENCIMIENTO[estado];
  let texto: string = ETIQUETA_ESTADO_VENCIMIENTO[estado];
  if (dias !== undefined && dias !== null && estado === "POR_VENCER") {
    texto = dias === 0 ? "Vence hoy" : dias === 1 ? "Vence mañana" : `Vence en ${dias} días`;
  }
  return (
    <Badge tono={tono} icono={icono} className={className}>
      {texto}
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
  const tono: BadgeTono = rol === "ADMIN_RED" ? "exito" : rol === "ADMIN" ? "marca" : rol === "BODEGUERO" ? "info" : "neutro";
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
