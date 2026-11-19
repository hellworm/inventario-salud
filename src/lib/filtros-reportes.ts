/**
 * Filtros de /alertas y /reportes leídos desde la URL. Los usan las páginas
 * (vista previa) y los Route Handlers (CSV), así la descarga coincide con lo
 * que se ve en pantalla.
 *
 * Parámetros: `centro`, `categoria`, `q`, `desde`, `hasta` (YYYY-MM-DD),
 * `tipo` (TipoMovimiento), `insumo` (id), `dias` (30|60|90), `orden`
 * (cobertura|consumo), `pagina`.
 */
import { TIPOS_MOVIMIENTO, TRAMOS_VENCIMIENTO, type TipoMovimiento, type TramoVencimiento } from "./estados";
import { leerDia, leerEntero, leerOpcion, leerPagina, leerTexto, type ParametrosUrl } from "./parametros-url";

export const ORDENES_REPORTE_CONSUMO = ["cobertura", "consumo"] as const;

export interface FiltrosUrl {
  centro: string | undefined;
  categoriaId: string | undefined;
  texto: string | undefined;
  desde: string | undefined;
  hasta: string | undefined;
  tipo: TipoMovimiento | undefined;
  insumoId: string | undefined;
  dias: TramoVencimiento | undefined;
  orden: (typeof ORDENES_REPORTE_CONSUMO)[number] | undefined;
  pagina: number | undefined;
}

export function leerFiltros(sp: ParametrosUrl): FiltrosUrl {
  const dias = leerEntero(sp, "dias");
  return {
    centro: leerTexto(sp, "centro"),
    categoriaId: leerTexto(sp, "categoria"),
    texto: leerTexto(sp, "q"),
    desde: leerDia(sp, "desde"),
    hasta: leerDia(sp, "hasta"),
    tipo: leerOpcion(sp, "tipo", TIPOS_MOVIMIENTO),
    insumoId: leerTexto(sp, "insumo"),
    dias: TRAMOS_VENCIMIENTO.find((t) => t === dias),
    orden: leerOpcion(sp, "orden", ORDENES_REPORTE_CONSUMO),
    pagina: leerPagina(sp, "pagina"),
  };
}
