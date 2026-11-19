import { z } from "zod";
import { zEmail } from "./base";

export const LARGO_MINIMO_PASSWORD = 10;

export const esquemaLogin = z.object({
  email: zEmail,
  password: z.string({ error: "Ingresa tu contraseña" }).min(1, "Ingresa tu contraseña").max(128),
});
export type EntradaLogin = z.input<typeof esquemaLogin>;

export const esquemaCambiarPassword = z
  .object({
    actual: z.string({ error: "Ingresa tu contraseña actual" }).min(1, "Ingresa tu contraseña actual").max(128),
    nueva: z
      .string({ error: "Ingresa la nueva contraseña" })
      .min(LARGO_MINIMO_PASSWORD, `Debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres`)
      .max(128, "Máximo 128 caracteres"),
    confirmacion: z.string({ error: "Repite la nueva contraseña" }),
  })
  .refine((d) => d.nueva === d.confirmacion, {
    path: ["confirmacion"],
    message: "Las contraseñas no coinciden",
  });
export type EntradaCambiarPassword = z.input<typeof esquemaCambiarPassword>;
