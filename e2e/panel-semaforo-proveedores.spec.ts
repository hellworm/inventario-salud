import type { Page } from "@playwright/test";
import { rutValido, sufijo, type Rol } from "./soporte/entorno";
import { expect, test } from "./soporte/fixtures";

/** Pantalla principal: semáforo de vencimientos y proveedores, para los tres roles. */

const ROLES: Exclude<Rol, "valpo">[] = ["admin", "bodega", "visita"];

/** Abre /proveedores buscando un proveedor y devuelve su fila del directorio. */
async function filaDeProveedor(pagina: Page, razonSocial: string) {
  await pagina.goto(`/proveedores?q=${encodeURIComponent(razonSocial)}`);
  const fila = pagina.getByRole("main").locator("li[data-proveedor]").filter({ hasText: razonSocial });
  await expect(fila).toHaveCount(1);
  return fila;
}

test.describe("Panel: semáforo de vencimientos", () => {
  for (const rol of ROLES) {
    test(`@movil ${rol}: tres tarjetas clicables (rojo, amarillo, verde), vencidos aparte y productos en rojo`, async ({ abrirComo }) => {
      const pagina = await abrirComo(rol);
      await pagina.goto("/panel");
      const principal = pagina.getByRole("main");
      await expect(principal.getByRole("heading", { name: "Semáforo de vencimientos" })).toBeVisible();

      // Cada color: enlace al inventario filtrado, con nombre del color, significado, insumos y lotes.
      const esperado = {
        ROJO: ["Rojo", "Vence en menos de 3 meses", "/inventario?semaforo=rojo"],
        AMARILLO: ["Amarillo", "Vence en 3 a 6 meses", "/inventario?semaforo=amarillo"],
        VERDE: ["Verde", "Vence en 6 meses o más", "/inventario?semaforo=verde"],
      } as const;
      for (const [color, [nombre, significado, href]] of Object.entries(esperado)) {
        const tarjeta = principal.locator(`a[data-semaforo="${color}"]`);
        await expect(tarjeta).toBeVisible();
        await expect(tarjeta).toHaveAttribute("href", href);
        await expect(tarjeta).toContainText(nombre);
        await expect(tarjeta).toContainText(significado);
        await expect(tarjeta.locator('[data-conteo="insumos"]')).toHaveText(/^\d[\d.]*$/);
        await expect(tarjeta.locator('[data-conteo="lotes"]')).toHaveText(/^\d[\d.]*$/);
        // No depende solo del color: lleva un ícono propio además del texto.
        await expect(tarjeta.locator("svg").first()).toBeVisible();
        // Objetivo táctil suficiente.
        const caja = await tarjeta.boundingBox();
        expect(caja?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      // Vencidos: destacado aparte (el seed deja lotes vencidos en todos los centros).
      const vencidos = principal.locator('a[data-semaforo="VENCIDO"]');
      await expect(vencidos).toContainText(/Vencidos: \d+ insumos? · \d+ lotes?/);
      await expect(vencidos).toContainText("No se pueden usar");

      // Productos en rojo: insumo, lote, ubicación, fecha dd-MM-yyyy, días restantes y cantidad; ordenados por lo que vence antes.
      const enRojo = principal.getByRole("region", { name: /Productos en rojo/ });
      const filas = enRojo.locator("tbody tr, ul[aria-label] > li").filter({ visible: true });
      const cantidad = await filas.count();
      expect(cantidad).toBeGreaterThan(0);
      expect(cantidad).toBeLessThanOrEqual(6);
      const textos = await filas.allInnerTexts();
      const dias = textos.map((t) => {
        expect(t).toMatch(/Lote \S+/);
        expect(t).toMatch(/\d{2}-\d{2}-\d{4}/);
        expect(t).toMatch(/Rojo/);
        const hallado = /Rojo\s*·\s*(?:, vence )?(?:en )?(?:(\d+) días|(hoy)|(mañana))/.exec(t.replace(/\s+/g, " "));
        expect(hallado, t).not.toBeNull();
        return hallado![1] ? Number(hallado![1]) : hallado![2] ? 0 : 1;
      });
      expect(dias).toEqual([...dias].sort((a, b) => a - b));
      await expect(enRojo.getByRole("link", { name: "Ver todos los lotes en rojo" })).toHaveAttribute("href", "/alertas?tab=rojo");

      // Pinchar una fila lleva a la ficha del insumo.
      await filas.first().getByRole("link").first().click();
      await expect(pagina).toHaveURL(/\/inventario\/[a-z0-9]+$/);
      await expect(pagina.getByRole("region", { name: "Resumen de stock" })).toBeVisible();

      // Pinchar un color lleva al inventario filtrado, con el filtro marcado y la leyenda visible.
      await pagina.goto("/panel");
      await principal.locator('a[data-semaforo="AMARILLO"]').click();
      await expect(pagina).toHaveURL(/\/inventario\?semaforo=amarillo$/);
      const filtro = principal.getByRole("group", { name: "Filtrar por semáforo de vencimiento" });
      await expect(filtro.getByRole("button", { name: "Amarillo" })).toHaveAttribute("aria-pressed", "true");
      await expect(principal.getByRole("list", { name: "Semáforo de vencimiento" })).toContainText("Amarillo: vence en 3 a 6 meses");
      // Cambiar de color con un toque; tocar el mismo lo quita.
      await filtro.getByRole("button", { name: "Verde" }).click();
      await expect(pagina).toHaveURL(/semaforo=verde/);
      await filtro.getByRole("button", { name: "Verde" }).click();
      await expect(pagina).not.toHaveURL(/semaforo=/);
    });
  }

  test("reportes: filtro por semáforo y columna de texto en el CSV", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    await admin.goto("/panel");
    const lotesEnRojo = Number((await admin.locator('a[data-semaforo="ROJO"] [data-conteo="lotes"]').innerText()).replace(/\D/g, ""));
    const lotesVencidos = Number((await admin.locator('a[data-semaforo="VENCIDO"] [data-conteo="lotes"]').innerText()).replace(/\D/g, ""));

    // Reporte de vencimientos filtrado por rojo: mismas filas que el panel (otros tests pueden agregar lotes: se reintenta).
    await expect(async () => {
      await admin.goto("/panel");
      const ahora = Number((await admin.locator('a[data-semaforo="ROJO"] [data-conteo="lotes"]').innerText()).replace(/\D/g, ""));
      await admin.goto("/reportes/vencimientos?semaforo=rojo");
      const cifras = (await admin.getByRole("main").innerText()).replace(/\s+/g, " ");
      const filas = /Lotes por ubicación (\d[\d.]*)/.exec(cifras);
      expect(Number((filas as RegExpExecArray)[1].replace(/\./g, ""))).toBe(ahora);
    }).toPass({ timeout: 30_000 });
    expect(lotesEnRojo).toBeGreaterThan(0);
    await expect(admin.getByRole("combobox", { name: "Semáforo" }).locator("option:checked")).toHaveText("Rojo (menos de 3 meses)");
    await expect(admin.getByRole("main").locator("tbody tr").first()).toContainText("Rojo");

    // CSV de vencimientos (vencidos): columna "Semáforo" con texto.
    const csv = await (await admin.request.get("/reportes/exportar/vencimientos?semaforo=vencido")).text();
    const [encabezado, ...lineas] = csv.replace(/^﻿/, "").trim().split("\r\n");
    const columnas = (encabezado as string).split(";");
    const indice = columnas.indexOf("Semáforo");
    expect(indice).toBeGreaterThan(-1);
    expect(lineas.length).toBeGreaterThanOrEqual(lotesVencidos > 0 ? 1 : 0);
    for (const linea of lineas) expect(linea.split(";")[indice]).toBe("Vencido");

    // CSV de existencias: todos los colores, siempre con su nombre.
    const existencias = await (await admin.request.get("/reportes/exportar/existencias")).text();
    const filasCsv = existencias.replace(/^﻿/, "").trim().split("\r\n").slice(1);
    const valores = new Set(filasCsv.map((l) => l.split(";")[indice]));
    for (const v of valores) expect(["Rojo", "Amarillo", "Verde", "Vencido", "Sin vencimiento"]).toContain(v);
    expect(valores.has("Verde")).toBe(true);
    expect(valores.has("Rojo")).toBe(true);
  });
});

test.describe("Panel: proveedores", () => {
  test("@movil los tres roles ven los proveedores con «Ir a comprar», y el detalle se despliega con el teclado", async ({ abrirComo }) => {
    // El administrador crea un proveedor con sitio web (escrito sin https://) y otro sin sitio.
    const admin = await abrirComo("admin");
    const s = sufijo().toLowerCase();
    const conSitio = { razon: `Distribuidora e2e ${s}`, rut: rutValido(), dominio: `www.ejemplo-e2e-${s}.cl` };
    const sinSitio = { razon: `Proveedor sin sitio e2e ${s}`, rut: rutValido() };
    await admin.goto("/admin/proveedores");
    for (const p of [conSitio, sinSitio]) {
      await admin.getByRole("button", { name: "Nuevo proveedor" }).click();
      const dialogo = admin.getByRole("dialog", { name: "Nuevo proveedor" });
      await dialogo.getByLabel("RUT").fill(p.rut.canonico);
      await dialogo.getByLabel("Razón social").fill(p.razon);
      if ("dominio" in p) {
        await dialogo.getByLabel("Persona de contacto").fill("Paula Henríquez");
        await dialogo.getByLabel("Teléfono").fill("+56 2 2345 6789");
        await dialogo.getByLabel("Correo electrónico").fill(`ventas@ejemplo-e2e-${s}.cl`);
        // Enlace peligroso: se rechaza con un mensaje en el campo.
        await dialogo.getByLabel("Sitio web (para comprar)").fill("javascript:alert(1)");
        await dialogo.getByRole("button", { name: "Crear proveedor" }).click();
        await expect(dialogo).toContainText("Ingresa un sitio web válido");
        await dialogo.getByLabel("Sitio web (para comprar)").fill(`${p.dominio}/tienda`);
      }
      await dialogo.getByRole("button", { name: "Crear proveedor" }).click();
      await expect(dialogo).toBeHidden();
    }

    for (const rol of ROLES) {
      const pagina = await abrirComo(rol);
      // En el panel, la sección existe para los tres roles.
      await pagina.goto("/panel");
      const principal = pagina.getByRole("main");
      await expect(principal.getByRole("heading", { name: "Proveedores", exact: true })).toBeVisible();
      await expect(principal.locator("li[data-proveedor]").first()).toBeVisible();
      expect(await principal.locator("li[data-proveedor]").count()).toBeLessThanOrEqual(6);

      // Directorio completo: el proveedor con sitio tiene el botón; el enlace es seguro y abre en otra pestaña.
      const fila = await filaDeProveedor(pagina, conSitio.razon);
      const comprar = fila.getByRole("link", { name: /Ir a comprar/ });
      await expect(comprar).toHaveAttribute("href", `https://${conSitio.dominio}/tienda`);
      await expect(comprar).toHaveAttribute("target", "_blank");
      await expect(comprar).toHaveAttribute("rel", "noopener noreferrer");
      await expect(comprar).toHaveAccessibleName(new RegExp(`${conSitio.dominio}.*pestaña nueva`));
      await expect(fila).toContainText(conSitio.dominio); // dominio a la vista
      expect((await comprar.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(40);

      // Desplegable accesible con teclado: Enter sobre el nombre abre el detalle.
      const resumen = fila.locator("summary");
      await expect(fila.getByRole("link", { name: /Teléfono/ })).toBeHidden();
      await resumen.focus();
      await pagina.keyboard.press("Enter");
      await expect(fila.getByRole("link", { name: /Teléfono/ })).toHaveAttribute("href", "tel:+56223456789");
      await expect(fila.getByRole("link", { name: /Correo electrónico/ })).toHaveAttribute("href", `mailto:ventas@ejemplo-e2e-${s}.cl`);
      await expect(fila).toContainText("Contacto: Paula Henríquez");
      await expect(fila).toContainText(`RUT: ${conSitio.rut.conPuntos}`);
      // "Editar" solo para quien puede gestionar proveedores.
      if (rol === "admin") {
        await expect(fila.getByRole("link", { name: /Editar/ })).toHaveAttribute("href", /^\/admin\/proveedores\?q=/);
      } else {
        await expect(fila.getByRole("link", { name: /Editar/ })).toHaveCount(0);
        await expect(pagina.getByRole("link", { name: "Administrar proveedores" })).toHaveCount(0);
      }
      await pagina.keyboard.press("Enter");
      await expect(fila.getByRole("link", { name: /Teléfono/ })).toBeHidden();

      // Sin sitio web no hay botón.
      const otra = await filaDeProveedor(pagina, sinSitio.razon);
      await expect(otra.getByRole("link", { name: /Ir a comprar/ })).toHaveCount(0);
      await expect(otra).toContainText("Sin sitio web");
    }

    // El administrador llega desde "Editar" al proveedor y cambia el sitio; desactivado, desaparece del directorio.
    const fila = await filaDeProveedor(admin, conSitio.razon);
    await fila.locator("summary").click();
    await fila.getByRole("link", { name: /Editar/ }).click();
    await expect(admin).toHaveURL(/\/admin\/proveedores\?q=/);
    await admin.getByRole("button", { name: `Acciones para ${conSitio.razon}` }).click();
    await admin.getByRole("menuitem", { name: "Editar" }).click();
    const editar = admin.getByRole("dialog", { name: "Editar proveedor" });
    await expect(editar.getByLabel("Sitio web (para comprar)")).toHaveValue(`https://${conSitio.dominio}/tienda`);
    await editar.getByLabel("Sitio web (para comprar)").fill("");
    await editar.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(editar).toBeHidden();
    const sinBoton = await filaDeProveedor(admin, conSitio.razon);
    await expect(sinBoton.getByRole("link", { name: /Ir a comprar/ })).toHaveCount(0);

    await admin.goto(`/admin/proveedores?q=${encodeURIComponent(sinSitio.razon)}`);
    await admin.getByRole("button", { name: `Acciones para ${sinSitio.razon}` }).click();
    await admin.getByRole("menuitem", { name: "Desactivar" }).click();
    await admin.getByRole("alertdialog").getByRole("button", { name: /Desactivar/ }).click();
    await expect(admin.getByRole("alertdialog")).toHaveCount(0);
    await admin.goto(`/proveedores?q=${encodeURIComponent(sinSitio.razon)}`);
    await expect(admin.getByRole("main")).toContainText("Ningún proveedor coincide");
  });

  test("el directorio no reemplaza la administración: bodeguero y visitante no pueden abrir /admin/proveedores", async ({ abrirComo }) => {
    for (const rol of ["bodega", "visita"] as const) {
      const pagina = await abrirComo(rol);
      expect((await pagina.goto("/proveedores"))?.status()).toBe(200);
      await pagina.goto("/admin/proveedores");
      await expect(pagina).toHaveURL(/\/sin-permiso$/);
    }
  });
});
