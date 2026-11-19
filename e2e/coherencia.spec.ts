import type { Page } from "@playwright/test";
import { CENTROS } from "./soporte/entorno";
import { expect, sesionDe, test } from "./soporte/fixtures";

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
    // Semáforo del panel: n.º de insumos y de lotes por color (y vencidos, aparte).
    const tarjeta = async (color: "VENCIDO" | "ROJO" | "AMARILLO" | "VERDE") => {
      const enlace = page.getByRole("main").locator(`a[data-semaforo="${color}"]`);
      const numeroDe = async (que: "insumos" | "lotes") => Number((await enlace.locator(`[data-conteo="${que}"]`).innerText()).replace(/[^\d]/g, ""));
      return { insumos: await numeroDe("insumos"), lotes: await numeroDe("lotes"), href: await enlace.getAttribute("href") };
    };
    const panel = {
      sinStock: await numero(page, /Sin stock (\d[\d.]*)/, indicadores),
      bajoMinimo: await numero(page, /Bajo el mínimo (\d[\d.]*)/, indicadores),
      vencido: await tarjeta("VENCIDO"),
      rojo: await tarjeta("ROJO"),
      amarillo: await tarjeta("AMARILLO"),
      verde: await tarjeta("VERDE"),
    };
    // El seed deja lotes de todos los colores en Valparaíso: la comparación no es trivial.
    for (const color of ["vencido", "rojo", "amarillo", "verde"] as const) expect(panel[color].lotes, color).toBeGreaterThan(0);
    // La lista "Productos en rojo" del panel muestra esos lotes (hasta 6), lo que vence antes primero.
    const filasEnRojo = page.getByRole("region", { name: "Productos en rojo" }).locator("tbody tr");
    await expect(filasEnRojo).toHaveCount(Math.min(panel.rojo.lotes, 6));

    await page.goto("/alertas");
    const pestanas = await page.getByRole("navigation", { name: "Tipos de alerta" }).innerText();
    const alertas = {
      sinStock: await numero(page, /Sin stock (\d[\d.]*)/, pestanas),
      bajoMinimo: await numero(page, /Bajo mínimo (\d[\d.]*)/, pestanas),
      vencidos: await numero(page, /Vencidos (\d[\d.]*)/, pestanas),
      rojo: await numero(page, /Rojo (\d[\d.]*)/, pestanas),
      amarillo: await numero(page, /Amarillo (\d[\d.]*)/, pestanas),
    };
    expect(alertas.sinStock).toBe(panel.sinStock);
    expect(alertas.bajoMinimo).toBe(panel.bajoMinimo);
    // Semáforo: los lotes del panel son los de las pestañas de alertas.
    expect(alertas.vencidos).toBe(panel.vencido.lotes);
    expect(alertas.rojo).toBe(panel.rojo.lotes);
    expect(alertas.amarillo).toBe(panel.amarillo.lotes);

    // El subtítulo suma todas las alertas activas.
    const subtitulo = await page.getByRole("main").locator("p").first().innerText();
    expect(await numero(page, /(\d[\d.]*) alertas? activas?/, subtitulo)).toBe(
      alertas.sinStock + alertas.bajoMinimo + alertas.vencidos + alertas.rojo + alertas.amarillo,
    );

    // Cada pestaña lista exactamente esa cantidad de filas (caben en una página).
    for (const [tab, esperado] of [
      ["sin-stock", alertas.sinStock],
      ["bajo-minimo", alertas.bajoMinimo],
      ["vencidos", alertas.vencidos],
      ["rojo", alertas.rojo],
      ["amarillo", alertas.amarillo],
    ] as const) {
      await page.goto(`/alertas?tab=${tab}`);
      await expect(page.getByRole("main").locator("tbody tr")).toHaveCount(esperado);
    }

    // Inventario de un solo centro: los filtros de estado dan los mismos conteos que las alertas.
    expect(await contadorDeInventario(page, "SIN_STOCK")).toBe(alertas.sinStock);
    expect(await contadorDeInventario(page, "BAJO_MINIMO")).toBe(alertas.bajoMinimo);
    // Cada tarjeta del semáforo lleva al inventario filtrado por su color, con el mismo n.º de insumos.
    for (const color of ["vencido", "rojo", "amarillo"] as const) {
      expect(panel[color].href).toBe(`/inventario?semaforo=${color}`);
      await page.goto(panel[color].href as string);
      const texto = await page.getByRole("main").getByRole("status").filter({ hasText: /insumos?/ }).locator("strong").innerText();
      expect(Number(texto.replace(/\./g, "")), `insumos con lotes en ${color}`).toBe(panel[color].insumos);
    }
    // (Otros tests pueden agregar insumos a este centro mientras se cuenta: se reintenta.)
    await expect(async () => {
      const total = await contadorDeInventario(page, "");
      const suficientes = await contadorDeInventario(page, "OK");
      expect(alertas.sinStock + alertas.bajoMinimo + suficientes).toBe(total);
    }).toPass({ timeout: 30_000 });

    // Enlaces antiguos del inventario: se redirigen al filtro de semáforo equivalente.
    await page.goto("/inventario?estado=POR_VENCER");
    await expect(page).toHaveURL(/\/inventario\?semaforo=rojo(%2C|,)amarillo$/);
    await page.goto("/inventario?estado=VENCIDO&q=x");
    await expect(page).toHaveURL(/\/inventario\?q=x&semaforo=vencido$/);

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

    // Desde la ficha, "Registrar ingreso" lleva al formulario con el insumo ya elegido.
    await page.getByRole("main").getByRole("link", { name: "Registrar ingreso" }).first().click();
    await expect(page).toHaveURL(/\/movimientos\/ingreso\?insumo=[a-z0-9]+/);
    await expect(page.getByRole("button", { name: new RegExp(`Cambiar insumo \\(seleccionado: ${nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) })).toBeVisible();
  });

  test("B-10: las cantidades se muestran con la unidad concordada (nunca '98 unidad' ni '1 cajas')", async ({ page }) => {
    const UNIDADES = [
      ["unidad", "unidades"], ["caja", "cajas"], ["frasco", "frascos"], ["ampolla", "ampollas"], ["bolsa", "bolsas"], ["par", "pares"],
      ["paquete", "paquetes"], ["rollo", "rollos"], ["litro", "litros"], ["bidón", "bidones"], ["cartucho", "cartuchos"], ["kit", "kits"],
    ] as const;
    const singulares = UNIDADES.map(([s]) => s).join("|");
    const plurales = UNIDADES.map(([, p]) => p).join("|");
    // Cantidad distinta de 1 seguida de la unidad en singular, o exactamente 1 seguida del plural.
    const pluralFaltante = new RegExp(`(?<![\\d.,])(?!1\\s)(\\d[\\d.]*)\\s+(${singulares})(?![\\p{L}])`, "giu");
    const singularFaltante = new RegExp(`(?<![\\d.,])1\\s+(${plurales})(?![\\p{L}])`, "giu");
    let cantidadesVistas = 0;
    for (const ruta of ["/alertas?tab=sin-stock", "/alertas?tab=bajo-minimo", "/alertas?tab=vencidos", "/alertas?tab=rojo", "/alertas?tab=amarillo", "/panel", "/alertas/reposicion", "/inventario"]) {
      await page.goto(ruta);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const texto = (await page.getByRole("main").innerText()).replace(/\s+/g, " ");
      expect(texto.match(pluralFaltante) ?? [], `${ruta}: cantidad ≠ 1 con la unidad en singular`).toEqual([]);
      expect(texto.match(singularFaltante) ?? [], `${ruta}: 1 con la unidad en plural`).toEqual([]);
      cantidadesVistas += (texto.match(new RegExp(`\\d\\s+(${plurales}|${singulares})(?![\\p{L}])`, "giu")) ?? []).length;
    }
    // Sanidad: de verdad se revisaron cantidades con unidad (Valparaíso tiene alertas en el seed).
    expect(cantidadesVistas).toBeGreaterThan(5);
    // Y el caso original del informe: la columna "Falta" de las alertas de stock.
    await page.goto("/alertas?tab=bajo-minimo");
    const falta = page.getByRole("main").locator("tbody tr").first().getByRole("cell").nth(2);
    await expect(falta).toHaveText(new RegExp(`^(1 (${singulares})|(?!1 )\\d[\\d.]* (${plurales}))$`, "u"));
  });
});
