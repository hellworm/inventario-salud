import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db, type Tx } from "./db";

/**
 * Limitador de intentos persistente (tabla `intentos_login`), de ventana fija.
 *
 * Vive en la base de datos, no en memoria: sobrevive a reinicios y funciona
 * igual con varias instancias de la aplicación. Cada consumo es UNA sentencia
 * atómica (`INSERT … ON CONFLICT DO UPDATE`): no hay carreras entre solicitudes
 * simultáneas.
 *
 * La clave se guarda como SHA-256 de `tipo|identificador`, de modo que en la
 * tabla no quedan emails ni contraseñas tecleadas por error en el campo email.
 * Las filas vencidas las borra `npm run sesiones:limpiar`.
 */

export type TipoLimite =
  | "LOGIN_IP"
  | "LOGIN_PAR"
  | "LOGIN_CUENTA"
  | "AUDITORIA_LOGIN"
  | "PASSWORD_ACTUAL"
  | "EXPORTACION";

export interface ReglaLimite {
  tipo: TipoLimite;
  /** Identificador dentro del tipo (IP, `ip|email`, id de usuario…). */
  identificador: string;
  /** Intentos permitidos por ventana. */
  maximo: number;
  ventanaMs: number;
  /** Agrupador para poder borrar los contadores de una cuenta (hash del email o id). */
  sujeto?: string | null;
  /** IP legible, solo informativa (resumen de auditoría). */
  ip?: string | null;
}

export interface EstadoLimite {
  /** Intentos contados en la ventana vigente (incluido este, si se consumió). */
  cuenta: number;
  /** `true` si la cuenta supera el máximo. */
  excedido: boolean;
  /** Fin de la ventana vigente. */
  expiraEn: Date;
  /** Cuenta de la ventana anterior si ESTA llamada la reinició; si no, 0. */
  cuentaAnterior: number;
}

function sha256(texto: string): string {
  return createHash("sha256").update(texto).digest("hex");
}

/** Clave almacenada de un contador. */
export function claveLimite(tipo: TipoLimite, identificador: string): string {
  return sha256(`${tipo}|${identificador}`);
}

/** Agrupador de los contadores asociados a un email (ver `liberarSujeto`). */
export function sujetoDeEmail(email: string): string {
  return `email:${sha256(email.trim().toLowerCase())}`;
}

/**
 * Cuenta un intento y dice si se superó el máximo. Atómico.
 * Si la ventana anterior ya venció, la reinicia (y devuelve su cuenta en
 * `cuentaAnterior`, una sola vez).
 */
export async function consumirLimite(
  regla: ReglaLimite,
  ahora: Date = new Date(),
  cliente: Tx | typeof db = db,
): Promise<EstadoLimite> {
  const clave = claveLimite(regla.tipo, regla.identificador);
  const expira = new Date(ahora.getTime() + regla.ventanaMs);
  const filas = await cliente.$queryRaw<{ cuenta: number; cuentaAnterior: number; expiraEn: Date }[]>(Prisma.sql`
    INSERT INTO "intentos_login" AS t
      ("clave", "tipo", "sujeto", "ip", "cuenta", "cuentaAnterior", "ventanaInicio", "expiraEn")
    VALUES (${clave}, ${regla.tipo}, ${regla.sujeto ?? null}, ${regla.ip ?? null}, 1, 0, ${ahora}, ${expira})
    ON CONFLICT ("clave") DO UPDATE SET
      "cuentaAnterior" = CASE WHEN t."expiraEn" <= ${ahora} THEN t."cuenta" ELSE 0 END,
      "cuenta" = CASE WHEN t."expiraEn" <= ${ahora} THEN 1 ELSE t."cuenta" + 1 END,
      "ventanaInicio" = CASE WHEN t."expiraEn" <= ${ahora} THEN ${ahora} ELSE t."ventanaInicio" END,
      "expiraEn" = CASE WHEN t."expiraEn" <= ${ahora} THEN ${expira} ELSE t."expiraEn" END
    RETURNING "cuenta", "cuentaAnterior", "expiraEn"
  `);
  const fila = filas[0]!;
  return {
    cuenta: fila.cuenta,
    excedido: fila.cuenta > regla.maximo,
    expiraEn: fila.expiraEn,
    cuentaAnterior: fila.cuentaAnterior,
  };
}

/** Consulta un contador sin consumirlo. */
export async function consultarLimite(
  regla: Pick<ReglaLimite, "tipo" | "identificador" | "maximo">,
  ahora: Date = new Date(),
): Promise<{ cuenta: number; excedido: boolean; expiraEn: Date | null }> {
  const fila = await db.limiteIntentos.findUnique({
    where: { clave: claveLimite(regla.tipo, regla.identificador) },
    select: { cuenta: true, expiraEn: true },
  });
  if (!fila || fila.expiraEn <= ahora) return { cuenta: 0, excedido: false, expiraEn: null };
  return { cuenta: fila.cuenta, excedido: fila.cuenta > regla.maximo, expiraEn: fila.expiraEn };
}

/** Devuelve un intento ya consumido (p. ej. un inicio de sesión que resultó correcto). */
export async function devolverIntento(
  tipo: TipoLimite,
  identificador: string,
  ahora: Date = new Date(),
): Promise<void> {
  await db.limiteIntentos.updateMany({
    where: { clave: claveLimite(tipo, identificador), cuenta: { gt: 0 }, expiraEn: { gt: ahora } },
    data: { cuenta: { decrement: 1 } },
  });
}

/** Borra un contador (p. ej. tras un inicio de sesión correcto). */
export async function liberarLimite(
  tipo: TipoLimite,
  identificador: string,
  cliente: Tx | typeof db = db,
): Promise<void> {
  await cliente.limiteIntentos.deleteMany({ where: { clave: claveLimite(tipo, identificador) } });
}

/** Borra todos los contadores de un sujeto. Devuelve cuántos había. */
export async function liberarSujeto(
  sujeto: string,
  cliente: Tx | typeof db = db,
  tipos?: readonly TipoLimite[],
): Promise<number> {
  const { count } = await cliente.limiteIntentos.deleteMany({
    where: { sujeto, ...(tipos ? { tipo: { in: [...tipos] } } : {}) },
  });
  return count;
}

/** Borra los contadores cuya ventana ya venció. Devuelve cuántos eran. */
export async function limpiarLimitesVencidos(ahora: Date = new Date()): Promise<number> {
  const { count } = await db.limiteIntentos.deleteMany({ where: { expiraEn: { lte: ahora } } });
  return count;
}
