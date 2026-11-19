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
  /**
   * Filas de datos. Para que el tope se pueda avisar, el servicio entrega como
   * máximo `MAXIMO_FILAS_EXPORTACION + 1`: `responderCsv` corta en el tope y
   * agrega la fila de aviso (`conAvisoDeTope`).
   */
  filas: AsyncIterable<CeldaCsv[]>;
  /** `true` si ya se sabe que hay más filas que el tope (se informa en la cabecera HTTP). */
  truncada?: boolean;
}

/** Tope de filas por archivo: protege al servidor y a Excel (límite ≈ 1.048.576). */
export const MAXIMO_FILAS_EXPORTACION = 200_000;

/** Descargas CSV por usuario y por minuto (ver `responderCsv`). */
export const MAXIMO_EXPORTACIONES_POR_MINUTO = 10;

/** Texto de la última fila de un archivo que alcanzó el tope. */
export function avisoDeTope(maximo: number = MAXIMO_FILAS_EXPORTACION): string {
  return `ATENCIÓN: archivo incompleto. Se alcanzó el máximo de ${maximo.toLocaleString("es-CL")} filas por exportación; hay más registros que no se incluyeron. Acota los filtros (período, centro, tipo) y vuelve a exportar.`;
}

/**
 * Entrega como máximo `maximo` filas; si la fuente trae más, termina con una
 * fila de aviso en vez de cortar en silencio.
 */
export async function* conAvisoDeTope(
  filas: AsyncIterable<CeldaCsv[]>,
  maximo: number = MAXIMO_FILAS_EXPORTACION,
): AsyncGenerator<CeldaCsv[]> {
  let entregadas = 0;
  for await (const fila of filas) {
    if (entregadas >= maximo) {
      yield [avisoDeTope(maximo)];
      return;
    }
    entregadas++;
    yield fila;
  }
}

/**
 * Deja constancia de la exportación en la auditoría ANTES de entregar datos:
 * quién, qué reporte y con qué filtros. Si `filtros.filas` supera el tope se
 * registra el tope y `truncada: true`.
 */
export async function auditarExportacion(
  actor: Actor,
  clave: ClaveExportacion,
  filtros: Prisma.InputJsonObject,
): Promise<void> {
  const filas = typeof filtros.filas === "number" ? filtros.filas : null;
  const truncada = filas !== null && filas > MAXIMO_FILAS_EXPORTACION;
  await registrarAuditoria(db, actor, {
    accion: "REPORTE_EXPORTADO",
    entidad: "Reporte",
    entidadId: clave,
    detalle: {
      formato: "csv",
      filtros: truncada ? { ...filtros, filas: MAXIMO_FILAS_EXPORTACION } : filtros,
      ...(truncada ? { truncada: true } : {}),
    },
  });
}
