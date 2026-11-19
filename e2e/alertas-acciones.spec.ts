import { CENTROS, comoSeMuestra, CUENTAS, diaSantiago, UBICACIONES } from "./soporte/entorno";
import {
  avisos,
  cajas,
  confirmarEnDialogo,
  crearInsumo,
  definirMinimo,
  disponibleEnFicha,
  filaDeLote,
  filaVisible,
  registrarIngreso,
  type InsumoPrueba,
} from "./soporte/datos";
import { expect, test } from "./soporte/fixtures";
import type { Page } from "@playwright/test";

const BODEGA = UBICACIONES.nunoaBodega;

/** Abre el diálogo "Corregir vencimiento" del lote en la ficha del insumo (ADMIN). */
async function abrirCorreccion(admin: Page, insumo: InsumoPrueba, lote: string) {
  await admin.goto(`/inventario/${insumo.id}`);
  await filaDeLote(admin, lote).getByRole("button", { name: `Corregir vencimiento del lote ${lote}` }).click();
  const dialogo = admin.getByRole("dialog", { name: "Corregir vencimiento" });
  await expect(dialogo).toBeVisible();
  return dialogo;
}

/** Corrige el vencimiento de un lote por la interfaz (fecha + motivo + confirmación). */
async function corregirVencimiento(admin: Page, insumo: InsumoPrueba, lote: string, fecha: string, motivo: string): Promise<void> {
  const dialogo = await abrirCorreccion(admin, insumo, lote);
  await dialogo.getByLabel("Nueva fecha de vencimiento").fill(fecha);
  await dialogo.getByLabel("Motivo de la corrección").fill(motivo);
  await dialogo.getByRole("button", { name: "Revisar corrección" }).click();
  const confirmacion = admin.getByRole("dialog", { name: "¿Confirmas la corrección?" });
  await expect(confirmacion).toContainText(comoSeMuestra(fecha));
  await confirmacion.getByRole("button", { name: "Confirmar corrección" }).click();
  await expect(avisos(admin)).toContainText(`Vencimiento del lote ${lote} corregido: ${comoSeMuestra(fecha)}`);
}

test.describe("Acciones desde las alertas", () => {
  test("'Ingresar' en una alerta de sin stock abre el ingreso prellenado; al registrar, la alerta desaparece @movil", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin);
    await definirMinimo(admin, insumo, CENTROS.nunoa, 3, 10);
    const bodeguero = await abrirComo("bodega");

    await bodeguero.goto(`/alertas?tab=sin-stock&q=${insumo.codigo}`);
    const alerta = filaVisible(bodeguero, insumo.codigo);
    await expect(alerta).toContainText(/0\s*de\s*3/, { useInnerText: true });
    await alerta.getByRole("link", { name: `Ingresar ${insumo.nombre}` }).click();

    // El formulario llega con el insumo y la bodega del centro ya elegidos.
    await expect(bodeguero).toHaveURL(new RegExp(`/movimientos/ingreso\\?insumo=${insumo.id}&ubicacion=[a-z0-9]+$`));
    await expect(bodeguero.getByRole("button", { name: new RegExp(`Cambiar insumo \\(seleccionado: ${insumo.nombre}`) })).toBeVisible();
    const destino = bodeguero.getByRole("combobox", { name: "Ubicación de destino" });
    await expect(destino.locator("option:checked")).toHaveText(new RegExp(`^${BODEGA.nombre}`));
    // "Volver" regresa a las alertas desde donde se llegó.
    await expect(bodeguero.getByRole("main").getByRole("link", { name: /Alertas/ }).first()).toBeVisible();

    await bodeguero.getByLabel("Número de lote").fill(`AL-${insumo.sufijo}`);
    await bodeguero.getByLabel("Vencimiento").fill(diaSantiago(200));
    await bodeguero.getByRole("textbox", { name: "Cantidad" }).fill("5");
    await bodeguero.getByRole("button", { name: "Registrar ingreso" }).click();
    const confirmacion = bodeguero.getByRole("status").filter({ hasText: "Ingreso registrado" });
    await expect(confirmacion).toContainText("Ingresaste 5 cajas");
    // La confirmación dice en qué centro quedó registrado (B-14).
    await expect(confirmacion).toContainText(`Registrado en ${CENTROS.nunoa}.`);

    // 5 ≥ mínimo 3: ya no hay alerta de stock para este insumo.
    for (const tab of ["sin-stock", "bajo-minimo"]) {
      await bodeguero.goto(`/alertas?tab=${tab}&q=${insumo.codigo}`);
      await expect(bodeguero.getByRole("heading", { level: 1, name: "Alertas" })).toBeVisible();
      await expect(bodeguero.getByRole("main")).not.toContainText(insumo.nombre);
    }
    expect(await disponibleEnFicha(bodeguero, insumo)).toBe(5);
  });

  test("corrección de vencimiento por el administrador y 'Dar de baja' desde la alerta de vencidos, de punta a punta", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin);
    const lote = `CV-${insumo.sufijo}`;
    const original = diaSantiago(200);
    await registrarIngreso(admin, { insumo, ubicacion: BODEGA, lote, vence: original, cantidad: 6 });

    // --- Validaciones del diálogo: motivo obligatorio, misma fecha, insumo que exige fecha.
    const dialogo = await abrirCorreccion(admin, insumo, lote);
    await expect(dialogo).toContainText(`Vencimiento registrado: ${comoSeMuestra(original)}`);
    await dialogo.getByRole("button", { name: "Revisar corrección" }).click();
    await expect(dialogo).toContainText("Es la misma fecha que ya tiene el lote.");
    await expect(dialogo).toContainText("Indica el motivo de la corrección.");
    await dialogo.getByLabel("Nueva fecha de vencimiento").fill("");
    await dialogo.getByLabel("Motivo de la corrección").fill("Prueba e2e");
    await dialogo.getByRole("button", { name: "Revisar corrección" }).click();
    await expect(dialogo).toContainText("Este insumo controla vencimiento: el lote no puede quedar sin fecha.");

    // --- Paso de confirmación: muestra antes y después; "Volver a revisar" no cambia nada.
    const nueva = diaSantiago(120);
    await dialogo.getByLabel("Nueva fecha de vencimiento").fill(nueva);
    await dialogo.getByLabel("Motivo de la corrección").fill("Error de digitación al ingresar");
    await dialogo.getByRole("button", { name: "Revisar corrección" }).click();
    const confirmacion = admin.getByRole("dialog", { name: "¿Confirmas la corrección?" });
    await expect(confirmacion).toContainText(new RegExp(`Vencimiento actual\\s*${comoSeMuestra(original)}`));
    await expect(confirmacion).toContainText(new RegExp(`Nuevo vencimiento\\s*${comoSeMuestra(nueva)}`));
    await expect(confirmacion).toContainText("Motivo: Error de digitación al ingresar");
    await confirmacion.getByRole("button", { name: "Volver a revisar" }).click();
    await admin.getByRole("dialog", { name: "Corregir vencimiento" }).getByRole("button", { name: "Cancelar" }).click();
    await admin.reload();
    await expect(filaDeLote(admin, lote)).toContainText(comoSeMuestra(original));

    // --- Corrección confirmada: la ficha muestra la fecha nueva y queda auditada con motivo, antes y después.
    await corregirVencimiento(admin, insumo, lote, nueva, "Error de digitación al ingresar");
    await expect(filaDeLote(admin, lote)).toContainText(comoSeMuestra(nueva));
    await expect(filaDeLote(admin, lote)).not.toContainText(comoSeMuestra(original));
    await expect(filaDeLote(admin, lote)).toContainText(cajas(6), { useInnerText: true });

    await admin.goto(`/admin/auditoria?accion=LOTE_ACTUALIZADO&desde=${diaSantiago(0)}`);
    const registro = admin.getByRole("table", { name: "Registro de auditoría" }).locator("tbody tr").filter({ hasText: lote }).first();
    await expect(registro).toContainText("Vencimiento de lote corregido");
    await expect(registro).toContainText(CUENTAS.admin.nombre);
    await registro.getByRole("button", { name: /Ver detalle/ }).click();
    const detalle = admin.getByRole("dialog");
    await expect(detalle).toContainText("Error de digitación al ingresar");
    await expect(detalle).toContainText(comoSeMuestra(original));
    await expect(detalle).toContainText(comoSeMuestra(nueva));
    await expect(detalle).toContainText("Corrección de un administrador");
    await detalle.getByRole("button", { name: "Cerrar" }).first().click();

    // --- El bodeguero ve el lote corregido pero no puede corregir fechas.
    const bodeguero = await abrirComo("bodega");
    await bodeguero.goto(`/inventario/${insumo.id}`);
    await expect(filaDeLote(bodeguero, lote)).toContainText(comoSeMuestra(nueva));
    await expect(bodeguero.getByRole("button", { name: /Corregir vencimiento/ })).toHaveCount(0);
    await expect(filaDeLote(bodeguero, lote).getByRole("link", { name: "Retirar" })).toBeVisible();

    // --- Corregir a una fecha pasada deja el lote vencido: ya no se retira y aparece en las alertas.
    const ayer = diaSantiago(-1);
    await corregirVencimiento(admin, insumo, lote, ayer, "La caja indica que venció ayer");
    await expect(filaDeLote(admin, lote)).toContainText("Vencido");
    await expect(admin.getByRole("region", { name: "Resumen de stock" })).toContainText("No se puede usar: dar de baja");
    expect(await disponibleEnFicha(admin, insumo), "lo vencido no cuenta como disponible").toBe(0);
    await bodeguero.goto(`/movimientos/retiro?insumo=${insumo.id}`);
    await expect(bodeguero.getByRole("form", { name: "Registrar retiro" })).toContainText(/en lotes vencidos no se pueden retirar/);
    await expect(bodeguero.getByRole("button", { name: "Registrar retiro" })).toBeDisabled();

    // --- Alerta de vencidos → "Dar de baja": merma prellenada con todo el saldo y motivo "Vencimiento".
    await admin.goto(`/alertas?tab=vencidos&q=${insumo.codigo}`);
    const vencido = filaVisible(admin, insumo.codigo);
    await expect(vencido).toContainText(lote);
    await vencido.getByRole("link", { name: new RegExp(`^Dar de baja 6 cajas del lote ${lote}`) }).click();
    await expect(admin).toHaveURL(/\/movimientos\/ajuste\?tipo=merma&insumo=.+&ubicacion=.+&lote=.+/);
    await expect(admin.getByRole("radio", { name: /^Dar de baja/ })).toBeChecked();
    await expect(admin.getByRole("group", { name: "Lote" }).getByRole("radio", { checked: true })).toHaveCount(1);
    await expect(admin.getByRole("group", { name: "Lote" })).toContainText(lote);
    await expect(admin.getByRole("textbox", { name: "Cantidad a dar de baja" })).toHaveValue("6");
    await expect(admin.getByRole("combobox", { name: "Motivo" })).toHaveValue("Vencimiento");

    await admin.getByRole("button", { name: "Dar de baja" }).click();
    await confirmarEnDialogo(admin, "¿Dar de baja este stock?", "Dar de baja", [/Vas a dar de baja\s+6 cajas/, `lote ${lote}`, "Motivo: Vencimiento."]);
    const merma = admin.getByRole("status").filter({ hasText: "Merma registrada" });
    await expect(merma).toContainText("Diste de baja 6 cajas");
    await expect(merma).toContainText(`Registrado en ${CENTROS.nunoa}.`);

    // Ya no hay stock ni alerta de vencido; el historial tiene ingreso y merma.
    await admin.goto(`/alertas?tab=vencidos&q=${insumo.codigo}`);
    await expect(admin.getByRole("heading", { level: 1, name: "Alertas" })).toBeVisible();
    await expect(admin.getByRole("main")).not.toContainText(insumo.nombre);
    await admin.goto(`/movimientos?insumo=${insumo.id}`);
    await expect(admin.getByRole("main").getByRole("status").filter({ hasText: /movimiento/ })).toContainText(/^2\s*movimientos/);
    await expect(filaVisible(admin, "Merma")).toContainText(/−6\s*cajas/, { useInnerText: true });
  });
});
