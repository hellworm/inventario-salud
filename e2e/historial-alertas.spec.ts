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
    await registrarRetiro(bodeguero, insumo, BODEGA, 4, { motivo });

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
    // Para quien puede ingresar, el estado es el de la pestaña y la fila trae la acción.
    await expect(principal.locator('a[aria-current="page"]')).toContainText("Bajo mínimo");
    await expect(bajo).toContainText(/4\s*de\s*5/, { useInnerText: true });
    await expect(bajo).toContainText(/Falta\s*1\s*caja(?!s)|\b1\s*caja(?!s)/, { useInnerText: true });
    await expect(bajo.getByRole("link", { name: `Ingresar ${insumo.nombre}` })).toHaveAttribute(
      "href",
      new RegExp(`^/movimientos/ingreso\\?insumo=${insumo.id}&ubicacion=[a-z0-9]+$`),
    );
    // Quien solo consulta ve el estado en la fila y ninguna acción.
    const visita = await abrirComo("visita");
    await visita.goto(`/alertas?tab=bajo-minimo&q=${insumo.codigo}`);
    const bajoVisita = filaVisible(visita, insumo.codigo);
    await expect(bajoVisita).toContainText("Bajo mínimo");
    await expect(bajoVisita).toContainText(/4\s*de\s*5/, { useInnerText: true });
    await expect(visita.getByRole("main").getByRole("link", { name: /^Ingresar/ })).toHaveCount(0);
    await bodeguero.goto(`/alertas?tab=sin-stock&q=${insumo.codigo}`);
    await expect(principal).not.toContainText(insumo.nombre);
    await expect(await filaDeInventario(bodeguero, insumo)).toContainText("Bajo mínimo");
    // El filtro de estado del inventario coincide con la alerta.
    await bodeguero.goto(`/inventario?estado=BAJO_MINIMO&q=${insumo.codigo}`);
    await expect(filaVisible(bodeguero, insumo.codigo)).toBeVisible();

    // Retiro del resto (4 de 4: pide confirmación) → sin stock.
    await registrarRetiro(bodeguero, insumo, BODEGA, 4, { masDeLaMitad: true });
    await bodeguero.goto(`/alertas?tab=sin-stock&q=${insumo.codigo}`);
    const sinStock = filaVisible(bodeguero, insumo.codigo);
    await expect(principal.locator('a[aria-current="page"]')).toContainText("Sin stock");
    await expect(sinStock).toContainText(/0\s*de\s*5/, { useInnerText: true });
    await visita.goto(`/alertas?tab=sin-stock&q=${insumo.codigo}`);
    await expect(filaVisible(visita, insumo.codigo)).toContainText("Sin stock");
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

  test("semáforo: un lote que vence en 20 días está en la pestaña Rojo y uno a 4 meses en Amarillo; el verde no es alerta", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin);
    const rojo = `RJ-${insumo.sufijo}`;
    const amarillo = `AM-${insumo.sufijo}`;
    const verde = `VD-${insumo.sufijo}`;
    await registrarIngreso(admin, { insumo, ubicacion: BODEGA, lote: rojo, vence: diaSantiago(20), cantidad: 2 });
    await registrarIngreso(admin, { insumo, ubicacion: BODEGA, lote: amarillo, vence: diaSantiago(125), cantidad: 3 });
    await registrarIngreso(admin, { insumo, ubicacion: BODEGA, lote: verde, vence: diaSantiago(300), cantidad: 4 });

    const bodeguero = await abrirComo("bodega");
    const principal = bodeguero.getByRole("main");
    await bodeguero.goto(`/alertas?tab=rojo&q=${insumo.codigo}`);
    const fila = filaVisible(bodeguero, rojo);
    await expect(fila).toContainText(insumo.nombre);
    // Color + nombre del color + días: nunca solo color.
    await expect(fila).toContainText("Rojo");
    await expect(fila).toContainText("20 días");
    await expect(principal).not.toContainText(amarillo);
    await expect(principal).not.toContainText(verde);
    // Leyenda del semáforo a la vista.
    await expect(principal.getByRole("list", { name: "Semáforo de vencimiento" })).toContainText("vence en menos de 3 meses");

    await bodeguero.goto(`/alertas?tab=amarillo&q=${insumo.codigo}`);
    await expect(filaVisible(bodeguero, amarillo)).toContainText("Amarillo");
    await expect(filaVisible(bodeguero, amarillo)).toContainText("125 días");
    await expect(principal).not.toContainText(rojo);
    await expect(principal).not.toContainText(verde);

    // Los contadores de las pestañas con ese filtro: 1 rojo, 1 amarillo, 0 vencidos.
    const pestanas = bodeguero.getByRole("navigation", { name: "Tipos de alerta" });
    await expect(pestanas.getByRole("link", { name: /^Rojo/ })).toContainText("1");
    await expect(pestanas.getByRole("link", { name: /^Amarillo/ })).toContainText("1");
    await expect(pestanas.getByRole("link", { name: /^Vencidos/ })).toContainText("0");

    // Enlace antiguo (tramos de 30/60/90 días): abre la pestaña Rojo.
    await bodeguero.goto(`/alertas?tab=por-vencer&tramo=30&q=${insumo.codigo}`);
    await expect(pestanas.getByRole("link", { name: /^Rojo/ })).toHaveAttribute("aria-current", "page");
    await expect(filaVisible(bodeguero, rojo)).toBeVisible();

    // Inventario: el insumo toma el color de su lote que vence antes (rojo) y muestra el desglose.
    const enGrilla = await filaDeInventario(bodeguero, insumo);
    await expect(enGrilla).toContainText("Rojo");
    await expect(enGrilla.getByRole("img", { name: "Lotes: 1 en rojo, 1 en amarillo, 1 en verde" }).first()).toBeVisible();
    // El filtro por color muestra los insumos con ALGÚN lote de ese color.
    for (const color of ["rojo", "amarillo", "verde"]) {
      await bodeguero.goto(`/inventario?semaforo=${color}&q=${insumo.codigo}`);
      await expect(filaVisible(bodeguero, insumo.codigo), `filtro ${color}`).toBeVisible();
    }
    await bodeguero.goto(`/inventario?semaforo=vencido&q=${insumo.codigo}`);
    await expect(principal).toContainText("Ningún insumo coincide");

    // La ficha muestra cada lote con su color.
    await bodeguero.goto(`/inventario/${insumo.id}`);
    await expect(filaVisible(bodeguero, rojo)).toContainText("Rojo");
    await expect(filaVisible(bodeguero, amarillo)).toContainText("Amarillo");
    await expect(filaVisible(bodeguero, verde)).toContainText("Verde");
  });
});
