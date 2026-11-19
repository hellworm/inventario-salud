import { ROLES, type Rol } from "@/lib/permisos";

/**
 * Explicación en lenguaje simple de lo que puede hacer cada rol. Debe
 * mantenerse coherente con la matriz de `src/lib/permisos.ts`.
 */
export const INFO_ROL: Readonly<Record<Rol, { resumen: string; puede: readonly string[]; noPuede: readonly string[] }>> = {
  ADMIN_RED: {
    resumen: "Opera la plataforma: ve y gestiona todas las instituciones.",
    puede: [
      "Crea y administra instituciones, y a sus administradores",
      "Ve y opera todos los centros de todas las instituciones",
      "Edita el catálogo compartido de insumos y categorías",
      "Consulta reportes y auditoría de toda la red",
    ],
    noPuede: [],
  },
  ADMIN: {
    resumen: "Gestiona su institución completa, sin asignarle centros.",
    puede: [
      "Ve y opera todos los centros de su institución",
      "Registra ingresos, retiros, traslados, ajustes y mermas",
      "Administra los centros, ubicaciones y usuarios de su institución, y los proveedores",
      "Crea insumos nuevos y define mínimos y máximos de sus centros",
      "Consulta y exporta reportes y auditoría de su institución",
    ],
    noPuede: [
      "No ve nada de otras instituciones",
      "No edita ni desactiva insumos o categorías existentes (son de toda la red)",
      "No crea administradores de la red ni instituciones",
    ],
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
