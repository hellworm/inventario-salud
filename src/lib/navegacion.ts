import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  BellRing,
  Boxes,
  Building2,
  ChartColumn,
  History,
  Landmark,
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
      { href: "/admin/instituciones", etiqueta: "Instituciones", icono: Landmark, permiso: "instituciones:gestionar" },
      { href: "/admin/insumos", etiqueta: "Insumos", icono: PackageSearch, permiso: "catalogo:crear" },
      { href: "/admin/categorias", etiqueta: "Categorías", icono: Tags, permiso: "catalogo:crear" },
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

// ---------------------------------------------------------------------------
// Enlace "volver" coherente con el origen
// ---------------------------------------------------------------------------

export interface DestinoVolver {
  href: string;
  label: string;
}

/** Secciones desde las que se llega a un formulario o ficha (prefijo más específico primero). */
const ORIGENES_VOLVER: readonly { prefijo: string; label: string; exacto?: boolean }[] = [
  { prefijo: "/panel", label: "Panel", exacto: true },
  { prefijo: "/alertas/reposicion", label: "Lista de reposición" },
  { prefijo: "/alertas", label: "Alertas" },
  { prefijo: "/inventario/", label: "Ficha del insumo" },
  { prefijo: "/inventario", label: "Inventario", exacto: true },
  { prefijo: "/movimientos", label: "Historial de movimientos", exacto: true },
  { prefijo: "/reportes", label: "Reportes" },
];

export const VOLVER_POR_DEFECTO: DestinoVolver = { href: "/inventario", label: "Inventario" };

/**
 * Valida un destino de "volver" (parámetro `?volver=` o cabecera `Referer`):
 * solo rutas internas de las secciones conocidas; cualquier otra cosa (URL
 * externa, `//host`, rutas desconocidas) se descarta. Devuelve la ruta con su
 * consulta (para volver al listado con sus filtros) y la etiqueta a mostrar.
 */
export function validarVolver(valor: string | null | undefined): DestinoVolver | null {
  if (!valor || valor.length > 500 || !valor.startsWith("/") || valor.startsWith("//") || /[\\\u0000-\u001f]/.test(valor)) return null;
  const ruta = valor.split(/[?#]/)[0] ?? "";
  for (const origen of ORIGENES_VOLVER) {
    const coincide = origen.exacto
      ? ruta === origen.prefijo
      : origen.prefijo.endsWith("/")
        ? ruta.startsWith(origen.prefijo) && ruta.length > origen.prefijo.length
        : ruta === origen.prefijo || ruta.startsWith(`${origen.prefijo}/`);
    if (coincide) return { href: valor.split("#")[0] ?? valor, label: origen.label };
  }
  return null;
}

/**
 * Destino del enlace "volver" de una página a la que se llega desde varias
 * secciones. Prioridad: `?volver=/ruta` explícito, luego la página anterior
 * (`Referer` del mismo sitio) y, si no hay ninguno válido, `porDefecto`.
 */
export function resolverVolver(
  parametro: string | null | undefined,
  referer: string | null | undefined,
  host: string | null | undefined,
  porDefecto: DestinoVolver = VOLVER_POR_DEFECTO,
): DestinoVolver {
  const explicito = validarVolver(parametro);
  if (explicito) return explicito;
  if (referer && host) {
    try {
      const url = new URL(referer);
      if (url.host === host) {
        const previo = validarVolver(`${url.pathname}${url.search}`);
        if (previo) return previo;
      }
    } catch {
      // Referer malformado: se ignora.
    }
  }
  return porDefecto;
}
