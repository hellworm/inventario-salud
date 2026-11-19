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

export const esquemaExistenciasInsumo = z.object({
  insumoId: zId,
  /** Centro a consultar; vacío = todos los centros visibles del usuario. */
  centroId: zIdOpcional,
});
export type EntradaExistenciasInsumo = z.input<typeof esquemaExistenciasInsumo>;
