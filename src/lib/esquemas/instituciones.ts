import { z } from "zod";
import { zEmail, zId, zTexto } from "./base";
import { zRutOpcional } from "./centros";

const campos = {
  nombre: zTexto(120, "Ingresa el nombre de la institución.").refine(
    (v) => v.length >= 3,
    "Ingresa el nombre de la institución.",
  ),
  rut: zRutOpcional,
};

/**
 * Primer administrador de la institución (opcional al crearla). Se crea con
 * rol ADMIN y una contraseña temporal que se muestra una sola vez.
 */
export const esquemaPrimerAdministrador = z.object({
  nombre: zTexto(100, "Ingresa el nombre y apellido.").refine((v) => v.length >= 3, "Ingresa el nombre y apellido."),
  email: zEmail,
});

export const esquemaInstitucion = z.object({
  ...campos,
  /** Si viene, se crea también el primer administrador de la institución. */
  administrador: esquemaPrimerAdministrador.nullish().transform((v) => v ?? undefined),
});
export type EntradaInstitucion = z.input<typeof esquemaInstitucion>;
export type DatosInstitucion = z.output<typeof esquemaInstitucion>;

export const esquemaActualizarInstitucion = z.object({ id: zId, ...campos });
export type EntradaActualizarInstitucion = z.input<typeof esquemaActualizarInstitucion>;
