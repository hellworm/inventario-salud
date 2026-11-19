/**
 * Rutas del flujo de escaneo. Lo leído por la cámara (o escrito) se interpreta
 * en el cliente con `@/lib/gs1` y viaja a `/movimientos/escanear` como
 * parámetros simples; el servidor los vuelve a validar uno por uno.
 */
import type { DiaISO } from "./fechas";
import { interpretarCodigo } from "./gs1";
import { construirHref } from "./parametros-url";

export const RUTA_ESCANEAR = "/movimientos/escanear";

export interface DatosEscaneo {
  /** Código del producto (EAN-13 / GTIN-14) o el texto leído. */
  codigo: string;
  lote?: string | null;
  vence?: DiaISO | null;
  fab?: DiaISO | null;
}

/**
 * Enlace a la pantalla que resuelve un código leído: si coincide con un insumo
 * redirige al ingreso prellenado; si no, ofrece buscarlo a mano. `null` si lo
 * leído no es un código utilizable.
 */
export function hrefEscaneo(textoLeido: string, extra: { ubicacion?: string | null } = {}): string | null {
  const codigo = interpretarCodigo(textoLeido);
  if (!codigo) return null;
  return construirHref(RUTA_ESCANEAR, {
    codigo: codigo.codigo,
    lote: codigo.lote,
    vence: codigo.vencimiento,
    fab: codigo.fabricacion,
    ubicacion: extra.ubicacion,
  });
}

/** Enlace al formulario de ingreso con el insumo y los datos del código ya puestos. */
export function hrefIngresoEscaneado(insumoId: string, datos: Omit<DatosEscaneo, "codigo"> & { ubicacion?: string | null }): string {
  return construirHref("/movimientos/ingreso", {
    insumo: insumoId,
    ubicacion: datos.ubicacion,
    lote: datos.lote,
    vence: datos.vence,
    fab: datos.fab,
    escaneado: "1",
  });
}
