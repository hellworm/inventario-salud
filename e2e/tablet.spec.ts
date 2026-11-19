import { diaSantiago, UBICACIONES } from "./soporte/entorno";
import { abrirRetiro, crearInsumo, enviarRetiro, registrarIngreso } from "./soporte/datos";
import { expect, test } from "./soporte/fixtures";
import type { Page } from "@playwright/test";

/**
 * Tablet horizontal (1024 × 768, táctil): se ejecuta solo en el proyecto
 * `tablet` (etiqueta @tablet). A este ancho el menú lateral es una columna de
 * íconos y las pantallas no deben desbordar hacia los lados.
 */

/** La página no se puede desplazar horizontalmente y nada visible se sale del ancho. */
async function sinDesbordeHorizontal(pagina: Page, contexto: string): Promise<void> {
  const medidas = await pagina.evaluate(() => {
    const raiz = document.documentElement;
    const fuera: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("main *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Lo que vive dentro de un contenedor con desplazamiento propio (tablas anchas) no cuenta.
      let padre: HTMLElement | null = el.parentElement;
      let recortado = false;
      while (padre && padre !== document.body) {
        const estilo = getComputedStyle(padre);
        if (/(auto|scroll|hidden|clip)/.test(estilo.overflowX)) {
          recortado = true;
          break;
        }
        padre = padre.parentElement;
      }
      if (!recortado && r.right > raiz.clientWidth + 1) fuera.push(`${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 40)} → ${Math.round(r.right)}`);
    }
    return { ancho: raiz.clientWidth, contenido: raiz.scrollWidth, fuera: fuera.slice(0, 5) };
  });
  expect(medidas.contenido, `${contexto}: el documento desborda (${medidas.contenido} > ${medidas.ancho})`).toBeLessThanOrEqual(medidas.ancho);
  expect(medidas.fuera, `${contexto}: elementos fuera del ancho visible`).toEqual([]);
}

test.describe("Tablet 1024 × 768 @tablet", () => {
  test("panel y formularios de movimiento caben sin desborde horizontal @tablet", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    expect(admin.viewportSize()).toEqual({ width: 1024, height: 768 });
    const pantallas: [string, string][] = [
      ["/panel", "Hola"],
      ["/movimientos/ingreso", "Registrar ingreso"],
      ["/movimientos/retiro", "Registrar retiro"],
      ["/movimientos/traslado", "Registrar traslado"],
      ["/movimientos/ajuste", "Ajuste o merma"],
      ["/inventario", "Inventario"],
      ["/alertas", "Alertas"],
      ["/movimientos", "Historial de movimientos"],
    ];
    for (const [ruta, titulo] of pantallas) {
      await admin.goto(ruta);
      await expect(admin.getByRole("heading", { level: 1 })).toContainText(titulo);
      await sinDesbordeHorizontal(admin, ruta);
    }

    // Con un insumo elegido aparecen el panel de existencias y el plan FEFO: tampoco desbordan.
    const insumo = await crearInsumo(admin, { nombre: `Insumo de nombre bastante largo para probar el ancho en tablet ${Date.now().toString(36)}` });
    await registrarIngreso(admin, { insumo, ubicacion: UBICACIONES.nunoaBodega, lote: `TB-${insumo.sufijo}`, vence: diaSantiago(60), cantidad: 12 });
    await sinDesbordeHorizontal(admin, "confirmación de ingreso");
    await abrirRetiro(admin, insumo, UBICACIONES.nunoaBodega);
    await admin.getByRole("textbox", { name: "Cantidad a retirar" }).fill("5");
    await expect(admin.getByRole("form", { name: "Registrar retiro" })).toContainText("Se descontará de este lote");
    await sinDesbordeHorizontal(admin, "retiro con insumo elegido");
    await enviarRetiro(admin);
    await expect(admin.getByRole("heading", { name: "Retiro registrado" })).toBeVisible();
    await sinDesbordeHorizontal(admin, "confirmación de retiro");
    await admin.goto(`/inventario/${insumo.id}`);
    await sinDesbordeHorizontal(admin, "ficha del insumo");
  });

  test("el menú lateral queda colapsado en íconos y se puede usar completo @tablet", async ({ abrirComo }) => {
    const bodeguero = await abrirComo("bodega");
    await bodeguero.goto("/panel");
    const lateral = bodeguero.locator('[data-shell="lateral"]');
    await expect(lateral).toBeVisible();
    // Columna angosta de íconos: no ocupa el ancho del menú completo y no hay barra inferior.
    const caja = await lateral.boundingBox();
    expect(caja?.width ?? 0).toBeLessThan(100);
    await expect(bodeguero.locator('[data-shell="inferior"]')).toBeHidden();

    // Cada ícono conserva su nombre accesible, mide al menos 44 px y navega.
    const principal = lateral.getByRole("navigation", { name: "Principal" });
    for (const nombre of ["Panel", "Inventario", "Alertas", "Movimientos", "Ingreso", "Retiro"]) {
      const enlace = principal.getByRole("link", { name: nombre, exact: true });
      await expect(enlace).toBeVisible();
      const medida = await enlace.boundingBox();
      expect(Math.min(medida?.width ?? 0, medida?.height ?? 0), `objetivo táctil de "${nombre}"`).toBeGreaterThanOrEqual(44);
    }
    await expect(principal.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
    await principal.getByRole("link", { name: "Inventario", exact: true }).tap();
    await expect(bodeguero).toHaveURL(/\/inventario$/);
    await expect(bodeguero.getByRole("heading", { level: 1, name: "Inventario" })).toBeVisible();
    await expect(principal.getByRole("link", { name: "Inventario", exact: true })).toHaveAttribute("aria-current", "page");

    // El botón inferior abre el menú completo, con los nombres a la vista.
    await lateral.getByRole("button", { name: "Abrir menú completo" }).tap();
    const menu = bodeguero.getByRole("dialog", { name: "Menú de navegación" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("link", { name: "Retiro", exact: true })).toBeVisible();
    await expect(menu.getByText("Registrar", { exact: true })).toBeVisible();
    await menu.getByRole("link", { name: "Retiro", exact: true }).tap();
    await expect(bodeguero).toHaveURL(/\/movimientos\/retiro$/);
    await expect(menu).toBeHidden();
    await expect(bodeguero.getByRole("heading", { level: 1, name: "Registrar retiro" })).toBeVisible();
  });

  test("los botones de fila miden al menos 44 px con pantalla táctil @tablet", async ({ abrirComo }) => {
    const bodeguero = await abrirComo("bodega");
    for (const ruta of ["/inventario", "/movimientos"]) {
      await bodeguero.goto(ruta);
      const botones = bodeguero.getByRole("main").locator("tbody tr button[data-fila]");
      await expect(botones.first()).toBeVisible();
      const altos = await botones.evaluateAll((bs) => bs.slice(0, 10).map((b) => Math.round(b.getBoundingClientRect().height)));
      expect(Math.min(...altos), `${ruta}: alto mínimo de los botones de fila (${altos.join(", ")})`).toBeGreaterThanOrEqual(44);
    }
  });
});
