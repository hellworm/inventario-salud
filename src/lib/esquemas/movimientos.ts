import { z } from "zod";
import {
  zCantidad,
  zClaveIdempotencia,
  zDiaOpcional,
  zId,
  zIdOpcional,
  zMontoOpcional,
  zTexto,
  zTextoOpcional,
} from "./base";

const zNumeroLote = z
  .string({ error: "Ingresa el número de lote" })
  .trim()
  .min(1, "Ingresa el número de lote")
  .max(60, "Máximo 60 caracteres")
  .transform((v) => v.toUpperCase());

export const esquemaIngreso = z.object({
  ubicacionId: zId,
  insumoId: zId,
  numeroLote: zNumeroLote,
  fechaVencimiento: zDiaOpcional,
  fechaFabricacion: zDiaOpcional,
  cantidad: zCantidad,
  proveedorId: zIdOpcional,
  documentoRef: zTextoOpcional(80),
  costoUnitario: zMontoOpcional,
  nota: zTextoOpcional(500),
  claveIdempotencia: zClaveIdempotencia,
});
export type EntradaIngreso = z.input<typeof esquemaIngreso>;
export type DatosIngreso = z.output<typeof esquemaIngreso>;

export const esquemaRetiro = z.object({
  ubicacionId: zId,
  insumoId: zId,
  cantidad: zCantidad,
  /** Sin lote: retiro automático FEFO (primero el que vence antes). */
  loteId: zIdOpcional,
  /** Destino o razón del retiro (p. ej. "Sala 2, turno mañana"). */
  motivo: zTextoOpcional(200),
  documentoRef: zTextoOpcional(80),
  nota: zTextoOpcional(500),
  claveIdempotencia: zClaveIdempotencia,
});
export type EntradaRetiro = z.input<typeof esquemaRetiro>;
export type DatosRetiro = z.output<typeof esquemaRetiro>;

export const esquemaAjuste = z.object({
  ubicacionId: zId,
  loteId: zId,
  sentido: z.enum(["POSITIVO", "NEGATIVO"], { error: "Indica si el ajuste suma o resta" }),
  cantidad: zCantidad,
  motivo: zTexto(200, "El motivo del ajuste es obligatorio"),
  nota: zTextoOpcional(500),
  claveIdempotencia: zClaveIdempotencia,
});
export type EntradaAjuste = z.input<typeof esquemaAjuste>;
export type DatosAjuste = z.output<typeof esquemaAjuste>;

export const esquemaMerma = z.object({
  ubicacionId: zId,
  loteId: zId,
  cantidad: zCantidad,
  motivo: zTexto(200, "El motivo de la merma es obligatorio"),
  nota: zTextoOpcional(500),
  claveIdempotencia: zClaveIdempotencia,
});
export type EntradaMerma = z.input<typeof esquemaMerma>;
export type DatosMerma = z.output<typeof esquemaMerma>;

export const esquemaTraslado = z
  .object({
    loteId: zId,
    ubicacionOrigenId: zId,
    ubicacionDestinoId: zId,
    cantidad: zCantidad,
    motivo: zTextoOpcional(200),
    nota: zTextoOpcional(500),
    claveIdempotencia: zClaveIdempotencia,
  })
  .refine((d) => d.ubicacionOrigenId !== d.ubicacionDestinoId, {
    path: ["ubicacionDestinoId"],
    message: "El destino debe ser distinto del origen",
  });
export type EntradaTraslado = z.input<typeof esquemaTraslado>;
export type DatosTraslado = z.output<typeof esquemaTraslado>;

/** Corrección administrativa del vencimiento de un lote (solo ADMIN). */
export const esquemaCorregirVencimientoLote = z.object({
  loteId: zId,
  /** Nueva fecha de vencimiento; vacío = el lote queda sin fecha. */
  fechaVencimiento: zDiaOpcional,
  motivo: zTexto(200, "Indica el motivo de la corrección"),
});
export type EntradaCorregirVencimientoLote = z.input<typeof esquemaCorregirVencimientoLote>;
export type DatosCorregirVencimientoLote = z.output<typeof esquemaCorregirVencimientoLote>;
