import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Rol } from "@/lib/permisos";
import { registrarAuditoria } from "../auditoria";
import { db } from "../db";
import { ErrorDominio } from "../errores";
import {
  BLOQUEO_MS,
  DURACION_SESION_MS,
  INTERVALO_RENOVACION_MS,
  MAX_INTENTOS_FALLIDOS,
  VIDA_MAXIMA_SESION_MS,
} from "./constantes";
import { hashearPassword, validarPoliticaPassword, verificarPassword } from "./password";

/**
 * Núcleo de autenticación, independiente de Next (sin cookies): se puede
 * probar directamente. El manejo de cookies vive en `sesion.ts`.
 */

export interface MetaSolicitud {
  ip?: string | null;
  userAgent?: string | null;
}

export interface UsuarioSesion {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  debeCambiarPassword: boolean;
  /** Centros asignados (para ADMIN no limita el acceso). */
  centroIds: string[];
}

export interface SesionValida {
  sesionId: string;
  expiraEn: Date;
  usuario: UsuarioSesion;
}

/** Mensaje único: no revela si el email existe ni si la cuenta está bloqueada. */
export const MENSAJE_CREDENCIALES =
  "Email o contraseña incorrectos. Tras varios intentos fallidos la cuenta se bloquea por 15 minutos.";

// Hash de relleno para igualar tiempos cuando el email no existe.
let hashSenuelo: Promise<string> | undefined;
function obtenerHashSenuelo(): Promise<string> {
  hashSenuelo ??= hashearPassword(randomBytes(24).toString("hex"));
  return hashSenuelo;
}

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashearToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function credencialesInvalidas(): ErrorDominio {
  return new ErrorDominio("CREDENCIALES_INVALIDAS", MENSAJE_CREDENCIALES);
}

/**
 * Valida credenciales y crea una sesión. Devuelve el token en claro (solo
 * para la cookie); en BD queda únicamente su hash SHA-256.
 */
export async function iniciarSesion(
  email: string,
  password: string,
  meta: MetaSolicitud = {},
  ahora: Date = new Date(),
): Promise<{ token: string; expiraEn: Date; usuario: UsuarioSesion }> {
  const emailNormalizado = normalizarEmail(email);
  const usuario = await db.usuario.findUnique({
    where: { email: emailNormalizado },
    include: { centros: { select: { centroId: true } } },
  });

  if (!usuario) {
    await verificarPassword(await obtenerHashSenuelo(), password);
    await registrarAuditoria(db, { ip: meta.ip }, {
      accion: "LOGIN_FALLIDO",
      entidad: "Usuario",
      detalle: { motivo: "email_desconocido" },
    });
    throw credencialesInvalidas();
  }

  const actor = { usuarioId: usuario.id, ip: meta.ip };

  if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > ahora) {
    await verificarPassword(await obtenerHashSenuelo(), password);
    await registrarAuditoria(db, actor, {
      accion: "LOGIN_BLOQUEADO",
      entidad: "Usuario",
      entidadId: usuario.id,
    });
    throw credencialesInvalidas();
  }

  const passwordCorrecta = await verificarPassword(usuario.passwordHash, password);

  if (!passwordCorrecta || !usuario.activo) {
    if (!passwordCorrecta) {
      // Incremento atómico: intentos concurrentes no se pierden.
      const actualizado = await db.usuario.update({
        where: { id: usuario.id },
        data: { intentosFallidos: { increment: 1 } },
        select: { intentosFallidos: true },
      });
      if (actualizado.intentosFallidos >= MAX_INTENTOS_FALLIDOS) {
        await db.usuario.update({
          where: { id: usuario.id },
          data: { intentosFallidos: 0, bloqueadoHasta: new Date(ahora.getTime() + BLOQUEO_MS) },
        });
      }
    }
    await registrarAuditoria(db, actor, {
      accion: "LOGIN_FALLIDO",
      entidad: "Usuario",
      entidadId: usuario.id,
      detalle: { motivo: passwordCorrecta ? "usuario_inactivo" : "password_incorrecta" },
    });
    throw credencialesInvalidas();
  }

  const token = randomBytes(32).toString("base64url");
  const expiraEn = new Date(ahora.getTime() + DURACION_SESION_MS);

  await db.$transaction([
    db.sesion.create({
      data: {
        tokenHash: hashearToken(token),
        usuarioId: usuario.id,
        expiraEn,
        creadoEn: ahora,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
      },
    }),
    db.usuario.update({
      where: { id: usuario.id },
      data: { intentosFallidos: 0, bloqueadoHasta: null, ultimoAcceso: ahora },
    }),
    // Limpieza oportunista de sesiones vencidas del mismo usuario.
    db.sesion.deleteMany({ where: { usuarioId: usuario.id, expiraEn: { lt: ahora } } }),
  ]);
  await registrarAuditoria(db, actor, {
    accion: "LOGIN_OK",
    entidad: "Usuario",
    entidadId: usuario.id,
  });

  return {
    token,
    expiraEn,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      debeCambiarPassword: usuario.debeCambiarPassword,
      centroIds: usuario.centros.map((c) => c.centroId),
    },
  };
}

/**
 * Valida un token de sesión. Devuelve `null` si no existe, expiró, superó la
 * vida máxima o el usuario está inactivo. Aplica la expiración deslizante.
 */
export async function validarTokenSesion(
  token: string | undefined | null,
  ahora: Date = new Date(),
): Promise<SesionValida | null> {
  if (!token || token.length < 20 || token.length > 200) return null;

  const sesion = await db.sesion.findUnique({
    where: { tokenHash: hashearToken(token) },
    include: {
      usuario: { include: { centros: { select: { centroId: true } } } },
    },
  });
  if (!sesion) return null;

  const venceAbsoluto = sesion.creadoEn.getTime() + VIDA_MAXIMA_SESION_MS;
  if (sesion.expiraEn <= ahora || venceAbsoluto <= ahora.getTime() || !sesion.usuario.activo) {
    await db.sesion.deleteMany({ where: { id: sesion.id } });
    return null;
  }

  let expiraEn = sesion.expiraEn;
  const nuevaExpiracion = Math.min(ahora.getTime() + DURACION_SESION_MS, venceAbsoluto);
  if (nuevaExpiracion - sesion.expiraEn.getTime() > INTERVALO_RENOVACION_MS) {
    expiraEn = new Date(nuevaExpiracion);
    await db.sesion.updateMany({ where: { id: sesion.id }, data: { expiraEn } });
  }

  const u = sesion.usuario;
  return {
    sesionId: sesion.id,
    expiraEn,
    usuario: {
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      rol: u.rol,
      debeCambiarPassword: u.debeCambiarPassword,
      centroIds: u.centros.map((c) => c.centroId),
    },
  };
}

/** Cierra una sesión a partir de su token. */
export async function cerrarSesionPorToken(token: string | undefined | null): Promise<void> {
  if (!token) return;
  const eliminadas = await db.sesion.findUnique({
    where: { tokenHash: hashearToken(token) },
    select: { id: true, usuarioId: true },
  });
  if (!eliminadas) return;
  await db.sesion.deleteMany({ where: { id: eliminadas.id } });
  await registrarAuditoria(db, { usuarioId: eliminadas.usuarioId }, {
    accion: "LOGOUT",
    entidad: "Usuario",
    entidadId: eliminadas.usuarioId,
  });
}

/**
 * Invalida todas las sesiones de un usuario (opcionalmente conservando una).
 * Debe llamarse al desactivar un usuario, cambiarle el rol o resetear su clave.
 */
export async function invalidarSesionesDeUsuario(
  usuarioId: string,
  opciones: { exceptoSesionId?: string } = {},
): Promise<number> {
  const { count } = await db.sesion.deleteMany({
    where: {
      usuarioId,
      ...(opciones.exceptoSesionId ? { id: { not: opciones.exceptoSesionId } } : {}),
    },
  });
  return count;
}

/**
 * Cambia la contraseña del propio usuario. Verifica la actual, aplica la
 * política, apaga `debeCambiarPassword` y cierra las demás sesiones.
 */
export async function cambiarPassword(
  usuarioId: string,
  datos: { actual: string; nueva: string },
  opciones: { sesionActualId?: string; ip?: string | null } = {},
): Promise<void> {
  const usuario = await db.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario || !usuario.activo) {
    throw new ErrorDominio("NO_AUTENTICADO", "Tu sesión ya no es válida. Ingresa nuevamente.");
  }
  if (!(await verificarPassword(usuario.passwordHash, datos.actual))) {
    throw new ErrorDominio("PASSWORD_ACTUAL_INCORRECTA", "La contraseña actual no es correcta.", {
      campo: "actual",
    });
  }
  validarPoliticaPassword(datos.nueva);
  if (datos.nueva === datos.actual) {
    throw new ErrorDominio("PASSWORD_DEBIL", "La nueva contraseña debe ser distinta de la actual.", {
      campo: "nueva",
    });
  }
  if (datos.nueva.toLowerCase().includes(usuario.email.split("@")[0]!.toLowerCase())) {
    throw new ErrorDominio("PASSWORD_DEBIL", "La contraseña no puede contener tu nombre de usuario.", {
      campo: "nueva",
    });
  }

  const passwordHash = await hashearPassword(datos.nueva);
  await db.usuario.update({
    where: { id: usuarioId },
    data: { passwordHash, debeCambiarPassword: false, intentosFallidos: 0, bloqueadoHasta: null },
  });
  await invalidarSesionesDeUsuario(usuarioId, { exceptoSesionId: opciones.sesionActualId });
  await registrarAuditoria(db, { usuarioId, ip: opciones.ip }, {
    accion: "PASSWORD_CAMBIADA",
    entidad: "Usuario",
    entidadId: usuarioId,
  });
}
