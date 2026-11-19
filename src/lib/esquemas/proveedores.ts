import { z } from "zod";
import { zId, zRut, zTexto, zTextoOpcional } from "./base";
import { zTelefonoOpcional } from "./centros";

/** Email opcional: vacío → `undefined`; si viene, en minúsculas y válido. */
const zEmailOpcional = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Máximo 254 caracteres.")
  .nullish()
  .refine((v) => !v || z.email().safeParse(v).success, "Ingresa un correo electrónico válido.")
  .transform((v) => (v ? v : undefined));

export const esquemaProveedor = z.object({
  rut: zRut,
  razonSocial: zTexto(140, "Ingresa la razón social."),
  contacto: zTextoOpcional(100),
  telefono: zTelefonoOpcional,
  email: zEmailOpcional,
});
export type EntradaProveedor = z.input<typeof esquemaProveedor>;
export type DatosProveedor = z.output<typeof esquemaProveedor>;

export const esquemaActualizarProveedor = esquemaProveedor.extend({ id: zId });
export type EntradaActualizarProveedor = z.input<typeof esquemaActualizarProveedor>;
