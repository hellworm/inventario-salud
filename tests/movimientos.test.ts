import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  registrarAjuste,
  registrarIngreso,
  registrarMerma,
  registrarRetiro,
  registrarTraslado,
} from "@/server/servicios";
import {
  crearEscenario,
  esperarError,
  sembrarLoteVencido,
  stockDe,
  stockInsumo,
  type Escenario,
} from "./soporte/escenario";

let e: Escenario;
beforeEach(async () => {
  e = await crearEscenario();
});

describe("registrarIngreso", () => {
  it("crea lote, existencia, movimiento y auditoría", async () => {
    const r = await registrarIngreso(e.bodeguero, {
      ubicacionId: e.bodegaA,
      insumoId: e.dializador,
      numeroLote: " l-100 ",
      fechaVencimiento: e.dia(200),
      cantidad: "24",
      proveedorId: e.proveedor,
      documentoRef: "Guía 4521",
      costoUnitario: "12.500",
    });

    expect(r.loteCreado).toBe(true);
    expect(r.movimiento).toMatchObject({
      tipo: "INGRESO",
      cantidad: 24,
      saldoPosterior: 24,
      numeroLote: "L-100",
      centroId: e.centroA,
    });
    expect(await stockDe(r.movimiento.loteId, e.bodegaA)).toBe(24);

    const mov = await db.movimiento.findUniqueOrThrow({ where: { id: r.movimiento.id } });
    expect(mov.usuarioId).toBe(e.bodeguero.usuarioId);
    expect(mov.proveedorId).toBe(e.proveedor);
    expect(mov.documentoRef).toBe("Guía 4521");
    expect(Number(mov.costoUnitario)).toBe(12500);

    const auditoria = await db.registroAuditoria.findMany({ orderBy: { creadoEn: "asc" } });
    expect(auditoria.map((a) => a.accion).sort()).toEqual(["LOTE_CREADO", "MOVIMIENTO_INGRESO"]);
    expect(auditoria.every((a) => a.usuarioId === e.bodeguero.usuarioId && a.ip === "127.0.0.1")).toBe(true);
  });

  it("reutiliza el lote existente y acumula el saldo", async () => {
    const base = { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "L-1", fechaVencimiento: e.dia(120) };
    const a = await registrarIngreso(e.bodeguero, { ...base, cantidad: 10 });
    const b = await registrarIngreso(e.admin, { ...base, cantidad: 5 });
    // Sin indicar fecha también reutiliza el lote.
    const c = await registrarIngreso(e.admin, { ...base, fechaVencimiento: undefined, ubicacionId: e.salaA, cantidad: 3 });

    expect(b.loteCreado).toBe(false);
    expect(b.movimiento.loteId).toBe(a.movimiento.loteId);
    expect(b.movimiento.saldoPosterior).toBe(15);
    expect(c.movimiento.loteId).toBe(a.movimiento.loteId);
    expect(c.movimiento.saldoPosterior).toBe(3);
    expect(await db.lote.count()).toBe(1);
  });

  it("rechaza cambiar el vencimiento de un lote existente", async () => {
    const base = { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "L-1", cantidad: 10 };
    const a = await registrarIngreso(e.bodeguero, { ...base, fechaVencimiento: e.dia(120) });
    const error = await esperarError(
      registrarIngreso(e.bodeguero, { ...base, fechaVencimiento: e.dia(150) }),
      "LOTE_INCONSISTENTE",
    );
    expect(error.campo).toBe("fechaVencimiento");
    expect(await stockDe(a.movimiento.loteId, e.bodegaA)).toBe(10);
    expect(await db.movimiento.count()).toBe(1);
  });

  it("exige vencimiento si el insumo lo controla y lo permite omitir si no", async () => {
    await esperarError(
      registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "X", cantidad: 1 }),
      "VENCIMIENTO_REQUERIDO",
    );
    expect(await db.lote.count()).toBe(0);

    const r = await registrarIngreso(e.bodeguero, {
      ubicacionId: e.bodegaA,
      insumoId: e.tela,
      numeroLote: "S/L",
      cantidad: 30,
    });
    expect(r.movimiento.saldoPosterior).toBe(30);
  });

  it("rechaza ingresar un lote ya vencido, pero acepta uno que vence hoy", async () => {
    const base = { ubicacionId: e.bodegaA, insumoId: e.dializador, cantidad: 1 };
    await esperarError(
      registrarIngreso(e.bodeguero, { ...base, numeroLote: "AYER", fechaVencimiento: e.dia(-1) }),
      "LOTE_VENCIDO",
    );
    expect(await db.lote.count()).toBe(0);
    await registrarIngreso(e.bodeguero, { ...base, numeroLote: "HOY", fechaVencimiento: e.hoy });
    expect(await db.lote.count()).toBe(1);
  });

  it("rechaza ubicación inactiva, insumo inactivo e insumo inexistente", async () => {
    const base = { numeroLote: "L", fechaVencimiento: e.dia(90), cantidad: 1 };
    await esperarError(
      registrarIngreso(e.admin, { ...base, ubicacionId: e.ubicacionInactivaA, insumoId: e.dializador }),
      "INACTIVO",
    );
    await esperarError(
      registrarIngreso(e.admin, { ...base, ubicacionId: e.bodegaA, insumoId: e.insumoInactivo }),
      "INACTIVO",
    );
    await esperarError(
      registrarIngreso(e.admin, { ...base, ubicacionId: e.bodegaA, insumoId: "no-existe" }),
      "NO_ENCONTRADO",
    );
  });

  it("valida los datos de entrada con mensajes por campo", async () => {
    const error = await esperarError(
      registrarIngreso(e.bodeguero, {
        ubicacionId: e.bodegaA,
        insumoId: e.dializador,
        numeroLote: "",
        fechaVencimiento: "31-02-2026",
        cantidad: 0,
      }),
      "VALIDACION",
    );
    const campos = (error.detalle as { erroresCampo: Record<string, string[]> }).erroresCampo;
    expect(Object.keys(campos).sort()).toEqual(["cantidad", "fechaVencimiento", "numeroLote"]);
    await esperarError(
      registrarIngreso(e.bodeguero, {
        ubicacionId: e.bodegaA,
        insumoId: e.dializador,
        numeroLote: "L",
        fechaVencimiento: e.dia(10),
        cantidad: 1.5,
      }),
      "VALIDACION",
    );
  });
});

describe("registrarRetiro", () => {
  async function tresLotes() {
    const base = { ubicacionId: e.bodegaA, insumoId: e.dializador };
    // Se ingresan desordenados a propósito: FEFO ordena por vencimiento.
    const tardio = await registrarIngreso(e.admin, { ...base, numeroLote: "TARDIO", fechaVencimiento: e.dia(300), cantidad: 10 });
    const proximo = await registrarIngreso(e.admin, { ...base, numeroLote: "PROXIMO", fechaVencimiento: e.dia(20), cantidad: 4 });
    const medio = await registrarIngreso(e.admin, { ...base, numeroLote: "MEDIO", fechaVencimiento: e.dia(100), cantidad: 6 });
    return { tardio: tardio.movimiento.loteId, proximo: proximo.movimiento.loteId, medio: medio.movimiento.loteId };
  }

  it("FEFO: consume primero el lote que vence antes y continúa con los siguientes", async () => {
    const lotes = await tresLotes();
    const r = await registrarRetiro(e.bodeguero, {
      ubicacionId: e.bodegaA,
      insumoId: e.dializador,
      cantidad: 12,
      motivo: "Sala 1, turno mañana",
    });

    expect(r.cantidadTotal).toBe(12);
    expect(r.movimientos.map((m) => [m.numeroLote, m.cantidad, m.saldoPosterior])).toEqual([
      ["PROXIMO", 4, 0],
      ["MEDIO", 6, 0],
      ["TARDIO", 2, 8],
    ]);
    expect(await stockDe(lotes.proximo, e.bodegaA)).toBe(0);
    expect(await stockDe(lotes.medio, e.bodegaA)).toBe(0);
    expect(await stockDe(lotes.tardio, e.bodegaA)).toBe(8);
    expect(await db.movimiento.count({ where: { tipo: "RETIRO" } })).toBe(3);
    expect(await db.registroAuditoria.count({ where: { accion: "MOVIMIENTO_RETIRO" } })).toBe(3);
  });

  it("FEFO deja los lotes sin vencimiento para el final", async () => {
    const base = { ubicacionId: e.bodegaA, insumoId: e.tela };
    await registrarIngreso(e.admin, { ...base, numeroLote: "SIN-FECHA", cantidad: 5 });
    await registrarIngreso(e.admin, { ...base, numeroLote: "CON-FECHA", fechaVencimiento: e.dia(400), cantidad: 5 });
    const r = await registrarRetiro(e.bodeguero, { ...base, cantidad: 7 });
    expect(r.movimientos.map((m) => [m.numeroLote, m.cantidad])).toEqual([
      ["CON-FECHA", 5],
      ["SIN-FECHA", 2],
    ]);
  });

  it("retira de un lote específico", async () => {
    const lotes = await tresLotes();
    const r = await registrarRetiro(e.bodeguero, {
      ubicacionId: e.bodegaA,
      insumoId: e.dializador,
      loteId: lotes.tardio,
      cantidad: 3,
    });
    expect(r.movimientos).toHaveLength(1);
    expect(r.movimientos[0]).toMatchObject({ numeroLote: "TARDIO", saldoPosterior: 7 });
    expect(await stockDe(lotes.proximo, e.bodegaA)).toBe(4);
  });

  it("rechaza stock insuficiente sin modificar nada", async () => {
    await tresLotes();
    const error = await esperarError(
      registrarRetiro(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, cantidad: 21 }),
      "STOCK_INSUFICIENTE",
    );
    expect(error.detalle).toMatchObject({ solicitado: 21, disponible: 20 });
    expect(error.message).toContain("Stock insuficiente");
    expect(await stockInsumo(e.dializador, e.bodegaA)).toBe(20);
    expect(await db.movimiento.count({ where: { tipo: "RETIRO" } })).toBe(0);
  });

  it("rechaza stock insuficiente en un lote específico aunque haya en otros", async () => {
    const lotes = await tresLotes();
    await esperarError(
      registrarRetiro(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, loteId: lotes.proximo, cantidad: 5 }),
      "STOCK_INSUFICIENTE",
    );
    // El stock está en otra ubicación: tampoco alcanza.
    await esperarError(
      registrarRetiro(e.bodeguero, { ubicacionId: e.salaA, insumoId: e.dializador, cantidad: 1 }),
      "STOCK_INSUFICIENTE",
    );
  });

  it("rechaza retirar un lote vencido", async () => {
    const vencido = await sembrarLoteVencido(e.dializador, e.bodegaA, 8);
    const error = await esperarError(
      registrarRetiro(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, loteId: vencido, cantidad: 1 }),
      "LOTE_VENCIDO",
    );
    expect(error.message).toContain("merma");
    expect(await stockDe(vencido, e.bodegaA)).toBe(8);
  });

  it("FEFO nunca toma lotes vencidos, aunque sean lo único que queda", async () => {
    const vencido = await sembrarLoteVencido(e.dializador, e.bodegaA, 8);
    const vigente = await registrarIngreso(e.admin, {
      ubicacionId: e.bodegaA,
      insumoId: e.dializador,
      numeroLote: "VIGENTE",
      fechaVencimiento: e.dia(60),
      cantidad: 5,
    });

    const r = await registrarRetiro(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, cantidad: 5 });
    expect(r.movimientos.map((m) => m.numeroLote)).toEqual(["VIGENTE"]);

    const error = await esperarError(
      registrarRetiro(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, cantidad: 1 }),
      "STOCK_INSUFICIENTE",
    );
    expect(error.detalle).toMatchObject({ disponible: 0, vencido: 8 });
    expect(await stockDe(vencido, e.bodegaA)).toBe(8);
    expect(await stockDe(vigente.movimiento.loteId, e.bodegaA)).toBe(0);
  });

  it("rechaza un lote que no corresponde al insumo", async () => {
    const otro = await registrarIngreso(e.admin, {
      ubicacionId: e.bodegaA,
      insumoId: e.guantes,
      numeroLote: "G-1",
      fechaVencimiento: e.dia(60),
      cantidad: 5,
    });
    await esperarError(
      registrarRetiro(e.bodeguero, {
        ubicacionId: e.bodegaA,
        insumoId: e.dializador,
        loteId: otro.movimiento.loteId,
        cantidad: 1,
      }),
      "NO_ENCONTRADO",
    );
  });
});

describe("registrarMerma y registrarAjuste", () => {
  it("la merma es la única salida para un lote vencido", async () => {
    const vencido = await sembrarLoteVencido(e.dializador, e.bodegaA, 8);
    const m = await registrarMerma(e.admin, {
      ubicacionId: e.bodegaA,
      loteId: vencido,
      cantidad: 8,
      motivo: "Vencimiento",
    });
    expect(m).toMatchObject({ tipo: "MERMA", cantidad: 8, saldoPosterior: 0 });
    expect(await stockDe(vencido, e.bodegaA)).toBe(0);
    expect(await db.registroAuditoria.count({ where: { accion: "MOVIMIENTO_MERMA" } })).toBe(1);

    await esperarError(
      registrarMerma(e.admin, { ubicacionId: e.bodegaA, loteId: vencido, cantidad: 1, motivo: "Vencimiento" }),
      "STOCK_INSUFICIENTE",
    );
  });

  it("merma y ajuste exigen motivo", async () => {
    const vencido = await sembrarLoteVencido(e.dializador, e.bodegaA, 8);
    await esperarError(
      registrarMerma(e.admin, { ubicacionId: e.bodegaA, loteId: vencido, cantidad: 1, motivo: "  " }),
      "VALIDACION",
    );
    await esperarError(
      registrarAjuste(e.admin, { ubicacionId: e.bodegaA, loteId: vencido, sentido: "NEGATIVO", cantidad: 1, motivo: "" }),
      "VALIDACION",
    );
  });

  it("ajuste positivo y negativo actualizan el saldo", async () => {
    const ing = await registrarIngreso(e.admin, {
      ubicacionId: e.bodegaA,
      insumoId: e.guantes,
      numeroLote: "G-1",
      fechaVencimiento: e.dia(365),
      cantidad: 100,
    });
    const loteId = ing.movimiento.loteId;
    const mas = await registrarAjuste(e.admin, {
      ubicacionId: e.bodegaA,
      loteId,
      sentido: "POSITIVO",
      cantidad: 7,
      motivo: "Conteo de inventario",
    });
    expect(mas).toMatchObject({ tipo: "AJUSTE_POSITIVO", saldoPosterior: 107 });
    const menos = await registrarAjuste(e.admin, {
      ubicacionId: e.bodegaA,
      loteId,
      sentido: "NEGATIVO",
      cantidad: 27,
      motivo: "Conteo de inventario",
    });
    expect(menos).toMatchObject({ tipo: "AJUSTE_NEGATIVO", saldoPosterior: 80 });
    await esperarError(
      registrarAjuste(e.admin, { ubicacionId: e.bodegaA, loteId, sentido: "NEGATIVO", cantidad: 81, motivo: "Conteo" }),
      "STOCK_INSUFICIENTE",
    );
    // Un ajuste positivo puede crear la existencia en otra ubicación.
    const enSala = await registrarAjuste(e.admin, {
      ubicacionId: e.salaA,
      loteId,
      sentido: "POSITIVO",
      cantidad: 2,
      motivo: "Stock inicial",
    });
    expect(enSala.saldoPosterior).toBe(2);
  });
});

describe("registrarTraslado", () => {
  async function loteEnBodegaA(cantidad = 20) {
    const r = await registrarIngreso(e.admin, {
      ubicacionId: e.bodegaA,
      insumoId: e.dializador,
      numeroLote: "T-1",
      fechaVencimiento: e.dia(180),
      cantidad,
    });
    return r.movimiento.loteId;
  }

  it("traslada dentro del centro con dos movimientos enlazados", async () => {
    const loteId = await loteEnBodegaA();
    const r = await registrarTraslado(e.admin, {
      loteId,
      ubicacionOrigenId: e.bodegaA,
      ubicacionDestinoId: e.salaA,
      cantidad: 8,
    });
    expect(r.salida).toMatchObject({ tipo: "TRASLADO_SALIDA", cantidad: 8, saldoPosterior: 12, ubicacionId: e.bodegaA });
    expect(r.entrada).toMatchObject({ tipo: "TRASLADO_ENTRADA", cantidad: 8, saldoPosterior: 8, ubicacionId: e.salaA });
    expect(await stockDe(loteId, e.bodegaA)).toBe(12);
    expect(await stockDe(loteId, e.salaA)).toBe(8);

    const enlazados = await db.movimiento.findMany({ where: { trasladoGrupoId: r.trasladoGrupoId } });
    expect(enlazados.map((m) => m.tipo).sort()).toEqual(["TRASLADO_ENTRADA", "TRASLADO_SALIDA"]);
    expect(await db.registroAuditoria.count({ where: { accion: "MOVIMIENTO_TRASLADO" } })).toBe(1);
  });

  it("traslada entre centros y cada movimiento queda en su centro", async () => {
    const loteId = await loteEnBodegaA();
    const r = await registrarTraslado(e.admin, {
      loteId,
      ubicacionOrigenId: e.bodegaA,
      ubicacionDestinoId: e.bodegaB,
      cantidad: 20,
    });
    expect(r.salida.centroId).toBe(e.centroA);
    expect(r.entrada.centroId).toBe(e.centroB);
    expect(await stockDe(loteId, e.bodegaA)).toBe(0);
    expect(await stockDe(loteId, e.bodegaB)).toBe(20);
  });

  it("rechaza stock insuficiente, mismo origen/destino y destino inactivo", async () => {
    const loteId = await loteEnBodegaA(5);
    await esperarError(
      registrarTraslado(e.admin, { loteId, ubicacionOrigenId: e.bodegaA, ubicacionDestinoId: e.salaA, cantidad: 6 }),
      "STOCK_INSUFICIENTE",
    );
    await esperarError(
      registrarTraslado(e.admin, { loteId, ubicacionOrigenId: e.bodegaA, ubicacionDestinoId: e.bodegaA, cantidad: 1 }),
      "VALIDACION",
    );
    await esperarError(
      registrarTraslado(e.admin, { loteId, ubicacionOrigenId: e.bodegaA, ubicacionDestinoId: e.ubicacionInactivaA, cantidad: 1 }),
      "INACTIVO",
    );
    expect(await stockDe(loteId, e.bodegaA)).toBe(5);
    expect(await db.movimiento.count({ where: { tipo: { in: ["TRASLADO_SALIDA", "TRASLADO_ENTRADA"] } } })).toBe(0);
  });
});

describe("integridad a nivel de base de datos", () => {
  it("el CHECK impide existencias negativas", async () => {
    const vencido = await sembrarLoteVencido(e.dializador, e.bodegaA, 2);
    await expect(
      db.$executeRaw`UPDATE "existencias" SET "cantidad" = -1 WHERE "loteId" = ${vencido}`,
    ).rejects.toThrow(/existencias_cantidad_no_negativa/);
  });

  it("los movimientos no se pueden editar ni borrar", async () => {
    const r = await registrarIngreso(e.admin, {
      ubicacionId: e.bodegaA,
      insumoId: e.tela,
      numeroLote: "L",
      cantidad: 1,
    });
    await expect(
      db.movimiento.update({ where: { id: r.movimiento.id }, data: { cantidad: 999 } }),
    ).rejects.toThrow(/inmutables/);
    await expect(db.movimiento.delete({ where: { id: r.movimiento.id } })).rejects.toThrow(/inmutables/);
    expect((await db.movimiento.findUniqueOrThrow({ where: { id: r.movimiento.id } })).cantidad).toBe(1);
  });
});
