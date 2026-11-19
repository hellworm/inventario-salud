import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Rol } from "@/lib/permisos";
import { registrarAuditoria, type AccionAuditoria } from "../auditoria";
import { db, enTransaccion } from "../db";
import { ErrorDominio } from "../errores";
import {
  claveLimite,
  consumirLimite,
  devolverIntento,
  liberarLimite,
  limpiarLimitesVencidos,
  sujetoDeEmail,
  type TipoLimite,
} from "../limitador";
import {
  BLOQUEO_MS,
  DIAS_IP_CONOCIDA,
  DURACION_SESION_MS,
  INTERVALO_RENOVACION_MS,
  MAX_AUDITORIA_LOGIN_POR_MINUTO,
  MAX_AUDITORIA_LOGIN_SIN_IP_POR_MINUTO,
  MAX_INTENTOS_FALLIDOS,
  MAX_INTENTOS_PASSWORD_ACTUAL,
  MAX_INTENTOS_POR_IP,
  PATRON_TOKEN_SESION,
  RETARDO_GLOBAL_BASE_MS,
  RETARDO_GLOBAL_MAXIMO_MS,
  UMBRAL_BLOQUEO_GLOBAL,
  VENTANA_LOGIN_IP_MS,
  VENTANA_PASSWORD_ACTUAL_MS,
  VIDA_MAXIMA_SESION_MS,
} from "./constantes";
import { LARGO_MAXIMO_USER_AGENT, type MetaSolicitud } from "./meta-solicitud";
import { hashearPassword, validarPoliticaPassword, verificarPassword } from "./password";

/**
 * Núcleo de autenticación, independiente de Next (sin cookies): se puede
 * probar directamente. El manejo de cookies vive en `sesion.ts`.
 *
 * Defensa contra fuerza bruta (todo persistente en BD, tabla `intentos_login`):
 *
 *  1. Por IP: `MAX_INTENTOS_POR_IP` intentos cada 5 min con cualquier email.
 *  2. Por par IP + email: `MAX_INTENTOS_FALLIDOS` fallos bloquean ESE par por
 *     `BLOQUEO_MS`. Un tercero, desde otra IP, no deja fuera al titular.
 *  3. Global por cuenta: recién tras `UMBRAL_BLOQUEO_GLOBAL` fallos seguidos
 *     (ataque distribuido) se aplica un retardo progresivo y acotado
 *     (30 s, 1 min, 2 min… máx. 15 min), y solo a las IP desde las que esa
 *     cuenta no ha entrado en los últimos 30 días: el titular, desde su IP
 *     habitual, sigue pudiendo ingresar.
 *
 * Los límites 1 y 2 se cuentan ANTES de verificar la contraseña (argon2 es
 * caro). Todos responden con el mismo mensaje genérico.
 *
 * Sin IP confiable (`TRUST_PROXY` apagado → `meta.ip` nulo) no se puede
 * distinguir al atacante del titular: el límite 1 no aplica y el 2 degrada a
 * un bloqueo por cuenta (5 fallos → 15 min), que es el comportamiento
 * histórico. Por eso en producción conviene publicar la aplicación detrás de
 * un proxy inverso y definir `TRUST_PROXY`.
 */

export type { MetaSolicitud } from "./meta-solicitud";

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

/** Mensaje único: no revela si el email existe, si hay bloqueo ni si una clave temporal venció. */
export const MENSAJE_CREDENCIALES =
  "Correo electrónico o contraseña incorrectos. Tras varios intentos fallidos el acceso se bloquea temporalmente.";

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

/** Tipo e identificador del contador "par" de un intento (por cuenta si no hay IP). */
function contadorDePar(ip: string | null, email: string): { tipo: TipoLimite; identificador: string } {
  return ip ? { tipo: "LOGIN_PAR", identificador: `${ip}|${email}` } : { tipo: "LOGIN_CUENTA", identificador: email };
}

/**
 * Audita un intento fallido o bloqueado SIN dejar que una ráfaga inunde la
 * bitácora: por IP se escriben como máximo N registros por minuto; el resto se
 * cuenta y se resume en un único `LOGIN_FALLIDO_AGREGADO` (al empezar la
 * ventana siguiente o en `sesiones:limpiar`).
 *
 * `siempre` fuerza el registro aunque se haya superado el tope: se usa para el
 * PRIMER rechazo de cada bloqueo (una vez por ventana), que es la señal que el
 * administrador necesita ver.
 */
async function auditarFalloLogin(
  accion: AccionAuditoria,
  actor: { usuarioId?: string | null; ip: string | null },
  entidadId: string | null,
  motivo: string,
  ahora: Date,
  siempre = false,
): Promise<void> {
  const maximo = actor.ip ? MAX_AUDITORIA_LOGIN_POR_MINUTO : MAX_AUDITORIA_LOGIN_SIN_IP_POR_MINUTO;
  const estado = await consumirLimite(
    { tipo: "AUDITORIA_LOGIN", identificador: actor.ip ?? "sin-ip", maximo, ventanaMs: 60_000, ip: actor.ip },
    ahora,
  );
  if (estado.cuentaAnterior > maximo) {
    await registrarAuditoria(db, { ip: actor.ip }, {
      accion: "LOGIN_FALLIDO_AGREGADO",
      entidad: "Usuario",
      detalle: { omitidos: estado.cuentaAnterior - maximo, ventanaSegundos: 60 },
    });
  }
  if (estado.excedido && !siempre) return;
  await registrarAuditoria(db, actor, { accion, entidad: "Usuario", entidadId, detalle: { motivo } });
}

/** ¿Esta cuenta inició sesión correctamente desde esta IP hace poco? */
async function esIpConocida(usuarioId: string, ip: string, ahora: Date): Promise<boolean> {
  const desde = new Date(ahora.getTime() - DIAS_IP_CONOCIDA * 86_400_000);
  const previo = await db.registroAuditoria.findFirst({
    where: { usuarioId, accion: "LOGIN_OK", ip, creadoEn: { gte: desde } },
    select: { id: true },
  });
  return previo !== null;
}

/** Retardo global tras `fallos` consecutivos (0 si aún no se alcanza el umbral). */
export function retardoGlobalMs(fallos: number): number {
  if (fallos < UMBRAL_BLOQUEO_GLOBAL) return 0;
  const exponente = Math.min(fallos - UMBRAL_BLOQUEO_GLOBAL, 10);
  return Math.min(RETARDO_GLOBAL_BASE_MS * 2 ** exponente, RETARDO_GLOBAL_MAXIMO_MS);
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
  const ip = meta.ip ?? null;
  const par = contadorDePar(ip, emailNormalizado);

  // 1) Límite por IP (cualquier email). Antes de tocar argon2.
  if (ip) {
    const porIp = await consumirLimite(
      { tipo: "LOGIN_IP", identificador: ip, maximo: MAX_INTENTOS_POR_IP, ventanaMs: VENTANA_LOGIN_IP_MS, ip },
      ahora,
    );
    if (porIp.excedido) {
      await auditarFalloLogin("LOGIN_BLOQUEADO", { ip }, null, "limite_ip", ahora, porIp.cuenta === MAX_INTENTOS_POR_IP + 1);
      throw credencialesInvalidas();
    }
  }

  // 2) Límite por par IP + email (o por cuenta si no hay IP). También antes de argon2.
  const porPar = await consumirLimite(
    {
      ...par,
      maximo: MAX_INTENTOS_FALLIDOS,
      ventanaMs: BLOQUEO_MS,
      sujeto: sujetoDeEmail(emailNormalizado),
      ip,
    },
    ahora,
  );

  const usuario = await db.usuario.findUnique({
    where: { email: emailNormalizado },
    include: { centros: { select: { centroId: true } } },
  });
  const actor = { usuarioId: usuario?.id ?? null, ip };

  if (porPar.excedido) {
    await auditarFalloLogin(
      "LOGIN_BLOQUEADO",
      actor,
      usuario?.id ?? null,
      ip ? "limite_ip_email" : "limite_cuenta",
      ahora,
      porPar.cuenta === MAX_INTENTOS_FALLIDOS + 1,
    );
    throw credencialesInvalidas();
  }

  if (!usuario) {
    await verificarPassword(await obtenerHashSenuelo(), password);
    await auditarFalloLogin("LOGIN_FALLIDO", actor, null, "email_desconocido", ahora);
    throw credencialesInvalidas();
  }

  // 3) Retardo global de la cuenta: no aplica a las IP habituales del titular.
  if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > ahora && !(ip && (await esIpConocida(usuario.id, ip, ahora)))) {
    await verificarPassword(await obtenerHashSenuelo(), password);
    await auditarFalloLogin("LOGIN_BLOQUEADO", actor, usuario.id, "bloqueo_cuenta", ahora);
    throw credencialesInvalidas();
  }

  const passwordCorrecta = await verificarPassword(usuario.passwordHash, password);

  if (!passwordCorrecta) {
    // Incremento atómico: intentos concurrentes no se pierden.
    const { intentosFallidos } = await db.usuario.update({
      where: { id: usuario.id },
      data: { intentosFallidos: { increment: 1 } },
      select: { intentosFallidos: true },
    });
    if (porPar.cuenta >= MAX_INTENTOS_FALLIDOS) {
      // Se agotaron los intentos del par: el bloqueo dura BLOQUEO_MS desde ESTE fallo.
      const hasta = new Date(ahora.getTime() + BLOQUEO_MS);
      await db.limiteIntentos.updateMany({
        where: { clave: claveLimite(par.tipo, par.identificador) },
        data: { expiraEn: hasta },
      });
      if (!ip) {
        // Sin IP el par ES la cuenta: se refleja en el usuario (lo ve el ADMIN).
        await db.usuario.update({ where: { id: usuario.id }, data: { intentosFallidos: 0, bloqueadoHasta: hasta } });
      }
    }
    if (ip) {
      const retardo = retardoGlobalMs(intentosFallidos);
      if (retardo > 0) {
        await db.usuario.update({
          where: { id: usuario.id },
          data: { bloqueadoHasta: new Date(ahora.getTime() + retardo) },
        });
      }
    }
    await auditarFalloLogin("LOGIN_FALLIDO", actor, usuario.id, "password_incorrecta", ahora);
    throw credencialesInvalidas();
  }

  if (!usuario.activo) {
    await auditarFalloLogin("LOGIN_FALLIDO", actor, usuario.id, "usuario_inactivo", ahora);
    throw credencialesInvalidas();
  }

  // Contraseña temporal vencida: mismo mensaje genérico; la restablece un ADMIN.
  if (usuario.debeCambiarPassword && usuario.passwordTemporalExpira && usuario.passwordTemporalExpira <= ahora) {
    await auditarFalloLogin("LOGIN_FALLIDO", actor, usuario.id, "password_temporal_vencida", ahora);
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
        ip,
        userAgent: meta.userAgent?.slice(0, LARGO_MAXIMO_USER_AGENT) ?? null,
      },
    }),
    db.usuario.update({
      where: { id: usuario.id },
      data: { intentosFallidos: 0, bloqueadoHasta: null, ultimoAcceso: ahora },
    }),
    // Limpieza oportunista de sesiones vencidas del mismo usuario.
    db.sesion.deleteMany({ where: { usuarioId: usuario.id, expiraEn: { lt: ahora } } }),
  ]);
  // Un ingreso correcto no consume cupo: se libera el par y se devuelve el intento de la IP.
  await liberarLimite(par.tipo, par.identificador);
  if (ip) await devolverIntento("LOGIN_IP", ip, ahora);
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
  if (!token || !PATRON_TOKEN_SESION.test(token)) return null;

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
 * Cambia la contraseña del propio usuario. Verifica la actual (con límite de
 * intentos: `MAX_INTENTOS_PASSWORD_ACTUAL` fallos cada 15 min), aplica la
 * política, apaga `debeCambiarPassword` y cierra las demás sesiones.
 *
 * El cambio, el cierre de sesiones y la auditoría ocurren en UNA transacción
 * que bloquea la fila del usuario: o se aplica todo o nada, y dos cambios
 * simultáneos no se pisan.
 */
export async function cambiarPassword(
  usuarioId: string,
  datos: { actual: string; nueva: string },
  opciones: { sesionActualId?: string; ip?: string | null; ahora?: Date } = {},
): Promise<void> {
  const ahora = opciones.ahora ?? new Date();
  const usuario = await db.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario || !usuario.activo) {
    throw new ErrorDominio("NO_AUTENTICADO", "Tu sesión ya no es válida. Ingresa nuevamente.");
  }
  if (usuario.debeCambiarPassword && usuario.passwordTemporalExpira && usuario.passwordTemporalExpira <= ahora) {
    throw new ErrorDominio(
      "OPERACION_INVALIDA",
      "Tu contraseña temporal venció. Pide a un administrador que la restablezca.",
    );
  }

  // Límite de intentos sobre la contraseña actual (una sesión robada no puede adivinarla a fuerza bruta).
  const intentos = await consumirLimite(
    {
      tipo: "PASSWORD_ACTUAL",
      identificador: usuarioId,
      maximo: MAX_INTENTOS_PASSWORD_ACTUAL,
      ventanaMs: VENTANA_PASSWORD_ACTUAL_MS,
      sujeto: sujetoDeEmail(usuario.email),
    },
    ahora,
  );
  if (intentos.excedido) {
    throw new ErrorDominio(
      "DEMASIADOS_INTENTOS",
      "Demasiados intentos con la contraseña actual. Espera unos minutos antes de volver a intentarlo.",
      { campo: "actual" },
    );
  }
  if (!(await verificarPassword(usuario.passwordHash, datos.actual))) {
    if (intentos.cuenta === MAX_INTENTOS_PASSWORD_ACTUAL) {
      await registrarAuditoria(db, { usuarioId, ip: opciones.ip }, {
        accion: "PASSWORD_CAMBIO_BLOQUEADO",
        entidad: "Usuario",
        entidadId: usuarioId,
        detalle: { motivo: "intentos_password_actual" },
      });
    }
    throw new ErrorDominio("PASSWORD_ACTUAL_INCORRECTA", "La contraseña actual no es correcta.", {
      campo: "actual",
    });
  }
  // La contraseña actual era correcta: ese intento no cuenta.
  await devolverIntento("PASSWORD_ACTUAL", usuarioId, ahora);

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
  await enTransaccion(async (tx) => {
    const [fila] = await tx.$queryRaw<{ passwordHash: string; activo: boolean }[]>(Prisma.sql`
      SELECT "passwordHash", "activo" FROM "usuarios" WHERE "id" = ${usuarioId} FOR UPDATE
    `);
    // Si entre la verificación y este punto la clave cambió (otro cambio o un
    // restablecimiento del ADMIN) o la cuenta se desactivó, no se pisa nada.
    if (!fila || !fila.activo || fila.passwordHash !== usuario.passwordHash) {
      throw new ErrorDominio("NO_AUTENTICADO", "Tu sesión ya no es válida. Ingresa nuevamente.");
    }
    await tx.usuario.update({
      where: { id: usuarioId },
      data: {
        passwordHash,
        debeCambiarPassword: false,
        passwordTemporalExpira: null,
        intentosFallidos: 0,
        bloqueadoHasta: null,
      },
    });
    await tx.sesion.deleteMany({
      where: { usuarioId, ...(opciones.sesionActualId ? { id: { not: opciones.sesionActualId } } : {}) },
    });
    await liberarLimite("PASSWORD_ACTUAL", usuarioId, tx);
    await registrarAuditoria(tx, { usuarioId, ip: opciones.ip }, {
      accion: "PASSWORD_CAMBIADA",
      entidad: "Usuario",
      entidadId: usuarioId,
    });
  });
}

/**
 * Mantenimiento del limitador (lo ejecuta `npm run sesiones:limpiar`): escribe
 * los resúmenes pendientes de fallos de inicio de sesión no auditados uno a
 * uno y borra los contadores vencidos.
 */
export async function limpiarIntentosVencidos(
  ahora: Date = new Date(),
): Promise<{ contadoresEliminados: number; resumenesEscritos: number }> {
  const resumenesEscritos = await enTransaccion(async (tx) => {
    const filas = await tx.$queryRaw<{ clave: string; ip: string | null; cuenta: number }[]>(Prisma.sql`
      SELECT "clave", "ip", "cuenta" FROM "intentos_login"
      WHERE "tipo" = 'AUDITORIA_LOGIN' AND "expiraEn" <= ${ahora}
      FOR UPDATE
    `);
    let escritos = 0;
    for (const fila of filas) {
      const maximo = fila.ip ? MAX_AUDITORIA_LOGIN_POR_MINUTO : MAX_AUDITORIA_LOGIN_SIN_IP_POR_MINUTO;
      if (fila.cuenta > maximo) {
        await registrarAuditoria(tx, { ip: fila.ip }, {
          accion: "LOGIN_FALLIDO_AGREGADO",
          entidad: "Usuario",
          detalle: { omitidos: fila.cuenta - maximo, ventanaSegundos: 60 },
        });
        escritos++;
      }
    }
    if (filas.length > 0) {
      await tx.limiteIntentos.deleteMany({ where: { clave: { in: filas.map((f) => f.clave) } } });
    }
    return escritos;
  });
  const contadoresEliminados = await limpiarLimitesVencidos(ahora);
  return { contadoresEliminados, resumenesEscritos };
}
