/**
 * Enlaces "alerta → acción": llevan al formulario de movimiento con el insumo,
 * la ubicación y el lote de la alerta ya elegidos.
 *
 * Mostrar el enlace depende de `puede(rol, permiso)`; el formulario y el
 * servicio vuelven a validar rol y centro.
 */
import { construirHref } from "@/lib/parametros-url";

/** Ubicación propuesta para ingresar stock en cada centro (ver `ubicacionesDeIngreso`). */
export type UbicacionPorCentro = Readonly<Record<string, string>>;

/**
 * Ubicación que se propone al ingresar un insumo faltante en un centro: la
 * única que tenga o, si hay varias, su primera bodega. Sin una opción clara no
 * se propone ninguna (el formulario la pide).
 */
export function ubicacionesDeIngreso(
  ubicaciones: readonly { id: string; centroId: string; tipo: string }[],
): UbicacionPorCentro {
  const porCentro = new Map<string, { id: string; tipo: string }[]>();
  for (const u of ubicaciones) {
    const lista = porCentro.get(u.centroId) ?? [];
    lista.push(u);
    porCentro.set(u.centroId, lista);
  }
  const salida: Record<string, string> = {};
  for (const [centroId, lista] of porCentro) {
    const elegida = lista.length === 1 ? lista[0] : lista.find((u) => u.tipo === "BODEGA");
    if (elegida) salida[centroId] = elegida.id;
  }
  return salida;
}

/** Ingresar el insumo que falta (permiso `movimientos:ingreso`). */
export function hrefIngresar(alerta: { insumoId: string; centroId: string }, ubicaciones: UbicacionPorCentro): string {
  return construirHref("/movimientos/ingreso", { insumo: alerta.insumoId, ubicacion: ubicaciones[alerta.centroId] });
}

/** Retirar primero el lote que está por vencer (permiso `movimientos:retiro`). */
export function hrefRetirar(alerta: { insumoId: string; ubicacionId: string; loteId: string }): string {
  return construirHref("/movimientos/retiro", { insumo: alerta.insumoId, ubicacion: alerta.ubicacionId, lote: alerta.loteId });
}

/** Dar de baja como merma un lote vencido (permiso `movimientos:merma`). */
export function hrefDarDeBaja(alerta: { insumoId: string; ubicacionId: string; loteId: string }): string {
  return construirHref("/movimientos/ajuste", {
    tipo: "merma",
    insumo: alerta.insumoId,
    ubicacion: alerta.ubicacionId,
    lote: alerta.loteId,
  });
}

/** Estilo de la acción de fila: compacta en escritorio, 44 px de alto en pantallas táctiles. */
export const CLASE_ACCION_FILA =
  "relative z-10 inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-control border border-borde-fuerte/70 bg-superficie px-3 text-sm font-medium whitespace-nowrap text-texto shadow-sm hover:border-marca-400 hover:bg-marca-50 hover:text-marca-800 pointer-coarse:min-h-11 max-md:min-h-11 [&_svg]:size-4 [&_svg]:shrink-0 md:max-xl:[&_svg]:hidden";
