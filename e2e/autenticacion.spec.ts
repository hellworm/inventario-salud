import { CUENTA_PENDIENTE, CUENTAS } from "./soporte/entorno";
import { bugConocido, expect, iniciarSesion, test } from "./soporte/fixtures";

const ERROR_CREDENCIALES = "Email o contraseña incorrectos";

// Estos tests inician sesión de verdad: parten sin sesión guardada.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Autenticación", () => {
  test("sin sesión, cualquier ruta protegida lleva a /login conservando el destino", async ({ page }) => {
    await page.goto("/inventario?estado=SIN_STOCK");
    await expect(page).toHaveURL(/\/login\?destino=%2Finventario%3Festado%3DSIN_STOCK$/);
    await expect(page.getByRole("heading", { level: 1, name: "Ingresa a tu cuenta" })).toBeVisible();
  });

  test("inicio de sesión correcto, menú de usuario y cierre de sesión @movil", async ({ page }) => {
    await iniciarSesion(page, CUENTAS.visita.email, CUENTAS.visita.password);
    await expect(page).toHaveURL(/\/panel$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Hola, Javiera");

    await page.getByRole("button", { name: /Menú de usuario/ }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toContainText(CUENTAS.visita.email);
    await expect(menu).toContainText("Visitante");
    await menu.getByRole("menuitem", { name: "Salir" }).click();
    await expect(page).toHaveURL(/\/login/);

    // La sesión quedó cerrada en el servidor: no se puede volver atrás ni entrar por URL.
    await page.goto("/panel");
    await expect(page).toHaveURL(/\/login/);
    await page.goBack();
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
  });

  test("tras iniciar sesión vuelve al destino solicitado", async ({ page }) => {
    await page.goto("/alertas?tab=vencidos");
    await expect(page).toHaveURL(/\/login\?destino=/);
    await page.getByLabel("Correo electrónico").fill(CUENTAS.visita.email);
    await page.getByLabel("Contraseña", { exact: true }).fill(CUENTAS.visita.password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/alertas\?tab=vencidos$/);
  });

  test("el destino del login no permite redirigir a otro sitio", async ({ page }) => {
    await page.goto("/login?destino=https%3A%2F%2Fexample.com%2Frobo");
    await page.getByLabel("Correo electrónico").fill(CUENTAS.visita.email);
    await page.getByLabel("Contraseña", { exact: true }).fill(CUENTAS.visita.password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    expect(new URL(page.url()).host).toBe(new URL(test.info().project.use.baseURL as string).host);
  });

  test("credenciales incorrectas: mensaje único y sin sesión", async ({ page }) => {
    // Correo inexistente: no consume intentos de ninguna cuenta real.
    await iniciarSesion(page, "nadie.e2e@redinsumos.cl", "Clave.Mala.2026");
    await expect(page.getByRole("alert").filter({ hasText: ERROR_CREDENCIALES })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/panel");
    await expect(page).toHaveURL(/\/login/);
  });

  test("validación del formulario de login (campos vacíos y correo sin formato)", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("Correo electrónico").fill("no-es-correo");
    await page.getByLabel("Contraseña", { exact: true }).fill("x");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { level: 1, name: "Ingresa a tu cuenta" })).toBeVisible();
  });

  test("una cuenta con contraseña temporal queda retenida en /cambiar-password", async ({ page }) => {
    await iniciarSesion(page, CUENTA_PENDIENTE.email, CUENTA_PENDIENTE.password);
    await expect(page).toHaveURL(/\/cambiar-password$/);
    await expect(page.getByRole("heading", { level: 1, name: "Crea tu contraseña" })).toBeVisible();
    await expect(page.getByText("Es tu primer ingreso")).toBeVisible();

    // No puede saltarse el cambio navegando por URL ni descargando reportes.
    for (const ruta of ["/panel", "/inventario", "/movimientos/ingreso", "/admin/usuarios"]) {
      await page.goto(ruta);
      await expect(page, `${ruta} debe volver al cambio de contraseña`).toHaveURL(/\/cambiar-password$/);
    }
    const descarga = await page.request.get("/alertas/reposicion/exportar");
    expect(descarga.status()).toBe(403);

    // Reglas de la nueva contraseña (sin llegar a cambiarla: la cuenta del seed queda intacta).
    await page.getByLabel("Contraseña actual").fill(CUENTA_PENDIENTE.password);
    await page.getByLabel("Nueva contraseña", { exact: true }).fill("corta1");
    await page.getByLabel("Repite la nueva contraseña").fill("corta1");
    await page.getByRole("button", { name: "Guardar nueva contraseña" }).click();
    await expect(page.getByRole("main")).toContainText("Debe tener al menos 10 caracteres");
    await expect(page).toHaveURL(/\/cambiar-password$/);

    // Tras un error el formulario vuelve vacío (ver B-12): se llenan otra vez los tres campos.
    await page.getByLabel("Contraseña actual").fill(CUENTA_PENDIENTE.password);
    await page.getByLabel("Nueva contraseña", { exact: true }).fill("Distinta.Clave.2026");
    await page.getByLabel("Repite la nueva contraseña").fill("Otra.Clave.2026");
    await page.getByRole("button", { name: "Guardar nueva contraseña" }).click();
    await expect(page.getByRole("main")).toContainText(/no coinciden/i);

    await page.getByRole("button", { name: "Salir" }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("B-07: si la sesión venció, al enviar un formulario se avisa y se pide iniciar sesión", async ({ abrirComo, vigilancia }) => {
    bugConocido("B-07: con la cookie de sesión vencida el formulario dice 'No pudimos conectar con el servidor. Revisa tu conexión…'");
    vigilancia.tolerar();
    const bodeguero = await abrirComo("bodega");
    await bodeguero.goto("/movimientos/retiro");
    await bodeguero.getByRole("combobox", { name: "Insumo" }).fill("HEP-5000");
    await bodeguero.getByRole("option", { name: /Heparina sódica/ }).click();
    await expect(bodeguero.getByText(/Disponible en/)).toBeVisible();
    await bodeguero.getByRole("textbox", { name: "Cantidad a retirar" }).fill("1");

    // La cookie caduca en el navegador (12 h sin uso); la sesión guardada de la suite no se toca.
    await bodeguero.context().clearCookies();
    await bodeguero.getByRole("button", { name: "Registrar retiro" }).click();

    const avisoDeSesion = bodeguero.getByText(/sesión (expiró|venció|caducó)|inicia(r)? sesión/i).first();
    await expect(async () => {
      expect(bodeguero.url().includes("/login") || (await avisoDeSesion.isVisible())).toBe(true);
    }).toPass({ timeout: 8_000 });
    await expect(bodeguero.getByText("No pudimos conectar con el servidor")).toHaveCount(0);
  });
});
