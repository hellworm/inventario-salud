import { beforeAll, describe, expect, it } from "vitest";
import { generarCsv, type CeldaCsv } from "@/lib/csv";
import { formatearDia } from "@/lib/fechas";
import { db } from "@/server/db";
import {
  exportarConsumo,
  exportarExistencias,
  exportarMovimientos,
  exportarReposicion,
  exportarVencimientos,
  listaReposicion,
  obtenerAlertas,
  registrarIngreso,
  registrarMerma,
  registrarRetiro,
  reporteConsumo,
  reporteExistencias,
  reporteMermas,
  reporteMovimientos,
  reporteVencimientos,
  resolverPeriodo,
  resumenPanel,
  type ExportacionCsv,
} from "@/server/servicios";
import { crearEscenario, esperarError, sembrarLoteVencido, type Escenario } from "./soporte/escenario";

/**
 * Escenario (dializador salvo que se indique):
 *  Centro A · Bodega
 *   - D-VENC   4 u. vencidas hace 3 días, sin costo.
 *   - D-3      2 u. vence en 3 días, sin costo.
 *   - D-20     6 u. vence en 20 días, costo $1.500.
 *   - D-NUEVO  100 u. (vence en 200 días, costo $1.000) ingresadas hace 25 días;
 *              retiro de 40 hace 20 días y de 30 hoy → quedan 30.
 *   - Tela T-1 25 u. sin vencimiento ni costo.
 *   Disponible A = 38. Mínimo 50 / máximo 80 → falta 12 para el mínimo y 42 para el máximo.
 *   Guantes: mínimo 50, sin máximo, sin existencias → SIN_STOCK.
 *  Centro B · Bodega
 *   - D-B      40 u. (vence en 45 días, costo $2.000), retiro de 10 hoy → quedan 30. Mínimo 10 → OK.
 */
let e: Escenario;
let loteVencido: string;
const NOTA_MALICIOSA = '=HYPERLINK("http://malicioso.example";"clic")';

const haceDias = (n: number) => new Date(Date.now() - n * 86_400_000);

async function aCsv(exportacion: ExportacionCsv): Promise<{ csv: string; filas: CeldaCsv[][] }> {
  const filas: CeldaCsv[][] = [];
  for await (const fila of exportacion.filas) filas.push(fila);
  return { csv: generarCsv(exportacion.encabezados, filas), filas };
}

const exportacionesAuditadas = (clave: string) =>
  db.registroAuditoria.findMany({ where: { accion: "REPORTE_EXPORTADO", entidadId: clave }, orderBy: { creadoEn: "asc" } });

beforeAll(async () => {
  e = await crearEscenario();
  await registrarIngreso(
    e.admin,
    { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "D-NUEVO", fechaVencimiento: e.dia(200), cantidad: 100, costoUnitario: "1000" },
    { ahora: haceDias(25) },
  );
  await registrarRetiro(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, cantidad: 40, motivo: "Uso en sala" }, { ahora: haceDias(20) });
  // Se siembra después del retiro antiguo: hace 20 días este lote aún no vencía y FEFO lo habría consumido.
  loteVencido = await sembrarLoteVencido(e.dializador, e.bodegaA, 4, "D-VENC", 3);
  await registrarIngreso(e.admin, { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "D-3", fechaVencimiento: e.dia(3), cantidad: 2 });
  await registrarIngreso(e.admin, { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "D-20", fechaVencimiento: e.dia(20), cantidad: 6, costoUnitario: "1500" });
  const nuevo = await db.lote.findFirstOrThrow({ where: { numeroLote: "D-NUEVO" } });
  await registrarRetiro(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, loteId: nuevo.id, cantidad: 30, nota: NOTA_MALICIOSA });
  await registrarIngreso(e.admin, { ubicacionId: e.bodegaB, insumoId: e.dializador, numeroLote: "D-B", fechaVencimiento: e.dia(45), cantidad: 40, costoUnitario: "2000" });
  await registrarRetiro(e.bodegueroB, { ubicacionId: e.bodegaB, insumoId: e.dializador, cantidad: 10 });
  await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.tela, numeroLote: "T-1", cantidad: 25 });
  await db.parametroStock.createMany({
    data: [
      { insumoId: e.dializador, centroId: e.centroA, stockMinimo: 50, stockMaximo: 80 },
      { insumoId: e.dializador, centroId: e.centroB, stockMinimo: 10 },
      { insumoId: e.guantes, centroId: e.centroA, stockMinimo: 50 },
    ],
  });
});

describe("permisos de reportes y exportaciones", () => {
  it("solo quien tiene reportes:ver puede consultar o exportar reportes", async () => {
    for (const actor of [e.bodeguero, e.visitante]) {
      await esperarError(reporteExistencias(actor), "SIN_PERMISO");
      await esperarError(reporteMovimientos(actor), "SIN_PERMISO");
      await esperarError(reporteConsumo(actor), "SIN_PERMISO");
      await esperarError(reporteVencimientos(actor), "SIN_PERMISO");
      await esperarError(reporteMermas(actor), "SIN_PERMISO");
      await esperarError(exportarExistencias(actor), "SIN_PERMISO");
      await esperarError(exportarMovimientos(actor), "SIN_PERMISO");
      await esperarError(exportarConsumo(actor), "SIN_PERMISO");
      await esperarError(exportarVencimientos(actor), "SIN_PERMISO");
    }
    expect(await db.registroAuditoria.count({ where: { accion: "REPORTE_EXPORTADO" } })).toBe(0);
  });

  it("la lista de reposición no se puede pedir ni exportar para un centro ajeno", async () => {
    await esperarError(listaReposicion(e.visitante, { centroId: e.centroB }), "SIN_ACCESO_AL_CENTRO");
    await esperarError(exportarReposicion(e.visitante, { centroId: e.centroB }), "SIN_ACCESO_AL_CENTRO");
    await esperarError(exportarReposicion(e.bodeguero, { centroId: e.centroB }), "SIN_ACCESO_AL_CENTRO");
    await esperarError(obtenerAlertas(e.bodegueroB, { centroId: e.centroA }), "SIN_ACCESO_AL_CENTRO");
    expect(await exportacionesAuditadas("reposicion")).toHaveLength(0);
  });
});

describe("alertas con filtros", () => {
  it("filtra por texto (sin tildes) en insumo, código y lote, y por categoría", async () => {
    const porLote = await obtenerAlertas(e.admin, { texto: "d-venc" });
    expect(porLote.vencimientos.map((v) => v.numeroLote)).toEqual(["D-VENC"]);
    expect(porLote.stock).toEqual([]);

    const porNombre = await obtenerAlertas(e.admin, { texto: "DIALIZADOR" });
    expect(porNombre.stock.map((s) => s.codigo)).toEqual(["DIA-001"]);
    expect(porNombre.resumen).toMatchObject({ sinStock: 0, bajoMinimo: 1, vencidos: 1, rojo: 3, amarillo: 0 });

    const porCodigo = await obtenerAlertas(e.admin, { texto: "gua-001" });
    expect(porCodigo.stock.map((s) => s.tipo)).toEqual(["SIN_STOCK"]);
    expect(porCodigo.vencimientos).toEqual([]);

    const otraCategoria = await obtenerAlertas(e.admin, { categoriaId: "no-existe" });
    expect(otraCategoria.resumen.total).toBe(0);
    const categoria = await db.categoria.findFirstOrThrow();
    expect((await obtenerAlertas(e.admin, { categoriaId: categoria.id })).resumen.total).toBe(6);
  });
});

describe("lista de reposición", () => {
  it("agrupa por centro y calcula lo que falta para el mínimo y el máximo", async () => {
    const lista = await listaReposicion(e.admin);
    expect(lista).toMatchObject({ dia: e.hoy, totalItems: 2, sinStock: 1 });
    expect(lista.grupos).toHaveLength(1);
    expect(lista.grupos[0]!.centro).toBe("Centro A");
    expect(
      lista.grupos[0]!.items.map((i) => [i.codigo, i.tipo, i.disponible, i.stockMinimo, i.stockMaximo, i.faltante, i.faltaParaMaximo, i.sugerido]),
    ).toEqual([
      ["DIA-001", "BAJO_MINIMO", 38, 50, 80, 12, 42, 42],
      ["GUA-001", "SIN_STOCK", 0, 50, null, 50, null, 50],
    ]);
  });

  it("cada rol ve solo sus centros", async () => {
    expect((await listaReposicion(e.visitante)).totalItems).toBe(2);
    expect((await listaReposicion(e.bodegueroB)).totalItems).toBe(0);
    expect((await listaReposicion(e.admin, { centroId: e.centroB })).grupos).toEqual([]);
  });

  it("exporta a CSV y deja registro en la auditoría", async () => {
    const exportacion = await exportarReposicion(e.visitante, { centroId: e.centroA });
    expect(exportacion.archivo).toBe(`lista-reposicion_${formatearDia(e.hoy)}.csv`);
    const { csv, filas } = await aCsv(exportacion);
    expect(filas).toHaveLength(2);
    expect(csv.startsWith("﻿Centro;Categoría;Código;Insumo;Unidad;Estado;Disponible;")).toBe(true);
    expect(csv).toContain("Centro A;General;DIA-001;Dializador 1.8 m²;unidad;Bajo mínimo;38;50;80;12;42;42;;;;\r\n");
    expect(csv).toContain("Centro A;General;GUA-001;Guantes de nitrilo M;unidad;Sin stock;0;50;;50;;50;;;;\r\n");

    const auditoria = await exportacionesAuditadas("reposicion");
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]).toMatchObject({ usuarioId: e.visitante.usuarioId, entidad: "Reporte" });
    expect(auditoria[0]!.detalle).toMatchObject({ formato: "csv", filtros: { centroId: e.centroA, filas: 2 } });
  });
});

describe("reporteExistencias", () => {
  it("lista por centro, ubicación y lote con costo promedio y valor", async () => {
    const r = await reporteExistencias(e.admin);
    expect(r.items.map((f) => [f.centro, f.numeroLote, f.cantidad, f.costoUnitario, f.valor, f.diasParaVencer])).toEqual([
      ["Centro A", "D-VENC", 4, null, null, -3],
      ["Centro A", "D-3", 2, null, null, 3],
      ["Centro A", "D-20", 6, 1500, 9000, 20],
      ["Centro A", "D-NUEVO", 30, 1000, 30000, 200],
      ["Centro A", "T-1", 25, null, null, null],
      ["Centro B", "D-B", 30, 2000, 60000, 45],
    ]);
    expect(r.totales).toEqual({ filas: 6, unidades: 97, valor: 99000, filasSinCosto: 3 });
    expect(r).toMatchObject({ total: 6, pagina: 1, totalPaginas: 1 });
  });

  it("filtra por centro y texto, y pagina en la base", async () => {
    const b = await reporteExistencias(e.admin, { centroId: e.centroB });
    expect(b.totales).toEqual({ filas: 1, unidades: 30, valor: 60000, filasSinCosto: 0 });
    const tela = await reporteExistencias(e.admin, { texto: "ADHESIVA" });
    expect(tela.items.map((f) => f.codigo)).toEqual(["TEL-001"]);
    const lote = await reporteExistencias(e.admin, { texto: "d-nuevo" });
    expect(lote.items.map((f) => f.numeroLote)).toEqual(["D-NUEVO"]);
    const p2 = await reporteExistencias(e.admin, { porPagina: 4, pagina: 2 });
    expect(p2.items.map((f) => f.numeroLote)).toEqual(["T-1", "D-B"]);
    expect(p2).toMatchObject({ total: 6, totalPaginas: 2 });
  });

  it("exporta todas las filas y audita", async () => {
    const { csv, filas } = await aCsv(await exportarExistencias(e.admin, { centroId: e.centroA }));
    expect(filas).toHaveLength(5);
    expect(csv).toContain(`Centro A;Bodega;General;DIA-001;Dializador 1.8 m²;unidad;D-20;${formatearDia(e.dia(20))};20;Rojo;6;1500;9000;\r\n`);
    const auditoria = await exportacionesAuditadas("existencias");
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]!.detalle).toMatchObject({ filtros: { centroId: e.centroA, filas: 5 } });
  });
});

describe("resolverPeriodo", () => {
  const ahora = new Date("2026-11-19T15:00:00.000Z");
  it("usa los últimos 30 días por defecto", () => {
    expect(resolverPeriodo(null, null, ahora)).toEqual({ desde: "2026-10-21", hasta: "2026-11-19", dias: 30 });
  });
  it("acepta dd-MM-yyyy, ordena fechas invertidas y no cuenta días futuros", () => {
    expect(resolverPeriodo("10-11-2026", "2026-11-01", ahora)).toEqual({ desde: "2026-11-01", hasta: "2026-11-10", dias: 10 });
    expect(resolverPeriodo("2026-11-10", "2026-11-30", ahora)).toEqual({ desde: "2026-11-10", hasta: "2026-11-30", dias: 10 });
    expect(resolverPeriodo("2026-12-01", "2026-12-31", ahora).dias).toBe(1);
    expect(resolverPeriodo("no-es-fecha", "", ahora)).toEqual({ desde: "2026-10-21", hasta: "2026-11-19", dias: 30 });
  });
});

describe("reporteConsumo", () => {
  it("calcula consumo, promedio diario y días de cobertura", async () => {
    const r = await reporteConsumo(e.admin, { centroId: e.centroA });
    expect(r.periodo.dias).toBe(30);
    expect(r.items.map((f) => [f.codigo, f.consumo, f.retiros, f.disponible, f.diasCobertura])).toEqual([
      // 38 disponibles ÷ (70 ÷ 30 días) = 16,28 → 16,2
      ["DIA-001", 70, 2, 38, 16.2],
      ["TEL-001", 0, 0, 25, null],
    ]);
    expect(r.items[0]!.promedioDiario).toBeCloseTo(70 / 30, 10);
    expect(r).toMatchObject({ total: 2, conConsumo: 1, coberturaCritica: 0, coberturaBaja: 1 });
  });

  it("respeta el período y el alcance", async () => {
    const corto = await reporteConsumo(e.admin, { centroId: e.centroA, desde: e.dia(-9), hasta: e.hoy });
    // Solo el retiro de hoy: 38 ÷ (30 ÷ 10) = 12,66 → 12,6
    expect(corto.items[0]).toMatchObject({ codigo: "DIA-001", consumo: 30, retiros: 1, diasCobertura: 12.6 });

    const red = await reporteConsumo(e.admin);
    // 68 disponibles ÷ (80 ÷ 30) = 25,5
    expect(red.items[0]).toMatchObject({ codigo: "DIA-001", consumo: 80, disponible: 68, diasCobertura: 25.5 });

    const sinConsumo = await reporteConsumo(e.admin, { desde: e.dia(-60), hasta: e.dia(-40) });
    expect(sinConsumo.items.every((f) => f.consumo === 0 && f.diasCobertura === null)).toBe(true);
    expect(sinConsumo.conConsumo).toBe(0);
  });

  it("ordena por consumo, filtra por texto y conserva totales fuera de rango", async () => {
    const porConsumo = await reporteConsumo(e.admin, { orden: "consumo" });
    expect(porConsumo.items.map((f) => f.codigo)).toEqual(["DIA-001", "TEL-001"]);
    expect((await reporteConsumo(e.admin, { texto: "tela" })).items.map((f) => f.codigo)).toEqual(["TEL-001"]);
    const lejos = await reporteConsumo(e.admin, { pagina: 9 });
    expect(lejos.items).toEqual([]);
    expect(lejos).toMatchObject({ total: 2, conConsumo: 1 });
  });

  it("exporta con el período y la cobertura", async () => {
    const { csv, filas } = await aCsv(await exportarConsumo(e.admin, { centroId: e.centroA }));
    expect(filas).toHaveLength(2);
    expect(csv).toContain(`General;DIA-001;Dializador 1.8 m²;unidad;${formatearDia(e.dia(-29))};${formatearDia(e.hoy)};30;2;70;2,33;38;16,2\r\n`);
    expect(csv).toContain(";0;0;0;25;\r\n");
    expect(await exportacionesAuditadas("consumo")).toHaveLength(1);
  });
});

describe("reporteMovimientos", () => {
  it("resume por tipo y pagina del más reciente al más antiguo", async () => {
    const r = await reporteMovimientos(e.admin);
    expect(r.porTipo).toEqual([
      { tipo: "INGRESO", movimientos: 5, unidades: 173 },
      { tipo: "RETIRO", movimientos: 3, unidades: 80 },
    ]);
    expect(r.total).toBe(8);
    const fechas = r.items.map((m) => m.creadoEn.getTime());
    expect(fechas).toEqual([...fechas].sort((a, b) => b - a));
  });

  it("filtra por tipo, centro, insumo y período", async () => {
    expect((await reporteMovimientos(e.admin, { tipo: "RETIRO" })).total).toBe(3);
    expect((await reporteMovimientos(e.admin, { centroId: e.centroB })).total).toBe(2);
    const deTela = await reporteMovimientos(e.admin, { insumoId: e.tela });
    expect(deTela.total).toBe(1);
    expect(deTela.insumo).toMatchObject({ codigo: "TEL-001" });
    expect((await reporteMovimientos(e.admin, { desde: e.dia(-22), hasta: e.dia(-18) })).total).toBe(1);
    expect((await reporteMovimientos(e.admin, { desde: e.hoy, hasta: e.hoy })).total).toBe(6);
  });

  it("exporta por lotes, neutraliza fórmulas y audita", async () => {
    const { csv, filas } = await aCsv(await exportarMovimientos(e.admin, { tipo: "RETIRO" }));
    expect(filas).toHaveLength(3);
    expect(csv).toContain('"\'=HYPERLINK(""http://malicioso.example"";""clic"")"');
    expect(csv).not.toMatch(/(^|;)=HYPERLINK/m);
    // Cantidad con signo: los retiros restan.
    expect(csv).toContain(";40;-40;60;Uso en sala;");
    const auditoria = await exportacionesAuditadas("movimientos");
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]!.detalle).toMatchObject({ filtros: { tipo: "RETIRO", filas: 3 } });
  });
});

describe("reporteVencimientos", () => {
  it("por defecto lista vencidos, rojo y amarillo, del más urgente al menos; el verde solo si se pide", async () => {
    const porDefecto = await reporteVencimientos(e.admin);
    expect(porDefecto.semaforo).toEqual(["VENCIDO", "ROJO", "AMARILLO"]);
    expect(porDefecto.items.map((f) => [f.numeroLote, f.diasParaVencer, f.estadoVencimiento])).toEqual([
      ["D-VENC", -3, "VENCIDO"],
      ["D-3", 3, "ROJO"],
      ["D-20", 20, "ROJO"],
      ["D-B", 45, "ROJO"],
    ]);

    const rojoA = await reporteVencimientos(e.admin, { centroId: e.centroA, semaforo: ["ROJO"] });
    expect(rojoA.items.map((f) => f.numeroLote)).toEqual(["D-3", "D-20"]);
    expect(rojoA.totales).toEqual({ filas: 2, unidades: 8, valor: 9000, filasSinCosto: 1 });

    const verde = await reporteVencimientos(e.admin, { semaforo: ["VERDE"] });
    expect(verde.items.map((f) => [f.numeroLote, f.estadoVencimiento])).toEqual([["D-NUEVO", "VERDE"]]);
    expect((await reporteVencimientos(e.admin, { semaforo: ["AMARILLO"] })).total).toBe(0);
    expect((await reporteVencimientos(e.admin, { centroId: e.centroB })).items.map((f) => f.numeroLote)).toEqual(["D-B"]);
  });

  it("el reporte de existencias trae el semáforo de cada lote y se puede filtrar por color", async () => {
    const todo = await reporteExistencias(e.admin, { centroId: e.centroA });
    expect(Object.fromEntries(todo.items.map((f) => [f.numeroLote, f.estadoVencimiento]))).toEqual({
      "D-VENC": "VENCIDO",
      "D-3": "ROJO",
      "D-20": "ROJO",
      "D-NUEVO": "VERDE",
      "T-1": "SIN_VENCIMIENTO",
    });
    const vencidos = await reporteExistencias(e.admin, { centroId: e.centroA, semaforo: ["VENCIDO"] });
    expect(vencidos.items.map((f) => f.numeroLote)).toEqual(["D-VENC"]);
    expect(vencidos.totales.filas).toBe(1);
  });

  it("exporta con la columna de texto «Semáforo» (Vencido / Rojo / Amarillo / Verde)", async () => {
    const exportacion = await exportarVencimientos(e.admin, { semaforo: ["VENCIDO", "ROJO"], centroId: e.centroA });
    const columna = exportacion.encabezados.indexOf("Semáforo");
    expect(columna).toBeGreaterThan(-1);
    const { filas } = await aCsv(exportacion);
    const lote = exportacion.encabezados.indexOf("Lote");
    expect(filas.map((f) => [f[lote], f[columna]])).toEqual([
      ["D-VENC", "Vencido"],
      ["D-3", "Rojo"],
      ["D-20", "Rojo"],
    ]);
    const auditoria = await exportacionesAuditadas("vencimientos");
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]!.detalle).toMatchObject({ filtros: { semaforo: ["VENCIDO", "ROJO"], filas: 3 } });

    const existencias = await aCsv(await exportarExistencias(e.admin, { centroId: e.centroA, semaforo: ["VERDE"] }));
    expect(existencias.csv).toMatch(/D-NUEVO;[^\r]*;Verde;/);
    expect(existencias.filas).toHaveLength(1);
  });
});

describe("resumenPanel: qué requiere atención hoy", () => {
  it("prioriza sin stock, vencidos y lo que vence esta semana", async () => {
    const p = await resumenPanel(e.visitante, { centroId: e.centroA });
    expect(p.puedeVerMovimientos).toBe(false);
    expect(p.atencion.total).toBe(3);
    expect(p.atencion.sinStock).toMatchObject({ total: 1, items: [{ codigo: "GUA-001" }] });
    expect(p.atencion.vencidos).toMatchObject({ total: 1, items: [{ numeroLote: "D-VENC", cantidad: 4 }] });
    expect(p.atencion.venceEstaSemana).toMatchObject({ total: 1, items: [{ numeroLote: "D-3", dias: 3 }] });
    expect(p.semaforo).toMatchObject({
      VENCIDO: { insumos: 1, lotes: 1, unidades: 4 },
      ROJO: { insumos: 1, lotes: 2, unidades: 8 },
      AMARILLO: { insumos: 0, lotes: 0, unidades: 0 },
      VERDE: { insumos: 1, lotes: 1, unidades: 30 },
    });
    // Productos en rojo: lo que vence antes, primero.
    expect(p.enRojo.map((l) => [l.numeroLote, l.dias])).toEqual([
      ["D-3", 3],
      ["D-20", 20],
    ]);
    await esperarError(resumenPanel(e.visitante, { centroId: e.centroB }), "SIN_ACCESO_AL_CENTRO");
  });

  it("limita los ítems por grupo pero conserva el total", async () => {
    const p = await resumenPanel(e.admin, { porGrupoAtencion: 1 });
    expect(p.atencion.sinStock.items).toHaveLength(1);
    expect(p.semaforo.ROJO).toEqual({ insumos: 1, lotes: 3, unidades: 38 });
  });
});

describe("reporteMermas", () => {
  it("resume las bajas del período por motivo y las exporta", async () => {
    await registrarMerma(e.admin, { ubicacionId: e.bodegaA, loteId: loteVencido, cantidad: 4, motivo: "Vencimiento" });
    const d20 = await db.lote.findFirstOrThrow({ where: { numeroLote: "D-20" } });
    await registrarMerma(e.admin, { ubicacionId: e.bodegaA, loteId: d20.id, cantidad: 1, motivo: "Daño o rotura" });

    const r = await reporteMermas(e.admin);
    expect(r.porMotivo).toEqual([
      { motivo: "Vencimiento", movimientos: 1, unidades: 4 },
      { motivo: "Daño o rotura", movimientos: 1, unidades: 1 },
    ]);
    expect(r).toMatchObject({ total: 2, unidades: 5 });
    expect(r.items.every((m) => m.tipo === "MERMA")).toBe(true);
    expect((await reporteMermas(e.admin, { centroId: e.centroB })).total).toBe(0);
    expect((await reporteMermas(e.admin, { hasta: e.dia(-1), desde: e.dia(-30) })).total).toBe(0);

    const { filas } = await aCsv(await exportarMovimientos(e.admin, { tipo: "MERMA" }));
    expect(filas).toHaveLength(2);
    expect(await exportacionesAuditadas("mermas")).toHaveLength(1);
  });
});
