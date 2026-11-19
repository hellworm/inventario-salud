/**
 * Regresiones de los bugs de QA cerrados al final del proyecto (B-01 a B-15)
 * y de los cabos de integración, contra la base real de tests.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { generarCsv, type CeldaCsv } from "@/lib/csv";
import { db } from "@/server/db";
import {
  buscarInsumos,
  exportarExistencias,
  exportarMovimientos,
  exportarReposicion,
  listarAuditoria,
  listarInsumosAdmin,
  listarInventario,
  listarMovimientos,
  listarProveedoresAdmin,
  listarUsuarios,
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
import { crearEscenario, esperarError, type Escenario } from "./soporte/escenario";

let e: Escenario;

beforeEach(async () => {
  e = await crearEscenario();
});

async function aCsv(exportacion: ExportacionCsv): Promise<{ csv: string; filas: CeldaCsv[][] }> {
  const filas: CeldaCsv[][] = [];
  for await (const fila of exportacion.filas) filas.push(fila);
  return { csv: generarCsv(exportacion.encabezados, filas), filas };
}

describe("B-01 — costo unitario", () => {
  const ingreso = (costoUnitario: string, numeroLote: string) =>
    registrarIngreso(e.bodeguero, {
      ubicacionId: e.bodegaA,
      insumoId: e.dializador,
      numeroLote,
      fechaVencimiento: e.dia(200),
      cantidad: 5,
      costoUnitario,
    });
  const costoGuardado = async (id: string) => Number((await db.movimiento.findUniqueOrThrow({ where: { id } })).costoUnitario);

  it("con punto decimal se rechaza y no se guarda nada (antes quedaba multiplicado por 10)", async () => {
    for (const [texto, sugerencia] of [["1250.5", "1250,5"], ["1.5", "1,5"]] as const) {
      const error = await esperarError(ingreso(texto, `L-${texto}`), "VALIDACION");
      expect(JSON.stringify(error.detalle)).toContain(`Usa coma para los decimales: ${sugerencia}.`);
    }
    expect(await db.movimiento.count()).toBe(0);
    expect(await db.lote.count()).toBe(0);
  });

  it("con coma decimal o miles con punto se guarda el valor exacto", async () => {
    expect(await costoGuardado((await ingreso("1.250,5", "L-A")).movimiento.id)).toBe(1250.5);
    expect(await costoGuardado((await ingreso("1250,5", "L-B")).movimiento.id)).toBe(1250.5);
    expect(await costoGuardado((await ingreso("1.250", "L-C")).movimiento.id)).toBe(1250);
    expect(await costoGuardado((await ingreso("0,75", "L-D")).movimiento.id)).toBe(0.75);
  });

  it("aplica el tope de sanidad", async () => {
    await esperarError(ingreso("100.000.001", "L-X"), "VALIDACION");
    expect(await costoGuardado((await ingreso("100.000.000", "L-Y")).movimiento.id)).toBe(100_000_000);
  });
});

describe("B-15 — número de lote con espacios", () => {
  it("espacios internos repetidos o en los extremos no crean un lote distinto", async () => {
    const base = { ubicacionId: e.bodegaA, insumoId: e.dializador, fechaVencimiento: e.dia(200), cantidad: 5 };
    const primero = await registrarIngreso(e.bodeguero, { ...base, numeroLote: "Lote  7   b" });
    const segundo = await registrarIngreso(e.bodeguero, { ...base, numeroLote: "  LOTE 7 B " });
    const tercero = await registrarIngreso(e.bodeguero, { ...base, numeroLote: "lote\t7 b" });
    expect(primero.movimiento.numeroLote).toBe("LOTE 7 B");
    expect(primero.loteCreado).toBe(true);
    expect(segundo.loteCreado).toBe(false);
    expect(tercero.movimiento.loteId).toBe(primero.movimiento.loteId);
    expect(tercero.movimiento.saldoPosterior).toBe(15);
    expect(await db.lote.count()).toBe(1);
  });
});

describe("B-06 — lote sin fecha en un insumo que pasa a controlar vencimiento", () => {
  it("el ingreso sin fecha se rechaza en el campo de fecha; con fecha la completa", async () => {
    await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.tela, numeroLote: "T-1", cantidad: 10 });
    await db.insumo.update({ where: { id: e.tela }, data: { controlaVencimiento: true } });

    const error = await esperarError(
      registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.tela, numeroLote: "T-1", cantidad: 5 }),
      "VENCIMIENTO_REQUERIDO",
    );
    expect(error.campo).toBe("fechaVencimiento");

    const ok = await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.tela, numeroLote: "T-1", fechaVencimiento: e.dia(120), cantidad: 5 });
    expect(ok.movimiento.saldoPosterior).toBe(15);
    expect(ok.loteCreado).toBe(false);
  });

  it("si el lote tiene stock en otro centro, el mensaje dice con claridad que debe corregirlo un administrador", async () => {
    await registrarIngreso(e.bodegueroB, { ubicacionId: e.bodegaB, insumoId: e.tela, numeroLote: "T-2", cantidad: 10 });
    await db.insumo.update({ where: { id: e.tela }, data: { controlaVencimiento: true } });
    const error = await esperarError(
      registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.tela, numeroLote: "T-2", fechaVencimiento: e.dia(120), cantidad: 5 }),
      "LOTE_INCONSISTENTE",
    );
    expect(error.campo).toBe("fechaVencimiento");
    expect(error.message).toMatch(/existencias en otros centros/);
    expect(error.message).toMatch(/administrador/);
    expect(error.message).not.toMatch(/Deja la fecha en blanco/);
  });
});

describe("B-02 — páginas gigantescas", () => {
  it("ningún listado falla con Infinity, 1e20, NaN o negativos: caen en la primera página", async () => {
    await registrarIngreso(e.admin, { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "L-1", fechaVencimiento: e.dia(100), cantidad: 5 });
    for (const pagina of [Number.POSITIVE_INFINITY, 1e20, 99999999999999999999, Number.NaN, -5, 2 ** 53]) {
      const resultados = await Promise.all([
        listarInventario(e.admin, { pagina }),
        listarMovimientos(e.admin, { pagina }),
        listarMovimientos(e.admin, { pagina, texto: "L-1" }),
        reporteExistencias(e.admin, { pagina }),
        reporteMovimientos(e.admin, { pagina }),
        reporteMermas(e.admin, { pagina }),
        reporteConsumo(e.admin, { pagina }),
        reporteVencimientos(e.admin, { pagina }),
        listarInsumosAdmin(e.admin, { pagina }),
        listarUsuarios(e.admin, { pagina }),
        listarProveedoresAdmin(e.admin, { pagina }),
        listarAuditoria(e.admin, { pagina }),
      ]);
      for (const r of resultados) expect(r.pagina, String(pagina)).toBe(1);
    }
  });

  it("una página válida pero más allá del final devuelve vacío sin fallar", async () => {
    const r = await listarInsumosAdmin(e.admin, { pagina: 1_000_000 });
    expect(r).toMatchObject({ pagina: 1_000_000, items: [] });
    expect((await listarMovimientos(e.admin, { pagina: 1_000_000 })).items).toEqual([]);
    expect((await listarAuditoria(e.admin, { pagina: 1_000_001 })).pagina).toBe(1);
  });
});

describe("B-03 — byte nulo y caracteres de control en la búsqueda", () => {
  it("ninguna búsqueda falla y el texto se usa saneado", async () => {
    await registrarIngreso(e.admin, { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "L-1", fechaVencimiento: e.dia(100), cantidad: 5 });
    for (const texto of ["\u0000", "dia\u0000liz", "\u0000dializador", "\u001b[31m", "%\u0000_"]) {
      await Promise.all([
        listarInventario(e.admin, { texto }),
        buscarInsumos(e.admin, { texto }),
        listarMovimientos(e.admin, { texto }),
        reporteExistencias(e.admin, { texto }),
        reporteMovimientos(e.admin, { texto }),
        reporteMermas(e.admin, { texto }),
        reporteConsumo(e.admin, { texto }),
        reporteVencimientos(e.admin, { texto }),
        listarInsumosAdmin(e.admin, { texto }),
        listarUsuarios(e.admin, { texto }),
        listarProveedoresAdmin(e.admin, { texto }),
      ]);
    }
    expect((await buscarInsumos(e.admin, { texto: "\u0000dializador" })).map((i) => i.id)).toEqual([e.dializador]);
    expect((await listarInventario(e.admin, { texto: "dializador\u0000" })).items.map((i) => i.insumoId)).toEqual([e.dializador]);
  });

  it("las exportaciones auditan el texto saneado (un byte nulo rompía el JSON de la auditoría)", async () => {
    await aCsv(await exportarMovimientos(e.admin, { texto: "gu\u0000ía" }));
    await aCsv(await exportarExistencias(e.admin, { texto: "\u0000" }));
    await aCsv(await exportarReposicion(e.admin, { texto: "tela\u0000" }));
    const detalles = (await db.registroAuditoria.findMany({ where: { accion: "REPORTE_EXPORTADO" }, orderBy: { creadoEn: "asc" } })).map(
      (a) => (a.detalle as { filtros: { texto: string | null } }).filtros.texto,
    );
    expect(detalles).toEqual(["gu ía", null, "tela"]);
  });
});

describe("B-04 — fechas de filtros fuera de rango", () => {
  it("resolverPeriodo ignora las fechas fuera de 2000–2100", () => {
    const ahora = new Date("2026-11-19T15:00:00Z");
    expect(resolverPeriodo("9999-12-31", null, ahora)).toEqual(resolverPeriodo(null, null, ahora));
    expect(resolverPeriodo(null, "9999-12-31", ahora)).toEqual(resolverPeriodo(null, null, ahora));
    expect(resolverPeriodo("0001-01-01", "2026-11-19", ahora).hasta).toBe("2026-11-19");
    expect(resolverPeriodo("2100-12-31", "2100-12-31", ahora)).toMatchObject({ desde: "2100-12-31", hasta: "2100-12-31" });
  });

  it("reportes, historial, auditoría y CSV no fallan con ?desde=9999-12-31", async () => {
    await registrarIngreso(e.admin, { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "L-1", fechaVencimiento: e.dia(100), cantidad: 5 });
    for (const [desde, hasta] of [["9999-12-31", undefined], [undefined, "9999-12-31"], ["9999-12-31", "9999-12-31"], ["0001-01-01", "9999-12-31"]] as const) {
      const [movimientos, mermas, consumo, historial, auditoria] = await Promise.all([
        reporteMovimientos(e.admin, { desde, hasta }),
        reporteMermas(e.admin, { desde, hasta }),
        reporteConsumo(e.admin, { desde, hasta }),
        listarMovimientos(e.admin, { desde, hasta }),
        listarAuditoria(e.admin, { desde, hasta }),
      ]);
      // La fecha absurda se ignora: el ingreso de hoy sigue apareciendo.
      expect(movimientos.total).toBe(1);
      expect(historial.total).toBe(1);
      expect(mermas.total).toBe(0);
      expect(consumo.periodo.dias).toBeGreaterThan(0);
      expect(auditoria.total).toBeGreaterThan(0);
      await aCsv(await exportarMovimientos(e.admin, { desde, hasta }));
    }
  });
});

describe("reporte de movimientos — búsqueda sin tildes (vista previa y CSV)", () => {
  beforeEach(async () => {
    await db.insumo.update({ where: { id: e.dializador }, data: { nombre: "Dializador para diálisis crónica" } });
    await registrarIngreso(e.admin, {
      ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "DÍA-01", fechaVencimiento: e.dia(100), cantidad: 20, documentoRef: "GUÍA 4521",
    });
    await registrarIngreso(e.admin, { ubicacionId: e.bodegaA, insumoId: e.tela, numeroLote: "T-9", cantidad: 10, documentoRef: "Factura 77" });
    const lote = await db.lote.findFirstOrThrow({ where: { numeroLote: "DÍA-01" } });
    await registrarRetiro(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, cantidad: 3 });
    await registrarMerma(e.admin, { ubicacionId: e.bodegaA, loteId: lote.id, cantidad: 2, motivo: "Daño" });
  });

  it("'dialisis' encuentra 'diálisis' en nombre; 'guia' encuentra 'GUÍA'; 'dia-01' encuentra el lote 'DÍA-01'", async () => {
    const porNombre = await reporteMovimientos(e.admin, { texto: "dialisis" });
    expect(porNombre.total).toBe(3);
    expect(porNombre.items.map((m) => m.tipo).sort()).toEqual(["INGRESO", "MERMA", "RETIRO"]);
    expect(porNombre.porTipo).toEqual([
      { tipo: "INGRESO", movimientos: 1, unidades: 20 },
      { tipo: "RETIRO", movimientos: 1, unidades: 3 },
      { tipo: "MERMA", movimientos: 1, unidades: 2 },
    ]);

    const porDocumento = await reporteMovimientos(e.admin, { texto: "guia 4521" });
    expect(porDocumento.items.map((m) => [m.tipo, m.documentoRef])).toEqual([["INGRESO", "GUÍA 4521"]]);
    expect((await reporteMovimientos(e.admin, { texto: "dia-01" })).total).toBe(3);
    expect((await reporteMovimientos(e.admin, { texto: "DIÁLISIS", tipo: "RETIRO" })).total).toBe(1);
    expect((await reporteMovimientos(e.admin, { texto: "no existe" })).total).toBe(0);
    // Sin texto, todo el período.
    expect((await reporteMovimientos(e.admin)).total).toBe(4);
  });

  it("pagina y respeta el alcance de centros con texto", async () => {
    const p1 = await reporteMovimientos(e.admin, { texto: "dialisis", porPagina: 2 });
    const p2 = await reporteMovimientos(e.admin, { texto: "dialisis", porPagina: 2, pagina: 2 });
    expect([p1.items.length, p2.items.length, p1.totalPaginas]).toEqual([2, 1, 2]);
    expect(new Set([...p1.items, ...p2.items].map((m) => m.id)).size).toBe(3);
    expect((await reporteMovimientos(e.admin, { texto: "dialisis", centroId: e.centroB })).total).toBe(0);
  });

  it("el CSV usa la misma búsqueda y la auditoría cuenta las mismas filas", async () => {
    const { filas } = await aCsv(await exportarMovimientos(e.admin, { texto: "dialisis" }));
    expect(filas).toHaveLength(3);
    expect(filas.every((f) => f[5] === "Dializador para diálisis crónica")).toBe(true);
    const auditoria = await db.registroAuditoria.findFirstOrThrow({ where: { accion: "REPORTE_EXPORTADO" }, orderBy: { creadoEn: "desc" } });
    expect(auditoria.detalle).toMatchObject({ filtros: { texto: "dialisis", filas: 3 } });
  });

  it("las mermas también se buscan sin tildes", async () => {
    const mermas = await reporteMermas(e.admin, { texto: "dialisis" });
    expect(mermas).toMatchObject({ total: 1, unidades: 2 });
    expect(mermas.porMotivo).toEqual([{ motivo: "Daño", movimientos: 1, unidades: 2 }]);
    expect((await reporteMermas(e.admin, { texto: "tela" })).total).toBe(0);
    const { filas } = await aCsv(await exportarMovimientos(e.admin, { tipo: "MERMA", texto: "DIALISIS" }));
    expect(filas).toHaveLength(1);
  });
});

describe("retiro — insumos más usados en el centro", () => {
  it("buscarInsumos marca y ordena primero lo retirado en el centro en los últimos 30 días", async () => {
    await registrarIngreso(e.admin, { ubicacionId: e.bodegaA, insumoId: e.tela, numeroLote: "T-1", cantidad: 50 });
    await registrarIngreso(e.admin, { ubicacionId: e.bodegaA, insumoId: e.guantes, numeroLote: "G-1", fechaVencimiento: e.dia(100), cantidad: 50 });
    await registrarRetiro(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.tela, cantidad: 9 });
    await registrarRetiro(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.guantes, cantidad: 2 });

    const enA = await buscarInsumos(e.bodeguero, { priorizarRetirosDeCentroId: e.centroA });
    expect(enA.map((i) => [i.id, i.masUsado])).toEqual([
      [e.tela, true],
      [e.guantes, true],
      [e.dializador, false],
    ]);
    // En otro centro no hubo retiros: nada se marca y el orden es alfabético.
    const enB = await buscarInsumos(e.admin, { priorizarRetirosDeCentroId: e.centroB });
    expect(enB.every((i) => i.masUsado === false)).toBe(true);
    // Sin priorización el campo no viene.
    expect((await buscarInsumos(e.admin))[0]).not.toHaveProperty("masUsado");
    await esperarError(buscarInsumos(e.bodeguero, { priorizarRetirosDeCentroId: e.centroB }), "SIN_ACCESO_AL_CENTRO");
  });
});

describe("panel — actividad en número de movimientos", () => {
  it("cuenta movimientos de entrada y de salida, no unidades", async () => {
    await registrarIngreso(e.admin, { ubicacionId: e.bodegaA, insumoId: e.tela, numeroLote: "T-1", cantidad: 500 });
    await registrarIngreso(e.admin, { ubicacionId: e.bodegaA, insumoId: e.guantes, numeroLote: "G-1", fechaVencimiento: e.dia(100), cantidad: 30 });
    await registrarRetiro(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.tela, cantidad: 120 });
    const p = await resumenPanel(e.admin, { centroId: e.centroA, diasActividad: 3 });
    expect(p.actividad.at(-1)).toEqual({ dia: e.hoy, entradas: 2, salidas: 1, movimientos: 3 });
    expect(p.actividad.slice(0, -1).every((d) => d.entradas === 0 && d.salidas === 0 && d.movimientos === 0)).toBe(true);
  });
});
