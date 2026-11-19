import type { NextRequest } from "next/server";
import { leerFiltros } from "@/lib/filtros-reportes";
import { parametrosDe } from "@/lib/parametros-url";
import { responderCsv } from "@/server/respuesta-csv";
import {
  exportarConsumo,
  exportarExistencias,
  exportarMovimientos,
  exportarVencimientos,
} from "@/server/servicios";

/**
 * Descarga CSV de un reporte: /reportes/exportar/{existencias|movimientos|consumo|vencimientos|mermas}
 * con los mismos filtros de la vista previa. La sesión se valida aquí y el
 * permiso (`reportes:ver`) y el acceso al centro en el servicio, que además
 * registra la exportación en la auditoría.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/reportes/exportar/[reporte]">) {
  const { reporte } = await ctx.params;
  const f = leerFiltros(parametrosDe(request.nextUrl.searchParams));
  const centroId = f.centro ?? null;

  switch (reporte) {
    case "existencias":
      return responderCsv((actor) =>
        exportarExistencias(actor, { centroId, categoriaId: f.categoriaId, texto: f.texto }),
      );
    case "movimientos":
    case "mermas":
      return responderCsv((actor) =>
        exportarMovimientos(actor, {
          centroId,
          tipo: reporte === "mermas" ? "MERMA" : f.tipo,
          insumoId: f.insumoId,
          texto: f.texto,
          desde: f.desde,
          hasta: f.hasta,
        }),
      );
    case "consumo":
      return responderCsv((actor) =>
        exportarConsumo(actor, {
          centroId,
          categoriaId: f.categoriaId,
          texto: f.texto,
          desde: f.desde,
          hasta: f.hasta,
          orden: f.orden,
        }),
      );
    case "vencimientos":
      return responderCsv((actor) =>
        exportarVencimientos(actor, { centroId, categoriaId: f.categoriaId, texto: f.texto, dias: f.dias }),
      );
    default:
      return new Response("Reporte no encontrado.", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
  }
}
