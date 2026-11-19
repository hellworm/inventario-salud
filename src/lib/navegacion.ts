import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  BellRing,
  Boxes,
  Building2,
  ChartColumn,
  History,
  LayoutDashboard,
  PackageSearch,
  ScrollText,
  SlidersHorizontal,
  Tags,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { puede, type Permiso, type Rol } from "./permisos";

export interface ItemNavegacion {
  href: string;
  etiqueta: string;
  /** Etiqueta corta para la barra inferior en móvil. */
  corta?: string;
  icono: LucideIcon;
  /** Permiso necesario para ver el ítem (la página lo vuelve a exigir). */
  permiso: Permiso;
}

export interface GrupoNavegacion {
  titulo: string | null;
  items: ItemNavegacion[];
}

/** Mapa completo de navegación. Se filtra por rol con `navegacionPara`. */
export const NAVEGACION: readonly GrupoNavegacion[] = [
  {
    titulo: null,
    items: [
      { href: "/panel", etiqueta: "Panel", icono: LayoutDashboard, permiso: "panel:ver" },
      { href: "/inventario", etiqueta: "Inventario", icono: Boxes, permiso: "inventario:ver" },
      { href: "/alertas", etiqueta: "Alertas", icono: BellRing, permiso: "alertas:ver" },
      { href: "/movimientos", etiqueta: "Movimientos", corta: "Historial", icono: History, permiso: "movimientos:ver" },
      { href: "/reportes", etiqueta: "Reportes", icono: ChartColumn, permiso: "reportes:ver" },
    ],
  },
  {
    titulo: "Registrar",
    items: [
      { href: "/movimientos/ingreso", etiqueta: "Ingreso", icono: ArrowDownToLine, permiso: "movimientos:ingreso" },
      { href: "/movimientos/retiro", etiqueta: "Retiro", icono: ArrowUpFromLine, permiso: "movimientos:retiro" },
      { href: "/movimientos/traslado", etiqueta: "Traslado", icono: ArrowLeftRight, permiso: "movimientos:traslado" },
      { href: "/movimientos/ajuste", etiqueta: "Ajuste o merma", icono: SlidersHorizontal, permiso: "movimientos:ajuste" },
    ],
  },
  {
    titulo: "Administración",
    items: [
      { href: "/admin/insumos", etiqueta: "Insumos", icono: PackageSearch, permiso: "catalogo:gestionar" },
      { href: "/admin/categorias", etiqueta: "Categorías", icono: Tags, permiso: "catalogo:gestionar" },
      { href: "/admin/centros", etiqueta: "Centros y ubicaciones", icono: Building2, permiso: "centros:gestionar" },
      { href: "/admin/proveedores", etiqueta: "Proveedores", icono: Truck, permiso: "proveedores:gestionar" },
      { href: "/admin/usuarios", etiqueta: "Usuarios", icono: Users, permiso: "usuarios:gestionar" },
      { href: "/admin/auditoria", etiqueta: "Auditoría", icono: ScrollText, permiso: "auditoria:ver" },
    ],
  },
];

/** Navegación visible para un rol (grupos vacíos se omiten). */
export function navegacionPara(rol: Rol): GrupoNavegacion[] {
  return NAVEGACION.map((g) => ({ ...g, items: g.items.filter((i) => puede(rol, i.permiso)) })).filter(
    (g) => g.items.length > 0,
  );
}

/** Ítems de la barra inferior en móvil (máximo 4; el resto va en "Más"). */
export function navegacionInferior(rol: Rol): ItemNavegacion[] {
  const prioridad = ["/panel", "/inventario", "/movimientos/ingreso", "/movimientos/retiro", "/alertas", "/movimientos"];
  const visibles = navegacionPara(rol).flatMap((g) => g.items);
  return prioridad
    .map((href) => visibles.find((i) => i.href === href))
    .filter((i): i is ItemNavegacion => i !== undefined)
    .slice(0, 4);
}

/** Href del ítem activo: el prefijo más largo que coincide con la ruta actual. */
export function hrefActivo(ruta: string, items: readonly ItemNavegacion[]): string | null {
  let mejor: string | null = null;
  for (const { href } of items) {
    if ((ruta === href || ruta.startsWith(`${href}/`)) && (mejor === null || href.length > mejor.length)) {
      mejor = href;
    }
  }
  return mejor;
}
