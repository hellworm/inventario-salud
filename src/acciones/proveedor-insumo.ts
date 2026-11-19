"use server";

/**
 * Server Actions del proveedor de un insumo: el predeterminado de la red, el
 * preferido de una institución y la consulta del proveedor efectivo que usa el
 * formulario de ingreso para preseleccionarlo.
 */
import {
  esquemaProveedorInstitucion,
  esquemaProveedorRed,
  esquemaProveedorSugerido,
} from "@/lib/esquemas/proveedor-insumo";
import { accionSegura } from "@/server/accion-segura";
import { definirProveedorInstitucion, definirProveedorRed, proveedorEfectivoDeInsumo } from "@/server/servicios";

/** Proveedor predeterminado de la RED (solo quien puede modificar el catálogo compartido). */
export const definirProveedorRedAccion = accionSegura(
  { esquema: esquemaProveedorRed, permiso: "catalogo:gestionar" },
  ({ actor, datos }) => definirProveedorRed(actor, datos),
);

/** Proveedor preferido de una institución (el ADMIN, solo el de la suya; el servicio lo exige). */
export const definirProveedorInstitucionAccion = accionSegura(
  { esquema: esquemaProveedorInstitucion, permiso: "proveedores-insumo:gestionar" },
  ({ actor, datos }) => definirProveedorInstitucion(actor, datos),
);

export interface ProveedorSugerido {
  id: string;
  razonSocial: string;
  activo: boolean;
  origen: "INSTITUCION" | "RED";
}

/**
 * SOLO LECTURA: proveedor efectivo de un insumo para el centro de destino de un
 * ingreso (`null` = sin proveedor definido). No revalida.
 */
export const proveedorSugeridoAccion = accionSegura(
  { esquema: esquemaProveedorSugerido, permiso: "proveedores:ver", revalidar: false },
  async ({ actor, datos }): Promise<ProveedorSugerido | null> => {
    const p = await proveedorEfectivoDeInsumo(actor, datos.insumoId, { centroId: datos.centroId });
    return p ? { id: p.id, razonSocial: p.razonSocial, activo: p.activo, origen: p.origen } : null;
  },
);
