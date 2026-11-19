import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { nuevaClaveIdempotencia, zCantidad, zClaveIdempotencia, zEnteroNoNegativo } from "@/lib/esquemas/base";
import type { CeldaCsv } from "@/lib/csv";
import { db } from "@/server/db";
import { ErrorDominio } from "@/server/errores";
import {
  avisoDeTope,
  buscarInsumos,
  conAvisoDeTope,
  corregirVencimientoLote,
  establecerCentroActivo,
  establecerUbicacionActiva,
  listarMovimientos,
  listarUsuarios,
  lotesDeInsumo,
  registrarAjuste,
  registrarIngreso,
  registrarMerma,
  registrarRetiro,
  registrarTraslado,
} from "@/server/servicios";
import { crearEscenario, esperarError, stockDe, stockInsumo, type Escenario } from "./soporte/escenario";

let e: Escenario;
beforeEach(async () => {
  e = await crearEscenario();
});

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

/** Estado de una promesa tras `ms` milisegundos, sin esperar a que termine. */
async function estadoTras<T>(promesa: Promise<T>, ms: number): Promise<"pendiente" | "cumplida" | "rechazada"> {
  return Promise.race([
    promesa.then(
      () => "cumplida" as const,
      () => "rechazada" as const,
    ),
    esperar(ms).then(() => "pendiente" as const),
  ]);
}

function codigos(resultados: PromiseSettledResult<unknown>[]): string[] {
  return resultados.map((r) =>
    r.status === "fulfilled" ? "OK" : r.reason instanceof ErrorDominio ? r.reason.codigo : `INESPERADO: ${String(r.reason)}`,
  );
}

describe("B1 — lotes ya registrados de un insumo respetan el alcance", () => {
  it("un bodeguero no ve los lotes que solo existen en otros centros; el ADMIN ve todos", async () => {
    await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "EN-A", fechaVencimiento: e.dia(100), cantidad: 5 });
    await registrarIngreso(e.bodegueroB, { ubicacionId: e.bodegaB, insumoId: e.dializador, numeroLote: "EN-B", fechaVencimiento: e.dia(200), cantidad: 5 });

    expect((await lotesDeInsumo(e.bodeguero, e.dializador)).map((l) => l.numeroLote)).toEqual(["EN-A"]);
    expect((await lotesDeInsumo(e.visitante, e.dializador)).map((l) => l.numeroLote)).toEqual(["EN-A"]);
    expect((await lotesDeInsumo(e.bodegueroB, e.dializador)).map((l) => l.numeroLote)).toEqual(["EN-B"]);
    expect((await lotesDeInsumo(e.admin, e.dializador)).map((l) => l.numeroLote).sort()).toEqual(["EN-A", "EN-B"]);
  });

  it("incluye los lotes que pasaron por el centro aunque hoy no tengan stock allí", async () => {
    const ing = await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "PASO", fechaVencimiento: e.dia(100), cantidad: 5 });
    await registrarTraslado(e.admin, { loteId: ing.movimiento.loteId, ubicacionOrigenId: e.bodegaA, ubicacionDestinoId: e.bodegaB, cantidad: 5 });
    expect((await lotesDeInsumo(e.bodeguero, e.dializador)).map((l) => l.numeroLote)).toEqual(["PASO"]);
    expect((await lotesDeInsumo(e.bodegueroB, e.dializador)).map((l) => l.numeroLote)).toEqual(["PASO"]);
  });

  it("un usuario sin centros asignados no ve ningún lote", async () => {
    await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "EN-A", fechaVencimiento: e.dia(100), cantidad: 5 });
    expect(await lotesDeInsumo({ ...e.visitante, centroIds: [] }, e.dializador)).toEqual([]);
  });
});

describe("B2 — vencimiento de un lote existente", () => {
  it("completar la fecha de un lote sin fecha queda auditado con antes y después", async () => {
    const primero = await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.tela, numeroLote: "T-1", cantidad: 10 });
    await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.tela, numeroLote: "T-1", fechaVencimiento: e.dia(300), cantidad: 5 });

    const auditoria = await db.registroAuditoria.findMany({ where: { accion: "LOTE_ACTUALIZADO" } });
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]).toMatchObject({ entidad: "Lote", entidadId: primero.movimiento.loteId, usuarioId: e.bodeguero.usuarioId });
    expect(auditoria[0]!.detalle).toMatchObject({
      numeroLote: "T-1",
      origen: "INGRESO",
      cambios: { fechaVencimiento: { antes: null, despues: e.dia(300) } },
    });
  });

  it("no se puede completar si el lote tiene existencias en centros fuera del alcance; el ADMIN sí", async () => {
    const enB = await registrarIngreso(e.bodegueroB, { ubicacionId: e.bodegaB, insumoId: e.tela, numeroLote: "T-2", cantidad: 10 });
    const loteId = enB.movimiento.loteId;

    const error = await esperarError(
      registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.tela, numeroLote: "T-2", fechaVencimiento: e.dia(300), cantidad: 5 }),
      "LOTE_INCONSISTENTE",
    );
    expect(error.campo).toBe("fechaVencimiento");
    expect((await db.lote.findUniqueOrThrow({ where: { id: loteId } })).fechaVencimiento).toBeNull();
    expect(await stockDe(loteId, e.bodegaA)).toBe(0);
    expect(await db.registroAuditoria.count({ where: { accion: "LOTE_ACTUALIZADO" } })).toBe(0);

    // Sin fecha puede ingresar igual (no cambia nada del lote).
    await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.tela, numeroLote: "T-2", cantidad: 5 });

    // El ADMIN ve toda la red: puede completarla.
    await registrarIngreso(e.admin, { ubicacionId: e.bodegaA, insumoId: e.tela, numeroLote: "T-2", fechaVencimiento: e.dia(300), cantidad: 1 });
    expect(await db.registroAuditoria.count({ where: { accion: "LOTE_ACTUALIZADO" } })).toBe(1);
  });

  it("si el stock ajeno ya se agotó, el bodeguero puede completar la fecha", async () => {
    const enB = await registrarIngreso(e.bodegueroB, { ubicacionId: e.bodegaB, insumoId: e.tela, numeroLote: "T-3", cantidad: 4 });
    await registrarRetiro(e.bodegueroB, { ubicacionId: e.bodegaB, insumoId: e.tela, cantidad: 4 });
    await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.tela, numeroLote: "T-3", fechaVencimiento: e.dia(90), cantidad: 2 });
    expect((await db.lote.findUniqueOrThrow({ where: { id: enB.movimiento.loteId } })).fechaVencimiento).not.toBeNull();
  });

  it("corregirVencimientoLote: solo ADMIN, auditado con motivo, y sin registro si no cambia nada", async () => {
    const ing = await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "C-1", fechaVencimiento: e.dia(100), cantidad: 10 });
    const loteId = ing.movimiento.loteId;
    const entrada = { loteId, fechaVencimiento: e.dia(130), motivo: "Error de digitación en la guía" };

    await esperarError(corregirVencimientoLote(e.bodeguero, entrada), "SIN_PERMISO");
    await esperarError(corregirVencimientoLote(e.visitante, entrada), "SIN_PERMISO");
    await esperarError(corregirVencimientoLote(e.admin, { ...entrada, motivo: " " }), "VALIDACION");
    await esperarError(corregirVencimientoLote(e.admin, { ...entrada, loteId: "no-existe" }), "NO_ENCONTRADO");

    const r = await corregirVencimientoLote(e.admin, entrada);
    expect(r).toEqual({ loteId, numeroLote: "C-1", fechaVencimientoAnterior: e.dia(100), fechaVencimiento: e.dia(130), cambiado: true });
    const auditoria = await db.registroAuditoria.findFirstOrThrow({ where: { accion: "LOTE_ACTUALIZADO" } });
    expect(auditoria).toMatchObject({ entidadId: loteId, usuarioId: e.admin.usuarioId });
    expect(auditoria.detalle).toMatchObject({
      origen: "CORRECCION",
      motivo: "Error de digitación en la guía",
      cambios: { fechaVencimiento: { antes: e.dia(100), despues: e.dia(130) } },
      unidadesAfectadas: 10,
    });

    // Misma fecha: no cambia ni audita.
    expect((await corregirVencimientoLote(e.admin, entrada)).cambiado).toBe(false);
    expect(await db.registroAuditoria.count({ where: { accion: "LOTE_ACTUALIZADO" } })).toBe(1);
    // No genera movimientos ni toca el stock.
    expect(await db.movimiento.count()).toBe(1);
    expect(await stockDe(loteId, e.bodegaA)).toBe(10);
  });

  it("corregirVencimientoLote valida la fecha: obligatoria si controla vencimiento, máximo 15 años", async () => {
    const ing = await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "C-2", fechaVencimiento: e.dia(100), fechaFabricacion: e.dia(-30), cantidad: 10 });
    const loteId = ing.movimiento.loteId;
    await esperarError(corregirVencimientoLote(e.admin, { loteId, fechaVencimiento: "", motivo: "x" }), "VENCIMIENTO_REQUERIDO");
    await esperarError(corregirVencimientoLote(e.admin, { loteId, fechaVencimiento: e.dia(16 * 366), motivo: "x" }), "VALIDACION");
    const anterior = await esperarError(corregirVencimientoLote(e.admin, { loteId, fechaVencimiento: e.dia(-40), motivo: "x" }), "VALIDACION");
    expect(anterior.campo).toBe("fechaVencimiento");
    // Una fecha pasada (posterior a la fabricación) sí se admite: el lote queda vencido.
    expect((await corregirVencimientoLote(e.admin, { loteId, fechaVencimiento: e.dia(-1), motivo: "Venció ayer" })).cambiado).toBe(true);
    await esperarError(registrarRetiro(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, cantidad: 1 }), "STOCK_INSUFICIENTE");

    // Un insumo que no controla vencimiento sí puede quedar sin fecha.
    const tela = await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.tela, numeroLote: "C-3", fechaVencimiento: e.dia(50), cantidad: 1 });
    const sinFecha = await corregirVencimientoLote(e.admin, { loteId: tela.movimiento.loteId, motivo: "No lleva fecha" });
    expect(sinFecha).toMatchObject({ fechaVencimiento: null, cambiado: true });
  });
});

describe("B3 — movimientos y desactivaciones no se pisan", () => {
  it("un ingreso espera a la desactivación en curso de su ubicación y luego falla por INACTIVO", async () => {
    let liberar!: () => void;
    const pausa = new Promise<void>((resolver) => (liberar = resolver));
    // Simula una desactivación a medio camino: tiene la fila tomada con FOR UPDATE.
    const desactivacion = db.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(`SELECT "id" FROM "ubicaciones" WHERE "id" = $1 FOR UPDATE`, e.salaA);
      await pausa;
      await tx.ubicacion.update({ where: { id: e.salaA }, data: { activo: false } });
    });
    await esperar(100);
    const ingreso = registrarIngreso(e.bodeguero, { ubicacionId: e.salaA, insumoId: e.dializador, numeroLote: "R-1", fechaVencimiento: e.dia(90), cantidad: 5 });
    expect(await estadoTras(ingreso, 400)).toBe("pendiente");
    liberar();
    await desactivacion;
    await esperarError(ingreso, "INACTIVO");
    expect(await stockInsumo(e.dializador, e.salaA)).toBe(0);
  });

  it("desactivar una ubicación espera al movimiento en curso y cuenta su stock (EN_USO)", async () => {
    const lote = await db.lote.create({ data: { insumoId: e.dializador, numeroLote: "R-2", fechaVencimiento: new Date(`${e.dia(90)}T00:00:00.000Z`) } });
    let liberar!: () => void;
    const pausa = new Promise<void>((resolver) => (liberar = resolver));
    // Simula un ingreso a medio camino: leyó la ubicación con FOR SHARE y aún no confirma.
    const movimiento = db.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        `SELECT u."id" FROM "ubicaciones" u JOIN "centros" c ON c."id" = u."centroId" WHERE u."id" = $1 FOR SHARE OF u, c`,
        e.salaA,
      );
      await pausa;
      await tx.existencia.create({ data: { loteId: lote.id, ubicacionId: e.salaA, cantidad: 7 } });
    });
    await esperar(100);
    const desactivar = establecerUbicacionActiva(e.admin, e.salaA, false);
    expect(await estadoTras(desactivar, 400)).toBe("pendiente");
    liberar();
    await movimiento;
    const error = await esperarError(desactivar, "EN_USO");
    expect(error.detalle).toMatchObject({ existencias: 7 });
    expect((await db.ubicacion.findUniqueOrThrow({ where: { id: e.salaA } })).activo).toBe(true);
  });

  it("desactivar un centro espera al movimiento en curso y cuenta su stock (EN_USO)", async () => {
    const lote = await db.lote.create({ data: { insumoId: e.dializador, numeroLote: "R-3", fechaVencimiento: new Date(`${e.dia(90)}T00:00:00.000Z`) } });
    let liberar!: () => void;
    const pausa = new Promise<void>((resolver) => (liberar = resolver));
    const movimiento = db.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        `SELECT u."id" FROM "ubicaciones" u JOIN "centros" c ON c."id" = u."centroId" WHERE u."id" = $1 FOR SHARE OF u, c`,
        e.bodegaB,
      );
      await pausa;
      await tx.existencia.create({ data: { loteId: lote.id, ubicacionId: e.bodegaB, cantidad: 3 } });
    });
    await esperar(100);
    const desactivar = establecerCentroActivo(e.admin, e.centroB, false);
    expect(await estadoTras(desactivar, 400)).toBe("pendiente");
    liberar();
    await movimiento;
    await esperarError(desactivar, "EN_USO");
    expect((await db.centro.findUniqueOrThrow({ where: { id: e.centroB } })).activo).toBe(true);
  });

  it("ingresos y desactivaciones simultáneos reales: nunca queda stock en una ubicación inactiva", async () => {
    for (let ronda = 0; ronda < 6; ronda++) {
      const ubicacion = await db.ubicacion.create({ data: { centroId: e.centroA, nombre: `Temporal ${ronda}`, tipo: "SALA" } });
      const resultados = await Promise.allSettled([
        registrarIngreso(e.bodeguero, { ubicacionId: ubicacion.id, insumoId: e.guantes, numeroLote: `S-${ronda}`, fechaVencimiento: e.dia(90), cantidad: 4 }),
        establecerUbicacionActiva(e.admin, ubicacion.id, false),
        registrarIngreso(e.bodeguero, { ubicacionId: ubicacion.id, insumoId: e.guantes, numeroLote: `S-${ronda}`, fechaVencimiento: e.dia(90), cantidad: 4 }),
      ]);
      expect(codigos(resultados).every((c) => ["OK", "INACTIVO", "EN_USO"].includes(c)), codigos(resultados).join()).toBe(true);
      const final = await db.ubicacion.findUniqueOrThrow({ where: { id: ubicacion.id } });
      const stock = await stockInsumo(e.guantes, ubicacion.id);
      expect(final.activo || stock === 0, `ronda ${ronda}: activo=${final.activo} stock=${stock}`).toBe(true);
    }
  });
});

describe("B4 — enteros estrictos en los esquemas", () => {
  it("zCantidad acepta solo enteros o textos de dígitos", () => {
    expect(zCantidad.parse(24)).toBe(24);
    expect(zCantidad.parse("24")).toBe(24);
    expect(zCantidad.parse(" 24 ")).toBe(24);
    expect(zCantidad.parse("007")).toBe(7);
    for (const valor of ["0x10", "1e3", "1E3", "0b11", "0o7", "Infinity", "+5", "", "  ", "1 000", "1.000", "12abc", true, false, [5], ["5"], null, undefined, {}, NaN, Infinity]) {
      expect(zCantidad.safeParse(valor).success, JSON.stringify(valor) ?? String(valor)).toBe(false);
    }
  });

  it("zCantidad conserva los mensajes útiles para la persona", () => {
    const mensaje = (v: unknown) => zCantidad.safeParse(v).error?.issues[0]?.message;
    expect(mensaje("1.5")).toBe("La cantidad debe ser un número entero.");
    expect(mensaje("1,5")).toBe("La cantidad debe ser un número entero.");
    expect(mensaje(1.5)).toBe("La cantidad debe ser un número entero.");
    expect(mensaje("0")).toBe("La cantidad debe ser mayor que cero.");
    expect(mensaje("-3")).toBe("La cantidad debe ser mayor que cero.");
    expect(mensaje("1000001")).toBe("La cantidad es demasiado grande.");
    expect(mensaje("0x10")).toBe("Ingresa una cantidad válida.");
    expect(mensaje(true)).toBe("Ingresa una cantidad válida.");
  });

  it("zEnteroNoNegativo aplica las mismas reglas y admite cero", () => {
    expect(zEnteroNoNegativo.parse("0")).toBe(0);
    expect(zEnteroNoNegativo.parse(15)).toBe(15);
    expect(zEnteroNoNegativo.safeParse("-1").error?.issues[0]?.message).toBe("No puede ser negativo.");
    for (const valor of ["0x10", "1e3", "", true, [5], null, 2.5]) {
      expect(zEnteroNoNegativo.safeParse(valor).success, JSON.stringify(valor)).toBe(false);
    }
  });

  it("los servicios rechazan cantidades que antes se convertían en silencio", async () => {
    const base = { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "Z-1", fechaVencimiento: e.dia(90) };
    for (const cantidad of ["0x10", "1e3", true, [5]]) {
      await esperarError(registrarIngreso(e.bodeguero, { ...base, cantidad: cantidad as unknown as string }), "VALIDACION");
    }
    expect(await db.movimiento.count()).toBe(0);
  });
});

describe("B5 — fechas de lote coherentes", () => {
  const base = () => ({ ubicacionId: e.bodegaA, insumoId: e.dializador, cantidad: 5 });

  it("rechaza una fecha de fabricación futura", async () => {
    const error = await esperarError(
      registrarIngreso(e.bodeguero, { ...base(), numeroLote: "F-1", fechaVencimiento: e.dia(400), fechaFabricacion: e.dia(1) }),
      "VALIDACION",
    );
    expect(error.campo).toBe("fechaFabricacion");
    // Fabricado hoy sí es válido.
    await registrarIngreso(e.bodeguero, { ...base(), numeroLote: "F-1", fechaVencimiento: e.dia(400), fechaFabricacion: e.hoy });
  });

  it("rechaza un vencimiento a más de 15 años (año mal digitado) y acepta el límite exacto", async () => {
    const limite = `${Number(e.hoy.slice(0, 4)) + 15}${e.hoy.slice(4)}`;
    const pasado = `${Number(e.hoy.slice(0, 4)) + 16}-01-01`;
    const error = await esperarError(
      registrarIngreso(e.bodeguero, { ...base(), numeroLote: "F-2", fechaVencimiento: pasado }),
      "VALIDACION",
    );
    expect(error.campo).toBe("fechaVencimiento");
    await esperarError(registrarIngreso(e.bodeguero, { ...base(), numeroLote: "F-2", fechaVencimiento: "2206-11-30" }), "VALIDACION");
    expect(await db.lote.count()).toBe(0);
    // 28 de febrero evita el caso de un 29-02 inexistente al sumar años.
    if (!e.hoy.endsWith("-02-29")) {
      await registrarIngreso(e.bodeguero, { ...base(), numeroLote: "F-2", fechaVencimiento: limite });
    }
  });

  it("rechaza un vencimiento anterior a la fabricación (antes que por lote vencido)", async () => {
    const error = await esperarError(
      registrarIngreso(e.bodeguero, { ...base(), numeroLote: "F-3", fechaVencimiento: e.dia(-10), fechaFabricacion: e.dia(-5) }),
      "VALIDACION",
    );
    expect(error.campo).toBe("fechaFabricacion");
    expect(await db.lote.count()).toBe(0);
  });

  it("al completar la fecha de un lote existente se aplican las mismas reglas", async () => {
    await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.tela, numeroLote: "F-4", cantidad: 5 });
    await esperarError(
      registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.tela, numeroLote: "F-4", fechaVencimiento: "2206-01-01", cantidad: 5 }),
      "VALIDACION",
    );
  });
});

describe("B6 — idempotencia de movimientos", () => {
  it("genera claves UUID válidas y el esquema rechaza las que no lo son", () => {
    const clave = nuevaClaveIdempotencia();
    expect(zClaveIdempotencia.parse(clave)).toBe(clave);
    expect(zClaveIdempotencia.parse(clave.toUpperCase())).toBe(clave);
    expect(zClaveIdempotencia.parse("")).toBeUndefined();
    expect(zClaveIdempotencia.parse(null)).toBeUndefined();
    expect(zClaveIdempotencia.parse(undefined)).toBeUndefined();
    for (const valor of ["abc", "123", "x".repeat(36), `${clave}0`]) {
      expect(zClaveIdempotencia.safeParse(valor).success, valor).toBe(false);
    }
  });

  it("sin el generador nativo también produce UUID v4 válidos y distintos", () => {
    const original = globalThis.crypto.randomUUID;
    // @ts-expect-error se simula un contexto no seguro (HTTP), donde randomUUID no existe
    globalThis.crypto.randomUUID = undefined;
    try {
      const claves = Array.from({ length: 50 }, () => nuevaClaveIdempotencia());
      expect(new Set(claves).size).toBe(50);
      for (const c of claves) {
        expect(c).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(zClaveIdempotencia.parse(c)).toBe(c);
      }
    } finally {
      globalThis.crypto.randomUUID = original;
    }
  });

  it("ingreso: reenviar la misma clave devuelve el resultado registrado sin duplicar", async () => {
    const clave = randomUUID();
    const entrada = { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "I-1", fechaVencimiento: e.dia(90), cantidad: 10, claveIdempotencia: clave };
    const a = await registrarIngreso(e.bodeguero, entrada);
    const b = await registrarIngreso(e.bodeguero, entrada);
    expect(a).toMatchObject({ repetido: false, loteCreado: true });
    expect(b).toMatchObject({ repetido: true, loteCreado: true });
    expect(b.movimiento).toEqual(a.movimiento);
    expect(await db.movimiento.count()).toBe(1);
    expect(await stockInsumo(e.dializador, e.bodegaA)).toBe(10);
    expect(await db.registroAuditoria.count({ where: { accion: "MOVIMIENTO_INGRESO" } })).toBe(1);

    // Sin clave (o con otra) sí es una operación nueva.
    const c = await registrarIngreso(e.bodeguero, { ...entrada, claveIdempotencia: randomUUID() });
    expect(c).toMatchObject({ repetido: false, loteCreado: false });
    await registrarIngreso(e.bodeguero, { ...entrada, claveIdempotencia: undefined });
    expect(await stockInsumo(e.dializador, e.bodegaA)).toBe(30);
  });

  it("doble envío simultáneo de un ingreso: un solo movimiento", async () => {
    const entrada = { ubicacionId: e.bodegaA, insumoId: e.guantes, numeroLote: "I-2", fechaVencimiento: e.dia(90), cantidad: 6, claveIdempotencia: randomUUID() };
    const resultados = await Promise.all(Array.from({ length: 6 }, () => registrarIngreso(e.bodeguero, entrada)));
    expect(resultados.filter((r) => !r.repetido)).toHaveLength(1);
    expect(new Set(resultados.map((r) => r.movimiento.id)).size).toBe(1);
    expect(await db.movimiento.count()).toBe(1);
    expect(await stockInsumo(e.guantes, e.bodegaA)).toBe(6);
  });

  it("doble envío simultáneo de un retiro FEFO multi-lote: se descuenta una sola vez", async () => {
    const base = { ubicacionId: e.bodegaA, insumoId: e.dializador };
    await registrarIngreso(e.admin, { ...base, numeroLote: "L-1", fechaVencimiento: e.dia(30), cantidad: 4 });
    await registrarIngreso(e.admin, { ...base, numeroLote: "L-2", fechaVencimiento: e.dia(60), cantidad: 6 });
    const entrada = { ...base, cantidad: 7, claveIdempotencia: randomUUID() };

    // Juntos pedirían 14 de 10: sin idempotencia el segundo fallaría por stock (o duplicaría).
    const resultados = await Promise.all([registrarRetiro(e.bodeguero, entrada), registrarRetiro(e.bodeguero, entrada), registrarRetiro(e.bodeguero, entrada)]);
    expect(resultados.filter((r) => !r.repetido)).toHaveLength(1);
    for (const r of resultados) {
      expect(r.cantidadTotal).toBe(7);
      expect(r.movimientos.map((m) => [m.numeroLote, m.cantidad, m.saldoPosterior])).toEqual([["L-1", 4, 0], ["L-2", 3, 3]]);
      expect(r.movimientos.map((m) => m.id)).toEqual(resultados[0]!.movimientos.map((m) => m.id));
    }
    expect(await db.movimiento.count({ where: { tipo: "RETIRO" } })).toBe(2);
    expect(await stockInsumo(e.dializador, e.bodegaA)).toBe(3);
    const guardados = await db.movimiento.findMany({ where: { claveIdempotencia: entrada.claveIdempotencia }, orderBy: { indiceIdempotencia: "asc" } });
    expect(guardados.map((m) => m.indiceIdempotencia)).toEqual([0, 1]);
  });

  it("doble envío simultáneo de un traslado: una salida y una entrada", async () => {
    const ing = await registrarIngreso(e.admin, { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "TR-1", fechaVencimiento: e.dia(90), cantidad: 10 });
    const loteId = ing.movimiento.loteId;
    const entrada = { loteId, ubicacionOrigenId: e.bodegaA, ubicacionDestinoId: e.bodegaB, cantidad: 6, claveIdempotencia: randomUUID() };
    const [a, b] = await Promise.all([registrarTraslado(e.admin, entrada), registrarTraslado(e.admin, entrada)]);
    expect([a.repetido, b.repetido].sort()).toEqual([false, true]);
    expect(a.trasladoGrupoId).toBe(b.trasladoGrupoId);
    expect(a.salida.id).toBe(b.salida.id);
    expect(a.entrada.id).toBe(b.entrada.id);
    expect(b.salida.tipo).toBe("TRASLADO_SALIDA");
    expect(b.entrada.tipo).toBe("TRASLADO_ENTRADA");
    expect(await stockDe(loteId, e.bodegaA)).toBe(4);
    expect(await stockDe(loteId, e.bodegaB)).toBe(6);
    expect(await db.movimiento.count({ where: { tipo: { in: ["TRASLADO_SALIDA", "TRASLADO_ENTRADA"] } } })).toBe(2);
    expect(await db.registroAuditoria.count({ where: { accion: "MOVIMIENTO_TRASLADO" } })).toBe(1);
  });

  it("doble envío simultáneo de ajustes y mermas", async () => {
    const ing = await registrarIngreso(e.admin, { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "AJ-1", fechaVencimiento: e.dia(90), cantidad: 10 });
    const loteId = ing.movimiento.loteId;
    const ajuste = { ubicacionId: e.bodegaA, loteId, sentido: "POSITIVO" as const, cantidad: 5, motivo: "Conteo", claveIdempotencia: randomUUID() };
    const ajustes = await Promise.all([registrarAjuste(e.admin, ajuste), registrarAjuste(e.admin, ajuste)]);
    expect(ajustes.map((a) => a.repetido ?? false).sort()).toEqual([false, true]);
    expect(ajustes[0]!.id).toBe(ajustes[1]!.id);
    expect(await stockDe(loteId, e.bodegaA)).toBe(15);

    const merma = { ubicacionId: e.bodegaA, loteId, cantidad: 9, motivo: "Daño", claveIdempotencia: randomUUID() };
    const mermas = await Promise.all([registrarMerma(e.admin, merma), registrarMerma(e.admin, merma)]);
    expect(mermas.map((m) => m.repetido ?? false).sort()).toEqual([false, true]);
    expect(await stockDe(loteId, e.bodegaA)).toBe(6);
    expect(await db.movimiento.count({ where: { tipo: "MERMA" } })).toBe(1);
  });

  it("una clave no sirve para leer la operación de otra persona ni para otra operación", async () => {
    const clave = randomUUID();
    const base = { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "P-1", fechaVencimiento: e.dia(90), cantidad: 10 };
    await registrarIngreso(e.bodeguero, { ...base, claveIdempotencia: clave });
    await esperarError(registrarIngreso(e.admin, { ...base, claveIdempotencia: clave }), "OPERACION_INVALIDA");
    await esperarError(registrarRetiro(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, cantidad: 1, claveIdempotencia: clave }), "OPERACION_INVALIDA");
    expect(await db.movimiento.count()).toBe(1);
    await esperarError(registrarIngreso(e.bodeguero, { ...base, claveIdempotencia: "no-es-uuid" }), "VALIDACION");
  });

  it("un intento fallido no consume la clave: se puede corregir y reenviar", async () => {
    const clave = randomUUID();
    const base = { ubicacionId: e.bodegaA, insumoId: e.dializador, claveIdempotencia: clave };
    await registrarIngreso(e.admin, { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "Q-1", fechaVencimiento: e.dia(90), cantidad: 3 });
    await esperarError(registrarRetiro(e.bodeguero, { ...base, cantidad: 5 }), "STOCK_INSUFICIENTE");
    const r = await registrarRetiro(e.bodeguero, { ...base, cantidad: 2 });
    expect(r).toMatchObject({ repetido: false, cantidadTotal: 2 });
  });

  it("la base impide dos movimientos con la misma clave e índice", async () => {
    const clave = randomUUID();
    const r = await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "U-1", fechaVencimiento: e.dia(90), cantidad: 1, claveIdempotencia: clave });
    const original = await db.movimiento.findUniqueOrThrow({ where: { id: r.movimiento.id } });
    const { id, ...copia } = original;
    void id;
    await expect(db.movimiento.create({ data: copia })).rejects.toThrow(/Unique constraint/);
    await expect(db.movimiento.create({ data: { ...copia, indiceIdempotencia: null } })).rejects.toThrow();
  });
});

describe("B7 — libro mayor y auditoría inmutables", () => {
  it("no se pueden vaciar los movimientos con TRUNCATE", async () => {
    await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "M-1", fechaVencimiento: e.dia(90), cantidad: 1 });
    await expect(db.$executeRawUnsafe(`TRUNCATE TABLE "movimientos"`)).rejects.toThrow(/inmutables/);
    await expect(db.$executeRawUnsafe(`TRUNCATE TABLE "movimientos" CASCADE`)).rejects.toThrow(/inmutables/);
    expect(await db.movimiento.count()).toBe(1);
  });

  it("la auditoría solo admite INSERT: ni UPDATE, ni DELETE, ni TRUNCATE", async () => {
    await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "M-2", fechaVencimiento: e.dia(90), cantidad: 1 });
    const registro = await db.registroAuditoria.findFirstOrThrow();
    const total = await db.registroAuditoria.count();
    await expect(db.registroAuditoria.update({ where: { id: registro.id }, data: { accion: "OTRA" } })).rejects.toThrow(/inmutables/);
    await expect(db.registroAuditoria.updateMany({ data: { ip: null } })).rejects.toThrow(/inmutables/);
    await expect(db.registroAuditoria.delete({ where: { id: registro.id } })).rejects.toThrow(/inmutables/);
    await expect(db.registroAuditoria.deleteMany()).rejects.toThrow(/inmutables/);
    await expect(db.$executeRawUnsafe(`TRUNCATE TABLE "registros_auditoria"`)).rejects.toThrow(/inmutables/);
    // TRUNCATE de usuarios con CASCADE alcanzaría la auditoría: también se rechaza.
    await expect(db.$executeRawUnsafe(`TRUNCATE TABLE "usuarios" CASCADE`)).rejects.toThrow(/inmutables/);
    expect(await db.registroAuditoria.count()).toBe(total);
    expect((await db.registroAuditoria.findUniqueOrThrow({ where: { id: registro.id } })).accion).toBe(registro.accion);
  });
});

describe("búsquedas sin tildes y orden por uso", () => {
  let solucion: string;
  beforeEach(async () => {
    const categoria = await db.categoria.findFirstOrThrow();
    const insumo = await db.insumo.create({
      data: { codigo: "SOL-ÁC1", nombre: "Solución de diálisis ácida", categoriaId: categoria.id, unidadMedida: "bidón", codigoBarras: "7800000000017" },
    });
    solucion = insumo.id;
  });

  it("buscarInsumos no distingue tildes ni mayúsculas, en nombre y código", async () => {
    for (const texto of ["solucion", "SOLUCIÓN", "dialisis acida", "sol-ac1", "7800000000017"]) {
      const r = await buscarInsumos(e.visitante, { texto });
      expect(r.map((i) => i.id), texto).toEqual([solucion]);
    }
    const r = await buscarInsumos(e.visitante, { texto: "solucion" });
    expect(r[0]).toEqual({
      id: solucion, codigo: "SOL-ÁC1", nombre: "Solución de diálisis ácida", presentacion: null, unidadMedida: "bidón",
      categoria: "General", controlaVencimiento: true, requiereCadenaFrio: false, codigoBarras: "7800000000017",
    });
    // Los comodines del usuario son texto literal y los inactivos no aparecen salvo que se pidan.
    expect(await buscarInsumos(e.visitante, { texto: "%" })).toEqual([]);
    expect(await buscarInsumos(e.visitante, { texto: "descontinuado" })).toEqual([]);
    expect(await buscarInsumos(e.visitante, { texto: "descontinuado", soloActivos: false })).toHaveLength(1);
    expect((await buscarInsumos(e.visitante)).map((i) => i.nombre)).toEqual([
      "Dializador 1.8 m²", "Guantes de nitrilo M", "Solución de diálisis ácida", "Tela adhesiva",
    ]);
    expect(await buscarInsumos(e.visitante, { limite: 2 })).toHaveLength(2);
  });

  it("buscarInsumos puede priorizar lo más retirado en el centro en los últimos 30 días", async () => {
    const ahora = new Date();
    const hace = (dias: number) => new Date(ahora.getTime() - dias * 86_400_000);
    const ingresar = (actor: Escenario["admin"], ubicacionId: string, insumoId: string, lote: string) =>
      registrarIngreso(actor, { ubicacionId, insumoId, numeroLote: lote, fechaVencimiento: e.dia(300), cantidad: 100 }, { ahora: hace(50) });
    await ingresar(e.admin, e.bodegaA, e.tela, "A1");
    await ingresar(e.admin, e.bodegaA, e.guantes, "A2");
    await ingresar(e.admin, e.bodegaA, e.dializador, "A3");
    await ingresar(e.admin, e.bodegaB, e.dializador, "B1");
    await registrarRetiro(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.tela, cantidad: 9 }, { ahora: hace(2) });
    await registrarRetiro(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.guantes, cantidad: 3 }, { ahora: hace(5) });
    // Fuera de la ventana de 30 días y en otro centro: no cuentan.
    await registrarRetiro(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, cantidad: 50 }, { ahora: hace(40) });
    await registrarRetiro(e.bodegueroB, { ubicacionId: e.bodegaB, insumoId: e.dializador, cantidad: 60 }, { ahora: hace(1) });

    const priorizado = await buscarInsumos(e.bodeguero, { priorizarRetirosDeCentroId: e.centroA });
    expect(priorizado.map((i) => i.nombre)).toEqual([
      "Tela adhesiva", "Guantes de nitrilo M", "Dializador 1.8 m²", "Solución de diálisis ácida",
    ]);
    // Con texto manda el orden alfabético; sin el parámetro, también.
    const conTexto = await buscarInsumos(e.bodeguero, { texto: "a", priorizarRetirosDeCentroId: e.centroA });
    expect(conTexto.map((i) => i.nombre)).toEqual([...conTexto.map((i) => i.nombre)].sort((a, b) => a.localeCompare(b, "es")));
    expect((await buscarInsumos(e.bodeguero))[0]!.nombre).toBe("Dializador 1.8 m²");
    // No se puede usar para sondear el consumo de un centro ajeno.
    await esperarError(buscarInsumos(e.bodeguero, { priorizarRetirosDeCentroId: e.centroB }), "SIN_ACCESO_AL_CENTRO");
    expect((await buscarInsumos(e.admin, { priorizarRetirosDeCentroId: e.centroB }))[0]!.nombre).toBe("Dializador 1.8 m²");
  });

  it("listarMovimientos busca sin tildes en insumo, lote y documento, respetando alcance y filtros", async () => {
    await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: solucion, numeroLote: "LOTE-ÑU1", fechaVencimiento: e.dia(90), cantidad: 10, documentoRef: "GUÍA 123" });
    await registrarIngreso(e.bodegueroB, { ubicacionId: e.bodegaB, insumoId: solucion, numeroLote: "OTRO-B", fechaVencimiento: e.dia(90), cantidad: 10, documentoRef: "Factura 9" });
    await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.guantes, numeroLote: "G-1", fechaVencimiento: e.dia(90), cantidad: 10 });
    await registrarRetiro(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: solucion, cantidad: 2 });

    const numeros = async (actor: Escenario["admin"], filtros: Parameters<typeof listarMovimientos>[1]) => {
      const r = await listarMovimientos(actor, filtros);
      expect(r.total).toBe(r.items.length);
      return r.items.map((m) => `${m.tipo}:${m.numeroLote}`).sort();
    };
    expect(await numeros(e.admin, { texto: "solucion" })).toEqual(["INGRESO:LOTE-ÑU1", "INGRESO:OTRO-B", "RETIRO:LOTE-ÑU1"]);
    expect(await numeros(e.admin, { texto: "DIALISIS ACIDA" })).toHaveLength(3);
    expect(await numeros(e.admin, { texto: "guia 123" })).toEqual(["INGRESO:LOTE-ÑU1"]);
    expect(await numeros(e.admin, { texto: "lote-nu1" })).toEqual(["INGRESO:LOTE-ÑU1", "RETIRO:LOTE-ÑU1"]);
    expect(await numeros(e.admin, { texto: "sol-ac1", tipo: "RETIRO" })).toEqual(["RETIRO:LOTE-ÑU1"]);
    expect(await numeros(e.admin, { texto: "solucion", centroId: e.centroB })).toEqual(["INGRESO:OTRO-B"]);
    expect(await numeros(e.admin, { texto: "solucion", desde: e.dia(1) })).toEqual([]);
    // Alcance: el bodeguero de A no ve lo de B aunque coincida el texto.
    expect(await numeros(e.bodeguero, { texto: "solucion" })).toEqual(["INGRESO:LOTE-ÑU1", "RETIRO:LOTE-ÑU1"]);
    expect(await numeros(e.bodegueroB, { texto: "solucion" })).toEqual(["INGRESO:OTRO-B"]);
    await esperarError(listarMovimientos(e.bodeguero, { texto: "solucion", centroId: e.centroB }), "SIN_ACCESO_AL_CENTRO");
    expect(await numeros(e.admin, { texto: "%" })).toEqual([]);

    // Paginación con texto.
    const pagina = await listarMovimientos(e.admin, { texto: "solucion", porPagina: 2, pagina: 2 });
    expect(pagina).toMatchObject({ total: 3, totalPaginas: 2, pagina: 2 });
    expect(pagina.items).toHaveLength(1);
  });

  it("la búsqueda de usuarios no distingue tildes", async () => {
    await db.usuario.create({ data: { nombre: "María Núñez", email: "maria@test.cl", passwordHash: "x", rol: "VISITANTE" } });
    for (const texto of ["maria nunez", "NÚÑEZ", "maria@test"]) {
      const r = await listarUsuarios(e.admin, { texto });
      expect(r.items.map((u) => u.email), texto).toEqual(["maria@test.cl"]);
      expect(r.total).toBe(1);
    }
    expect((await listarUsuarios(e.admin, { texto: "no-existe" })).total).toBe(0);
    expect((await listarUsuarios(e.admin, { texto: "_" })).total).toBe(0);
  });
});

describe("exportaciones — tope de filas", () => {
  async function* generar(n: number): AsyncGenerator<CeldaCsv[]> {
    for (let i = 0; i < n; i++) yield [i, `fila ${i}`];
  }
  async function reunir(filas: AsyncIterable<CeldaCsv[]>): Promise<CeldaCsv[][]> {
    const todas: CeldaCsv[][] = [];
    for await (const f of filas) todas.push(f);
    return todas;
  }

  it("bajo el tope o justo en el tope no agrega nada", async () => {
    expect(await reunir(conAvisoDeTope(generar(3), 5))).toHaveLength(3);
    const justo = await reunir(conAvisoDeTope(generar(5), 5));
    expect(justo).toHaveLength(5);
    expect(justo[4]).toEqual([4, "fila 4"]);
  });

  it("si hay más filas que el tope, corta y termina con una fila de aviso", async () => {
    const filas = await reunir(conAvisoDeTope(generar(6), 5));
    expect(filas).toHaveLength(6);
    expect(filas[4]).toEqual([4, "fila 4"]);
    expect(filas[5]).toEqual([avisoDeTope(5)]);
    expect(avisoDeTope(5)).toMatch(/incompleto/);
    expect(avisoDeTope()).toContain("200.000");
    expect((await reunir(conAvisoDeTope(generar(500), 5))).length).toBe(6);
  });
});
