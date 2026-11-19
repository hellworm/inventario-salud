"use server";

/**
 * Server Actions de movimientos de stock. EJEMPLO CANÓNICO: una acción es
 * solo `accionSegura` + llamada al servicio. Sin lógica de negocio aquí.
 *
 * Tras registrar, las acciones adjuntan el stock resultante del insumo en el
 * centro (`stock`) para que la confirmación diga "ahora hay 54". Es una
 * lectura posterior a la transacción: si fallara, el movimiento ya quedó
 * registrado y `stock` llega en `null` (nunca se informa un error falso).
 *
 * Todas aceptan `claveIdempotencia` (UUID opcional generado por el formulario
 * al montarse): si se reenvía la misma clave se devuelve el resultado ya
 * registrado, con `repetido: true`, sin duplicar el movimiento.
 */
import {
  esquemaAjuste,
  esquemaCorregirVencimientoLote,
  esquemaIngreso,
  esquemaMerma,
  esquemaRetiro,
  esquemaTraslado,
} from "@/lib/esquemas/movimientos";
import type { Actor } from "@/lib/permisos";
import { accionSegura } from "@/server/accion-segura";
import { registrarError } from "@/server/registro";
import {
  corregirVencimientoLote,
  detalleInsumo,
  registrarAjuste,
  registrarIngreso,
  registrarMerma,
  registrarRetiro,
  registrarTraslado,
} from "@/server/servicios";

/** Stock de un insumo justo después de un movimiento. */
export interface StockActual {
  /** Disponible (no vencido) del insumo en el centro del movimiento. */
  disponibleCentro: number;
  /** Unidades en lotes vencidos en ese centro. */
  vencidoCentro: number;
  /** Disponible (no vencido) en la ubicación del movimiento. */
  disponibleUbicacion: number;
}

async function stockActual(
  actor: Actor,
  insumoId: string,
  centroId: string,
  ubicacionId: string,
): Promise<StockActual | null> {
  try {
    const detalle = await detalleInsumo(actor, insumoId, { centroId });
    return {
      disponibleCentro: detalle.disponible,
      vencidoCentro: detalle.vencido,
      disponibleUbicacion: detalle.existencias
        .filter((e) => e.ubicacionId === ubicacionId && e.estadoVencimiento !== "VENCIDO")
        .reduce((s, e) => s + e.cantidad, 0),
    };
  } catch (error) {
    registrarError("accion", "No se pudo leer el stock posterior al movimiento.", error);
    return null;
  }
}

export const registrarIngresoAccion = accionSegura(
  { esquema: esquemaIngreso, permiso: "movimientos:ingreso" },
  async ({ actor, datos }) => {
    const resultado = await registrarIngreso(actor, datos);
    const { insumoId, centroId, ubicacionId } = resultado.movimiento;
    return { ...resultado, stock: await stockActual(actor, insumoId, centroId, ubicacionId) };
  },
);

export const registrarRetiroAccion = accionSegura(
  { esquema: esquemaRetiro, permiso: "movimientos:retiro" },
  async ({ actor, datos }) => {
    const resultado = await registrarRetiro(actor, datos);
    const primero = resultado.movimientos[0];
    const stock = primero
      ? await stockActual(actor, primero.insumoId, primero.centroId, primero.ubicacionId)
      : null;
    return { ...resultado, stock };
  },
);

export const registrarAjusteAccion = accionSegura(
  { esquema: esquemaAjuste, permiso: "movimientos:ajuste" },
  async ({ actor, datos }) => {
    const movimiento = await registrarAjuste(actor, datos);
    const { insumoId, centroId, ubicacionId } = movimiento;
    return { movimiento, stock: await stockActual(actor, insumoId, centroId, ubicacionId) };
  },
);

export const registrarMermaAccion = accionSegura(
  { esquema: esquemaMerma, permiso: "movimientos:merma" },
  async ({ actor, datos }) => {
    const movimiento = await registrarMerma(actor, datos);
    const { insumoId, centroId, ubicacionId } = movimiento;
    return { movimiento, stock: await stockActual(actor, insumoId, centroId, ubicacionId) };
  },
);

export const registrarTrasladoAccion = accionSegura(
  { esquema: esquemaTraslado, permiso: "movimientos:traslado" },
  ({ actor, datos }) => registrarTraslado(actor, datos),
);

/**
 * Corrige la fecha de vencimiento de un lote (solo administradores; auditado como
 * LOTE_ACTUALIZADO). Entrada: `{ loteId, fechaVencimiento?, motivo }`;
 * `fechaVencimiento` vacío deja el lote sin fecha. Devuelve
 * `{ loteId, numeroLote, fechaVencimientoAnterior, fechaVencimiento, cambiado }`.
 */
export const corregirVencimientoLoteAccion = accionSegura(
  { esquema: esquemaCorregirVencimientoLote, permiso: "movimientos:ajuste" },
  ({ actor, datos }) => corregirVencimientoLote(actor, datos),
);
