"use server";

/**
 * Acciones de SOLO LECTURA para los formularios de movimientos (buscador de
 * insumos, existencias en vivo). No cambian datos, así que no revalidan.
 */
import { esquemaBuscarInsumos, esquemaBuscarPorCodigo, esquemaExistenciasInsumo } from "@/lib/esquemas/consultas";
import type { DiaISO } from "@/lib/fechas";
import { puede } from "@/lib/permisos";
import { accionSegura } from "@/server/accion-segura";
import { buscarInsumoPorCodigo, buscarInsumos, detalleInsumo, lotesDeInsumo, type ExistenciaDetalle } from "@/server/servicios";

/** Máximo de sugerencias del buscador de insumos. */
const LIMITE_SUGERENCIAS = 20;

export const buscarInsumosAccion = accionSegura(
  { esquema: esquemaBuscarInsumos, permiso: "catalogo:ver", revalidar: false },
  ({ actor, datos }) =>
    buscarInsumos(actor, {
      texto: datos.texto,
      limite: LIMITE_SUGERENCIAS,
      priorizarRetirosDeCentroId: datos.priorizarRetirosDeCentroId,
    }),
);

/**
 * Insumo de un código escaneado o escrito (GTIN, cadena GS1 o código propio).
 * La usan el escáner y los formularios; la autorización es la del catálogo.
 */
export const buscarPorCodigoAccion = accionSegura(
  { esquema: esquemaBuscarPorCodigo, permiso: "catalogo:ver", revalidar: false },
  ({ actor, datos }) => buscarInsumoPorCodigo(actor, datos.codigo),
);

export interface ExistenciasInsumo {
  insumoId: string;
  /** Lote × ubicación con stock > 0 (incluye vencidos), en orden FEFO. */
  existencias: ExistenciaDetalle[];
  /**
   * Lotes ya registrados del insumo (con o sin stock), más recientes primero.
   * Solo para quien puede registrar ingresos (`movimientos:ingreso`) y solo los
   * lotes que han pasado por sus centros; para los demás llega vacío.
   */
  lotesRegistrados: { loteId: string; numeroLote: string; fechaVencimiento: DiaISO | null }[];
}

export const existenciasInsumoAccion = accionSegura(
  { esquema: esquemaExistenciasInsumo, permiso: "inventario:ver", revalidar: false },
  async ({ actor, datos }): Promise<ExistenciasInsumo> => {
    const [detalle, lotesRegistrados] = await Promise.all([
      detalleInsumo(actor, datos.insumoId, { centroId: datos.centroId }),
      puede(actor.rol, "movimientos:ingreso") ? lotesDeInsumo(actor, datos.insumoId, 50) : [],
    ]);
    return { insumoId: datos.insumoId, existencias: detalle.existencias, lotesRegistrados };
  },
);
