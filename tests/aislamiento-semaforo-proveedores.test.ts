import { beforeAll, describe, expect, it } from "vitest";
import type { CeldaCsv } from "@/lib/csv";
import { COLORES_SEMAFORO } from "@/lib/estados";
import { puede, ROLES } from "@/lib/permisos";
import { db } from "@/server/db";
import {
  actualizarProveedor,
  asociarCodigoBarras,
  buscarInsumoPorCodigo,
  crearInsumo,
  exportarExistencias,
  exportarVencimientos,
  listarDirectorioProveedores,
  listarInventario,
  lotesDeInsumo,
  lotesPorColor,
  obtenerAlertas,
  registrarIngreso,
  reporteExistencias,
  reporteVencimientos,
  resumenPanel,
  resumenPorInstitucion,
  resumenSemaforo,
  type ExportacionCsv,
} from "@/server/servicios";
import {
  crearActor,
  crearEscenarioInstituciones,
  esperarError,
  sembrarLoteVencido,
  type EscenarioInstituciones,
} from "./soporte/escenario";

/**
 * Semáforo, directorio de proveedores y escáner CON el nivel Institución:
 * cada institución ve solo su semáforo, el orden "por uso" de los proveedores
 * sale de sus propios ingresos y la búsqueda por código no revela stock ni
 * lotes de otra institución. El catálogo y los proveedores son compartidos.
 *
 * Institución A (centros A y B): 1 lote rojo y 1 verde en A; 1 amarillo en B.
 * Institución B (centro C): 1 vencido, 2 rojos, 1 amarillo y 1 verde.
 */

const EAN = "7804100000006";

let e: EscenarioInstituciones;
let proveedorDeB: string;
let visitanteC: Awaited<ReturnType<typeof crearActor>>;

const texto = (valor: unknown) => JSON.stringify(valor);

async function leerFilas(exportacion: ExportacionCsv): Promise<CeldaCsv[][]> {
  const filas: CeldaCsv[][] = [];
  for await (const fila of exportacion.filas) filas.push(fila);
  return filas;
}

/** Nada de la institución B (centro C y sus lotes `C-…`) en el resultado. */
function sinRastroDeB(valor: unknown): void {
  const t = texto(valor);
  expect(t).not.toContain("Centro C");
  expect(t).not.toContain(e.centroC);
  expect(t).not.toMatch(/"C-(VENCIDO|ROJO|AMARILLO|VERDE)/);
}

/** Nada de la institución A (centros A y B y sus lotes `A-…`) en el resultado. */
function sinRastroDeA(valor: unknown): void {
  const t = texto(valor);
  expect(t).not.toContain("Centro A");
  expect(t).not.toContain("Centro B");
  expect(t).not.toContain(e.centroA);
  expect(t).not.toContain(e.centroB);
  expect(t).not.toMatch(/"A-(ROJO|AMARILLO|VERDE)/);
}

const conteoLotes = (r: Awaited<ReturnType<typeof resumenSemaforo>>) =>
  Object.fromEntries(COLORES_SEMAFORO.map((c) => [c, r[c].lotes]));

beforeAll(async () => {
  e = await crearEscenarioInstituciones();
  visitanteC = await crearActor("visitac@test.cl", "VISITANTE", e.institucionB, [e.centroC]);
  await db.insumo.update({ where: { id: e.dializador }, data: { codigoBarras: EAN } });
  proveedorDeB = (await db.proveedor.create({ data: { rut: "77058612-7", razonSocial: "Proveedor Dos Ltda.", sitioWeb: "https://dos.ejemplo.cl/" } })).id;
  await db.proveedor.create({ data: { rut: "96754380-2", razonSocial: "Proveedor Sin Uso S.A." } });

  // Institución A: su único proveedor usado es "Proveedor Uno".
  await registrarIngreso(e.adminA, { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "A-ROJO", fechaVencimiento: e.dia(20), cantidad: 10, proveedorId: e.proveedor });
  await registrarIngreso(e.adminA, { ubicacionId: e.bodegaA, insumoId: e.guantes, numeroLote: "A-VERDE", fechaVencimiento: e.dia(400), cantidad: 10, proveedorId: e.proveedor });
  await registrarIngreso(e.bodegueroB, { ubicacionId: e.bodegaB, insumoId: e.guantes, numeroLote: "A-AMARILLO", fechaVencimiento: e.dia(125), cantidad: 10, proveedorId: e.proveedor });
  // Institución B: usa después "Proveedor Dos" (más reciente en TODA la red, pero solo en B).
  await sembrarLoteVencido(e.dializador, e.bodegaC, 4, "C-VENCIDO");
  await registrarIngreso(e.bodegueroC, { ubicacionId: e.bodegaC, insumoId: e.dializador, numeroLote: "C-ROJO-1", fechaVencimiento: e.dia(5), cantidad: 7, proveedorId: proveedorDeB });
  await registrarIngreso(e.bodegueroC, { ubicacionId: e.bodegaC, insumoId: e.guantes, numeroLote: "C-ROJO-2", fechaVencimiento: e.dia(40), cantidad: 7, proveedorId: proveedorDeB });
  await registrarIngreso(e.adminB, { ubicacionId: e.salaC, insumoId: e.guantes, numeroLote: "C-AMARILLO", fechaVencimiento: e.dia(130), cantidad: 7, proveedorId: proveedorDeB });
  await registrarIngreso(e.adminB, { ubicacionId: e.salaC, insumoId: e.guantes, numeroLote: "C-VERDE", fechaVencimiento: e.dia(500), cantidad: 7, proveedorId: proveedorDeB });
});

describe("semáforo por institución", () => {
  it("resumenSemaforo cuenta solo los lotes del alcance; la red es la suma de las instituciones", async () => {
    const [red, a, b] = await Promise.all([resumenSemaforo(e.admin), resumenSemaforo(e.adminA), resumenSemaforo(e.adminB)]);
    expect(conteoLotes(a)).toEqual({ VENCIDO: 0, ROJO: 1, AMARILLO: 1, VERDE: 1 });
    expect(conteoLotes(b)).toEqual({ VENCIDO: 1, ROJO: 2, AMARILLO: 1, VERDE: 1 });
    expect(conteoLotes(red)).toEqual({ VENCIDO: 1, ROJO: 3, AMARILLO: 2, VERDE: 2 });
    expect(a.ROJO.unidades).toBe(10);
    expect(b.ROJO.unidades).toBe(14);
    // Bodeguero y visitante: solo sus centros asignados (A), no toda su institución.
    expect(conteoLotes(await resumenSemaforo(e.bodeguero))).toEqual({ VENCIDO: 0, ROJO: 1, AMARILLO: 0, VERDE: 1 });
    expect(conteoLotes(await resumenSemaforo(e.visitante))).toEqual({ VENCIDO: 0, ROJO: 1, AMARILLO: 0, VERDE: 1 });
    expect(conteoLotes(await resumenSemaforo(visitanteC))).toEqual(conteoLotes(b));
    // Un centro de otra institución se rechaza; uno propio, filtra.
    await esperarError(resumenSemaforo(e.adminA, { centroId: e.centroC }), "SIN_ACCESO_AL_CENTRO");
    await esperarError(resumenSemaforo(e.adminB, { centroId: e.centroA }), "SIN_ACCESO_AL_CENTRO");
    await esperarError(resumenSemaforo(e.bodeguero, { centroId: e.centroB }), "SIN_ACCESO_AL_CENTRO");
    expect(conteoLotes(await resumenSemaforo(e.adminA, { centroId: e.centroB }))).toEqual({ VENCIDO: 0, ROJO: 0, AMARILLO: 1, VERDE: 0 });
  });

  it("lotesPorColor («Productos en rojo») no lista lotes de otra institución", async () => {
    for (const color of COLORES_SEMAFORO) {
      sinRastroDeB(await lotesPorColor(e.adminA, { color, limite: 50 }));
      sinRastroDeA(await lotesPorColor(e.adminB, { color, limite: 50 }));
      await esperarError(lotesPorColor(e.adminA, { color, centroId: e.centroC }), "SIN_ACCESO_AL_CENTRO");
    }
    expect((await lotesPorColor(e.adminA, { color: "ROJO" })).map((l) => l.numeroLote)).toEqual(["A-ROJO"]);
    expect((await lotesPorColor(e.adminB, { color: "ROJO" })).map((l) => l.numeroLote)).toEqual(["C-ROJO-1", "C-ROJO-2"]);
    expect((await lotesPorColor(e.adminB, { color: "VENCIDO" })).map((l) => l.numeroLote)).toEqual(["C-VENCIDO"]);
    expect((await lotesPorColor(e.admin, { color: "ROJO" })).map((l) => l.numeroLote)).toEqual(["C-ROJO-1", "A-ROJO", "C-ROJO-2"]);
    // Buscar por el número de un lote ajeno no lo revela.
    expect(await lotesPorColor(e.adminA, { color: "ROJO", texto: "C-ROJO-1" })).toEqual([]);
  });

  it("panel: semáforo, productos en rojo y desglose por centro, solo de la institución", async () => {
    const [a, b, red] = await Promise.all([resumenPanel(e.adminA), resumenPanel(e.adminB), resumenPanel(e.admin)]);
    sinRastroDeB(a);
    sinRastroDeA(b);
    expect(conteoLotes(a.semaforo)).toEqual({ VENCIDO: 0, ROJO: 1, AMARILLO: 1, VERDE: 1 });
    expect(a.enRojo.map((l) => l.numeroLote)).toEqual(["A-ROJO"]);
    expect(b.enRojo.map((l) => l.numeroLote)).toEqual(["C-ROJO-1", "C-ROJO-2"]);
    expect(a.porCentro.map((c) => [c.centro, c.vencidos, c.rojo, c.amarillo])).toEqual([
      ["Centro A", 0, 1, 0],
      ["Centro B", 0, 0, 1],
    ]);
    expect(b.porCentro.map((c) => [c.centro, c.vencidos, c.rojo, c.amarillo])).toEqual([["Centro C", 1, 2, 1]]);

    // Administrador de la red: el resumen por institución trae el semáforo de cada una y de cada centro.
    const porInstitucion = await resumenPorInstitucion(e.admin, red.porCentro);
    const [dos, uno] = porInstitucion;
    expect(uno).toMatchObject({ institucion: "Institución Uno", vencidos: 0, rojo: 1, amarillo: 1 });
    expect(uno!.detalle.map((c) => [c.centro, c.vencidos, c.rojo, c.amarillo])).toEqual([
      ["Centro A", 0, 1, 0],
      ["Centro B", 0, 0, 1],
    ]);
    expect(dos).toMatchObject({ institucion: "Institución Dos", vencidos: 1, rojo: 2, amarillo: 1 });
    // Coincide con el semáforo de cada institución y, sumado, con el de la red.
    for (const [resumen, actor] of [[uno!, e.adminA], [dos!, e.adminB]] as const) {
      const s = await resumenSemaforo(actor);
      expect([resumen.vencidos, resumen.rojo, resumen.amarillo]).toEqual([s.VENCIDO.lotes, s.ROJO.lotes, s.AMARILLO.lotes]);
    }
    const suma = (clave: "vencidos" | "rojo" | "amarillo") => porInstitucion.reduce((t, i) => t + i[clave], 0);
    expect([suma("vencidos"), suma("rojo"), suma("amarillo")]).toEqual([red.semaforo.VENCIDO.lotes, red.semaforo.ROJO.lotes, red.semaforo.AMARILLO.lotes]);
    await esperarError(resumenPorInstitucion(e.adminB, red.porCentro), "SIN_PERMISO");
  });

  it("alertas de vencimiento e inventario filtrado por color: solo del alcance", async () => {
    const a = await obtenerAlertas(e.adminA);
    const b = await obtenerAlertas(e.adminB);
    sinRastroDeB(a);
    sinRastroDeA(b);
    expect(a.vencimientos.map((v) => v.numeroLote).sort()).toEqual(["A-AMARILLO", "A-ROJO"]);
    expect(b.vencimientos.map((v) => v.numeroLote).sort()).toEqual(["C-AMARILLO", "C-ROJO-1", "C-ROJO-2", "C-VENCIDO"]);

    // El mismo insumo (guantes) es verde/amarillo en A y rojo en B: cada una ve su propio color.
    const rojosA = await listarInventario(e.adminA, { semaforo: ["ROJO"] });
    const rojosB = await listarInventario(e.adminB, { semaforo: ["ROJO"] });
    expect(rojosA.items.map((i) => i.codigo)).toEqual(["DIA-001"]);
    expect(rojosB.items.map((i) => i.codigo).sort()).toEqual(["DIA-001", "GUA-001"]);
    expect((await listarInventario(e.adminA, { semaforo: ["VENCIDO"] })).total).toBe(0);
    expect((await listarInventario(e.adminB, { semaforo: ["VENCIDO"] })).total).toBe(1);
    sinRastroDeB(rojosA);
    sinRastroDeA(rojosB);
  });

  it("reportes y exportaciones con filtro de semáforo: ninguna fila de otra institución", async () => {
    for (const semaforo of [undefined, ["ROJO"], ["VENCIDO", "ROJO", "AMARILLO", "VERDE"]] as const) {
      for (const reporte of [reporteExistencias, reporteVencimientos]) {
        sinRastroDeB(await reporte(e.adminA, { semaforo }));
        sinRastroDeA(await reporte(e.adminB, { semaforo }));
      }
      for (const exportar of [exportarExistencias, exportarVencimientos]) {
        sinRastroDeB(await leerFilas(await exportar(e.adminA, { semaforo })));
        sinRastroDeA(await leerFilas(await exportar(e.adminB, { semaforo })));
      }
    }
    expect((await reporteVencimientos(e.adminA, { semaforo: ["ROJO"] })).items.map((f) => f.numeroLote)).toEqual(["A-ROJO"]);
    expect((await reporteVencimientos(e.adminB, { semaforo: ["VENCIDO"] })).items.map((f) => f.numeroLote)).toEqual(["C-VENCIDO"]);
    expect((await reporteVencimientos(e.adminA, { semaforo: ["VENCIDO"] })).total).toBe(0);
    // Control: la red sí los ve todos.
    expect(texto(await reporteVencimientos(e.admin, { semaforo: ["ROJO"] }))).toContain("C-ROJO-1");
    await esperarError(reporteVencimientos(e.adminA, { semaforo: ["ROJO"], centroId: e.centroC }), "SIN_ACCESO_AL_CENTRO");
  });
});

describe("directorio de proveedores por institución", () => {
  it("los cuatro roles lo leen; el orden «por uso» sale de los ingresos del alcance del actor", async () => {
    for (const rol of ROLES) expect(puede(rol, "proveedores:ver"), rol).toBe(true);
    const nombres = async (actor: Parameters<typeof listarDirectorioProveedores>[0], filtros = {}) =>
      (await listarDirectorioProveedores(actor, filtros)).items.map((p) => p.razonSocial);

    // Los proveedores son compartidos: todos ven los tres, pero cada institución ordena por SU uso.
    expect(await nombres(e.adminA)).toEqual(["Proveedor Uno SpA", "Proveedor Dos Ltda.", "Proveedor Sin Uso S.A."]);
    expect(await nombres(e.bodeguero)).toEqual(["Proveedor Uno SpA", "Proveedor Dos Ltda.", "Proveedor Sin Uso S.A."]);
    expect(await nombres(e.visitante)).toEqual(["Proveedor Uno SpA", "Proveedor Dos Ltda.", "Proveedor Sin Uso S.A."]);
    expect(await nombres(e.adminB)).toEqual(["Proveedor Dos Ltda.", "Proveedor Sin Uso S.A.", "Proveedor Uno SpA"]);
    expect(await nombres(visitanteC)).toEqual(["Proveedor Dos Ltda.", "Proveedor Sin Uso S.A.", "Proveedor Uno SpA"]);
    // La red: el más reciente de toda la red primero.
    expect(await nombres(e.admin)).toEqual(["Proveedor Dos Ltda.", "Proveedor Uno SpA", "Proveedor Sin Uso S.A."]);
    expect(await nombres(e.admin, { centroId: e.centroA })).toEqual(["Proveedor Uno SpA", "Proveedor Dos Ltda.", "Proveedor Sin Uso S.A."]);
  });

  it("no revela cuándo compró otra institución, y un centro ajeno se rechaza", async () => {
    const deA = await listarDirectorioProveedores(e.adminA);
    expect(deA.items.find((p) => p.id === proveedorDeB)?.ultimoIngreso).toBeNull();
    expect(deA.items.find((p) => p.id === e.proveedor)?.ultimoIngreso).toBeInstanceOf(Date);
    const deB = await listarDirectorioProveedores(e.adminB);
    expect(deB.items.find((p) => p.id === e.proveedor)?.ultimoIngreso).toBeNull();
    for (const actor of [e.adminA, e.bodeguero, e.visitante]) {
      await esperarError(listarDirectorioProveedores(actor, { centroId: e.centroC }), "SIN_ACCESO_AL_CENTRO");
    }
    await esperarError(listarDirectorioProveedores(e.adminB, { centroId: e.centroA }), "SIN_ACCESO_AL_CENTRO");
  });

  it("«Editar»: administrador de la red y de institución; bodeguero y visitante no", async () => {
    expect(ROLES.filter((r) => puede(r, "proveedores:gestionar"))).toEqual(["ADMIN_RED", "ADMIN"]);
    const datos = { id: proveedorDeB, rut: "77058612-7", razonSocial: "Proveedor Dos Ltda." };
    await actualizarProveedor(e.adminA, { ...datos, sitioWeb: "dos.ejemplo.cl/tienda" });
    expect((await listarDirectorioProveedores(e.visitante)).items.find((p) => p.id === proveedorDeB)?.sitioWeb).toBe("https://dos.ejemplo.cl/tienda");
    await esperarError(actualizarProveedor(e.bodeguero, datos), "SIN_PERMISO");
    await esperarError(actualizarProveedor(visitanteC, datos), "SIN_PERMISO");
  });
});

describe("escáner con instituciones", () => {
  it("la búsqueda por código devuelve el insumo del catálogo compartido, sin stock ni datos de otra institución", async () => {
    for (const actor of [e.admin, e.adminA, e.adminB, e.bodeguero, e.bodegueroC, e.visitante]) {
      const r = await buscarInsumoPorCodigo(actor, EAN);
      expect(r.coincidencias.map((c) => c.codigo)).toEqual(["DIA-001"]);
      // Solo datos de catálogo: ni existencias, ni lotes, ni centros.
      expect(Object.keys(r.coincidencias[0]!).sort()).toEqual(
        ["activo", "categoria", "codigo", "codigoBarras", "controlaVencimiento", "id", "nombre", "presentacion", "requiereCadenaFrio", "unidadMedida"],
      );
      sinRastroDeA(r);
      sinRastroDeB(r);
    }
    // Tras escanear, los lotes sugeridos en el ingreso son solo los de los centros del actor.
    expect((await lotesDeInsumo(e.adminA, e.dializador)).map((l) => l.numeroLote)).toEqual(["A-ROJO"]);
    expect((await lotesDeInsumo(e.bodegueroC, e.dializador)).map((l) => l.numeroLote).sort()).toEqual(["C-ROJO-1", "C-VENCIDO"]);
    expect(await lotesDeInsumo(e.bodegueroB, e.dializador)).toEqual([]);
  });

  it("asociar el código a un insumo existente: solo el administrador de la red; el de institución crea uno nuevo", async () => {
    const nuevo = "4006381333931";
    for (const actor of [e.adminA, e.adminB, e.bodeguero, e.visitante]) {
      await esperarError(asociarCodigoBarras(actor, { insumoId: e.guantes, codigoBarras: nuevo }), "SIN_PERMISO");
    }
    expect((await db.insumo.findUniqueOrThrow({ where: { id: e.guantes } })).codigoBarras).toBeNull();
    expect((await buscarInsumoPorCodigo(e.adminA, nuevo)).coincidencias).toEqual([]);

    // El administrador de institución SÍ puede crear un insumo con ese código…
    const categoria = await db.categoria.findFirstOrThrow();
    const creado = await crearInsumo(e.adminA, { codigo: "NUE-001", nombre: "Insumo escaneado", categoriaId: categoria.id, unidadMedida: "unidad", codigoBarras: nuevo });
    // …y desde entonces lo reconoce cualquier institución (catálogo compartido).
    expect((await buscarInsumoPorCodigo(e.bodegueroC, `0${nuevo}`)).coincidencias.map((c) => c.id)).toEqual([creado.id]);
    // No puede usar el mismo producto (aunque venga como GTIN-14) para un segundo insumo.
    await esperarError(
      crearInsumo(e.adminB, { codigo: "NUE-002", nombre: "Duplicado", categoriaId: categoria.id, unidadMedida: "unidad", codigoBarras: `0${nuevo}` }),
      "DUPLICADO",
    );
    // El administrador de la red sí asocia (queda en la auditoría de red).
    const otro = "7613034626844";
    await asociarCodigoBarras(e.admin, { insumoId: e.guantes, codigoBarras: otro });
    expect((await buscarInsumoPorCodigo(e.adminB, otro)).coincidencias.map((c) => c.codigo)).toEqual(["GUA-001"]);
  });
});
