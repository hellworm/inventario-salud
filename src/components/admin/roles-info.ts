import { ROLES, type Rol } from "@/lib/permisos";

/**
 * Explicación en lenguaje simple de lo que puede hacer cada rol. Debe
 * mantenerse coherente con la matriz de `src/lib/permisos.ts`.
 */
export const INFO_ROL: Readonly<Record<Rol, { resumen: string; puede: readonly string[]; noPuede: readonly string[] }>> = {
  ADMIN: {
    resumen: "Acceso completo a toda la red.",
    puede: [
      "Ve y opera todos los centros",
      "Registra ingresos, retiros, traslados, ajustes y mermas",
      "Administra insumos, centros, proveedores y usuarios",
      "Consulta reportes y auditoría",
    ],
    noPuede: [],
  },
  BODEGUERO: {
    resumen: "Opera el día a día de sus centros.",
    puede: ["Registra ingresos y retiros en sus centros", "Consulta inventario, alertas e historial de movimientos"],
    noPuede: ["No hace traslados, ajustes ni mermas", "No ve otros centros ni la administración"],
  },
  VISITANTE: {
    resumen: "Solo consulta, sin modificar nada.",
    puede: ["Consulta inventario y alertas de sus centros"],
    noPuede: ["No registra movimientos", "No ve el historial ni la administración"],
  },
};

export const ROLES_ORDENADOS: readonly Rol[] = ROLES;
