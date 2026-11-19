import type { Page } from "@playwright/test";
import { expect, sesionDe, test } from "./soporte/fixtures";

/**
 * Parámetros de URL inválidos: ninguna pantalla debe caer en la página de
 * error ("Algo salió mal") ni responder 5xx; lo inválido se ignora.
 */

const LISTADOS = [
  "/inventario",
  "/movimientos",
  "/alertas",
  "/alertas/reposicion",
  "/panel",
  "/reportes/existencias",
  "/reportes/movimientos",
  "/reportes/consumo",
  "/reportes/vencimientos",
  "/admin/insumos",
  "/admin/usuarios",
  "/admin/proveedores",
  "/admin/auditoria",
];
const FORMULARIOS = ["/movimientos/ingreso", "/movimientos/retiro", "/movimientos/traslado", "/movimientos/ajuste"];

async function debeCargar(pagina: Page, url: string): Promise<void> {
  const respuesta = await pagina.goto(url);
  expect(respuesta?.status(), `${url} no debe responder 5xx`).toBeLessThan(500);
  await expect(pagina.getByRole("heading", { level: 1 }).first(), `${url} debe mostrar su encabezado`).toBeVisible();
  await expect(pagina.getByText("Algo salió mal"), `${url} no debe caer en la página de error`).toHaveCount(0);
}

test.describe("Robustez ante parámetros de URL inválidos", () => {
  test.use(sesionDe("admin"));

  test("página, estado, pestaña, orden, tipo y fechas inválidos se ignoran", async ({ page }) => {
    test.slow();
    const parametros = [
      "pagina=-1",
      "pagina=0",
      "pagina=1.5",
      "pagina=abc",
      "pagina=99999",
      "pagina=2&pagina=3",
      "estado=XXX",
      "tab=zzz&tramo=45",
      "orden=xx&tipo=NADA",
      "desde=2026-13-45&hasta=ayer",
      "desde=2026-12-01&hasta=2026-01-01",
      "desde=0001-01-01",
      "dias=-5",
      "dias=abc",
    ];
    for (const ruta of LISTADOS) {
      for (const consulta of parametros) await debeCargar(page, `${ruta}?${consulta}`);
    }
  });

  test("identificadores inexistentes (centro, categoría, ubicación, insumo, lote, usuario) no rompen nada", async ({ page }) => {
    test.slow();
    const consulta =
      "centro=no-existe&categoria=no-existe&ubicacion=no-existe&insumo=no-existe&lote=no-existe&usuario=no-existe&rol=ROOT&entidad=Nada&entidadId=x&accion=x";
    for (const ruta of [...LISTADOS, ...FORMULARIOS]) await debeCargar(page, `${ruta}?${consulta}`);
    // Un panel o detalle pedido por URL con un id inexistente se informa sin romper el listado.
    await page.goto("/inventario?ver=no-existe");
    await expect(page.getByRole("dialog")).toContainText("No encontramos este insumo");
    const movimiento = await page.goto("/movimientos?mov=no-existe");
    expect(movimiento?.status()).toBeLessThan(500);
    await expect(page.getByRole("dialog").or(page.getByRole("heading", { level: 1, name: "Movimientos" })).first()).toBeVisible();
    await expect(page.getByText("Algo salió mal")).toHaveCount(0);
    // Formularios con insumo inexistente: parten sin insumo preseleccionado.
    await page.goto("/movimientos/retiro?insumo=no-existe&ubicacion=no-existe&lote=no-existe");
    await expect(page.getByRole("combobox", { name: "Insumo" })).toBeVisible();
    await page.goto("/movimientos/ajuste?tipo=XXX&insumo=no-existe");
    await expect(page.getByRole("radio", { name: /^Restar stock/ })).toBeChecked();
  });

  test("una página más allá de la última muestra el listado vacío o la última página, sin error", async ({ page }) => {
    for (const ruta of ["/inventario", "/movimientos", "/admin/insumos", "/admin/auditoria"]) {
      await debeCargar(page, `${ruta}?pagina=99999`);
      await expect(page.getByRole("navigation", { name: "Paginación" }).or(page.getByRole("main").getByRole("heading", { level: 3 })).first()).toBeVisible();
    }
  });

  test("búsquedas muy largas o con caracteres especiales no rompen los listados", async ({ page }) => {
    test.slow();
    const textos = ["%", "_", "'", '"', "\\", "ñandú áéíóú", "<script>alert(1)</script>", "a".repeat(3000), "🙂"];
    for (const ruta of ["/inventario", "/movimientos", "/alertas", "/reportes/existencias", "/admin/insumos", "/admin/usuarios", "/admin/proveedores"]) {
      for (const texto of textos) await debeCargar(page, `${ruta}?q=${encodeURIComponent(texto)}`);
    }
  });

  test("B-02: un número de página gigantesco no debe provocar un error", async ({ page }) => {
    for (const url of [
      "/inventario?pagina=99999999999999999999",
      "/movimientos?pagina=99999999999999999999",
      "/reportes/existencias?pagina=99999999999999999999",
      "/admin/insumos?pagina=99999999999999999999",
      "/admin/usuarios?pagina=Infinity",
      "/admin/auditoria?pagina=Infinity",
      "/reportes/vencimientos?paginaMermas=99999999999999999999",
    ]) {
      await debeCargar(page, url);
    }
    // Lo absurdo cae en la primera página, con datos.
    await page.goto("/admin/insumos?pagina=99999999999999999999");
    const paginacion = page.getByRole("navigation", { name: "Paginación" });
    await expect(paginacion).toContainText(/Página 1 de \d+/);
    await expect(page.getByRole("main").locator("tbody tr").first()).toBeVisible();

    // Una página válida pero más allá del final: sin filas, con salida hacia la última página.
    await debeCargar(page, "/admin/insumos?pagina=999999");
    await expect(paginacion).toContainText("No hay resultados en esta página");
    await paginacion.getByRole("link", { name: "Ir a la última página" }).click();
    await expect(paginacion).toContainText(/Página (\d+) de \1/);
    await expect(page.getByRole("main").locator("tbody tr").first()).toBeVisible();
  });

  test("B-03: un byte nulo en la búsqueda no debe provocar un error", async ({ page }) => {
    for (const ruta of ["/inventario", "/movimientos", "/reportes/existencias", "/admin/insumos", "/admin/usuarios", "/admin/proveedores"]) {
      await debeCargar(page, `${ruta}?q=%00`);
    }
    // Un byte nulo en medio del texto se descarta y la búsqueda sigue funcionando.
    await page.goto("/inventario?q=HEP%00-5000");
    await expect(page.getByRole("heading", { level: 1, name: "Inventario" })).toBeVisible();
    await expect(page.getByText("Algo salió mal")).toHaveCount(0);
    // Las exportaciones guardan el texto buscado en la auditoría: tampoco deben fallar.
    for (const csv of ["/reportes/exportar/movimientos?q=%00", "/reportes/exportar/existencias?q=gua%00nte", "/alertas/reposicion/exportar?q=%00"]) {
      expect((await page.request.get(csv)).status(), csv).toBe(200);
    }
  });

  test("B-04: una fecha 'desde' en el año 9999 no debe provocar un error en los reportes", async ({ page }) => {
    for (const ruta of ["/reportes/movimientos", "/reportes/consumo", "/reportes/vencimientos", "/movimientos", "/admin/auditoria"]) {
      await debeCargar(page, `${ruta}?desde=9999-12-31`);
      await debeCargar(page, `${ruta}?hasta=9999-12-31`);
      await debeCargar(page, `${ruta}?desde=0001-01-01&hasta=9999-12-31`);
    }
    for (const csv of ["movimientos", "consumo", "mermas"]) {
      expect((await page.request.get(`/reportes/exportar/${csv}?desde=9999-12-31`)).status(), csv).toBe(200);
    }
    // La fecha absurda se ignora: el reporte muestra su período por defecto, con movimientos.
    await page.goto("/reportes/movimientos?desde=9999-12-31");
    await expect(page.getByRole("main").locator("tbody tr").first()).toBeVisible();
  });
});
