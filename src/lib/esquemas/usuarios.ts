import { z } from "zod";
import { ROLES, type Rol } from "../permisos";
import { zEmail, zId, zIdOpcional, zTexto } from "./base";

const campos = {
  nombre: zTexto(100, "Ingresa el nombre y apellido.").refine((v) => v.length >= 3, "Ingresa el nombre y apellido."),
  email: zEmail,
  rol: z.enum(ROLES, { error: "Selecciona un rol." }),
  /**
   * Institución del usuario. La elige el administrador de la red (obligatoria
   * salvo para el rol ADMIN_RED); para un administrador de institución el
   * servidor usa la suya y rechaza cualquier otra.
   */
  institucionId: zIdOpcional,
  /**
   * Centros asignados (deben ser de la institución del usuario). Para los
   * administradores se ignora: ADMIN_RED ve toda la red y ADMIN toda su institución.
   */
  centroIds: z.array(zId).max(200).default([]),
};

/** ¿El rol necesita centros asignados? (los administradores no). */
export function rolRequiereCentros(rol: Rol): boolean {
  return rol === "BODEGUERO" || rol === "VISITANTE";
}

function exigirCentros(datos: { rol: Rol; centroIds: string[] }, ctx: z.RefinementCtx): void {
  if (rolRequiereCentros(datos.rol) && datos.centroIds.length === 0) {
    ctx.addIssue({ code: "custom", path: ["centroIds"], message: "Asigna al menos un centro." });
  }
}

export const esquemaCrearUsuario = z.object(campos).superRefine(exigirCentros);
export type EntradaCrearUsuario = z.input<typeof esquemaCrearUsuario>;

export const esquemaActualizarUsuario = z.object({ id: zId, ...campos }).superRefine(exigirCentros);
export type EntradaActualizarUsuario = z.input<typeof esquemaActualizarUsuario>;
