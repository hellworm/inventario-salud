import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma, type TipoMovimiento } from "@prisma/client";
import {
  esquemaAjuste,
  esquemaIngreso,
  esquemaMerma,
  esquemaRetiro,
  esquemaTraslado,
  type EntradaAjuste,
  type EntradaIngreso,
  type EntradaMerma,
  type EntradaRetiro,
  type EntradaTraslado,
} from "@/lib/esquemas/movimientos";
import { dateADia, diaADate, formatearDia, hoyEnSantiago, type DiaISO } from "@/lib/fechas";
import { formatearNumero } from "@/lib/formato";
import type { Actor, Permiso } from "@/lib/permisos";
import { registrarAuditoria } from "../auditoria";
import { verificarPermiso } from "../autorizacion";
import { enTransaccion, type Tx } from "../db";
import { ErrorDominio } from "../errores";
import { validar } from "../validacion";

/**
 * Mutaciones de stock. Reglas comunes:
 *  - Todo ocurre en UNA transacción con bloqueo de fila (`FOR UPDATE`) sobre
 *    las existencias afectadas: no hay carreras ni stock negativo.
 *  - Se valida rol + pertenencia al centro de la ubicación.
 *  - Cada movimiento queda en el libro mayor (inmutable) y en auditoría.
 *  - `saldoPosterior` = saldo del lote en esa ubicación tras el movimiento.
 */

/** Opciones internas. `ahora` solo se usa en el seed y en tests. */
export interface OpcionesMutacion {
  ahora?: Date;
}

export interface MovimientoRegistrado {
  id: string;
  tipo: TipoMovimiento;
  insumoId: string;
  loteId: string;
  numeroLote: string;
  ubicacionId: string;
  centroId: string;
  cantidad: number;
  saldoPosterior: number;
  creadoEn: Date;
}

export interface ResultadoIngreso {
  movimiento: MovimientoRegistrado;
  /** `true` si el ingreso creó el lote; `false` si reutilizó uno existente. */
  loteCreado: boolean;
}

export interface ResultadoRetiro {
  /** Un movimiento por cada lote consumido (FEFO puede usar varios). */
  movimientos: MovimientoRegistrado[];
  cantidadTotal: number;
}

export interface ResultadoTraslado {
  trasladoGrupoId: string;
  salida: MovimientoRegistrado;
  entrada: MovimientoRegistrado;
}

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------

interface Contexto {
  tx: Tx;
  actor: Actor;
  ahora: Date;
  hoy: DiaISO;
}

interface UbicacionCargada {
  id: string;
  nombre: string;
  centroId: string;
  centroNombre: string;
}

interface InsumoCargado {
  id: string;
  codigo: string;
  nombre: string;
  unidadMedida: string;
  controlaVencimiento: boolean;
  activo: boolean;
}

interface FilaExistencia {
  id: string;
  loteId: string;
  cantidad: number;
  numeroLote: string;
  fechaVencimiento: Date | null;
}

/** Id con forma similar a cuid para filas insertadas con SQL directo. */
function nuevoId(): string {
  return `c${randomBytes(16).toString("hex").slice(0, 24)}`;
}

function estaVencido(fechaVencimiento: Date | null, hoy: DiaISO): boolean {
  return fechaVencimiento !== null && dateADia(fechaVencimiento) < hoy;
}

/**
 * Carga la ubicación, valida permiso + pertenencia al centro y que ubicación
 * y centro estén activos. El permiso se valida ANTES de revelar el estado.
 */
async function cargarUbicacionAutorizada(
  ctx: Contexto,
  ubicacionId: string,
  permiso: Permiso,
  campo = "ubicacionId",
): Promise<UbicacionCargada> {
  const ubicacion = await ctx.tx.ubicacion.findUnique({
    where: { id: ubicacionId },
    select: {
      id: true,
      nombre: true,
      activo: true,
      centroId: true,
      centro: { select: { nombre: true, activo: true } },
    },
  });
  if (!ubicacion) {
    // Se valida el rol igualmente para no dar pistas a quien no tiene permiso.
    verificarPermiso(ctx.actor, permiso);
    throw new ErrorDominio("NO_ENCONTRADO", "La ubicación no existe o no tienes acceso.", { campo });
  }
  verificarPermiso(ctx.actor, permiso, ubicacion.centroId);
  if (!ubicacion.activo || !ubicacion.centro.activo) {
    throw new ErrorDominio("INACTIVO", `La ubicación "${ubicacion.nombre}" está inactiva.`, { campo });
  }
  return {
    id: ubicacion.id,
    nombre: ubicacion.nombre,
    centroId: ubicacion.centroId,
    centroNombre: ubicacion.centro.nombre,
  };
}

async function cargarInsumo(ctx: Contexto, insumoId: string): Promise<InsumoCargado> {
  const insumo = await ctx.tx.insumo.findUnique({
    where: { id: insumoId },
    select: {
      id: true,
      codigo: true,
      nombre: true,
      unidadMedida: true,
      controlaVencimiento: true,
      activo: true,
    },
  });
  if (!insumo) throw new ErrorDominio("NO_ENCONTRADO", "El insumo no existe.", { campo: "insumoId" });
  return insumo;
}

/** Bloquea (FOR UPDATE) la existencia de un lote en una ubicación, si existe. */
async function bloquearExistencia(
  ctx: Contexto,
  loteId: string,
  ubicacionId: string,
): Promise<FilaExistencia | null> {
  const filas = await ctx.tx.$queryRaw<FilaExistencia[]>(Prisma.sql`
    SELECT e."id", e."loteId", e."cantidad", l."numeroLote", l."fechaVencimiento"
    FROM "existencias" e
    JOIN "lotes" l ON l."id" = e."loteId"
    WHERE e."loteId" = ${loteId} AND e."ubicacionId" = ${ubicacionId}
    FOR UPDATE OF e
  `);
  return filas[0] ?? null;
}

/** Suma stock de forma atómica (crea la existencia si no existía). Devuelve el saldo. */
async function sumarExistencia(
  ctx: Contexto,
  loteId: string,
  ubicacionId: string,
  cantidad: number,
): Promise<number> {
  const filas = await ctx.tx.$queryRaw<{ cantidad: number }[]>(Prisma.sql`
    INSERT INTO "existencias" ("id", "loteId", "ubicacionId", "cantidad", "actualizadoEn")
    VALUES (${nuevoId()}, ${loteId}, ${ubicacionId}, ${cantidad}, ${ctx.ahora})
    ON CONFLICT ("loteId", "ubicacionId")
    DO UPDATE SET "cantidad" = "existencias"."cantidad" + EXCLUDED."cantidad",
                  "actualizadoEn" = EXCLUDED."actualizadoEn"
    RETURNING "cantidad"
  `);
  return filas[0]!.cantidad;
}

/** Resta stock de una existencia YA bloqueada. Devuelve el saldo. */
async function restarExistencia(ctx: Contexto, existenciaId: string, cantidad: number): Promise<number> {
  const filas = await ctx.tx.$queryRaw<{ cantidad: number }[]>(Prisma.sql`
    UPDATE "existencias"
    SET "cantidad" = "cantidad" - ${cantidad}, "actualizadoEn" = ${ctx.ahora}
    WHERE "id" = ${existenciaId}
    RETURNING "cantidad"
  `);
  return filas[0]!.cantidad;
}

interface DatosAsiento {
  tipo: TipoMovimiento;
  insumoId: string;
  loteId: string;
  numeroLote: string;
  ubicacion: UbicacionCargada;
  cantidad: number;
  saldoPosterior: number;
  motivo?: string;
  documentoRef?: string;
  proveedorId?: string;
  costoUnitario?: number;
  nota?: string;
  trasladoGrupoId?: string;
}

/** Escribe el asiento en el libro mayor. */
async function asentar(ctx: Contexto, d: DatosAsiento): Promise<MovimientoRegistrado> {
  const mov = await ctx.tx.movimiento.create({
    data: {
      tipo: d.tipo,
      insumoId: d.insumoId,
      loteId: d.loteId,
      ubicacionId: d.ubicacion.id,
      centroId: d.ubicacion.centroId,
      cantidad: d.cantidad,
      saldoPosterior: d.saldoPosterior,
      motivo: d.motivo ?? null,
      documentoRef: d.documentoRef ?? null,
      proveedorId: d.proveedorId ?? null,
      costoUnitario: d.costoUnitario ?? null,
      nota: d.nota ?? null,
      usuarioId: ctx.actor.usuarioId,
      trasladoGrupoId: d.trasladoGrupoId ?? null,
      creadoEn: ctx.ahora,
    },
    select: { id: true },
  });
  return {
    id: mov.id,
    tipo: d.tipo,
    insumoId: d.insumoId,
    loteId: d.loteId,
    numeroLote: d.numeroLote,
    ubicacionId: d.ubicacion.id,
    centroId: d.ubicacion.centroId,
    cantidad: d.cantidad,
    saldoPosterior: d.saldoPosterior,
    creadoEn: ctx.ahora,
  };
}

function ejecutar<T>(
  actor: Actor,
  permiso: Permiso,
  opciones: OpcionesMutacion | undefined,
  trabajo: (ctx: Contexto) => Promise<T>,
): Promise<T> {
  verificarPermiso(actor, permiso);
  const ahora = opciones?.ahora ?? new Date();
  return enTransaccion((tx) => trabajo({ tx, actor, ahora, hoy: hoyEnSantiago(ahora) }));
}

function stockInsuficiente(
  insumo: Pick<InsumoCargado, "nombre" | "unidadMedida">,
  solicitado: number,
  disponible: number,
  extra: { vencido?: number; lote?: string } = {},
): ErrorDominio {
  const dondeLote = extra.lote ? ` en el lote ${extra.lote}` : "";
  const notaVencido =
    extra.vencido && extra.vencido > 0
      ? ` Hay ${formatearNumero(extra.vencido)} en lotes vencidos, que solo pueden salir como merma.`
      : "";
  return new ErrorDominio(
    "STOCK_INSUFICIENTE",
    `Stock insuficiente de "${insumo.nombre}"${dondeLote}: solicitaste ${formatearNumero(solicitado)} y hay ${formatearNumero(disponible)} disponible(s).${notaVencido}`,
    { campo: "cantidad", detalle: { solicitado, disponible, vencido: extra.vencido ?? 0 } },
  );
}

// ---------------------------------------------------------------------------
// INGRESO
// ---------------------------------------------------------------------------

/**
 * Registra un ingreso de stock. Crea el lote si no existe o reutiliza el
 * existente (mismo insumo + número de lote).
 *
 * Reglas:
 *  - Si el insumo controla vencimiento, un lote nuevo exige fecha de vencimiento.
 *  - No se puede cambiar el vencimiento de un lote existente (LOTE_INCONSISTENTE).
 *  - No se puede ingresar un lote ya vencido (LOTE_VENCIDO).
 *
 * Permiso: `movimientos:ingreso` en el centro de la ubicación.
 */
export async function registrarIngreso(
  actor: Actor,
  entrada: EntradaIngreso,
  opciones?: OpcionesMutacion,
): Promise<ResultadoIngreso> {
  verificarPermiso(actor, "movimientos:ingreso");
  const datos = validar(esquemaIngreso, entrada);
  return ejecutar(actor, "movimientos:ingreso", opciones, async (ctx) => {
    const ubicacion = await cargarUbicacionAutorizada(ctx, datos.ubicacionId, "movimientos:ingreso");
    const insumo = await cargarInsumo(ctx, datos.insumoId);
    if (!insumo.activo) {
      throw new ErrorDominio("INACTIVO", `El insumo "${insumo.nombre}" está inactivo.`, {
        campo: "insumoId",
      });
    }
    if (datos.proveedorId) {
      const proveedor = await ctx.tx.proveedor.findUnique({
        where: { id: datos.proveedorId },
        select: { activo: true },
      });
      if (!proveedor) {
        throw new ErrorDominio("NO_ENCONTRADO", "El proveedor no existe.", { campo: "proveedorId" });
      }
      if (!proveedor.activo) {
        throw new ErrorDominio("INACTIVO", "El proveedor está inactivo.", { campo: "proveedorId" });
      }
    }
    if (
      datos.fechaFabricacion &&
      datos.fechaVencimiento &&
      datos.fechaFabricacion > datos.fechaVencimiento
    ) {
      throw new ErrorDominio(
        "VALIDACION",
        "La fecha de fabricación no puede ser posterior al vencimiento.",
        { campo: "fechaFabricacion" },
      );
    }

    // Crear el lote si no existe (atómico) y bloquearlo para validar sus datos.
    const idCandidato = nuevoId();
    await ctx.tx.$executeRaw(Prisma.sql`
      INSERT INTO "lotes" ("id", "insumoId", "numeroLote", "fechaVencimiento", "fechaFabricacion", "creadoEn")
      VALUES (
        ${idCandidato}, ${insumo.id}, ${datos.numeroLote},
        ${datos.fechaVencimiento ?? null}::date, ${datos.fechaFabricacion ?? null}::date, ${ctx.ahora}
      )
      ON CONFLICT ("insumoId", "numeroLote") DO NOTHING
    `);
    const [lote] = await ctx.tx.$queryRaw<
      { id: string; fechaVencimiento: Date | null; fechaFabricacion: Date | null }[]
    >(Prisma.sql`
      SELECT "id", "fechaVencimiento", "fechaFabricacion"
      FROM "lotes"
      WHERE "insumoId" = ${insumo.id} AND "numeroLote" = ${datos.numeroLote}
      FOR UPDATE
    `);
    if (!lote) throw new ErrorDominio("OPERACION_INVALIDA", "No fue posible registrar el lote.");
    const loteCreado = lote.id === idCandidato;

    let vencimiento = lote.fechaVencimiento ? dateADia(lote.fechaVencimiento) : null;
    if (!loteCreado && datos.fechaVencimiento) {
      if (vencimiento === null) {
        // El lote existía sin fecha: se completa.
        await ctx.tx.lote.update({
          where: { id: lote.id },
          data: { fechaVencimiento: diaADate(datos.fechaVencimiento) },
        });
        vencimiento = datos.fechaVencimiento;
      } else if (vencimiento !== datos.fechaVencimiento) {
        throw new ErrorDominio(
          "LOTE_INCONSISTENTE",
          `El lote ${datos.numeroLote} ya existe con vencimiento ${formatearDia(vencimiento)}. Revisa la fecha o el número de lote.`,
          {
            campo: "fechaVencimiento",
            detalle: { vencimientoRegistrado: vencimiento, vencimientoIngresado: datos.fechaVencimiento },
          },
        );
      }
    }
    if (insumo.controlaVencimiento && vencimiento === null) {
      throw new ErrorDominio(
        "VENCIMIENTO_REQUERIDO",
        `"${insumo.nombre}" controla vencimiento: indica la fecha de vencimiento del lote.`,
        { campo: "fechaVencimiento" },
      );
    }
    if (vencimiento !== null && vencimiento < ctx.hoy) {
      throw new ErrorDominio(
        "LOTE_VENCIDO",
        `El lote ${datos.numeroLote} venció el ${formatearDia(vencimiento)}; no se puede ingresar.`,
        { campo: "fechaVencimiento" },
      );
    }

    const saldo = await sumarExistencia(ctx, lote.id, ubicacion.id, datos.cantidad);
    const movimiento = await asentar(ctx, {
      tipo: "INGRESO",
      insumoId: insumo.id,
      loteId: lote.id,
      numeroLote: datos.numeroLote,
      ubicacion,
      cantidad: datos.cantidad,
      saldoPosterior: saldo,
      documentoRef: datos.documentoRef,
      proveedorId: datos.proveedorId,
      costoUnitario: datos.costoUnitario,
      nota: datos.nota,
    });

    if (loteCreado) {
      await registrarAuditoria(
        ctx.tx,
        ctx.actor,
        {
          accion: "LOTE_CREADO",
          entidad: "Lote",
          entidadId: lote.id,
          detalle: { insumo: insumo.codigo, numeroLote: datos.numeroLote, fechaVencimiento: vencimiento },
        },
        ctx.ahora,
      );
    }
    await registrarAuditoria(
      ctx.tx,
      ctx.actor,
      {
        accion: "MOVIMIENTO_INGRESO",
        entidad: "Movimiento",
        entidadId: movimiento.id,
        detalle: {
          insumo: insumo.codigo,
          lote: datos.numeroLote,
          centro: ubicacion.centroNombre,
          ubicacion: ubicacion.nombre,
          cantidad: datos.cantidad,
          saldoPosterior: saldo,
          documentoRef: datos.documentoRef ?? null,
        },
      },
      ctx.ahora,
    );
    return { movimiento, loteCreado };
  });
}

// ---------------------------------------------------------------------------
// RETIRO
// ---------------------------------------------------------------------------

/**
 * Registra un retiro (consumo) desde una ubicación.
 *  - Con `loteId`: descuenta de ese lote.
 *  - Sin `loteId`: FEFO automático (primero el lote que vence antes; los lotes
 *    sin vencimiento van al final). Puede consumir varios lotes.
 * Nunca retira lotes vencidos: esos solo salen con `registrarMerma`.
 *
 * Permiso: `movimientos:retiro` en el centro de la ubicación.
 */
export async function registrarRetiro(
  actor: Actor,
  entrada: EntradaRetiro,
  opciones?: OpcionesMutacion,
): Promise<ResultadoRetiro> {
  verificarPermiso(actor, "movimientos:retiro");
  const datos = validar(esquemaRetiro, entrada);
  return ejecutar(actor, "movimientos:retiro", opciones, async (ctx) => {
    const ubicacion = await cargarUbicacionAutorizada(ctx, datos.ubicacionId, "movimientos:retiro");
    const insumo = await cargarInsumo(ctx, datos.insumoId);

    if (datos.loteId) {
      const lote = await ctx.tx.lote.findUnique({
        where: { id: datos.loteId },
        select: { insumoId: true },
      });
      if (!lote || lote.insumoId !== insumo.id) {
        throw new ErrorDominio("NO_ENCONTRADO", "El lote no corresponde a este insumo.", {
          campo: "loteId",
        });
      }
    }

    // Bloquea, en orden FEFO, todas las existencias candidatas.
    const filtroLote = datos.loteId ? Prisma.sql`AND l."id" = ${datos.loteId}` : Prisma.empty;
    const filas = await ctx.tx.$queryRaw<FilaExistencia[]>(Prisma.sql`
      SELECT e."id", e."loteId", e."cantidad", l."numeroLote", l."fechaVencimiento"
      FROM "existencias" e
      JOIN "lotes" l ON l."id" = e."loteId"
      WHERE e."ubicacionId" = ${ubicacion.id}
        AND l."insumoId" = ${insumo.id}
        AND e."cantidad" > 0
        ${filtroLote}
      ORDER BY l."fechaVencimiento" ASC NULLS LAST, l."creadoEn" ASC, l."id" ASC
      FOR UPDATE OF e
    `);

    const vigentes = filas.filter((f) => !estaVencido(f.fechaVencimiento, ctx.hoy));
    const vencido = filas
      .filter((f) => estaVencido(f.fechaVencimiento, ctx.hoy))
      .reduce((s, f) => s + f.cantidad, 0);

    if (datos.loteId && vigentes.length === 0 && vencido > 0) {
      const fila = filas[0]!;
      throw new ErrorDominio(
        "LOTE_VENCIDO",
        `El lote ${fila.numeroLote} venció el ${formatearDia(fila.fechaVencimiento)}. No se puede retirar; regístralo como merma.`,
        { campo: "loteId" },
      );
    }

    const disponible = vigentes.reduce((s, f) => s + f.cantidad, 0);
    if (disponible < datos.cantidad) {
      throw stockInsuficiente(insumo, datos.cantidad, disponible, {
        vencido,
        lote: datos.loteId ? filas[0]?.numeroLote : undefined,
      });
    }

    const movimientos: MovimientoRegistrado[] = [];
    let pendiente = datos.cantidad;
    for (const fila of vigentes) {
      if (pendiente === 0) break;
      const tomar = Math.min(fila.cantidad, pendiente);
      const saldo = await restarExistencia(ctx, fila.id, tomar);
      const movimiento = await asentar(ctx, {
        tipo: "RETIRO",
        insumoId: insumo.id,
        loteId: fila.loteId,
        numeroLote: fila.numeroLote,
        ubicacion,
        cantidad: tomar,
        saldoPosterior: saldo,
        motivo: datos.motivo,
        documentoRef: datos.documentoRef,
        nota: datos.nota,
      });
      movimientos.push(movimiento);
      pendiente -= tomar;
      await registrarAuditoria(
        ctx.tx,
        ctx.actor,
        {
          accion: "MOVIMIENTO_RETIRO",
          entidad: "Movimiento",
          entidadId: movimiento.id,
          detalle: {
            insumo: insumo.codigo,
            lote: fila.numeroLote,
            centro: ubicacion.centroNombre,
            ubicacion: ubicacion.nombre,
            cantidad: tomar,
            saldoPosterior: saldo,
            modo: datos.loteId ? "LOTE" : "FEFO",
            motivo: datos.motivo ?? null,
          },
        },
        ctx.ahora,
      );
    }
    return { movimientos, cantidadTotal: datos.cantidad };
  });
}

// ---------------------------------------------------------------------------
// AJUSTE, MERMA
// ---------------------------------------------------------------------------

/** Carga el lote con su insumo (para ajustes, mermas y traslados). */
async function cargarLote(ctx: Contexto, loteId: string) {
  const lote = await ctx.tx.lote.findUnique({
    where: { id: loteId },
    select: {
      id: true,
      numeroLote: true,
      fechaVencimiento: true,
      insumo: { select: { id: true, codigo: true, nombre: true, unidadMedida: true } },
    },
  });
  if (!lote) throw new ErrorDominio("NO_ENCONTRADO", "El lote no existe.", { campo: "loteId" });
  return lote;
}

/** Descuenta de un lote específico sin importar si está vencido. */
async function descontarDeLote(
  ctx: Contexto,
  lote: Awaited<ReturnType<typeof cargarLote>>,
  ubicacion: UbicacionCargada,
  cantidad: number,
): Promise<number> {
  const existencia = await bloquearExistencia(ctx, lote.id, ubicacion.id);
  const disponible = existencia?.cantidad ?? 0;
  if (!existencia || disponible < cantidad) {
    throw stockInsuficiente(lote.insumo, cantidad, disponible, { lote: lote.numeroLote });
  }
  return restarExistencia(ctx, existencia.id, cantidad);
}

/**
 * Ajuste de inventario (+/−) sobre un lote en una ubicación, con motivo
 * obligatorio. El ajuste positivo puede crear la existencia del lote en la
 * ubicación; el negativo no puede dejar el saldo bajo cero.
 *
 * Permiso: `movimientos:ajuste` (solo ADMIN).
 */
export async function registrarAjuste(
  actor: Actor,
  entrada: EntradaAjuste,
  opciones?: OpcionesMutacion,
): Promise<MovimientoRegistrado> {
  verificarPermiso(actor, "movimientos:ajuste");
  const datos = validar(esquemaAjuste, entrada);
  return ejecutar(actor, "movimientos:ajuste", opciones, async (ctx) => {
    const ubicacion = await cargarUbicacionAutorizada(ctx, datos.ubicacionId, "movimientos:ajuste");
    const lote = await cargarLote(ctx, datos.loteId);
    const tipo: TipoMovimiento = datos.sentido === "POSITIVO" ? "AJUSTE_POSITIVO" : "AJUSTE_NEGATIVO";
    const saldo =
      datos.sentido === "POSITIVO"
        ? await sumarExistencia(ctx, lote.id, ubicacion.id, datos.cantidad)
        : await descontarDeLote(ctx, lote, ubicacion, datos.cantidad);

    const movimiento = await asentar(ctx, {
      tipo,
      insumoId: lote.insumo.id,
      loteId: lote.id,
      numeroLote: lote.numeroLote,
      ubicacion,
      cantidad: datos.cantidad,
      saldoPosterior: saldo,
      motivo: datos.motivo,
      nota: datos.nota,
    });
    await registrarAuditoria(
      ctx.tx,
      ctx.actor,
      {
        accion: "MOVIMIENTO_AJUSTE",
        entidad: "Movimiento",
        entidadId: movimiento.id,
        detalle: {
          insumo: lote.insumo.codigo,
          lote: lote.numeroLote,
          centro: ubicacion.centroNombre,
          ubicacion: ubicacion.nombre,
          sentido: datos.sentido,
          cantidad: datos.cantidad,
          saldoPosterior: saldo,
          motivo: datos.motivo,
        },
      },
      ctx.ahora,
    );
    return movimiento;
  });
}

/**
 * Merma: baja de stock por vencimiento, daño, pérdida, etc. Es la única
 * salida permitida para lotes vencidos. Motivo obligatorio.
 *
 * Permiso: `movimientos:merma` (solo ADMIN).
 */
export async function registrarMerma(
  actor: Actor,
  entrada: EntradaMerma,
  opciones?: OpcionesMutacion,
): Promise<MovimientoRegistrado> {
  verificarPermiso(actor, "movimientos:merma");
  const datos = validar(esquemaMerma, entrada);
  return ejecutar(actor, "movimientos:merma", opciones, async (ctx) => {
    const ubicacion = await cargarUbicacionAutorizada(ctx, datos.ubicacionId, "movimientos:merma");
    const lote = await cargarLote(ctx, datos.loteId);
    const saldo = await descontarDeLote(ctx, lote, ubicacion, datos.cantidad);
    const movimiento = await asentar(ctx, {
      tipo: "MERMA",
      insumoId: lote.insumo.id,
      loteId: lote.id,
      numeroLote: lote.numeroLote,
      ubicacion,
      cantidad: datos.cantidad,
      saldoPosterior: saldo,
      motivo: datos.motivo,
      nota: datos.nota,
    });
    await registrarAuditoria(
      ctx.tx,
      ctx.actor,
      {
        accion: "MOVIMIENTO_MERMA",
        entidad: "Movimiento",
        entidadId: movimiento.id,
        detalle: {
          insumo: lote.insumo.codigo,
          lote: lote.numeroLote,
          centro: ubicacion.centroNombre,
          ubicacion: ubicacion.nombre,
          cantidad: datos.cantidad,
          saldoPosterior: saldo,
          motivo: datos.motivo,
        },
      },
      ctx.ahora,
    );
    return movimiento;
  });
}

// ---------------------------------------------------------------------------
// TRASLADO
// ---------------------------------------------------------------------------

/**
 * Traslada stock de un lote entre dos ubicaciones (del mismo centro o de
 * centros distintos). Genera TRASLADO_SALIDA + TRASLADO_ENTRADA enlazados por
 * `trasladoGrupoId`, de forma atómica.
 *
 * Permiso: `movimientos:traslado` en el centro de origen Y en el de destino.
 */
export async function registrarTraslado(
  actor: Actor,
  entrada: EntradaTraslado,
  opciones?: OpcionesMutacion,
): Promise<ResultadoTraslado> {
  verificarPermiso(actor, "movimientos:traslado");
  const datos = validar(esquemaTraslado, entrada);
  return ejecutar(actor, "movimientos:traslado", opciones, async (ctx) => {
    const origen = await cargarUbicacionAutorizada(
      ctx,
      datos.ubicacionOrigenId,
      "movimientos:traslado",
      "ubicacionOrigenId",
    );
    const destino = await cargarUbicacionAutorizada(
      ctx,
      datos.ubicacionDestinoId,
      "movimientos:traslado",
      "ubicacionDestinoId",
    );
    if (origen.id === destino.id) {
      throw new ErrorDominio("TRASLADO_INVALIDO", "El destino debe ser distinto del origen.", {
        campo: "ubicacionDestinoId",
      });
    }
    const lote = await cargarLote(ctx, datos.loteId);

    // Garantiza que exista la fila de destino y bloquea ambas en orden estable
    // (por id) para evitar interbloqueos entre traslados cruzados.
    await ctx.tx.$executeRaw(Prisma.sql`
      INSERT INTO "existencias" ("id", "loteId", "ubicacionId", "cantidad", "actualizadoEn")
      VALUES (${nuevoId()}, ${lote.id}, ${destino.id}, 0, ${ctx.ahora})
      ON CONFLICT ("loteId", "ubicacionId") DO NOTHING
    `);
    const filas = await ctx.tx.$queryRaw<{ id: string; ubicacionId: string; cantidad: number }[]>(
      Prisma.sql`
        SELECT "id", "ubicacionId", "cantidad"
        FROM "existencias"
        WHERE "loteId" = ${lote.id} AND "ubicacionId" IN (${origen.id}, ${destino.id})
        ORDER BY "id"
        FOR UPDATE
      `,
    );
    const filaOrigen = filas.find((f) => f.ubicacionId === origen.id);
    const filaDestino = filas.find((f) => f.ubicacionId === destino.id);
    const disponible = filaOrigen?.cantidad ?? 0;
    if (!filaOrigen || !filaDestino || disponible < datos.cantidad) {
      throw stockInsuficiente(lote.insumo, datos.cantidad, disponible, { lote: lote.numeroLote });
    }

    const saldoOrigen = await restarExistencia(ctx, filaOrigen.id, datos.cantidad);
    const saldoDestino = await sumarExistencia(ctx, lote.id, destino.id, datos.cantidad);
    const trasladoGrupoId = nuevoId();
    const comun = {
      insumoId: lote.insumo.id,
      loteId: lote.id,
      numeroLote: lote.numeroLote,
      cantidad: datos.cantidad,
      motivo: datos.motivo,
      nota: datos.nota,
      trasladoGrupoId,
    };
    const salida = await asentar(ctx, {
      ...comun,
      tipo: "TRASLADO_SALIDA",
      ubicacion: origen,
      saldoPosterior: saldoOrigen,
    });
    const movEntrada = await asentar(ctx, {
      ...comun,
      tipo: "TRASLADO_ENTRADA",
      ubicacion: destino,
      saldoPosterior: saldoDestino,
    });
    await registrarAuditoria(
      ctx.tx,
      ctx.actor,
      {
        accion: "MOVIMIENTO_TRASLADO",
        entidad: "Movimiento",
        entidadId: salida.id,
        detalle: {
          trasladoGrupoId,
          movimientoEntradaId: movEntrada.id,
          insumo: lote.insumo.codigo,
          lote: lote.numeroLote,
          cantidad: datos.cantidad,
          origen: `${origen.centroNombre} / ${origen.nombre}`,
          destino: `${destino.centroNombre} / ${destino.nombre}`,
          entreCentros: origen.centroId !== destino.centroId,
        },
      },
      ctx.ahora,
    );
    return { trasladoGrupoId, salida, entrada: movEntrada };
  });
}
