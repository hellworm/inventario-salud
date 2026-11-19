/**
 * Filtros de /alertas y /reportes leídos desde la URL. Los usan las páginas
 * (vista previa) y los Route Handlers (CSV), así la descarga coincide con lo
 * que se ve en pantalla.
 *
 * Parámetros: `centro`, `categoria`, `q`, `desde`, `hasta` (YYYY-MM-DD),
 * `tipo` (TipoMovimiento), `insumo` (id), `semaforo` (rojo|amarillo|verde|vencido,
 * uno o varios separados por coma), `orden` (cobertura|consumo), `pagina`.
 */
import { leerSemaforo, TIPOS_MOVIMIENTO, type ColorSemaforo, type TipoMovimiento } from "./estados";
import { leerDia, leerOpcion, leerPagina, leerTexto, type ParametrosUrl } from "./parametros-url";

export const ORDENES_REPORTE_CONSUMO = ["cobertura", "consumo"] as const;

export interface FiltrosUrl {
  centro: string | undefined;
  categoriaId: string | undefined;
  texto: string | undefined;
  desde: string | undefined;
  hasta: string | undefined;
  tipo: TipoMovimiento | undefined;
  insumoId: string | undefined;
  /** Colores del semáforo pedidos (vacío = sin filtro). */
  semaforo: ColorSemaforo[];
  orden: (typeof ORDENES_REPORTE_CONSUMO)[number] | undefined;
  pagina: number | undefined;
}

export function leerFiltros(sp: ParametrosUrl): FiltrosUrl {
  return {
    centro: leerTexto(sp, "centro"),
    categoriaId: leerTexto(sp, "categoria"),
    texto: leerTexto(sp, "q"),
    desde: leerDia(sp, "desde"),
    hasta: leerDia(sp, "hasta"),
    tipo: leerOpcion(sp, "tipo", TIPOS_MOVIMIENTO),
    insumoId: leerTexto(sp, "insumo"),
    semaforo: leerSemaforo(leerTexto(sp, "semaforo")),
    orden: leerOpcion(sp, "orden", ORDENES_REPORTE_CONSUMO),
    pagina: leerPagina(sp, "pagina"),
  };
}
