import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/permisos";
import { iniciarSesion, validarTokenSesion } from "@/server/auth/autenticacion";
import { verificarPassword } from "@/server/auth/password";
import { db } from "@/server/db";
import {
  actualizarCategoria,
  actualizarCentro,
  actualizarInsumo,
  actualizarProveedor,
  actualizarUbicacion,
  actualizarUsuario,
  crearCategoria,
  crearCentro,
  crearInsumo,
  crearProveedor,
  crearUbicacion,
  crearUsuario,
  desbloquearUsuario,
  eliminarCategoria,
  eliminarInsumo,
  establecerCentroActivo,
  establecerInsumoActivo,
  establecerProveedorActivo,
  establecerUbicacionActiva,
  establecerUsuarioActivo,
  generarPasswordTemporal,
  guardarParametrosStock,
  listarAuditoria,
  listarCategoriasAdmin,
  listarCentrosAdmin,
  listarInsumosAdmin,
  listarProveedoresAdmin,
  listarUsuarios,
  obtenerCentroAdmin,
  obtenerInsumoAdmin,
  opcionesFiltroAuditoria,
  registrarIngreso,
  registrarMerma,
  restablecerPasswordUsuario,
} from "@/server/servicios";
import { crearEscenario, esperarError, type Escenario } from "./soporte/escenario";

let e: Escenario;
let categoriaId: string;

beforeEach(async () => {
  e = await crearEscenario();
  categoriaId = (await db.categoria.findFirstOrThrow()).id;
});

const insumoBase = () => ({
  codigo: "jer-10",
  nombre: "Jeringa 10 ml",
  categoriaId,
  unidadMedida: "unidad",
  presentacion: "Caja de 100",
  codigoBarras: "7801234567890",
  requiereCadenaFrio: false,
  controlaVencimiento: true,
});

const centroBase = {
  nombre: "Clínica Los Robles",
  tipo: "CLINICA" as const,
  rut: "76.543.210-3",
  direccion: "Av. Alemania 450",
  region: "La Araucanía",
  comuna: "Temuco",
  telefono: "+56 45 221 0000",
};

async function ultimaAuditoria(accion: string) {
  return db.registroAuditoria.findFirst({ where: { accion }, orderBy: { creadoEn: "desc" } });
}

// ---------------------------------------------------------------------------
describe("permisos de administración", () => {
  it("bodeguero y visitante no pueden consultar ni modificar nada de administración", async () => {
    for (const actor of [e.bodeguero, e.visitante]) {
      const intentos: Promise<unknown>[] = [
        listarInsumosAdmin(actor),
        obtenerInsumoAdmin(actor, e.dializador),
        crearInsumo(actor, insumoBase()),
        actualizarInsumo(actor, { ...insumoBase(), id: e.dializador }),
        establecerInsumoActivo(actor, e.dializador, false),
        eliminarInsumo(actor, e.dializador),
        guardarParametrosStock(actor, { insumoId: e.dializador, parametros: [{ centroId: e.centroA, stockMinimo: 5 }] }),
        listarCategoriasAdmin(actor),
        crearCategoria(actor, { nombre: "Nueva" }),
        actualizarCategoria(actor, { id: categoriaId, nombre: "Otra" }),
        eliminarCategoria(actor, categoriaId),
        listarCentrosAdmin(actor),
        obtenerCentroAdmin(actor, e.centroA),
        crearCentro(actor, centroBase),
        actualizarCentro(actor, { ...centroBase, id: e.centroA }),
        establecerCentroActivo(actor, e.centroA, false),
        crearUbicacion(actor, { centroId: e.centroA, nombre: "Pañol", tipo: "BODEGA" }),
        actualizarUbicacion(actor, { id: e.bodegaA, nombre: "Pañol", tipo: "BODEGA" }),
        establecerUbicacionActiva(actor, e.salaA, false),
        listarProveedoresAdmin(actor),
        crearProveedor(actor, { rut: "77.777.777-7", razonSocial: "X" }),
        actualizarProveedor(actor, { id: e.proveedor, rut: "77.777.777-7", razonSocial: "X" }),
        establecerProveedorActivo(actor, e.proveedor, false),
        listarUsuarios(actor),
        crearUsuario(actor, { nombre: "Otro Admin", email: "otro@test.cl", rol: "ADMIN_RED" }),
        actualizarUsuario(actor, { id: actor.usuarioId, nombre: "Yo Mismo", email: "yo@test.cl", rol: "ADMIN_RED" }),
        establecerUsuarioActivo(actor, e.admin.usuarioId, false),
        restablecerPasswordUsuario(actor, e.admin.usuarioId),
        desbloquearUsuario(actor, e.admin.usuarioId),
        listarAuditoria(actor),
        opcionesFiltroAuditoria(actor),
      ];
      for (const intento of intentos) await esperarError(intento, "SIN_PERMISO");
    }
    // Nada cambió ni quedó auditado.
    expect(await db.registroAuditoria.count()).toBe(0);
    expect(await db.usuario.count({ where: { rol: "ADMIN_RED" } })).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe("insumos", () => {
  it("crea con el código en mayúsculas y audita", async () => {
    const creado = await crearInsumo(e.admin, insumoBase());
    expect(creado.codigo).toBe("JER-10");
    const guardado = await db.insumo.findUniqueOrThrow({ where: { id: creado.id } });
    expect(guardado).toMatchObject({ nombre: "Jeringa 10 ml", presentacion: "Caja de 100", descripcion: null, activo: true });
    const auditoria = await ultimaAuditoria("INSUMO_CREADO");
    expect(auditoria).toMatchObject({ entidad: "Insumo", entidadId: creado.id, usuarioId: e.admin.usuarioId });
  });

  it("rechaza código duplicado (sin distinguir mayúsculas) como error del campo", async () => {
    const error = await esperarError(crearInsumo(e.admin, { ...insumoBase(), codigo: "dia-001" }), "DUPLICADO");
    expect(error.campo).toBe("codigo");
    expect(error.message).toContain("Dializador");
  });

  it("rechaza código de barras repetido y categoría inexistente", async () => {
    await crearInsumo(e.admin, insumoBase());
    const barra = await esperarError(crearInsumo(e.admin, { ...insumoBase(), codigo: "JER-20" }), "DUPLICADO");
    expect(barra.campo).toBe("codigoBarras");
    const cat = await esperarError(
      crearInsumo(e.admin, { ...insumoBase(), codigo: "JER-30", codigoBarras: "", categoriaId: "no-existe" }),
      "NO_ENCONTRADO",
    );
    expect(cat.campo).toBe("categoriaId");
  });

  it("valida los campos obligatorios y el formato del código", async () => {
    const error = await esperarError(
      crearInsumo(e.admin, { ...insumoBase(), codigo: "con espacio", nombre: " ", unidadMedida: "" }),
      "VALIDACION",
    );
    const campos = error.detalle?.erroresCampo as Record<string, string[]>;
    expect(Object.keys(campos).sort()).toEqual(["codigo", "nombre", "unidadMedida"]);
  });

  it("actualiza y audita solo los campos que cambian", async () => {
    const otra = await crearCategoria(e.admin, { nombre: "Curación" });
    const actual = await db.insumo.findUniqueOrThrow({ where: { id: e.tela } });
    await actualizarInsumo(e.admin, {
      id: e.tela,
      codigo: actual.codigo,
      nombre: "Tela adhesiva 5 cm",
      categoriaId: otra.id,
      unidadMedida: actual.unidadMedida,
      requiereCadenaFrio: actual.requiereCadenaFrio,
      controlaVencimiento: actual.controlaVencimiento,
    });
    const auditoria = await ultimaAuditoria("INSUMO_ACTUALIZADO");
    expect(auditoria?.detalle).toMatchObject({
      cambios: {
        nombre: { antes: "Tela adhesiva", despues: "Tela adhesiva 5 cm" },
        categoria: { antes: "General", despues: "Curación" },
      },
    });
    expect(Object.keys((auditoria?.detalle as { cambios: object }).cambios)).toHaveLength(2);

    // Guardar sin cambios no genera otro registro.
    const antes = await db.registroAuditoria.count({ where: { accion: "INSUMO_ACTUALIZADO" } });
    await actualizarInsumo(e.admin, {
      id: e.tela, codigo: actual.codigo, nombre: "Tela adhesiva 5 cm", categoriaId: otra.id,
      unidadMedida: actual.unidadMedida, requiereCadenaFrio: actual.requiereCadenaFrio,
      controlaVencimiento: actual.controlaVencimiento,
    });
    expect(await db.registroAuditoria.count({ where: { accion: "INSUMO_ACTUALIZADO" } })).toBe(antes);
  });

  it("no permite tomar el código de otro insumo al editar", async () => {
    const actual = await db.insumo.findUniqueOrThrow({ where: { id: e.tela } });
    const error = await esperarError(
      actualizarInsumo(e.admin, {
        id: e.tela, codigo: "GUA-001", nombre: actual.nombre, categoriaId,
        unidadMedida: actual.unidadMedida, requiereCadenaFrio: false, controlaVencimiento: false,
      }),
      "DUPLICADO",
    );
    expect(error.campo).toBe("codigo");
  });

  it("desactiva y reactiva; un insumo inactivo no admite ingresos", async () => {
    await establecerInsumoActivo(e.admin, e.guantes, false);
    await esperarError(
      registrarIngreso(e.admin, { ubicacionId: e.bodegaA, insumoId: e.guantes, numeroLote: "L1", fechaVencimiento: e.dia(200), cantidad: 5 }),
      "INACTIVO",
    );
    await establecerInsumoActivo(e.admin, e.guantes, true);
    expect((await db.insumo.findUniqueOrThrow({ where: { id: e.guantes } })).activo).toBe(true);
    expect(await db.registroAuditoria.count({ where: { accion: { in: ["INSUMO_DESACTIVADO", "INSUMO_ACTIVADO"] } } })).toBe(2);
  });

  it("solo elimina insumos sin movimientos", async () => {
    await registrarIngreso(e.admin, { ubicacionId: e.bodegaA, insumoId: e.guantes, numeroLote: "L1", fechaVencimiento: e.dia(200), cantidad: 5 });
    await esperarError(eliminarInsumo(e.admin, e.guantes), "EN_USO");
    expect(await db.insumo.count({ where: { id: e.guantes } })).toBe(1);

    const nuevo = await crearInsumo(e.admin, insumoBase());
    await guardarParametrosStock(e.admin, { insumoId: nuevo.id, parametros: [{ centroId: e.centroA, stockMinimo: 10 }] });
    await eliminarInsumo(e.admin, nuevo.id);
    expect(await db.insumo.count({ where: { id: nuevo.id } })).toBe(0);
    expect(await db.parametroStock.count({ where: { insumoId: nuevo.id } })).toBe(0);
  });

  it("lista con búsqueda sin tildes, filtros y paginación", async () => {
    const todos = await listarInsumosAdmin(e.admin);
    expect(todos.total).toBe(4);
    expect(todos.items.at(-1)?.activo).toBe(false); // inactivos al final

    expect((await listarInsumosAdmin(e.admin, { texto: "DIALIZADOR" })).items.map((i) => i.codigo)).toEqual(["DIA-001"]);
    expect((await listarInsumosAdmin(e.admin, { texto: "gua-0" })).items.map((i) => i.codigo)).toEqual(["GUA-001"]);
    expect((await listarInsumosAdmin(e.admin, { estado: "inactivos" })).items.map((i) => i.codigo)).toEqual(["OLD-001"]);
    expect((await listarInsumosAdmin(e.admin, { estado: "activos" })).total).toBe(3);
    expect((await listarInsumosAdmin(e.admin, { texto: "100%_" })).total).toBe(0);

    const pagina2 = await listarInsumosAdmin(e.admin, { porPagina: 3, pagina: 2 });
    expect(pagina2).toMatchObject({ total: 4, pagina: 2, totalPaginas: 2 });
    expect(pagina2.items).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
describe("parámetros de stock", () => {
  it("crea, modifica y elimina parámetros por centro, auditando solo los cambios", async () => {
    const r1 = await guardarParametrosStock(e.admin, {
      insumoId: e.dializador,
      parametros: [
        { centroId: e.centroA, stockMinimo: "120", stockMaximo: "1.200" },
        { centroId: e.centroB, stockMinimo: "", stockMaximo: "" },
      ],
    });
    expect(r1.actualizados).toBe(1);
    expect(await db.parametroStock.findMany({ where: { insumoId: e.dializador } })).toMatchObject([
      { centroId: e.centroA, stockMinimo: 120, stockMaximo: 1200 },
    ]);

    const r2 = await guardarParametrosStock(e.admin, {
      insumoId: e.dializador,
      parametros: [
        { centroId: e.centroA, stockMinimo: 120, stockMaximo: 1200 }, // sin cambio
        { centroId: e.centroB, stockMinimo: 30 },
      ],
    });
    expect(r2.actualizados).toBe(1);

    const r3 = await guardarParametrosStock(e.admin, {
      insumoId: e.dializador,
      parametros: [{ centroId: e.centroA, stockMinimo: "", stockMaximo: "" }],
    });
    expect(r3.actualizados).toBe(1);
    expect(await db.parametroStock.findMany({ where: { insumoId: e.dializador } })).toMatchObject([
      { centroId: e.centroB, stockMinimo: 30, stockMaximo: null },
    ]);
    expect(await db.registroAuditoria.count({ where: { accion: "PARAMETROS_STOCK_ACTUALIZADOS" } })).toBe(3);

    const ficha = await obtenerInsumoAdmin(e.admin, e.dializador);
    expect(ficha.parametros.map((p) => [p.centro, p.stockMinimo, p.stockMaximo])).toEqual([
      ["Centro A", null, null],
      ["Centro B", 30, null],
    ]);
  });

  it("rechaza máximo menor que el mínimo y valores no enteros, indicando la fila", async () => {
    const error = await esperarError(
      guardarParametrosStock(e.admin, {
        insumoId: e.dializador,
        parametros: [
          { centroId: e.centroA, stockMinimo: "50", stockMaximo: "20" },
          { centroId: e.centroB, stockMinimo: "-3" },
        ],
      }),
      "VALIDACION",
    );
    const campos = error.detalle?.erroresCampo as Record<string, string[]>;
    expect(Object.keys(campos).sort()).toEqual(["parametros.0.stockMaximo", "parametros.1.stockMinimo"]);
    expect(await db.parametroStock.count()).toBe(0);
  });

  it("no acepta centros inexistentes ni repetidos", async () => {
    await esperarError(
      guardarParametrosStock(e.admin, { insumoId: e.dializador, parametros: [{ centroId: "no-existe", stockMinimo: 1 }] }),
      "NO_ENCONTRADO",
    );
    await esperarError(
      guardarParametrosStock(e.admin, {
        insumoId: e.dializador,
        parametros: [{ centroId: e.centroA, stockMinimo: 1 }, { centroId: e.centroA, stockMinimo: 2 }],
      }),
      "VALIDACION",
    );
  });
});

// ---------------------------------------------------------------------------
describe("categorías", () => {
  it("lista con conteo de insumos", async () => {
    expect(await listarCategoriasAdmin(e.admin)).toMatchObject([{ nombre: "General", insumos: 4, insumosActivos: 3 }]);
  });

  it("nombre único sin distinguir mayúsculas, al crear y al renombrar", async () => {
    const dup = await esperarError(crearCategoria(e.admin, { nombre: "  general " }), "DUPLICADO");
    expect(dup.campo).toBe("nombre");
    const otra = await crearCategoria(e.admin, { nombre: "Curación" });
    const dup2 = await esperarError(actualizarCategoria(e.admin, { id: otra.id, nombre: "GENERAL" }), "DUPLICADO");
    expect(dup2.campo).toBe("nombre");
    await actualizarCategoria(e.admin, { id: otra.id, nombre: "Curaciones" });
    expect((await ultimaAuditoria("CATEGORIA_ACTUALIZADA"))?.detalle).toMatchObject({
      cambios: { nombre: { antes: "Curación", despues: "Curaciones" } },
    });
  });

  it("no elimina una categoría con insumos; sí una vacía", async () => {
    const error = await esperarError(eliminarCategoria(e.admin, categoriaId), "EN_USO");
    expect(error.message).toContain("4 insumos");
    const vacia = await crearCategoria(e.admin, { nombre: "Temporal" });
    await eliminarCategoria(e.admin, vacia.id);
    expect(await db.categoria.count()).toBe(1);
    expect(await ultimaAuditoria("CATEGORIA_ELIMINADA")).toMatchObject({ entidadId: vacia.id });
  });
});

// ---------------------------------------------------------------------------
describe("centros y ubicaciones", () => {
  it("crea un centro con RUT normalizado y una bodega inicial", async () => {
    const centro = await crearCentro(e.admin, { ...centroBase, institucionId: e.institucion });
    const ficha = await obtenerCentroAdmin(e.admin, centro.id);
    expect(ficha).toMatchObject({ rut: "76543210-3", comuna: "Temuco", activo: true, existencias: 0 });
    expect(ficha.ubicaciones).toMatchObject([{ nombre: "Bodega principal", tipo: "BODEGA", activo: true }]);
  });

  it("valida RUT, región y nombre único", async () => {
    const error = await esperarError(crearCentro(e.admin, { ...centroBase, institucionId: e.institucion, rut: "76.543.210-9", region: "Narnia" }), "VALIDACION");
    expect(Object.keys(error.detalle?.erroresCampo as object).sort()).toEqual(["region", "rut"]);
    const dup = await esperarError(crearCentro(e.admin, { ...centroBase, institucionId: e.institucion, nombre: "centro a" }), "DUPLICADO");
    expect(dup.campo).toBe("nombre");
    // El RUT es opcional.
    await crearCentro(e.admin, { ...centroBase, institucionId: e.institucion, rut: "" });
  });

  it("no desactiva un centro con existencias ni el último centro activo", async () => {
    await registrarIngreso(e.admin, { ubicacionId: e.bodegaA, insumoId: e.tela, numeroLote: "T1", cantidad: 8 });
    const error = await esperarError(establecerCentroActivo(e.admin, e.centroA, false), "EN_USO");
    expect(error.message).toContain("8 unidades");

    await establecerCentroActivo(e.admin, e.centroB, false);
    expect((await listarCentrosAdmin(e.admin)).map((c) => [c.nombre, c.activo])).toEqual([
      ["Centro A", true],
      ["Centro B", false],
    ]);
    const lote = await db.lote.findFirstOrThrow({ where: { numeroLote: "T1" } });
    await registrarMerma(e.admin, { ubicacionId: e.bodegaA, loteId: lote.id, cantidad: 8, motivo: "Daño o rotura" });
    await esperarError(establecerCentroActivo(e.admin, e.centroA, false), "OPERACION_INVALIDA");
  });

  it("ubicaciones: nombre único dentro del centro (se puede repetir en otro centro)", async () => {
    const dup = await esperarError(crearUbicacion(e.admin, { centroId: e.centroA, nombre: "bodega", tipo: "BODEGA" }), "DUPLICADO");
    expect(dup.campo).toBe("nombre");
    const refri = await crearUbicacion(e.admin, { centroId: e.centroA, nombre: "Refrigerador 1", tipo: "REFRIGERADO", descripcion: "2 a 8 °C" });
    await crearUbicacion(e.admin, { centroId: e.centroB, nombre: "Refrigerador 1", tipo: "REFRIGERADO" });
    const dup2 = await esperarError(actualizarUbicacion(e.admin, { id: refri.id, nombre: "Sala 1", tipo: "SALA" }), "DUPLICADO");
    expect(dup2.campo).toBe("nombre");
    await actualizarUbicacion(e.admin, { id: refri.id, nombre: "Refrigerador de vacunas", tipo: "REFRIGERADO" });
    expect((await ultimaAuditoria("UBICACION_ACTUALIZADA"))?.detalle).toMatchObject({
      centro: "Centro A",
      cambios: { nombre: { despues: "Refrigerador de vacunas" }, descripcion: { antes: "2 a 8 °C", despues: null } },
    });
  });

  it("no desactiva una ubicación con existencias > 0; sí cuando queda en cero", async () => {
    const ingreso = await registrarIngreso(e.admin, {
      ubicacionId: e.salaA, insumoId: e.guantes, numeroLote: "G1", fechaVencimiento: e.dia(120), cantidad: 12,
    });
    const error = await esperarError(establecerUbicacionActiva(e.admin, e.salaA, false), "EN_USO");
    expect(error.message).toContain("12 unidades");
    expect(error.detalle).toMatchObject({ existencias: 12 });
    expect((await db.ubicacion.findUniqueOrThrow({ where: { id: e.salaA } })).activo).toBe(true);

    await registrarMerma(e.admin, { ubicacionId: e.salaA, loteId: ingreso.movimiento.loteId, cantidad: 12, motivo: "Vencimiento" });
    const r = await establecerUbicacionActiva(e.admin, e.salaA, false);
    expect(r).toMatchObject({ activo: false, centroId: e.centroA });
    expect(await ultimaAuditoria("UBICACION_DESACTIVADA")).toMatchObject({ entidadId: e.salaA });

    await establecerUbicacionActiva(e.admin, e.salaA, true);
    expect((await db.ubicacion.findUniqueOrThrow({ where: { id: e.salaA } })).activo).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("proveedores", () => {
  it("guarda el RUT normalizado y rechaza RUT inválido o duplicado como error de campo", async () => {
    const p = await crearProveedor(e.admin, { rut: "77.345.678-K", razonSocial: "Insumos del Sur Ltda.", email: "Ventas@Sur.CL", telefono: "" });
    expect(p.rut).toBe("77345678-K");
    expect(await db.proveedor.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ email: "ventas@sur.cl", telefono: null });

    const invalido = await esperarError(crearProveedor(e.admin, { rut: "77.345.678-1", razonSocial: "X" }), "VALIDACION");
    expect(invalido.detalle?.erroresCampo).toHaveProperty("rut");
    const dup = await esperarError(crearProveedor(e.admin, { rut: "77345678k", razonSocial: "Otro" }), "DUPLICADO");
    expect(dup.campo).toBe("rut");
    expect(dup.message).toContain("77.345.678-K");
    const dup2 = await esperarError(actualizarProveedor(e.admin, { id: p.id, rut: "76.123.456-0", razonSocial: "Otro" }), "DUPLICADO");
    expect(dup2.campo).toBe("rut");
    const email = await esperarError(crearProveedor(e.admin, { rut: "78.111.222-4", razonSocial: "X", email: "no-es-email" }), "VALIDACION");
    expect(email.detalle?.erroresCampo).toHaveProperty("email");
  });

  it("busca por RUT con o sin puntos y por razón social sin tildes", async () => {
    await crearProveedor(e.admin, { rut: "77.345.678-K", razonSocial: "Farmacéutica Andina SpA" });
    expect((await listarProveedoresAdmin(e.admin, { texto: "77.345.678" })).items.map((p) => p.razonSocial)).toEqual(["Farmacéutica Andina SpA"]);
    expect((await listarProveedoresAdmin(e.admin, { texto: "farmaceutica" })).total).toBe(1);
    expect((await listarProveedoresAdmin(e.admin)).total).toBe(2);
  });

  it("un proveedor desactivado no se puede usar en ingresos", async () => {
    await establecerProveedorActivo(e.admin, e.proveedor, false);
    await esperarError(
      registrarIngreso(e.admin, { ubicacionId: e.bodegaA, insumoId: e.tela, numeroLote: "T1", cantidad: 1, proveedorId: e.proveedor }),
      "INACTIVO",
    );
    expect((await listarProveedoresAdmin(e.admin, { estado: "inactivos" })).total).toBe(1);
    expect(await ultimaAuditoria("PROVEEDOR_DESACTIVADO")).toMatchObject({ entidadId: e.proveedor });
  });
});

// ---------------------------------------------------------------------------
describe("usuarios", () => {
  const nuevo = () => ({ nombre: "Paula Muñoz", email: " Paula.Munoz@Test.CL ", rol: "BODEGUERO" as const, centroIds: [e.centroA] });

  it("la contraseña temporal es aleatoria y cumple la política", () => {
    const claves = new Set(Array.from({ length: 50 }, () => generarPasswordTemporal()));
    expect(claves.size).toBe(50);
    for (const clave of claves) {
      expect(clave).toMatch(/^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/);
      expect(/[A-Za-z]/.test(clave) && /\d/.test(clave)).toBe(true);
    }
  });

  it("crea el usuario con contraseña temporal de un solo uso y cambio obligatorio", async () => {
    const creado = await crearUsuario(e.admin, nuevo());
    expect(creado.email).toBe("paula.munoz@test.cl");
    const guardado = await db.usuario.findUniqueOrThrow({ where: { id: creado.id }, include: { centros: true } });
    expect(guardado).toMatchObject({ rol: "BODEGUERO", activo: true, debeCambiarPassword: true });
    expect(guardado.centros.map((c) => c.centroId)).toEqual([e.centroA]);
    expect(guardado.passwordHash).not.toContain(creado.passwordTemporal);
    expect(await verificarPassword(guardado.passwordHash, creado.passwordTemporal)).toBe(true);

    const sesion = await iniciarSesion("paula.munoz@test.cl", creado.passwordTemporal);
    expect(sesion.usuario.debeCambiarPassword).toBe(true);

    // La contraseña nunca queda en la auditoría.
    const auditoria = await ultimaAuditoria("USUARIO_CREADO");
    expect(JSON.stringify(auditoria?.detalle)).not.toContain(creado.passwordTemporal);
    expect(auditoria?.detalle).toMatchObject({ rol: "BODEGUERO", centros: ["Centro A"] });
  });

  it("email único (normalizado) como error del campo, y centros obligatorios salvo para ADMIN", async () => {
    await crearUsuario(e.admin, nuevo());
    const dup = await esperarError(crearUsuario(e.admin, { ...nuevo(), email: "PAULA.MUNOZ@test.cl" }), "DUPLICADO");
    expect(dup.campo).toBe("email");
    const sinCentro = await esperarError(crearUsuario(e.admin, { ...nuevo(), email: "otra@test.cl", centroIds: [] }), "VALIDACION");
    expect(sinCentro.detalle?.erroresCampo).toHaveProperty("centroIds");
    const inexistente = await esperarError(crearUsuario(e.admin, { ...nuevo(), email: "otra@test.cl", centroIds: ["no-existe"] }), "NO_ENCONTRADO");
    expect(inexistente.campo).toBe("centroIds");

    const admin2 = await crearUsuario(e.admin, { nombre: "Rosa Díaz", email: "rosa@test.cl", rol: "ADMIN_RED", centroIds: [e.centroA] });
    expect(await db.usuarioCentro.count({ where: { usuarioId: admin2.id } })).toBe(0);
  });

  it("editar rol o centros cierra las sesiones del usuario; editar solo el nombre no", async () => {
    const creado = await crearUsuario(e.admin, nuevo());
    const { token } = await iniciarSesion(creado.email, creado.passwordTemporal);

    const soloNombre = await actualizarUsuario(e.admin, { id: creado.id, nombre: "Paula Muñoz Reyes", email: creado.email, rol: "BODEGUERO", centroIds: [e.centroA] });
    expect(soloNombre.sesionesCerradas).toBe(0);
    expect(await validarTokenSesion(token)).not.toBeNull();

    const cambio = await actualizarUsuario(e.admin, { id: creado.id, nombre: "Paula Muñoz Reyes", email: creado.email, rol: "VISITANTE", centroIds: [e.centroA, e.centroB] });
    expect(cambio.sesionesCerradas).toBe(1);
    expect(await validarTokenSesion(token)).toBeNull();
    expect((await ultimaAuditoria("USUARIO_ACTUALIZADO"))?.detalle).toMatchObject({
      cambios: {
        rol: { antes: "BODEGUERO", despues: "VISITANTE" },
        centros: { antes: ["Centro A"], despues: ["Centro A", "Centro B"] },
      },
    });

    const dup = await esperarError(
      actualizarUsuario(e.admin, { id: creado.id, nombre: "Paula", email: "bodega@test.cl", rol: "VISITANTE", centroIds: [e.centroA] }),
      "DUPLICADO",
    );
    expect(dup.campo).toBe("email");
  });

  it("un admin no puede desactivarse ni quitarse el rol a sí mismo", async () => {
    await crearUsuario(e.admin, { nombre: "Rosa Díaz", email: "rosa@test.cl", rol: "ADMIN_RED" }); // hay otro admin: igual se rechaza
    await esperarError(establecerUsuarioActivo(e.admin, e.admin.usuarioId, false), "OPERACION_INVALIDA");
    const error = await esperarError(
      actualizarUsuario(e.admin, { id: e.admin.usuarioId, nombre: "Admin", email: "admin@test.cl", rol: "BODEGUERO", centroIds: [e.centroA] }),
      "OPERACION_INVALIDA",
    );
    expect(error.campo).toBe("rol");
    expect(await db.usuario.findUniqueOrThrow({ where: { id: e.admin.usuarioId } })).toMatchObject({ rol: "ADMIN_RED", activo: true });
    // Sí puede editar sus otros datos sin perder la sesión.
    const r = await actualizarUsuario(e.admin, { id: e.admin.usuarioId, nombre: "Admin Principal", email: "admin@test.cl", rol: "ADMIN_RED" });
    expect(r).toMatchObject({ nombre: "Admin Principal", sesionesCerradas: 0 });
  });

  it("la red nunca queda sin un ADMIN activo", async () => {
    // Un segundo administrador cuya cuenta fue desactivada, pero que aún conserva una identidad de ADMIN
    // (p. ej. una solicitud en curso): no puede dejar la red sin administradores activos.
    const rosa = await crearUsuario(e.admin, { nombre: "Rosa Díaz", email: "rosa@test.cl", rol: "ADMIN_RED" });
    const actorRosa: Actor = { usuarioId: rosa.id, rol: "ADMIN_RED", institucionId: null, centroIds: [] };
    await establecerUsuarioActivo(e.admin, rosa.id, false);

    await esperarError(establecerUsuarioActivo(actorRosa, e.admin.usuarioId, false), "OPERACION_INVALIDA");
    await esperarError(
      actualizarUsuario(actorRosa, { id: e.admin.usuarioId, nombre: "Admin", email: "admin@test.cl", rol: "VISITANTE", centroIds: [e.centroA] }),
      "OPERACION_INVALIDA",
    );
    expect(await db.usuario.count({ where: { rol: "ADMIN_RED", activo: true } })).toBe(1);

    // Con otro administrador activo sí se puede degradar o desactivar.
    await establecerUsuarioActivo(e.admin, rosa.id, true);
    await actualizarUsuario(actorRosa, { id: e.admin.usuarioId, nombre: "Admin", email: "admin@test.cl", rol: "VISITANTE", centroIds: [e.centroA] });
    expect(await db.usuario.count({ where: { rol: "ADMIN_RED", activo: true } })).toBe(1);
    // Ahora Rosa es la única administradora activa: tampoco se la puede desactivar.
    await esperarError(establecerUsuarioActivo(e.admin, rosa.id, false), "OPERACION_INVALIDA");
  });

  it("dos desactivaciones cruzadas simultáneas no dejan la red sin administrador", async () => {
    const rosa = await crearUsuario(e.admin, { nombre: "Rosa Díaz", email: "rosa@test.cl", rol: "ADMIN_RED" });
    const actorRosa: Actor = { usuarioId: rosa.id, rol: "ADMIN_RED", institucionId: null, centroIds: [] };
    const resultados = await Promise.allSettled([
      establecerUsuarioActivo(e.admin, rosa.id, false),
      establecerUsuarioActivo(actorRosa, e.admin.usuarioId, false),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.usuario.count({ where: { rol: "ADMIN_RED", activo: true } })).toBe(1);
  });

  it("desactivar invalida las sesiones y bloquea el ingreso; reactivar lo restituye", async () => {
    const creado = await crearUsuario(e.admin, nuevo());
    const { token } = await iniciarSesion(creado.email, creado.passwordTemporal);
    const r = await establecerUsuarioActivo(e.admin, creado.id, false);
    expect(r.sesionesCerradas).toBe(1);
    expect(await validarTokenSesion(token)).toBeNull();
    await esperarError(iniciarSesion(creado.email, creado.passwordTemporal), "CREDENCIALES_INVALIDAS");
    await esperarError(restablecerPasswordUsuario(e.admin, creado.id), "INACTIVO");
    await establecerUsuarioActivo(e.admin, creado.id, true);
    await iniciarSesion(creado.email, creado.passwordTemporal);
  });

  it("restablecer la contraseña entrega una nueva temporal, cierra sesiones y quita el bloqueo", async () => {
    const creado = await crearUsuario(e.admin, nuevo());
    const { token } = await iniciarSesion(creado.email, creado.passwordTemporal);
    await db.usuario.update({ where: { id: creado.id }, data: { debeCambiarPassword: false, bloqueadoHasta: new Date(Date.now() + 600_000) } });

    const r = await restablecerPasswordUsuario(e.admin, creado.id);
    expect(r.passwordTemporal).not.toBe(creado.passwordTemporal);
    expect(await validarTokenSesion(token)).toBeNull();
    await esperarError(iniciarSesion(creado.email, creado.passwordTemporal), "CREDENCIALES_INVALIDAS");
    const sesion = await iniciarSesion(creado.email, r.passwordTemporal);
    expect(sesion.usuario.debeCambiarPassword).toBe(true);
    expect(JSON.stringify((await ultimaAuditoria("USUARIO_PASSWORD_RESTABLECIDA"))?.detalle)).not.toContain(r.passwordTemporal);

    await esperarError(restablecerPasswordUsuario(e.admin, e.admin.usuarioId), "OPERACION_INVALIDA");
  });

  it("desbloquea una cuenta bloqueada por intentos fallidos", async () => {
    const creado = await crearUsuario(e.admin, nuevo());
    for (let i = 0; i < 5; i++) await esperarError(iniciarSesion(creado.email, "clave-incorrecta-1"), "CREDENCIALES_INVALIDAS");
    await esperarError(iniciarSesion(creado.email, creado.passwordTemporal), "CREDENCIALES_INVALIDAS");
    const lista = await listarUsuarios(e.admin, { texto: "paula" });
    expect(lista.items).toMatchObject([{ bloqueado: true, centros: [{ nombre: "Centro A" }] }]);

    await desbloquearUsuario(e.admin, creado.id);
    await iniciarSesion(creado.email, creado.passwordTemporal);
    expect((await listarUsuarios(e.admin, { texto: "paula" })).items[0]?.bloqueado).toBe(false);
    expect(await ultimaAuditoria("USUARIO_DESBLOQUEADO")).toMatchObject({ entidadId: creado.id });
  });

  it("lista con filtros por rol, estado y centro", async () => {
    expect((await listarUsuarios(e.admin)).total).toBe(4);
    expect((await listarUsuarios(e.admin, { rol: "BODEGUERO" })).total).toBe(2);
    expect((await listarUsuarios(e.admin, { centroId: e.centroB })).items.map((u) => u.email)).toEqual(["bodegab@test.cl"]);
    await establecerUsuarioActivo(e.admin, e.visitante.usuarioId, false);
    expect((await listarUsuarios(e.admin, { estado: "inactivos" })).items.map((u) => u.email)).toEqual(["visita@test.cl"]);
  });
});

// ---------------------------------------------------------------------------
describe("visor de auditoría", () => {
  it("filtra por usuario, acción, entidad y rango de fechas, del más reciente al más antiguo", async () => {
    const p = await crearProveedor(e.admin, { rut: "77.345.678-K", razonSocial: "Insumos del Sur Ltda." });
    await establecerProveedorActivo(e.admin, p.id, false);
    await crearCategoria(e.admin, { nombre: "Curación" });
    await db.registroAuditoria.create({
      data: { accion: "LOGIN_FALLIDO", entidad: "Usuario", detalle: { motivo: "email_desconocido" }, creadoEn: new Date("2026-01-10T15:00:00Z") },
    });

    const todo = await listarAuditoria(e.admin);
    expect(todo.total).toBe(4);
    expect(todo.items.map((f) => f.accion)).toEqual(["CATEGORIA_CREADA", "PROVEEDOR_DESACTIVADO", "PROVEEDOR_CREADO", "LOGIN_FALLIDO"]);
    expect(todo.items[0]?.usuario).toMatchObject({ id: e.admin.usuarioId, email: "admin@test.cl" });
    expect(todo.items[3]?.usuario).toBeNull();

    expect((await listarAuditoria(e.admin, { entidad: "Proveedor" })).total).toBe(2);
    expect((await listarAuditoria(e.admin, { entidad: "Proveedor", entidadId: p.id, accion: "PROVEEDOR_CREADO" })).total).toBe(1);
    expect((await listarAuditoria(e.admin, { usuarioId: e.admin.usuarioId })).total).toBe(3);
    expect((await listarAuditoria(e.admin, { desde: "2026-01-10", hasta: "2026-01-10" })).items.map((f) => f.accion)).toEqual(["LOGIN_FALLIDO"]);
    expect((await listarAuditoria(e.admin, { hasta: "2026-01-09" })).total).toBe(0);
    expect((await listarAuditoria(e.admin, { desde: "no-es-fecha" })).total).toBe(4);
    expect(await listarAuditoria(e.admin, { porPagina: 3, pagina: 2 })).toMatchObject({ total: 4, totalPaginas: 2, pagina: 2 });

    const opciones = await opcionesFiltroAuditoria(e.admin);
    expect(opciones.acciones).toEqual(["CATEGORIA_CREADA", "LOGIN_FALLIDO", "PROVEEDOR_CREADO", "PROVEEDOR_DESACTIVADO"]);
    expect(opciones.entidades).toEqual(["Categoria", "Proveedor", "Usuario"]);
    expect(opciones.usuarios).toHaveLength(4);
  });
});
