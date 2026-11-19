import { beforeAll, describe, expect, it } from "vitest";
import {
  alcanzaInstitucion,
  etiquetaAlcanceTotal,
  NOMBRE_ROL,
  PERMISOS,
  PERMISOS_POR_ROL,
  puede,
  puedeEnCentro,
  puedeVerTodosSusCentros,
  ROLES,
  rolesAsignables,
  tieneAccesoACentro,
  veTodaLaRed,
  type Permiso,
} from "@/lib/permisos";
import { alcanceDeCentros } from "@/server/autorizacion";
import {
  buscarInsumos,
  detalleInsumo,
  establecerUsuarioActivo,
  listarInventario,
  listarMovimientos,
  listarProveedoresActivos,
  listarUbicaciones,
  lotesDisponibles,
  obtenerAlertas,
  registrarAjuste,
  registrarIngreso,
  registrarMerma,
  registrarRetiro,
  registrarTraslado,
  resumenPanel,
} from "@/server/servicios";
import { crearEscenario, esperarError, stockInsumo, type Escenario } from "./soporte/escenario";

describe("matriz de permisos", () => {
  it("hay exactamente cuatro roles, con sus nombres visibles", () => {
    expect([...ROLES]).toEqual(["ADMIN_RED", "ADMIN", "BODEGUERO", "VISITANTE"]);
    expect(NOMBRE_ROL).toEqual({
      ADMIN_RED: "Administrador de la red",
      ADMIN: "Administrador de institución",
      BODEGUERO: "Bodeguero",
      VISITANTE: "Visitante",
    });
  });

  it("ADMIN_RED tiene todos los permisos", () => {
    for (const p of PERMISOS) expect(puede("ADMIN_RED", p)).toBe(true);
  });

  it("ADMIN (de institución): todo salvo modificar el catálogo compartido y gestionar instituciones", () => {
    const negados: Permiso[] = ["catalogo:gestionar", "instituciones:gestionar"];
    const esperados = PERMISOS.filter((p) => !negados.includes(p));
    expect([...PERMISOS_POR_ROL.ADMIN].sort()).toEqual([...esperados].sort());
    for (const p of negados) expect(puede("ADMIN", p)).toBe(false);
    // Lo que sí conserva, explícito (si alguien lo quita de la matriz, falla aquí).
    for (const p of [
      "catalogo:crear", "centros:gestionar", "usuarios:gestionar", "proveedores:gestionar", "parametros:gestionar",
      "movimientos:ajuste", "movimientos:merma", "movimientos:traslado", "reportes:ver", "auditoria:ver",
    ] as const) {
      expect(puede("ADMIN", p)).toBe(true);
    }
  });

  it("solo ADMIN_RED gestiona instituciones y modifica el catálogo; BODEGUERO y VISITANTE no administran nada", () => {
    for (const rol of ROLES) {
      expect(puede(rol, "instituciones:gestionar")).toBe(rol === "ADMIN_RED");
      expect(puede(rol, "catalogo:gestionar")).toBe(rol === "ADMIN_RED");
    }
    for (const rol of ["BODEGUERO", "VISITANTE"] as const) {
      for (const p of PERMISOS.filter((x) => x.endsWith(":gestionar") || x === "catalogo:crear")) expect(puede(rol, p)).toBe(false);
    }
  });

  it("alcance: solo ADMIN_RED ve toda la red; un ADMIN alcanza su institución y los centros de su alcance", () => {
    expect(veTodaLaRed({ rol: "ADMIN_RED" })).toBe(true);
    for (const rol of ["ADMIN", "BODEGUERO", "VISITANTE"] as const) expect(veTodaLaRed({ rol })).toBe(false);
    expect(puedeVerTodosSusCentros({ rol: "ADMIN_RED" })).toBe(true);
    expect(puedeVerTodosSusCentros({ rol: "ADMIN" })).toBe(true);
    expect(puedeVerTodosSusCentros({ rol: "BODEGUERO" })).toBe(false);
    expect(etiquetaAlcanceTotal("ADMIN_RED")).toBe("Toda la red");
    expect(etiquetaAlcanceTotal("ADMIN")).toBe("Toda mi institución");

    const adminA = { rol: "ADMIN" as const, institucionId: "inst-a", centroIds: ["a1", "a2"] };
    expect(tieneAccesoACentro(adminA, "a1")).toBe(true);
    expect(tieneAccesoACentro(adminA, "b1")).toBe(false);
    expect(alcanzaInstitucion(adminA, "inst-a")).toBe(true);
    expect(alcanzaInstitucion(adminA, "inst-b")).toBe(false);
    // Los usuarios sin institución (administradores de la red) quedan fuera de su alcance.
    expect(alcanzaInstitucion(adminA, null)).toBe(false);
    const red = { rol: "ADMIN_RED" as const, institucionId: null, centroIds: [] };
    expect(tieneAccesoACentro(red, "cualquiera")).toBe(true);
    expect(alcanzaInstitucion(red, "inst-b")).toBe(true);
    expect(alcanzaInstitucion(red, null)).toBe(true);
  });

  it("roles asignables: un ADMIN nunca puede asignar ADMIN_RED; BODEGUERO y VISITANTE no asignan nada", () => {
    expect([...rolesAsignables("ADMIN_RED")]).toEqual(["ADMIN_RED", "ADMIN", "BODEGUERO", "VISITANTE"]);
    expect([...rolesAsignables("ADMIN")]).toEqual(["ADMIN", "BODEGUERO", "VISITANTE"]);
    expect([...rolesAsignables("BODEGUERO")]).toEqual([]);
    expect([...rolesAsignables("VISITANTE")]).toEqual([]);
  });

  it("BODEGUERO: lectura de sus centros + ingreso y retiro, nada más", () => {
    const esperados: Permiso[] = [
      "panel:ver",
      "inventario:ver",
      "alertas:ver",
      "catalogo:ver",
      "movimientos:ver",
      "proveedores:ver",
      "movimientos:ingreso",
      "movimientos:retiro",
    ];
    expect([...PERMISOS_POR_ROL.BODEGUERO].sort()).toEqual([...esperados].sort());
  });

  it("VISITANTE: solo lectura de inventario y alertas", () => {
    const esperados: Permiso[] = ["panel:ver", "inventario:ver", "alertas:ver", "catalogo:ver"];
    expect([...PERMISOS_POR_ROL.VISITANTE].sort()).toEqual([...esperados].sort());
    for (const p of PERMISOS.filter((x) => x.startsWith("movimientos:") || x.endsWith(":gestionar"))) {
      expect(puede("VISITANTE", p)).toBe(false);
    }
  });

  it("puedeEnCentro combina rol y pertenencia", () => {
    const bodeguero = { rol: "BODEGUERO" as const, centroIds: ["a"] };
    expect(puedeEnCentro(bodeguero, "movimientos:ingreso", "a")).toBe(true);
    expect(puedeEnCentro(bodeguero, "movimientos:ingreso", "b")).toBe(false);
    expect(puedeEnCentro(bodeguero, "movimientos:ajuste", "a")).toBe(false);
    expect(puedeEnCentro({ rol: "ADMIN_RED", centroIds: [] }, "movimientos:ajuste", "cualquiera")).toBe(true);
    // El administrador de institución depende de su alcance, igual que los demás.
    expect(puedeEnCentro({ rol: "ADMIN", centroIds: ["a"] }, "movimientos:ajuste", "a")).toBe(true);
    expect(puedeEnCentro({ rol: "ADMIN", centroIds: ["a"] }, "movimientos:ajuste", "b")).toBe(false);
  });
});

describe("autorización en los servicios (rol + centro)", () => {
  let e: Escenario;
  let loteA: string;
  let loteB: string;

  beforeAll(async () => {
    e = await crearEscenario();
    const a = await registrarIngreso(e.admin, {
      ubicacionId: e.bodegaA,
      insumoId: e.dializador,
      numeroLote: "A-1",
      fechaVencimiento: e.dia(120),
      cantidad: 50,
    });
    const b = await registrarIngreso(e.admin, {
      ubicacionId: e.bodegaB,
      insumoId: e.guantes,
      numeroLote: "B-1",
      fechaVencimiento: e.dia(120),
      cantidad: 30,
    });
    loteA = a.movimiento.loteId;
    loteB = b.movimiento.loteId;
  });

  it("alcanceDeCentros: admin sin filtro, otros sus centros, y rechaza centros ajenos", () => {
    expect(alcanceDeCentros(e.admin)).toBeNull();
    expect(alcanceDeCentros(e.admin, e.centroB)).toEqual([e.centroB]);
    expect(alcanceDeCentros(e.bodeguero)).toEqual([e.centroA]);
    expect(() => alcanceDeCentros(e.bodeguero, e.centroB)).toThrow(/No tienes acceso/);
  });

  it("VISITANTE no puede registrar ningún movimiento", async () => {
    const ingreso = { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "V", fechaVencimiento: e.dia(30), cantidad: 1 };
    await esperarError(registrarIngreso(e.visitante, ingreso), "SIN_PERMISO");
    await esperarError(
      registrarRetiro(e.visitante, { ubicacionId: e.bodegaA, insumoId: e.dializador, cantidad: 1 }),
      "SIN_PERMISO",
    );
    await esperarError(
      registrarMerma(e.visitante, { ubicacionId: e.bodegaA, loteId: loteA, cantidad: 1, motivo: "x" }),
      "SIN_PERMISO",
    );
    expect(await stockInsumo(e.dializador, e.bodegaA)).toBe(50);
  });

  it("BODEGUERO opera en su centro pero no en otro", async () => {
    await registrarRetiro(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, cantidad: 1 });
    expect(await stockInsumo(e.dializador, e.bodegaA)).toBe(49);

    await esperarError(
      registrarRetiro(e.bodeguero, { ubicacionId: e.bodegaB, insumoId: e.guantes, cantidad: 1 }),
      "SIN_ACCESO_AL_CENTRO",
    );
    await esperarError(
      registrarIngreso(e.bodeguero, {
        ubicacionId: e.bodegaB,
        insumoId: e.guantes,
        numeroLote: "B-2",
        fechaVencimiento: e.dia(30),
        cantidad: 1,
      }),
      "SIN_ACCESO_AL_CENTRO",
    );
    expect(await stockInsumo(e.guantes, e.bodegaB)).toBe(30);
  });

  it("BODEGUERO no puede ajustar, mermar ni trasladar (ni siquiera en su centro)", async () => {
    await esperarError(
      registrarAjuste(e.bodeguero, { ubicacionId: e.bodegaA, loteId: loteA, sentido: "POSITIVO", cantidad: 1, motivo: "x" }),
      "SIN_PERMISO",
    );
    await esperarError(
      registrarMerma(e.bodeguero, { ubicacionId: e.bodegaA, loteId: loteA, cantidad: 1, motivo: "x" }),
      "SIN_PERMISO",
    );
    await esperarError(
      registrarTraslado(e.bodeguero, { loteId: loteA, ubicacionOrigenId: e.bodegaA, ubicacionDestinoId: e.salaA, cantidad: 1 }),
      "SIN_PERMISO",
    );
    await esperarError(establecerUsuarioActivo(e.bodeguero, e.visitante.usuarioId, false), "SIN_PERMISO");
  });

  it("las consultas solo devuelven datos de los centros del actor", async () => {
    const admin = await listarInventario(e.admin);
    expect(admin.items.map((i) => i.codigo).sort()).toEqual(["DIA-001", "GUA-001"]);

    const bodeguero = await listarInventario(e.bodeguero);
    expect(bodeguero.items.map((i) => i.codigo)).toEqual(["DIA-001"]);

    const visitante = await listarInventario(e.visitante, { centroId: e.centroA });
    expect(visitante.items.map((i) => i.codigo)).toEqual(["DIA-001"]);

    const bodegueroB = await listarInventario(e.bodegueroB);
    expect(bodegueroB.items.map((i) => i.codigo)).toEqual(["GUA-001"]);

    const ubicaciones = await listarUbicaciones(e.bodeguero);
    expect(new Set(ubicaciones.map((u) => u.centroId))).toEqual(new Set([e.centroA]));

    // El detalle de un insumo sin stock en mis centros no revela el stock ajeno.
    const detalle = await detalleInsumo(e.bodeguero, e.guantes);
    expect(detalle.total).toBe(0);
    expect(detalle.existencias).toEqual([]);
  });

  it("pedir explícitamente un centro ajeno se rechaza en todas las consultas", async () => {
    await esperarError(listarInventario(e.bodeguero, { centroId: e.centroB }), "SIN_ACCESO_AL_CENTRO");
    await esperarError(detalleInsumo(e.visitante, e.guantes, { centroId: e.centroB }), "SIN_ACCESO_AL_CENTRO");
    await esperarError(listarMovimientos(e.bodeguero, { centroId: e.centroB }), "SIN_ACCESO_AL_CENTRO");
    await esperarError(obtenerAlertas(e.visitante, { centroId: e.centroB }), "SIN_ACCESO_AL_CENTRO");
    await esperarError(resumenPanel(e.visitante, { centroId: e.centroB }), "SIN_ACCESO_AL_CENTRO");
    await esperarError(listarUbicaciones(e.bodeguero, { centroId: e.centroB }), "SIN_ACCESO_AL_CENTRO");
    await esperarError(
      lotesDisponibles(e.bodeguero, { insumoId: e.guantes, ubicacionId: e.bodegaB }),
      "SIN_ACCESO_AL_CENTRO",
    );
    void loteB;
  });

  it("VISITANTE no ve movimientos ni proveedores; BODEGUERO solo los de su centro", async () => {
    await esperarError(listarMovimientos(e.visitante), "SIN_PERMISO");
    await esperarError(listarProveedoresActivos(e.visitante), "SIN_PERMISO");
    expect((await buscarInsumos(e.visitante)).length).toBeGreaterThan(0);

    const movs = await listarMovimientos(e.bodeguero);
    expect(movs.total).toBeGreaterThan(0);
    expect(new Set(movs.items.map((m) => m.centroId))).toEqual(new Set([e.centroA]));

    const panelVisitante = await resumenPanel(e.visitante);
    expect(panelVisitante.puedeVerMovimientos).toBe(false);
    expect(panelVisitante.ultimosMovimientos).toEqual([]);
    expect(panelVisitante.actividad.every((d) => d.movimientos === 0)).toBe(true);
  });

  it("un usuario sin centros asignados no ve nada", async () => {
    const huerfano = { ...e.bodeguero, centroIds: [] };
    expect((await listarInventario(huerfano)).total).toBe(0);
    expect((await listarMovimientos(huerfano)).total).toBe(0);
    expect((await obtenerAlertas(huerfano)).resumen.total).toBe(0);
    expect((await resumenPanel(huerfano)).unidadesTotales).toBe(0);
  });
});
