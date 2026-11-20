import { z } from "zod";
import { zId, zIdOpcional, zTexto, zTextoOpcional } from "./base";

/** Entero ≥ 0 opcional: "" / null / undefined → `undefined`. Acepta "1.200". */
const zEnteroOpcional = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v, ctx): number | undefined => {
    if (v === null || v === undefined) return undefined;
    const texto = typeof v === "number" ? String(v) : v.trim().replace(/\./g, "");
    if (texto === "") return undefined;
    const n = Number(texto);
    if (!/^\d+$/.test(texto) || !Number.isSafeInteger(n) || n > 10_000_000) {
      ctx.issues.push({ code: "custom", message: "Ingresa un número entero válido.", input: v });
      return z.NEVER;
    }
    return n;
  });

export const esquemaCategoria = z.object({
  nombre: zTexto(60, "Ingresa el nombre de la categoría."),
});
export type EntradaCategoria = z.input<typeof esquemaCategoria>;

export const esquemaActualizarCategoria = esquemaCategoria.extend({ id: zId });
export type EntradaActualizarCategoria = z.input<typeof esquemaActualizarCategoria>;

/** Caracteres admitidos en `Insumo.codigoBarras`. */
export const RE_CODIGO_BARRAS = /^[0-9A-Za-z-]+$/;

/** Asociar un código escaneado a un insumo existente (desde el flujo de escaneo). */
export const esquemaAsociarCodigoBarras = z.object({
  insumoId: zId,
  codigoBarras: zTexto(64, "Falta el código de barras.").refine(
    (v) => RE_CODIGO_BARRAS.test(v),
    "El código de barras solo admite letras, números y guiones.",
  ),
});
export type EntradaAsociarCodigoBarras = z.input<typeof esquemaAsociarCodigoBarras>;

export const esquemaInsumo = z.object({
  codigo: zTexto(30, "Ingresa el código del insumo.")
    .transform((v) => v.toUpperCase())
    .refine(
      (v) => /^[A-Z0-9Ñ][A-Z0-9Ñ._/-]*$/.test(v),
      "Usa solo letras, números, guiones o puntos (sin espacios).",
    ),
  nombre: zTexto(120, "Ingresa el nombre del insumo."),
  descripcion: zTextoOpcional(500),
  categoriaId: z.string({ error: "Selecciona una categoría." }).trim().min(1, "Selecciona una categoría.").max(40),
  unidadMedida: zTexto(30, "Selecciona la unidad de medida."),
  presentacion: zTextoOpcional(120),
  fabricante: zTextoOpcional(120),
  registroSanitario: zTextoOpcional(40),
  codigoBarras: zTextoOpcional(64).refine(
    (v) => v === undefined || RE_CODIGO_BARRAS.test(v),
    "El código de barras solo admite letras, números y guiones.",
  ),
  requiereCadenaFrio: z.boolean().default(false),
  controlaVencimiento: z.boolean().default(true),
  /** Proveedor predeterminado de la red para el insumo (opcional). Vacío = sin proveedor. */
  proveedorId: zIdOpcional,
});
export type EntradaInsumo = z.input<typeof esquemaInsumo>;
export type DatosInsumo = z.output<typeof esquemaInsumo>;

export const esquemaActualizarInsumo = esquemaInsumo.extend({
  id: zId,
  /**
   * Proveedor predeterminado de la red. Al EDITAR tiene tres estados: omitido
   * (`undefined`) = no se toca; `""` o `null` = quitarlo; un id = definirlo.
   */
  proveedorId: z
    .string()
    .trim()
    .max(40, "Identificador inválido.")
    .nullish()
    .transform((v) => (v === undefined ? undefined : v ? v : null)),
});
export type EntradaActualizarInsumo = z.input<typeof esquemaActualizarInsumo>;

/** Una fila por centro. Mínimo y máximo vacíos = sin parámetro para ese centro. */
export const esquemaParametrosStock = z.object({
  insumoId: zId,
  parametros: z
    .array(
      z
        .object({
          centroId: zId,
          stockMinimo: zEnteroOpcional,
          stockMaximo: zEnteroOpcional,
        })
        .refine((p) => p.stockMaximo === undefined || p.stockMaximo > 0, {
          path: ["stockMaximo"],
          message: "El máximo debe ser mayor que cero.",
        })
        .refine((p) => p.stockMaximo === undefined || p.stockMaximo >= (p.stockMinimo ?? 0), {
          path: ["stockMaximo"],
          message: "El máximo no puede ser menor que el mínimo.",
        }),
    )
    .max(500),
});
export type EntradaParametrosStock = z.input<typeof esquemaParametrosStock>;

/** Activar / desactivar cualquier entidad administrable. */
export const esquemaCambiarActivo = z.object({ id: zId, activo: z.boolean() });
export type EntradaCambiarActivo = z.input<typeof esquemaCambiarActivo>;

export const esquemaSoloId = z.object({ id: zId });
export type EntradaSoloId = z.input<typeof esquemaSoloId>;
