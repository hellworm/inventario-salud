import { beforeEach, describe, expect, it } from "vitest";
import type { CeldaCsv } from "@/lib/csv";
import type { Actor } from "@/lib/permisos";
import { alcanceDeCentros } from "@/server/autorizacion";
import { iniciarSesion, validarTokenSesion } from "@/server/auth/autenticacion";
import { db } from "@/server/db";
import {
  actualizarCategoria,
  actualizarCentro,
  actualizarInstitucion,
  actualizarInsumo,
  actualizarProveedor,
  actualizarUbicacion,
  actualizarUsuario,
  buscarInsumos,
  corregirVencimientoLote,
  crearCategoria,
  crearCentro,
  crearInstitucion,
  crearInsumo,
  crearProveedor,
  crearUbicacion,
  crearUsuario,
  desbloquearUsuario,
  detalleInsumo,
  eliminarCategoria,
  eliminarInsumo,
  establecerCentroActivo,
  establecerInstitucionActiva,
  establecerInsumoActivo,
  establecerUbicacionActiva,
  establecerUsuarioActivo,
  exportarConsumo,
  exportarExistencias,
  exportarMovimientos,
  exportarReposicion,
  exportarVencimientos,
  guardarParametrosStock,
  listaReposicion,
  listarAuditoria,
  listarCategoriasAdmin,
  listarCentrosAdmin,
  listarInstituciones,
  listarInsumosAdmin,
  listarInventario,
  listarMovimientos,
  listarOpcionesInstitucion,
  listarProveedoresAdmin,
  listarUbicaciones,
  listarUsuarios,
  lotesDeInsumo,
  lotesDisponibles,
  obtenerAlertas,
  obtenerCentroAdmin,
  obtenerInsumoAdmin,
  obtenerMovimiento,
  obtenerTraslado,
  opcionesFiltroAuditoria,
  registrarAjuste,
  registrarIngreso,
  registrarMerma,
  registrarRetiro,
  registrarTraslado,
  reporteConsumo,
  reporteExistencias,
  reporteMermas,
  reporteMovimientos,
  reporteVencimientos,
  restablecerPasswordUsuario,
  resumenPanel,
  resumenPorInstitucion,
  usuariosConMovimientos,
  type ExportacionCsv,
} from "@/server/servicios";
import {
  crearActor,
  crearEscenarioInstituciones,
  esperarError,
  stockInsumo,
  type EscenarioInstituciones,
} from "./soporte/escenario";

/**
 * Nivel Institución: aislamiento entre instituciones en TODOS los servicios,
 * límites del administrador de institución y salvaguardas.
 *
 * Escenario: institución A (centros A y B, `adminA`) e institución B (centro C,
 * `adminB`); `admin` es el administrador de la red. Cada institución tiene
 * stock, movimientos, mínimos, usuarios y auditoría propios.
 */

/** Marcas que solo existen en la institución B: si aparecen en un resultado de A, hay fuga. */
const LOTE_C = "LOTE-SOLO-C";
const LOTE_A = "LOTE-SOLO-A";

let e: EscenarioInstituciones;
let movimientoC: string;
let loteC: string;
let loteA: string;

async function leerFilas(exportacion: ExportacionCsv): Promise<CeldaCsv[][]> {
  const filas: CeldaCsv[][] = [];
  for await (const fila of exportacion.filas) filas.push(fila);
  return filas;
}

/** Texto completo de un resultado, para buscar fugas sin depender de su forma. */
const texto = (valor: unknown) => JSON.stringify(valor);

/** Afirma que el resultado no menciona nada de la institución B. */
function sinRastroDeB(valor: unknown): void {
  const t = texto(valor);
  expect(t).not.toContain("Centro C");
  expect(t).not.toContain(e.centroC);
  expect(t).not.toContain(e.bodegaC);
  expect(t).not.toContain(LOTE_C);
  expect(t).not.toContain("Institución Dos");
  expect(t).not.toContain("bodegac@test.cl");
  expect(t).not.toContain("admin.b@test.cl");
}

beforeEach(async () => {
  e = await crearEscenarioInstituciones();
  // Stock y movimientos en ambas instituciones (los registra el administrador de la red).
  const enA = await registrarIngreso(e.admin, {
    ubicacionId: e.bodegaA, insumoId: e.guantes, numeroLote: LOTE_A, fechaVencimiento: e.dia(20), cantidad: 50,
    proveedorId: e.proveedor,
  });
  loteA = enA.movimiento.loteId;
  const enC = await registrarIngreso(e.bodegueroC, {
    ubicacionId: e.bodegaC, insumoId: e.guantes, numeroLote: LOTE_C, fechaVencimiento: e.dia(25), cantidad: 70,
    proveedorId: e.proveedor,
  });
  movimientoC = enC.movimiento.id;
  loteC = enC.movimiento.loteId;
  await registrarRetiro(e.bodegueroC, { ubicacionId: e.bodegaC, insumoId: e.guantes, cantidad: 5, motivo: "Uso en C" });
  await registrarMerma(e.adminB, { ubicacionId: e.bodegaC, loteId: loteC, cantidad: 2, motivo: "Daño" });
  // Mínimos: alertas en ambas instituciones.
  await guardarParametrosStock(e.admin, {
    insumoId: e.guantes,
    parametros: [
      { centroId: e.centroA, stockMinimo: 500 },
      { centroId: e.centroC, stockMinimo: 900 },
    ],
  });
  await guardarParametrosStock(e.admin, { insumoId: e.dializador, parametros: [{ centroId: e.centroC, stockMinimo: 10 }] });
});

describe("sesión: el alcance del administrador de institución", () => {
  it("un ADMIN alcanza todos los centros de SU institución sin asignaciones, y ninguno más", async () => {
    const creado = await crearUsuario(e.admin, { nombre: "Admin Inst A", email: "nuevo.admin.a@test.cl", rol: "ADMIN", institucionId: e.institucionA });
    expect(await db.usuarioCentro.count({ where: { usuarioId: creado.id } })).toBe(0);
    const { token, usuario } = await iniciarSesion(creado.email, creado.passwordTemporal);
    expect(usuario).toMatchObject({ rol: "ADMIN", institucionId: e.institucionA, institucion: { nombre: "Institución Uno" } });
    expect([...usuario.centroIds].sort()).toEqual([e.centroA, e.centroB].sort());

    // Un centro nuevo de su institución entra al alcance en la solicitud siguiente; uno ajeno, nunca.
    const nuevo = await crearCentro(e.adminA, {
      nombre: "Centro A3", tipo: "CLINICA", direccion: "Calle 3", region: "Valparaíso", comuna: "Valparaíso",
    });
    const sesion = await validarTokenSesion(token);
    expect(sesion?.usuario.centroIds).toContain(nuevo.id);
    expect(sesion?.usuario.centroIds).not.toContain(e.centroC);
  });

  it("el administrador de la red no tiene institución y su alcance no se limita", async () => {
    const actor: Actor = e.admin;
    expect(actor.institucionId).toBeNull();
    expect(alcanceDeCentros(actor)).toBeNull();
    expect(alcanceDeCentros(e.adminA)?.sort()).toEqual([e.centroA, e.centroB].sort());
    expect(alcanceDeCentros(e.adminB)).toEqual([e.centroC]);
  });

  it("defensa en profundidad: una asignación a un centro de otra institución no da acceso", async () => {
    // Estado inválido forzado directo en la base (los servicios lo impiden).
    const creado = await crearUsuario(e.admin, { nombre: "Bodega Mixta", email: "mixta@test.cl", rol: "BODEGUERO", centroIds: [e.centroA] });
    await db.usuarioCentro.create({ data: { usuarioId: creado.id, centroId: e.centroC } });
    const { usuario } = await iniciarSesion(creado.email, creado.passwordTemporal);
    expect(usuario.centroIds).toEqual([e.centroA]);
  });

  it("la base impide un usuario sin institución que no sea ADMIN_RED, y un ADMIN_RED con institución", async () => {
    const base = { nombre: "X", passwordHash: "x" };
    await expect(db.usuario.create({ data: { ...base, email: "a1@test.cl", rol: "ADMIN" } })).rejects.toThrow(/usuarios_institucion_segun_rol/);
    await expect(db.usuario.create({ data: { ...base, email: "a2@test.cl", rol: "BODEGUERO" } })).rejects.toThrow(/usuarios_institucion_segun_rol/);
    await expect(
      db.usuario.create({ data: { ...base, email: "a3@test.cl", rol: "ADMIN_RED", institucionId: e.institucionA } }),
    ).rejects.toThrow(/usuarios_institucion_segun_rol/);
  });
});

describe("aislamiento de lectura: el ADMIN de la institución A no ve nada de la B", () => {
  it("control: el administrador de la red sí ve la institución B con las mismas consultas", async () => {
    expect(texto(await listarInventario(e.admin, { centroId: e.centroC }))).toContain(e.guantes);
    expect(texto(await listarMovimientos(e.admin))).toContain("Centro C");
    expect(texto(await obtenerAlertas(e.admin))).toContain("Centro C");
    expect(texto(await listarCentrosAdmin(e.admin))).toContain("Centro C");
    expect(texto(await listarUsuarios(e.admin))).toContain("bodegac@test.cl");
    expect(texto(await reporteExistencias(e.admin))).toContain(LOTE_C);
  });

  it("inventario, ficha del insumo, ubicaciones y lotes", async () => {
    const inventario = await listarInventario(e.adminA);
    sinRastroDeB(inventario);
    const guantes = inventario.items.find((i) => i.insumoId === e.guantes)!;
    expect(guantes.total).toBe(50); // solo lo de A (en C quedan 63)

    const ficha = await detalleInsumo(e.adminA, e.guantes);
    sinRastroDeB(ficha);
    expect(ficha.total).toBe(50);
    expect(ficha.existencias.map((x) => x.numeroLote)).toEqual([LOTE_A]);
    // El mínimo es la suma de SUS centros (500), no incluye el de C (900).
    expect(ficha.stockMinimo).toBe(500);

    sinRastroDeB(await listarUbicaciones(e.adminA));
    sinRastroDeB(await listarUbicaciones(e.adminA, { soloActivas: false }));
    expect((await lotesDeInsumo(e.adminA, e.guantes)).map((l) => l.numeroLote)).toEqual([LOTE_A]);
    expect((await lotesDeInsumo(e.adminB, e.guantes)).map((l) => l.numeroLote)).toEqual([LOTE_C]);

    await esperarError(listarInventario(e.adminA, { centroId: e.centroC }), "SIN_ACCESO_AL_CENTRO");
    await esperarError(detalleInsumo(e.adminA, e.guantes, { centroId: e.centroC }), "SIN_ACCESO_AL_CENTRO");
    await esperarError(listarUbicaciones(e.adminA, { centroId: e.centroC }), "SIN_ACCESO_AL_CENTRO");
    await esperarError(lotesDisponibles(e.adminA, { insumoId: e.guantes, ubicacionId: e.bodegaC }), "SIN_ACCESO_AL_CENTRO");
    await esperarError(
      buscarInsumos(e.adminA, { priorizarRetirosDeCentroId: e.centroC }),
      "SIN_ACCESO_AL_CENTRO",
    );
  });

  it("movimientos: historial, un movimiento por id, traslados y usuarios con movimientos", async () => {
    const historial = await listarMovimientos(e.adminA);
    sinRastroDeB(historial);
    expect(historial.total).toBe(1);
    expect(await obtenerMovimiento(e.adminA, movimientoC)).toBeNull();
    expect(await obtenerMovimiento(e.adminB, movimientoC)).not.toBeNull();
    sinRastroDeB(await usuariosConMovimientos(e.adminA));
    await esperarError(listarMovimientos(e.adminA, { centroId: e.centroC }), "SIN_ACCESO_AL_CENTRO");
    await esperarError(usuariosConMovimientos(e.adminA, { centroId: e.centroC }), "SIN_ACCESO_AL_CENTRO");
    // Filtrar por una ubicación, lote o usuario ajenos no abre nada.
    expect((await listarMovimientos(e.adminA, { ubicacionId: e.bodegaC })).total).toBe(0);
    expect((await listarMovimientos(e.adminA, { loteId: loteC })).total).toBe(0);
    expect((await listarMovimientos(e.adminA, { usuarioId: e.bodegueroC.usuarioId })).total).toBe(0);

    // Un traslado dentro de la institución B es invisible para A.
    const traslado = await registrarTraslado(e.adminB, {
      loteId: loteC, ubicacionOrigenId: e.bodegaC, ubicacionDestinoId: e.salaC, cantidad: 3,
    });
    expect(await obtenerTraslado(e.adminA, traslado.trasladoGrupoId)).toEqual([]);
    expect(await obtenerTraslado(e.adminB, traslado.trasladoGrupoId)).toHaveLength(2);
  });

  it("alertas, lista de reposición y panel", async () => {
    const alertas = await obtenerAlertas(e.adminA);
    sinRastroDeB(alertas);
    expect(alertas.stock.map((a) => a.centroId)).toEqual([e.centroA]);
    sinRastroDeB(await listaReposicion(e.adminA));
    const panel = await resumenPanel(e.adminA);
    sinRastroDeB(panel);
    expect(panel.unidadesTotales).toBe(50);
    expect(panel.porCentro.map((c) => c.centroId)).toEqual([e.centroA]);
    await esperarError(obtenerAlertas(e.adminA, { centroId: e.centroC }), "SIN_ACCESO_AL_CENTRO");
    await esperarError(listaReposicion(e.adminA, { centroId: e.centroC }), "SIN_ACCESO_AL_CENTRO");
    await esperarError(resumenPanel(e.adminA, { centroId: e.centroC }), "SIN_ACCESO_AL_CENTRO");
    // El resumen de la red por institución es solo del administrador de la red.
    await esperarError(resumenPorInstitucion(e.adminA, panel.porCentro), "SIN_PERMISO");
    await esperarError(resumenPorInstitucion(e.bodeguero, []), "SIN_PERMISO");
  });

  it("reportes: existencias, vencimientos, movimientos, mermas y consumo", async () => {
    for (const reporte of [reporteExistencias, reporteVencimientos, reporteMovimientos, reporteMermas, reporteConsumo]) {
      sinRastroDeB(await reporte(e.adminA));
      await esperarError(reporte(e.adminA, { centroId: e.centroC }), "SIN_ACCESO_AL_CENTRO");
    }
    // Control: la institución B sí ve su merma y su consumo.
    expect((await reporteMermas(e.adminB)).total).toBe(1);
    expect((await reporteMermas(e.adminA)).total).toBe(0);
    expect(texto(await reporteConsumo(e.adminB))).toContain(e.guantes);
  });

  it("exportaciones CSV: ninguna fila de la otra institución, y un centro ajeno se rechaza", async () => {
    const exportaciones = [exportarExistencias, exportarVencimientos, exportarMovimientos, exportarConsumo, exportarReposicion];
    for (const exportar of exportaciones) {
      sinRastroDeB(await leerFilas(await exportar(e.adminA)));
      await esperarError(exportar(e.adminA, { centroId: e.centroC }), "SIN_ACCESO_AL_CENTRO");
    }
    // Control: las mismas exportaciones, para la red, sí traen el centro C.
    expect(texto(await leerFilas(await exportarExistencias(e.admin)))).toContain("Centro C");
    expect(texto(await leerFilas(await exportarMovimientos(e.admin)))).toContain("Centro C");
    // La exportación queda auditada en la institución de quien exporta.
    const auditadas = await db.registroAuditoria.findMany({ where: { accion: "REPORTE_EXPORTADO", usuarioId: e.adminA.usuarioId } });
    expect(auditadas.length).toBe(exportaciones.length);
    expect(new Set(auditadas.map((a) => a.institucionId))).toEqual(new Set([e.institucionA]));
  });

  it("administración: centros, usuarios, instituciones, insumos y parámetros", async () => {
    const centros = await listarCentrosAdmin(e.adminA);
    sinRastroDeB(centros);
    expect(centros.map((c) => c.nombre).sort()).toEqual(["Centro A", "Centro B"]);
    // Pedir "los de la institución B" no cambia el alcance.
    expect(await listarCentrosAdmin(e.adminA, { institucionId: e.institucionB })).toEqual([]);
    await esperarError(obtenerCentroAdmin(e.adminA, e.centroC), "NO_ENCONTRADO");
    expect((await obtenerCentroAdmin(e.adminB, e.centroC)).nombre).toBe("Centro C");

    const usuarios = await listarUsuarios(e.adminA, { porPagina: 100 });
    sinRastroDeB(usuarios);
    // Ni usuarios de B ni administradores de la red.
    expect(usuarios.items.every((u) => u.institucionId === e.institucionA)).toBe(true);
    expect(usuarios.items.map((u) => u.email)).not.toContain("admin@test.cl");
    expect((await listarUsuarios(e.adminA, { institucionId: e.institucionB })).total).toBe(0);
    expect((await listarUsuarios(e.adminA, { centroId: e.centroC })).total).toBe(0);
    expect((await listarUsuarios(e.adminA, { texto: "bodegac" })).total).toBe(0);
    expect((await listarUsuarios(e.adminA, { rol: "ADMIN_RED" })).total).toBe(0);

    expect((await listarOpcionesInstitucion(e.adminA)).map((i) => i.id)).toEqual([e.institucionA]);
    expect((await listarOpcionesInstitucion(e.admin)).map((i) => i.id).sort()).toEqual([e.institucionA, e.institucionB].sort());
    await esperarError(listarOpcionesInstitucion(e.bodeguero), "SIN_PERMISO");
    await esperarError(listarInstituciones(e.adminA), "SIN_PERMISO");

    // Catálogo compartido: ve el insumo, pero stock y parámetros solo de SUS centros.
    const insumo = await obtenerInsumoAdmin(e.adminA, e.guantes);
    sinRastroDeB(insumo);
    expect(insumo.stockTotal).toBe(50);
    expect(insumo.parametros.map((p) => p.centro).sort()).toEqual(["Centro A", "Centro B"]);
    const enRed = await obtenerInsumoAdmin(e.admin, e.guantes);
    expect(enRed.stockTotal).toBe(113);
    expect(enRed.parametros.map((p) => p.centro).sort()).toEqual(["Centro A", "Centro B", "Centro C"]);
    const lista = await listarInsumosAdmin(e.adminA);
    expect(lista.items.find((i) => i.id === e.guantes)!.centrosConParametro).toBe(1);
    expect(lista.items.find((i) => i.id === e.dializador)!.centrosConParametro).toBe(0); // su único mínimo es de C
    expect((await listarInsumosAdmin(e.admin)).items.find((i) => i.id === e.guantes)!.centrosConParametro).toBe(2);
    // Las categorías y los proveedores son comunes: sí los ve.
    expect((await listarCategoriasAdmin(e.adminA)).length).toBeGreaterThan(0);
    expect((await listarProveedoresAdmin(e.adminA)).total).toBe(1);
  });
});

describe("aislamiento de escritura: el ADMIN de la institución A no puede mutar nada de la B", () => {
  it("movimientos de stock en un centro ajeno: todo rechazado, sin tocar el stock", async () => {
    const antes = await stockInsumo(e.guantes, e.bodegaC);
    await esperarError(
      registrarIngreso(e.adminA, { ubicacionId: e.bodegaC, insumoId: e.guantes, numeroLote: "X1", fechaVencimiento: e.dia(90), cantidad: 1 }),
      "SIN_ACCESO_AL_CENTRO",
    );
    await esperarError(registrarRetiro(e.adminA, { ubicacionId: e.bodegaC, insumoId: e.guantes, cantidad: 1 }), "SIN_ACCESO_AL_CENTRO");
    await esperarError(
      registrarAjuste(e.adminA, { ubicacionId: e.bodegaC, loteId: loteC, sentido: "NEGATIVO", cantidad: 1, motivo: "Conteo" }),
      "SIN_ACCESO_AL_CENTRO",
    );
    await esperarError(registrarMerma(e.adminA, { ubicacionId: e.bodegaC, loteId: loteC, cantidad: 1, motivo: "Daño" }), "SIN_ACCESO_AL_CENTRO");
    expect(await stockInsumo(e.guantes, e.bodegaC)).toBe(antes);
    expect(await db.movimiento.count({ where: { usuarioId: e.adminA.usuarioId } })).toBe(0);
  });

  it("traslados: ni hacia ni desde otra institución; dentro de la propia sí", async () => {
    await esperarError(
      registrarTraslado(e.adminA, { loteId: loteA, ubicacionOrigenId: e.bodegaA, ubicacionDestinoId: e.bodegaC, cantidad: 5 }),
      "SIN_ACCESO_AL_CENTRO",
    );
    await esperarError(
      registrarTraslado(e.adminA, { loteId: loteC, ubicacionOrigenId: e.bodegaC, ubicacionDestinoId: e.bodegaA, cantidad: 5 }),
      "SIN_ACCESO_AL_CENTRO",
    );
    // Tampoco el administrador de la red: el stock no cruza instituciones.
    const error = await esperarError(
      registrarTraslado(e.admin, { loteId: loteA, ubicacionOrigenId: e.bodegaA, ubicacionDestinoId: e.bodegaC, cantidad: 5 }),
      "TRASLADO_INVALIDO",
    );
    expect(error.campo).toBe("ubicacionDestinoId");
    expect(await stockInsumo(e.guantes, e.bodegaA)).toBe(50);
    expect(await stockInsumo(e.guantes, e.bodegaC)).toBe(63);

    // Entre centros de la MISMA institución sí (A → B), sin asignación centro a centro.
    const ok = await registrarTraslado(e.adminA, { loteId: loteA, ubicacionOrigenId: e.bodegaA, ubicacionDestinoId: e.bodegaB, cantidad: 5 });
    expect(ok.entrada.centroId).toBe(e.centroB);
    expect(await stockInsumo(e.guantes, e.bodegaB)).toBe(5);
  });

  it("centros y ubicaciones ajenos: para él no existen", async () => {
    const datosCentro = { nombre: "Centro C renombrado", tipo: "CLINICA" as const, direccion: "X 1", region: "Biobío", comuna: "Concepción" };
    await esperarError(actualizarCentro(e.adminA, { id: e.centroC, ...datosCentro }), "NO_ENCONTRADO");
    await esperarError(establecerCentroActivo(e.adminA, e.centroC, false), "NO_ENCONTRADO");
    await esperarError(crearUbicacion(e.adminA, { centroId: e.centroC, nombre: "Intrusa", tipo: "BODEGA" }), "NO_ENCONTRADO");
    await esperarError(actualizarUbicacion(e.adminA, { id: e.bodegaC, nombre: "Otra", tipo: "SALA" }), "NO_ENCONTRADO");
    await esperarError(establecerUbicacionActiva(e.adminA, e.salaC, false), "NO_ENCONTRADO");
    expect(await db.centro.findUniqueOrThrow({ where: { id: e.centroC } })).toMatchObject({ nombre: "Centro C", activo: true });
    expect(await db.ubicacion.count({ where: { centroId: e.centroC } })).toBe(2);
    expect(await db.ubicacion.findUniqueOrThrow({ where: { id: e.salaC } })).toMatchObject({ nombre: "Sala 1", activo: true });
  });

  it("crear centros: solo en su institución; no puede crearlos en otra ni mover uno existente", async () => {
    const datos = { nombre: "Centro Nuevo", tipo: "CLINICA" as const, direccion: "Calle 9", region: "Valparaíso", comuna: "Valparaíso" };
    await esperarError(crearCentro(e.adminA, { ...datos, institucionId: e.institucionB }), "NO_ENCONTRADO");
    expect(await db.centro.count({ where: { nombre: "Centro Nuevo" } })).toBe(0);
    const creado = await crearCentro(e.adminA, datos); // sin indicar institución: la suya
    expect((await db.centro.findUniqueOrThrow({ where: { id: creado.id } })).institucionId).toBe(e.institucionA);
    // Editar no admite cambiar la institución: el campo se ignora (no es parte del esquema).
    await actualizarCentro(e.adminA, { id: creado.id, ...datos, nombre: "Centro Nuevo 2", institucionId: e.institucionB } as never);
    expect(await db.centro.findUniqueOrThrow({ where: { id: creado.id } })).toMatchObject({ nombre: "Centro Nuevo 2", institucionId: e.institucionA });
    // El administrador de la red debe indicar la institución.
    const sinInstitucion = await esperarError(crearCentro(e.admin, { ...datos, nombre: "Otro" }), "VALIDACION");
    expect(sinInstitucion.campo).toBe("institucionId");
    const enB = await crearCentro(e.admin, { ...datos, nombre: "Centro D", institucionId: e.institucionB });
    expect((await db.centro.findUniqueOrThrow({ where: { id: enB.id } })).institucionId).toBe(e.institucionB);
  });

  it("parámetros de stock: un centro ajeno en la entrada rechaza TODO", async () => {
    await esperarError(
      guardarParametrosStock(e.adminA, { insumoId: e.guantes, parametros: [{ centroId: e.centroC, stockMinimo: 1 }] }),
      "SIN_ACCESO_AL_CENTRO",
    );
    await esperarError(
      guardarParametrosStock(e.adminA, {
        insumoId: e.guantes,
        parametros: [
          { centroId: e.centroB, stockMinimo: 77 },
          { centroId: e.centroC, stockMinimo: 1 },
        ],
      }),
      "SIN_ACCESO_AL_CENTRO",
    );
    const guardados = await db.parametroStock.findMany({ where: { insumoId: e.guantes }, orderBy: { stockMinimo: "asc" } });
    expect(guardados.map((p) => [p.centroId, p.stockMinimo])).toEqual([
      [e.centroA, 500],
      [e.centroC, 900],
    ]);
    // En sus centros sí, y queda auditado en su institución.
    const r = await guardarParametrosStock(e.adminA, { insumoId: e.guantes, parametros: [{ centroId: e.centroB, stockMinimo: 77, stockMaximo: 200 }] });
    expect(r.actualizados).toBe(1);
    const auditoria = await db.registroAuditoria.findFirstOrThrow({
      where: { accion: "PARAMETROS_STOCK_ACTUALIZADOS", usuarioId: e.adminA.usuarioId },
    });
    expect(auditoria.institucionId).toBe(e.institucionA);
  });

  it("usuarios: no crea ADMIN_RED, ni en otra institución, ni con centros ajenos", async () => {
    const base = { nombre: "Persona Nueva", email: "persona@test.cl" };
    const escalar = await esperarError(crearUsuario(e.adminA, { ...base, rol: "ADMIN_RED" }), "SIN_PERMISO");
    expect(escalar.campo).toBe("rol");
    await esperarError(crearUsuario(e.adminA, { ...base, rol: "BODEGUERO", centroIds: [e.centroC] }), "NO_ENCONTRADO");
    await esperarError(crearUsuario(e.adminA, { ...base, rol: "BODEGUERO", centroIds: [e.centroA, e.centroC] }), "NO_ENCONTRADO");
    await esperarError(
      crearUsuario(e.adminA, { ...base, rol: "BODEGUERO", institucionId: e.institucionB, centroIds: [e.centroC] }),
      "NO_ENCONTRADO",
    );
    await esperarError(crearUsuario(e.adminA, { ...base, rol: "ADMIN", institucionId: e.institucionB }), "NO_ENCONTRADO");
    expect(await db.usuario.count({ where: { email: "persona@test.cl" } })).toBe(0);
    expect(await db.usuario.count({ where: { rol: "ADMIN_RED" } })).toBe(1);

    // Lo que sí puede: ADMIN, BODEGUERO y VISITANTE de SU institución.
    const bodeguero = await crearUsuario(e.adminA, { ...base, rol: "BODEGUERO", centroIds: [e.centroA, e.centroB] });
    expect(await db.usuario.findUniqueOrThrow({ where: { id: bodeguero.id } })).toMatchObject({ rol: "BODEGUERO", institucionId: e.institucionA });
    const colega = await crearUsuario(e.adminA, { nombre: "Colega Admin", email: "colega@test.cl", rol: "ADMIN", centroIds: [e.centroC] });
    expect(await db.usuario.findUniqueOrThrow({ where: { id: colega.id } })).toMatchObject({ rol: "ADMIN", institucionId: e.institucionA });
    expect(await db.usuarioCentro.count({ where: { usuarioId: colega.id } })).toBe(0); // los centros de un ADMIN se ignoran
    const auditoria = await db.registroAuditoria.findFirstOrThrow({ where: { accion: "USUARIO_CREADO", entidadId: bodeguero.id } });
    expect(auditoria.institucionId).toBe(e.institucionA);
  });

  it("usuarios ajenos (de otra institución o administradores de la red): para él no existen", async () => {
    const ajenos = [e.bodegueroC.usuarioId, e.adminB.usuarioId, e.admin.usuarioId];
    for (const id of ajenos) {
      await esperarError(
        actualizarUsuario(e.adminA, { id, nombre: "Tomado", email: "tomado@test.cl", rol: "VISITANTE", centroIds: [e.centroA] }),
        "NO_ENCONTRADO",
      );
      await esperarError(establecerUsuarioActivo(e.adminA, id, false), "NO_ENCONTRADO");
      await esperarError(restablecerPasswordUsuario(e.adminA, id), "NO_ENCONTRADO");
      await esperarError(desbloquearUsuario(e.adminA, id), "NO_ENCONTRADO");
    }
    const intactos = await db.usuario.findMany({ where: { id: { in: ajenos } }, select: { email: true, activo: true, debeCambiarPassword: true } });
    expect(intactos.map((u) => u.email).sort()).toEqual(["admin.b@test.cl", "admin@test.cl", "bodegac@test.cl"]);
    expect(intactos.every((u) => u.activo && !u.debeCambiarPassword)).toBe(true);
    expect(await db.usuario.count({ where: { email: "tomado@test.cl" } })).toBe(0);
  });

  it("usuarios propios: no los escala a ADMIN_RED, no les asigna centros ajenos ni los mueve de institución", async () => {
    const id = e.bodeguero.usuarioId;
    const datos = { id, nombre: "Bodega", email: "bodega@test.cl" };
    const escalar = await esperarError(actualizarUsuario(e.adminA, { ...datos, rol: "ADMIN_RED" }), "SIN_PERMISO");
    expect(escalar.campo).toBe("rol");
    await esperarError(actualizarUsuario(e.adminA, { ...datos, rol: "BODEGUERO", centroIds: [e.centroC] }), "NO_ENCONTRADO");
    await esperarError(
      actualizarUsuario(e.adminA, { ...datos, rol: "BODEGUERO", institucionId: e.institucionB, centroIds: [e.centroC] }),
      "NO_ENCONTRADO",
    );
    // Ni siquiera el administrador de la red mueve a un usuario de institución.
    const mover = await esperarError(
      actualizarUsuario(e.admin, { ...datos, rol: "BODEGUERO", institucionId: e.institucionB, centroIds: [e.centroC] }),
      "OPERACION_INVALIDA",
    );
    expect(mover.campo).toBe("institucionId");
    expect(await db.usuario.findUniqueOrThrow({ where: { id }, include: { centros: true } })).toMatchObject({
      rol: "BODEGUERO",
      institucionId: e.institucionA,
      centros: [{ centroId: e.centroA }],
    });
    // Sí puede gestionarlo dentro de su institución (p. ej. promoverlo a ADMIN de la institución).
    await actualizarUsuario(e.adminA, { ...datos, rol: "ADMIN" });
    expect(await db.usuario.findUniqueOrThrow({ where: { id } })).toMatchObject({ rol: "ADMIN", institucionId: e.institucionA });
  });

  it("catálogo compartido: crea insumos y categorías, pero no modifica ni elimina los existentes", async () => {
    const categoria = await db.categoria.findFirstOrThrow();
    const guantes = await db.insumo.findUniqueOrThrow({ where: { id: e.guantes } });
    const datosInsumo = { codigo: guantes.codigo, nombre: "Cambiado", categoriaId: categoria.id, unidadMedida: "unidad" };
    await esperarError(actualizarInsumo(e.adminA, { id: e.guantes, ...datosInsumo }), "SIN_PERMISO");
    await esperarError(establecerInsumoActivo(e.adminA, e.guantes, false), "SIN_PERMISO");
    await esperarError(eliminarInsumo(e.adminA, e.insumoInactivo), "SIN_PERMISO");
    await esperarError(actualizarCategoria(e.adminA, { id: categoria.id, nombre: "Otra" }), "SIN_PERMISO");
    await esperarError(eliminarCategoria(e.adminA, categoria.id), "SIN_PERMISO");
    expect(await db.insumo.findUniqueOrThrow({ where: { id: e.guantes } })).toMatchObject({ nombre: guantes.nombre, activo: true });
    expect(await db.insumo.count({ where: { id: e.insumoInactivo } })).toBe(1);
    expect((await db.categoria.findUniqueOrThrow({ where: { id: categoria.id } })).nombre).toBe(categoria.nombre);

    // Crear sí, auditado en su institución…
    const nuevaCategoria = await crearCategoria(e.adminA, { nombre: "Categoría de A" });
    const nuevo = await crearInsumo(e.adminA, { codigo: "NVO-001", nombre: "Insumo de A", categoriaId: nuevaCategoria.id, unidadMedida: "caja" });
    const auditoria = await db.registroAuditoria.findFirstOrThrow({ where: { accion: "INSUMO_CREADO", entidadId: nuevo.id } });
    expect(auditoria.institucionId).toBe(e.institucionA);
    // …pero una vez creado es de toda la red: tampoco puede editar o eliminar el suyo.
    await esperarError(
      actualizarInsumo(e.adminA, { id: nuevo.id, codigo: "NVO-001", nombre: "Editado", categoriaId: nuevaCategoria.id, unidadMedida: "caja" }),
      "SIN_PERMISO",
    );
    await esperarError(eliminarInsumo(e.adminA, nuevo.id), "SIN_PERMISO");
    // El administrador de la red sí, y ese cambio es un evento de red.
    await establecerInsumoActivo(e.admin, nuevo.id, false);
    const desactivado = await db.registroAuditoria.findFirstOrThrow({ where: { accion: "INSUMO_DESACTIVADO", entidadId: nuevo.id } });
    expect(desactivado.institucionId).toBeNull();
    // Bodeguero y visitante no crean nada.
    await esperarError(crearInsumo(e.bodeguero, { codigo: "B-1", nombre: "X", categoriaId: categoria.id, unidadMedida: "caja" }), "SIN_PERMISO");
    await esperarError(crearCategoria(e.visitante, { nombre: "Y" }), "SIN_PERMISO");
  });

  it("proveedores: compartidos y editables por el administrador de institución, con auditoría", async () => {
    const creado = await crearProveedor(e.adminA, { rut: "76.543.210-3", razonSocial: "Proveedor de A Ltda." });
    await actualizarProveedor(e.adminA, { id: e.proveedor, rut: "76123456-0", razonSocial: "Proveedor Uno SpA", contacto: "Nueva Persona" });
    const registros = await db.registroAuditoria.findMany({ where: { entidad: "Proveedor", usuarioId: e.adminA.usuarioId }, orderBy: { creadoEn: "asc" } });
    expect(registros.map((r) => r.accion)).toEqual(["PROVEEDOR_CREADO", "PROVEEDOR_ACTUALIZADO"]);
    expect(registros.every((r) => r.institucionId === e.institucionA)).toBe(true);
    expect(registros[0]!.entidadId).toBe(creado.id);
    // Los demás roles siguen sin poder.
    await esperarError(crearProveedor(e.bodeguero, { rut: "76.543.211-1", razonSocial: "X" }), "SIN_PERMISO");
  });

  it("instituciones: solo el administrador de la red las gestiona", async () => {
    for (const actor of [e.adminA, e.bodeguero, e.visitante]) {
      await esperarError(crearInstitucion(actor, { nombre: "Intrusa" }), "SIN_PERMISO");
      await esperarError(actualizarInstitucion(actor, { id: e.institucionB, nombre: "Tomada" }), "SIN_PERMISO");
      await esperarError(actualizarInstitucion(actor, { id: e.institucionA, nombre: "Renombrada" }), "SIN_PERMISO");
      await esperarError(establecerInstitucionActiva(actor, e.institucionB, false), "SIN_PERMISO");
    }
    expect((await db.institucion.findMany({ orderBy: { nombre: "asc" } })).map((i) => [i.nombre, i.activo])).toEqual([
      ["Institución Dos", true],
      ["Institución Uno", true],
    ]);
  });
});

describe("lotes (globales por insumo + número) con alcance por institución", () => {
  it("corregir vencimiento: solo lotes que pasaron por sus centros y sin existencias en otra institución", async () => {
    // Lote que solo existe en la institución B: para A no existe.
    await esperarError(
      corregirVencimientoLote(e.adminA, { loteId: loteC, fechaVencimiento: e.dia(200), motivo: "Digitación" }),
      "NO_ENCONTRADO",
    );
    // Lote propio: sí.
    const propio = await corregirVencimientoLote(e.adminA, { loteId: loteA, fechaVencimiento: e.dia(120), motivo: "Digitación" });
    expect(propio.cambiado).toBe(true);
    // Lote compartido (mismo insumo + número en ambas instituciones): A no puede cambiarle la fecha a B.
    await registrarIngreso(e.bodegueroC, { ubicacionId: e.bodegaC, insumoId: e.guantes, numeroLote: LOTE_A, fechaVencimiento: e.dia(120), cantidad: 4 });
    const compartido = await esperarError(
      corregirVencimientoLote(e.adminA, { loteId: loteA, fechaVencimiento: e.dia(300), motivo: "Digitación" }),
      "LOTE_INCONSISTENTE",
    );
    expect(compartido.message).toContain("administrador de la red");
    expect((await db.lote.findUniqueOrThrow({ where: { id: loteA } })).fechaVencimiento?.toISOString().slice(0, 10)).toBe(e.dia(120));

    // El administrador de la red sí: queda un registro por institución, cada una con SUS unidades.
    await corregirVencimientoLote(e.admin, { loteId: loteA, fechaVencimiento: e.dia(300), motivo: "Corrección de red" });
    const registros = await db.registroAuditoria.findMany({
      where: { accion: "LOTE_ACTUALIZADO", entidadId: loteA, usuarioId: e.admin.usuarioId },
    });
    const porInstitucion = new Map(registros.map((r) => [r.institucionId, (r.detalle as { unidadesAfectadas: number }).unidadesAfectadas]));
    expect(porInstitucion).toEqual(new Map([[e.institucionA, 50], [e.institucionB, 4]]));
    // Bodeguero y visitante nunca corrigen.
    await esperarError(corregirVencimientoLote(e.bodeguero, { loteId: loteA, fechaVencimiento: e.dia(10), motivo: "x" }), "SIN_PERMISO");
  });

  it("completar el vencimiento al ingresar: no si el lote tiene existencias en otra institución", async () => {
    // Lote sin fecha (la tela no controla vencimiento) con stock en la institución B.
    await registrarIngreso(e.bodegueroC, { ubicacionId: e.bodegaC, insumoId: e.tela, numeroLote: "TELA-1", cantidad: 10 });
    const error = await esperarError(
      registrarIngreso(e.adminA, { ubicacionId: e.bodegaA, insumoId: e.tela, numeroLote: "TELA-1", fechaVencimiento: e.dia(100), cantidad: 5 }),
      "LOTE_INCONSISTENTE",
    );
    expect(error.campo).toBe("fechaVencimiento");
    expect((await db.lote.findFirstOrThrow({ where: { numeroLote: "TELA-1" } })).fechaVencimiento).toBeNull();
    // Los lotes ya registrados que se sugieren al ingresar son solo los que pasaron por sus centros.
    expect(await lotesDeInsumo(e.adminA, e.tela)).toEqual([]);
    expect((await lotesDeInsumo(e.adminB, e.tela)).map((l) => l.numeroLote)).toEqual(["TELA-1"]);
  });
});

describe("auditoría por institución", () => {
  it("un ADMIN solo ve los registros de su institución; los eventos de red, solo el administrador de la red", async () => {
    // Eventos de red: catálogo editado por la red, institución creada, ingreso fallido sin usuario.
    await establecerInsumoActivo(e.admin, e.insumoInactivo, true);
    await crearInstitucion(e.admin, { nombre: "Institución Tres" });
    await esperarError(iniciarSesion("nadie@test.cl", "Cualquiera-123"), "CREDENCIALES_INVALIDAS");

    const deA = await listarAuditoria(e.adminA, { porPagina: 100 });
    const deB = await listarAuditoria(e.adminB, { porPagina: 100 });
    const deRed = await listarAuditoria(e.admin, { porPagina: 100 });
    expect(deA.total).toBeGreaterThan(0);
    expect(deB.total).toBeGreaterThan(0);
    expect(deA.items.every((r) => r.institucionId === e.institucionA)).toBe(true);
    expect(deB.items.every((r) => r.institucionId === e.institucionB)).toBe(true);
    sinRastroDeB(deA);
    const acciones = (r: typeof deA) => new Set(r.items.map((i) => i.accion));
    for (const accionDeRed of ["INSUMO_ACTIVADO", "INSTITUCION_CREADA"]) {
      expect(acciones(deRed)).toContain(accionDeRed);
      expect(acciones(deA)).not.toContain(accionDeRed);
      expect(acciones(deB)).not.toContain(accionDeRed);
    }
    // El intento con un correo desconocido no pertenece a ninguna institución.
    const desconocido = await db.registroAuditoria.findFirstOrThrow({ where: { accion: "LOGIN_FALLIDO", usuarioId: null } });
    expect(desconocido.institucionId).toBeNull();
    expect(deRed.total).toBe(await db.registroAuditoria.count());
    expect(deA.total + deB.total).toBeLessThan(deRed.total);

    // Los filtros no abren el alcance: ni por institución, ni por usuario, ni por entidad ajena.
    expect((await listarAuditoria(e.adminA, { institucionId: e.institucionB })).items.every((r) => r.institucionId === e.institucionA)).toBe(true);
    expect((await listarAuditoria(e.adminA, { institucionId: "red" })).items.every((r) => r.institucionId === e.institucionA)).toBe(true);
    expect((await listarAuditoria(e.adminA, { usuarioId: e.bodegueroC.usuarioId })).total).toBe(0);
    expect((await listarAuditoria(e.adminA, { entidad: "Movimiento", entidadId: movimientoC })).total).toBe(0);
    expect((await listarAuditoria(e.adminA, { entidad: "Institucion" })).total).toBe(0);
    // El administrador de la red sí filtra por institución y por eventos de red.
    expect((await listarAuditoria(e.admin, { institucionId: e.institucionB, porPagina: 100 })).total).toBe(deB.total);
    const soloRed = await listarAuditoria(e.admin, { institucionId: "red", porPagina: 100 });
    expect(soloRed.total).toBeGreaterThan(0);
    expect(soloRed.items.every((r) => r.institucionId === null)).toBe(true);

    // Opciones de filtro: solo usuarios, acciones y tipos de su institución.
    const opciones = await opcionesFiltroAuditoria(e.adminA);
    const usuariosA = await db.usuario.findMany({ where: { institucionId: e.institucionA }, select: { id: true } });
    expect(opciones.usuarios.map((u) => u.id).sort()).toEqual(usuariosA.map((u) => u.id).sort());
    expect(opciones.entidades).not.toContain("Institucion");
    expect(opciones.acciones).not.toContain("INSTITUCION_CREADA");
  });

  it("lo que el administrador de la red hace sobre datos de una institución queda en la auditoría de ESA institución, sin revelar su identidad", async () => {
    await establecerUsuarioActivo(e.admin, e.visitante.usuarioId, false);
    await actualizarCentro(e.admin, { id: e.centroC, nombre: "Centro C", tipo: "CLINICA", direccion: "Pasaje Tres 300", region: "Biobío", comuna: "Concepción" });

    const deA = await listarAuditoria(e.adminA, { porPagina: 100 });
    const desactivacion = deA.items.find((r) => r.accion === "USUARIO_DESACTIVADO")!;
    expect(desactivacion).toBeDefined();
    expect(desactivacion.usuario).toEqual({ id: "", nombre: "Administrador de la red", email: "", externo: true });
    // El ingreso inicial del escenario (hecho por la red en el centro A) también es de A.
    expect(deA.items.some((r) => r.accion === "MOVIMIENTO_INGRESO" && r.usuario?.externo)).toBe(true);
    expect(texto(deA)).not.toContain("admin@test.cl");
    expect(deA.items.some((r) => r.accion === "CENTRO_ACTUALIZADO")).toBe(false); // el centro C es de B
    expect((await listarAuditoria(e.adminB, { porPagina: 100 })).items.some((r) => r.accion === "CENTRO_ACTUALIZADO")).toBe(true);
    // El administrador de la red ve quién fue, con nombre y correo.
    const enRed = (await listarAuditoria(e.admin, { accion: "USUARIO_DESACTIVADO" })).items[0]!;
    expect(enRed.usuario).toMatchObject({ email: "admin@test.cl" });
    expect(enRed.institucion).toBe("Institución Uno");
  });

  it("mínimos y máximos cambiados por la red en varias instituciones: un registro por institución, cada uno con sus centros", async () => {
    await guardarParametrosStock(e.admin, {
      insumoId: e.tela,
      parametros: [
        { centroId: e.centroA, stockMinimo: 5 },
        { centroId: e.centroB, stockMinimo: 6 },
        { centroId: e.centroC, stockMinimo: 7 },
      ],
    });
    const registros = await db.registroAuditoria.findMany({ where: { accion: "PARAMETROS_STOCK_ACTUALIZADOS", entidadId: e.tela } });
    const centrosDe = (institucionId: string) =>
      (registros.find((r) => r.institucionId === institucionId)!.detalle as { centros: { centro: string }[] }).centros.map((c) => c.centro).sort();
    expect(registros).toHaveLength(2);
    expect(centrosDe(e.institucionA)).toEqual(["Centro A", "Centro B"]);
    expect(centrosDe(e.institucionB)).toEqual(["Centro C"]);
    expect(texto(registros.find((r) => r.institucionId === e.institucionA)!.detalle)).not.toContain("Centro C");
  });

  it("sesiones e intentos de ingreso de un usuario quedan en su institución", async () => {
    const creado = await crearUsuario(e.adminB, { nombre: "Visita B", email: "visita.b@test.cl", rol: "VISITANTE", centroIds: [e.centroC] });
    await esperarError(iniciarSesion(creado.email, "Equivocada-123"), "CREDENCIALES_INVALIDAS");
    await iniciarSesion(creado.email, creado.passwordTemporal);
    const registros = await db.registroAuditoria.findMany({ where: { entidad: "Usuario", entidadId: creado.id } });
    expect(registros.map((r) => r.accion).sort()).toEqual(["LOGIN_FALLIDO", "LOGIN_OK", "USUARIO_CREADO"]);
    expect(registros.every((r) => r.institucionId === e.institucionB)).toBe(true);
    // El administrador de la red inicia sesión: evento de red.
    const red = await crearUsuario(e.admin, { nombre: "Otra Red", email: "otra.red@test.cl", rol: "ADMIN_RED" });
    await iniciarSesion(red.email, red.passwordTemporal);
    const loginRed = await db.registroAuditoria.findFirstOrThrow({ where: { accion: "LOGIN_OK", usuarioId: red.id } });
    expect(loginRed.institucionId).toBeNull();
  });
});

describe("salvaguardas de administración", () => {
  it("siempre queda al menos un administrador de la red activo", async () => {
    // Único ADMIN_RED: no se puede desactivar ni degradar (aunque existan administradores de institución).
    const otra = await crearUsuario(e.admin, { nombre: "Otra Red", email: "otra.red@test.cl", rol: "ADMIN_RED" });
    const actorOtra: Actor = { usuarioId: otra.id, rol: "ADMIN_RED", institucionId: null, centroIds: [] };
    await establecerUsuarioActivo(e.admin, otra.id, false);
    await db.usuario.update({ where: { id: otra.id }, data: { activo: true } });
    await establecerUsuarioActivo(actorOtra, e.admin.usuarioId, false); // quedan: otra (activa)
    await esperarError(establecerUsuarioActivo(e.admin, otra.id, false), "OPERACION_INVALIDA");
    const degradar = await esperarError(
      actualizarUsuario(e.admin, { id: otra.id, nombre: "Otra Red", email: "otra.red@test.cl", rol: "ADMIN", institucionId: e.institucionA }),
      "OPERACION_INVALIDA",
    );
    expect(degradar.message).toContain("administrador de la red");
    expect(await db.usuario.count({ where: { rol: "ADMIN_RED", activo: true } })).toBe(1);
    // Con dos activos, uno sí puede pasar a administrador de una institución (y entonces recibe institución).
    await db.usuario.update({ where: { id: e.admin.usuarioId }, data: { activo: true } });
    await actualizarUsuario(e.admin, { id: otra.id, nombre: "Otra Red", email: "otra.red@test.cl", rol: "ADMIN", institucionId: e.institucionA });
    expect(await db.usuario.findUniqueOrThrow({ where: { id: otra.id } })).toMatchObject({ rol: "ADMIN", institucionId: e.institucionA });
    // Pasar a rol con institución sin indicarla se rechaza.
    const otra2 = await crearUsuario(e.admin, { nombre: "Red Tres", email: "red3@test.cl", rol: "ADMIN_RED" });
    const sinInstitucion = await esperarError(
      actualizarUsuario(e.admin, { id: otra2.id, nombre: "Red Tres", email: "red3@test.cl", rol: "ADMIN" }),
      "VALIDACION",
    );
    expect(sinInstitucion.campo).toBe("institucionId");
  });

  it("nadie se cambia su propio rol ni se desactiva (administrador de la red y de institución)", async () => {
    for (const [actor, email] of [[e.admin, "admin@test.cl"], [e.adminA, "admin.a@test.cl"]] as const) {
      for (const rol of ["ADMIN_RED", "ADMIN", "BODEGUERO", "VISITANTE"] as const) {
        if (rol === actor.rol) continue;
        const error = await esperarError(
          actualizarUsuario(actor, { id: actor.usuarioId, nombre: "Yo Mismo", email, rol, institucionId: e.institucionA, centroIds: [e.centroA] }),
          "OPERACION_INVALIDA",
        );
        expect(error.campo).toBe("rol");
      }
      await esperarError(establecerUsuarioActivo(actor, actor.usuarioId, false), "OPERACION_INVALIDA");
      await esperarError(restablecerPasswordUsuario(actor, actor.usuarioId), "OPERACION_INVALIDA");
      expect(await db.usuario.findUniqueOrThrow({ where: { id: actor.usuarioId } })).toMatchObject({ rol: actor.rol, activo: true });
    }
    // Un ADMIN no se escala a sí mismo a ADMIN_RED ni siquiera a través de otro administrador de su institución.
    const colega = await crearActor("colega.a@test.cl", "ADMIN", e.institucionA);
    await esperarError(
      actualizarUsuario(colega, { id: e.adminA.usuarioId, nombre: "Admin A", email: "admin.a@test.cl", rol: "ADMIN_RED" }),
      "SIN_PERMISO",
    );
    expect(await db.usuario.count({ where: { rol: "ADMIN_RED" } })).toBe(1);
  });

  it("bodeguero y visitante siguen igual: solo sus centros, sin administración", async () => {
    for (const actor of [e.bodeguero, e.visitante]) {
      await esperarError(listarUsuarios(actor), "SIN_PERMISO");
      await esperarError(listarCentrosAdmin(actor), "SIN_PERMISO");
      await esperarError(listarAuditoria(actor), "SIN_PERMISO");
      await esperarError(listarInsumosAdmin(actor), "SIN_PERMISO");
      await esperarError(reporteExistencias(actor), "SIN_PERMISO");
      await esperarError(listarInventario(actor, { centroId: e.centroB }), "SIN_ACCESO_AL_CENTRO");
      await esperarError(listarInventario(actor, { centroId: e.centroC }), "SIN_ACCESO_AL_CENTRO");
      expect((await listarInventario(actor)).items.map((i) => i.insumoId)).toEqual([e.guantes]);
    }
    await esperarError(registrarIngreso(e.visitante, { ubicacionId: e.bodegaA, insumoId: e.guantes, numeroLote: "V", fechaVencimiento: e.dia(30), cantidad: 1 }), "SIN_PERMISO");
    await esperarError(registrarAjuste(e.bodeguero, { ubicacionId: e.bodegaA, loteId: loteA, sentido: "POSITIVO", cantidad: 1, motivo: "x" }), "SIN_PERMISO");
  });
});

describe("instituciones (administrador de la red)", () => {
  it("crea una institución con su primer administrador, que entra y arma su institución desde cero", async () => {
    const creada = await crearInstitucion(e.admin, {
      nombre: "  Clínica del Sur SpA ",
      rut: "76.543.210-3",
      administrador: { nombre: "Ana Soto", email: " Ana.Soto@Test.CL " },
    });
    expect(creada.nombre).toBe("Clínica del Sur SpA");
    expect(creada.administrador).toMatchObject({ nombre: "Ana Soto", email: "ana.soto@test.cl" });
    expect(await db.institucion.findUniqueOrThrow({ where: { id: creada.id } })).toMatchObject({ rut: "76543210-3", activo: true });
    expect(await db.usuario.findUniqueOrThrow({ where: { email: "ana.soto@test.cl" } })).toMatchObject({
      rol: "ADMIN", institucionId: creada.id, debeCambiarPassword: true,
    });
    const auditoria = await db.registroAuditoria.findMany({ where: { OR: [{ entidadId: creada.id }, { entidadId: creada.administrador!.id }] }, orderBy: { creadoEn: "asc" } });
    expect(auditoria.map((a) => [a.accion, a.institucionId])).toEqual([
      ["INSTITUCION_CREADA", null],
      ["USUARIO_CREADO", creada.id],
    ]);

    // La contraseña temporal sirve; su alcance es su institución, aún sin centros.
    const { usuario } = await iniciarSesion("ana.soto@test.cl", creada.administrador!.passwordTemporal);
    expect(usuario).toMatchObject({ rol: "ADMIN", institucionId: creada.id, centroIds: [] });
    const ana: Actor = { usuarioId: usuario.id, rol: "ADMIN", institucionId: creada.id, centroIds: [] };
    expect(await listarCentrosAdmin(ana)).toEqual([]);
    expect((await listarInventario(ana)).total).toBe(0);
    expect((await listarUsuarios(ana)).items.map((u) => u.email)).toEqual(["ana.soto@test.cl"]);

    // Crea su primer centro y registra el primer ingreso.
    const centro = await crearCentro(ana, { nombre: "Clínica del Sur", tipo: "CLINICA", direccion: "Av. Sur 1", region: "Los Lagos", comuna: "Puerto Montt" });
    const bodega = await db.ubicacion.findFirstOrThrow({ where: { centroId: centro.id } });
    const conCentro: Actor = { ...ana, centroIds: [centro.id] };
    const ingreso = await registrarIngreso(conCentro, { ubicacionId: bodega.id, insumoId: e.guantes, numeroLote: "SUR-1", fechaVencimiento: e.dia(200), cantidad: 12 });
    expect(ingreso.movimiento.centroId).toBe(centro.id);
    expect((await listarInventario(conCentro)).items.map((i) => [i.insumoId, i.total])).toEqual([[e.guantes, 12]]);
    // Las otras instituciones no ven nada de la nueva.
    expect(texto(await listarMovimientos(e.adminA))).not.toContain("SUR-1");
    expect(texto(await listarCentrosAdmin(e.adminB))).not.toContain("Clínica del Sur");
  });

  it("valida nombre único y RUT; si el correo del administrador ya existe no se crea nada", async () => {
    const dup = await esperarError(crearInstitucion(e.admin, { nombre: "institución uno" }), "DUPLICADO");
    expect(dup.campo).toBe("nombre");
    const rut = await esperarError(crearInstitucion(e.admin, { nombre: "Otra", rut: "76.543.210-9" }), "VALIDACION");
    expect(rut.detalle?.erroresCampo).toHaveProperty("rut");
    const correo = await esperarError(
      crearInstitucion(e.admin, { nombre: "Con Admin Repetido", administrador: { nombre: "Alguien Más", email: "bodega@test.cl" } }),
      "DUPLICADO",
    );
    expect(correo.campo).toBe("administrador.email");
    expect(await db.institucion.count({ where: { nombre: "Con Admin Repetido" } })).toBe(0);
    expect(await db.institucion.count()).toBe(2);
    // Editar: nombre único y cambios auditados como evento de red.
    await esperarError(actualizarInstitucion(e.admin, { id: e.institucionB, nombre: "Institución Uno" }), "DUPLICADO");
    await actualizarInstitucion(e.admin, { id: e.institucionB, nombre: "Institución Dos SpA", rut: "76.543.210-3" });
    const cambio = await db.registroAuditoria.findFirstOrThrow({ where: { accion: "INSTITUCION_ACTUALIZADA" } });
    expect(cambio.institucionId).toBeNull();
    expect(cambio.detalle).toMatchObject({ cambios: { nombre: { antes: "Institución Dos", despues: "Institución Dos SpA" } } });
  });

  it("lista las instituciones con sus conteos de centros, usuarios y stock", async () => {
    await db.centro.update({ where: { id: e.centroB }, data: { activo: false } });
    const lista = await listarInstituciones(e.admin);
    const a = lista.find((i) => i.id === e.institucionA)!;
    const b = lista.find((i) => i.id === e.institucionB)!;
    expect(a).toMatchObject({ nombre: "Institución Uno", centros: 2, centrosActivos: 1, usuarios: 4, usuariosActivos: 4, administradores: 1, existencias: 50 });
    expect(b).toMatchObject({ nombre: "Institución Dos", centros: 1, centrosActivos: 1, usuarios: 2, administradores: 1, existencias: 63 });
  });

  it("no se desactiva una institución con centros activos con stock; desactivada, sus usuarios quedan fuera", async () => {
    const creado = await crearUsuario(e.adminB, { nombre: "Visita B", email: "visita.b@test.cl", rol: "VISITANTE", centroIds: [e.centroC] });
    const { token } = await iniciarSesion(creado.email, creado.passwordTemporal);

    const conStock = await esperarError(establecerInstitucionActiva(e.admin, e.institucionB, false), "EN_USO");
    expect(conStock.message).toContain("1 centro activo con stock");
    expect(conStock.detalle).toMatchObject({ existencias: 63, centrosConStock: 1 });
    expect((await db.institucion.findUniqueOrThrow({ where: { id: e.institucionB } })).activo).toBe(true);
    expect(await validarTokenSesion(token)).not.toBeNull();

    // Sin stock en centros activos (se da de baja todo) sí se puede.
    await registrarMerma(e.adminB, { ubicacionId: e.bodegaC, loteId: loteC, cantidad: 63, motivo: "Cierre" });
    const r = await establecerInstitucionActiva(e.admin, e.institucionB, false);
    expect(r).toMatchObject({ activo: false, sesionesCerradas: 1 });
    // Sus usuarios no entran (mensaje genérico) y sus sesiones dejan de valer.
    expect(await validarTokenSesion(token)).toBeNull();
    await esperarError(iniciarSesion(creado.email, creado.passwordTemporal), "CREDENCIALES_INVALIDAS");
    const fallo = await db.registroAuditoria.findFirstOrThrow({ where: { accion: "LOGIN_FALLIDO", entidadId: creado.id } });
    expect(fallo.detalle).toMatchObject({ motivo: "institucion_inactiva" });
    // No admite centros ni usuarios nuevos, ni reactivar sus centros.
    await esperarError(
      crearCentro(e.admin, { nombre: "Centro E", tipo: "CLINICA", direccion: "X", region: "Biobío", comuna: "Concepción", institucionId: e.institucionB }),
      "INACTIVO",
    );
    await esperarError(crearUsuario(e.admin, { nombre: "Tardío", email: "tardio@test.cl", rol: "ADMIN", institucionId: e.institucionB }), "INACTIVO");
    await db.centro.update({ where: { id: e.centroC }, data: { activo: false } });
    await esperarError(establecerCentroActivo(e.admin, e.centroC, true), "INACTIVO");
    // La otra institución no se ve afectada.
    expect((await listarInventario(e.adminA)).total).toBeGreaterThan(0);

    // Reactivarla devuelve el acceso.
    await establecerInstitucionActiva(e.admin, e.institucionB, true);
    expect((await iniciarSesion(creado.email, creado.passwordTemporal)).usuario.institucionId).toBe(e.institucionB);
    const acciones = (await db.registroAuditoria.findMany({ where: { entidad: "Institucion", entidadId: e.institucionB }, orderBy: { creadoEn: "asc" } })).map((a) => a.accion);
    expect(acciones).toEqual(["INSTITUCION_DESACTIVADA", "INSTITUCION_ACTIVADA"]);
  });

  it("el resumen de la red por institución agrupa centros y alertas de cada una", async () => {
    await crearInstitucion(e.admin, { nombre: "Institución Vacía" });
    const panel = await resumenPanel(e.admin);
    const resumen = await resumenPorInstitucion(e.admin, panel.porCentro);
    expect(resumen.map((r) => r.institucion)).toEqual(["Institución Dos", "Institución Uno", "Institución Vacía"]);
    const [dos, uno, vacia] = resumen;
    // A: guantes bajo el mínimo (50 < 500) y un lote por vencer en 20 días.
    expect(uno).toMatchObject({ centros: 2, sinStock: 0, bajoMinimo: 1, vencidos: 0, porVencer: 1 });
    expect(uno!.detalle.map((d) => d.centro)).toEqual(["Centro A", "Centro B"]);
    expect(uno!.detalle[1]).toMatchObject({ sinStock: 0, bajoMinimo: 0, vencidos: 0, porVencer: 0 });
    // B: guantes bajo el mínimo (63 < 900), dializador sin stock (mínimo 10) y un lote por vencer.
    expect(dos).toMatchObject({ centros: 1, sinStock: 1, bajoMinimo: 1, vencidos: 0, porVencer: 1 });
    expect(vacia).toMatchObject({ centros: 0, sinStock: 0, bajoMinimo: 0, detalle: [] });
    // La suma por institución coincide con el total de la red.
    const suma = (clave: "sinStock" | "bajoMinimo") => resumen.reduce((s, r) => s + r[clave], 0);
    expect(suma("sinStock")).toBe(panel.alertas.sinStock);
    expect(suma("bajoMinimo")).toBe(panel.alertas.bajoMinimo);
  });
});
