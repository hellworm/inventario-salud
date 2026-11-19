"use server";

/**
 * Server Actions de movimientos de stock. EJEMPLO CANÓNICO: una acción es
 * solo `accionSegura` + llamada al servicio. Sin lógica de negocio aquí.
 */
import { esquemaIngreso, esquemaRetiro } from "@/lib/esquemas/movimientos";
import { accionSegura } from "@/server/accion-segura";
import { registrarIngreso, registrarRetiro } from "@/server/servicios";

export const registrarIngresoAccion = accionSegura(
  { esquema: esquemaIngreso, permiso: "movimientos:ingreso" },
  ({ actor, datos }) => registrarIngreso(actor, datos),
);

export const registrarRetiroAccion = accionSegura(
  { esquema: esquemaRetiro, permiso: "movimientos:retiro" },
  ({ actor, datos }) => registrarRetiro(actor, datos),
);
