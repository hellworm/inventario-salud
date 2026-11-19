import type { Page } from "@playwright/test";
import { CENTROS } from "./soporte/entorno";
import { bugConocido, expect, sesionDe, test } from "./soporte/fixtures";

/**
 * Los mismos números vistos desde distintos módulos deben cuadrar.
 * Se usa Valparaíso: el resto de la suite no altera sus alertas (los tests
 * que mueven stock trabajan en Ñuñoa y Concepción), así que es estable.
 */

async function numero(pagina: Page, patron: RegExp, texto: string): Promise<number> {
  const hallado = patron.exec(texto.replace(/\s+/g, " "));
  expect(hallado, `no se encontró ${patron} en "${texto.slice(0, 200)}"`).not.toBeNull();
  return Number((hallado as RegExpExecArray)[1].replace(/\./g, ""));
}

async function contadorDeInventario(pagina: Page, estado: string): Promise<number> {
  await pagina.goto(`/inventario?estado=${estado}`);
  const texto = await pagina.getByRole("main").getByRole("status").filter({ hasText: /insumos?/ }).locator("strong").innerText();
  return Number(texto.replace(/\./g, ""));
}

test.describe("Coherencia entre panel, alertas, inventario y reposición", () => {
  test.use(sesionDe("valpo"));

  test("los contadores del panel coinciden con las pestañas de alertas y con los filtros del inventario", async ({ page }) => {
    await page.goto("/panel");
    await expect(page.getByRole("main")).toContainText(CENTROS.valpo);
    const indicadores = await page.getByRole("region", { name: "Indicadores" }).innerText();
    const panel = {
      sinStock: await numero(page, /Sin stock (\d[\d.]*)/, indicadores),
      bajoMinimo: await numero(page, /Bajo el mínimo (\d[\d.]*)/, indicadores),
      vencidos: await numero(page, /Lotes vencidos (\d[\d.]*)/, indicadores),
      vencen30: await numero(page, /Vencen en 30 días (\d[\d.]*)/, indicadores),
      vencen31a90: await numero(page, /(\d[\d.]*) más entre 31 y 90 días/, indicadores),
    };

    await page.goto("/alertas");
    const pestanas = await page.getByRole("navigation", { name: "Tipos de alerta" }).innerText();
    const alertas = {
      sinStock: await numero(page, /Sin stock (\d[\d.]*)/, pestanas),
      bajoMinimo: await numero(page, /Bajo mínimo (\d[\d.]*)/, pestanas),
      vencidos: await numero(page, /Vencidos (\d[\d.]*)/, pestanas),
      porVencer: await numero(page, /Por vencer (\d[\d.]*)/, pestanas),
    };
    expect(alertas.sinStock).toBe(panel.sinStock);
    expect(alertas.bajoMinimo).toBe(panel.bajoMinimo);
    expect(alertas.vencidos).toBe(panel.vencidos);
    expect(alertas.porVencer).toBe(panel.vencen30 + panel.vencen31a90);

    // El subtítulo suma todas las alertas activas.
    const subtitulo = await page.getByRole("main").locator("p").first().innerText();
    expect(await numero(page, /(\d[\d.]*) alertas? activas?/, subtitulo)).toBe(
      alertas.sinStock + alertas.bajoMinimo + alertas.vencidos + alertas.porVencer,
    );

    // Cada pestaña lista exactamente esa cantidad de filas (caben en una página).
    for (const [tab, esperado] of [
      ["sin-stock", alertas.sinStock],
      ["bajo-minimo", alertas.bajoMinimo],
      ["vencidos", alertas.vencidos],
      ["por-vencer", alertas.porVencer],
    ] as const) {
      await page.goto(`/alertas?tab=${tab}`);
      await expect(page.getByRole("main").locator("tbody tr")).toHaveCount(esperado);
    }
    // Tramos excluyentes de vencimiento: 30 + 60 + 90 = total por vencer.
    let porTramos = 0;
    for (const tramo of ["30", "60", "90"]) {
      await page.goto(`/alertas?tab=por-vencer&tramo=${tramo}`);
      await expect(page.getByRole("heading", { level: 1, name: "Alertas" })).toBeVisible();
      const filas = await page.getByRole("main").locator("tbody tr").count();
      if (tramo === "30") expect(filas).toBe(panel.vencen30);
      porTramos += filas;
    }
    expect(porTramos).toBe(alertas.porVencer);

    // Inventario de un solo centro: los filtros de estado dan los mismos conteos que las alertas.
    expect(await contadorDeInventario(page, "SIN_STOCK")).toBe(alertas.sinStock);
    expect(await contadorDeInventario(page, "BAJO_MINIMO")).toBe(alertas.bajoMinimo);
    // (Otros tests pueden agregar insumos a este centro mientras se cuenta: se reintenta.)
    await expect(async () => {
      const total = await contadorDeInventario(page, "");
      const suficientes = await contadorDeInventario(page, "OK");
      expect(alertas.sinStock + alertas.bajoMinimo + suficientes).toBe(total);
    }).toPass({ timeout: 30_000 });

    // Lista de reposición = sin stock + bajo mínimo.
    await page.goto("/alertas/reposicion");
    const resumen = await page.getByRole("main").locator("p").first().innerText();
    expect(await numero(page, /(\d[\d.]*) insumos? por reponer/, resumen)).toBe(alertas.sinStock + alertas.bajoMinimo);
    expect(await numero(page, /(\d[\d.]*) sin stock/, resumen)).toBe(alertas.sinStock);
  });

  test("una alerta de 'sin stock' lleva a una ficha que dice lo mismo, y de ahí al ingreso pre-rellenado", async ({ page }) => {
    await page.goto("/alertas?tab=sin-stock");
    const fila = page.getByRole("main").locator("tbody tr").first();
    const nombre = (await fila.getByRole("link").first().innerText()).split("\n")[0].trim();
    const minimo = await numero(page, /0 de (\d[\d.]*)/, await fila.innerText());
    await fila.getByRole("link").first().click();
    await expect(page).toHaveURL(/\/inventario\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(nombre);
    const resumen = await page.getByRole("region", { name: "Resumen de stock" }).innerText();
    expect(await numero(page, /Disponible[^\d]*(\d[\d.]*)/, resumen)).toBe(0);
    expect(await numero(page, /Stock mínimo (\d[\d.]*)/, resumen)).toBe(minimo);

    await page.getByRole("main").getByRole("link", { name: "Ingresar" }).first().click();
    await expect(page).toHaveURL(/\/movimientos\/ingreso\?insumo=[a-z0-9]+/);
    await expect(page.getByRole("button", { name: new RegExp(`Cambiar insumo \\(seleccionado: ${nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) })).toBeVisible();
  });

  test("B-10: las cantidades se muestran con la unidad en plural", async ({ page }) => {
    bugConocido("B-10: en alertas y panel la unidad no concuerda con la cantidad ('98 unidad', '4 frasco')");
    await page.goto("/alertas?tab=sin-stock");
    const faltante = page.getByRole("main").locator("tbody tr").first().getByRole("cell").nth(3);
    await expect(faltante).toHaveText(/^\d[\d.]* (unidades|cajas|frascos|ampollas|bolsas|pares|paquetes|rollos|litros|bidones|cartuchos|kits)$/);
  });
});
