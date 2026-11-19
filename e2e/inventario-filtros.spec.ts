import { expect, sesionDe, test } from "./soporte/fixtures";

/** Número del contador "N insumos" de la grilla. */
async function totalDeLaGrilla(pagina: import("@playwright/test").Page): Promise<number> {
  const texto = await pagina.getByRole("main").getByRole("status").filter({ hasText: /insumos?/ }).locator("strong").innerText();
  return Number(texto.replace(/\./g, ""));
}

test.describe("Inventario: filtros en la URL", () => {
  test.use(sesionDe("bodega"));

  test("búsqueda, categoría, estado y orden se reflejan en la URL y sobreviven a recargar @movil", async ({ page }) => {
    await page.goto("/inventario");
    const todos = await totalDeLaGrilla(page);
    expect(todos).toBeGreaterThan(20);

    // Búsqueda sin tildes ni mayúsculas: "dialisis" encuentra "Catéter de hemodiálisis…".
    await page.getByRole("searchbox", { name: "Buscar en el inventario" }).fill("hemodialisis");
    await expect(page).toHaveURL(/[?&]q=hemodialisis/);
    await expect(page.getByRole("main")).toContainText("Catéter de hemodiálisis doble lumen");
    expect(await totalDeLaGrilla(page)).toBeLessThan(todos);

    await page.getByRole("button", { name: "Limpiar búsqueda" }).click();
    await expect(page).not.toHaveURL(/[?&]q=/);

    await page.getByRole("combobox", { name: "Categoría" }).selectOption({ label: "Fármacos" });
    await expect(page).toHaveURL(/[?&]categoria=[a-z0-9]+/);
    await expect(page.getByRole("main")).toContainText("Heparina sódica");
    await expect(page.getByRole("main")).not.toContainText("Guantes de nitrilo");
    const farmacos = await totalDeLaGrilla(page);

    await page.getByRole("group", { name: "Filtrar por estado" }).getByRole("button", { name: "Sin stock" }).click();
    await expect(page).toHaveURL(/[?&]estado=SIN_STOCK/);
    await expect(page.getByRole("group", { name: "Filtrar por estado" }).getByRole("button", { name: "Sin stock" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("main")).toContainText("Hierro sacarosa");
    expect(await totalDeLaGrilla(page)).toBeLessThan(farmacos);

    await page.getByRole("combobox", { name: "Ordenar por" }).selectOption({ label: "Orden: Código" });
    await expect(page).toHaveURL(/[?&]orden=/);

    // Recargar conserva exactamente la misma vista.
    const url = page.url();
    const antes = await totalDeLaGrilla(page);
    await page.reload();
    expect(page.url()).toBe(url);
    await expect(page.getByRole("combobox", { name: "Categoría" }).locator("option:checked")).toHaveText("Fármacos");
    await expect(page.getByRole("group", { name: "Filtrar por estado" }).getByRole("button", { name: "Sin stock" })).toHaveAttribute("aria-pressed", "true");
    expect(await totalDeLaGrilla(page)).toBe(antes);

    await page.getByRole("button", { name: "Limpiar filtros" }).click();
    await expect(page).toHaveURL(/\/inventario$/);
    expect(await totalDeLaGrilla(page)).toBe(todos);
  });

  test("la paginación usa ?pagina= y conserva los filtros", async ({ page }) => {
    await page.goto("/inventario?orden=codigo");
    const paginacion = page.getByRole("navigation", { name: "Paginación" });
    await expect(paginacion).toContainText("Página 1 de");
    const primeraFila = await page.getByRole("main").locator("tbody tr").first().innerText();
    await paginacion.getByRole("link", { name: "Siguiente" }).click();
    await expect(page).toHaveURL(/[?&]pagina=2/);
    await expect(page).toHaveURL(/[?&]orden=codigo/);
    await expect(paginacion).toContainText("Página 2 de");
    expect(await page.getByRole("main").locator("tbody tr").first().innerText()).not.toBe(primeraFila);
    await paginacion.getByRole("link", { name: "Anterior" }).click();
    await expect(paginacion).toContainText("Página 1 de");
    expect(await page.getByRole("main").locator("tbody tr").first().innerText()).toBe(primeraFila);
  });

  test("abrir un insumo desde la grilla queda en la URL (?ver=) y el botón atrás cierra el panel", async ({ page }) => {
    await page.goto("/inventario?q=HEP-5000");
    await page.getByRole("main").locator("tbody tr").first().getByRole("button").first().click();
    await expect(page).toHaveURL(/[?&]ver=[a-z0-9]+/);
    const panel = page.getByRole("dialog");
    await expect(panel).toContainText("Heparina sódica 5.000 UI/ml");
    await expect(panel.getByRole("region", { name: "Dónde está" })).toBeVisible();
    await page.goBack();
    await expect(panel).toBeHidden();
    await expect(page).toHaveURL(/\/inventario\?q=HEP-5000$/);
  });

  test("búsquedas con tildes, ñ, comillas y comodines SQL no rompen ni devuelven todo", async ({ page }) => {
    await page.goto("/inventario");
    const todos = await totalDeLaGrilla(page);
    const casos: [string, (n: number) => void][] = [
      ["Lidocaína", (n) => expect(n).toBe(1)],
      ["LIDOCAINA", (n) => expect(n).toBe(1)],
      ["%", (n) => expect(n).toBeLessThan(todos)],
      ["_", (n) => expect(n).toBeLessThan(todos)],
      ["'", (n) => expect(n).toBe(0)],
      ['21G × 1½"', (n) => expect(n).toBe(1)],
      ["ñandú; DROP TABLE insumos;--", (n) => expect(n).toBe(0)],
      ["<script>alert(1)</script>", (n) => expect(n).toBe(0)],
    ];
    for (const [texto, comprobar] of casos) {
      const respuesta = await page.goto(`/inventario?q=${encodeURIComponent(texto)}`);
      expect(respuesta?.status(), `q=${texto}`).toBe(200);
      await expect(page.getByRole("searchbox", { name: "Buscar en el inventario" })).toHaveValue(texto);
      comprobar(await totalDeLaGrilla(page));
    }
  });
});
