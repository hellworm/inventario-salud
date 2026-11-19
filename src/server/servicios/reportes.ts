import "server-only";
import { Prisma } from "@prisma/client";
import { calcularCobertura, DIAS_COBERTURA_BAJA, DIAS_COBERTURA_CRITICA } from "@/lib/abastecimiento";
import { nombreArchivoCsv, type CeldaCsv } from "@/lib/csv";
import {
  calcularEstadoVencimiento,
  ETIQUETA_ESTADO_VENCIMIENTO,
  ETIQUETA_TIPO_MOVIMIENTO,
  limitesSemaforo,
  SIGNO_MOVIMIENTO,
  TIPOS_MOVIMIENTO,
  type ColorSemaforo,
  type EstadoVencimiento,
  type TipoMovimiento,
} from "@/lib/estados";
import {
  dateADia,
  diasEntre,
  finDelDia,
  formatearDia,
  formatearFechaHora,
  hoyEnSantiago,
  inicioDelDia,
  parsearDiaFiltro,
  sumarDias,
  type DiaISO,
} from "@/lib/fechas";
import type { Actor } from "@/lib/permisos";
import type { Paginado } from "@/lib/resultado";
import { alcanceDeCentros, verificarPermiso } from "../autorizacion";
import { db } from "../db";
import { armarPaginado, normalizarPagina, patronLike, textoDeBusqueda } from "./apoyo-admin";
import {
  condicionMovimientos,
  consultaPorTexto,
  type ConsultaPorTexto,
  type CursorMovimiento,
  type FiltrosMovimientos,
} from "./consultas-movimientos";
import { auditarExportacion, MAXIMO_FILAS_EXPORTACION, type ExportacionCsv } from "./exportaciones";
import { sqlEsAlgunColor } from "./semaforo";

/**
 * Reportes (permiso `reportes:ver`, más acceso al centro si se indica).
 * Todas las agregaciones se hacen en SQL; las vistas previas se paginan en la
 * base y las exportaciones se leen por lotes.
 */

// ---------------------------------------------------------------------------
// Utilidades compartidas
// ---------------------------------------------------------------------------

interface Paginacion {
  pagina?: number;
  porPagina?: number;
}

const normalizarPaginacion = normalizarPagina;
const paginar = armarPaginado;

function filtroCentros(columna: Prisma.Sql, centros: string[] | null): Prisma.Sql {
  if (centros === null) return Prisma.empty;
  if (centros.length === 0) return Prisma.sql`AND FALSE`;
  return Prisma.sql`AND ${columna} IN (${Prisma.join(centros)})`;
}

function patronDe(texto?: string | null): string | null {
  const limpio = textoDeBusqueda(texto);
  return limpio ? patronLike(limpio) : null;
}

export interface PeriodoReporte {
  /** Día inicial inclusive (Santiago). */
  desde: DiaISO;
  /** Día final inclusive (Santiago). */
  hasta: DiaISO;
  /** Días calendario ya transcurridos del período (mínimo 1): base del promedio diario. */
  dias: number;
}

/** Período por defecto de los reportes: los últimos 30 días, incluido hoy. */
export const DIAS_PERIODO_DEFECTO = 30;

/**
 * Normaliza un período escrito por el usuario. Sin fechas usa los últimos 30
 * días; si vienen invertidas las ordena. Los días futuros no cuentan para el
 * promedio (todavía no hubo consumo en ellos).
 */
export function resolverPeriodo(
  desde?: string | null,
  hasta?: string | null,
  ahora?: Date,
): PeriodoReporte {
  const hoy = hoyEnSantiago(ahora);
  // Fechas fuera de 2000–2100 se ignoran (ver `parsearDiaFiltro`).
  let fin = parsearDiaFiltro(hasta ?? null) ?? hoy;
  let inicio = parsearDiaFiltro(desde ?? null) ?? sumarDias(fin, -(DIAS_PERIODO_DEFECTO - 1));
  if (inicio > fin) [inicio, fin] = [fin, inicio];
  const ultimoTranscurrido = fin > hoy ? hoy : fin;
  return { desde: inicio, hasta: fin, dias: Math.max(1, diasEntre(inicio, ultimoTranscurrido) + 1) };
}

function sufijoPeriodo(p: PeriodoReporte): string {
  return `${formatearDia(p.desde)}_a_${formatearDia(p.hasta)}`;
}

async function* enLotes<T>(filas: readonly T[], aCeldas: (fila: T) => CeldaCsv[]): AsyncGenerator<CeldaCsv[]> {
  for (const fila of filas) yield aCeldas(fila);
}

// ---------------------------------------------------------------------------
// (a) Existencias por centro, ubicación y lote — y (d) vencimientos próximos
// ---------------------------------------------------------------------------

export interface FiltrosExistencias extends Paginacion {
  centroId?: string | null;
  categoriaId?: string | null;
  /** Busca en nombre y código del insumo y en el número de lote (sin tildes). */
  texto?: string | null;
  /** Solo lotes de estos colores del semáforo (vacío = todos, también los sin vencimiento). */
  semaforo?: readonly ColorSemaforo[] | null;
}

export interface FilaExistencia {
  existenciaId: string;
  centroId: string;
  centro: string;
  ubicacionId: string;
  ubicacion: string;
  insumoId: string;
  codigo: string;
  nombre: string;
  unidadMedida: string;
  categoria: string;
  loteId: string;
  numeroLote: string;
  fechaVencimiento: DiaISO | null;
  /** Días para vencer (negativo si ya venció); `null` sin fecha. */
  diasParaVencer: number | null;
  /** Color del semáforo del lote. */
  estadoVencimiento: EstadoVencimiento;
  cantidad: number;
  /** Costo promedio ponderado de los ingresos del lote; `null` si no se registró costo. */
  costoUnitario: number | null;
  /** cantidad × costo unitario; `null` sin costo. */
  valor: number | null;
}

export interface TotalesExistencias {
  filas: number;
  unidades: number;
  /** Suma del valor de las filas con costo conocido. */
  valor: number;
  /** Filas (lote × ubicación) sin costo registrado: no suman al valor. */
  filasSinCosto: number;
}

export interface ReporteExistencias extends Paginado<FilaExistencia> {
  totales: TotalesExistencias;
}

interface FilaExistenciaSql {
  existenciaId: string;
  centroId: string;
  centro: string;
  ubicacionId: string;
  ubicacion: string;
  insumoId: string;
  codigo: string;
  nombre: string;
  unidadMedida: string;
  categoria: string;
  loteId: string;
  numeroLote: string;
  fechaVencimiento: Date | null;
  cantidad: number;
  costo: number | null;
}

interface ConsultaExistencias {
  centros: string[] | null;
  categoriaId?: string | null;
  texto?: string | null;
  /** Solo lotes de estos colores del semáforo (vacío o ausente = todos). */
  semaforo?: readonly ColorSemaforo[] | null;
  orden: "UBICACION" | "VENCIMIENTO";
  limite: number;
  saltar: number;
}

function sqlBaseExistencias(c: ConsultaExistencias, hoy: DiaISO): Prisma.Sql {
  const patron = patronDe(c.texto);
  return Prisma.sql`
    SELECT
      e."id" AS "existenciaId", e."cantidad",
      ce."id" AS "centroId", ce."nombre" AS centro,
      u."id" AS "ubicacionId", u."nombre" AS ubicacion,
      i."id" AS "insumoId", i."codigo", i."nombre", i."unidadMedida", ca."nombre" AS categoria,
      l."id" AS "loteId", l."numeroLote", l."fechaVencimiento"
    FROM "existencias" e
    JOIN "lotes" l ON l."id" = e."loteId"
    JOIN "insumos" i ON i."id" = l."insumoId"
    JOIN "categorias" ca ON ca."id" = i."categoriaId"
    JOIN "ubicaciones" u ON u."id" = e."ubicacionId"
    JOIN "centros" ce ON ce."id" = u."centroId" AND ce."activo"
    WHERE e."cantidad" > 0
      ${filtroCentros(Prisma.sql`u."centroId"`, c.centros)}
      ${c.categoriaId ? Prisma.sql`AND i."categoriaId" = ${c.categoriaId}` : Prisma.empty}
      AND ${sqlEsAlgunColor(Prisma.sql`l."fechaVencimiento"`, c.semaforo, limitesSemaforo(hoy))}
      ${
        patron
          ? Prisma.sql`AND (
              unaccent(i."nombre") ILIKE unaccent(${patron})
              OR i."codigo" ILIKE ${patron}
              OR l."numeroLote" ILIKE ${patron}
            )`
          : Prisma.empty
      }
  `;
}

async function consultarExistencias(
  c: ConsultaExistencias,
  hoy: DiaISO,
): Promise<{ filas: FilaExistencia[]; totales: TotalesExistencias }> {
  const base = sqlBaseExistencias(c, hoy);
  const orden =
    c.orden === "VENCIMIENTO"
      ? Prisma.sql`"fechaVencimiento" ASC NULLS LAST, "nombre" ASC, centro ASC, ubicacion ASC, "existenciaId" ASC`
      : Prisma.sql`centro ASC, ubicacion ASC, "nombre" ASC, "fechaVencimiento" ASC NULLS LAST, "existenciaId" ASC`;

  // El costo se calcula solo para los lotes de la página (LATERAL sobre el índice por lote).
  const [filasSql, totalesSql] = await Promise.all([
    db.$queryRaw<FilaExistenciaSql[]>(Prisma.sql`
      SELECT b.*, k.costo
      FROM (
        SELECT * FROM (${base}) x ORDER BY ${orden} LIMIT ${c.limite} OFFSET ${c.saltar}
      ) b
      LEFT JOIN LATERAL (
        SELECT (SUM(m."cantidad" * m."costoUnitario") / NULLIF(SUM(m."cantidad"), 0))::float8 AS costo
        FROM "movimientos" m
        WHERE m."loteId" = b."loteId" AND m."tipo" = 'INGRESO' AND m."costoUnitario" IS NOT NULL
      ) k ON TRUE
      ORDER BY ${orden}
    `),
    db.$queryRaw<{ filas: number; unidades: number; valor: number | null; sin_costo: number }[]>(Prisma.sql`
      WITH b AS (${base}),
      k AS (
        SELECT m."loteId", (SUM(m."cantidad" * m."costoUnitario") / NULLIF(SUM(m."cantidad"), 0))::float8 AS costo
        FROM "movimientos" m
        WHERE m."tipo" = 'INGRESO' AND m."costoUnitario" IS NOT NULL
          AND m."loteId" IN (SELECT "loteId" FROM b)
        GROUP BY m."loteId"
      )
      SELECT
        COUNT(*)::int AS filas,
        COALESCE(SUM(b."cantidad"), 0)::int AS unidades,
        SUM(b."cantidad" * k.costo)::float8 AS valor,
        (COUNT(*) FILTER (WHERE k.costo IS NULL))::int AS sin_costo
      FROM b LEFT JOIN k ON k."loteId" = b."loteId"
    `),
  ]);

  const filas = filasSql.map((f): FilaExistencia => {
    const fecha = f.fechaVencimiento ? dateADia(f.fechaVencimiento) : null;
    const costo = f.costo === null ? null : Math.round(f.costo * 100) / 100;
    return {
      existenciaId: f.existenciaId,
      centroId: f.centroId,
      centro: f.centro,
      ubicacionId: f.ubicacionId,
      ubicacion: f.ubicacion,
      insumoId: f.insumoId,
      codigo: f.codigo,
      nombre: f.nombre,
      unidadMedida: f.unidadMedida,
      categoria: f.categoria,
      loteId: f.loteId,
      numeroLote: f.numeroLote,
      fechaVencimiento: fecha,
      diasParaVencer: fecha ? diasEntre(hoy, fecha) : null,
      estadoVencimiento: calcularEstadoVencimiento(fecha, hoy),
      cantidad: f.cantidad,
      costoUnitario: costo,
      valor: f.costo === null ? null : Math.round(f.cantidad * f.costo),
    };
  });
  const t = totalesSql[0];
  return {
    filas,
    totales: {
      filas: t?.filas ?? 0,
      unidades: t?.unidades ?? 0,
      valor: Math.round(t?.valor ?? 0),
      filasSinCosto: t?.sin_costo ?? 0,
    },
  };
}

/** (a) Existencias actuales valorizadas por centro, ubicación y lote. */
export async function reporteExistencias(
  actor: Actor,
  filtros: FiltrosExistencias = {},
  opciones: { ahora?: Date } = {},
): Promise<ReporteExistencias> {
  verificarPermiso(actor, "reportes:ver");
  const centros = alcanceDeCentros(actor, filtros.centroId);
  const { pagina, porPagina, saltar } = normalizarPaginacion(filtros);
  const { filas, totales } = await consultarExistencias(
    {
      centros,
      categoriaId: filtros.categoriaId,
      texto: filtros.texto,
      semaforo: filtros.semaforo,
      orden: "UBICACION",
      limite: porPagina,
      saltar,
    },
    hoyEnSantiago(opciones.ahora),
  );
  return { ...paginar(filas, totales.filas, pagina, porPagina), totales };
}

const ENCABEZADOS_EXISTENCIAS = [
  "Centro",
  "Ubicación",
  "Categoría",
  "Código",
  "Insumo",
  "Unidad",
  "Lote",
  "Vencimiento",
  "Días para vencer",
  "Semáforo",
  "Cantidad",
  "Costo unitario (CLP)",
  "Valor (CLP)",
];

function celdasExistencia(f: FilaExistencia): CeldaCsv[] {
  return [
    f.centro,
    f.ubicacion,
    f.categoria,
    f.codigo,
    f.nombre,
    f.unidadMedida,
    f.numeroLote,
    f.fechaVencimiento ? formatearDia(f.fechaVencimiento) : "",
    f.diasParaVencer,
    ETIQUETA_ESTADO_VENCIMIENTO[f.estadoVencimiento],
    f.cantidad,
    f.costoUnitario,
    f.valor,
  ];
}

export async function exportarExistencias(
  actor: Actor,
  filtros: FiltrosExistencias = {},
  opciones: { ahora?: Date } = {},
): Promise<ExportacionCsv> {
  verificarPermiso(actor, "reportes:ver");
  const centros = alcanceDeCentros(actor, filtros.centroId);
  const hoy = hoyEnSantiago(opciones.ahora);
  // Las existencias con stock son el estado actual (no crecen con el historial): una sola lectura.
  const { filas } = await consultarExistencias(
    {
      centros,
      categoriaId: filtros.categoriaId,
      texto: filtros.texto,
      semaforo: filtros.semaforo,
      orden: "UBICACION",
      limite: MAXIMO_FILAS_EXPORTACION + 1,
      saltar: 0,
    },
    hoy,
  );
  await auditarExportacion(actor, "existencias", {
    centroId: filtros.centroId ?? null,
    categoriaId: filtros.categoriaId ?? null,
    texto: textoDeBusqueda(filtros.texto),
    semaforo: filtros.semaforo?.length ? [...filtros.semaforo] : null,
    filas: filas.length,
  });
  return {
    archivo: nombreArchivoCsv("existencias", formatearDia(hoy)),
    encabezados: ENCABEZADOS_EXISTENCIAS,
    truncada: filas.length > MAXIMO_FILAS_EXPORTACION,
    filas: enLotes(filas, celdasExistencia),
  };
}

/**
 * Filtros del reporte de vencimientos. Sin `semaforo` muestra lo que requiere
 * atención: vencidos, rojo y amarillo (`SEMAFORO_VENCIMIENTOS_DEFECTO`).
 */
export type FiltrosVencimientos = FiltrosExistencias;

/** Colores que lista el reporte de vencimientos si no se pide otra cosa. */
export const SEMAFORO_VENCIMIENTOS_DEFECTO: readonly ColorSemaforo[] = ["VENCIDO", "ROJO", "AMARILLO"];

export interface ReporteVencimientos extends Paginado<FilaExistencia> {
  totales: TotalesExistencias;
  /** Colores efectivamente listados. */
  semaforo: readonly ColorSemaforo[];
}

function semaforoVencimientos(colores?: readonly ColorSemaforo[] | null): readonly ColorSemaforo[] {
  return colores && colores.length > 0 ? colores : SEMAFORO_VENCIMIENTOS_DEFECTO;
}

/** (d) Lotes con stock por color del semáforo, del que vence antes al que vence después. */
export async function reporteVencimientos(
  actor: Actor,
  filtros: FiltrosVencimientos = {},
  opciones: { ahora?: Date } = {},
): Promise<ReporteVencimientos> {
  verificarPermiso(actor, "reportes:ver");
  const centros = alcanceDeCentros(actor, filtros.centroId);
  const hoy = hoyEnSantiago(opciones.ahora);
  const semaforo = semaforoVencimientos(filtros.semaforo);
  const { pagina, porPagina, saltar } = normalizarPaginacion(filtros);
  const { filas, totales } = await consultarExistencias(
    {
      centros,
      categoriaId: filtros.categoriaId,
      texto: filtros.texto,
      semaforo,
      orden: "VENCIMIENTO",
      limite: porPagina,
      saltar,
    },
    hoy,
  );
  return { ...paginar(filas, totales.filas, pagina, porPagina), totales, semaforo };
}

export async function exportarVencimientos(
  actor: Actor,
  filtros: FiltrosVencimientos = {},
  opciones: { ahora?: Date } = {},
): Promise<ExportacionCsv> {
  verificarPermiso(actor, "reportes:ver");
  const centros = alcanceDeCentros(actor, filtros.centroId);
  const hoy = hoyEnSantiago(opciones.ahora);
  const semaforo = semaforoVencimientos(filtros.semaforo);
  const { filas } = await consultarExistencias(
    {
      centros,
      categoriaId: filtros.categoriaId,
      texto: filtros.texto,
      semaforo,
      orden: "VENCIMIENTO",
      limite: MAXIMO_FILAS_EXPORTACION + 1,
      saltar: 0,
    },
    hoy,
  );
  await auditarExportacion(actor, "vencimientos", {
    centroId: filtros.centroId ?? null,
    categoriaId: filtros.categoriaId ?? null,
    texto: textoDeBusqueda(filtros.texto),
    semaforo: [...semaforo],
    filas: filas.length,
  });
  return {
    archivo: nombreArchivoCsv("vencimientos", formatearDia(hoy)),
    // La columna "Semáforo" (Vencido / Rojo / Amarillo / Verde) ya viene en las existencias.
    encabezados: ENCABEZADOS_EXISTENCIAS,
    truncada: filas.length > MAXIMO_FILAS_EXPORTACION,
    filas: enLotes(filas, celdasExistencia),
  };
}

// ---------------------------------------------------------------------------
// (b) Movimientos por período — y (d) mermas del período
// ---------------------------------------------------------------------------

export interface FiltrosReporteMovimientos extends Paginacion {
  centroId?: string | null;
  tipo?: TipoMovimiento | null;
  insumoId?: string | null;
  /** Busca en nombre/código del insumo, número de lote y documento. */
  texto?: string | null;
  desde?: string | null;
  hasta?: string | null;
}

export interface FilaReporteMovimiento {
  id: string;
  creadoEn: Date;
  tipo: TipoMovimiento;
  centro: string;
  ubicacion: string;
  insumoId: string;
  codigo: string;
  nombre: string;
  unidadMedida: string;
  numeroLote: string;
  fechaVencimiento: DiaISO | null;
  cantidad: number;
  saldoPosterior: number;
  motivo: string | null;
  documentoRef: string | null;
  proveedor: string | null;
  costoUnitario: number | null;
  usuario: string;
  nota: string | null;
}

export interface ResumenTipoMovimiento {
  tipo: TipoMovimiento;
  movimientos: number;
  unidades: number;
}

export interface ReporteMovimientos extends Paginado<FilaReporteMovimiento> {
  periodo: PeriodoReporte;
  /** Un elemento por tipo con movimientos en el período, en el orden de `TIPOS_MOVIMIENTO`. */
  porTipo: ResumenTipoMovimiento[];
  /** Insumo filtrado (para mostrar su nombre); `null` si no se filtró o no existe. */
  insumo: { id: string; codigo: string; nombre: string } | null;
}

const SELECCION_MOVIMIENTO = {
  id: true,
  tipo: true,
  creadoEn: true,
  cantidad: true,
  saldoPosterior: true,
  motivo: true,
  documentoRef: true,
  costoUnitario: true,
  nota: true,
  insumo: { select: { id: true, codigo: true, nombre: true, unidadMedida: true } },
  lote: { select: { numeroLote: true, fechaVencimiento: true } },
  ubicacion: { select: { nombre: true } },
  centro: { select: { nombre: true } },
  usuario: { select: { nombre: true } },
  proveedor: { select: { razonSocial: true } },
} satisfies Prisma.MovimientoSelect;

type MovimientoSeleccionado = Prisma.MovimientoGetPayload<{ select: typeof SELECCION_MOVIMIENTO }>;

function aFilaMovimiento(m: MovimientoSeleccionado): FilaReporteMovimiento {
  return {
    id: m.id,
    creadoEn: m.creadoEn,
    tipo: m.tipo,
    centro: m.centro.nombre,
    ubicacion: m.ubicacion.nombre,
    insumoId: m.insumo.id,
    codigo: m.insumo.codigo,
    nombre: m.insumo.nombre,
    unidadMedida: m.insumo.unidadMedida,
    numeroLote: m.lote.numeroLote,
    fechaVencimiento: m.lote.fechaVencimiento ? dateADia(m.lote.fechaVencimiento) : null,
    cantidad: m.cantidad,
    saldoPosterior: m.saldoPosterior,
    motivo: m.motivo,
    documentoRef: m.documentoRef,
    proveedor: m.proveedor?.razonSocial ?? null,
    costoUnitario: m.costoUnitario === null ? null : Number(m.costoUnitario),
    usuario: m.usuario.nombre,
    nota: m.nota,
  };
}

/**
 * Filtro de un reporte de movimientos: el `where` de Prisma (alcance, período,
 * tipo, insumo) y, si hay texto, la consulta SQL que además busca sin
 * distinguir tildes (`porTexto`). Vista previa y CSV usan lo mismo.
 */
function condicionReporte(
  actor: Actor,
  filtros: FiltrosReporteMovimientos,
  periodo: PeriodoReporte,
): { where: Prisma.MovimientoWhereInput; porTexto: ConsultaPorTexto | null } {
  const base: FiltrosMovimientos = {
    centroId: filtros.centroId,
    insumoId: filtros.insumoId,
    tipo: filtros.tipo,
    desde: periodo.desde,
    hasta: periodo.hasta,
  };
  // `condicionMovimientos` valida el acceso al centro y aplica el alcance del actor.
  const where = condicionMovimientos(actor, base);
  const texto = textoDeBusqueda(filtros.texto);
  return { where, porTexto: texto ? consultaPorTexto(where, texto) : null };
}

/** Movimientos por id, en el orden del historial. */
function movimientosPorId(ids: readonly CursorMovimiento[]) {
  return db.movimiento.findMany({
    where: { id: { in: ids.map((f) => f.id) } },
    select: SELECCION_MOVIMIENTO,
    orderBy: ORDEN_MOVIMIENTOS,
  });
}

const ORDEN_MOVIMIENTOS = [{ creadoEn: "desc" }, { id: "desc" }] satisfies Prisma.MovimientoOrderByWithRelationInput[];

/** (b) Movimientos del período con totales por tipo. */
export async function reporteMovimientos(
  actor: Actor,
  filtros: FiltrosReporteMovimientos = {},
  opciones: { ahora?: Date } = {},
): Promise<ReporteMovimientos> {
  verificarPermiso(actor, "reportes:ver");
  const periodo = resolverPeriodo(filtros.desde, filtros.hasta, opciones.ahora);
  const { where, porTexto } = condicionReporte(actor, filtros, periodo);
  const { pagina, porPagina, saltar } = normalizarPaginacion(filtros);

  const [grupos, filas, insumo] = await Promise.all([
    porTexto
      ? porTexto.agrupar("tipo").then((g) => g.map((x) => ({ tipo: x.clave, _count: { _all: x.movimientos }, _sum: { cantidad: x.unidades } })))
      : db.movimiento.groupBy({ by: ["tipo"], where, _count: { _all: true }, _sum: { cantidad: true } }),
    porTexto
      ? porTexto.ids({ limite: porPagina, saltar }).then(movimientosPorId)
      : db.movimiento.findMany({
          where,
          select: SELECCION_MOVIMIENTO,
          orderBy: ORDEN_MOVIMIENTOS,
          skip: saltar,
          take: porPagina,
        }),
    filtros.insumoId
      ? db.insumo.findUnique({ where: { id: filtros.insumoId }, select: { id: true, codigo: true, nombre: true } })
      : Promise.resolve(null),
  ]);

  const porTipo = TIPOS_MOVIMIENTO.flatMap((tipo): ResumenTipoMovimiento[] => {
    const g = grupos.find((x) => x.tipo === tipo);
    return g ? [{ tipo, movimientos: g._count._all, unidades: g._sum.cantidad ?? 0 }] : [];
  });
  const total = porTipo.reduce((s, t) => s + t.movimientos, 0);
  return { ...paginar(filas.map(aFilaMovimiento), total, pagina, porPagina), periodo, porTipo, insumo };
}

const ENCABEZADOS_MOVIMIENTOS = [
  "Fecha y hora",
  "Tipo",
  "Centro",
  "Ubicación",
  "Código",
  "Insumo",
  "Unidad",
  "Lote",
  "Vencimiento",
  "Cantidad",
  "Cantidad con signo",
  "Saldo del lote en la ubicación",
  "Motivo",
  "Documento",
  "Proveedor",
  "Costo unitario (CLP)",
  "Usuario",
  "Nota",
];

function celdasMovimiento(m: FilaReporteMovimiento): CeldaCsv[] {
  return [
    formatearFechaHora(m.creadoEn),
    ETIQUETA_TIPO_MOVIMIENTO[m.tipo],
    m.centro,
    m.ubicacion,
    m.codigo,
    m.nombre,
    m.unidadMedida,
    m.numeroLote,
    m.fechaVencimiento ? formatearDia(m.fechaVencimiento) : "",
    m.cantidad,
    m.cantidad * SIGNO_MOVIMIENTO[m.tipo],
    m.saldoPosterior,
    m.motivo,
    m.documentoRef,
    m.proveedor,
    m.costoUnitario,
    m.usuario,
    m.nota,
  ];
}

const LOTE_EXPORTACION = 1_000;

/** Lee los movimientos por lotes con cursor (no usa OFFSET: escala a cientos de miles de filas). */
async function* leerMovimientos(
  where: Prisma.MovimientoWhereInput,
  porTexto: ConsultaPorTexto | null,
): AsyncGenerator<CeldaCsv[]> {
  // Una fila más que el tope: así `conAvisoDeTope` sabe que el archivo quedó incompleto.
  const limite = MAXIMO_FILAS_EXPORTACION + 1;
  let cursor: CursorMovimiento | undefined;
  let entregadas = 0;
  while (entregadas < limite) {
    const tomar = Math.min(LOTE_EXPORTACION, limite - entregadas);
    const lote = porTexto
      ? await porTexto.ids({ limite: tomar, despuesDe: cursor }).then(movimientosPorId)
      : await db.movimiento.findMany({
          where,
          select: SELECCION_MOVIMIENTO,
          orderBy: ORDEN_MOVIMIENTOS,
          take: tomar,
          ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
        });
    for (const m of lote) yield celdasMovimiento(aFilaMovimiento(m));
    entregadas += lote.length;
    if (lote.length < LOTE_EXPORTACION) return;
    const ultimo = lote[lote.length - 1];
    cursor = ultimo ? { id: ultimo.id, creadoEn: ultimo.creadoEn } : undefined;
  }
}

export async function exportarMovimientos(
  actor: Actor,
  filtros: FiltrosReporteMovimientos = {},
  opciones: { ahora?: Date } = {},
): Promise<ExportacionCsv> {
  verificarPermiso(actor, "reportes:ver");
  const periodo = resolverPeriodo(filtros.desde, filtros.hasta, opciones.ahora);
  const { where, porTexto } = condicionReporte(actor, filtros, periodo);
  const esMermas = filtros.tipo === "MERMA";
  const total = porTexto ? await porTexto.contar() : await db.movimiento.count({ where });
  await auditarExportacion(actor, esMermas ? "mermas" : "movimientos", {
    centroId: filtros.centroId ?? null,
    tipo: filtros.tipo ?? null,
    insumoId: filtros.insumoId ?? null,
    texto: textoDeBusqueda(filtros.texto),
    desde: periodo.desde,
    hasta: periodo.hasta,
    filas: total,
  });
  return {
    archivo: nombreArchivoCsv(esMermas ? "mermas" : "movimientos", sufijoPeriodo(periodo)),
    encabezados: ENCABEZADOS_MOVIMIENTOS,
    truncada: total > MAXIMO_FILAS_EXPORTACION,
    filas: leerMovimientos(where, porTexto),
  };
}

export interface ResumenMotivoMerma {
  motivo: string;
  movimientos: number;
  unidades: number;
}

export interface ReporteMermas extends Paginado<FilaReporteMovimiento> {
  periodo: PeriodoReporte;
  /** De mayor a menor cantidad de unidades. */
  porMotivo: ResumenMotivoMerma[];
  unidades: number;
}

/** (d) Mermas (bajas) del período con totales por motivo. */
export async function reporteMermas(
  actor: Actor,
  filtros: Omit<FiltrosReporteMovimientos, "tipo"> = {},
  opciones: { ahora?: Date } = {},
): Promise<ReporteMermas> {
  verificarPermiso(actor, "reportes:ver");
  const periodo = resolverPeriodo(filtros.desde, filtros.hasta, opciones.ahora);
  const { where, porTexto } = condicionReporte(actor, { ...filtros, tipo: "MERMA" }, periodo);
  const { pagina, porPagina, saltar } = normalizarPaginacion(filtros);

  const [grupos, filas] = await Promise.all([
    porTexto
      ? porTexto.agrupar("motivo").then((g) => g.map((x) => ({ motivo: x.clave, _count: { _all: x.movimientos }, _sum: { cantidad: x.unidades } })))
      : db.movimiento.groupBy({ by: ["motivo"], where, _count: { _all: true }, _sum: { cantidad: true } }),
    porTexto
      ? porTexto.ids({ limite: porPagina, saltar }).then(movimientosPorId)
      : db.movimiento.findMany({
          where,
          select: SELECCION_MOVIMIENTO,
          orderBy: ORDEN_MOVIMIENTOS,
          skip: saltar,
          take: porPagina,
        }),
  ]);
  const porMotivo = grupos
    .map((g): ResumenMotivoMerma => ({
      motivo: g.motivo?.trim() || "Sin motivo",
      movimientos: g._count._all,
      unidades: g._sum.cantidad ?? 0,
    }))
    .sort((a, b) => b.unidades - a.unidades || a.motivo.localeCompare(b.motivo, "es"));
  const total = porMotivo.reduce((s, m) => s + m.movimientos, 0);
  return {
    ...paginar(filas.map(aFilaMovimiento), total, pagina, porPagina),
    periodo,
    porMotivo,
    unidades: porMotivo.reduce((s, m) => s + m.unidades, 0),
  };
}

// ---------------------------------------------------------------------------
// (c) Consumo por insumo y período, con días de cobertura
// ---------------------------------------------------------------------------

export const ORDENES_CONSUMO = ["cobertura", "consumo"] as const;
export type OrdenConsumo = (typeof ORDENES_CONSUMO)[number];

export interface FiltrosConsumo extends Paginacion {
  centroId?: string | null;
  categoriaId?: string | null;
  texto?: string | null;
  desde?: string | null;
  hasta?: string | null;
  /** `cobertura` (menor primero; por defecto) o `consumo` (mayor primero). */
  orden?: OrdenConsumo | null;
}

export interface FilaConsumo {
  insumoId: string;
  codigo: string;
  nombre: string;
  unidadMedida: string;
  categoria: string;
  /** Unidades retiradas en el período. */
  consumo: number;
  /** Cantidad de retiros registrados en el período. */
  retiros: number;
  /** Consumo promedio por día del período. */
  promedioDiario: number;
  /** Stock utilizable hoy (excluye vencidos) en el alcance. */
  disponible: number;
  /** disponible ÷ promedio diario; `null` si no hubo consumo. */
  diasCobertura: number | null;
}

export interface ReporteConsumo extends Paginado<FilaConsumo> {
  periodo: PeriodoReporte;
  /** Insumos con consumo y cobertura menor a 7 días. */
  coberturaCritica: number;
  /** Insumos con consumo y cobertura entre 7 y menos de 30 días. */
  coberturaBaja: number;
  /** Insumos con consumo en el período. */
  conConsumo: number;
}

interface FilaConsumoSql {
  id: string;
  codigo: string;
  nombre: string;
  unidadMedida: string;
  categoria: string;
  consumo: number;
  retiros: number;
  disponible: number;
  total_filas: number;
  criticos: number;
  bajos: number;
  con_consumo: number;
}

async function consultarConsumo(
  centros: string[] | null,
  filtros: FiltrosConsumo,
  periodo: PeriodoReporte,
  hoy: DiaISO,
  limite: number,
  saltar: number,
): Promise<FilaConsumoSql[]> {
  const patron = patronDe(filtros.texto);
  const orden =
    filtros.orden === "consumo"
      ? Prisma.sql`b.consumo DESC, b."nombre" ASC, b."id" ASC`
      : Prisma.sql`b.cobertura ASC NULLS LAST, b."nombre" ASC, b."id" ASC`;
  return db.$queryRaw<FilaConsumoSql[]>(Prisma.sql`
    WITH consumo AS (
      SELECT m."insumoId" AS insumo_id, SUM(m."cantidad")::int AS consumo, COUNT(*)::int AS retiros
      FROM "movimientos" m
      WHERE m."tipo" = 'RETIRO'
        AND m."creadoEn" >= ${inicioDelDia(periodo.desde)} AND m."creadoEn" < ${finDelDia(periodo.hasta)}
        ${filtroCentros(Prisma.sql`m."centroId"`, centros)}
      GROUP BY m."insumoId"
    ),
    disp AS (
      SELECT l."insumoId" AS insumo_id, SUM(e."cantidad")::int AS disponible
      FROM "existencias" e
      JOIN "lotes" l ON l."id" = e."loteId"
      JOIN "ubicaciones" u ON u."id" = e."ubicacionId"
      JOIN "centros" ce ON ce."id" = u."centroId" AND ce."activo"
      WHERE (l."fechaVencimiento" IS NULL OR l."fechaVencimiento" >= ${hoy}::date)
        ${filtroCentros(Prisma.sql`u."centroId"`, centros)}
      GROUP BY l."insumoId"
    ),
    b AS (
      SELECT
        i."id", i."codigo", i."nombre", i."unidadMedida", ca."nombre" AS categoria,
        COALESCE(c.consumo, 0) AS consumo,
        COALESCE(c.retiros, 0) AS retiros,
        COALESCE(d.disponible, 0) AS disponible,
        CASE WHEN COALESCE(c.consumo, 0) > 0
          THEN COALESCE(d.disponible, 0) * ${periodo.dias}::float8 / c.consumo
        END AS cobertura
      FROM "insumos" i
      JOIN "categorias" ca ON ca."id" = i."categoriaId"
      LEFT JOIN consumo c ON c.insumo_id = i."id"
      LEFT JOIN disp d ON d.insumo_id = i."id"
      WHERE (COALESCE(c.consumo, 0) > 0 OR COALESCE(d.disponible, 0) > 0)
        ${filtros.categoriaId ? Prisma.sql`AND i."categoriaId" = ${filtros.categoriaId}` : Prisma.empty}
        ${
          patron
            ? Prisma.sql`AND (unaccent(i."nombre") ILIKE unaccent(${patron}) OR i."codigo" ILIKE ${patron})`
            : Prisma.empty
        }
    )
    SELECT
      b."id", b."codigo", b."nombre", b."unidadMedida", b.categoria,
      b.consumo::int AS consumo, b.retiros::int AS retiros, b.disponible::int AS disponible,
      (COUNT(*) OVER ())::int AS total_filas,
      (COUNT(*) FILTER (WHERE b.cobertura < ${DIAS_COBERTURA_CRITICA}) OVER ())::int AS criticos,
      (COUNT(*) FILTER (
        WHERE b.cobertura >= ${DIAS_COBERTURA_CRITICA} AND b.cobertura < ${DIAS_COBERTURA_BAJA}
      ) OVER ())::int AS bajos,
      (COUNT(*) FILTER (WHERE b.consumo > 0) OVER ())::int AS con_consumo
    FROM b
    ORDER BY ${orden}
    LIMIT ${limite} OFFSET ${saltar}
  `);
}

function aFilaConsumo(f: FilaConsumoSql, periodo: PeriodoReporte): FilaConsumo {
  const cobertura = calcularCobertura(f.disponible, f.consumo, periodo.dias);
  return {
    insumoId: f.id,
    codigo: f.codigo,
    nombre: f.nombre,
    unidadMedida: f.unidadMedida,
    categoria: f.categoria,
    consumo: f.consumo,
    retiros: f.retiros,
    promedioDiario: cobertura.promedioDiario,
    disponible: f.disponible,
    diasCobertura: cobertura.diasCobertura,
  };
}

/**
 * (c) Consumo (retiros) por insumo en el período, promedio diario y días de
 * cobertura estimados con el stock utilizable de hoy. Incluye los insumos con
 * consumo en el período o con stock disponible.
 */
export async function reporteConsumo(
  actor: Actor,
  filtros: FiltrosConsumo = {},
  opciones: { ahora?: Date } = {},
): Promise<ReporteConsumo> {
  verificarPermiso(actor, "reportes:ver");
  const centros = alcanceDeCentros(actor, filtros.centroId);
  const periodo = resolverPeriodo(filtros.desde, filtros.hasta, opciones.ahora);
  const { pagina, porPagina, saltar } = normalizarPaginacion(filtros);
  const hoy = hoyEnSantiago(opciones.ahora);
  const filas = await consultarConsumo(centros, filtros, periodo, hoy, porPagina, saltar);
  // Página fuera de rango: se consulta una fila para conservar los totales.
  const referencia = filas[0] ?? (saltar > 0 ? (await consultarConsumo(centros, filtros, periodo, hoy, 1, 0))[0] : undefined);
  return {
    ...paginar(filas.map((f) => aFilaConsumo(f, periodo)), referencia?.total_filas ?? 0, pagina, porPagina),
    periodo,
    coberturaCritica: referencia?.criticos ?? 0,
    coberturaBaja: referencia?.bajos ?? 0,
    conConsumo: referencia?.con_consumo ?? 0,
  };
}

export async function exportarConsumo(
  actor: Actor,
  filtros: FiltrosConsumo = {},
  opciones: { ahora?: Date } = {},
): Promise<ExportacionCsv> {
  verificarPermiso(actor, "reportes:ver");
  const centros = alcanceDeCentros(actor, filtros.centroId);
  const periodo = resolverPeriodo(filtros.desde, filtros.hasta, opciones.ahora);
  // Una fila por insumo del catálogo: acotado, se lee de una vez.
  const filas = await consultarConsumo(
    centros,
    filtros,
    periodo,
    hoyEnSantiago(opciones.ahora),
    MAXIMO_FILAS_EXPORTACION + 1,
    0,
  );
  await auditarExportacion(actor, "consumo", {
    centroId: filtros.centroId ?? null,
    categoriaId: filtros.categoriaId ?? null,
    texto: textoDeBusqueda(filtros.texto),
    desde: periodo.desde,
    hasta: periodo.hasta,
    filas: filas.length,
  });
  return {
    archivo: nombreArchivoCsv("consumo", sufijoPeriodo(periodo)),
    encabezados: [
      "Categoría",
      "Código",
      "Insumo",
      "Unidad",
      "Desde",
      "Hasta",
      "Días del período",
      "Retiros",
      "Consumo del período",
      "Promedio diario",
      "Disponible hoy",
      "Días de cobertura estimados",
    ],
    truncada: filas.length > MAXIMO_FILAS_EXPORTACION,
    filas: enLotes(filas, (sql) => {
      const f = aFilaConsumo(sql, periodo);
      return [
        f.categoria,
        f.codigo,
        f.nombre,
        f.unidadMedida,
        formatearDia(periodo.desde),
        formatearDia(periodo.hasta),
        periodo.dias,
        f.retiros,
        f.consumo,
        Math.round(f.promedioDiario * 100) / 100,
        f.disponible,
        f.diasCobertura,
      ];
    }),
  };
}
