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

/**
 * Entero escrito por una persona: un `number` entero o un texto SOLO de dígitos
 * (con signo opcional, para poder decir "no puede ser negativo"). A diferencia
 * de `z.coerce.number()`, no acepta lo que `Number()` convierte en silencio:
 * `"0x10"` (16), `"1e3"` (1000), `true` (1), `[5]` (5), `""` (0) o `" "`.
 */
function zEnteroEstricto(mensajes: { invalido: string; noEntero: string }) {
  return z.union([z.number(), z.string()], { error: mensajes.invalido }).transform((valor, ctx): number => {
    if (typeof valor === "number") {
      if (Number.isSafeInteger(valor)) return valor;
      ctx.issues.push({
        code: "custom",
        message: Number.isFinite(valor) ? mensajes.noEntero : mensajes.invalido,
        input: valor,
      });
      return z.NEVER;
    }
    const texto = valor.trim();
    if (/^-?\d{1,15}$/.test(texto)) return Number(texto);
    ctx.issues.push({
      code: "custom",
      message: /^-?\d{1,15}[.,]\d+$/.test(texto) ? mensajes.noEntero : mensajes.invalido,
      input: valor,
    });
    return z.NEVER;
  });
}

/** Cantidad entera positiva. Acepta un número entero o texto de dígitos de un input. */
export const zCantidad = zEnteroEstricto({
  invalido: "Ingresa una cantidad válida",
  noEntero: "La cantidad debe ser un número entero",
}).pipe(
  z
    .number()
    .int("La cantidad debe ser un número entero")
    .positive("La cantidad debe ser mayor que cero")
    .max(1_000_000, "La cantidad es demasiado grande"),
);

/** Entero ≥ 0 (stock mínimo, etc.). Mismas reglas de entrada que `zCantidad`. */
export const zEnteroNoNegativo = zEnteroEstricto({
  invalido: "Ingresa un número válido",
  noEntero: "Debe ser un número entero",
}).pipe(
  z
    .number()
    .int("Debe ser un número entero")
    .min(0, "No puede ser negativo")
    .max(10_000_000, "El valor es demasiado grande"),
);

/**
 * Clave de idempotencia opcional de una operación: un UUID que genera el
 * cliente al abrir el formulario. Reenviar la misma clave no duplica la
 * operación: se devuelve el resultado ya registrado. `""`/`null` = sin clave.
 */
export const zClaveIdempotencia = z
  .string()
  .trim()
  .max(36, "Clave de idempotencia inválida")
  .nullish()
  .transform((v) => (v ? v.toLowerCase() : undefined))
  .pipe(z.uuid("Clave de idempotencia inválida").optional());

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

/**
 * Genera una clave de idempotencia (UUID v4) en el navegador o en el servidor.
 * `crypto.randomUUID` solo existe en contextos seguros (HTTPS o localhost); si
 * falta, se arma el UUID con `crypto.getRandomValues`, que sí está disponible.
 */
export function nuevaClaveIdempotencia(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
