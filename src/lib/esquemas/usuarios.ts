import { z } from "zod";
import { ROLES, type Rol } from "../permisos";
import { zEmail, zId, zTexto } from "./base";

const campos = {
  nombre: zTexto(100, "Ingresa el nombre y apellido").refine((v) => v.length >= 3, "Ingresa el nombre y apellido"),
  email: zEmail,
  rol: z.enum(ROLES, { error: "Selecciona un rol" }),
  /** Centros asignados. Para ADMIN se ignora (ve toda la red). */
  centroIds: z.array(zId).max(200).default([]),
};

function exigirCentros(datos: { rol: Rol; centroIds: string[] }, ctx: z.RefinementCtx): void {
  if (datos.rol !== "ADMIN" && datos.centroIds.length === 0) {
    ctx.addIssue({ code: "custom", path: ["centroIds"], message: "Asigna al menos un centro" });
  }
}

export const esquemaCrearUsuario = z.object(campos).superRefine(exigirCentros);
export type EntradaCrearUsuario = z.input<typeof esquemaCrearUsuario>;

export const esquemaActualizarUsuario = z.object({ id: zId, ...campos }).superRefine(exigirCentros);
export type EntradaActualizarUsuario = z.input<typeof esquemaActualizarUsuario>;
