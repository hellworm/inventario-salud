import "server-only";
import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  esquemaActualizarUsuario,
  esquemaCrearUsuario,
  type EntradaActualizarUsuario,
  type EntradaCrearUsuario,
} from "@/lib/esquemas/usuarios";
import type { Actor, Rol } from "@/lib/permisos";
import type { Paginado } from "@/lib/resultado";
import { registrarAuditoria } from "../auditoria";
import { MAX_INTENTOS_FALLIDOS, VIGENCIA_PASSWORD_TEMPORAL_MS } from "../auth/constantes";
import { hashearPassword, validarPoliticaPassword } from "../auth/password";
import { verificarPermiso } from "../autorizacion";
import { db, enTransaccion, type Tx } from "../db";
import { ErrorDominio, noEncontrado } from "../errores";
import { liberarSujeto, sujetoDeEmail, type TipoLimite } from "../limitador";
import { validar } from "../validacion";
import {
  armarPaginado,
  comoJson,
  condicionActivo,
  conUnicidad,
  normalizarPagina,
  patronLike,
  type FiltroEstado,
  type OpcionesPagina,
  textoDeBusqueda,
} from "./apoyo-admin";

// ---------------------------------------------------------------------------
// Salvaguardas
// ---------------------------------------------------------------------------

/**
 * Garantiza que, además de `usuarioId`, quede al menos otro ADMIN activo.
 * Bloquea las filas de los administradores activos (`FOR UPDATE`) para que
 * dos operaciones simultáneas no dejen la red sin administrador.
 */
async function exigirOtroAdminActivo(tx: Tx, usuarioId: string): Promise<void> {
  const admins = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "usuarios" WHERE "rol" = 'ADMIN' AND "activo" ORDER BY "id" FOR UPDATE
  `);
  if (!admins.some((a) => a.id !== usuarioId)) {
    throw new ErrorDominio(
      "OPERACION_INVALIDA",
      "Es el único administrador activo. La red debe tener siempre al menos un administrador: asigna otro antes de continuar.",
    );
  }
}

// Sin caracteres ambiguos (0/O, 1/l/I) para que se pueda dictar o copiar a mano.
const LETRAS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
const DIGITOS = "23456789";

/**
 * Contraseña temporal aleatoria (CSPRNG) con formato `Abcd-Efgh-2345-Jkmn`:
 * 16 caracteres útiles (~90 bits), siempre con letras y números.
 */
export function generarPasswordTemporal(): string {
  const alfabeto = LETRAS + DIGITOS;
  for (;;) {
    const caracteres = Array.from({ length: 16 }, () => alfabeto[randomInt(alfabeto.length)]!);
    if (!caracteres.some((c) => LETRAS.includes(c)) || !caracteres.some((c) => DIGITOS.includes(c))) continue;
    const grupos = [0, 4, 8, 12].map((i) => caracteres.slice(i, i + 4).join(""));
    return grupos.join("-");
  }
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export interface FilaUsuario {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  debeCambiarPassword: boolean;
  ultimoAcceso: Date | null;
  /**
   * Con algún bloqueo vigente por intentos fallidos: el retardo global de la
   * cuenta o el bloqueo de un par IP + email. «Desbloquear» quita ambos.
   */
  bloqueado: boolean;
  /** Fin del bloqueo vigente más largo. */
  bloqueadoHasta: Date | null;
  /** Vencimiento de la contraseña temporal pendiente (`null` si no aplica o no vence). */
  passwordTemporalExpira: Date | null;
  /** La contraseña temporal venció sin usarse: hay que restablecerla. */
  passwordTemporalVencida: boolean;
  centros: { id: string; nombre: string }[];
}

export interface FiltrosUsuarios extends OpcionesPagina {
  texto?: string | null;
  rol?: Rol | null;
  estado?: FiltroEstado | null;
  centroId?: string | null;
}

/** Contadores del limitador que representan un bloqueo de inicio de sesión de una cuenta. */
const TIPOS_BLOQUEO_LOGIN: readonly TipoLimite[] = ["LOGIN_PAR", "LOGIN_CUENTA"];

/**
 * Usuarios de la red con su rol, centros y estado. La búsqueda por nombre no
 * distingue tildes ni mayúsculas. Permiso: `usuarios:gestionar`.
 */
export async function listarUsuarios(actor: Actor, filtros: FiltrosUsuarios = {}): Promise<Paginado<FilaUsuario>> {
  verificarPermiso(actor, "usuarios:gestionar");
  const { pagina, porPagina, saltar } = normalizarPagina(filtros);
  const texto = textoDeBusqueda(filtros.texto);
  const where: Prisma.UsuarioWhereInput = {
    ...condicionActivo(filtros.estado),
    ...(filtros.rol ? { rol: filtros.rol } : {}),
    ...(filtros.centroId ? { centros: { some: { centroId: filtros.centroId } } } : {}),
  };
  if (texto) {
    // `unaccent` no existe en el cliente de Prisma: se resuelven los ids con SQL.
    const patron = patronLike(texto);
    const coincidencias = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id" FROM "usuarios"
      WHERE unaccent("nombre") ILIKE unaccent(${patron}) OR "email" ILIKE ${patron}
    `);
    where.id = { in: coincidencias.map((c) => c.id) };
  }
  const ahora = new Date();
  const [total, filas] = await Promise.all([
    db.usuario.count({ where }),
    db.usuario.findMany({
      where,
      select: {
        id: true, nombre: true, email: true, rol: true, activo: true, debeCambiarPassword: true,
        ultimoAcceso: true, bloqueadoHasta: true, passwordTemporalExpira: true,
        centros: { select: { centro: { select: { id: true, nombre: true } } }, orderBy: { centro: { nombre: "asc" } } },
      },
      orderBy: [{ activo: "desc" }, { nombre: "asc" }, { id: "asc" }],
      skip: saltar,
      take: porPagina,
    }),
  ]);
  // Bloqueos vigentes por par IP + email (o por cuenta, sin IP confiable).
  const sujetos = new Map(filas.map((f) => [sujetoDeEmail(f.email), f.id]));
  const bloqueosDePar = filas.length
    ? await db.limiteIntentos.findMany({
        where: {
          sujeto: { in: [...sujetos.keys()] },
          tipo: { in: [...TIPOS_BLOQUEO_LOGIN] },
          cuenta: { gte: MAX_INTENTOS_FALLIDOS },
          expiraEn: { gt: ahora },
        },
        select: { sujeto: true, expiraEn: true },
      })
    : [];
  const bloqueoPorUsuario = new Map<string, Date>();
  for (const b of bloqueosDePar) {
    const id = sujetos.get(b.sujeto ?? "");
    if (!id) continue;
    const previo = bloqueoPorUsuario.get(id);
    if (!previo || previo < b.expiraEn) bloqueoPorUsuario.set(id, b.expiraEn);
  }
  return armarPaginado(
    filas.map(({ centros, bloqueadoHasta, passwordTemporalExpira, ...u }) => {
      const hasta = [bloqueadoHasta, bloqueoPorUsuario.get(u.id) ?? null]
        .filter((d): d is Date => d !== null && d > ahora)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      const expira = u.debeCambiarPassword ? passwordTemporalExpira : null;
      return {
        ...u,
        bloqueado: hasta !== undefined,
        bloqueadoHasta: hasta ?? null,
        passwordTemporalExpira: expira,
        passwordTemporalVencida: expira !== null && expira <= ahora,
        centros: centros.map((c) => c.centro),
      };
    }),
    total,
    pagina,
    porPagina,
  );
}

// ---------------------------------------------------------------------------
// Mutaciones
// ---------------------------------------------------------------------------

const MENSAJE_EMAIL_DUPLICADO = "Ya existe un usuario con ese correo electrónico.";

async function exigirEmailLibre(tx: Tx, email: string, exceptoId?: string): Promise<void> {
  const existente = await tx.usuario.findUnique({ where: { email }, select: { id: true } });
  if (existente && existente.id !== exceptoId) {
    throw new ErrorDominio("DUPLICADO", MENSAJE_EMAIL_DUPLICADO, { campo: "email" });
  }
}

/** Valida que los centros existan y devuelve sus nombres (ordenados). */
async function resolverCentros(tx: Tx, rol: Rol, centroIds: readonly string[]): Promise<{ id: string; nombre: string }[]> {
  if (rol === "ADMIN") return []; // ve toda la red: no se guardan asignaciones
  const ids = [...new Set(centroIds)];
  const centros = await tx.centro.findMany({
    where: { id: { in: ids } },
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
  if (centros.length !== ids.length) {
    throw new ErrorDominio("NO_ENCONTRADO", "Alguno de los centros seleccionados ya no existe.", { campo: "centroIds" });
  }
  return centros;
}

export interface UsuarioConPasswordTemporal {
  id: string;
  nombre: string;
  email: string;
  /** Se entrega UNA sola vez; en la base solo queda su hash. */
  passwordTemporal: string;
  /** La contraseña temporal deja de servir en este instante (72 horas). */
  passwordTemporalExpira: Date;
}

/** Quita los bloqueos de inicio de sesión y de cambio de clave asociados a un email. */
function liberarBloqueosDeEmail(tx: Tx, email: string): Promise<number> {
  return liberarSujeto(sujetoDeEmail(email), tx, [...TIPOS_BLOQUEO_LOGIN, "PASSWORD_ACTUAL"]);
}

/**
 * Crea un usuario con una contraseña temporal aleatoria que deberá cambiar en
 * su primer ingreso. La contraseña temporal vence a las 72 horas: pasado ese
 * plazo hay que restablecerla. Permiso: `usuarios:gestionar`.
 */
export async function crearUsuario(actor: Actor, entrada: EntradaCrearUsuario): Promise<UsuarioConPasswordTemporal> {
  verificarPermiso(actor, "usuarios:gestionar");
  const datos = validar(esquemaCrearUsuario, entrada);
  const passwordTemporal = generarPasswordTemporal();
  validarPoliticaPassword(passwordTemporal);
  const passwordHash = await hashearPassword(passwordTemporal);
  const passwordTemporalExpira = new Date(Date.now() + VIGENCIA_PASSWORD_TEMPORAL_MS);

  const usuario = await conUnicidad(
    () =>
      enTransaccion(async (tx) => {
        await exigirEmailLibre(tx, datos.email);
        const centros = await resolverCentros(tx, datos.rol, datos.centroIds);
        const creado = await tx.usuario.create({
          data: {
            nombre: datos.nombre,
            email: datos.email,
            rol: datos.rol,
            passwordHash,
            debeCambiarPassword: true,
            passwordTemporalExpira,
            centros: { create: centros.map((c) => ({ centroId: c.id })) },
          },
          select: { id: true, nombre: true, email: true },
        });
        await registrarAuditoria(tx, actor, {
          accion: "USUARIO_CREADO",
          entidad: "Usuario",
          entidadId: creado.id,
          detalle: { nombre: creado.nombre, email: creado.email, rol: datos.rol, centros: centros.map((c) => c.nombre) },
        });
        return creado;
      }),
    MENSAJE_EMAIL_DUPLICADO,
    "email",
  );
  return { ...usuario, passwordTemporal, passwordTemporalExpira };
}

/**
 * Edita nombre, email, rol y centros de un usuario. Si cambian el rol o los
 * centros se cierran sus sesiones (vuelve a ingresar con el acceso nuevo).
 *
 * Salvaguardas: nadie puede quitarse a sí mismo el rol de administrador, y no
 * se puede degradar al último administrador activo.
 * Permiso: `usuarios:gestionar`.
 */
export async function actualizarUsuario(
  actor: Actor,
  entrada: EntradaActualizarUsuario,
): Promise<{ id: string; nombre: string; email: string; sesionesCerradas: number }> {
  verificarPermiso(actor, "usuarios:gestionar");
  const datos = validar(esquemaActualizarUsuario, entrada);
  if (datos.id === actor.usuarioId && datos.rol !== "ADMIN") {
    throw new ErrorDominio("OPERACION_INVALIDA", "No puedes quitarte a ti mismo el rol de administrador.", { campo: "rol" });
  }

  return conUnicidad(
    () =>
      enTransaccion(async (tx) => {
        const actual = await tx.usuario.findUnique({
          where: { id: datos.id },
          select: {
            id: true, nombre: true, email: true, rol: true, activo: true,
            centros: { select: { centro: { select: { id: true, nombre: true } } }, orderBy: { centro: { nombre: "asc" } } },
          },
        });
        if (!actual) throw noEncontrado("El usuario");
        if (actual.rol === "ADMIN" && actual.activo && datos.rol !== "ADMIN") {
          await exigirOtroAdminActivo(tx, actual.id);
        }
        await exigirEmailLibre(tx, datos.email, actual.id);
        const centros = await resolverCentros(tx, datos.rol, datos.centroIds);

        const centrosAntes = actual.centros.map((c) => c.centro);
        const cambiaCentros =
          centrosAntes.length !== centros.length || centrosAntes.some((c) => !centros.some((n) => n.id === c.id));
        const cambiaRol = actual.rol !== datos.rol;

        const cambios: Record<string, { antes: unknown; despues: unknown }> = {};
        if (actual.nombre !== datos.nombre) cambios.nombre = { antes: actual.nombre, despues: datos.nombre };
        if (actual.email !== datos.email) cambios.email = { antes: actual.email, despues: datos.email };
        if (cambiaRol) cambios.rol = { antes: actual.rol, despues: datos.rol };
        if (cambiaCentros) cambios.centros = { antes: centrosAntes.map((c) => c.nombre), despues: centros.map((c) => c.nombre) };
        if (Object.keys(cambios).length === 0) {
          return { id: actual.id, nombre: actual.nombre, email: actual.email, sesionesCerradas: 0 };
        }

        const usuario = await tx.usuario.update({
          where: { id: actual.id },
          data: {
            nombre: datos.nombre,
            email: datos.email,
            rol: datos.rol,
            ...(cambiaCentros
              ? { centros: { deleteMany: {}, create: centros.map((c) => ({ centroId: c.id })) } }
              : {}),
          },
          select: { id: true, nombre: true, email: true },
        });
        // El acceso cambió: sus sesiones abiertas dejan de valer (salvo la propia).
        const sesionesCerradas =
          (cambiaRol || cambiaCentros) && actual.id !== actor.usuarioId
            ? (await tx.sesion.deleteMany({ where: { usuarioId: actual.id } })).count
            : 0;
        await registrarAuditoria(tx, actor, {
          accion: "USUARIO_ACTUALIZADO",
          entidad: "Usuario",
          entidadId: actual.id,
          detalle: comoJson({ nombre: usuario.nombre, email: usuario.email, cambios }),
        });
        return { ...usuario, sesionesCerradas };
      }),
    MENSAJE_EMAIL_DUPLICADO,
    "email",
  );
}

/**
 * Activa o desactiva un usuario. Al desactivar se eliminan TODAS sus sesiones
 * en la misma transacción (queda fuera de inmediato).
 *
 * Es el ejemplo canónico de mutación administrativa: permiso → transacción →
 * cambio → auditoría. Salvaguardas: nadie se desactiva a sí mismo y nunca se
 * desactiva al último administrador activo. Permiso: `usuarios:gestionar`.
 */
export async function establecerUsuarioActivo(
  actor: Actor,
  usuarioId: string,
  activo: boolean,
): Promise<{ id: string; activo: boolean; sesionesCerradas: number }> {
  verificarPermiso(actor, "usuarios:gestionar");
  if (!activo && usuarioId === actor.usuarioId) {
    throw new ErrorDominio("OPERACION_INVALIDA", "No puedes desactivar tu propia cuenta.");
  }
  return enTransaccion(async (tx) => {
    const usuario = await tx.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, nombre: true, email: true, rol: true, activo: true },
    });
    if (!usuario) throw noEncontrado("El usuario");

    let sesionesCerradas = 0;
    if (usuario.activo !== activo) {
      if (!activo && usuario.rol === "ADMIN") await exigirOtroAdminActivo(tx, usuarioId);
      await tx.usuario.update({
        where: { id: usuarioId },
        data: { activo, ...(activo ? { intentosFallidos: 0, bloqueadoHasta: null } : {}) },
      });
      if (activo) await liberarBloqueosDeEmail(tx, usuario.email);
      await registrarAuditoria(tx, actor, {
        accion: activo ? "USUARIO_ACTIVADO" : "USUARIO_DESACTIVADO",
        entidad: "Usuario",
        entidadId: usuarioId,
        detalle: { nombre: usuario.nombre, email: usuario.email },
      });
    }
    if (!activo) {
      sesionesCerradas = (await tx.sesion.deleteMany({ where: { usuarioId } })).count;
    }
    return { id: usuarioId, activo, sesionesCerradas };
  });
}

/**
 * Genera una nueva contraseña temporal para otro usuario: cierra sus
 * sesiones, quita cualquier bloqueo y lo obliga a cambiarla al ingresar. La
 * nueva contraseña temporal vence a las 72 horas (es también la forma de
 * reemplazar una que venció sin usarse). Permiso: `usuarios:gestionar`.
 */
export async function restablecerPasswordUsuario(actor: Actor, usuarioId: string): Promise<UsuarioConPasswordTemporal> {
  verificarPermiso(actor, "usuarios:gestionar");
  if (usuarioId === actor.usuarioId) {
    throw new ErrorDominio(
      "OPERACION_INVALIDA",
      "Para cambiar tu propia contraseña usa la opción «Cambiar contraseña» del menú de usuario.",
    );
  }
  const passwordTemporal = generarPasswordTemporal();
  validarPoliticaPassword(passwordTemporal);
  const passwordHash = await hashearPassword(passwordTemporal);
  const passwordTemporalExpira = new Date(Date.now() + VIGENCIA_PASSWORD_TEMPORAL_MS);

  const usuario = await enTransaccion(async (tx) => {
    const actual = await tx.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, nombre: true, email: true, activo: true },
    });
    if (!actual) throw noEncontrado("El usuario");
    if (!actual.activo) {
      throw new ErrorDominio("INACTIVO", "El usuario está desactivado. Reactívalo antes de restablecer su contraseña.");
    }
    await tx.usuario.update({
      where: { id: usuarioId },
      data: { passwordHash, debeCambiarPassword: true, passwordTemporalExpira, intentosFallidos: 0, bloqueadoHasta: null },
    });
    await liberarBloqueosDeEmail(tx, actual.email);
    const { count } = await tx.sesion.deleteMany({ where: { usuarioId } });
    await registrarAuditoria(tx, actor, {
      accion: "USUARIO_PASSWORD_RESTABLECIDA",
      entidad: "Usuario",
      entidadId: usuarioId,
      detalle: { nombre: actual.nombre, email: actual.email, sesionesCerradas: count },
    });
    return { id: actual.id, nombre: actual.nombre, email: actual.email };
  });
  return { ...usuario, passwordTemporal, passwordTemporalExpira };
}

/**
 * Quita los bloqueos por intentos fallidos de una cuenta (sin tocar la
 * contraseña): el retardo global (`bloqueadoHasta` / `intentosFallidos`), los
 * bloqueos por par IP + email de TODAS las IP y el límite de intentos sobre la
 * contraseña actual. No toca el límite por IP (no pertenece a la cuenta).
 * Permiso: `usuarios:gestionar`.
 */
export async function desbloquearUsuario(actor: Actor, usuarioId: string): Promise<{ id: string }> {
  verificarPermiso(actor, "usuarios:gestionar");
  return enTransaccion(async (tx) => {
    const usuario = await tx.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, nombre: true, email: true, bloqueadoHasta: true, intentosFallidos: true },
    });
    if (!usuario) throw noEncontrado("El usuario");
    const contadores = await liberarBloqueosDeEmail(tx, usuario.email);
    if (usuario.bloqueadoHasta !== null || usuario.intentosFallidos > 0 || contadores > 0) {
      await tx.usuario.update({ where: { id: usuarioId }, data: { intentosFallidos: 0, bloqueadoHasta: null } });
      await registrarAuditoria(tx, actor, {
        accion: "USUARIO_DESBLOQUEADO",
        entidad: "Usuario",
        entidadId: usuarioId,
        detalle: { nombre: usuario.nombre, email: usuario.email },
      });
    }
    return { id: usuarioId };
  });
}
