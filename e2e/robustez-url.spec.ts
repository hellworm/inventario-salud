import type { Page } from "@playwright/test";
import { bugConocido, expect, sesionDe, test } from "./soporte/fixtures";

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
    await debeCargar(page, "/movimientos?mov=no-existe");
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

  // --- Bugs conocidos (ver informe de QA). Quitar `test.fail` cuando se corrijan. ---

  test("B-02: un número de página gigantesco no debe provocar un error", async ({ page }) => {
    bugConocido("B-02: ?pagina=99999999999999999999 o Infinity desbordan el OFFSET/skip y la página cae en 'Algo salió mal'");
    for (const url of [
      "/inventario?pagina=99999999999999999999",
      "/movimientos?pagina=99999999999999999999",
      "/reportes/existencias?pagina=99999999999999999999",
      "/admin/insumos?pagina=99999999999999999999",
      "/admin/usuarios?pagina=Infinity",
      "/admin/auditoria?pagina=Infinity",
    ]) {
      await debeCargar(page, url);
    }
  });

  test("B-03: un byte nulo en la búsqueda no debe provocar un error", async ({ page }) => {
    bugConocido("B-03: ?q=%00 llega a PostgreSQL ('invalid byte sequence for encoding UTF8: 0x00') y la página cae en 'Algo salió mal'");
    for (const ruta of ["/inventario", "/movimientos", "/reportes/existencias", "/admin/insumos", "/admin/usuarios", "/admin/proveedores"]) {
      await debeCargar(page, `${ruta}?q=%00`);
    }
  });

  test("B-04: una fecha 'desde' en el año 9999 no debe provocar un error en los reportes", async ({ page }) => {
    bugConocido("B-04: ?desde=9999-12-31 genera una fecha fuera de rango (finDelDia → año 10000) y el reporte cae en 'Algo salió mal'");
    for (const ruta of ["/reportes/movimientos", "/reportes/consumo", "/reportes/vencimientos"]) {
      await debeCargar(page, `${ruta}?desde=9999-12-31`);
    }
  });
});
