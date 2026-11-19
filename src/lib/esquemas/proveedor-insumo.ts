/** Esquemas del proveedor de un insumo (predeterminado de la red y preferido de una institución). */
import { z } from "zod";
import { zId, zIdOpcional } from "./base";

/** Proveedor a definir; vacío o `null` = quitarlo (sin proveedor / volver al de la red). */
const zProveedorONada = z
  .string()
  .trim()
  .max(40, "Identificador inválido.")
  .nullish()
  .transform((v) => (v ? v : null));

/** Define (o quita) el proveedor predeterminado de la RED para un insumo. */
export const esquemaProveedorRed = z.object({
  insumoId: zId,
  proveedorId: zProveedorONada,
});
export type EntradaProveedorRed = z.input<typeof esquemaProveedorRed>;

/**
 * Define (o quita) el proveedor preferido de una institución para un insumo.
 * `institucionId` solo lo indica el administrador de la red; para un
 * administrador de institución es siempre la suya. `proveedorId` vacío = volver
 * al predeterminado de la red.
 */
export const esquemaProveedorInstitucion = z.object({
  insumoId: zId,
  institucionId: zIdOpcional,
  proveedorId: zProveedorONada,
});
export type EntradaProveedorInstitucion = z.input<typeof esquemaProveedorInstitucion>;

/** Consulta de solo lectura: proveedor efectivo de un insumo en un centro (formulario de ingreso). */
export const esquemaProveedorSugerido = z.object({
  insumoId: zId,
  /** Centro de destino del ingreso; vacío = el alcance del usuario. */
  centroId: zIdOpcional,
});
export type EntradaProveedorSugerido = z.input<typeof esquemaProveedorSugerido>;

/** Valor de `?proveedor=` que filtra los insumos SIN proveedor definido. */
export const FILTRO_SIN_PROVEEDOR = "sin";
