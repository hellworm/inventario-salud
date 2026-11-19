import type { Page } from "@playwright/test";
import type { Rol } from "./soporte/entorno";
import { expect, test } from "./soporte/fixtures";

const BASE = ["Panel", "Inventario", "Alertas"];
const OPERACION = ["Movimientos", "Reportes", "Ingreso", "Retiro", "Traslado", "Ajuste o merma"];
const ADMINISTRACION = ["Insumos", "Categorías", "Centros y ubicaciones", "Proveedores", "Usuarios", "Auditoría"];
const NAVEGACION: Record<Exclude<Rol, "valpo" | "cerro">, string[]> = {
  // Administrador de institución: todo salvo "Instituciones".
  andes: [...BASE, ...OPERACION, ...ADMINISTRACION],
  admin: [
    ...BASE,
    "Movimientos",
    "Reportes",
    "Ingreso",
    "Retiro",
    "Traslado",
    "Ajuste o merma",
    "Instituciones",
    "Insumos",
    "Categorías",
    "Centros y ubicaciones",
    "Proveedores",
    "Usuarios",
    "Auditoría",
  ],
  bodega: [...BASE, "Movimientos", "Ingreso", "Retiro"],
  visita: BASE,
};

/** Rutas que cada rol NO puede abrir: deben terminar en /sin-permiso. */
const SOLO_ADMIN = [
  "/movimientos/traslado",
  "/movimientos/ajuste",
  "/reportes",
  "/reportes/existencias",
  "/reportes/movimientos",
  "/reportes/consumo",
  "/reportes/vencimientos",
  "/admin",
  "/admin/instituciones",
  "/admin/insumos",
  "/admin/insumos/nuevo",
  "/admin/categorias",
  "/admin/centros",
  "/admin/centros/nuevo",
  "/admin/proveedores",
  "/admin/usuarios",
  "/admin/auditoria",
];
const PROHIBIDAS: Record<"bodega" | "visita", string[]> = {
  bodega: SOLO_ADMIN,
  visita: [...SOLO_ADMIN, "/movimientos", "/movimientos/ingreso", "/movimientos/retiro"],
};
const PERMITIDAS: Record<"bodega" | "visita", string[]> = {
  bodega: ["/panel", "/inventario", "/alertas", "/alertas/reposicion", "/movimientos", "/movimientos/ingreso", "/movimientos/retiro"],
  visita: ["/panel", "/inventario", "/alertas", "/alertas/reposicion"],
};

/** Enlaces a pantallas que registran movimientos o administran: un visitante no debe ver ninguno. */
const ENLACES_DE_OPERACION = 'a[href^="/movimientos"], a[href^="/admin"], a[href^="/reportes"]';

async function enlacesDeNavegacion(pagina: Page, movil: boolean): Promise<string[]> {
  if (!movil) {
    return pagina.getByRole("navigation", { name: "Principal" }).getByRole("link").allInnerTexts();
  }
  await pagina.getByRole("navigation", { name: "Accesos rápidos" }).getByRole("button", { name: "Menú" }).click();
  const menu = pagina.getByRole("dialog");
  await expect(menu).toBeVisible();
  return menu.getByRole("navigation").getByRole("link").allInnerTexts();
}

test.describe("Navegación visible por rol", () => {
  for (const rol of ["admin", "andes", "bodega", "visita"] as const) {
    test(`${rol}: el menú muestra solo lo que su rol permite @movil`, async ({ abrirComo, isMobile }) => {
      const pagina = await abrirComo(rol);
      await pagina.goto("/panel");
      const enlaces = (await enlacesDeNavegacion(pagina, Boolean(isMobile))).map((t) => t.trim());
      expect(enlaces).toEqual(NAVEGACION[rol]);
    });
  }

  test("visitante: no se le ofrecen acciones de registro en panel, inventario ni ficha", async ({ abrirComo }) => {
    const visita = await abrirComo("visita");
    for (const ruta of ["/panel", "/inventario", "/alertas"]) {
      await visita.goto(ruta);
      await expect(visita.getByRole("main").locator(ENLACES_DE_OPERACION)).toHaveCount(0);
    }
    // Ficha de un insumo con stock (primer insumo de la grilla).
    await visita.goto("/inventario?estado=OK");
    await visita.getByRole("main").locator("tbody tr").first().getByRole("button").first().click();
    await visita.getByRole("dialog").getByRole("link", { name: "Ver ficha completa" }).click();
    await expect(visita).toHaveURL(/\/inventario\/[a-z0-9]+$/);
    await expect(visita.getByRole("region", { name: "Resumen de stock" })).toBeVisible();
    await expect(visita.getByRole("main").locator(ENLACES_DE_OPERACION)).toHaveCount(0);
  });
});

test.describe("Acceso por URL directa", () => {
  for (const rol of ["bodega", "visita"] as const) {
    test(`${rol}: las rutas ajenas a su rol terminan en /sin-permiso`, async ({ abrirComo }) => {
      const pagina = await abrirComo(rol);
      for (const ruta of PROHIBIDAS[rol]) {
        await pagina.goto(ruta);
        await expect(pagina, `${rol} no debe poder abrir ${ruta}`).toHaveURL(/\/sin-permiso$/);
      }
      await expect(pagina.getByRole("heading", { name: "No tienes permiso para ver esta sección" })).toBeVisible();
      await pagina.getByRole("link", { name: "Volver al panel" }).click();
      await expect(pagina).toHaveURL(/\/panel$/);
    });

    test(`${rol}: sus propias rutas cargan sin redirigir`, async ({ abrirComo }) => {
      const pagina = await abrirComo(rol);
      for (const ruta of PERMITIDAS[rol]) {
        const respuesta = await pagina.goto(ruta);
        expect(respuesta?.status(), `${ruta} debe responder 200`).toBe(200);
        await expect(pagina).toHaveURL(new RegExp(`${ruta}$`));
        await expect(pagina.getByRole("heading", { level: 1 })).toBeVisible();
      }
    });
  }

  test("una ruta inexistente responde 404 con una página propia", async ({ abrirComo, vigilancia }) => {
    vigilancia.tolerar();
    const pagina = await abrirComo("bodega");
    const respuesta = await pagina.goto("/no-existe-esta-ruta");
    expect(respuesta?.status()).toBe(404);
    await expect(pagina.getByRole("heading", { name: "No encontramos esta página" })).toBeVisible();
    // La ficha de un insumo inexistente muestra la misma página (ver B-13 sobre su código HTTP).
    await pagina.goto("/inventario/id-que-no-existe");
    await expect(pagina.getByRole("heading", { name: "No encontramos esta página" })).toBeVisible();
    await expect(pagina.getByRole("region", { name: "Resumen de stock" })).toHaveCount(0);
  });
});
