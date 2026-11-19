import "server-only";
import type { Prisma } from "@prisma/client";
import { finDelDia, inicioDelDia, parsearDiaFiltro } from "@/lib/fechas";
import type { Actor } from "@/lib/permisos";
import type { Paginado } from "@/lib/resultado";
import { verificarPermiso } from "../autorizacion";
import { db } from "../db";
import { armarPaginado, normalizarPagina, type OpcionesPagina } from "./apoyo-admin";

/** Valor JSON ya serializable (lo que guarda `RegistroAuditoria.detalle`). */
export type ValorJson = string | number | boolean | null | ValorJson[] | { [clave: string]: ValorJson };

export interface FilaAuditoria {
  id: string;
  creadoEn: Date;
  /** `null`: evento sin usuario identificado (p. ej. login con email desconocido). */
  usuario: { id: string; nombre: string; email: string } | null;
  accion: string;
  entidad: string;
  entidadId: string | null;
  detalle: { [clave: string]: ValorJson };
  ip: string | null;
}

export interface FiltrosAuditoria extends OpcionesPagina {
  usuarioId?: string | null;
  accion?: string | null;
  entidad?: string | null;
  entidadId?: string | null;
  /** Días `YYYY-MM-DD` (hora de Chile), ambos inclusive. Valores inválidos se ignoran. */
  desde?: string | null;
  hasta?: string | null;
}

/** Registro de auditoría, del más reciente al más antiguo. Solo lectura. Permiso: `auditoria:ver`. */
export async function listarAuditoria(actor: Actor, filtros: FiltrosAuditoria = {}): Promise<Paginado<FilaAuditoria>> {
  verificarPermiso(actor, "auditoria:ver");
  const { pagina, porPagina, saltar } = normalizarPagina(filtros);
  const desde = parsearDiaFiltro(filtros.desde);
  const hasta = parsearDiaFiltro(filtros.hasta);
  const where: Prisma.RegistroAuditoriaWhereInput = {
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
        usuario: { select: { id: true, nombre: true, email: true } },
      },
      orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
      skip: saltar,
      take: porPagina,
    }),
  ]);
  return armarPaginado(
    filas.map((f) => ({
      ...f,
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

export interface OpcionesFiltroAuditoria {
  acciones: string[];
  entidades: string[];
  usuarios: { id: string; nombre: string; activo: boolean }[];
}

/** Valores disponibles para los filtros del visor. Permiso: `auditoria:ver`. */
export async function opcionesFiltroAuditoria(actor: Actor): Promise<OpcionesFiltroAuditoria> {
  verificarPermiso(actor, "auditoria:ver");
  const [acciones, entidades, usuarios] = await Promise.all([
    db.registroAuditoria.findMany({ distinct: ["accion"], select: { accion: true }, orderBy: { accion: "asc" } }),
    db.registroAuditoria.findMany({ distinct: ["entidad"], select: { entidad: true }, orderBy: { entidad: "asc" } }),
    db.usuario.findMany({ select: { id: true, nombre: true, activo: true }, orderBy: { nombre: "asc" } }),
  ]);
  return { acciones: acciones.map((a) => a.accion), entidades: entidades.map((e) => e.entidad), usuarios };
}
