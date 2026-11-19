import "server-only";
import type { Prisma } from "@prisma/client";
import type { CeldaCsv } from "@/lib/csv";
import type { Actor } from "@/lib/permisos";
import { registrarAuditoria } from "../auditoria";
import { db } from "../db";

/** Identificadores de las exportaciones CSV disponibles. */
export const EXPORTACIONES = [
  "reposicion",
  "existencias",
  "movimientos",
  "consumo",
  "vencimientos",
  "mermas",
] as const;
export type ClaveExportacion = (typeof EXPORTACIONES)[number];

/**
 * Una exportación lista para enviar: los encabezados y un generador de filas
 * (se consume por lotes para no cargar todo el resultado en memoria).
 */
export interface ExportacionCsv {
  /** Nombre del archivo, sin ruta (p. ej. `movimientos_2026-11-19.csv`). */
  archivo: string;
  encabezados: string[];
  filas: AsyncIterable<CeldaCsv[]>;
}

/** Tope de filas por archivo: protege al servidor y a Excel (límite ≈ 1.048.576). */
export const MAXIMO_FILAS_EXPORTACION = 200_000;

/**
 * Deja constancia de la exportación en la auditoría ANTES de entregar datos:
 * quién, qué reporte y con qué filtros.
 */
export async function auditarExportacion(
  actor: Actor,
  clave: ClaveExportacion,
  filtros: Prisma.InputJsonObject,
): Promise<void> {
  await registrarAuditoria(db, actor, {
    accion: "REPORTE_EXPORTADO",
    entidad: "Reporte",
    entidadId: clave,
    detalle: { formato: "csv", filtros },
  });
}
