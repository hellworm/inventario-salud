import { CENTROS, CUENTAS, diaSantiago, UBICACIONES } from "./soporte/entorno";
import {
  crearInsumo,
  definirMinimo,
  filaDeInventario,
  filaVisible,
  registrarIngreso,
  registrarRetiro,
} from "./soporte/datos";
import { expect, test } from "./soporte/fixtures";

const BODEGA = UBICACIONES.nunoaBodega;

test.describe("Historial de movimientos", () => {
  test("muestra cada movimiento con tipo, cantidad, saldo del lote, ubicación y usuario @movil", async ({ abrirComo, isMobile }) => {
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin);
    const lote = `H-${insumo.sufijo}`;
    const motivo = `Turno e2e ${insumo.sufijo}`;
    const bodeguero = await abrirComo("bodega");
    await registrarIngreso(bodeguero, { insumo, ubicacion: BODEGA, lote, vence: diaSantiago(75), cantidad: 9 });
    await registrarRetiro(bodeguero, insumo, BODEGA, 4, motivo);

    await bodeguero.goto(`/movimientos?insumo=${insumo.id}`);
    await expect(bodeguero.getByRole("main").getByRole("status").filter({ hasText: /movimiento/ })).toContainText(/^2\s*movimientos/);

    // Más recientes primero: el retiro va antes que el ingreso.
    const filas = bodeguero.getByRole("main").locator("tbody tr, li").filter({ hasText: lote }).filter({ visible: true });
    await expect(filas).toHaveCount(2);
    await expect(filas.nth(0)).toContainText("Retiro");
    await expect(filas.nth(0)).toContainText(/−4\s*cajas/, { useInnerText: true });
    await expect(filas.nth(0)).toContainText(BODEGA.nombre);
    await expect(filas.nth(0)).toContainText(CUENTAS.bodega.nombre);
    await expect(filas.nth(1)).toContainText("Ingreso");
    await expect(filas.nth(1)).toContainText(/\+9\s*cajas/, { useInnerText: true });
    if (!isMobile) {
      // Columna "Saldo del lote": 5 tras el retiro, 9 tras el ingreso.
      await expect(filas.nth(0).getByRole("cell").nth(4)).toHaveText("5");
      await expect(filas.nth(1).getByRole("cell").nth(4)).toHaveText("9");
    }

    // Detalle del movimiento.
    await filas.nth(0).getByRole("button").first().click();
    const detalle = bodeguero.getByRole("dialog");
    await expect(detalle).toContainText(`Retiro · ${insumo.nombre}`);
    await expect(detalle).toContainText(`por ${CUENTAS.bodega.nombre}`);
    await expect(detalle).toContainText(/Saldo del lote después\s*5 cajas/);
    await expect(detalle).toContainText(lote);
    await expect(detalle).toContainText(motivo);
  });

  test("el administrador ve el movimiento del bodeguero con su nombre, y los filtros lo encuentran", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin);
    const lote = `HF-${insumo.sufijo}`;
    const bodeguero = await abrirComo("bodega");
    await registrarIngreso(bodeguero, { insumo, ubicacion: BODEGA, lote, vence: diaSantiago(75), cantidad: 6 });
    await registrarRetiro(admin, insumo, BODEGA, 1);

    // Búsqueda por número de lote + tipo.
    await admin.goto(`/movimientos?q=${lote}&tipo=INGRESO`);
    const fila = filaVisible(admin, lote);
    await expect(fila).toContainText("Ingreso");
    await expect(fila).toContainText(CUENTAS.bodega.nombre);
    await expect(fila).toContainText(CENTROS.nunoa);
    await expect(admin.getByRole("main").locator("tbody tr").filter({ hasText: lote })).toHaveCount(1);

    // Filtro por fecha: hoy lo incluye; ayer no.
    await admin.goto(`/movimientos?insumo=${insumo.id}&desde=${diaSantiago(0)}&hasta=${diaSantiago(0)}`);
    await expect(admin.getByRole("main").locator("tbody tr").filter({ hasText: lote })).toHaveCount(2);
    await admin.goto(`/movimientos?insumo=${insumo.id}&desde=${diaSantiago(-3)}&hasta=${diaSantiago(-1)}`);
    await expect(admin.getByRole("main").locator("tbody tr").filter({ hasText: lote })).toHaveCount(0);
  });
});

test.describe("Alertas de stock", () => {
  test("un retiro que cruza el mínimo genera 'bajo mínimo'; al agotarse pasa a 'sin stock' @movil", async ({ abrirComo, isMobile }) => {
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin);
    await definirMinimo(admin, insumo, CENTROS.nunoa, 5, 20);
    const bodeguero = await abrirComo("bodega");
    const principal = bodeguero.getByRole("main");

    // Con mínimo definido y sin stock, ya figura como "sin stock".
    await bodeguero.goto(`/alertas?tab=sin-stock&q=${insumo.codigo}`);
    await expect(filaVisible(bodeguero, insumo.codigo)).toContainText(/0\s*de\s*5/, { useInnerText: true });

    // 8 cajas ≥ mínimo 5: sin alertas de stock.
    await registrarIngreso(bodeguero, { insumo, ubicacion: BODEGA, lote: `A-${insumo.sufijo}`, vence: diaSantiago(365), cantidad: 8 });
    for (const tab of ["sin-stock", "bajo-minimo"]) {
      await bodeguero.goto(`/alertas?tab=${tab}&q=${insumo.codigo}`);
      await expect(principal.getByRole("heading", { level: 1, name: "Alertas" })).toBeVisible();
      await expect(principal).not.toContainText(insumo.nombre);
    }
    await expect(await filaDeInventario(bodeguero, insumo)).toContainText("Stock suficiente");

    // Retiro de 4 → quedan 4 < 5: bajo mínimo.
    await registrarRetiro(bodeguero, insumo, BODEGA, 4);
    await bodeguero.goto(`/alertas?tab=bajo-minimo&q=${insumo.codigo}`);
    const bajo = filaVisible(bodeguero, insumo.codigo);
    await expect(bajo).toContainText("Bajo mínimo");
    await expect(bajo).toContainText(/4\s*de\s*5/, { useInnerText: true });
    await bodeguero.goto(`/alertas?tab=sin-stock&q=${insumo.codigo}`);
    await expect(principal).not.toContainText(insumo.nombre);
    await expect(await filaDeInventario(bodeguero, insumo)).toContainText("Bajo mínimo");
    // El filtro de estado del inventario coincide con la alerta.
    await bodeguero.goto(`/inventario?estado=BAJO_MINIMO&q=${insumo.codigo}`);
    await expect(filaVisible(bodeguero, insumo.codigo)).toBeVisible();

    // Retiro del resto → sin stock.
    await registrarRetiro(bodeguero, insumo, BODEGA, 4);
    await bodeguero.goto(`/alertas?tab=sin-stock&q=${insumo.codigo}`);
    const sinStock = filaVisible(bodeguero, insumo.codigo);
    await expect(sinStock).toContainText("Sin stock");
    await expect(sinStock).toContainText(/0\s*de\s*5/, { useInnerText: true });
    await bodeguero.goto(`/alertas?tab=bajo-minimo&q=${insumo.codigo}`);
    await expect(principal).not.toContainText(insumo.nombre);
    await expect(await filaDeInventario(bodeguero, insumo)).toContainText("Sin stock");

    // La lista de reposición sugiere reponer hasta el máximo (20).
    await bodeguero.goto(`/alertas/reposicion?q=${insumo.codigo}`);
    const reposicion = filaVisible(bodeguero, insumo.codigo);
    await expect(reposicion).toContainText("Sin stock");
    if (!isMobile) {
      // Disponible 0 · mínimo 5 · máximo 20 · falta mínimo 5 · falta máximo 20 · sugerido 20
      await expect(reposicion).toContainText(/Sin stock\s+0\s+5\s+20\s+5\s+20\s+20\s*$/, { useInnerText: true });
    }

    // La alerta es del centro de Ñuñoa: Valparaíso no la ve.
    const valpo = await abrirComo("valpo");
    await valpo.goto(`/alertas?tab=sin-stock&q=${insumo.codigo}`);
    await expect(valpo.getByRole("heading", { level: 1, name: "Alertas" })).toBeVisible();
    await expect(valpo.getByRole("main")).not.toContainText(insumo.nombre);
  });

  test("un lote por vencer aparece en la pestaña 'por vencer' con su tramo", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin);
    const lote = `PV-${insumo.sufijo}`;
    await registrarIngreso(admin, { insumo, ubicacion: BODEGA, lote, vence: diaSantiago(20), cantidad: 2 });

    const bodeguero = await abrirComo("bodega");
    await bodeguero.goto(`/alertas?tab=por-vencer&q=${insumo.codigo}`);
    const fila = filaVisible(bodeguero, lote);
    await expect(fila).toContainText(insumo.nombre);
    await expect(fila).toContainText("Vence en 20 días");
    // Tramos excluyentes: está en 30 días, no en 31–60.
    await bodeguero.goto(`/alertas?tab=por-vencer&tramo=30&q=${insumo.codigo}`);
    await expect(filaVisible(bodeguero, lote)).toBeVisible();
    await bodeguero.goto(`/alertas?tab=por-vencer&tramo=60&q=${insumo.codigo}`);
    await expect(bodeguero.getByRole("heading", { level: 1, name: "Alertas" })).toBeVisible();
    await expect(bodeguero.getByRole("main")).not.toContainText(lote);
    await expect(await filaDeInventario(bodeguero, insumo)).toContainText("Vence en 20 días");
  });
});
