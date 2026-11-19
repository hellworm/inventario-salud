/**
 * Fuente única de verdad de la autorización. La usan el servidor (servicios,
 * acciones, páginas) y la UI (para mostrar u ocultar navegación y botones).
 *
 * Ocultar un botón NUNCA reemplaza la validación en el servidor: todo servicio
 * llama a `verificarPermiso` con el actor y, si aplica, el centro.
 */

/**
 * Roles, de mayor a menor alcance:
 *  - ADMIN_RED: administrador de la red (operador de la plataforma). Todo.
 *  - ADMIN: administrador de institución. Todo, pero SOLO dentro de su institución.
 *  - BODEGUERO / VISITANTE: sus centros asignados.
 */
export const ROLES = ["ADMIN_RED", "ADMIN", "BODEGUERO", "VISITANTE"] as const;
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
  /** Ver el catálogo de administración y CREAR insumos y categorías nuevos. */
  "catalogo:crear",
  /** Editar, desactivar o eliminar insumos y categorías (compartidos por toda la red). */
  "catalogo:gestionar",
  "instituciones:gestionar",
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
  ADMIN_RED: new Set(PERMISOS),
  // Todo salvo lo que afecta a otras instituciones: modificar el catálogo
  // compartido y gestionar instituciones. El alcance (solo su institución) lo
  // validan los servicios con `actor.centroIds` y `actor.institucionId`.
  ADMIN: new Set(PERMISOS.filter((p) => p !== "catalogo:gestionar" && p !== "instituciones:gestionar")),
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
  ADMIN_RED: "Administrador de la red",
  ADMIN: "Administrador de institución",
  BODEGUERO: "Bodeguero",
  VISITANTE: "Visitante",
};

export const DESCRIPCION_ROL: Readonly<Record<Rol, string>> = {
  ADMIN_RED: "Gestiona toda la red: instituciones, catálogo, centros, usuarios y ajustes de stock.",
  ADMIN: "Gestiona su institución: sus centros, usuarios, parámetros y ajustes de stock.",
  BODEGUERO: "Registra ingresos y retiros en sus centros asignados.",
  VISITANTE: "Consulta inventario y alertas de sus centros (solo lectura).",
};

/**
 * Identidad mínima con la que se autoriza.
 *
 * `centroIds` es el ALCANCE de centros del actor, ya resuelto al construir la
 * sesión: los centros asignados (BODEGUERO, VISITANTE) o TODOS los centros de
 * su institución (ADMIN). Para ADMIN_RED se ignora (ve toda la red).
 */
export interface Actor {
  usuarioId: string;
  rol: Rol;
  /** Institución del usuario; `null` solo para ADMIN_RED. */
  institucionId: string | null;
  centroIds: readonly string[];
  /** IP de origen, solo para auditoría. */
  ip?: string | null;
}

/** ¿El rol tiene el permiso? (sin considerar centro ni institución). */
export function puede(rol: Rol, permiso: Permiso): boolean {
  return PERMISOS_POR_ROL[rol].has(permiso);
}

/** ¿El actor ve toda la red (todas las instituciones y centros)? Solo ADMIN_RED. */
export function veTodaLaRed(actor: Pick<Actor, "rol">): boolean {
  return actor.rol === "ADMIN_RED";
}

/** ¿Es administrador (de la red o de una institución)? */
export function esAdministrador(rol: Rol): boolean {
  return rol === "ADMIN_RED" || rol === "ADMIN";
}

/**
 * ¿Puede trabajar con "todos sus centros" a la vez (sin centro activo)?
 * ADMIN_RED → toda la red; ADMIN → toda su institución.
 */
export function puedeVerTodosSusCentros(actor: Pick<Actor, "rol">): boolean {
  return esAdministrador(actor.rol);
}

/** Nombre de la vista sin centro activo: "Toda la red" o "Toda mi institución". */
export function etiquetaAlcanceTotal(rol: Rol): string {
  return rol === "ADMIN_RED" ? "Toda la red" : "Toda mi institución";
}

/** Lo mismo dentro de una frase: "toda la red" o "toda tu institución". */
export function fraseAlcanceTotal(rol: Rol): string {
  return rol === "ADMIN_RED" ? "toda la red" : "toda tu institución";
}

/** ¿El actor pertenece al centro (o ve toda la red)? */
export function tieneAccesoACentro(
  actor: Pick<Actor, "rol" | "centroIds">,
  centroId: string,
): boolean {
  return veTodaLaRed(actor) || actor.centroIds.includes(centroId);
}

/** ¿El actor alcanza la institución? ADMIN_RED todas; los demás solo la propia. */
export function alcanzaInstitucion(
  actor: Pick<Actor, "rol" | "institucionId">,
  institucionId: string | null,
): boolean {
  if (veTodaLaRed(actor)) return true;
  return institucionId !== null && actor.institucionId === institucionId;
}

/**
 * Roles que el actor puede asignar al crear o editar usuarios. Un ADMIN de
 * institución NUNCA puede asignar ADMIN_RED.
 */
export function rolesAsignables(rol: Rol): readonly Rol[] {
  if (rol === "ADMIN_RED") return ROLES;
  if (rol === "ADMIN") return ["ADMIN", "BODEGUERO", "VISITANTE"];
  return [];
}

/** Rol + pertenencia al centro. Es la verificación completa. */
export function puedeEnCentro(
  actor: Pick<Actor, "rol" | "centroIds">,
  permiso: Permiso,
  centroId: string,
): boolean {
  return puede(actor.rol, permiso) && tieneAccesoACentro(actor, centroId);
}
