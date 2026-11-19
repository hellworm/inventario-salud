import { beforeAll, describe, expect, it } from "vitest";
import {
  calcularEstadoVencimiento,
  COLORES_SEMAFORO,
  escribirSemaforo,
  leerSemaforo,
  limitesSemaforo,
  peorEstadoVencimiento,
  type ColorSemaforo,
} from "@/lib/estados";
import { diaADate, sumarDias, sumarMeses } from "@/lib/fechas";
import { db } from "@/server/db";
import {
  detalleInsumo,
  listarInventario,
  lotesPorColor,
  obtenerAlertas,
  reporteExistencias,
  reporteVencimientos,
  resumenPanel,
  resumenSemaforo,
} from "@/server/servicios";
import { crearEscenario, esperarError, type Escenario } from "./soporte/escenario";

describe("regla del semáforo (meses calendario)", () => {
  it("sumarMeses conserva el día y recorta al último día del mes", () => {
    expect(sumarMeses("2026-11-19", 3)).toBe("2027-02-19");
    expect(sumarMeses("2026-11-19", 6)).toBe("2027-05-19");
    expect(sumarMeses("2026-11-30", 3)).toBe("2027-02-28");
    expect(sumarMeses("2027-11-30", 3)).toBe("2028-02-29"); // bisiesto
    expect(sumarMeses("2026-08-31", 3)).toBe("2026-11-30");
    expect(sumarMeses("2026-08-31", 6)).toBe("2027-02-28");
    expect(sumarMeses("2026-12-15", 1)).toBe("2027-01-15");
    expect(sumarMeses("2026-01-31", -2)).toBe("2025-11-30");
    expect(sumarMeses("2026-05-10", 0)).toBe("2026-05-10");
  });

  it("límites exactos: rojo < 3 meses ≤ amarillo < 6 meses ≤ verde", () => {
    const hoy = "2026-11-19";
    expect(limitesSemaforo(hoy)).toEqual({ hoy, amarilloDesde: "2027-02-19", verdeDesde: "2027-05-19" });
    const casos: [string | null, string][] = [
      ["2026-11-18", "VENCIDO"], // venció ayer
      ["2026-11-19", "ROJO"], // vence hoy: todavía se puede usar
      ["2027-02-18", "ROJO"], // un día antes de cumplir 3 meses
      ["2027-02-19", "AMARILLO"], // exactamente 3 meses
      ["2027-05-18", "AMARILLO"], // un día antes de cumplir 6 meses
      ["2027-05-19", "VERDE"], // exactamente 6 meses
      ["2031-01-01", "VERDE"],
      [null, "SIN_VENCIMIENTO"],
    ];
    for (const [fecha, esperado] of casos) expect(calcularEstadoVencimiento(fecha, hoy), String(fecha)).toBe(esperado);
  });

  it("fin de mes: 30 de noviembre + 3 meses = 28 de febrero", () => {
    const hoy = "2026-11-30";
    expect(calcularEstadoVencimiento("2027-02-27", hoy)).toBe("ROJO");
    expect(calcularEstadoVencimiento("2027-02-28", hoy)).toBe("AMARILLO");
    expect(calcularEstadoVencimiento("2027-05-29", hoy)).toBe("AMARILLO");
    expect(calcularEstadoVencimiento("2027-05-30", hoy)).toBe("VERDE");
  });

  it("a nivel de insumo manda el peor estado; vencido es más grave que rojo", () => {
    expect(peorEstadoVencimiento(["VERDE", "AMARILLO", "SIN_VENCIMIENTO"])).toBe("AMARILLO");
    expect(peorEstadoVencimiento(["VERDE", "ROJO", "AMARILLO"])).toBe("ROJO");
    expect(peorEstadoVencimiento(["ROJO", "VENCIDO"])).toBe("VENCIDO");
    expect(peorEstadoVencimiento(["SIN_VENCIMIENTO"])).toBe("SIN_VENCIMIENTO");
    expect(peorEstadoVencimiento([])).toBe("SIN_VENCIMIENTO");
  });

  it("filtro ?semaforo= de la URL: uno o varios valores, lo desconocido se ignora", () => {
    expect(leerSemaforo("rojo")).toEqual(["ROJO"]);
    expect(leerSemaforo("ROJO, amarillo")).toEqual(["ROJO", "AMARILLO"]);
    expect(leerSemaforo("verde,vencido,verde")).toEqual(["VENCIDO", "VERDE"]);
    expect(leerSemaforo("azul")).toEqual([]);
    expect(leerSemaforo("")).toEqual([]);
    expect(leerSemaforo(null)).toEqual([]);
    expect(leerSemaforo("rojo'; DROP TABLE lotes;--")).toEqual([]);
    expect(escribirSemaforo(["ROJO", "AMARILLO"])).toBe("rojo,amarillo");
    expect(escribirSemaforo(["VENCIDO"])).toBe("vencido");
    expect(escribirSemaforo([])).toBeUndefined();
  });
});

/**
 * Escenario con lotes justo en los límites (fechas calculadas desde hoy):
 *  Centro A · Bodega (dializador): VENC (ayer), HOY (hoy), R-ULT (último día rojo),
 *    A-PRI (primer día amarillo), A-ULT (último día amarillo), V-PRI (primer día verde).
 *  Centro A · Sala 1: A-PRI otra vez (mismo lote en dos ubicaciones) y guantes G-ROJO (rojo).
 *  Centro A · Bodega: tela T-1 sin vencimiento.
 *  Centro B · Bodega: dializador B-AMA (amarillo) y un lote SIN stock (no cuenta).
 */
describe("semáforo en los servicios (SQL) y coherencia entre pantallas", () => {
  let e: Escenario;
  const fechas: Record<string, string | null> = {};

  beforeAll(async () => {
    e = await crearEscenario();
    const { amarilloDesde, verdeDesde } = limitesSemaforo(e.hoy);
    const sembrar = async (insumoId: string, numeroLote: string, fecha: string | null, existencias: [string, number][]) => {
      fechas[numeroLote] = fecha;
      const lote = await db.lote.create({ data: { insumoId, numeroLote, fechaVencimiento: fecha ? diaADate(fecha) : null } });
      for (const [ubicacionId, cantidad] of existencias) await db.existencia.create({ data: { loteId: lote.id, ubicacionId, cantidad } });
    };
    await sembrar(e.dializador, "VENC", sumarDias(e.hoy, -1), [[e.bodegaA, 1]]);
    await sembrar(e.dializador, "HOY", e.hoy, [[e.bodegaA, 2]]);
    await sembrar(e.dializador, "R-ULT", sumarDias(amarilloDesde, -1), [[e.bodegaA, 3]]);
    await sembrar(e.dializador, "A-PRI", amarilloDesde, [[e.bodegaA, 4], [e.salaA, 5]]);
    await sembrar(e.dializador, "A-ULT", sumarDias(verdeDesde, -1), [[e.bodegaA, 6]]);
    await sembrar(e.dializador, "V-PRI", verdeDesde, [[e.bodegaA, 7]]);
    await sembrar(e.guantes, "G-ROJO", sumarDias(e.hoy, 10), [[e.salaA, 8]]);
    await sembrar(e.tela, "T-1", null, [[e.bodegaA, 9]]);
    await sembrar(e.dializador, "B-AMA", sumarDias(amarilloDesde, 5), [[e.bodegaB, 10]]);
    await sembrar(e.guantes, "AGOTADO", sumarDias(e.hoy, 5), [[e.bodegaB, 0]]);
  });

  it("resumenSemaforo cuenta insumos, lotes (por ubicación) y unidades por color", async () => {
    const a = await resumenSemaforo(e.admin, { centroId: e.centroA });
    expect(a.VENCIDO).toEqual({ insumos: 1, lotes: 1, unidades: 1 });
    expect(a.ROJO).toEqual({ insumos: 2, lotes: 3, unidades: 13 }); // HOY, R-ULT y G-ROJO
    expect(a.AMARILLO).toEqual({ insumos: 1, lotes: 3, unidades: 15 }); // A-PRI en 2 ubicaciones + A-ULT
    expect(a.VERDE).toEqual({ insumos: 1, lotes: 1, unidades: 7 });
    expect(a.SIN_VENCIMIENTO).toEqual({ insumos: 1, lotes: 1, unidades: 9 });
    expect(a.limites).toEqual(limitesSemaforo(e.hoy));

    const red = await resumenSemaforo(e.admin);
    expect(red.AMARILLO).toEqual({ insumos: 1, lotes: 4, unidades: 25 });
    expect(red.ROJO.lotes).toBe(3); // el lote agotado del centro B no cuenta

    const filtrado = await resumenSemaforo(e.admin, { centroId: e.centroA, texto: "guantes" });
    expect(filtrado.ROJO).toEqual({ insumos: 1, lotes: 1, unidades: 8 });
    expect(filtrado.AMARILLO.lotes).toBe(0);
  });

  it("la clasificación en SQL coincide con la del código, lote por lote", async () => {
    const reporte = await reporteExistencias(e.admin, { porPagina: 100 });
    expect(reporte.items.length).toBe(10);
    for (const fila of reporte.items) {
      expect(fila.estadoVencimiento, fila.numeroLote).toBe(calcularEstadoVencimiento(fechas[fila.numeroLote] ?? null, e.hoy));
    }
    // Cada fila aparece al filtrar (en SQL) por su color y solo por ese.
    for (const color of COLORES_SEMAFORO) {
      const delColor = await reporteExistencias(e.admin, { semaforo: [color], porPagina: 100 });
      expect(new Set(delColor.items.map((f) => f.estadoVencimiento)), color).toEqual(new Set([color]));
      expect(delColor.items.length).toBe(reporte.items.filter((f) => f.estadoVencimiento === color).length);
    }
  });

  it("inventario: color del insumo = el peor de sus lotes, con el desglose", async () => {
    const r = await listarInventario(e.admin, { centroId: e.centroA });
    const porCodigo = Object.fromEntries(r.items.map((i) => [i.codigo, i]));
    expect(porCodigo["DIA-001"]).toMatchObject({
      estadoVencimiento: "VENCIDO",
      semaforo: { VENCIDO: 1, ROJO: 2, AMARILLO: 3, VERDE: 1, sinVencimiento: 0 },
      proximoVencimiento: e.hoy,
      diasParaVencer: 0,
    });
    expect(porCodigo["GUA-001"]).toMatchObject({ estadoVencimiento: "ROJO", semaforo: { VENCIDO: 0, ROJO: 1, AMARILLO: 0, VERDE: 0 } });
    expect(porCodigo["TEL-001"]).toMatchObject({ estadoVencimiento: "SIN_VENCIMIENTO", semaforo: { sinVencimiento: 1 } });

    const b = await listarInventario(e.admin, { centroId: e.centroB });
    expect(b.items.find((i) => i.codigo === "DIA-001")).toMatchObject({ estadoVencimiento: "AMARILLO", semaforo: { AMARILLO: 1 } });
    // El lote agotado no pinta de rojo los guantes del centro B.
    expect(b.items.find((i) => i.codigo === "GUA-001")?.estadoVencimiento ?? "SIN_VENCIMIENTO").toBe("SIN_VENCIMIENTO");

    const detalle = await detalleInsumo(e.admin, e.dializador, { centroId: e.centroA });
    expect(detalle.estadoVencimiento).toBe("VENCIDO");
    expect(detalle.semaforo).toEqual({ VENCIDO: 1, ROJO: 2, AMARILLO: 3, VERDE: 1, sinVencimiento: 0 });
    expect(detalle.existencias.map((x) => [x.numeroLote, x.estadoVencimiento])).toEqual([
      ["VENC", "VENCIDO"],
      ["HOY", "ROJO"],
      ["R-ULT", "ROJO"],
      ["A-PRI", "AMARILLO"],
      ["A-PRI", "AMARILLO"],
      ["A-ULT", "AMARILLO"],
      ["V-PRI", "VERDE"],
    ]);
  });

  it("alertas: vencidos, rojo y amarillo (el verde no es alerta), ordenadas por urgencia", async () => {
    const a = await obtenerAlertas(e.admin, { centroId: e.centroA });
    expect(a.vencimientos.map((v) => [v.numeroLote, v.tipo])).toEqual([
      ["VENC", "VENCIDO"],
      ["HOY", "ROJO"],
      ["G-ROJO", "ROJO"],
      ["R-ULT", "ROJO"],
      ["A-PRI", "AMARILLO"],
      ["A-PRI", "AMARILLO"],
      ["A-ULT", "AMARILLO"],
    ]);
    expect(a.resumen).toMatchObject({ vencidos: 1, rojo: 3, amarillo: 3 });
    expect(a.resumen.total).toBe(a.stock.length + 7);
  });

  it("los conteos coinciden en panel, alertas, inventario filtrado y reportes", async () => {
    for (const centroId of [e.centroA, e.centroB, null]) {
      const [panel, alertas] = await Promise.all([resumenPanel(e.admin, { centroId }), obtenerAlertas(e.admin, { centroId })]);
      // Panel (SQL) = alertas (lista)
      expect(panel.semaforo.VENCIDO.lotes).toBe(alertas.resumen.vencidos);
      expect(panel.semaforo.ROJO.lotes).toBe(alertas.resumen.rojo);
      expect(panel.semaforo.AMARILLO.lotes).toBe(alertas.resumen.amarillo);
      for (const color of COLORES_SEMAFORO) {
        const semaforo: ColorSemaforo[] = [color];
        const [inventario, vencimientos, existencias] = await Promise.all([
          listarInventario(e.admin, { centroId, semaforo, porPagina: 100 }),
          reporteVencimientos(e.admin, { centroId, semaforo }),
          reporteExistencias(e.admin, { centroId, semaforo }),
        ]);
        // n.º de insumos del panel = inventario filtrado por ese color
        expect(inventario.total, `${color} insumos`).toBe(panel.semaforo[color].insumos);
        // n.º de lotes del panel = filas de los reportes filtrados por ese color
        expect(vencimientos.totales.filas, `${color} lotes (vencimientos)`).toBe(panel.semaforo[color].lotes);
        expect(existencias.totales.filas, `${color} lotes (existencias)`).toBe(panel.semaforo[color].lotes);
        expect(existencias.totales.unidades, `${color} unidades`).toBe(panel.semaforo[color].unidades);
      }
    }
  });

  it("lista de productos en rojo: lo que vence antes primero, con límite", async () => {
    const todos = await lotesPorColor(e.admin, { centroId: e.centroA, color: "ROJO" });
    expect(todos.map((l) => [l.numeroLote, l.ubicacion, l.dias, l.cantidad])).toEqual([
      ["HOY", "Bodega", 0, 2],
      ["G-ROJO", "Sala 1", 10, 8],
      ["R-ULT", "Bodega", todos[2]!.dias, 3],
    ]);
    expect(todos[2]!.fechaVencimiento).toBe(fechas["R-ULT"]);
    expect((await lotesPorColor(e.admin, { centroId: e.centroA, color: "ROJO", limite: 2 })).map((l) => l.numeroLote)).toEqual(["HOY", "G-ROJO"]);
    const panel = await resumenPanel(e.admin, { centroId: e.centroA });
    expect(panel.enRojo.map((l) => l.numeroLote)).toEqual(["HOY", "G-ROJO", "R-ULT"]);
    // "Vence esta semana" sigue saliendo de los lotes en rojo.
    expect(panel.atencion.venceEstaSemana.items.map((l) => l.numeroLote)).toEqual(["HOY"]);
  });

  it("respeta el alcance de centros de cada rol", async () => {
    const bodeguero = await resumenSemaforo(e.bodeguero);
    expect(bodeguero.AMARILLO.lotes).toBe(3); // sin el lote del centro B
    const visitante = await resumenPanel(e.visitante);
    expect(visitante.semaforo.ROJO).toEqual({ insumos: 2, lotes: 3, unidades: 13 });
    expect((await resumenSemaforo(e.bodegueroB)).AMARILLO).toEqual({ insumos: 1, lotes: 1, unidades: 10 });
    await esperarError(resumenSemaforo(e.bodeguero, { centroId: e.centroB }), "SIN_ACCESO_AL_CENTRO");
    await esperarError(lotesPorColor(e.visitante, { centroId: e.centroB, color: "ROJO" }), "SIN_ACCESO_AL_CENTRO");
  });
});
