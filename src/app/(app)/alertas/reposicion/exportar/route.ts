import type { NextRequest } from "next/server";
import { leerFiltros } from "@/lib/filtros-reportes";
import { leerOpcion, parametrosDe } from "@/lib/parametros-url";
import { responderCsv } from "@/server/respuesta-csv";
import { AGRUPACIONES_REPOSICION, exportarReposicion } from "@/server/servicios";

/**
 * Descarga CSV de la lista de reposición. Disponible para todo rol con
 * `alertas:ver`, pero solo con datos de sus centros: el servicio rechaza un
 * `?centro=` ajeno (403) y, sin centro, limita a los centros del usuario.
 */
export async function GET(request: NextRequest) {
  const sp = parametrosDe(request.nextUrl.searchParams);
  const f = leerFiltros(sp);
  // `?agrupar=proveedor` ordena las filas por proveedor (las columnas no cambian).
  const agrupar = leerOpcion(sp, "agrupar", AGRUPACIONES_REPOSICION);
  return responderCsv((actor) =>
    exportarReposicion(actor, { centroId: f.centro ?? null, categoriaId: f.categoriaId, texto: f.texto, agrupar }),
  );
}
