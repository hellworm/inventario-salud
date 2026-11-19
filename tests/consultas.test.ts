import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  detalleInsumo,
  listarInventario,
  listarMovimientos,
  lotesDisponibles,
  obtenerAlertas,
  obtenerTraslado,
  registrarIngreso,
  registrarRetiro,
  registrarTraslado,
  resumenPanel,
  type FiltroEstadoInventario,
} from "@/server/servicios";
import { crearEscenario, sembrarLoteVencido, type Escenario } from "./soporte/escenario";

/**
 * Escenario (centro A salvo que se indique):
 *  - Dializador: 4 vencidas + 6 que vencen en 20 días (bodega) + 10 en 200 días (sala).
 *                mínimo A = 30 → disponible 16 → BAJO_MINIMO. En centro B: 40 (mínimo 10) → OK.
 *  - Guantes:    mínimo A = 50, sin existencias → SIN_STOCK.
 *  - Tela:       25 sin vencimiento, sin mínimo → OK / SIN_VENCIMIENTO.
 */
let e: Escenario;
let loteVencido: string;

beforeAll(async () => {
  e = await crearEscenario();
  loteVencido = await sembrarLoteVencido(e.dializador, e.bodegaA, 4, "D-VENC", 3);
  await registrarIngreso(e.admin, { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "D-20", fechaVencimiento: e.dia(20), cantidad: 6 });
  const d200 = await registrarIngreso(e.admin, { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "D-200", fechaVencimiento: e.dia(200), cantidad: 12 });
  await registrarTraslado(e.admin, { loteId: d200.movimiento.loteId, ubicacionOrigenId: e.bodegaA, ubicacionDestinoId: e.salaA, cantidad: 10 });
  await registrarRetiro(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, loteId: d200.movimiento.loteId, cantidad: 2, motivo: "Uso en sala" });
  await registrarIngreso(e.admin, { ubicacionId: e.bodegaB, insumoId: e.dializador, numeroLote: "D-B", fechaVencimiento: e.dia(45), cantidad: 40, documentoRef: "Factura 991" });
  await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.tela, numeroLote: "T-1", cantidad: 25 });
  await db.parametroStock.createMany({
    data: [
      { insumoId: e.dializador, centroId: e.centroA, stockMinimo: 30, stockMaximo: 80 },
      { insumoId: e.dializador, centroId: e.centroB, stockMinimo: 10 },
      { insumoId: e.guantes, centroId: e.centroA, stockMinimo: 50 },
    ],
  });
});

describe("listarInventario", () => {
  it("agrega por insumo con totales, lotes, próximo vencimiento y estados", async () => {
    const r = await listarInventario(e.admin, { centroId: e.centroA });
    expect(r.total).toBe(3);
    const porCodigo = Object.fromEntries(r.items.map((i) => [i.codigo, i]));

    expect(porCodigo["DIA-001"]).toMatchObject({
      total: 20,
      vencido: 4,
      disponible: 16,
      porVencer: 6,
      lotes: 3,
      stockMinimo: 30,
      stockMaximo: 80,
      proximoVencimiento: e.dia(20),
      diasParaVencer: 20,
      estadoStock: "BAJO_MINIMO",
      estadoVencimiento: "VENCIDO",
      enUbicacion: null,
    });
    expect(porCodigo["GUA-001"]).toMatchObject({
      total: 0,
      lotes: 0,
      estadoStock: "SIN_STOCK",
      estadoVencimiento: "SIN_VENCIMIENTO",
      proximoVencimiento: null,
    });
    expect(porCodigo["TEL-001"]).toMatchObject({
      total: 25,
      stockMinimo: null,
      estadoStock: "OK",
      estadoVencimiento: "SIN_VENCIMIENTO",
    });
  });

  it("toda la red suma existencias y mínimos de todos los centros", async () => {
    const r = await listarInventario(e.admin);
    const dializador = r.items.find((i) => i.codigo === "DIA-001");
    expect(dializador).toMatchObject({ total: 60, disponible: 56, stockMinimo: 40, estadoStock: "OK", lotes: 4 });
  });

  it("filtra por estado", async () => {
    const codigos = async (estado: FiltroEstadoInventario) =>
      (await listarInventario(e.admin, { centroId: e.centroA, estado })).items.map((i) => i.codigo);
    expect(await codigos("SIN_STOCK")).toEqual(["GUA-001"]);
    expect(await codigos("BAJO_MINIMO")).toEqual(["DIA-001"]);
    expect(await codigos("OK")).toEqual(["TEL-001"]);
    expect(await codigos("VENCIDO")).toEqual(["DIA-001"]);
    expect(await codigos("POR_VENCER")).toEqual(["DIA-001"]);
  });

  it("filtra por texto (sin tildes ni mayúsculas), ubicación y categoría", async () => {
    const texto = await listarInventario(e.admin, { centroId: e.centroA, texto: "DIALÍZADOR 1.8 M²" });
    expect(texto.items.map((i) => i.codigo)).toEqual(["DIA-001"]);
    const sinTilde = await listarInventario(e.admin, { centroId: e.centroA, texto: "adhesiva" });
    expect(sinTilde.items.map((i) => i.codigo)).toEqual(["TEL-001"]);
    const porCodigo = await listarInventario(e.admin, { centroId: e.centroA, texto: "gua-0" });
    expect(porCodigo.items.map((i) => i.codigo)).toEqual(["GUA-001"]);
    const comodines = await listarInventario(e.admin, { centroId: e.centroA, texto: "%" });
    expect(comodines.total).toBe(0);

    const enSala = await listarInventario(e.admin, { centroId: e.centroA, ubicacionId: e.salaA });
    expect(enSala.items).toHaveLength(1);
    expect(enSala.items[0]).toMatchObject({ codigo: "DIA-001", enUbicacion: 10, total: 20 });

    const otraCategoria = await listarInventario(e.admin, { categoriaId: "no-existe" });
    expect(otraCategoria.total).toBe(0);
  });

  it("pagina y conserva el total aunque la página quede fuera de rango", async () => {
    const p1 = await listarInventario(e.admin, { centroId: e.centroA, porPagina: 2, pagina: 1 });
    expect(p1).toMatchObject({ total: 3, totalPaginas: 2, pagina: 1, porPagina: 2 });
    expect(p1.items).toHaveLength(2);
    const p2 = await listarInventario(e.admin, { centroId: e.centroA, porPagina: 2, pagina: 2 });
    expect(p2.items).toHaveLength(1);
    const p9 = await listarInventario(e.admin, { centroId: e.centroA, porPagina: 2, pagina: 9 });
    expect(p9.items).toHaveLength(0);
    expect(p9.total).toBe(3);
  });
});

describe("detalleInsumo y lotesDisponibles", () => {
  it("lista existencias por lote y ubicación en orden FEFO", async () => {
    const d = await detalleInsumo(e.admin, e.dializador, { centroId: e.centroA });
    expect(d.insumo.codigo).toBe("DIA-001");
    expect(d).toMatchObject({ total: 20, vencido: 4, disponible: 16, estadoStock: "BAJO_MINIMO", proximoVencimiento: e.dia(20) });
    expect(d.existencias.map((x) => [x.numeroLote, x.ubicacion, x.cantidad, x.estadoVencimiento])).toEqual([
      ["D-VENC", "Bodega", 4, "VENCIDO"],
      ["D-20", "Bodega", 6, "POR_VENCER"],
      ["D-200", "Sala 1", 10, "VIGENTE"],
    ]);
    expect(d.parametros).toEqual([
      { centroId: e.centroA, centro: "Centro A", stockMinimo: 30, stockMaximo: 80, disponible: 16, estadoStock: "BAJO_MINIMO" },
    ]);

    const red = await detalleInsumo(e.admin, e.dializador);
    expect(red.total).toBe(60);
    expect(red.parametros).toHaveLength(2);
  });

  it("lotesDisponibles excluye vencidos salvo que se pidan", async () => {
    const vigentes = await lotesDisponibles(e.bodeguero, { insumoId: e.dializador, ubicacionId: e.bodegaA });
    expect(vigentes.map((l) => [l.numeroLote, l.cantidad])).toEqual([["D-20", 6]]);
    const todos = await lotesDisponibles(e.admin, { insumoId: e.dializador, ubicacionId: e.bodegaA, incluirVencidos: true });
    expect(todos.map((l) => l.loteId)[0]).toBe(loteVencido);
    expect(todos).toHaveLength(2);
  });
});

describe("listarMovimientos", () => {
  it("lista del más reciente al más antiguo con datos relacionados", async () => {
    const r = await listarMovimientos(e.admin);
    expect(r.total).toBe(7);
    const fechas = r.items.map((m) => m.creadoEn.getTime());
    expect(fechas).toEqual([...fechas].sort((a, b) => b - a));
    expect(r.items.every((m) => m.insumoNombre && m.centro && m.usuario && m.ubicacion)).toBe(true);
  });

  it("filtra por tipo, insumo, texto, fechas y pagina", async () => {
    expect((await listarMovimientos(e.admin, { tipo: "RETIRO" })).total).toBe(1);
    expect((await listarMovimientos(e.admin, { tipo: ["TRASLADO_SALIDA", "TRASLADO_ENTRADA"] })).total).toBe(2);
    expect((await listarMovimientos(e.admin, { insumoId: e.tela })).total).toBe(1);
    expect((await listarMovimientos(e.admin, { centroId: e.centroB })).total).toBe(1);
    expect((await listarMovimientos(e.admin, { texto: "factura 991" })).total).toBe(1);
    expect((await listarMovimientos(e.admin, { texto: "d-200" })).total).toBe(4);
    expect((await listarMovimientos(e.admin, { usuarioId: e.bodeguero.usuarioId })).total).toBe(2);
    expect((await listarMovimientos(e.admin, { desde: e.hoy, hasta: e.hoy })).total).toBe(7);
    expect((await listarMovimientos(e.admin, { hasta: e.dia(-1) })).total).toBe(0);
    expect((await listarMovimientos(e.admin, { desde: e.dia(1) })).total).toBe(0);

    const pagina = await listarMovimientos(e.admin, { porPagina: 3, pagina: 3 });
    expect(pagina).toMatchObject({ total: 7, totalPaginas: 3 });
    expect(pagina.items).toHaveLength(1);
  });

  it("obtenerTraslado devuelve la salida y la entrada", async () => {
    const [salida] = (await listarMovimientos(e.admin, { tipo: "TRASLADO_SALIDA" })).items;
    const par = await obtenerTraslado(e.admin, salida!.trasladoGrupoId!);
    expect(par.map((m) => m.tipo).sort()).toEqual(["TRASLADO_ENTRADA", "TRASLADO_SALIDA"]);
  });
});

describe("obtenerAlertas", () => {
  it("detecta sin stock, bajo mínimo, vencidos y por vencer con sus tramos", async () => {
    const a = await obtenerAlertas(e.admin);
    expect(a.stock.map((s) => [s.codigo, s.centro, s.tipo, s.disponible, s.faltante])).toEqual([
      ["GUA-001", "Centro A", "SIN_STOCK", 0, 50],
      ["DIA-001", "Centro A", "BAJO_MINIMO", 16, 14],
    ]);
    expect(a.vencimientos.map((v) => [v.numeroLote, v.tipo, v.tramo, v.dias, v.cantidad])).toEqual([
      ["D-VENC", "VENCIDO", null, -3, 4],
      ["D-20", "POR_VENCER", 30, 20, 6],
      ["D-B", "POR_VENCER", 60, 45, 40],
    ]);
    expect(a.resumen).toEqual({
      sinStock: 1,
      bajoMinimo: 1,
      vencidos: 1,
      porVencer30: 1,
      porVencer60: 1,
      porVencer90: 0,
      total: 5,
    });
  });

  it("respeta el centro y el alcance del actor", async () => {
    const b = await obtenerAlertas(e.admin, { centroId: e.centroB });
    expect(b.stock).toEqual([]);
    expect(b.vencimientos.map((v) => v.numeroLote)).toEqual(["D-B"]);
    const visitante = await obtenerAlertas(e.visitante);
    expect(visitante.vencimientos.map((v) => v.numeroLote)).toEqual(["D-VENC", "D-20"]);
  });
});

describe("resumenPanel", () => {
  it("calcula KPIs, actividad diaria y últimos movimientos", async () => {
    const p = await resumenPanel(e.admin, { centroId: e.centroA, diasActividad: 7, ultimos: 3 });
    expect(p).toMatchObject({ insumosConStock: 2, lotesConStock: 4, unidadesTotales: 45, puedeVerMovimientos: true, movimientosHoy: 6 });
    expect(p.alertas).toMatchObject({ sinStock: 1, bajoMinimo: 1, vencidos: 1, porVencer30: 1 });
    expect(p.actividad).toHaveLength(7);
    expect(p.actividad.at(-1)).toEqual({ dia: e.hoy, entradas: 6 + 12 + 10 + 25, salidas: 10 + 2, movimientos: 6 });
    expect(p.ultimosMovimientos).toHaveLength(3);
    expect(p.porCentro).toEqual([
      { centroId: e.centroA, centro: "Centro A", sinStock: 1, bajoMinimo: 1, vencidos: 1, porVencer: 1 },
    ]);

    const red = await resumenPanel(e.admin);
    expect(red.unidadesTotales).toBe(85);
    expect(red.porCentro).toHaveLength(2);
  });
});
