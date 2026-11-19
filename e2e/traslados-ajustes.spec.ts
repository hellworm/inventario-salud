import type { Page } from "@playwright/test";
import { CENTROS, CUENTAS, diaSantiago, UBICACIONES, type Ubicacion } from "./soporte/entorno";
import {
  cajas,
  confirmarEnDialogo,
  crearInsumo,
  disponibleEnFicha,
  elegirUbicacion,
  filaDeLote,
  filaVisible,
  marcar,
  opcionesDe,
  registrarIngreso,
  type InsumoPrueba,
} from "./soporte/datos";
import { expect, sesionDe, test } from "./soporte/fixtures";

const BODEGA = UBICACIONES.nunoaBodega;
const SALA = UBICACIONES.nunoaSala1;
const CONCE = UBICACIONES.conceBodega;

async function trasladar(pagina: Page, insumo: InsumoPrueba, origen: Ubicacion, destino: Ubicacion, cantidad: number): Promise<void> {
  await pagina.goto(`/movimientos/traslado?insumo=${insumo.id}`);
  await elegirUbicacion(pagina, "Origen", origen);
  await elegirUbicacion(pagina, "Destino", destino);
  await expect(pagina.getByRole("group", { name: "Lote a trasladar" }).getByRole("radio").first()).toBeChecked();
  await pagina.getByRole("textbox", { name: "Cantidad a trasladar" }).fill(String(cantidad));
  await pagina.getByLabel("Motivo").fill("Prueba e2e de traslado");
  await pagina.getByRole("button", { name: "Registrar traslado" }).click();
  await expect(pagina.getByRole("heading", { name: "Traslado registrado" })).toBeVisible();
}

type TipoAjuste = "Sumar stock" | "Restar stock" | "Dar de baja";
const TEXTOS: Record<TipoAjuste, { cantidad: string; boton: string; confirmado: string; pregunta: string; verbo: string }> = {
  "Sumar stock": { cantidad: "Cantidad a sumar", boton: "Registrar ajuste", confirmado: "Ajuste registrado", pregunta: "¿Registrar este ajuste?", verbo: "sumar" },
  "Restar stock": { cantidad: "Cantidad a restar", boton: "Registrar ajuste", confirmado: "Ajuste registrado", pregunta: "¿Registrar este ajuste?", verbo: "restar" },
  "Dar de baja": { cantidad: "Cantidad a dar de baja", boton: "Dar de baja", confirmado: "Merma registrada", pregunta: "¿Dar de baja este stock?", verbo: "dar de baja" },
};

async function llenarAjuste(
  pagina: Page,
  insumo: InsumoPrueba,
  tipo: TipoAjuste,
  ubicacion: Ubicacion,
  cantidad: number,
  motivo: string,
): Promise<void> {
  await pagina.goto(`/movimientos/ajuste?insumo=${insumo.id}`);
  await marcar(pagina.getByRole("radio", { name: new RegExp(`^${tipo}`) }));
  await elegirUbicacion(pagina, "Ubicación", ubicacion);
  // Las existencias del insumo se cargan aparte: hasta que aparece el lote el formulario no se puede enviar.
  await expect(pagina.getByRole("group", { name: "Lote" }).getByRole("radio").first()).toBeChecked();
  await pagina.getByRole("textbox", { name: TEXTOS[tipo].cantidad }).fill(String(cantidad));
  await pagina.getByRole("combobox", { name: "Motivo" }).selectOption({ label: motivo });
}

/** Llena, envía y CONFIRMA: ajustes y mermas siempre piden confirmación antes de registrar. */
async function ajustar(pagina: Page, insumo: InsumoPrueba, tipo: TipoAjuste, cantidad: number, motivo: string): Promise<void> {
  await llenarAjuste(pagina, insumo, tipo, BODEGA, cantidad, motivo);
  await pagina.getByRole("button", { name: TEXTOS[tipo].boton }).click();
  await expect(pagina.getByRole("heading", { name: TEXTOS[tipo].confirmado }), "no se registra antes de confirmar").toBeHidden();
  await confirmarEnDialogo(pagina, TEXTOS[tipo].pregunta, TEXTOS[tipo].boton, [
    new RegExp(`Vas a ${TEXTOS[tipo].verbo}\\s+${cantidad} cajas?`),
    insumo.nombre,
    `Motivo: ${motivo}.`,
    "No se puede editar ni borrar después",
  ]);
  await expect(pagina.getByRole("heading", { name: TEXTOS[tipo].confirmado })).toBeVisible();
}

test.describe("Traslados, ajustes y mermas (ADMIN)", () => {
  test.use(sesionDe("admin"));

  test("traslado entre ubicaciones del mismo centro: baja en origen y sube en destino @movil", async ({ page }) => {
    const insumo = await crearInsumo(page);
    const lote = `TR-${insumo.sufijo}`;
    await registrarIngreso(page, { insumo, ubicacion: BODEGA, lote, vence: diaSantiago(120), cantidad: 10 });

    await trasladar(page, insumo, BODEGA, SALA, 3);
    const confirmacion = page.getByRole("status").filter({ hasText: "Traslado registrado" });
    await expect(confirmacion).toContainText(/Origen: Bodega central[\s\S]*7 cajas/);
    await expect(confirmacion).toContainText(/Destino: Sala de hemodiálisis 1[\s\S]*3 cajas/);

    // El total del centro no cambia; cambia la distribución por ubicación.
    expect(await disponibleEnFicha(page, insumo)).toBe(10);
    await expect(filaDeLote(page, lote, BODEGA)).toContainText(cajas(7), { useInnerText: true });
    await expect(filaDeLote(page, lote, SALA)).toContainText(cajas(3), { useInnerText: true });
  });

  test("traslado entre centros: sale de Ñuñoa y entra a Concepción", async ({ page, abrirComo }) => {
    const insumo = await crearInsumo(page);
    const lote = `TC-${insumo.sufijo}`;
    await registrarIngreso(page, { insumo, ubicacion: BODEGA, lote, vence: diaSantiago(120), cantidad: 9 });

    await page.goto(`/movimientos/traslado?insumo=${insumo.id}`);
    await elegirUbicacion(page, "Origen", BODEGA);
    await elegirUbicacion(page, "Destino", CONCE);
    await expect(page.getByText("Traslado entre centros")).toBeVisible();
    await expect(page.getByRole("group", { name: "Lote a trasladar" }).getByRole("radio").first()).toBeChecked();
    await page.getByRole("textbox", { name: "Cantidad a trasladar" }).fill("4");
    await page.getByRole("button", { name: "Registrar traslado" }).click();
    await expect(page.getByRole("heading", { name: "Traslado registrado" })).toBeVisible();

    // Toda la red: sigue habiendo 9, repartidas 5 + 4.
    expect(await disponibleEnFicha(page, insumo)).toBe(9);
    await expect(filaDeLote(page, lote, BODEGA)).toContainText(cajas(5), { useInnerText: true });
    const existencias = page.getByRole("table", { name: "Existencias por lote y ubicación" });
    await expect(existencias.getByRole("row").filter({ hasText: lote }).filter({ hasText: CENTROS.conce })).toContainText(cajas(4), {
      useInnerText: true,
    });

    // El bodeguero de Ñuñoa ve solo lo que quedó en su centro.
    const bodeguero = await abrirComo("bodega");
    expect(await disponibleEnFicha(bodeguero, insumo)).toBe(5);
    await expect(bodeguero.getByRole("main")).not.toContainText(CENTROS.conce);

    // El historial registra la salida y la entrada enlazadas, cada una con su saldo.
    await page.goto(`/movimientos?insumo=${insumo.id}`);
    const salida = filaVisible(page, "Traslado (salida)");
    const entrada = filaVisible(page, "Traslado (entrada)");
    await expect(salida).toContainText(/−4\s*cajas/, { useInnerText: true });
    await expect(salida).toContainText(BODEGA.nombre);
    await expect(entrada).toContainText(/\+4\s*cajas/, { useInnerText: true });
    await expect(entrada).toContainText(CENTROS.conce);
  });

  test("el traslado no ofrece el origen como destino ni ubicaciones sin stock como origen", async ({ page }) => {
    const insumo = await crearInsumo(page);
    await registrarIngreso(page, { insumo, ubicacion: BODEGA, lote: `TO-${insumo.sufijo}`, vence: diaSantiago(60), cantidad: 2 });
    await page.goto(`/movimientos/traslado?insumo=${insumo.id}`);
    await elegirUbicacion(page, "Origen", BODEGA);
    await expect(page.getByRole("group", { name: "Lote a trasladar" }).getByRole("radio").first()).toBeChecked();

    const origen = page.getByRole("combobox", { name: "Origen" });
    const habilitadas = await origen.locator("option:not([disabled])").evaluateAll((os) =>
      (os as HTMLOptionElement[]).filter((o) => o.value).map((o) => o.textContent ?? ""),
    );
    expect(habilitadas).toHaveLength(1);
    expect(habilitadas[0]).toContain("Bodega central");
    const destino = page.getByRole("combobox", { name: "Destino" });
    const destinoBloqueado = await destino.locator("option[disabled]").evaluateAll((os) => os.map((o) => o.textContent ?? ""));
    expect(destinoBloqueado.some((t) => t.startsWith("Bodega central"))).toBe(true);
    expect((await opcionesDe(destino)).length).toBeGreaterThan(5);

    // No se puede trasladar más de lo que hay en el lote.
    await elegirUbicacion(page, "Destino", SALA);
    await expect(page.getByRole("group", { name: "Lote a trasladar" }).getByRole("radio").first()).toBeChecked();
    await page.getByRole("textbox", { name: "Cantidad a trasladar" }).fill("3");
    await page.getByRole("button", { name: "Registrar traslado" }).click();
    await expect(page.getByRole("heading", { name: "Traslado registrado" })).toBeHidden();
    await expect(page.getByRole("form", { name: "Registrar traslado" })).toContainText(/solo|Solo/);
    expect(await disponibleEnFicha(page, insumo)).toBe(2);
  });

  test("ajuste positivo, ajuste negativo y merma dejan el stock y el historial correctos @movil", async ({ page }) => {
    const insumo = await crearInsumo(page);
    const lote = `AJ-${insumo.sufijo}`;
    await registrarIngreso(page, { insumo, ubicacion: BODEGA, lote, vence: diaSantiago(180), cantidad: 10 });

    await ajustar(page, insumo, "Sumar stock", 2, "Conteo de inventario");
    await expect(page.getByRole("status").filter({ hasText: "Ajuste registrado" })).toContainText(/12 cajas\s*saldo después del movimiento/);
    expect(await disponibleEnFicha(page, insumo)).toBe(12);

    await ajustar(page, insumo, "Restar stock", 5, "Error de digitación");
    expect(await disponibleEnFicha(page, insumo)).toBe(7);

    await ajustar(page, insumo, "Dar de baja", 3, "Daño o rotura");
    await expect(page.getByRole("status").filter({ hasText: "Merma registrada" })).toContainText(/4 cajas\s*saldo después del movimiento/);
    expect(await disponibleEnFicha(page, insumo)).toBe(4);
    await expect(filaDeLote(page, lote, BODEGA)).toContainText(cajas(4), { useInnerText: true });

    // Historial: un asiento por operación, con signo, saldo del lote y usuario.
    await page.goto(`/movimientos?insumo=${insumo.id}`);
    const merma = filaVisible(page, "Merma");
    await expect(merma).toContainText(/−3\s*cajas/, { useInnerText: true });
    await expect(merma).toContainText(CUENTAS.admin.nombre);
    await expect(filaVisible(page, "Ajuste (−)")).toContainText(/−5\s*cajas/, { useInnerText: true });
    await expect(filaVisible(page, "Ajuste (+)")).toContainText(/\+2\s*cajas/, { useInnerText: true });
  });

  test("ajuste negativo y merma no pueden dejar el lote bajo cero; el motivo es obligatorio", async ({ page }) => {
    const insumo = await crearInsumo(page);
    await registrarIngreso(page, { insumo, ubicacion: BODEGA, lote: `AN-${insumo.sufijo}`, vence: diaSantiago(180), cantidad: 3 });
    const formulario = page.getByRole("form", { name: "Registrar ajuste o merma" });

    await llenarAjuste(page, insumo, "Restar stock", BODEGA, 4, "Conteo de inventario");
    await page.getByRole("button", { name: "Registrar ajuste" }).click();
    await expect(page.getByRole("heading", { name: "Ajuste registrado" })).toBeHidden();
    await expect(formulario.getByRole("textbox", { name: "Cantidad a restar" })).toHaveAttribute("aria-invalid", "true");
    // Un formulario inválido ni siquiera llega a pedir confirmación.
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    await llenarAjuste(page, insumo, "Dar de baja", BODEGA, 4, "Vencimiento");
    await page.getByRole("button", { name: "Dar de baja" }).click();
    await expect(page.getByRole("heading", { name: "Merma registrada" })).toBeHidden();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    // Sin motivo no se registra.
    await page.goto(`/movimientos/ajuste?insumo=${insumo.id}`);
    await elegirUbicacion(page, "Ubicación", BODEGA);
    await expect(page.getByRole("group", { name: "Lote" }).getByRole("radio").first()).toBeChecked();
    await page.getByRole("textbox", { name: "Cantidad a restar" }).fill("1");
    await page.getByRole("button", { name: "Registrar ajuste" }).click();
    await expect(formulario).toContainText("Indica el motivo del ajuste");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(await disponibleEnFicha(page, insumo)).toBe(3);
  });

  test("ajuste y merma piden confirmación: 'Volver a revisar' no registra nada y conserva lo escrito @movil", async ({ page }) => {
    const insumo = await crearInsumo(page);
    const lote = `CF-${insumo.sufijo}`;
    await registrarIngreso(page, { insumo, ubicacion: BODEGA, lote, vence: diaSantiago(180), cantidad: 6 });

    // Merma: el diálogo resume qué se dará de baja y cuánto quedará.
    await llenarAjuste(page, insumo, "Dar de baja", BODEGA, 2, "Daño o rotura");
    await page.getByRole("button", { name: "Dar de baja" }).click();
    const dialogo = page.getByRole("alertdialog", { name: "¿Dar de baja este stock?" });
    await expect(dialogo).toContainText(/Vas a dar de baja\s+2 cajas/);
    await expect(dialogo).toContainText(`lote ${lote}`);
    await expect(dialogo).toContainText(BODEGA.nombre);
    await expect(dialogo).toContainText(/Quedarán\s+4\s+en ese lote/);
    await expect(dialogo).toContainText("Motivo: Daño o rotura.");

    // Cancelar: no se registró y el formulario sigue como estaba.
    await dialogo.getByRole("button", { name: "Volver a revisar" }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.getByRole("heading", { name: "Merma registrada" })).toBeHidden();
    await expect(page.getByRole("textbox", { name: "Cantidad a dar de baja" })).toHaveValue("2");
    await expect(page.getByRole("combobox", { name: "Motivo" })).toHaveValue("Daño o rotura");

    // Motivo "Vencimiento" en un lote vigente: se advierte antes y dentro de la confirmación.
    await page.getByRole("combobox", { name: "Motivo" }).selectOption({ label: "Vencimiento" });
    await expect(page.getByRole("form", { name: "Registrar ajuste o merma" })).toContainText(`El lote ${lote} no está vencido`);
    await page.getByRole("button", { name: "Dar de baja" }).click();
    await expect(dialogo).toContainText("¿Seguro que el motivo es “Vencimiento”?");
    await dialogo.getByRole("button", { name: "Volver a revisar" }).click();
    expect(await disponibleEnFicha(page, insumo), "cancelar dos veces no descontó nada").toBe(6);

    // Ajuste negativo: misma mecánica; al confirmar recién se registra.
    await llenarAjuste(page, insumo, "Restar stock", BODEGA, 1, "Conteo de inventario");
    await page.getByRole("button", { name: "Registrar ajuste" }).click();
    const ajuste = page.getByRole("alertdialog", { name: "¿Registrar este ajuste?" });
    await expect(ajuste).toContainText(/Vas a restar\s+1 caja(?!s)/);
    await expect(ajuste).toContainText(/Quedarán\s+5\s+en ese lote/);
    await ajuste.getByRole("button", { name: "Registrar ajuste" }).click();
    await expect(page.getByRole("heading", { name: "Ajuste registrado" })).toBeVisible();
    expect(await disponibleEnFicha(page, insumo)).toBe(5);
    await page.goto(`/movimientos?insumo=${insumo.id}`);
    await expect(page.getByRole("main").getByRole("status").filter({ hasText: /movimiento/ })).toContainText(/^2\s*movimientos/);
  });

  test("los enlaces 'Dar de baja' de la ficha abren el formulario en modo merma con el lote elegido", async ({ page }) => {
    // Dato del seed: lote vencido de Clorhexidina jabonosa (CLO-JAB) en la Sala 1 de Ñuñoa.
    await page.goto("/inventario?q=CLO-JAB");
    await page.getByRole("main").locator("tbody tr").first().getByRole("button").first().click();
    await page.getByRole("dialog").getByRole("link", { name: "Ver ficha completa" }).click();
    await page.getByRole("main").getByRole("link", { name: "Dar de baja" }).first().click();
    await expect(page).toHaveURL(/\/movimientos\/ajuste\?tipo=merma&insumo=.+&ubicacion=.+&lote=.+/);
    await expect(page.getByRole("radio", { name: /^Dar de baja/ })).toBeChecked();
    await expect(page.getByRole("group", { name: "Lote" }).getByRole("radio", { checked: true })).toHaveCount(1);
    await expect(page.getByRole("group", { name: "Lote" })).toContainText("Vencido");
  });

  test("B-09: 'Dar de baja' desde el panel abre el formulario en modo merma con el lote vencido ya elegido", async ({ page }) => {
    // Datos del seed: hay lotes vencidos con stock; el panel los lista en "Vencidos por dar de baja".
    await page.goto("/panel");
    await expect(page.getByRole("main").getByRole("heading", { name: "Qué requiere atención hoy" })).toBeVisible();
    const enlace = page.getByRole("main").getByRole("link", { name: /^Dar de baja el lote / }).first();
    await expect(enlace).toHaveAttribute("href", /^\/movimientos\/ajuste\?tipo=merma&insumo=[a-z0-9]+&ubicacion=[a-z0-9]+&lote=[a-z0-9]+$/);
    await enlace.click();
    await expect(page).toHaveURL(/\/movimientos\/ajuste\?tipo=merma&insumo=.+&ubicacion=.+&lote=.+/);
    // Nunca parte en "Restar stock": merma, lote vencido elegido, todo su saldo y motivo "Vencimiento".
    await expect(page.getByRole("radio", { name: /^Dar de baja/ })).toBeChecked();
    await expect(page.getByRole("radio", { name: /^Restar stock/ })).not.toBeChecked();
    const lote = page.getByRole("group", { name: "Lote" });
    await expect(lote.getByRole("radio", { checked: true })).toHaveCount(1);
    await expect(lote).toContainText("Vencido");
    await expect(page.getByRole("combobox", { name: "Motivo" })).toHaveValue("Vencimiento");
    await expect(page.getByRole("textbox", { name: "Cantidad a dar de baja" })).toHaveValue(/^[1-9]\d*$/);
    await expect(page.getByRole("button", { name: "Dar de baja" })).toBeEnabled();
  });
});
