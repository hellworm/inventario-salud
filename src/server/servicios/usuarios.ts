import "server-only";
import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  esquemaActualizarUsuario,
  esquemaCrearUsuario,
  type EntradaActualizarUsuario,
  type EntradaCrearUsuario,
} from "@/lib/esquemas/usuarios";
import { rolRequiereCentros } from "@/lib/esquemas/usuarios";
import { rolesAsignables, veTodaLaRed, type Actor, type Rol } from "@/lib/permisos";
import type { Paginado } from "@/lib/resultado";
import { registrarAuditoria } from "../auditoria";
import { MAX_INTENTOS_FALLIDOS, VIGENCIA_PASSWORD_TEMPORAL_MS } from "../auth/constantes";
import { hashearPassword, validarPoliticaPassword } from "../auth/password";
import { verificarInstitucion, verificarPermiso } from "../autorizacion";
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
 * Garantiza que, además de `usuarioId`, quede al menos otro ADMINISTRADOR DE
 * LA RED activo. Bloquea las filas de los administradores de la red activos
 * (`FOR UPDATE`) para que dos operaciones simultáneas no dejen la red sin
 * administrador.
 */
async function exigirOtroAdminActivo(tx: Tx, usuarioId: string): Promise<void> {
  const admins = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "usuarios" WHERE "rol" = 'ADMIN_RED' AND "activo" ORDER BY "id" FOR UPDATE
  `);
  if (!admins.some((a) => a.id !== usuarioId)) {
    throw new ErrorDominio(
      "OPERACION_INVALIDA",
      "Es el único administrador de la red activo. La red debe tener siempre al menos uno: asigna otro antes de continuar.",
    );
  }
}

/** Condición de alcance sobre `Usuario`: toda la red (ADMIN_RED) o la institución del actor. */
function usuariosDelAlcance(actor: Actor): Prisma.UsuarioWhereInput {
  if (veTodaLaRed(actor)) return {};
  return { institucionId: actor.institucionId ?? "__sin_institucion__" };
}

/**
 * Carga un usuario SOLO si el actor lo alcanza: un administrador de
 * institución no ve (ni puede tocar) usuarios de otra institución ni
 * administradores de la red; para él "no existen".
 */
function exigirUsuarioAlcanzable<T extends { institucionId: string | null }>(actor: Actor, usuario: T | null): T {
  if (!usuario) throw noEncontrado("El usuario");
  verificarInstitucion(actor, usuario.institucionId, "El usuario");
  return usuario;
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
  /** `null` solo para ADMIN_RED. */
  institucionId: string | null;
  institucion: string | null;
  centros: { id: string; nombre: string }[];
}

export interface FiltrosUsuarios extends OpcionesPagina {
  texto?: string | null;
  rol?: Rol | null;
  /** Solo tiene efecto dentro del alcance del actor. */
  institucionId?: string | null;
  estado?: FiltroEstado | null;
  centroId?: string | null;
}

/** Contadores del limitador que representan un bloqueo de inicio de sesión de una cuenta. */
const TIPOS_BLOQUEO_LOGIN: readonly TipoLimite[] = ["LOGIN_PAR", "LOGIN_CUENTA"];

/**
 * Usuarios del alcance del actor con su rol, centros y estado: toda la red
 * para ADMIN_RED; SOLO los de su institución para un ADMIN (no ve usuarios de
 * otras instituciones ni administradores de la red). La búsqueda por nombre no
 * distingue tildes ni mayúsculas. Permiso: `usuarios:gestionar`.
 */
export async function listarUsuarios(actor: Actor, filtros: FiltrosUsuarios = {}): Promise<Paginado<FilaUsuario>> {
  verificarPermiso(actor, "usuarios:gestionar");
  const { pagina, porPagina, saltar } = normalizarPagina(filtros);
  const texto = textoDeBusqueda(filtros.texto);
  const where: Prisma.UsuarioWhereInput = {
    ...condicionActivo(filtros.estado),
    AND: [usuariosDelAlcance(actor), ...(filtros.institucionId ? [{ institucionId: filtros.institucionId }] : [])],
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
        institucionId: true, institucion: { select: { nombre: true } },
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
    filas.map(({ centros, bloqueadoHasta, passwordTemporalExpira, institucion, ...u }) => {
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
        institucion: institucion?.nombre ?? null,
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

interface DestinoUsuario {
  /** `null` solo para ADMIN_RED. */
  institucion: { id: string; nombre: string } | null;
  centros: { id: string; nombre: string }[];
}

/**
 * Resuelve y AUTORIZA el rol, la institución y los centros que el actor quiere
 * dar a un usuario. Es el único lugar donde se decide esto:
 *
 *  - el rol debe ser asignable por el actor (un ADMIN nunca asigna ADMIN_RED);
 *  - ADMIN_RED no tiene institución ni centros;
 *  - los demás roles pertenecen a UNA institución que el actor alcance: un
 *    ADMIN solo la suya (si envía otra, "no existe"); el administrador de la
 *    red debe indicarla;
 *  - un usuario existente no cambia de institución (`institucionActual`);
 *  - los centros asignados deben existir y ser de ESA institución (un centro
 *    ajeno responde igual que uno inexistente). Un ADMIN no lleva asignaciones.
 */
async function resolverDestino(
  tx: Tx,
  actor: Actor,
  datos: { rol: Rol; institucionId?: string; centroIds: readonly string[] },
  opciones: { institucionActual?: string | null; exigirActiva: boolean },
): Promise<DestinoUsuario> {
  if (!rolesAsignables(actor.rol).includes(datos.rol)) {
    throw new ErrorDominio("SIN_PERMISO", "No tienes permiso para asignar ese rol.", { campo: "rol" });
  }
  if (datos.rol === "ADMIN_RED") return { institucion: null, centros: [] };

  let institucionId =
    datos.institucionId ?? opciones.institucionActual ?? (veTodaLaRed(actor) ? null : actor.institucionId);
  if (!institucionId && veTodaLaRed(actor) && rolRequiereCentros(datos.rol) && datos.centroIds.length > 0) {
    // El administrador de la red no indicó la institución: se deduce de los
    // centros asignados si todos son de la misma (más abajo se vuelve a validar).
    const deCentros = await tx.centro.findMany({
      where: { id: { in: [...datos.centroIds] } },
      select: { institucionId: true },
      distinct: ["institucionId"],
    });
    if (deCentros.length === 1) institucionId = deCentros[0]!.institucionId;
    else if (deCentros.length === 0) {
      throw new ErrorDominio("NO_ENCONTRADO", "Alguno de los centros seleccionados ya no existe.", { campo: "centroIds" });
    } else {
      throw new ErrorDominio(
        "VALIDACION",
        "Los centros seleccionados son de instituciones distintas: un usuario pertenece a una sola institución.",
        { campo: "centroIds" },
      );
    }
  }
  if (!institucionId) {
    throw new ErrorDominio("VALIDACION", "Selecciona la institución del usuario.", { campo: "institucionId" });
  }
  if (!veTodaLaRed(actor) && institucionId !== actor.institucionId) {
    throw new ErrorDominio("NO_ENCONTRADO", "La institución no existe.", { campo: "institucionId" });
  }
  if (opciones.institucionActual && opciones.institucionActual !== institucionId) {
    throw new ErrorDominio(
      "OPERACION_INVALIDA",
      "Un usuario no se puede mover a otra institución. Desactívalo y crea una cuenta nueva en la otra institución.",
      { campo: "institucionId" },
    );
  }
  const institucion = await tx.institucion.findUnique({
    where: { id: institucionId },
    select: { id: true, nombre: true, activo: true },
  });
  if (!institucion) throw new ErrorDominio("NO_ENCONTRADO", "La institución no existe.", { campo: "institucionId" });
  if (opciones.exigirActiva && !institucion.activo) {
    throw new ErrorDominio("INACTIVO", `La institución "${institucion.nombre}" está desactivada.`, { campo: "institucionId" });
  }

  if (!rolRequiereCentros(datos.rol)) return { institucion, centros: [] }; // ADMIN: toda su institución
  const ids = [...new Set(datos.centroIds)];
  const centros = await tx.centro.findMany({
    where: { id: { in: ids }, institucionId: institucion.id },
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
  if (centros.length !== ids.length) {
    throw new ErrorDominio(
      "NO_ENCONTRADO",
      "Alguno de los centros seleccionados no existe o no pertenece a la institución del usuario.",
      { campo: "centroIds" },
    );
  }
  return { institucion: { id: institucion.id, nombre: institucion.nombre }, centros };
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
 * plazo hay que restablecerla.
 *
 * Alcance (ver `resolverDestino`): un administrador de institución solo crea
 * usuarios de SU institución, con roles ADMIN, BODEGUERO o VISITANTE y centros
 * de su institución; nunca ADMIN_RED. Permiso: `usuarios:gestionar`.
 */
export async function crearUsuario(actor: Actor, entrada: EntradaCrearUsuario): Promise<UsuarioConPasswordTemporal> {
  verificarPermiso(actor, "usuarios:gestionar");
  const datos = validar(esquemaCrearUsuario, entrada);
  const temporal = await prepararPasswordTemporal();
  const usuario = await conUnicidad(
    () => enTransaccion((tx) => crearUsuarioEnTransaccion(tx, actor, datos, temporal)),
    MENSAJE_EMAIL_DUPLICADO,
    "email",
  );
  return { ...usuario, passwordTemporal: temporal.passwordTemporal, passwordTemporalExpira: temporal.passwordTemporalExpira };
}

export interface PasswordTemporalPreparada {
  passwordTemporal: string;
  passwordHash: string;
  passwordTemporalExpira: Date;
}

/** Genera una contraseña temporal y su hash (argon2: fuera de la transacción). */
export async function prepararPasswordTemporal(): Promise<PasswordTemporalPreparada> {
  const passwordTemporal = generarPasswordTemporal();
  validarPoliticaPassword(passwordTemporal);
  return {
    passwordTemporal,
    passwordHash: await hashearPassword(passwordTemporal),
    passwordTemporalExpira: new Date(Date.now() + VIGENCIA_PASSWORD_TEMPORAL_MS),
  };
}

/**
 * Núcleo de `crearUsuario` dentro de una transacción ya abierta (lo reutiliza
 * `crearInstitucion` para crear la institución y su primer administrador de
 * forma atómica). Aplica las mismas reglas de alcance (`resolverDestino`).
 * Uso interno de la capa de servicios: quien llama ya verificó
 * `usuarios:gestionar` y validó `datos` con `esquemaCrearUsuario`.
 */
export async function crearUsuarioEnTransaccion(
  tx: Tx,
  actor: Actor,
  datos: { nombre: string; email: string; rol: Rol; institucionId?: string; centroIds: readonly string[] },
  temporal: PasswordTemporalPreparada,
): Promise<{ id: string; nombre: string; email: string }> {
  verificarPermiso(actor, "usuarios:gestionar");
  // Primero la autorización: quien no puede asignar el rol o la institución
  // no llega a saber si el correo ya existe.
  const { institucion, centros } = await resolverDestino(tx, actor, datos, { exigirActiva: true });
  await exigirEmailLibre(tx, datos.email);
  const creado = await tx.usuario.create({
    data: {
      nombre: datos.nombre,
      email: datos.email,
      rol: datos.rol,
      institucionId: institucion?.id ?? null,
      passwordHash: temporal.passwordHash,
      debeCambiarPassword: true,
      passwordTemporalExpira: temporal.passwordTemporalExpira,
      centros: { create: centros.map((c) => ({ centroId: c.id })) },
    },
    select: { id: true, nombre: true, email: true },
  });
  await registrarAuditoria(tx, actor, {
    accion: "USUARIO_CREADO",
    entidad: "Usuario",
    entidadId: creado.id,
    institucionId: institucion?.id ?? null,
    detalle: {
      nombre: creado.nombre, email: creado.email, rol: datos.rol,
      institucion: institucion?.nombre ?? null, centros: centros.map((c) => c.nombre),
    },
  });
  return creado;
}

/**
 * Edita nombre, email, rol y centros de un usuario. Si cambian el rol o los
 * centros se cierran sus sesiones (vuelve a ingresar con el acceso nuevo).
 *
 * Alcance: un administrador de institución solo edita usuarios de SU
 * institución (los demás "no existen" para él), no puede asignar ADMIN_RED ni
 * centros de otra institución. Nadie cambia de institución.
 *
 * Salvaguardas: nadie puede cambiarse a sí mismo el rol, y no se puede
 * degradar al último administrador de la red activo.
 * Permiso: `usuarios:gestionar`.
 */
export async function actualizarUsuario(
  actor: Actor,
  entrada: EntradaActualizarUsuario,
): Promise<{ id: string; nombre: string; email: string; sesionesCerradas: number }> {
  verificarPermiso(actor, "usuarios:gestionar");
  const datos = validar(esquemaActualizarUsuario, entrada);
  if (datos.id === actor.usuarioId && datos.rol !== actor.rol) {
    throw new ErrorDominio("OPERACION_INVALIDA", "No puedes cambiar tu propio rol.", { campo: "rol" });
  }

  return conUnicidad(
    () =>
      enTransaccion(async (tx) => {
        const actual = exigirUsuarioAlcanzable(
          actor,
          await tx.usuario.findUnique({
            where: { id: datos.id },
            select: {
              id: true, nombre: true, email: true, rol: true, activo: true, institucionId: true,
              centros: { select: { centro: { select: { id: true, nombre: true } } }, orderBy: { centro: { nombre: "asc" } } },
            },
          }),
        );
        if (actual.id === actor.usuarioId && datos.rol !== actual.rol) {
          throw new ErrorDominio("OPERACION_INVALIDA", "No puedes cambiar tu propio rol.", { campo: "rol" });
        }
        const { institucion, centros } = await resolverDestino(tx, actor, datos, {
          institucionActual: actual.institucionId,
          exigirActiva: false,
        });
        if (actual.rol === "ADMIN_RED" && actual.activo && datos.rol !== "ADMIN_RED") {
          await exigirOtroAdminActivo(tx, actual.id);
        }
        await exigirEmailLibre(tx, datos.email, actual.id);

        const centrosAntes = actual.centros.map((c) => c.centro);
        const cambiaCentros =
          centrosAntes.length !== centros.length || centrosAntes.some((c) => !centros.some((n) => n.id === c.id));
        const cambiaRol = actual.rol !== datos.rol;
        const institucionNueva = institucion?.id ?? null;
        const cambiaInstitucion = actual.institucionId !== institucionNueva;

        const cambios: Record<string, { antes: unknown; despues: unknown }> = {};
        if (actual.nombre !== datos.nombre) cambios.nombre = { antes: actual.nombre, despues: datos.nombre };
        if (actual.email !== datos.email) cambios.email = { antes: actual.email, despues: datos.email };
        if (cambiaRol) cambios.rol = { antes: actual.rol, despues: datos.rol };
        if (cambiaInstitucion) cambios.institucion = { antes: actual.institucionId, despues: institucion?.nombre ?? null };
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
            institucionId: institucionNueva,
            ...(cambiaCentros
              ? { centros: { deleteMany: {}, create: centros.map((c) => ({ centroId: c.id })) } }
              : {}),
          },
          select: { id: true, nombre: true, email: true },
        });
        // El acceso cambió: sus sesiones abiertas dejan de valer (salvo la propia).
        const sesionesCerradas =
          (cambiaRol || cambiaCentros || cambiaInstitucion) && actual.id !== actor.usuarioId
            ? (await tx.sesion.deleteMany({ where: { usuarioId: actual.id } })).count
            : 0;
        await registrarAuditoria(tx, actor, {
          accion: "USUARIO_ACTUALIZADO",
          entidad: "Usuario",
          entidadId: actual.id,
          // El registro queda en la institución del usuario (la nueva si pasó de
          // administrador de la red a una institución).
          institucionId: institucionNueva ?? actual.institucionId,
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
 * desactiva al último administrador de la red activo. Un administrador de
 * institución solo alcanza usuarios de su institución.
 * Permiso: `usuarios:gestionar`.
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
    const usuario = exigirUsuarioAlcanzable(
      actor,
      await tx.usuario.findUnique({
        where: { id: usuarioId },
        select: { id: true, nombre: true, email: true, rol: true, activo: true, institucionId: true },
      }),
    );

    let sesionesCerradas = 0;
    if (usuario.activo !== activo) {
      if (!activo && usuario.rol === "ADMIN_RED") await exigirOtroAdminActivo(tx, usuarioId);
      await tx.usuario.update({
        where: { id: usuarioId },
        data: { activo, ...(activo ? { intentosFallidos: 0, bloqueadoHasta: null } : {}) },
      });
      if (activo) await liberarBloqueosDeEmail(tx, usuario.email);
      await registrarAuditoria(tx, actor, {
        accion: activo ? "USUARIO_ACTIVADO" : "USUARIO_DESACTIVADO",
        entidad: "Usuario",
        entidadId: usuarioId,
        institucionId: usuario.institucionId,
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
    const actual = exigirUsuarioAlcanzable(
      actor,
      await tx.usuario.findUnique({
        where: { id: usuarioId },
        select: { id: true, nombre: true, email: true, activo: true, institucionId: true },
      }),
    );
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
      institucionId: actual.institucionId,
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
    const usuario = exigirUsuarioAlcanzable(
      actor,
      await tx.usuario.findUnique({
        where: { id: usuarioId },
        select: { id: true, nombre: true, email: true, bloqueadoHasta: true, intentosFallidos: true, institucionId: true },
      }),
    );
    const contadores = await liberarBloqueosDeEmail(tx, usuario.email);
    if (usuario.bloqueadoHasta !== null || usuario.intentosFallidos > 0 || contadores > 0) {
      await tx.usuario.update({ where: { id: usuarioId }, data: { intentosFallidos: 0, bloqueadoHasta: null } });
      await registrarAuditoria(tx, actor, {
        accion: "USUARIO_DESBLOQUEADO",
        entidad: "Usuario",
        entidadId: usuarioId,
        institucionId: usuario.institucionId,
        detalle: { nombre: usuario.nombre, email: usuario.email },
      });
    }
    return { id: usuarioId };
  });
}
