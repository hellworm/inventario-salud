import "server-only";
import type { Prisma } from "@prisma/client";
import { db, type Tx } from "./db";

/** Acciones auditadas. Se amplía a medida que se agregan mutaciones. */
export type AccionAuditoria =
  | "LOGIN_OK"
  | "LOGIN_FALLIDO"
  | "LOGIN_BLOQUEADO"
  | "LOGOUT"
  | "PASSWORD_CAMBIADA"
  | "MOVIMIENTO_INGRESO"
  | "MOVIMIENTO_RETIRO"
  | "MOVIMIENTO_AJUSTE"
  | "MOVIMIENTO_MERMA"
  | "MOVIMIENTO_TRASLADO"
  | "LOTE_CREADO"
  | `${string}_CREADO`
  | `${string}_ACTUALIZADO`
  | `${string}_ELIMINADO`
  | `${string}_ACTIVADO`
  | `${string}_DESACTIVADO`
  | (string & {});

export interface EntradaAuditoria {
  accion: AccionAuditoria;
  /** Nombre del modelo afectado: "Movimiento", "Usuario", "Insumo"… */
  entidad: string;
  entidadId?: string | null;
  /** Datos relevantes del cambio. Nunca incluir contraseñas ni tokens. */
  detalle?: Prisma.InputJsonObject;
}

/**
 * Escribe un registro de auditoría. Dentro de una mutación se debe pasar el
 * `tx` de la transacción para que el registro sea atómico con el cambio.
 */
export async function registrarAuditoria(
  cliente: Tx | typeof db,
  actor: { usuarioId?: string | null; ip?: string | null } | null,
  entrada: EntradaAuditoria,
  creadoEn?: Date,
): Promise<void> {
  await cliente.registroAuditoria.create({
    data: {
      usuarioId: actor?.usuarioId ?? null,
      ip: actor?.ip ?? null,
      accion: entrada.accion,
      entidad: entrada.entidad,
      entidadId: entrada.entidadId ?? null,
      detalle: entrada.detalle ?? {},
      ...(creadoEn ? { creadoEn } : {}),
    },
  });
}
