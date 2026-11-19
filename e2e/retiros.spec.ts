import { diaSantiago, UBICACIONES } from "./soporte/entorno";
import {
  abrirRetiro,
  cajas,
  confirmarEnDialogo,
  crearInsumo,
  disponibleEnFicha,
  enviarRetiro,
  esperarStockEnGrilla,
  filaDeLote,
  marcar,
  registrarIngreso,
  TITULO_RETIRO_GRANDE,
  valorDeUbicacion,
  type InsumoPrueba,
} from "./soporte/datos";
import { expect, test } from "./soporte/fixtures";
import type { Page } from "@playwright/test";

const BODEGA = UBICACIONES.nunoaBodega;

/** Insumo con dos lotes en la bodega de Ñuñoa: TARDE (10, vence después) y PRONTO (4, vence antes). */
async function insumoConDosLotes(admin: Page): Promise<{ insumo: InsumoPrueba; tarde: string; pronto: string }> {
  const insumo = await crearInsumo(admin);
  const tarde = `TARDE-${insumo.sufijo}`;
  const pronto = `PRONTO-${insumo.sufijo}`;
  // Se ingresa primero el que vence DESPUÉS: FEFO debe ordenar por vencimiento, no por llegada.
  await registrarIngreso(admin, { insumo, ubicacion: BODEGA, lote: tarde, vence: diaSantiago(200), cantidad: 10 });
  await registrarIngreso(admin, { insumo, ubicacion: BODEGA, lote: pronto, vence: diaSantiago(45), cantidad: 4 });
  return { insumo, tarde, pronto };
}

/** Id de un insumo del seed a partir de su código (por el enlace a su ficha en el inventario). */
async function idDeInsumo(pagina: Page, codigo: string): Promise<string> {
  await pagina.goto(`/inventario?q=${codigo}`);
  await pagina.getByRole("main").locator("tbody tr").first().getByRole("button").first().click();
  const href = await pagina.getByRole("dialog").getByRole("link", { name: "Ver ficha completa" }).getAttribute("href");
  return (href ?? "").split("/").pop() as string;
}

test.describe("Retiros de stock", () => {
  test("retiro automático (FEFO) consume primero el lote que vence antes @movil", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const { insumo, tarde, pronto } = await insumoConDosLotes(admin);
    const bodeguero = await abrirComo("bodega");

    await abrirRetiro(bodeguero, insumo, BODEGA);
    const formulario = bodeguero.getByRole("form", { name: "Registrar retiro" });
    await expect(formulario).toContainText("En 2 lotes · se usa primero el que vence antes");
    await bodeguero.getByRole("textbox", { name: "Cantidad a retirar" }).fill("6");
    // Vista previa del plan: agota el que vence antes y toma el resto del otro.
    const plan = formulario.getByRole("listitem");
    await expect(plan.nth(0)).toContainText(`Lote ${pronto}`);
    await expect(plan.nth(0)).toContainText("−4");
    await expect(plan.nth(1)).toContainText(`Lote ${tarde}`);
    await expect(plan.nth(1)).toContainText("−2");

    // 6 de 14 no supera la mitad: se registra sin pedir confirmación.
    await enviarRetiro(bodeguero);
    const confirmacion = bodeguero.getByRole("status").filter({ hasText: "Retiro registrado" });
    await expect(confirmacion).toContainText("Retiraste 6 cajas");
    await expect(confirmacion.getByRole("listitem").nth(0)).toContainText(new RegExp(`Lote ${pronto}\\s*−4\\s*· quedan 0`));
    await expect(confirmacion.getByRole("listitem").nth(1)).toContainText(new RegExp(`Lote ${tarde}\\s*−2\\s*· quedan 8`));

    await esperarStockEnGrilla(bodeguero, insumo, 8);
    expect(await disponibleEnFicha(bodeguero, insumo)).toBe(8);
    await expect(filaDeLote(bodeguero, tarde)).toContainText(cajas(8), { useInnerText: true });
    // El lote agotado ya no figura entre las existencias.
    await expect(bodeguero.getByRole("table", { name: "Existencias por lote y ubicación" }).or(bodeguero.getByRole("main")).first()).not.toContainText(
      new RegExp(`${pronto}[\\s\\S]*Retirar`),
    );
  });

  test("retiro eligiendo un lote específico descuenta solo de ese lote @movil", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const { insumo, tarde, pronto } = await insumoConDosLotes(admin);
    const bodeguero = await abrirComo("bodega");

    await abrirRetiro(bodeguero, insumo, BODEGA);
    await marcar(bodeguero.getByRole("radio", { name: /Elegir lote/ }));
    await marcar(bodeguero.getByRole("radio", { name: new RegExp(`Lote ${tarde}`) }));
    await bodeguero.getByRole("textbox", { name: "Cantidad a retirar" }).fill("3");
    await enviarRetiro(bodeguero);
    const confirmacion = bodeguero.getByRole("status").filter({ hasText: "Retiro registrado" });
    await expect(confirmacion.getByRole("listitem")).toHaveCount(1);
    await expect(confirmacion.getByRole("listitem")).toContainText(new RegExp(`Lote ${tarde}\\s*−3\\s*· quedan 7`));

    expect(await disponibleEnFicha(bodeguero, insumo)).toBe(11);
    await expect(filaDeLote(bodeguero, tarde)).toContainText(cajas(7), { useInnerText: true });
    await expect(filaDeLote(bodeguero, pronto)).toContainText(cajas(4), { useInnerText: true });
  });

  test("no permite retirar más que el stock disponible (automático y por lote)", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const { insumo, pronto } = await insumoConDosLotes(admin);
    const bodeguero = await abrirComo("bodega");

    await abrirRetiro(bodeguero, insumo, BODEGA);
    const formulario = bodeguero.getByRole("form", { name: "Registrar retiro" });
    const cantidad = bodeguero.getByRole("textbox", { name: "Cantidad a retirar" });
    const enviar = bodeguero.getByRole("button", { name: "Registrar retiro" });

    await cantidad.fill("15");
    await expect(formulario).toContainText("Solo hay 14 cajas disponibles en Bodega central.");
    await expect(cantidad).toHaveAttribute("aria-invalid", "true");
    await enviar.click();
    await expect(bodeguero.getByRole("heading", { name: "Retiro registrado" })).toBeHidden();

    await marcar(bodeguero.getByRole("radio", { name: /Elegir lote/ }));
    await marcar(bodeguero.getByRole("radio", { name: new RegExp(`Lote ${pronto}`) }));
    await cantidad.fill("5");
    await expect(formulario).toContainText(`El lote ${pronto} tiene solo 4 cajas aquí.`);
    await enviar.click();
    await expect(bodeguero.getByRole("heading", { name: "Retiro registrado" })).toBeHidden();

    // Exactamente el total sí se puede: el borde superior es inclusivo.
    await marcar(bodeguero.getByRole("radio", { name: /Automático/ }));
    await cantidad.fill("14");
    await expect(formulario).not.toContainText("Solo hay");
    // …pero no se envía: el stock debe seguir intacto.
    expect(await disponibleEnFicha(bodeguero, insumo)).toBe(14);
  });

  test("retirar todo el stock deja el insumo en cero", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const { insumo } = await insumoConDosLotes(admin);
    await abrirRetiro(admin, insumo, BODEGA);
    await admin.getByRole("textbox", { name: "Cantidad a retirar" }).fill("14");
    await enviarRetiro(admin, { masDeLaMitad: true });
    await expect(admin.getByRole("status").filter({ hasText: "Retiro registrado" })).toContainText("quedan 0 cajas");
    expect(await disponibleEnFicha(admin, insumo)).toBe(0);

    // Sin stock: el formulario lo dice y no deja registrar.
    await abrirRetiro(admin, insumo, BODEGA);
    await expect(admin.getByRole("form", { name: "Registrar retiro" })).toContainText("No hay stock vigente para retirar aquí.");
    await expect(admin.getByRole("button", { name: "Registrar retiro" })).toBeDisabled();
  });

  test("un lote vencido no se puede retirar: solo sale como merma", async ({ abrirComo }) => {
    // Dato del seed: Lidocaína 2% (LID-2) tiene un lote vencido olvidado en la Sala 2 de Ñuñoa.
    const bodeguero = await abrirComo("bodega");
    const insumoId = await idDeInsumo(bodeguero, "LID-2");
    await bodeguero.goto("/movimientos/retiro");
    await bodeguero.getByRole("combobox", { name: "Insumo" }).fill("LID-2");
    await bodeguero.getByRole("option", { name: /Lidocaína 2% 5 ml/ }).click();
    // Una ubicación sin stock vigente ni siquiera se puede elegir como origen.
    const origen = bodeguero.getByRole("combobox", { name: "Desde la ubicación" });
    const sala2 = await valorDeUbicacion(origen, UBICACIONES.nunoaSala2);
    expect(sala2, "la Sala 2 figura entre las ubicaciones").toBeTruthy();
    await expect(origen.locator(`option[value="${sala2}"]`)).toBeDisabled();
    await expect(origen.locator(`option[value="${sala2}"]`)).toContainText("sin stock");

    // Llegando con la ubicación en la URL (como desde una alerta o la ficha) se explica por qué no se puede.
    await bodeguero.goto(`/movimientos/retiro?insumo=${insumoId}&ubicacion=${sala2}`);
    await expect(bodeguero.getByText(`Disponible en ${UBICACIONES.nunoaSala2.nombre}`)).toBeVisible();

    const formulario = bodeguero.getByRole("form", { name: "Registrar retiro" });
    await expect(formulario).toContainText("No hay stock vigente para retirar aquí.");
    await expect(formulario).toContainText(/en lotes vencidos no se pueden retirar/);
    // El bodeguero no puede dar de baja: se le indica avisar a un administrador.
    await expect(formulario).toContainText("Avisa a un administrador.");
    await expect(formulario.getByRole("link", { name: "Dar de baja ahora" })).toHaveCount(0);

    await expect(bodeguero.getByRole("button", { name: "Registrar retiro" })).toBeDisabled();

    // Al administrador sí se le ofrece el camino correcto (merma).
    const admin = await abrirComo("admin");
    await admin.goto(`/movimientos/retiro?insumo=${insumoId}&ubicacion=${sala2}`);
    await expect(admin.getByRole("button", { name: "Registrar retiro" })).toBeDisabled();
    await expect(admin.getByRole("link", { name: "Dar de baja ahora" })).toHaveAttribute(
      "href",
      new RegExp(`^/movimientos/ajuste\\?tipo=merma&insumo=${insumoId}&ubicacion=${sala2}$`),
    );
  });

  test("dos retiros simultáneos no pueden sacar más de lo que hay", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin);
    await registrarIngreso(admin, { insumo, ubicacion: BODEGA, lote: `CC-${insumo.sufijo}`, vence: diaSantiago(90), cantidad: 4 });
    const bodeguero = await abrirComo("bodega");

    // Ambos ven 4 disponibles y piden 3 al mismo tiempo.
    for (const pagina of [admin, bodeguero]) {
      await abrirRetiro(pagina, insumo, BODEGA);
      await pagina.getByRole("textbox", { name: "Cantidad a retirar" }).fill("3");
    }
    // 3 de 4 es más de la mitad: ambos llegan a la confirmación y confirman a la vez.
    for (const pagina of [admin, bodeguero]) {
      await pagina.getByRole("button", { name: "Registrar retiro" }).click();
      await expect(pagina.getByRole("alertdialog", { name: TITULO_RETIRO_GRANDE })).toBeVisible();
    }
    await Promise.all([
      confirmarEnDialogo(admin, TITULO_RETIRO_GRANDE, "Registrar retiro"),
      confirmarEnDialogo(bodeguero, TITULO_RETIRO_GRANDE, "Registrar retiro"),
    ]);
    const resultado = async (pagina: Page) => {
      const exito = pagina.getByRole("heading", { name: "Retiro registrado" });
      const rechazo = pagina.getByRole("form", { name: "Registrar retiro" }).getByText(/Stock insuficiente|Solo hay 1 caja/);
      await expect(exito.or(rechazo).first()).toBeVisible();
      return (await exito.isVisible()) ? "ok" : "rechazado";
    };
    const resultados = [await resultado(admin), await resultado(bodeguero)].sort();
    expect(resultados).toEqual(["ok", "rechazado"]);
    expect(await disponibleEnFicha(admin, insumo)).toBe(1);
  });
});
