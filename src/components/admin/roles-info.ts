import { ROLES, type Rol } from "@/lib/permisos";

/**
 * Explicación en lenguaje simple de lo que puede hacer cada rol. Debe
 * mantenerse coherente con la matriz de `src/lib/permisos.ts`.
 */
export const INFO_ROL: Readonly<Record<Rol, { resumen: string; puede: readonly string[]; noPuede: readonly string[] }>> = {
  ADMIN: {
    resumen: "Gestiona toda la red, sin restricción de centros.",
    puede: [
      "Ve y opera todos los centros",
      "Registra ingresos, retiros, traslados, ajustes y mermas",
      "Administra insumos, centros, proveedores y usuarios",
      "Consulta y exporta reportes; revisa la auditoría",
    ],
    noPuede: [],
  },
  BODEGUERO: {
    resumen: "Registra ingresos y retiros en sus centros.",
    puede: ["Registra ingresos y retiros en sus centros asignados", "Consulta inventario, alertas, historial de movimientos y proveedores"],
    noPuede: [
      "No ajusta stock, no da de baja (mermas) ni traslada",
      "No ve reportes, auditoría ni administración",
      "No ve centros que no tenga asignados",
    ],
  },
  VISITANTE: {
    resumen: "Solo consulta inventario y alertas de sus centros.",
    puede: ["Consulta inventario y alertas de sus centros asignados", "Imprime o descarga la lista de reposición"],
    noPuede: ["No registra ningún movimiento", "No ve el historial de movimientos, proveedores, reportes ni administración"],
  },
};

export const ROLES_ORDENADOS: readonly Rol[] = ROLES;
