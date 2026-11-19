import { comoSeMuestra, CUENTAS, diaSantiago, UBICACIONES } from "./soporte/entorno";
import {
  cajas,
  crearInsumo,
  disponibleEnFicha,
  esperarStockEnGrilla,
  filaDeLote,
  llenarIngreso,
  registrarIngreso,
} from "./soporte/datos";
import { expect, test } from "./soporte/fixtures";

const BODEGA = UBICACIONES.nunoaBodega;

test.describe("Ingresos de stock", () => {
  test("ingreso con lote nuevo: el stock de la grilla sube exactamente esa cantidad @movil", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin);
    const bodeguero = await abrirComo("bodega");

    await registrarIngreso(bodeguero, { insumo, ubicacion: BODEGA, lote: `L1-${insumo.sufijo}`, vence: diaSantiago(200), cantidad: 7 });
    const confirmacion = bodeguero.getByRole("status").filter({ hasText: "Ingreso registrado" });
    await expect(confirmacion).toContainText("Ingresaste 7 cajas");
    await expect(confirmacion).toContainText("Lote nuevo");
    await esperarStockEnGrilla(bodeguero, insumo, 7);

    await registrarIngreso(bodeguero, { insumo, ubicacion: BODEGA, lote: `L2-${insumo.sufijo}`, vence: diaSantiago(300), cantidad: 5 });
    await expect(bodeguero.getByRole("status").filter({ hasText: "Ingreso registrado" })).toContainText("ahora hay 12 cajas");
    await esperarStockEnGrilla(bodeguero, insumo, 12);
    expect(await disponibleEnFicha(bodeguero, insumo)).toBe(12);
  });

  test("ingreso a un lote existente: suma al lote y conserva su vencimiento @movil", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin);
    const bodeguero = await abrirComo("bodega");
    const lote = `LX-${insumo.sufijo}`;
    const vence = diaSantiago(150);

    await registrarIngreso(bodeguero, { insumo, ubicacion: BODEGA, lote, vence, cantidad: 6 });
    await esperarStockEnGrilla(bodeguero, insumo, 6);

    // Segundo ingreso al mismo lote, escrito en minúsculas: se reconoce y no pide fecha.
    await llenarIngreso(bodeguero, { insumo, ubicacion: BODEGA, lote: lote.toLowerCase(), cantidad: 4 });
    await expect(bodeguero.getByText("Lote existente")).toBeVisible();
    await expect(bodeguero.getByRole("form", { name: "Registrar ingreso" })).toContainText(comoSeMuestra(vence));
    await bodeguero.getByRole("button", { name: "Registrar ingreso" }).click();
    const confirmacion = bodeguero.getByRole("status").filter({ hasText: "Ingreso registrado" });
    await expect(confirmacion).toContainText("Lote que ya existía");
    await expect(confirmacion).toContainText(`Lote ${lote} en ${BODEGA.nombre}`);

    await esperarStockEnGrilla(bodeguero, insumo, 10);
    expect(await disponibleEnFicha(bodeguero, insumo)).toBe(10);
    const fila = filaDeLote(bodeguero, lote);
    await expect(fila).toContainText(cajas(10), { useInnerText: true });
    await expect(fila).toContainText(comoSeMuestra(vence));
    // Un solo lote: el segundo ingreso no creó otro.
    await expect(bodeguero.getByRole("region", { name: "Resumen de stock" })).toContainText("en 1 lote");
  });

  test("valida cantidad, lote y vencimiento antes de registrar", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin);
    const formulario = admin.getByRole("form", { name: "Registrar ingreso" });
    const enviar = admin.getByRole("button", { name: "Registrar ingreso" });

    await admin.goto(`/movimientos/ingreso?insumo=${insumo.id}`);
    await enviar.click();
    await expect(formulario).toContainText("Elige la ubicación donde quedará guardado");
    await expect(formulario).toContainText("Ingresa el número de lote");
    await expect(formulario).toContainText("Este insumo controla vencimiento: ingresa la fecha del lote");
    await expect(formulario).toContainText("Ingresa la cantidad");

    // Cantidad 0 y fecha pasada.
    await llenarIngreso(admin, { insumo, ubicacion: BODEGA, lote: `LV-${insumo.sufijo}`, vence: diaSantiago(-1), cantidad: 0 });
    await enviar.click();
    await expect(formulario).toContainText("La cantidad debe ser mayor que cero");
    await expect(formulario).toContainText("Esa fecha ya pasó: no se pueden ingresar lotes vencidos");
    await expect(admin.getByRole("heading", { name: "Ingreso registrado" })).toBeHidden();

    // El campo de cantidad solo acepta dígitos: signos y decimales se descartan al escribir.
    const cantidad = admin.getByRole("textbox", { name: "Cantidad" });
    await cantidad.fill("");
    await cantidad.pressSequentially("-1,5e2");
    await expect(cantidad).toHaveValue("152");

    // Nada de lo anterior dejó stock: el insumo sigue sin existencias.
    await admin.goto(`/inventario?q=${insumo.codigo}`);
    await expect(admin.getByRole("main")).not.toContainText(insumo.nombre);
  });

  test("un lote que vence hoy todavía se puede ingresar (límite en hora de Chile)", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin);
    const hoy = diaSantiago(0);
    await registrarIngreso(admin, { insumo, ubicacion: BODEGA, lote: `LH-${insumo.sufijo}`, vence: hoy, cantidad: 3 });
    expect(await disponibleEnFicha(admin, insumo)).toBe(3);
    const fila = filaDeLote(admin, `LH-${insumo.sufijo}`);
    await expect(fila).toContainText(comoSeMuestra(hoy));
    await expect(fila).toContainText("Vence hoy");
    await expect(admin.getByRole("region", { name: "Resumen de stock" })).toContainText("Sin stock vencido");
  });

  test("insumo que no controla vencimiento: ingreso sin fecha", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin, { controlaVencimiento: false });
    await registrarIngreso(admin, { insumo, ubicacion: BODEGA, lote: `SV-${insumo.sufijo}`, cantidad: 2 });
    await esperarStockEnGrilla(admin, insumo, 2);
    await admin.goto(`/inventario/${insumo.id}`);
    await expect(filaDeLote(admin, `SV-${insumo.sufijo}`)).toContainText("Sin vencimiento");
  });

  test("el ingreso queda a nombre de quien lo registró", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin);
    const bodeguero = await abrirComo("bodega");
    await registrarIngreso(bodeguero, {
      insumo,
      ubicacion: BODEGA,
      lote: `LU-${insumo.sufijo}`,
      vence: diaSantiago(90),
      cantidad: 11,
      documento: `Guía ${insumo.sufijo}`,
    });
    await bodeguero.goto(`/inventario/${insumo.id}`);
    const ultimos = bodeguero.getByRole("table", { name: "Últimos movimientos del insumo" });
    await expect(ultimos.getByRole("row").nth(1)).toContainText("Ingreso");
    await expect(ultimos.getByRole("row").nth(1)).toContainText("+11");
    await expect(ultimos.getByRole("row").nth(1)).toContainText(CUENTAS.bodega.nombre);
  });
});
