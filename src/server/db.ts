import "server-only";
import { Prisma, PrismaClient } from "@prisma/client";

const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Cliente Prisma único (se reutiliza entre recargas en desarrollo). */
export const db: PrismaClient =
  globalParaPrisma.prisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG === "query" ? ["query", "warn", "error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") globalParaPrisma.prisma = db;

/** Cliente dentro de una transacción interactiva. */
export type Tx = Prisma.TransactionClient;

const CODIGOS_REINTENTABLES = new Set(["40001", "40P01"]);

function esReintentable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2034") return true;
    const codigoSql = (error.meta as { code?: string } | undefined)?.code;
    return codigoSql !== undefined && CODIGOS_REINTENTABLES.has(codigoSql);
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return /deadlock detected|could not serialize access/i.test(error.message);
  }
  return false;
}

/**
 * Ejecuta `trabajo` en una transacción (READ COMMITTED + bloqueos de fila
 * explícitos en los servicios). Reintenta ante interbloqueos o fallos de
 * serialización, que son transitorios.
 */
export async function enTransaccion<T>(trabajo: (tx: Tx) => Promise<T>, intentos = 3): Promise<T> {
  let ultimoError: unknown;
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      return await db.$transaction(trabajo, { maxWait: 10_000, timeout: 20_000 });
    } catch (error) {
      ultimoError = error;
      if (!esReintentable(error) || intento === intentos) throw error;
      await new Promise((resolver) => setTimeout(resolver, 25 * intento));
    }
  }
  throw ultimoError;
}
