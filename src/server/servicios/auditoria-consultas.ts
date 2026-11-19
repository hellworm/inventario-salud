import "server-only";
import type { Prisma } from "@prisma/client";
import { finDelDia, inicioDelDia, parsearDiaFiltro } from "@/lib/fechas";
import { NOMBRE_ROL, veTodaLaRed, type Actor } from "@/lib/permisos";
import type { Paginado } from "@/lib/resultado";
import { verificarPermiso } from "../autorizacion";
import { db } from "../db";
import { armarPaginado, normalizarPagina, type OpcionesPagina } from "./apoyo-admin";

/** Valor JSON ya serializable (lo que guarda `RegistroAuditoria.detalle`). */
export type ValorJson = string | number | boolean | null | ValorJson[] | { [clave: string]: ValorJson };

export interface FilaAuditoria {
  id: string;
  creadoEn: Date;
  /**
   * `null`: evento sin usuario identificado (p. ej. login con email desconocido).
   * Para un administrador de institución, quien actuó desde fuera de su
   * institución (el administrador de la red) aparece solo como
   * "Administrador de la red", sin nombre ni correo (`externo: true`).
   */
  usuario: { id: string; nombre: string; email: string; externo?: boolean } | null;
  /** Institución del registro; `null` = evento de red. */
  institucionId: string | null;
  institucion: string | null;
  accion: string;
  entidad: string;
  entidadId: string | null;
  detalle: { [clave: string]: ValorJson };
  ip: string | null;
}

export interface FiltrosAuditoria extends OpcionesPagina {
  /** Solo tiene efecto para el administrador de la red (`"red"` = eventos de red). */
  institucionId?: string | null;
  usuarioId?: string | null;
  accion?: string | null;
  entidad?: string | null;
  entidadId?: string | null;
  /** Días `YYYY-MM-DD` (hora de Chile), ambos inclusive. Valores inválidos se ignoran. */
  desde?: string | null;
  hasta?: string | null;
}

/** Valor del filtro de institución que selecciona los eventos de red (sin institución). */
export const FILTRO_EVENTOS_DE_RED = "red";

/**
 * Alcance de la auditoría: el administrador de la red ve todo; un
 * administrador de institución SOLO los registros de su institución
 * (`institucionId` propio). Los eventos de red (`institucionId = null`:
 * catálogo, instituciones, acciones del operador sobre la red, intentos de
 * ingreso sin usuario) nunca se le muestran.
 */
function alcanceAuditoria(actor: Actor): Prisma.RegistroAuditoriaWhereInput {
  if (veTodaLaRed(actor)) return {};
  return { institucionId: actor.institucionId ?? "__sin_institucion__" };
}

/**
 * Registro de auditoría, del más reciente al más antiguo. Solo lectura.
 * Permiso: `auditoria:ver`, limitado al alcance del actor (`alcanceAuditoria`).
 */
export async function listarAuditoria(actor: Actor, filtros: FiltrosAuditoria = {}): Promise<Paginado<FilaAuditoria>> {
  verificarPermiso(actor, "auditoria:ver");
  const alcance = alcanceAuditoria(actor);
  const porInstitucion: Prisma.RegistroAuditoriaWhereInput =
    veTodaLaRed(actor) && filtros.institucionId
      ? { institucionId: filtros.institucionId === FILTRO_EVENTOS_DE_RED ? null : filtros.institucionId }
      : {};
  const { pagina, porPagina, saltar } = normalizarPagina(filtros);
  const desde = parsearDiaFiltro(filtros.desde);
  const hasta = parsearDiaFiltro(filtros.hasta);
  const where: Prisma.RegistroAuditoriaWhereInput = {
    AND: [alcance, porInstitucion],
    ...(filtros.usuarioId ? { usuarioId: filtros.usuarioId } : {}),
    ...(filtros.accion ? { accion: filtros.accion } : {}),
    ...(filtros.entidad ? { entidad: filtros.entidad } : {}),
    ...(filtros.entidadId ? { entidadId: filtros.entidadId } : {}),
    ...(desde || hasta
      ? { creadoEn: { ...(desde ? { gte: inicioDelDia(desde) } : {}), ...(hasta ? { lte: finDelDia(hasta) } : {}) } }
      : {}),
  };
  const [total, filas] = await Promise.all([
    db.registroAuditoria.count({ where }),
    db.registroAuditoria.findMany({
      where,
      select: {
        id: true, creadoEn: true, accion: true, entidad: true, entidadId: true, detalle: true, ip: true,
        institucionId: true,
        institucion: { select: { nombre: true } },
        usuario: { select: { id: true, nombre: true, email: true, institucionId: true } },
      },
      orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
      skip: saltar,
      take: porPagina,
    }),
  ]);
  return armarPaginado(
    filas.map(({ usuario, institucion, ...f }) => ({
      ...f,
      institucion: institucion?.nombre ?? null,
      usuario: usuario === null ? null : usuarioVisible(actor, usuario),
      detalle:
        f.detalle !== null && typeof f.detalle === "object" && !Array.isArray(f.detalle)
          ? (f.detalle as { [clave: string]: ValorJson })
          : {},
    })),
    total,
    pagina,
    porPagina,
  );
}

/** Oculta la identidad de quien actuó desde fuera de la institución del actor. */
function usuarioVisible(
  actor: Actor,
  usuario: { id: string; nombre: string; email: string; institucionId: string | null },
): NonNullable<FilaAuditoria["usuario"]> {
  if (veTodaLaRed(actor) || usuario.institucionId === actor.institucionId) {
    return { id: usuario.id, nombre: usuario.nombre, email: usuario.email };
  }
  return { id: "", nombre: NOMBRE_ROL.ADMIN_RED, email: "", externo: true };
}

export interface OpcionesFiltroAuditoria {
  acciones: string[];
  entidades: string[];
  usuarios: { id: string; nombre: string; activo: boolean }[];
}

/**
 * Valores disponibles para los filtros del visor, dentro del alcance del actor
 * (un administrador de institución solo ve acciones, tipos y usuarios de su
 * institución). Permiso: `auditoria:ver`.
 */
export async function opcionesFiltroAuditoria(actor: Actor): Promise<OpcionesFiltroAuditoria> {
  verificarPermiso(actor, "auditoria:ver");
  const where = alcanceAuditoria(actor);
  const [acciones, entidades, usuarios] = await Promise.all([
    db.registroAuditoria.findMany({ where, distinct: ["accion"], select: { accion: true }, orderBy: { accion: "asc" } }),
    db.registroAuditoria.findMany({ where, distinct: ["entidad"], select: { entidad: true }, orderBy: { entidad: "asc" } }),
    db.usuario.findMany({
      where: veTodaLaRed(actor) ? {} : { institucionId: actor.institucionId ?? "__sin_institucion__" },
      select: { id: true, nombre: true, activo: true },
      orderBy: { nombre: "asc" },
    }),
  ]);
  return { acciones: acciones.map((a) => a.accion), entidades: entidades.map((e) => e.entidad), usuarios };
}
