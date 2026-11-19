import "server-only";
import { Prisma } from "@prisma/client";
import { ErrorDominio } from "../errores";
import { POR_PAGINA_DEFECTO, POR_PAGINA_MAXIMO, type Paginado } from "@/lib/resultado";

/** Utilidades internas de los servicios de administración (no se exportan desde `index.ts`). */

export type FiltroEstado = "activos" | "inactivos" | "todos";

/** Traduce el filtro de estado a la condición sobre `activo`. */
export function condicionActivo(estado: FiltroEstado | null | undefined): { activo?: boolean } {
  if (estado === "activos") return { activo: true };
  if (estado === "inactivos") return { activo: false };
  return {};
}

export interface OpcionesPagina {
  pagina?: number | null;
  porPagina?: number | null;
}

/** Normaliza página y tamaño (por defecto 25, máximo 100). */
export function normalizarPagina(opciones: OpcionesPagina): { pagina: number; porPagina: number; saltar: number } {
  const porPagina = Math.min(Math.max(Math.trunc(Number(opciones.porPagina)) || POR_PAGINA_DEFECTO, 1), POR_PAGINA_MAXIMO);
  const pagina = Math.max(Math.trunc(Number(opciones.pagina)) || 1, 1);
  return { pagina, porPagina, saltar: (pagina - 1) * porPagina };
}

export function armarPaginado<T>(items: T[], total: number, pagina: number, porPagina: number): Paginado<T> {
  return { items, total, pagina, porPagina, totalPaginas: Math.max(1, Math.ceil(total / porPagina)) };
}

type Escalar = string | number | boolean | null;

/**
 * Diferencias entre dos versiones de un registro, para el detalle de
 * auditoría: `{ campo: { antes, despues } }`. `undefined` se trata como `null`.
 */
export function calcularCambios<T extends Record<string, Escalar | undefined>>(
  antes: T,
  despues: { [K in keyof T]?: Escalar | undefined },
): Record<string, { antes: Escalar; despues: Escalar }> {
  const cambios: Record<string, { antes: Escalar; despues: Escalar }> = {};
  for (const clave of Object.keys(despues)) {
    const a = antes[clave] ?? null;
    const d = despues[clave] ?? null;
    if (a !== d) cambios[clave] = { antes: a, despues: d };
  }
  return cambios;
}

/** Convierte el mapa de cambios en JSON válido para Prisma. */
export function comoJson(valor: Record<string, unknown>): Prisma.InputJsonObject {
  return valor as Prisma.InputJsonObject;
}

/**
 * Red de seguridad ante carreras: si dos solicitudes pasan la verificación
 * previa a la vez, la restricción UNIQUE de la base rechaza la segunda. Aquí
 * (fuera de la transacción) ese error se traduce a un `DUPLICADO` de campo.
 */
export async function conUnicidad<T>(trabajo: () => Promise<T>, mensaje: string, campo: string): Promise<T> {
  try {
    return await trabajo();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ErrorDominio("DUPLICADO", mensaje, { campo });
    }
    throw error;
  }
}

/** Patrón `%texto%` para ILIKE, escapando comodines. */
export function patronLike(texto: string): string {
  return `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
