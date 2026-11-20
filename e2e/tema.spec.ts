import type { Page } from "@playwright/test";
import { CUENTAS } from "./soporte/entorno";
import { expect, iniciarSesion, test } from "./soporte/fixtures";

/**
 * Tema claro / oscuro / según el dispositivo. La preferencia va en la cookie
 * `ri_tema`; el servidor la aplica en `<html data-tema>` (sin script en línea)
 * y, sin cookie, decide el CSS con `prefers-color-scheme`.
 */

const FONDO_CLARO = "rgb(244, 247, 248)";
const FONDO_OSCURO = "rgb(9, 12, 14)";

const html = (pagina: Page) => pagina.locator("html");
const fondo = (pagina: Page) => pagina.evaluate(() => getComputedStyle(document.body).backgroundColor);
const esquema = (pagina: Page) => pagina.evaluate(() => getComputedStyle(document.documentElement).colorScheme);

async function esperarTema(pagina: Page, tema: "claro" | "oscuro") {
  await expect.poll(() => fondo(pagina)).toBe(tema === "oscuro" ? FONDO_OSCURO : FONDO_CLARO);
  expect(await esquema(pagina)).toBe(tema === "oscuro" ? "dark" : "light");
}

async function cookieTema(pagina: Page) {
  return (await pagina.context().cookies()).find((c) => c.name === "ri_tema");
}

/** HTML inicial del servidor para la ruta (sin ejecutar nada en el navegador). */
async function htmlInicial(pagina: Page, ruta: string): Promise<string> {
  const respuesta = await pagina.request.get(ruta);
  expect(respuesta.ok()).toBe(true);
  return respuesta.text();
}

/** Contraste WCAG entre el color del texto y el fondo propio de cada elemento. */
async function contrastes(pagina: Page, selector: string): Promise<{ texto: string; ratio: number }[]> {
  return pagina.locator(selector).evaluateAll((elementos) => {
    const lienzo = document.createElement("canvas").getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    const rgb = (color: string) => {
      lienzo.clearRect(0, 0, 1, 1);
      lienzo.fillStyle = color;
      lienzo.fillRect(0, 0, 1, 1);
      return [...lienzo.getImageData(0, 0, 1, 1).data];
    };
    const luminancia = ([r, g, b]: number[]) => {
      const canal = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
      return 0.2126 * canal(r!) + 0.7152 * canal(g!) + 0.0722 * canal(b!);
    };
    return elementos.map((el) => {
      const estilo = getComputedStyle(el);
      const fondoPropio = rgb(estilo.backgroundColor);
      if (fondoPropio[3]! < 250) throw new Error(`"${el.textContent}" no tiene un fondo opaco propio`);
      const [a, b] = [luminancia(rgb(estilo.color)), luminancia(fondoPropio)];
      return { texto: (el.textContent ?? "").trim(), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
    });
  });
}

test.describe("Tema de la interfaz", () => {
  test.describe("sin sesión guardada", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("se cambia desde el menú de usuario y persiste al recargar y al cerrar y abrir sesión @movil", async ({ page }) => {
      await page.emulateMedia({ colorScheme: "light" });
      await iniciarSesion(page, CUENTAS.visita.email, CUENTAS.visita.password);
      await expect(page).toHaveURL(/\/panel$/);
      await esperarTema(page, "claro");
      await expect(html(page)).not.toHaveAttribute("data-tema");

      await page.getByRole("button", { name: /Menú de usuario/ }).click();
      const menu = page.getByRole("menu");
      const opciones = menu.getByRole("menuitemradio");
      await expect(opciones).toHaveCount(3);
      await expect(menu.getByRole("menuitemradio", { name: "Según el dispositivo" })).toBeChecked();

      await menu.getByRole("menuitemradio", { name: "Oscuro" }).click();
      await expect(html(page)).toHaveAttribute("data-tema", "oscuro");
      await esperarTema(page, "oscuro");
      // Elegir no cierra el menú, y la opción queda marcada.
      await expect(menu.getByRole("menuitemradio", { name: "Oscuro" })).toBeChecked();
      await expect(menu.getByRole("menuitemradio", { name: "Según el dispositivo" })).not.toBeChecked();

      // Cookie legible por el navegador, SameSite=Lax y de un año.
      const cookie = await cookieTema(page);
      expect(cookie).toMatchObject({ value: "oscuro", path: "/", httpOnly: false, sameSite: "Lax" });
      const dias = ((cookie?.expires ?? 0) - Date.now() / 1000) / 86_400;
      expect(dias).toBeGreaterThan(360);
      expect(dias).toBeLessThanOrEqual(366);
      // El servidor vuelve a renderizar con la cookie: un solo theme-color, el del tema oscuro.
      await expect
        .poll(() => page.locator('meta[name="theme-color"]').evaluateAll((metas) => metas.map((m) => m.getAttribute("content"))))
        .toEqual(["#12161a"]);

      // Persiste al recargar: lo aplica el servidor en el primer HTML.
      await page.keyboard.press("Escape");
      await page.reload();
      await expect(html(page)).toHaveAttribute("data-tema", "oscuro");
      await esperarTema(page, "oscuro");
      expect(await htmlInicial(page, "/panel")).toMatch(/<html[^>]* data-tema="oscuro"/);

      // Persiste al cerrar la sesión (login en oscuro, con su selector marcado)…
      await page.getByRole("button", { name: /Menú de usuario/ }).click();
      await page.getByRole("menu").getByRole("menuitem", { name: "Salir" }).click();
      await expect(page).toHaveURL(/\/login/);
      await esperarTema(page, "oscuro");
      await expect(page.getByRole("group", { name: "Tema" }).getByRole("radio", { name: "Oscuro" })).toBeChecked();

      // …y al volver a entrar.
      await iniciarSesion(page, CUENTAS.visita.email, CUENTAS.visita.password);
      await expect(page).toHaveURL(/\/panel$/);
      await expect(html(page)).toHaveAttribute("data-tema", "oscuro");
      await esperarTema(page, "oscuro");

      // De vuelta a claro desde el menú.
      await page.getByRole("button", { name: /Menú de usuario/ }).click();
      await page.getByRole("menu").getByRole("menuitemradio", { name: "Claro" }).click();
      await expect(html(page)).toHaveAttribute("data-tema", "claro");
      await esperarTema(page, "claro");
    });

    test("«Según el dispositivo» sigue a prefers-color-scheme y es el valor por defecto", async ({ page }) => {
      await page.emulateMedia({ colorScheme: "dark" });
      await page.goto("/login");
      const selector = page.getByRole("group", { name: "Tema" });
      await expect(selector.getByRole("radio", { name: "Según el dispositivo" })).toBeChecked();
      await expect(html(page)).not.toHaveAttribute("data-tema");
      expect(await cookieTema(page)).toBeUndefined();
      await esperarTema(page, "oscuro");

      await page.emulateMedia({ colorScheme: "light" });
      await esperarTema(page, "claro");

      // Sin cookie, el servidor entrega un theme-color por esquema y ningún tema forzado.
      const inicial = await htmlInicial(page, "/login");
      expect(inicial).not.toMatch(/<html[^>]* data-tema=/);
      expect(inicial).toContain('<meta name="theme-color" content="#1a7480" media="(prefers-color-scheme: light)"/>');
      expect(inicial).toContain('<meta name="theme-color" content="#12161a" media="(prefers-color-scheme: dark)"/>');

      // Un tema forzado manda sobre el dispositivo…
      await page.emulateMedia({ colorScheme: "dark" });
      await selector.getByRole("radio", { name: "Claro" }).check({ force: true });
      await expect(html(page)).toHaveAttribute("data-tema", "claro");
      await esperarTema(page, "claro");
      expect((await cookieTema(page))?.value).toBe("claro");
      await page.reload();
      await esperarTema(page, "claro");

      await page.emulateMedia({ colorScheme: "light" });
      await page.getByRole("group", { name: "Tema" }).getByRole("radio", { name: "Oscuro" }).check({ force: true });
      await esperarTema(page, "oscuro");

      // …y volver a «Según el dispositivo» borra la cookie y lo vuelve a seguir.
      await page.getByRole("group", { name: "Tema" }).getByRole("radio", { name: "Según el dispositivo" }).check({ force: true });
      await expect(html(page)).not.toHaveAttribute("data-tema");
      await esperarTema(page, "claro");
      expect(await cookieTema(page)).toBeUndefined();
      await page.emulateMedia({ colorScheme: "dark" });
      await esperarTema(page, "oscuro");
    });

    test("el primer HTML ya trae el tema de la cookie, sin scripts en línea sin nonce, y un valor inválido se ignora", async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: "ri_tema", value: "oscuro", url: baseURL as string }]);
      const oscuro = await htmlInicial(page, "/login");
      expect(oscuro).toMatch(/<html[^>]* data-tema="oscuro"/);
      expect(oscuro).toContain('<meta name="theme-color" content="#12161a"/>');
      // La CSP no se relajó y todo <script> lleva el nonce de la solicitud.
      const scripts = oscuro.match(/<script\b[^>]*>/g) ?? [];
      expect(scripts.length).toBeGreaterThan(0);
      expect(scripts.filter((s) => !/\snonce="[^"]+"/.test(s))).toEqual([]);
      const csp = (await page.request.get("/login")).headers()["content-security-policy"] ?? "";
      expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
      expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);

      // En el navegador: tema aplicado y ninguna violación de CSP (la vigila el fixture de consola).
      await page.goto("/login");
      await esperarTema(page, "oscuro");

      await context.clearCookies();
      await context.addCookies([{ name: "ri_tema", value: "%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E", url: baseURL as string }]);
      const invalido = await htmlInicial(page, "/login");
      expect(invalido).not.toMatch(/<html[^>]* data-tema=/);
      expect(invalido).not.toContain("<script>alert(1)");
    });
  });

  test("las vistas de impresión salen en claro aunque el tema sea oscuro", async ({ abrirComo, baseURL }) => {
    const admin = await abrirComo("admin");
    await admin.context().addCookies([{ name: "ri_tema", value: "oscuro", url: baseURL as string }]);
    for (const ruta of ["/alertas/reposicion", "/reportes/existencias"]) {
      await admin.goto(ruta);
      await esperarTema(admin, "oscuro");
      await admin.emulateMedia({ media: "print" });
      expect(await fondo(admin)).toBe("rgb(255, 255, 255)");
      expect(await esquema(admin)).toBe("light");
      const tarjeta = admin.locator("[data-imprimible] table").first();
      await expect(tarjeta).toBeVisible();
      // Texto oscuro sobre papel blanco: los tokens vuelven a ser los claros.
      expect(await admin.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ri-texto").trim())).toBe("#10242b");
      expect(await admin.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-peligro-700").trim())).toBe("#b91c1c");
      await admin.emulateMedia({ media: "screen" });
      await esperarTema(admin, "oscuro");
    }

    // También cuando el oscuro viene del dispositivo.
    await admin.context().clearCookies({ name: "ri_tema" });
    await admin.emulateMedia({ colorScheme: "dark" });
    await admin.goto("/alertas/reposicion");
    await esperarTema(admin, "oscuro");
    await admin.emulateMedia({ media: "print", colorScheme: "dark" });
    expect(await fondo(admin)).toBe("rgb(255, 255, 255)");
    expect(await esquema(admin)).toBe("light");
  });

  for (const tema of ["oscuro", "claro"] as const) {
    test(`el semáforo de vencimiento mantiene forma, texto y contraste AA en tema ${tema}`, async ({ abrirComo, baseURL }) => {
      const admin = await abrirComo("admin");
      await admin.context().addCookies([{ name: "ri_tema", value: tema, url: baseURL as string }]);
      const vistos = new Set<string>();
      for (const pestana of ["vencidos", "rojo", "amarillo"]) {
        await admin.goto(`/alertas?tab=${pestana}`);
        await esperarTema(admin, tema);
        const insignias = admin.getByRole("main").locator("tbody span[title]").filter({ has: admin.locator("svg") });
        await expect(insignias.first()).toBeVisible();
        for (const { texto, ratio } of await contrastes(admin, "main tbody span[title]:has(svg)")) {
          expect(ratio, `contraste de «${texto}» en tema ${tema}`).toBeGreaterThanOrEqual(4.5);
          vistos.add(texto.split(/[\s·,]/)[0] as string);
        }
        // Forma propia: cada insignia lleva su ícono además del nombre escrito.
        await expect(insignias.first().locator("svg")).toBeVisible();
      }
      expect([...vistos].sort()).toEqual(["Amarillo", "Rojo", "Vencido"]);

      // Estados de stock y verde, en el inventario.
      await admin.goto("/inventario");
      await expect(admin.locator("main tbody span.rounded-full:has(svg)").nth(5)).toBeVisible();
      const filas = await contrastes(admin, "main tbody span.rounded-full:has(svg)");
      expect(filas.length).toBeGreaterThan(5);
      for (const { texto, ratio } of filas) expect(ratio, `contraste de «${texto}» en tema ${tema}`).toBeGreaterThanOrEqual(4.5);
    });
  }
});
