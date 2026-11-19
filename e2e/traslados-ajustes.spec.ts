import type { Page } from "@playwright/test";
import { CENTROS, CUENTAS, diaSantiago, UBICACIONES, type Ubicacion } from "./soporte/entorno";
import {
  cajas,
  crearInsumo,
  disponibleEnFicha,
  elegirUbicacion,
  filaDeLote,
  filaVisible,
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
const TEXTOS: Record<TipoAjuste, { cantidad: string; boton: string; confirmado: string }> = {
  "Sumar stock": { cantidad: "Cantidad a sumar", boton: "Registrar ajuste", confirmado: "Ajuste registrado" },
  "Restar stock": { cantidad: "Cantidad a restar", boton: "Registrar ajuste", confirmado: "Ajuste registrado" },
  "Dar de baja": { cantidad: "Cantidad a dar de baja", boton: "Dar de baja", confirmado: "Merma registrada" },
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
  await pagina.getByRole("radio", { name: new RegExp(`^${tipo}`) }).check({ force: true });
  await elegirUbicacion(pagina, "Ubicación", ubicacion);
  // Las existencias del insumo se cargan aparte: hasta que aparece el lote el formulario no se puede enviar.
  await expect(pagina.getByRole("group", { name: "Lote" }).getByRole("radio").first()).toBeChecked();
  await pagina.getByRole("textbox", { name: TEXTOS[tipo].cantidad }).fill(String(cantidad));
  await pagina.getByRole("combobox", { name: "Motivo" }).selectOption({ label: motivo });
}

async function ajustar(pagina: Page, insumo: InsumoPrueba, tipo: TipoAjuste, cantidad: number, motivo: string): Promise<void> {
  await llenarAjuste(pagina, insumo, tipo, BODEGA, cantidad, motivo);
  await pagina.getByRole("button", { name: TEXTOS[tipo].boton }).click();
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

    await llenarAjuste(page, insumo, "Dar de baja", BODEGA, 4, "Vencimiento");
    await page.getByRole("button", { name: "Dar de baja" }).click();
    await expect(page.getByRole("heading", { name: "Merma registrada" })).toBeHidden();

    // Sin motivo no se registra.
    await page.goto(`/movimientos/ajuste?insumo=${insumo.id}`);
    await elegirUbicacion(page, "Ubicación", BODEGA);
    await expect(page.getByRole("group", { name: "Lote" }).getByRole("radio").first()).toBeChecked();
    await page.getByRole("textbox", { name: "Cantidad a restar" }).fill("1");
    await page.getByRole("button", { name: "Registrar ajuste" }).click();
    await expect(formulario).toContainText("Indica el motivo del ajuste");
    expect(await disponibleEnFicha(page, insumo)).toBe(3);
  });
});
