/** Esquemas de las acciones de solo lectura que alimentan los formularios de movimientos. */
import { z } from "zod";
import { zId, zIdOpcional, zTextoOpcional } from "./base";

export const esquemaBuscarInsumos = z.object({
  /** Nombre, código o código de barras. Vacío = primeros del catálogo. */
  texto: zTextoOpcional(120),
  /**
   * Opcional: centro cuyos retiros de los últimos 30 días ordenan las
   * sugerencias cuando no hay texto (lo más retirado primero).
   */
  priorizarRetirosDeCentroId: zIdOpcional,
});
export type EntradaBuscarInsumos = z.input<typeof esquemaBuscarInsumos>;

export const esquemaBuscarPorCodigo = z.object({
  /**
   * Lo leído por el escáner o escrito a mano: código de barras, GTIN o cadena
   * GS1 (puede traer el separador GS, ASCII 29). Máximo 300 caracteres.
   */
  codigo: z.string().min(1, "Escanea o escribe un código.").max(300, "El código es demasiado largo."),
});
export type EntradaBuscarPorCodigo = z.input<typeof esquemaBuscarPorCodigo>;

export const esquemaExistenciasInsumo = z.object({
  insumoId: zId,
  /** Centro a consultar; vacío = todos los centros visibles del usuario. */
  centroId: zIdOpcional,
});
export type EntradaExistenciasInsumo = z.input<typeof esquemaExistenciasInsumo>;
