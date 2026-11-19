import { comoSeMuestra, CUENTAS, diaSantiago, UBICACIONES } from "./soporte/entorno";
import {
  avisos,
  cajas,
  crearInsumo,
  disponibleEnFicha,
  esperarStockEnGrilla,
  filaDeLote,
  llenarIngreso,
  marcar,
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

  test("B-01: el costo con punto decimal se rechaza con un mensaje claro; con coma se guarda exacto", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin);
    const lote = `CO-${insumo.sufijo}`;
    const formulario = admin.getByRole("form", { name: "Registrar ingreso" });
    const costo = admin.getByLabel(/Costo unitario/);
    await llenarIngreso(admin, { insumo, ubicacion: BODEGA, lote, vence: diaSantiago(120), cantidad: 2 });

    // "1250.5" NO se adivina (antes se guardaba como 12.505): se pide usar coma, de inmediato.
    await costo.fill("1250.5");
    await expect(formulario).toContainText("Usa coma para los decimales: 1250,5.");
    await admin.getByRole("button", { name: "Registrar ingreso" }).click();
    await expect(costo).toHaveAttribute("aria-invalid", "true");
    await expect(admin.getByRole("heading", { name: "Ingreso registrado" })).toBeHidden();
    await admin.goto(`/inventario?q=${insumo.codigo}`);
    await expect(admin.getByRole("main"), "el intento rechazado no dejó stock").not.toContainText(insumo.nombre);

    // Con coma decimal y punto de miles: se muestra cómo se guardará y se guarda exacto.
    await llenarIngreso(admin, { insumo, ubicacion: BODEGA, lote, vence: diaSantiago(120), cantidad: 2 });
    await costo.fill("1.250,5");
    await expect(formulario).toContainText("Se guardará como $1.250,5 por caja");
    await expect(formulario).not.toContainText("Usa coma para los decimales");
    await admin.getByRole("button", { name: "Registrar ingreso" }).click();
    await expect(admin.getByRole("heading", { name: "Ingreso registrado" })).toBeVisible();

    const csv = await (await admin.request.get(`/reportes/exportar/existencias?q=${insumo.codigo}`)).text();
    const [encabezados, fila] = csv.replace(/^\ufeff/, "").split("\r\n").map((l) => l.split(";"));
    expect(fila[encabezados.indexOf("Lote")]).toBe(lote);
    // 1.250,5 por caja × 2 cajas = 2.501
    expect(fila[encabezados.indexOf("Costo unitario (CLP)")]).toBe("1250,5");
    expect(fila[encabezados.indexOf("Valor (CLP)")]).toBe("2501");
  });

  test("B-01: un costo absurdo choca con el tope de sanidad y '1.5' tampoco se adivina", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin);
    const formulario = admin.getByRole("form", { name: "Registrar ingreso" });
    const costo = admin.getByLabel(/Costo unitario/);
    await llenarIngreso(admin, { insumo, ubicacion: BODEGA, lote: `CT-${insumo.sufijo}`, vence: diaSantiago(120), cantidad: 1 });
    await costo.fill("1.5");
    await expect(formulario).toContainText("Usa coma para los decimales: 1,5.");
    await costo.fill("100.000.001");
    await expect(formulario).toContainText("El monto es demasiado grande");
    await admin.getByRole("button", { name: "Registrar ingreso" }).click();
    await expect(admin.getByRole("heading", { name: "Ingreso registrado" })).toBeHidden();
    await costo.fill("1.250");
    await expect(formulario).toContainText("Se guardará como $1.250 por caja");
  });

  test("B-06: un lote sin fecha en un insumo que pasa a controlar vencimiento pide la fecha y la completa", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin, { controlaVencimiento: false });
    const lote = `SF-${insumo.sufijo}`;
    await registrarIngreso(admin, { insumo, ubicacion: BODEGA, lote, cantidad: 5 });

    await admin.goto(`/admin/insumos/${insumo.id}`);
    await marcar(admin.getByRole("checkbox", { name: /Controla fecha de vencimiento/ }));
    await admin.getByRole("button", { name: "Guardar datos del insumo" }).click();
    await expect(avisos(admin)).toContainText(/guardad|actualizad/i);

    // Segundo ingreso al mismo lote: el formulario muestra el campo de fecha y explica por qué.
    const formulario = admin.getByRole("form", { name: "Registrar ingreso" });
    const fecha = admin.getByLabel("Vencimiento");
    await llenarIngreso(admin, { insumo, ubicacion: BODEGA, lote, cantidad: 2 });
    await expect(fecha).toBeVisible();
    await expect(formulario).toContainText("ya está registrado, pero sin fecha de vencimiento");

    // Sin fecha no se registra y el motivo queda a la vista, junto al campo.
    await admin.getByRole("button", { name: "Registrar ingreso" }).click();
    await expect(formulario.locator(":not(.sr-only)").getByText(/no tiene fecha registrada y el insumo controla vencimiento/).first()).toBeVisible();
    await expect(fecha).toHaveAttribute("aria-invalid", "true");
    await expect(admin.getByRole("heading", { name: "Ingreso registrado" })).toBeHidden();

    // Con la fecha se completa el lote existente (no crea otro) y suma al stock.
    const vence = diaSantiago(180);
    await fecha.fill(vence);
    await admin.getByRole("button", { name: "Registrar ingreso" }).click();
    const confirmacion = admin.getByRole("status").filter({ hasText: "Ingreso registrado" });
    await expect(confirmacion).toContainText("Lote que ya existía");
    expect(await disponibleEnFicha(admin, insumo)).toBe(7);
    const fila = filaDeLote(admin, lote);
    await expect(fila).toContainText(cajas(7), { useInnerText: true });
    await expect(fila).toContainText(comoSeMuestra(vence));
    await expect(admin.getByRole("region", { name: "Resumen de stock" })).toContainText("en 1 lote");
  });
});
