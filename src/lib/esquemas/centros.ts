import { z } from "zod";
import { NOMBRES_REGIONES } from "../chile/regiones";
import { normalizarRut, validarRut } from "../chile/rut";
import { TIPOS_CENTRO, TIPOS_UBICACION } from "../estados";
import { zId, zTexto, zTextoOpcional } from "./base";

/** RUT opcional: vacío → `undefined`; si viene, debe ser válido. */
export const zRutOpcional = z
  .string()
  .trim()
  .nullish()
  .refine((v) => !v || validarRut(v), "El RUT no es válido")
  .transform((v) => (v ? normalizarRut(v) : undefined));

/** Teléfono opcional: dígitos, espacios, +, guiones y paréntesis. */
export const zTelefonoOpcional = z
  .string()
  .trim()
  .max(30, "Máximo 30 caracteres")
  .nullish()
  .refine(
    (v) => !v || (/^[+()\d\s-]+$/.test(v) && v.replace(/\D/g, "").length >= 7),
    "Ingresa un teléfono válido, p. ej. +56 2 2345 6789",
  )
  .transform((v) => (v ? v : undefined));

export const esquemaCentro = z.object({
  nombre: zTexto(100, "Ingresa el nombre del centro"),
  tipo: z.enum(TIPOS_CENTRO, { error: "Selecciona el tipo de centro" }),
  rut: zRutOpcional,
  direccion: zTexto(160, "Ingresa la dirección"),
  region: z
    .string({ error: "Selecciona la región" })
    .trim()
    .refine((v) => NOMBRES_REGIONES.includes(v), "Selecciona la región"),
  comuna: zTexto(80, "Selecciona o escribe la comuna"),
  telefono: zTelefonoOpcional,
});
export type EntradaCentro = z.input<typeof esquemaCentro>;
export type DatosCentro = z.output<typeof esquemaCentro>;

export const esquemaActualizarCentro = esquemaCentro.extend({ id: zId });
export type EntradaActualizarCentro = z.input<typeof esquemaActualizarCentro>;

const camposUbicacion = {
  nombre: zTexto(80, "Ingresa el nombre de la ubicación"),
  tipo: z.enum(TIPOS_UBICACION, { error: "Selecciona el tipo de ubicación" }),
  descripcion: zTextoOpcional(200),
};

export const esquemaUbicacion = z.object({ centroId: zId, ...camposUbicacion });
export type EntradaUbicacion = z.input<typeof esquemaUbicacion>;

export const esquemaActualizarUbicacion = z.object({ id: zId, ...camposUbicacion });
export type EntradaActualizarUbicacion = z.input<typeof esquemaActualizarUbicacion>;
