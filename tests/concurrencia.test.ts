import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { ErrorDominio } from "@/server/errores";
import { registrarIngreso, registrarRetiro, registrarTraslado } from "@/server/servicios";
import { crearEscenario, stockDe, stockInsumo, type Escenario } from "./soporte/escenario";

let e: Escenario;
beforeEach(async () => {
  e = await crearEscenario();
});

function codigos(resultados: PromiseSettledResult<unknown>[]): string[] {
  return resultados.map((r) =>
    r.status === "fulfilled" ? "OK" : r.reason instanceof ErrorDominio ? r.reason.codigo : `INESPERADO: ${String(r.reason)}`,
  );
}

describe("concurrencia", () => {
  it("dos retiros simultáneos que juntos exceden el stock: solo uno pasa", async () => {
    const ing = await registrarIngreso(e.admin, {
      ubicacionId: e.bodegaA,
      insumoId: e.dializador,
      numeroLote: "C-1",
      fechaVencimiento: e.dia(90),
      cantidad: 10,
    });
    const retiro = () => registrarRetiro(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, cantidad: 7 });

    const resultados = await Promise.allSettled([retiro(), retiro()]);

    expect(codigos(resultados).sort()).toEqual(["OK", "STOCK_INSUFICIENTE"]);
    expect(await stockDe(ing.movimiento.loteId, e.bodegaA)).toBe(3);
    expect(await db.movimiento.count({ where: { tipo: "RETIRO" } })).toBe(1);
  });

  it("30 retiros simultáneos de 1 unidad sobre 12 de stock (2 lotes): exactamente 12 pasan", async () => {
    const base = { ubicacionId: e.bodegaA, insumoId: e.dializador };
    await registrarIngreso(e.admin, { ...base, numeroLote: "C-1", fechaVencimiento: e.dia(30), cantidad: 5 });
    await registrarIngreso(e.admin, { ...base, numeroLote: "C-2", fechaVencimiento: e.dia(60), cantidad: 7 });

    const resultados = await Promise.allSettled(
      Array.from({ length: 30 }, () => registrarRetiro(e.bodeguero, { ...base, cantidad: 1 })),
    );
    const c = codigos(resultados);

    expect(c.filter((x) => x === "OK")).toHaveLength(12);
    expect(c.filter((x) => x === "STOCK_INSUFICIENTE")).toHaveLength(18);
    expect(await stockInsumo(e.dializador, e.bodegaA)).toBe(0);
    const negativos = await db.existencia.count({ where: { cantidad: { lt: 0 } } });
    expect(negativos).toBe(0);

    // El libro mayor cuadra con las existencias y los saldos nunca se repiten.
    const retiros = await db.movimiento.findMany({ where: { tipo: "RETIRO" } });
    expect(retiros.reduce((s, m) => s + m.cantidad, 0)).toBe(12);
    const saldos = new Set(retiros.map((m) => `${m.loteId}:${m.saldoPosterior}`));
    expect(saldos.size).toBe(12);
  });

  it("ingresos simultáneos del mismo lote nuevo crean un solo lote y suman bien", async () => {
    const ingreso = () =>
      registrarIngreso(e.bodeguero, {
        ubicacionId: e.bodegaA,
        insumoId: e.guantes,
        numeroLote: "NUEVO",
        fechaVencimiento: e.dia(200),
        cantidad: 10,
      });
    const resultados = await Promise.allSettled(Array.from({ length: 8 }, ingreso));

    expect(codigos(resultados).every((x) => x === "OK")).toBe(true);
    expect(await db.lote.count({ where: { insumoId: e.guantes } })).toBe(1);
    expect(await stockInsumo(e.guantes, e.bodegaA)).toBe(80);
    const creados = resultados.filter((r) => r.status === "fulfilled" && r.value.loteCreado);
    expect(creados).toHaveLength(1);
  });

  it("traslados cruzados simultáneos no se interbloquean ni pierden unidades", async () => {
    const ing = await registrarIngreso(e.admin, {
      ubicacionId: e.bodegaA,
      insumoId: e.dializador,
      numeroLote: "X-1",
      fechaVencimiento: e.dia(90),
      cantidad: 50,
    });
    const loteId = ing.movimiento.loteId;
    await registrarTraslado(e.admin, { loteId, ubicacionOrigenId: e.bodegaA, ubicacionDestinoId: e.salaA, cantidad: 25 });

    const ida = () => registrarTraslado(e.admin, { loteId, ubicacionOrigenId: e.bodegaA, ubicacionDestinoId: e.salaA, cantidad: 2 });
    const vuelta = () => registrarTraslado(e.admin, { loteId, ubicacionOrigenId: e.salaA, ubicacionDestinoId: e.bodegaA, cantidad: 3 });
    const resultados = await Promise.allSettled([ida(), vuelta(), ida(), vuelta(), ida(), vuelta(), ida(), vuelta()]);

    expect(codigos(resultados).every((x) => x === "OK")).toBe(true);
    expect(await stockDe(loteId, e.bodegaA)).toBe(25 - 8 + 12);
    expect(await stockDe(loteId, e.salaA)).toBe(25 + 8 - 12);
  });

  it("retiro y traslado simultáneos sobre el mismo lote respetan el stock", async () => {
    const ing = await registrarIngreso(e.admin, {
      ubicacionId: e.bodegaA,
      insumoId: e.dializador,
      numeroLote: "M-1",
      fechaVencimiento: e.dia(90),
      cantidad: 10,
    });
    const loteId = ing.movimiento.loteId;
    const resultados = await Promise.allSettled([
      registrarRetiro(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, cantidad: 8 }),
      registrarTraslado(e.admin, { loteId, ubicacionOrigenId: e.bodegaA, ubicacionDestinoId: e.salaA, cantidad: 8 }),
    ]);
    expect(codigos(resultados).sort()).toEqual(["OK", "STOCK_INSUFICIENTE"]);
    expect((await stockDe(loteId, e.bodegaA)) + (await stockDe(loteId, e.salaA))).toBeGreaterThanOrEqual(2);
    expect(await stockDe(loteId, e.bodegaA)).toBe(2);
  });
});
