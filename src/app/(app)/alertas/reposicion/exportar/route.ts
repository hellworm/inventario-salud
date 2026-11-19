import type { NextRequest } from "next/server";
import { leerFiltros } from "@/lib/filtros-reportes";
import { parametrosDe } from "@/lib/parametros-url";
import { responderCsv } from "@/server/respuesta-csv";
import { exportarReposicion } from "@/server/servicios";

/**
 * Descarga CSV de la lista de reposición. Disponible para todo rol con
 * `alertas:ver`, pero solo con datos de sus centros: el servicio rechaza un
 * `?centro=` ajeno (403) y, sin centro, limita a los centros del usuario.
 */
export async function GET(request: NextRequest) {
  const f = leerFiltros(parametrosDe(request.nextUrl.searchParams));
  return responderCsv((actor) =>
    exportarReposicion(actor, { centroId: f.centro ?? null, categoriaId: f.categoriaId, texto: f.texto }),
  );
}
