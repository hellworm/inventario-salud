/**
 * Piezas reutilizables para esquemas zod. Los esquemas son isomórficos: los
 * usan los formularios (cliente), las acciones y los servicios.
 */
import { z } from "zod";
import { parsearDia, type DiaISO } from "../fechas";
import { parsearNumero } from "../formato";
import { normalizarRut, validarRut } from "../chile/rut";

z.config(z.locales.es());

/** Identificador de una entidad. */
export const zId = z
  .string({ error: "Selecciona una opción" })
  .trim()
  .min(1, "Selecciona una opción")
  .max(40, "Identificador inválido");

export const zIdOpcional = z
  .string()
  .trim()
  .max(40)
  .nullish()
  .transform((v) => (v ? v : undefined));

/** Cantidad entera positiva. Acepta número o texto de un input. */
export const zCantidad = z.coerce
  .number<number | string>({ error: "Ingresa una cantidad válida" })
  .int("La cantidad debe ser un número entero")
  .positive("La cantidad debe ser mayor que cero")
  .max(1_000_000, "La cantidad es demasiado grande");

/** Entero ≥ 0 (stock mínimo, etc.). */
export const zEnteroNoNegativo = z.coerce
  .number<number | string>({ error: "Ingresa un número válido" })
  .int("Debe ser un número entero")
  .min(0, "No puede ser negativo")
  .max(10_000_000, "El valor es demasiado grande");

/** Texto obligatorio recortado. */
export function zTexto(maximo: number, mensajeVacio = "Este campo es obligatorio") {
  return z
    .string({ error: mensajeVacio })
    .trim()
    .min(1, mensajeVacio)
    .max(maximo, `Máximo ${maximo} caracteres`);
}

/** Texto opcional: "" y null se convierten en `undefined`. */
export function zTextoOpcional(maximo: number) {
  return z
    .string()
    .trim()
    .max(maximo, `Máximo ${maximo} caracteres`)
    .nullish()
    .transform((v) => (v ? v : undefined));
}

/** Día calendario obligatorio (`YYYY-MM-DD` o `dd-MM-yyyy`) → `YYYY-MM-DD`. */
export const zDia = z
  .string({ error: "Ingresa una fecha" })
  .trim()
  .refine((v) => parsearDia(v) !== null, "Fecha inválida")
  .transform((v): DiaISO => parsearDia(v) as DiaISO);

/** Día calendario opcional. */
export const zDiaOpcional = z
  .string()
  .trim()
  .nullish()
  .refine((v) => !v || parsearDia(v) !== null, "Fecha inválida")
  .transform((v): DiaISO | undefined => (v ? (parsearDia(v) as DiaISO) : undefined));

/** Monto opcional ≥ 0. Acepta número o texto con formato chileno ("1.250,50"). */
export const zMontoOpcional = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v, ctx): number | undefined => {
    if (v === null || v === undefined || v === "") return undefined;
    const n = typeof v === "number" ? v : parsearNumero(v);
    if (n === null || !Number.isFinite(n) || n < 0 || n > 99_999_999_999) {
      ctx.issues.push({ code: "custom", message: "Ingresa un monto válido", input: v });
      return z.NEVER;
    }
    return Math.round(n * 100) / 100;
  });

/** RUT chileno válido → forma canónica `76123456-7`. */
export const zRut = z
  .string({ error: "Ingresa el RUT" })
  .trim()
  .min(1, "Ingresa el RUT")
  .refine((v) => validarRut(v), "El RUT no es válido")
  .transform((v) => normalizarRut(v));

export const zEmail = z
  .string({ error: "Ingresa el email" })
  .trim()
  .toLowerCase()
  .pipe(z.email("Ingresa un email válido").max(254));

/** Página (≥ 1) para listados; valores inválidos caen en 1. */
export const zPagina = z.coerce.number<number | string | undefined>().int().min(1).catch(1);
