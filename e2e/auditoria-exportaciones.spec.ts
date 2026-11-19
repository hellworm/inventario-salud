import type { APIResponse, Page } from "@playwright/test";
import { CENTROS, CUENTAS, diaSantiago, UBICACIONES } from "./soporte/entorno";
import { crearInsumo, definirMinimo, registrarIngreso, registrarRetiro } from "./soporte/datos";
import { expect, test } from "./soporte/fixtures";

const REPORTES = ["existencias", "movimientos", "consumo", "vencimientos", "mermas"] as const;
const BOM = [0xef, 0xbb, 0xbf];

/** Comprueba que la respuesta sea un CSV para Excel es-CL y devuelve sus líneas (sin BOM). */
async function lineasCsv(respuesta: APIResponse): Promise<string[]> {
  expect(respuesta.status()).toBe(200);
  expect(respuesta.headers()["content-type"]).toContain("text/csv");
  expect(respuesta.headers()["content-type"]).toContain("charset=utf-8");
  expect(respuesta.headers()["content-disposition"]).toMatch(/^attachment; filename="[a-z0-9_-]+\.csv"$/);
  const cuerpo = await respuesta.body();
  expect([...cuerpo.subarray(0, 3)], "el archivo debe empezar con BOM UTF-8").toEqual(BOM);
  const texto = cuerpo.subarray(3).toString("utf8");
  expect(texto, "fin de línea CRLF").toContain("\r\n");
  const lineas = texto.split("\r\n").filter((l) => l.length > 0);
  expect(lineas[0].split(";").length, "encabezados separados por punto y coma").toBeGreaterThan(3);
  expect(lineas[0]).not.toContain(",");
  return lineas;
}

async function registrosDeAuditoria(admin: Page, consulta: string) {
  await admin.goto(`/admin/auditoria?${consulta}`);
  const tabla = admin.getByRole("table", { name: "Registro de auditoría" });
  await expect(tabla.or(admin.getByRole("heading", { name: "Sin eventos para estos filtros" }))).toBeVisible();
  return admin.getByRole("table", { name: "Registro de auditoría" }).locator("tbody tr");
}

test.describe("Exportación CSV", () => {
  test("administrador: cada reporte se descarga como CSV con BOM y punto y coma", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    for (const reporte of REPORTES) {
      const lineas = await lineasCsv(await admin.request.get(`/reportes/exportar/${reporte}`));
      expect(lineas.length, `${reporte}: al menos el encabezado`).toBeGreaterThanOrEqual(1);
    }
    const inexistente = await admin.request.get("/reportes/exportar/no-existe");
    expect(inexistente.status()).toBe(404);
  });

  test("el CSV de existencias contiene el stock recién ingresado y respeta el filtro por centro", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin);
    const lote = `CSV-${insumo.sufijo}`;
    await registrarIngreso(admin, { insumo, ubicacion: UBICACIONES.nunoaBodega, lote, vence: diaSantiago(210), cantidad: 13 });

    const lineas = await lineasCsv(await admin.request.get(`/reportes/exportar/existencias?q=${insumo.codigo}`));
    const filas = lineas.slice(1).filter((l) => l.includes(insumo.codigo));
    expect(filas).toHaveLength(1);
    const celdas = filas[0].split(";");
    expect(celdas).toContain(lote);
    expect(celdas).toContain(CENTROS.nunoa);
    expect(celdas).toContain("13");

    // Filtrado por otro centro, el insumo no aparece.
    await admin.goto("/admin/centros");
    const href = await admin.getByRole("main").getByRole("link", { name: new RegExp(CENTROS.valpo) }).first().getAttribute("href");
    const centroValpoId = (href as string).split("/").pop() as string;
    const deValpo = await lineasCsv(await admin.request.get(`/reportes/exportar/existencias?centro=${centroValpoId}&q=${insumo.codigo}`));
    expect(deValpo.filter((l) => l.includes(insumo.codigo))).toHaveLength(0);
  });

  for (const rol of ["bodega", "visita"] as const) {
    test(`${rol}: los reportes responden 403 y no entregan datos`, async ({ abrirComo }) => {
      const pagina = await abrirComo(rol);
      for (const reporte of REPORTES) {
        const respuesta = await pagina.request.get(`/reportes/exportar/${reporte}`);
        expect(respuesta.status(), `${rol} no debe descargar ${reporte}`).toBe(403);
        expect(respuesta.headers()["content-type"]).not.toContain("text/csv");
        expect(await respuesta.text()).not.toContain(";");
      }
    });
  }

  test("sin sesión no hay descarga", async ({ abrirAnonimo }) => {
    const anonimo = await abrirAnonimo();
    for (const ruta of ["/reportes/exportar/existencias", "/alertas/reposicion/exportar"]) {
      const respuesta = await anonimo.request.get(ruta, { maxRedirects: 0 });
      expect([307, 401, 403]).toContain(respuesta.status());
      expect(respuesta.headers()["content-type"] ?? "").not.toContain("text/csv");
    }
  });

  test("la lista de reposición se exporta para cualquier rol, solo con datos de su centro", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin);
    await definirMinimo(admin, insumo, CENTROS.nunoa, 7, 30);

    const nunoa = await abrirComo("visita");
    const lineas = await lineasCsv(await nunoa.request.get("/alertas/reposicion/exportar"));
    expect(lineas.filter((l) => l.includes(insumo.codigo))).toHaveLength(1);
    expect(lineas.slice(1).every((l) => !l.includes(CENTROS.valpo) && !l.includes(CENTROS.conce))).toBe(true);

    const valpo = await abrirComo("valpo");
    const deValpo = await lineasCsv(await valpo.request.get("/alertas/reposicion/exportar"));
    expect(deValpo.filter((l) => l.includes(insumo.codigo))).toHaveLength(0);
    expect(deValpo.slice(1).every((l) => !l.includes(CENTROS.nunoa))).toBe(true);
  });
});

test.describe("Auditoría", () => {
  test("registra creación de insumo, parámetros, movimientos y exportaciones con su autor", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin);
    await definirMinimo(admin, insumo, CENTROS.nunoa, 2, 10);
    const bodeguero = await abrirComo("bodega");
    const lote = `AU-${insumo.sufijo}`;
    await registrarIngreso(bodeguero, { insumo, ubicacion: UBICACIONES.nunoaBodega, lote, vence: diaSantiago(80), cantidad: 6 });
    await registrarRetiro(bodeguero, insumo, UBICACIONES.nunoaBodega, 2);
    await lineasCsv(await admin.request.get(`/reportes/exportar/movimientos?q=${insumo.codigo}`));

    // Historial del insumo (enlace "Ver historial de cambios" de su ficha de administración).
    const delInsumo = await registrosDeAuditoria(admin, `entidad=Insumo&entidadId=${insumo.id}`);
    await expect(delInsumo.filter({ hasText: "Insumo creado" })).toHaveCount(1);
    await expect(delInsumo.filter({ hasText: "Insumo creado" })).toContainText(CUENTAS.admin.nombre);

    const hoy = diaSantiago(0);
    const parametros = delInsumo.filter({ hasText: "Mínimos y máximos modificados" });
    await expect(parametros).toHaveCount(1);
    await expect(parametros).toContainText(CENTROS.nunoa);

    // Cada movimiento se busca por su identificador (el que muestra el detalle del historial).
    const idDeMovimiento = async (tipo: "Ingreso" | "Retiro") => {
      await bodeguero.goto(`/movimientos?insumo=${insumo.id}`);
      await bodeguero.getByRole("main").locator("tbody tr").filter({ hasText: tipo }).getByRole("button").first().click();
      const id = await bodeguero.getByRole("dialog").locator("dt", { hasText: "Identificador" }).locator("xpath=following-sibling::dd[1]").innerText();
      return id.trim();
    };
    const ingreso = await registrosDeAuditoria(admin, `entidad=Movimiento&entidadId=${await idDeMovimiento("Ingreso")}`);
    await expect(ingreso).toHaveCount(1);
    await expect(ingreso).toContainText("Ingreso de stock");
    await expect(ingreso).toContainText(`6 × ${insumo.codigo}`);
    await expect(ingreso).toContainText(lote);
    await expect(ingreso).toContainText(CUENTAS.bodega.nombre);
    await expect(ingreso).toContainText(CENTROS.nunoa);

    // Detalle de un registro.
    await ingreso.getByRole("button", { name: /Ver detalle/ }).click();
    const detalle = admin.getByRole("dialog");
    await expect(detalle).toContainText(lote);
    await expect(detalle).toContainText(CUENTAS.bodega.nombre);

    const retiro = await registrosDeAuditoria(admin, `entidad=Movimiento&entidadId=${await idDeMovimiento("Retiro")}`);
    await expect(retiro).toHaveCount(1);
    await expect(retiro).toContainText("Retiro de stock");
    await expect(retiro).toContainText(`2 × ${insumo.codigo}`);

    const exportaciones = await registrosDeAuditoria(admin, `desde=${hoy}&hasta=${hoy}&accion=REPORTE_EXPORTADO`);
    await expect(exportaciones.first()).toContainText(CUENTAS.admin.nombre);
    await expect(exportaciones.first()).toContainText("Reporte exportado");
  });

  test("registra inicios de sesión y altas de usuarios; es de solo lectura", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const hoy = diaSantiago(0);
    const sesiones = await registrosDeAuditoria(admin, `desde=${hoy}&hasta=${hoy}&accion=LOGIN_OK`);
    await expect(sesiones.first()).toContainText("Inicio de sesión");
    const altas = await registrosDeAuditoria(admin, "accion=USUARIO_CREADO");
    await expect(altas.first()).toContainText(CUENTAS.admin.nombre);
    // Un filtro sin coincidencias muestra el estado vacío, no un error.
    await registrosDeAuditoria(admin, "accion=NO_EXISTE_ESTA_ACCION");
    await expect(admin.getByRole("heading", { name: "Sin eventos para estos filtros" })).toBeVisible();
    await expect(admin.getByRole("main").getByRole("button", { name: /Eliminar|Editar|Borrar/ })).toHaveCount(0);
  });
});
