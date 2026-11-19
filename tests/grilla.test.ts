import { beforeAll, describe, expect, it } from "vitest";
import { planificarFefo, ordenarFefo, type LoteParaFefo } from "@/lib/fefo";
import { cantidadConUnidad, pluralUnidad, unidadSegun } from "@/lib/unidades";
import { UNIDADES_MEDIDA } from "@/lib/estados";
import {
  listarInventario,
  listarMovimientos,
  lotesDisponibles,
  obtenerMovimiento,
  obtenerOpcionInsumo,
  registrarIngreso,
  registrarRetiro,
  usuariosConMovimientos,
  type OrdenInventario,
} from "@/server/servicios";
import { crearEscenario, esperarError, sembrarLoteVencido, type Escenario } from "./soporte/escenario";

describe("unidades", () => {
  it("pluraliza las unidades del catálogo", () => {
    const plurales = Object.fromEntries(UNIDADES_MEDIDA.map((u) => [u, pluralUnidad(u)]));
    expect(plurales).toEqual({
      unidad: "unidades",
      caja: "cajas",
      bolsa: "bolsas",
      frasco: "frascos",
      ampolla: "ampollas",
      litro: "litros",
      bidón: "bidones",
      cartucho: "cartuchos",
      rollo: "rollos",
      par: "pares",
      paquete: "paquetes",
      kit: "kits",
    });
  });

  it("concuerda la unidad con la cantidad y formatea miles", () => {
    expect(unidadSegun(1, "caja")).toBe("caja");
    expect(unidadSegun(0, "caja")).toBe("cajas");
    expect(cantidadConUnidad(1, "bidón")).toBe("1 bidón");
    expect(cantidadConUnidad(1500, "unidad")).toBe("1.500 unidades");
  });
});

describe("planificarFefo", () => {
  const lote = (numeroLote: string, fechaVencimiento: string | null, cantidad: number, vencido = false): LoteParaFefo => ({
    loteId: numeroLote,
    numeroLote,
    fechaVencimiento,
    estadoVencimiento: vencido ? "VENCIDO" : fechaVencimiento ? "VIGENTE" : "SIN_VENCIMIENTO",
    cantidad,
  });
  const lotes = [
    lote("SIN-FECHA", null, 10),
    lote("TARDE", "2030-06-01", 8),
    lote("VENCIDO", "2020-01-01", 5, true),
    lote("PRONTO", "2030-01-15", 6),
  ];

  it("ordena por vencimiento y deja los lotes sin fecha al final", () => {
    expect(ordenarFefo(lotes).map((l) => l.numeroLote)).toEqual(["VENCIDO", "PRONTO", "TARDE", "SIN-FECHA"]);
  });

  it("consume varios lotes en orden y nunca usa los vencidos", () => {
    const plan = planificarFefo(lotes, 9);
    expect(plan.disponible).toBe(24);
    expect(plan.vencido).toBe(5);
    expect(plan.faltante).toBe(0);
    expect(plan.lineas.map((l) => [l.lote.numeroLote, l.tomar, l.queda])).toEqual([
      ["PRONTO", 6, 0],
      ["TARDE", 3, 5],
    ]);
  });

  it("informa el faltante cuando se pide más de lo disponible", () => {
    const plan = planificarFefo(lotes, 30);
    expect(plan.faltante).toBe(6);
    expect(plan.lineas.reduce((s, l) => s + l.tomar, 0)).toBe(24);
  });

  it("con cantidad vacía o inválida no planifica nada", () => {
    expect(planificarFefo(lotes, Number.NaN).lineas).toEqual([]);
    expect(planificarFefo(lotes, 0).lineas).toEqual([]);
    expect(planificarFefo(lotes, -3).faltante).toBe(0);
  });
});

describe("servicios de la grilla", () => {
  let e: Escenario;
  let movimientoA: string;
  let movimientoB: string;

  beforeAll(async () => {
    e = await crearEscenario();
    const a1 = await registrarIngreso(e.bodeguero, {
      ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "ZETA-77", fechaVencimiento: e.dia(200), cantidad: 30,
    });
    await registrarIngreso(e.bodeguero, {
      ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "ALFA-10", fechaVencimiento: e.dia(40), cantidad: 5,
    });
    await registrarIngreso(e.bodeguero, {
      ubicacionId: e.bodegaA, insumoId: e.guantes, numeroLote: "G-1", fechaVencimiento: e.dia(15), cantidad: 100,
    });
    await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.tela, numeroLote: "T-1", cantidad: 2 });
    const b1 = await registrarIngreso(e.bodegueroB, {
      ubicacionId: e.bodegaB, insumoId: e.tela, numeroLote: "SOLO-B", cantidad: 9,
    });
    movimientoA = a1.movimiento.id;
    movimientoB = b1.movimiento.id;
  });

  it("listarInventario busca por número de lote dentro del alcance", async () => {
    const r = await listarInventario(e.admin, { centroId: e.centroA, texto: "zeta" });
    expect(r.items.map((i) => i.codigo)).toEqual(["DIA-001"]);
    // El lote SOLO-B existe solo en el centro B: desde el centro A no aparece.
    expect((await listarInventario(e.admin, { centroId: e.centroA, texto: "solo-b" })).total).toBe(0);
    expect((await listarInventario(e.admin, { texto: "solo-b" })).items.map((i) => i.codigo)).toEqual(["TEL-001"]);
    expect((await listarInventario(e.bodeguero, { texto: "solo-b" })).total).toBe(0);
  });

  it("listarInventario ordena por disponible, código y próximo vencimiento", async () => {
    const codigos = async (orden: OrdenInventario | null) =>
      (await listarInventario(e.admin, { centroId: e.centroA, orden })).items.map((i) => i.codigo);
    expect(await codigos("NOMBRE")).toEqual(["DIA-001", "GUA-001", "TEL-001"]);
    expect(await codigos("CODIGO")).toEqual(["DIA-001", "GUA-001", "TEL-001"]);
    expect(await codigos("DISPONIBLE_ASC")).toEqual(["TEL-001", "DIA-001", "GUA-001"]);
    expect(await codigos("DISPONIBLE_DESC")).toEqual(["GUA-001", "DIA-001", "TEL-001"]);
    // Guantes vence en 15 días, dializador en 40; la tela no tiene vencimiento (al final).
    expect(await codigos("VENCIMIENTO")).toEqual(["GUA-001", "DIA-001", "TEL-001"]);
    expect(await codigos(null)).toEqual(["DIA-001", "GUA-001", "TEL-001"]);
  });

  it("obtenerMovimiento respeta el alcance de centros y el permiso", async () => {
    const propio = await obtenerMovimiento(e.bodeguero, movimientoA);
    expect(propio).toMatchObject({ id: movimientoA, tipo: "INGRESO", numeroLote: "ZETA-77", cantidad: 30, saldoPosterior: 30 });
    expect(await obtenerMovimiento(e.bodeguero, movimientoB)).toBeNull();
    expect((await obtenerMovimiento(e.admin, movimientoB))?.numeroLote).toBe("SOLO-B");
    expect(await obtenerMovimiento(e.admin, "no-existe")).toBeNull();
    await esperarError(obtenerMovimiento(e.visitante, movimientoA), "SIN_PERMISO");
  });

  it("usuariosConMovimientos lista solo a quienes movieron stock en el alcance", async () => {
    const nombres = async (...args: Parameters<typeof usuariosConMovimientos>) =>
      (await usuariosConMovimientos(...args)).map((u) => u.nombre);
    expect(await nombres(e.admin)).toEqual(["bodega", "bodegab"]);
    expect(await nombres(e.admin, { centroId: e.centroB })).toEqual(["bodegab"]);
    expect(await nombres(e.bodeguero)).toEqual(["bodega"]);
    await esperarError(usuariosConMovimientos(e.bodeguero, { centroId: e.centroB }), "SIN_ACCESO_AL_CENTRO");
    await esperarError(usuariosConMovimientos(e.visitante), "SIN_PERMISO");
  });

  it("obtenerOpcionInsumo devuelve la opción (también de insumos inactivos) o null", async () => {
    expect(await obtenerOpcionInsumo(e.visitante, e.tela)).toMatchObject({
      id: e.tela, codigo: "TEL-001", controlaVencimiento: false, categoria: "General", activo: true,
    });
    expect((await obtenerOpcionInsumo(e.admin, e.insumoInactivo))?.activo).toBe(false);
    expect(await obtenerOpcionInsumo(e.admin, "no-existe")).toBeNull();
  });

  it("la vista previa FEFO coincide con lo que descuenta registrarRetiro", async () => {
    await sembrarLoteVencido(e.dializador, e.bodegaA, 7, "VENCIDO-9");
    const lotes = await lotesDisponibles(e.bodeguero, { insumoId: e.dializador, ubicacionId: e.bodegaA, incluirVencidos: true });
    const plan = planificarFefo(lotes, 12);
    expect(plan).toMatchObject({ disponible: 35, vencido: 7, faltante: 0 });

    const retiro = await registrarRetiro(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, cantidad: 12 });
    expect(retiro.movimientos.map((m) => [m.numeroLote, m.cantidad, m.saldoPosterior])).toEqual(
      plan.lineas.map((l) => [l.lote.numeroLote, l.tomar, l.queda]),
    );
    expect(retiro.movimientos.map((m) => m.numeroLote)).toEqual(["ALFA-10", "ZETA-77"]);

    const historial = await listarMovimientos(e.bodeguero, { insumoId: e.dializador, tipo: "RETIRO" });
    expect(historial.total).toBe(2);
  });
});
