/**
 * Fuente única de verdad de la autorización. La usan el servidor (servicios,
 * acciones, páginas) y la UI (para mostrar u ocultar navegación y botones).
 *
 * Ocultar un botón NUNCA reemplaza la validación en el servidor: todo servicio
 * llama a `verificarPermiso` con el actor y, si aplica, el centro.
 */

export const ROLES = ["ADMIN", "BODEGUERO", "VISITANTE"] as const;
export type Rol = (typeof ROLES)[number];

export const PERMISOS = [
  // Lectura
  "panel:ver",
  "inventario:ver",
  "alertas:ver",
  "movimientos:ver",
  "catalogo:ver",
  "proveedores:ver",
  "reportes:ver",
  "auditoria:ver",
  // Movimientos de stock
  "movimientos:ingreso",
  "movimientos:retiro",
  "movimientos:ajuste",
  "movimientos:merma",
  "movimientos:traslado",
  // Administración
  "catalogo:gestionar",
  "centros:gestionar",
  "usuarios:gestionar",
  "proveedores:gestionar",
  "parametros:gestionar",
] as const;
export type Permiso = (typeof PERMISOS)[number];

const LECTURA_BASICA: readonly Permiso[] = [
  "panel:ver",
  "inventario:ver",
  "alertas:ver",
  "catalogo:ver",
];

/** Matriz de permisos por rol. */
export const PERMISOS_POR_ROL: Readonly<Record<Rol, ReadonlySet<Permiso>>> = {
  ADMIN: new Set(PERMISOS),
  BODEGUERO: new Set<Permiso>([
    ...LECTURA_BASICA,
    "movimientos:ver",
    "proveedores:ver",
    "movimientos:ingreso",
    "movimientos:retiro",
  ]),
  VISITANTE: new Set<Permiso>([...LECTURA_BASICA, "proveedores:ver"]),
};

export const NOMBRE_ROL: Readonly<Record<Rol, string>> = {
  ADMIN: "Administrador",
  BODEGUERO: "Bodeguero",
  VISITANTE: "Visitante",
};

export const DESCRIPCION_ROL: Readonly<Record<Rol, string>> = {
  ADMIN: "Gestiona toda la red: catálogo, centros, usuarios y ajustes de stock.",
  BODEGUERO: "Registra ingresos y retiros en sus centros asignados.",
  VISITANTE: "Consulta inventario y alertas de sus centros (solo lectura).",
};

/**
 * Identidad mínima con la que se autoriza. `centroIds` son los centros
 * asignados; para ADMIN se ignora (ve toda la red).
 */
export interface Actor {
  usuarioId: string;
  rol: Rol;
  centroIds: readonly string[];
  /** IP de origen, solo para auditoría. */
  ip?: string | null;
}

/** ¿El rol tiene el permiso? (sin considerar centro). */
export function puede(rol: Rol, permiso: Permiso): boolean {
  return PERMISOS_POR_ROL[rol].has(permiso);
}

/** ¿El actor ve toda la red (todos los centros)? */
export function veTodaLaRed(actor: Pick<Actor, "rol">): boolean {
  return actor.rol === "ADMIN";
}

/** ¿El actor pertenece al centro (o ve toda la red)? */
export function tieneAccesoACentro(
  actor: Pick<Actor, "rol" | "centroIds">,
  centroId: string,
): boolean {
  return veTodaLaRed(actor) || actor.centroIds.includes(centroId);
}

/** Rol + pertenencia al centro. Es la verificación completa. */
export function puedeEnCentro(
  actor: Pick<Actor, "rol" | "centroIds">,
  permiso: Permiso,
  centroId: string,
): boolean {
  return puede(actor.rol, permiso) && tieneAccesoACentro(actor, centroId);
}
