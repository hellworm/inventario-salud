import type { Page } from "@playwright/test";
import { CENTROS, diaSantiago, UBICACIONES } from "./soporte/entorno";
import {
  abrirRetiro,
  crearInsumo,
  disponibleEnFicha,
  esperarStockEnGrilla,
  filaDeLote,
  llenarIngreso,
  opcionesDe,
  registrarIngreso,
  type InsumoPrueba,
} from "./soporte/datos";
import { expect, test } from "./soporte/fixtures";

const NUNOA = UBICACIONES.nunoaBodega;
const VALPO = UBICACIONES.valpoBodega;
const UBICACIONES_NUNOA = ["Bodega central", "Refrigerador de fármacos", "Sala de hemodiálisis 1", "Sala de hemodiálisis 2"];

interface Escenario {
  insumo: InsumoPrueba;
  loteValpo: string;
  loteNunoa: string;
  /** Ids reales de Valparaíso, para manipular URLs y solicitudes. */
  centroValpoId: string;
  ubicacionValpoId: string;
  loteValpoId: string;
  ubicacionNunoaId: string;
}

/**
 * Insumo con 5 cajas en Valparaíso y 3 en Ñuñoa (lotes distintos). El
 * bodeguero de Ñuñoa solo debe ver y operar las 3 de su centro.
 */
async function prepararEscenario(admin: Page): Promise<Escenario> {
  const insumo = await crearInsumo(admin);
  const loteValpo = `VALPO-${insumo.sufijo}`;
  const loteNunoa = `NUNOA-${insumo.sufijo}`;
  await registrarIngreso(admin, { insumo, ubicacion: VALPO, lote: loteValpo, vence: diaSantiago(100), cantidad: 5 });
  await registrarIngreso(admin, { insumo, ubicacion: NUNOA, lote: loteNunoa, vence: diaSantiago(100), cantidad: 3 });

  await admin.goto(`/inventario/${insumo.id}`);
  const idsDe = async (lote: string) => {
    const href = await filaDeLote(admin, lote).getByRole("link", { name: "Retirar" }).getAttribute("href");
    const consulta = new URL(href as string, "http://x").searchParams;
    return { ubicacionId: consulta.get("ubicacion") as string, loteId: consulta.get("lote") as string };
  };
  const valpo = await idsDe(loteValpo);
  const nunoa = await idsDe(loteNunoa);

  await admin.goto("/admin/centros");
  const hrefCentro = await admin.getByRole("main").getByRole("link", { name: new RegExp(CENTROS.valpo) }).first().getAttribute("href");
  const centroValpoId = (hrefCentro as string).split("/").pop() as string;

  return {
    insumo,
    loteValpo,
    loteNunoa,
    centroValpoId,
    ubicacionValpoId: valpo.ubicacionId,
    loteValpoId: valpo.loteId,
    ubicacionNunoaId: nunoa.ubicacionId,
  };
}

test.describe("Aislamiento por centro", () => {
  test("cada bodeguero ve solo el stock de su centro; el administrador ve la red @movil", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const e = await prepararEscenario(admin);
    const nunoa = await abrirComo("bodega");
    const valpo = await abrirComo("valpo");

    await esperarStockEnGrilla(admin, e.insumo, 8);
    await esperarStockEnGrilla(nunoa, e.insumo, 3);
    await esperarStockEnGrilla(valpo, e.insumo, 5);

    expect(await disponibleEnFicha(nunoa, e.insumo)).toBe(3);
    await expect(nunoa.getByRole("main")).toContainText(e.loteNunoa);
    await expect(nunoa.getByRole("main")).not.toContainText(e.loteValpo);
    await expect(nunoa.getByRole("main")).not.toContainText(CENTROS.valpo);

    expect(await disponibleEnFicha(valpo, e.insumo)).toBe(5);
    await expect(valpo.getByRole("main")).not.toContainText(e.loteNunoa);
  });

  test("manipular ?centro=, ids de ubicación o de lote en la URL no revela datos de otro centro", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const e = await prepararEscenario(admin);
    const nunoa = await abrirComo("bodega");
    const principal = nunoa.getByRole("main");

    // Listados con ?centro= ajeno: se ignora (o se rechaza), nunca muestra Valparaíso.
    for (const ruta of [
      `/inventario?centro=${e.centroValpoId}&q=${e.insumo.codigo}`,
      `/inventario?ubicacion=${e.ubicacionValpoId}&q=${e.insumo.codigo}`,
      `/movimientos?centro=${e.centroValpoId}&insumo=${e.insumo.id}`,
      `/movimientos?ubicacion=${e.ubicacionValpoId}&insumo=${e.insumo.id}`,
      `/movimientos?q=${e.loteValpo}`,
      `/movimientos?lote=${e.loteValpoId}`,
      `/alertas?centro=${e.centroValpoId}`,
      `/alertas/reposicion?centro=${e.centroValpoId}`,
      `/panel?centro=${e.centroValpoId}`,
      `/inventario/${e.insumo.id}?centro=${e.centroValpoId}`,
    ]) {
      const respuesta = await nunoa.goto(ruta);
      expect(respuesta?.status(), `${ruta} no debe fallar`).toBeLessThan(500);
      await expect(nunoa.getByRole("heading").first()).toBeVisible();
      await expect(principal, `${ruta} no debe mostrar el lote de Valparaíso`).not.toContainText(e.loteValpo);
      await expect(principal, `${ruta} no debe nombrar al otro centro`).not.toContainText(CENTROS.valpo);
    }

    // El historial del insumo, visto desde Ñuñoa, tiene un solo movimiento (su ingreso).
    await nunoa.goto(`/movimientos?insumo=${e.insumo.id}`);
    await expect(principal.getByRole("status").filter({ hasText: /movimiento/ })).toContainText(/^1\s*movimiento/);

    // Descargas: un ?centro= ajeno se rechaza.
    const ajena = await nunoa.request.get(`/alertas/reposicion/exportar?centro=${e.centroValpoId}`);
    expect(ajena.status()).toBe(403);
    expect(await ajena.text()).not.toContain(CENTROS.valpo);
  });

  test("los formularios solo ofrecen ubicaciones del centro propio, aunque la URL pida otra", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const e = await prepararEscenario(admin);
    const nunoa = await abrirComo("bodega");

    await nunoa.goto(`/movimientos/retiro?insumo=${e.insumo.id}&ubicacion=${e.ubicacionValpoId}&lote=${e.loteValpoId}`);
    const origen = nunoa.getByRole("combobox", { name: "Desde la ubicación" });
    await expect(origen).toBeVisible();
    expect((await opcionesDe(origen)).map((t) => t.split(" — ")[0])).toEqual(UBICACIONES_NUNOA);
    await expect(origen.locator(`option[value="${e.ubicacionValpoId}"]`)).toHaveCount(0);
    // El panel de existencias tampoco muestra el lote ajeno.
    await expect(nunoa.getByRole("main")).toContainText(e.loteNunoa);
    await expect(nunoa.getByRole("main")).not.toContainText(e.loteValpo);

    await nunoa.goto(`/movimientos/ingreso?insumo=${e.insumo.id}&ubicacion=${e.ubicacionValpoId}`);
    const destino = nunoa.getByRole("combobox", { name: "Ubicación de destino" });
    await expect(destino).toBeVisible();
    expect(await opcionesDe(destino)).toEqual(UBICACIONES_NUNOA);
  });

  test("el servidor rechaza un retiro y un ingreso con la ubicación de otro centro (solicitud manipulada)", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const e = await prepararEscenario(admin);
    const nunoa = await abrirComo("bodega");

    // Se intercepta la Server Action y se cambia la ubicación de Ñuñoa por la de Valparaíso.
    let manipuladas = 0;
    await nunoa.route("**/movimientos/**", async (ruta) => {
      const solicitud = ruta.request();
      const cuerpo = solicitud.postData();
      if (solicitud.method() === "POST" && cuerpo?.includes('"cantidad"') && cuerpo.includes(e.ubicacionNunoaId)) {
        manipuladas += 1;
        await ruta.continue({ postData: cuerpo.replaceAll(e.ubicacionNunoaId, e.ubicacionValpoId) });
      } else {
        await ruta.continue();
      }
    });

    await abrirRetiro(nunoa, e.insumo, NUNOA);
    await nunoa.getByRole("textbox", { name: "Cantidad a retirar" }).fill("1");
    await nunoa.getByRole("button", { name: "Registrar retiro" }).click();
    await expect(nunoa.getByRole("form", { name: "Registrar retiro" })).toContainText(/no tienes (acceso|permiso)|no existe o no tienes acceso/i);
    await expect(nunoa.getByRole("heading", { name: "Retiro registrado" })).toBeHidden();
    expect(manipuladas).toBe(1);

    await llenarIngreso(nunoa, { insumo: e.insumo, ubicacion: NUNOA, lote: `X-${e.insumo.sufijo}`, vence: diaSantiago(50), cantidad: 2 });
    await nunoa.getByRole("button", { name: "Registrar ingreso" }).click();
    await expect(nunoa.getByRole("form", { name: "Registrar ingreso" })).toContainText(/no tienes (acceso|permiso)|no existe o no tienes acceso/i);
    await expect(nunoa.getByRole("heading", { name: "Ingreso registrado" })).toBeHidden();
    expect(manipuladas).toBe(2);
    await nunoa.unroute("**/movimientos/**");

    // Nada cambió en ninguno de los dos centros.
    const valpo = await abrirComo("valpo");
    expect(await disponibleEnFicha(valpo, e.insumo)).toBe(5);
    expect(await disponibleEnFicha(nunoa, e.insumo)).toBe(3);
  });

  test("el selector de centro no existe para quien tiene un solo centro", async ({ abrirComo }) => {
    const nunoa = await abrirComo("bodega");
    await nunoa.goto("/panel");
    await expect(nunoa.getByRole("banner")).toContainText(CENTROS.nunoa);
    await expect(nunoa.getByRole("banner")).not.toContainText("Toda la red");
    await expect(nunoa.getByRole("main")).not.toContainText(CENTROS.valpo);
    await expect(nunoa.getByRole("main")).not.toContainText(CENTROS.conce);
  });
});
