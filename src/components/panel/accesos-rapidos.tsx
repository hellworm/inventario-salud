import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  BellRing,
  Boxes,
  ChartColumn,
  ChevronRight,
  ClipboardList,
  History,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { puede, type Permiso, type Rol } from "@/lib/permisos";

interface Acceso {
  href: string;
  titulo: string;
  detalle: string;
  icono: LucideIcon;
  permiso: Permiso;
}

/** Acciones de escritura: solo se ofrecen a quien puede ejecutarlas. */
const REGISTRAR: Acceso[] = [
  { href: "/movimientos/ingreso", titulo: "Registrar ingreso", detalle: "Recibir insumos de un proveedor", icono: ArrowDownToLine, permiso: "movimientos:ingreso" },
  { href: "/movimientos/retiro", titulo: "Registrar retiro", detalle: "Sacar insumos para su uso", icono: ArrowUpFromLine, permiso: "movimientos:retiro" },
];

const OTROS: Acceso[] = [
  { href: "/movimientos/traslado", titulo: "Traslado", detalle: "Mover stock entre ubicaciones", icono: ArrowLeftRight, permiso: "movimientos:traslado" },
  { href: "/movimientos/ajuste", titulo: "Ajuste o merma", detalle: "Corregir stock o dar de baja", icono: SlidersHorizontal, permiso: "movimientos:ajuste" },
  { href: "/inventario", titulo: "Inventario", detalle: "Qué hay y dónde está", icono: Boxes, permiso: "inventario:ver" },
  { href: "/alertas", titulo: "Alertas", detalle: "Qué falta y qué vence", icono: BellRing, permiso: "alertas:ver" },
  { href: "/alertas/reposicion", titulo: "Lista de reposición", detalle: "Para imprimir o enviar el pedido", icono: ClipboardList, permiso: "alertas:ver" },
  { href: "/movimientos", titulo: "Historial", detalle: "Todos los movimientos", icono: History, permiso: "movimientos:ver" },
  { href: "/reportes", titulo: "Reportes", detalle: "Consumo, cobertura y exportaciones", icono: ChartColumn, permiso: "reportes:ver" },
];

/**
 * Botones grandes de Ingreso y Retiro (lo que más hace un bodeguero). No se
 * renderiza nada para roles de solo lectura.
 */
export function AccionesPrincipales({ rol, className }: { rol: Rol; className?: string }) {
  const acciones = REGISTRAR.filter((a) => puede(rol, a.permiso));
  if (acciones.length === 0) return null;
  return (
    <nav aria-label="Registrar movimientos" className={className}>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4">
        {acciones.map(({ href, titulo, detalle, icono: Icono }, i) => (
          <li key={href}>
            <Link
              href={href}
              className={cn(
                "group flex h-full min-h-[5.5rem] flex-col justify-between gap-3 rounded-tarjeta border p-4 shadow-tarjeta transition-colors sm:flex-row sm:items-center sm:justify-start sm:gap-4 sm:p-5",
                i === 0
                  ? "border-marca-600 bg-marca-600 text-white hover:bg-marca-700"
                  : "border-borde-fuerte/70 bg-superficie text-texto hover:border-marca-400 hover:bg-marca-50/50",
              )}
            >
              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-xl",
                  i === 0 ? "bg-white/15" : "bg-marca-50 text-marca-700",
                )}
              >
                <Icono className="size-6" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-base leading-tight font-semibold sm:text-lg">{titulo}</span>
                <span className={cn("mt-0.5 hidden text-sm sm:block", i === 0 ? "text-white" : "text-texto-suave")}>{detalle}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Lista de accesos según los permisos del rol (el visitante solo ve consultas). */
export function AccesosRapidos({ rol, incluirRegistro = false }: { rol: Rol; incluirRegistro?: boolean }) {
  const accesos = [...(incluirRegistro ? REGISTRAR : []), ...OTROS].filter((a) => puede(rol, a.permiso));
  return (
    <nav aria-label="Accesos rápidos del panel">
      <ul className="-mx-2">
        {accesos.map(({ href, titulo, detalle, icono: Icono }) => (
          <li key={href}>
            <Link href={href} className="group flex min-h-12 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-marca-50/60">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-superficie-2 text-texto-suave ring-1 ring-borde ring-inset group-hover:bg-marca-50 group-hover:text-marca-700">
                <Icono className="size-[1.125rem]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9375rem] font-medium">{titulo}</span>
                <span className="block truncate text-xs text-texto-suave">{detalle}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-texto-tenue group-hover:text-marca-700" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
