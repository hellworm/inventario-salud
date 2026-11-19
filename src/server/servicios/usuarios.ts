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
import { hashearPassword, validarPoliticaPassword } from "../auth/password";
import { verificarPermiso } from "../autorizacion";
import { db, enTransaccion, type Tx } from "../db";
import { ErrorDominio, noEncontrado } from "../errores";
import { validar } from "../validacion";
import {
  armarPaginado,
  comoJson,
  condicionActivo,
  conUnicidad,
  normalizarPagina,
  type FiltroEstado,
  type OpcionesPagina,
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
  /** Bloqueada temporalmente por intentos fallidos. */
  bloqueado: boolean;
  bloqueadoHasta: Date | null;
  centros: { id: string; nombre: string }[];
}

export interface FiltrosUsuarios extends OpcionesPagina {
  texto?: string | null;
  rol?: Rol | null;
  estado?: FiltroEstado | null;
  centroId?: string | null;
}

/** Usuarios de la red con su rol, centros y estado. Permiso: `usuarios:gestionar`. */
export async function listarUsuarios(actor: Actor, filtros: FiltrosUsuarios = {}): Promise<Paginado<FilaUsuario>> {
  verificarPermiso(actor, "usuarios:gestionar");
  const { pagina, porPagina, saltar } = normalizarPagina(filtros);
  const texto = filtros.texto?.trim();
  const where: Prisma.UsuarioWhereInput = {
    ...condicionActivo(filtros.estado),
    ...(filtros.rol ? { rol: filtros.rol } : {}),
    ...(filtros.centroId ? { centros: { some: { centroId: filtros.centroId } } } : {}),
    ...(texto
      ? { OR: [{ nombre: { contains: texto, mode: "insensitive" } }, { email: { contains: texto, mode: "insensitive" } }] }
      : {}),
  };
  const ahora = new Date();
  const [total, filas] = await Promise.all([
    db.usuario.count({ where }),
    db.usuario.findMany({
      where,
      select: {
        id: true, nombre: true, email: true, rol: true, activo: true, debeCambiarPassword: true,
        ultimoAcceso: true, bloqueadoHasta: true,
        centros: { select: { centro: { select: { id: true, nombre: true } } }, orderBy: { centro: { nombre: "asc" } } },
      },
      orderBy: [{ activo: "desc" }, { nombre: "asc" }, { id: "asc" }],
      skip: saltar,
      take: porPagina,
    }),
  ]);
  return armarPaginado(
    filas.map(({ centros, bloqueadoHasta, ...u }) => {
      const bloqueado = bloqueadoHasta !== null && bloqueadoHasta > ahora;
      return { ...u, bloqueado, bloqueadoHasta: bloqueado ? bloqueadoHasta : null, centros: centros.map((c) => c.centro) };
    }),
    total,
    pagina,
    porPagina,
  );
}

// ---------------------------------------------------------------------------
// Mutaciones
// ---------------------------------------------------------------------------

const MENSAJE_EMAIL_DUPLICADO = "Ya existe un usuario con ese email.";

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
}

/**
 * Crea un usuario con una contraseña temporal aleatoria que deberá cambiar en
 * su primer ingreso. Permiso: `usuarios:gestionar`.
 */
export async function crearUsuario(actor: Actor, entrada: EntradaCrearUsuario): Promise<UsuarioConPasswordTemporal> {
  verificarPermiso(actor, "usuarios:gestionar");
  const datos = validar(esquemaCrearUsuario, entrada);
  const passwordTemporal = generarPasswordTemporal();
  validarPoliticaPassword(passwordTemporal);
  const passwordHash = await hashearPassword(passwordTemporal);

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
  return { ...usuario, passwordTemporal };
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
 * sesiones, quita cualquier bloqueo y lo obliga a cambiarla al ingresar.
 * Permiso: `usuarios:gestionar`.
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
      data: { passwordHash, debeCambiarPassword: true, intentosFallidos: 0, bloqueadoHasta: null },
    });
    const { count } = await tx.sesion.deleteMany({ where: { usuarioId } });
    await registrarAuditoria(tx, actor, {
      accion: "USUARIO_PASSWORD_RESTABLECIDA",
      entidad: "Usuario",
      entidadId: usuarioId,
      detalle: { nombre: actual.nombre, email: actual.email, sesionesCerradas: count },
    });
    return { id: actual.id, nombre: actual.nombre, email: actual.email };
  });
  return { ...usuario, passwordTemporal };
}

/**
 * Quita el bloqueo temporal por intentos fallidos (sin tocar la contraseña).
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
    if (usuario.bloqueadoHasta !== null || usuario.intentosFallidos > 0) {
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
