/**
 * Proveedor por insumo en dos niveles: predeterminado de la RED
 * (`Insumo.proveedorId`) y preferencia por INSTITUCIÓN
 * (`ProveedorInsumoInstitucion`). Resolución del proveedor efectivo, permisos de
 * los cuatro roles, aislamiento entre instituciones, proveedor inactivo, filtro
 * del inventario, reposición agrupada, CSV, preselección en el ingreso y auditoría.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { etiquetaAccion, resumenAuditoria, tieneEtiquetaPropia } from "@/components/admin/auditoria-legible";
import { FILTRO_SIN_PROVEEDOR } from "@/lib/esquemas/proveedor-insumo";
import type { CeldaCsv } from "@/lib/csv";
import { PERMISOS_POR_ROL, puede, ROLES } from "@/lib/permisos";
import { db } from "@/server/db";
import {
  actualizarInsumo,
  contarInsumosPorProveedor,
  crearInsumo,
  definirProveedorInstitucion,
  definirProveedorRed,
  detalleProveedorInsumo,
  eliminarInsumo,
  establecerProveedorActivo,
  exportarExistencias,
  exportarReposicion,
  guardarParametrosStock,
  listaReposicion,
  listarAuditoria,
  listarDirectorioProveedores,
  listarInsumosAdmin,
  listarInventario,
  obtenerAlertas,
  proveedorEfectivoDeInsumo,
  registrarIngreso,
  reporteExistencias,
  resumenPanel,
  type ExportacionCsv,
} from "@/server/servicios";
import { crearEscenarioInstituciones, esperarError, type EscenarioInstituciones } from "./soporte/escenario";

let e: EscenarioInstituciones;
/** Proveedores: `uno` (el del escenario), `dos` y `tres` (con sitio web y contacto). */
let dos: string;
let tres: string;

async function filas(exportacion: ExportacionCsv): Promise<CeldaCsv[][]> {
  const salida: CeldaCsv[][] = [];
  for await (const fila of exportacion.filas) salida.push(fila);
  return salida;
}

const auditoriaDe = (accion: string) => db.registroAuditoria.findMany({ where: { accion }, orderBy: { creadoEn: "asc" } });

beforeEach(async () => {
  e = await crearEscenarioInstituciones();
  dos = (
    await db.proveedor.create({
      data: {
        rut: "77222333-4",
        razonSocial: "Proveedor Dos Ltda.",
        telefono: "+56 2 2222 2222",
        email: "ventas@dos.example",
        contacto: "Dora Dos",
        sitioWeb: "https://www.ejemplo-dos.cl/",
      },
    })
  ).id;
  tres = (await db.proveedor.create({ data: { rut: "78333444-5", razonSocial: "Proveedor Tres SpA", telefono: "+56 41 233 3333" } })).id;
});

describe("permiso `proveedores-insumo:gestionar`", () => {
  it("lo tienen los dos administradores; bodeguero y visitante no", () => {
    expect(puede("ADMIN_RED", "proveedores-insumo:gestionar")).toBe(true);
    expect(puede("ADMIN", "proveedores-insumo:gestionar")).toBe(true);
    expect(puede("BODEGUERO", "proveedores-insumo:gestionar")).toBe(false);
    expect(puede("VISITANTE", "proveedores-insumo:gestionar")).toBe(false);
    // El predeterminado de la red es catálogo compartido: solo ADMIN_RED lo modifica.
    expect(ROLES.filter((r) => PERMISOS_POR_ROL[r].has("catalogo:gestionar"))).toEqual(["ADMIN_RED"]);
  });
});

describe("proveedor efectivo: institución → red → ninguno", () => {
  it("sin nada definido no hay proveedor efectivo", async () => {
    for (const actor of [e.admin, e.adminA, e.bodeguero, e.visitante, e.adminB]) {
      expect(await proveedorEfectivoDeInsumo(actor, e.guantes)).toBeNull();
    }
    const d = await detalleProveedorInsumo(e.adminA, e.guantes);
    expect(d.efectivo).toBeNull();
    expect(d.red).toBeNull();
    expect(d.institucion).toMatchObject({ id: e.institucionA, proveedor: null });
    expect(d.ultimoIngreso).toBeNull();
  });

  it("con el predeterminado de la red, todos lo reciben con origen RED", async () => {
    await definirProveedorRed(e.admin, { insumoId: e.guantes, proveedorId: e.proveedor });
    for (const actor of [e.admin, e.adminA, e.bodeguero, e.visitante, e.adminB, e.bodegueroC]) {
      expect(await proveedorEfectivoDeInsumo(actor, e.guantes)).toMatchObject({ id: e.proveedor, origen: "RED", activo: true });
    }
  });

  it("la preferencia de una institución gana SOLO para ella; la otra sigue con el de la red", async () => {
    await definirProveedorRed(e.admin, { insumoId: e.guantes, proveedorId: e.proveedor });
    await definirProveedorInstitucion(e.adminA, { insumoId: e.guantes, proveedorId: dos });

    for (const actor of [e.adminA, e.bodeguero, e.visitante, e.bodegueroB]) {
      expect(await proveedorEfectivoDeInsumo(actor, e.guantes)).toMatchObject({
        id: dos,
        origen: "INSTITUCION",
        sitioWeb: "https://www.ejemplo-dos.cl/",
        telefono: "+56 2 2222 2222",
        email: "ventas@dos.example",
      });
    }
    for (const actor of [e.adminB, e.bodegueroC]) {
      expect(await proveedorEfectivoDeInsumo(actor, e.guantes)).toMatchObject({ id: e.proveedor, origen: "RED" });
    }
    // Administrador de la red: en "Toda la red" ve el predeterminado; con un centro, el de su institución.
    expect(await proveedorEfectivoDeInsumo(e.admin, e.guantes)).toMatchObject({ id: e.proveedor, origen: "RED" });
    expect(await proveedorEfectivoDeInsumo(e.admin, e.guantes, { centroId: e.centroA })).toMatchObject({ id: dos, origen: "INSTITUCION" });
    expect(await proveedorEfectivoDeInsumo(e.admin, e.guantes, { centroId: e.centroC })).toMatchObject({ id: e.proveedor, origen: "RED" });
  });

  it("una institución puede tener proveedor propio aunque la red no tenga predeterminado", async () => {
    await definirProveedorInstitucion(e.adminB, { insumoId: e.tela, proveedorId: tres });
    expect(await proveedorEfectivoDeInsumo(e.bodegueroC, e.tela)).toMatchObject({ id: tres, origen: "INSTITUCION" });
    expect(await proveedorEfectivoDeInsumo(e.bodeguero, e.tela)).toBeNull();
    expect(await proveedorEfectivoDeInsumo(e.admin, e.tela)).toBeNull();
  });

  it("quitar la preferencia vuelve al predeterminado de la red", async () => {
    await definirProveedorRed(e.admin, { insumoId: e.guantes, proveedorId: e.proveedor });
    await definirProveedorInstitucion(e.adminA, { insumoId: e.guantes, proveedorId: dos });
    const r = await definirProveedorInstitucion(e.adminA, { insumoId: e.guantes, proveedorId: "" });
    expect(r).toMatchObject({ cambiado: true, proveedorId: null, institucionId: e.institucionA });
    expect(await proveedorEfectivoDeInsumo(e.bodeguero, e.guantes)).toMatchObject({ id: e.proveedor, origen: "RED" });
    expect(await db.proveedorInsumoInstitucion.count()).toBe(0);
  });

  it("un centro ajeno no se puede usar como contexto", async () => {
    await esperarError(proveedorEfectivoDeInsumo(e.bodeguero, e.guantes, { centroId: e.centroC }), "SIN_ACCESO_AL_CENTRO");
    await esperarError(detalleProveedorInsumo(e.adminA, e.guantes, { centroId: e.centroC }), "SIN_ACCESO_AL_CENTRO");
    await esperarError(detalleProveedorInsumo(e.admin, "no-existe"), "NO_ENCONTRADO");
  });
});

describe("permisos de los cuatro roles", () => {
  it("ADMIN_RED define, cambia y quita el predeterminado de la red; repetir no escribe nada", async () => {
    expect(await definirProveedorRed(e.admin, { insumoId: e.guantes, proveedorId: e.proveedor })).toMatchObject({
      cambiado: true,
      proveedor: "Proveedor Uno SpA",
    });
    expect(await definirProveedorRed(e.admin, { insumoId: e.guantes, proveedorId: e.proveedor })).toMatchObject({ cambiado: false });
    expect(await definirProveedorRed(e.admin, { insumoId: e.guantes, proveedorId: dos })).toMatchObject({ cambiado: true });
    expect(await definirProveedorRed(e.admin, { insumoId: e.guantes, proveedorId: null })).toMatchObject({ cambiado: true, proveedorId: null });
    expect((await db.insumo.findUniqueOrThrow({ where: { id: e.guantes } })).proveedorId).toBeNull();
    expect(await auditoriaDe("INSUMO_PROVEEDOR_RED_ACTUALIZADO")).toHaveLength(3);
  });

  it("un ADMIN de institución NO puede cambiar el predeterminado de la red (ni al editar el insumo)", async () => {
    await definirProveedorRed(e.admin, { insumoId: e.guantes, proveedorId: e.proveedor });
    await esperarError(definirProveedorRed(e.adminA, { insumoId: e.guantes, proveedorId: dos }), "SIN_PERMISO");
    await esperarError(definirProveedorRed(e.adminA, { insumoId: e.guantes, proveedorId: null }), "SIN_PERMISO");
    const insumo = await db.insumo.findUniqueOrThrow({ where: { id: e.guantes } });
    await esperarError(
      actualizarInsumo(e.adminA, {
        id: insumo.id, codigo: insumo.codigo, nombre: insumo.nombre, categoriaId: insumo.categoriaId, unidadMedida: insumo.unidadMedida, proveedorId: dos,
      }),
      "SIN_PERMISO",
    );
    expect((await db.insumo.findUniqueOrThrow({ where: { id: e.guantes } })).proveedorId).toBe(e.proveedor);
  });

  it("bodeguero y visitante lo ven pero no pueden cambiar nada", async () => {
    await definirProveedorRed(e.admin, { insumoId: e.guantes, proveedorId: e.proveedor });
    for (const actor of [e.bodeguero, e.visitante]) {
      const d = await detalleProveedorInsumo(actor, e.guantes);
      expect(d.efectivo).toMatchObject({ id: e.proveedor });
      expect(d.permisos).toEqual({ cambiarRed: false, cambiarInstitucion: false });
      await esperarError(definirProveedorRed(actor, { insumoId: e.guantes, proveedorId: dos }), "SIN_PERMISO");
      await esperarError(definirProveedorInstitucion(actor, { insumoId: e.guantes, proveedorId: dos }), "SIN_PERMISO");
      await esperarError(definirProveedorInstitucion(actor, { insumoId: e.guantes, proveedorId: null }), "SIN_PERMISO");
    }
    expect(await db.proveedorInsumoInstitucion.count()).toBe(0);
    expect((await detalleProveedorInsumo(e.adminA, e.guantes)).permisos).toEqual({ cambiarRed: false, cambiarInstitucion: true });
    expect((await detalleProveedorInsumo(e.admin, e.guantes)).permisos).toEqual({ cambiarRed: true, cambiarInstitucion: true });
  });

  it("al CREAR un insumo, también un ADMIN de institución puede dejarle su proveedor predeterminado", async () => {
    const categoriaId = (await db.categoria.findFirstOrThrow()).id;
    const creado = await crearInsumo(e.adminA, { codigo: "NUE-001", nombre: "Insumo nuevo", categoriaId, unidadMedida: "unidad", proveedorId: dos });
    expect((await db.insumo.findUniqueOrThrow({ where: { id: creado.id } })).proveedorId).toBe(dos);
    expect(await proveedorEfectivoDeInsumo(e.bodegueroC, creado.id)).toMatchObject({ id: dos, origen: "RED" });
    const [registro] = await auditoriaDe("INSUMO_CREADO");
    expect(registro?.detalle).toMatchObject({ codigo: "NUE-001", proveedor: "Proveedor Dos Ltda." });
    // Sin proveedor sigue siendo válido.
    const sin = await crearInsumo(e.adminA, { codigo: "NUE-002", nombre: "Otro insumo", categoriaId, unidadMedida: "unidad" });
    expect((await db.insumo.findUniqueOrThrow({ where: { id: sin.id } })).proveedorId).toBeNull();
    await esperarError(crearInsumo(e.bodeguero, { codigo: "NUE-003", nombre: "X", categoriaId, unidadMedida: "unidad", proveedorId: dos }), "SIN_PERMISO");
  });

  it("al EDITAR un insumo: omitido no toca el proveedor, vacío lo quita, un id lo define", async () => {
    const insumo = await db.insumo.findUniqueOrThrow({ where: { id: e.guantes } });
    const base = { id: insumo.id, codigo: insumo.codigo, nombre: insumo.nombre, categoriaId: insumo.categoriaId, unidadMedida: insumo.unidadMedida };
    await actualizarInsumo(e.admin, { ...base, proveedorId: e.proveedor });
    expect((await db.insumo.findUniqueOrThrow({ where: { id: e.guantes } })).proveedorId).toBe(e.proveedor);
    await actualizarInsumo(e.admin, { ...base, nombre: "Guantes de nitrilo talla M" });
    expect((await db.insumo.findUniqueOrThrow({ where: { id: e.guantes } })).proveedorId).toBe(e.proveedor);
    await actualizarInsumo(e.admin, { ...base, nombre: "Guantes de nitrilo talla M", proveedorId: "" });
    expect((await db.insumo.findUniqueOrThrow({ where: { id: e.guantes } })).proveedorId).toBeNull();
    const registros = await auditoriaDe("INSUMO_ACTUALIZADO");
    expect(registros.map((r) => (r.detalle as { cambios: Record<string, unknown> }).cambios)).toEqual([
      { proveedor: { antes: null, despues: "Proveedor Uno SpA" } },
      { nombre: { antes: "Guantes de nitrilo M", despues: "Guantes de nitrilo talla M" } },
      { proveedor: { antes: "Proveedor Uno SpA", despues: null } },
    ]);
  });
});

describe("aislamiento entre instituciones", () => {
  beforeEach(async () => {
    await definirProveedorRed(e.admin, { insumoId: e.guantes, proveedorId: e.proveedor });
    await definirProveedorInstitucion(e.adminB, { insumoId: e.guantes, proveedorId: tres });
  });

  it("un ADMIN no ve la preferencia de otra institución", async () => {
    const d = await detalleProveedorInsumo(e.adminA, e.guantes);
    expect(d.efectivo).toMatchObject({ id: e.proveedor, origen: "RED" });
    expect(d.institucion).toMatchObject({ id: e.institucionA, proveedor: null });
    expect(d.porInstitucion).toEqual([]);
    expect(JSON.stringify(d)).not.toContain("Proveedor Tres");
    for (const actor of [e.bodeguero, e.visitante]) {
      expect(JSON.stringify(await detalleProveedorInsumo(actor, e.guantes))).not.toContain("Proveedor Tres");
    }
    // El inventario, las alertas y el catálogo de administración de A tampoco la reflejan.
    await guardarParametrosStock(e.admin, {
      insumoId: e.guantes,
      parametros: [
        { centroId: e.centroA, stockMinimo: 10 },
        { centroId: e.centroC, stockMinimo: 10 },
      ],
    });
    const inventarioA = await listarInventario(e.adminA);
    expect(inventarioA.items.find((f) => f.insumoId === e.guantes)?.proveedor).toMatchObject({ id: e.proveedor, origen: "RED" });
    expect((await obtenerAlertas(e.adminA)).stock.map((a) => a.proveedor?.id)).toEqual([e.proveedor]);
    expect((await listarInsumosAdmin(e.adminA)).items.find((i) => i.id === e.guantes)?.proveedor).toMatchObject({ id: e.proveedor });
    expect((await listarInsumosAdmin(e.adminB)).items.find((i) => i.id === e.guantes)?.proveedor).toMatchObject({ id: tres, origen: "INSTITUCION" });
  });

  it("un ADMIN no puede definir ni quitar la preferencia de otra institución (para él no existe)", async () => {
    await esperarError(definirProveedorInstitucion(e.adminA, { insumoId: e.guantes, institucionId: e.institucionB, proveedorId: dos }), "NO_ENCONTRADO");
    await esperarError(definirProveedorInstitucion(e.adminA, { insumoId: e.guantes, institucionId: e.institucionB, proveedorId: null }), "NO_ENCONTRADO");
    const filasB = await db.proveedorInsumoInstitucion.findMany();
    expect(filasB).toHaveLength(1);
    expect(filasB[0]).toMatchObject({ institucionId: e.institucionB, proveedorId: tres });
    // Sin indicar institución, un ADMIN siempre escribe en la SUYA.
    await definirProveedorInstitucion(e.adminA, { insumoId: e.guantes, proveedorId: dos });
    expect(await db.proveedorInsumoInstitucion.findMany({ orderBy: { institucionId: "asc" }, select: { institucionId: true, proveedorId: true } })).toEqual(
      [
        { institucionId: e.institucionA, proveedorId: dos },
        { institucionId: e.institucionB, proveedorId: tres },
      ].sort((a, b) => a.institucionId.localeCompare(b.institucionId)),
    );
  });

  it("el administrador de la red ve el desglose y puede definirla para cualquier institución, indicando cuál", async () => {
    const red = await detalleProveedorInsumo(e.admin, e.guantes);
    expect(red.efectivo).toMatchObject({ id: e.proveedor, origen: "RED" });
    expect(red.institucion).toBeNull();
    expect(red.porInstitucion).toEqual([expect.objectContaining({ institucionId: e.institucionB, proveedor: expect.objectContaining({ id: tres }) })]);
    // Con un centro elegido, el contexto es la institución de ese centro.
    const enC = await detalleProveedorInsumo(e.admin, e.guantes, { centroId: e.centroC });
    expect(enC.efectivo).toMatchObject({ id: tres, origen: "INSTITUCION" });
    expect(enC.institucion).toMatchObject({ id: e.institucionB });

    await esperarError(definirProveedorInstitucion(e.admin, { insumoId: e.guantes, proveedorId: dos }), "VALIDACION");
    await esperarError(definirProveedorInstitucion(e.admin, { insumoId: e.guantes, institucionId: "no-existe", proveedorId: dos }), "NO_ENCONTRADO");
    await definirProveedorInstitucion(e.admin, { insumoId: e.guantes, institucionId: e.institucionA, proveedorId: dos });
    expect(await proveedorEfectivoDeInsumo(e.bodeguero, e.guantes)).toMatchObject({ id: dos, origen: "INSTITUCION" });
    // Cambiar el de la red no toca las preferencias.
    await definirProveedorRed(e.admin, { insumoId: e.guantes, proveedorId: null });
    expect(await proveedorEfectivoDeInsumo(e.bodeguero, e.guantes)).toMatchObject({ id: dos });
    expect(await proveedorEfectivoDeInsumo(e.bodegueroC, e.guantes)).toMatchObject({ id: tres });
  });

  it("el último ingreso (sugerencia) solo mira los centros del alcance", async () => {
    // La tela no tiene proveedor definido; solo la institución B la ha comprado (a Tres).
    await registrarIngreso(e.bodegueroC, { ubicacionId: e.bodegaC, insumoId: e.tela, numeroLote: "T-C", cantidad: 5, proveedorId: tres });
    expect((await detalleProveedorInsumo(e.adminB, e.tela)).ultimoIngreso?.proveedor).toMatchObject({ id: tres });
    expect((await detalleProveedorInsumo(e.adminA, e.tela)).ultimoIngreso).toBeNull();
    expect((await detalleProveedorInsumo(e.bodeguero, e.tela)).ultimoIngreso).toBeNull();
    expect((await detalleProveedorInsumo(e.admin, e.tela)).ultimoIngreso?.proveedor).toMatchObject({ id: tres });
    expect((await detalleProveedorInsumo(e.admin, e.tela, { centroId: e.centroA })).ultimoIngreso).toBeNull();
    // Con proveedor definido ya no se ofrece la sugerencia.
    await definirProveedorInstitucion(e.adminB, { insumoId: e.tela, proveedorId: e.proveedor });
    expect((await detalleProveedorInsumo(e.adminB, e.tela)).ultimoIngreso).toBeNull();
  });
});

describe("proveedor inactivo", () => {
  it("no se puede asignar un proveedor inactivo ni uno inexistente", async () => {
    await establecerProveedorActivo(e.admin, dos, false);
    const error = await esperarError(definirProveedorRed(e.admin, { insumoId: e.guantes, proveedorId: dos }), "INACTIVO");
    expect(error.campo).toBe("proveedorId");
    await esperarError(definirProveedorInstitucion(e.adminA, { insumoId: e.guantes, proveedorId: dos }), "INACTIVO");
    await esperarError(definirProveedorRed(e.admin, { insumoId: e.guantes, proveedorId: "no-existe" }), "NO_ENCONTRADO");
    const categoriaId = (await db.categoria.findFirstOrThrow()).id;
    await esperarError(crearInsumo(e.admin, { codigo: "NUE-009", nombre: "X", categoriaId, unidadMedida: "unidad", proveedorId: dos }), "INACTIVO");
    expect(await db.insumo.count({ where: { codigo: "NUE-009" } })).toBe(0);
  });

  it("desactivar un proveedor asignado NO borra la asignación: se muestra marcado como inactivo", async () => {
    await definirProveedorRed(e.admin, { insumoId: e.guantes, proveedorId: dos });
    await definirProveedorInstitucion(e.adminB, { insumoId: e.dializador, proveedorId: dos });
    await establecerProveedorActivo(e.admin, dos, false);

    expect((await db.insumo.findUniqueOrThrow({ where: { id: e.guantes } })).proveedorId).toBe(dos);
    expect(await db.proveedorInsumoInstitucion.count()).toBe(1);
    expect(await proveedorEfectivoDeInsumo(e.bodeguero, e.guantes)).toMatchObject({ id: dos, activo: false, origen: "RED" });
    expect((await detalleProveedorInsumo(e.adminB, e.dializador)).efectivo).toMatchObject({ id: dos, activo: false, origen: "INSTITUCION" });
    // Se puede cambiar por uno activo, o dejarlo igual sin error.
    expect(await definirProveedorRed(e.admin, { insumoId: e.guantes, proveedorId: dos })).toMatchObject({ cambiado: false });
    expect(await definirProveedorRed(e.admin, { insumoId: e.guantes, proveedorId: tres })).toMatchObject({ cambiado: true });
    // Editar el insumo conservando el proveedor inactivo tampoco falla.
    const insumo = await db.insumo.findUniqueOrThrow({ where: { id: e.dializador } });
    await definirProveedorRed(e.admin, { insumoId: e.dializador, proveedorId: tres });
    await establecerProveedorActivo(e.admin, tres, false);
    await actualizarInsumo(e.admin, {
      id: insumo.id, codigo: insumo.codigo, nombre: "Dializador renombrado", categoriaId: insumo.categoriaId, unidadMedida: insumo.unidadMedida, proveedorId: tres,
    });
    expect((await db.insumo.findUniqueOrThrow({ where: { id: e.dializador } })).proveedorId).toBe(tres);
  });

  it("eliminar un insumo sin historia elimina también sus preferencias", async () => {
    const categoriaId = (await db.categoria.findFirstOrThrow()).id;
    const creado = await crearInsumo(e.admin, { codigo: "TMP-001", nombre: "Temporal", categoriaId, unidadMedida: "unidad", proveedorId: dos });
    await definirProveedorInstitucion(e.adminA, { insumoId: creado.id, proveedorId: tres });
    await eliminarInsumo(e.admin, creado.id);
    expect(await db.proveedorInsumoInstitucion.count()).toBe(0);
  });
});

describe("inventario: columna y filtro por proveedor", () => {
  beforeEach(async () => {
    // Stock en A (dializador, guantes, tela) y en C (guantes).
    await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "D-1", fechaVencimiento: e.dia(300), cantidad: 10 });
    await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.guantes, numeroLote: "G-1", fechaVencimiento: e.dia(300), cantidad: 10 });
    await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.tela, numeroLote: "T-1", cantidad: 10 });
    await registrarIngreso(e.bodegueroC, { ubicacionId: e.bodegaC, insumoId: e.guantes, numeroLote: "G-C", fechaVencimiento: e.dia(300), cantidad: 10 });
    await definirProveedorRed(e.admin, { insumoId: e.dializador, proveedorId: e.proveedor });
    await definirProveedorRed(e.admin, { insumoId: e.guantes, proveedorId: e.proveedor });
    await definirProveedorInstitucion(e.adminA, { insumoId: e.guantes, proveedorId: dos });
  });

  const nombres = async (...args: Parameters<typeof listarInventario>) =>
    (await listarInventario(...args)).items.map((f) => `${f.nombre} → ${f.proveedor?.razonSocial ?? "—"} (${f.proveedor?.origen ?? "-"})`).sort();

  it("cada fila trae el proveedor efectivo del contexto", async () => {
    expect(await nombres(e.bodeguero)).toEqual([
      "Dializador 1.8 m² → Proveedor Uno SpA (RED)",
      "Guantes de nitrilo M → Proveedor Dos Ltda. (INSTITUCION)",
      "Tela adhesiva → — (-)",
    ]);
    expect(await nombres(e.bodegueroC)).toEqual(["Guantes de nitrilo M → Proveedor Uno SpA (RED)"]);
    // Toda la red: el predeterminado de la red; con un centro, el de su institución.
    expect((await nombres(e.admin)).find((n) => n.startsWith("Guantes"))).toBe("Guantes de nitrilo M → Proveedor Uno SpA (RED)");
    expect((await nombres(e.admin, { centroId: e.centroA })).find((n) => n.startsWith("Guantes"))).toBe(
      "Guantes de nitrilo M → Proveedor Dos Ltda. (INSTITUCION)",
    );
  });

  it("filtra por el proveedor EFECTIVO y por «sin proveedor»", async () => {
    const ids = async (...args: Parameters<typeof listarInventario>) => (await listarInventario(...args)).items.map((f) => f.insumoId).sort();
    expect(await ids(e.bodeguero, { proveedorId: e.proveedor })).toEqual([e.dializador]);
    expect(await ids(e.bodeguero, { proveedorId: dos })).toEqual([e.guantes]);
    expect(await ids(e.bodeguero, { proveedorId: FILTRO_SIN_PROVEEDOR })).toEqual([e.tela]);
    expect(await ids(e.bodeguero, { proveedorId: tres })).toEqual([]);
    // La otra institución, con el mismo filtro, ve otra cosa: los guantes son de Uno para ella.
    expect(await ids(e.bodegueroC, { proveedorId: e.proveedor })).toEqual([e.guantes]);
    expect(await ids(e.bodegueroC, { proveedorId: dos })).toEqual([]);
    const total = (await listarInventario(e.bodeguero, { proveedorId: e.proveedor })).total;
    expect(total).toBe(1);
  });

  it("«Insumos que le compras» del directorio coincide con el inventario filtrado, por alcance", async () => {
    for (const [actor, filtros] of [
      [e.bodeguero, {}],
      [e.adminA, {}],
      [e.bodegueroC, {}],
      [e.admin, {}],
      [e.admin, { centroId: e.centroA }],
    ] as const) {
      const conteo = await contarInsumosPorProveedor(actor, filtros);
      const directorio = await listarDirectorioProveedores(actor, { ...filtros, orden: "nombre", limite: 50 });
      for (const p of directorio.items) {
        const enInventario = (await listarInventario(actor, { ...filtros, proveedorId: p.id })).total;
        expect(p.insumos, `${p.razonSocial} para ${actor.rol}`).toBe(enInventario);
        expect(conteo[p.id] ?? 0).toBe(enInventario);
      }
    }
    const deA = Object.fromEntries((await listarDirectorioProveedores(e.bodeguero, { orden: "nombre" })).items.map((p) => [p.razonSocial, p.insumos]));
    expect(deA).toEqual({ "Proveedor Dos Ltda.": 1, "Proveedor Tres SpA": 0, "Proveedor Uno SpA": 1 });
    const deC = Object.fromEntries((await listarDirectorioProveedores(e.bodegueroC, { orden: "nombre" })).items.map((p) => [p.razonSocial, p.insumos]));
    expect(deC).toEqual({ "Proveedor Dos Ltda.": 0, "Proveedor Tres SpA": 0, "Proveedor Uno SpA": 1 });
  });
});

describe("alertas, reposición y CSV", () => {
  beforeEach(async () => {
    // Mínimos sin stock: dializador y guantes en A y en C; tela solo en A.
    for (const insumoId of [e.dializador, e.guantes]) {
      await guardarParametrosStock(e.admin, {
        insumoId,
        parametros: [
          { centroId: e.centroA, stockMinimo: 10, stockMaximo: 30 },
          { centroId: e.centroC, stockMinimo: 5 },
        ],
      });
    }
    await guardarParametrosStock(e.admin, { insumoId: e.tela, parametros: [{ centroId: e.centroA, stockMinimo: 4 }] });
    await definirProveedorRed(e.admin, { insumoId: e.dializador, proveedorId: e.proveedor });
    await definirProveedorRed(e.admin, { insumoId: e.guantes, proveedorId: e.proveedor });
    await definirProveedorInstitucion(e.adminA, { insumoId: e.guantes, proveedorId: dos });
  });

  it("cada alerta de stock lleva el proveedor de la institución de SU centro (también en «Toda la red»)", async () => {
    const alertas = await obtenerAlertas(e.admin);
    const porClave = Object.fromEntries(alertas.stock.map((a) => [`${a.nombre}@${a.centro}`, a.proveedor?.razonSocial ?? null]));
    expect(porClave).toEqual({
      "Dializador 1.8 m²@Centro A": "Proveedor Uno SpA",
      "Dializador 1.8 m²@Centro C": "Proveedor Uno SpA",
      "Guantes de nitrilo M@Centro A": "Proveedor Dos Ltda.",
      "Guantes de nitrilo M@Centro C": "Proveedor Uno SpA",
      "Tela adhesiva@Centro A": null,
    });
    const guantesA = alertas.stock.find((a) => a.insumoId === e.guantes && a.centroId === e.centroA);
    expect(guantesA?.proveedor).toMatchObject({ origen: "INSTITUCION", sitioWeb: "https://www.ejemplo-dos.cl/", telefono: "+56 2 2222 2222" });
    // El panel ("Qué requiere atención") usa las mismas alertas.
    const panel = await resumenPanel(e.bodeguero);
    expect(panel.atencion.sinStock.items.map((a) => a.proveedor?.razonSocial ?? null).sort()).toEqual([null, "Proveedor Dos Ltda.", "Proveedor Uno SpA"].sort());
  });

  it("la lista de reposición se agrupa por proveedor, con «sin proveedor» al final", async () => {
    const lista = await listaReposicion(e.admin);
    expect(lista.totalItems).toBe(5);
    expect(lista.grupos.map((g) => g.centro)).toEqual(["Centro A", "Centro C"]);
    expect(lista.porProveedor.map((g) => [g.proveedor?.razonSocial ?? null, g.items.map((i) => `${i.nombre}@${i.centro}`)])).toEqual([
      ["Proveedor Dos Ltda.", ["Guantes de nitrilo M@Centro A"]],
      ["Proveedor Uno SpA", ["Dializador 1.8 m²@Centro A", "Dializador 1.8 m²@Centro C", "Guantes de nitrilo M@Centro C"]],
      [null, ["Tela adhesiva@Centro A"]],
    ]);
    expect(lista.porProveedor.reduce((s, g) => s + g.items.length, 0)).toBe(lista.totalItems);
    expect(lista.porProveedor[0]?.proveedor).toMatchObject({ telefono: "+56 2 2222 2222", email: "ventas@dos.example", rut: "77222333-4" });
    // Cada institución arma su pedido solo con lo suyo.
    const deC = await listaReposicion(e.adminB);
    expect(deC.porProveedor.map((g) => [g.proveedor?.razonSocial, g.items.length])).toEqual([["Proveedor Uno SpA", 2]]);
  });

  it("CSV de reposición: columnas proveedor, RUT, teléfono y correo; con `agrupar` cambia solo el orden", async () => {
    const porCentro = await exportarReposicion(e.admin);
    expect(porCentro.encabezados.slice(-4)).toEqual(["Proveedor", "RUT proveedor", "Teléfono proveedor", "Correo proveedor"]);
    const iInsumo = porCentro.encabezados.indexOf("Insumo");
    const iCentro = porCentro.encabezados.indexOf("Centro");
    const iProveedor = porCentro.encabezados.indexOf("Proveedor");
    const datos = await filas(porCentro);
    expect(datos.every((f) => f.length === porCentro.encabezados.length)).toBe(true);
    const guantesA = datos.find((f) => f[iInsumo] === "Guantes de nitrilo M" && f[iCentro] === "Centro A")!;
    expect(guantesA.slice(-4)).toEqual(["Proveedor Dos Ltda.", "77.222.333-4", "+56 2 2222 2222", "ventas@dos.example"]);
    const tela = datos.find((f) => f[iInsumo] === "Tela adhesiva")!;
    expect(tela.slice(-4)).toEqual(["", "", "", ""]);
    expect(datos.map((f) => f[iCentro])).toEqual(["Centro A", "Centro A", "Centro A", "Centro C", "Centro C"]);

    const porProveedor = await filas(await exportarReposicion(e.admin, { agrupar: "proveedor" }));
    expect(porProveedor.map((f) => f[iProveedor])).toEqual(["Proveedor Dos Ltda.", "Proveedor Uno SpA", "Proveedor Uno SpA", "Proveedor Uno SpA", ""]);
    expect([...porProveedor].sort()).toEqual([...datos].sort());
    // Un proveedor inactivo se marca en el archivo.
    await establecerProveedorActivo(e.admin, dos, false);
    const marcado = await filas(await exportarReposicion(e.adminA));
    expect(marcado.map((f) => f[iProveedor])).toContain("Proveedor Dos Ltda. (inactivo)");
    const exportaciones = await auditoriaDe("REPORTE_EXPORTADO");
    expect(exportaciones.map((r) => (r.detalle as { filtros: { agrupar?: string } }).filtros.agrupar ?? null)).toEqual([null, "proveedor", null]);
  });

  it("reporte de existencias y su CSV traen el proveedor de la institución de cada centro", async () => {
    await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.guantes, numeroLote: "G-1", fechaVencimiento: e.dia(300), cantidad: 10 });
    await registrarIngreso(e.bodegueroC, { ubicacionId: e.bodegaC, insumoId: e.guantes, numeroLote: "G-C", fechaVencimiento: e.dia(300), cantidad: 10 });
    await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.tela, numeroLote: "T-1", cantidad: 3 });
    const reporte = await reporteExistencias(e.admin);
    expect(Object.fromEntries(reporte.items.map((f) => [`${f.nombre}@${f.centro}`, f.proveedor?.razonSocial ?? null]))).toEqual({
      "Guantes de nitrilo M@Centro A": "Proveedor Dos Ltda.",
      "Guantes de nitrilo M@Centro C": "Proveedor Uno SpA",
      "Tela adhesiva@Centro A": null,
    });
    const exportacion = await exportarExistencias(e.admin);
    expect(exportacion.encabezados.at(-1)).toBe("Proveedor");
    const datos = await filas(exportacion);
    const iCentro = exportacion.encabezados.indexOf("Centro");
    const iInsumo = exportacion.encabezados.indexOf("Insumo");
    expect(datos.map((f) => `${f[iInsumo]}@${f[iCentro]} = ${f.at(-1)}`).sort()).toEqual([
      "Guantes de nitrilo M@Centro A = Proveedor Dos Ltda.",
      "Guantes de nitrilo M@Centro C = Proveedor Uno SpA",
      "Tela adhesiva@Centro A = ",
    ]);
    // El administrador de A solo ve (y exporta) lo suyo.
    expect((await filas(await exportarExistencias(e.adminA))).map((f) => f.at(-1))).toEqual(["Proveedor Dos Ltda.", ""]);
  });
});

describe("ingreso: preselección sin efectos laterales", () => {
  it("el proveedor sugerido para el ingreso es el efectivo de la institución del centro de destino", async () => {
    await definirProveedorRed(e.admin, { insumoId: e.guantes, proveedorId: e.proveedor });
    await definirProveedorInstitucion(e.adminA, { insumoId: e.guantes, proveedorId: dos });
    expect(await proveedorEfectivoDeInsumo(e.bodeguero, e.guantes, { centroId: e.centroA })).toMatchObject({ id: dos });
    expect(await proveedorEfectivoDeInsumo(e.bodegueroC, e.guantes, { centroId: e.centroC })).toMatchObject({ id: e.proveedor });
    // Administrador de la red en "Toda la red": depende de la ubicación (centro) que elija.
    expect(await proveedorEfectivoDeInsumo(e.admin, e.guantes, { centroId: e.centroB })).toMatchObject({ id: dos });
    expect(await proveedorEfectivoDeInsumo(e.admin, e.guantes, { centroId: e.centroC })).toMatchObject({ id: e.proveedor });
  });

  it("registrar un ingreso con OTRO proveedor no cambia el predeterminado ni la preferencia", async () => {
    await definirProveedorRed(e.admin, { insumoId: e.guantes, proveedorId: e.proveedor });
    await definirProveedorInstitucion(e.adminA, { insumoId: e.guantes, proveedorId: dos });
    const antes = await db.registroAuditoria.count({ where: { accion: { startsWith: "INSUMO_PROVEEDOR" } } });
    await registrarIngreso(e.bodeguero, {
      ubicacionId: e.bodegaA, insumoId: e.guantes, numeroLote: "G-9", fechaVencimiento: e.dia(200), cantidad: 4, proveedorId: tres,
    });
    await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.guantes, numeroLote: "G-10", fechaVencimiento: e.dia(200), cantidad: 4 });
    expect((await db.insumo.findUniqueOrThrow({ where: { id: e.guantes } })).proveedorId).toBe(e.proveedor);
    expect(await proveedorEfectivoDeInsumo(e.bodeguero, e.guantes)).toMatchObject({ id: dos });
    expect(await db.registroAuditoria.count({ where: { accion: { startsWith: "INSUMO_PROVEEDOR" } } })).toBe(antes);
    // Y el ingreso quedó con el proveedor que eligió la persona.
    expect((await db.movimiento.findFirstOrThrow({ where: { lote: { numeroLote: "G-9" } } })).proveedorId).toBe(tres);
  });
});

describe("auditoría", () => {
  it("el cambio del predeterminado de la red es un evento de red; el de una institución es de esa institución", async () => {
    await definirProveedorRed(e.admin, { insumoId: e.guantes, proveedorId: e.proveedor });
    await definirProveedorInstitucion(e.adminA, { insumoId: e.guantes, proveedorId: dos });
    await definirProveedorInstitucion(e.admin, { insumoId: e.guantes, institucionId: e.institucionB, proveedorId: tres });
    await definirProveedorInstitucion(e.adminA, { insumoId: e.guantes, proveedorId: null });

    const [red] = await auditoriaDe("INSUMO_PROVEEDOR_RED_ACTUALIZADO");
    expect(red).toMatchObject({ entidad: "Insumo", entidadId: e.guantes, institucionId: null, usuarioId: e.admin.usuarioId });
    expect(red?.detalle).toMatchObject({ codigo: "GUA-001", cambios: { proveedor: { antes: null, despues: "Proveedor Uno SpA" } } });

    const deInstitucion = await auditoriaDe("INSUMO_PROVEEDOR_INSTITUCION_ACTUALIZADO");
    expect(deInstitucion.map((r) => [r.institucionId, r.usuarioId])).toEqual([
      [e.institucionA, e.adminA.usuarioId],
      // Lo hizo el administrador de la red, pero pertenece a la institución afectada.
      [e.institucionB, e.admin.usuarioId],
      [e.institucionA, e.adminA.usuarioId],
    ]);
    expect(deInstitucion[0]?.detalle).toMatchObject({
      institucion: "Institución Uno",
      cambios: { proveedor: { antes: "Predeterminado de la red", despues: "Proveedor Dos Ltda." } },
      predeterminadoRed: "Proveedor Uno SpA",
    });
    expect(deInstitucion[2]?.detalle).toMatchObject({ cambios: { proveedor: { antes: "Proveedor Dos Ltda.", despues: "Predeterminado de la red" } } });

    // Cada administrador ve solo lo de su institución; el evento de red, solo el administrador de la red.
    const acciones = async (actor: typeof e.admin) =>
      (await listarAuditoria(actor, { entidad: "Insumo" })).items.filter((r) => r.accion.startsWith("INSUMO_PROVEEDOR")).map((r) => r.accion);
    expect(await acciones(e.adminA)).toEqual(["INSUMO_PROVEEDOR_INSTITUCION_ACTUALIZADO", "INSUMO_PROVEEDOR_INSTITUCION_ACTUALIZADO"]);
    expect(await acciones(e.adminB)).toEqual(["INSUMO_PROVEEDOR_INSTITUCION_ACTUALIZADO"]);
    expect(await acciones(e.admin)).toHaveLength(4);
  });

  it("las acciones nuevas tienen etiqueta y resumen legibles", () => {
    for (const accion of ["INSUMO_PROVEEDOR_RED_ACTUALIZADO", "INSUMO_PROVEEDOR_INSTITUCION_ACTUALIZADO"]) expect(tieneEtiquetaPropia(accion)).toBe(true);
    expect(etiquetaAccion("INSUMO_PROVEEDOR_RED_ACTUALIZADO")).toBe("Proveedor predeterminado de la red modificado");
    expect(etiquetaAccion("INSUMO_PROVEEDOR_INSTITUCION_ACTUALIZADO")).toBe("Proveedor del insumo para la institución modificado");
    expect(
      resumenAuditoria("INSUMO_PROVEEDOR_RED_ACTUALIZADO", { codigo: "GUA-001", nombre: "Guantes", cambios: { proveedor: { antes: null, despues: "Uno" } } }),
    ).toBe("Guantes · cambió proveedor");
  });
});
