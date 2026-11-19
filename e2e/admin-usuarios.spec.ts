import type { Page } from "@playwright/test";
import { CENTROS, sufijo } from "./soporte/entorno";
import { desmarcar, marcar } from "./soporte/datos";
import { expect, iniciarSesion, sesionDe, test } from "./soporte/fixtures";

const ERROR_CREDENCIALES = "Email o contraseña incorrectos";

interface UsuarioPrueba {
  nombre: string;
  email: string;
  temporal: string;
}

type RolNuevo = "Administrador" | "Bodeguero" | "Visitante";

/** Crea un usuario desde /admin/usuarios y devuelve su contraseña temporal. */
async function crearUsuario(admin: Page, rol: RolNuevo, centros: string[] = [CENTROS.nunoa]): Promise<UsuarioPrueba> {
  const s = sufijo().toLowerCase();
  const usuario = { nombre: `Prueba E2E ${s}`, email: `e2e.${s}@redinsumos.cl` };
  await admin.goto("/admin/usuarios");
  await admin.getByRole("button", { name: "Nuevo usuario" }).click();
  const dialogo = admin.getByRole("dialog", { name: "Nuevo usuario" });
  await dialogo.getByLabel("Nombre y apellido").fill(usuario.nombre);
  // Con mayúsculas y espacios: el correo se normaliza.
  await dialogo.getByLabel("Email").fill(`  ${usuario.email.toUpperCase()} `);
  await marcar(dialogo.getByRole("radio", { name: new RegExp(`^${rol}`) }));
  if (rol !== "Administrador") {
    for (const centro of centros) await marcar(dialogo.getByRole("checkbox", { name: centro }));
  }
  await dialogo.getByRole("button", { name: "Crear usuario" }).click();

  const creado = admin.getByRole("dialog", { name: "Usuario creado" });
  await expect(creado).toContainText(usuario.email);
  const temporal = await creado.getByLabel("Contraseña temporal").inputValue();
  expect(temporal.length).toBeGreaterThanOrEqual(10);
  await creado.getByRole("button", { name: /Cerrar sin copiar|Listo/ }).click();
  await expect(creado).toBeHidden();
  return { ...usuario, temporal };
}

/** Fila del usuario en la tabla de /admin/usuarios (filtrada por su email). */
async function filaDeUsuario(admin: Page, usuario: UsuarioPrueba) {
  await admin.goto(`/admin/usuarios?q=${encodeURIComponent(usuario.email)}`);
  return admin.getByRole("row").filter({ hasText: usuario.email });
}

/** Primer ingreso: cambia la contraseña temporal por una definitiva. */
async function primerIngreso(pagina: Page, usuario: UsuarioPrueba, nueva: string): Promise<void> {
  await iniciarSesion(pagina, usuario.email, usuario.temporal);
  await expect(pagina).toHaveURL(/\/cambiar-password$/);
  await pagina.getByLabel("Contraseña actual").fill(usuario.temporal);
  await pagina.getByLabel("Nueva contraseña", { exact: true }).fill(nueva);
  await pagina.getByLabel("Repite la nueva contraseña").fill(nueva);
  await pagina.getByRole("button", { name: "Guardar nueva contraseña" }).click();
  await expect(pagina).toHaveURL(/\/panel/);
}

test.describe("Administración de usuarios", () => {
  test.use(sesionDe("admin"));

  test("crear usuario con contraseña temporal; primer ingreso obliga a cambiarla", async ({ page, abrirAnonimo }) => {
    const usuario = await crearUsuario(page, "Bodeguero");
    const fila = await filaDeUsuario(page, usuario);
    await expect(fila).toContainText(usuario.nombre);
    await expect(fila).toContainText("Bodeguero");
    await expect(fila).toContainText(CENTROS.nunoa);
    await expect(fila).toContainText("Nunca ingresó");
    await expect(fila).toContainText("Activo");

    const nuevo = await abrirAnonimo();
    await iniciarSesion(nuevo, usuario.email, usuario.temporal);
    await expect(nuevo).toHaveURL(/\/cambiar-password$/);
    await expect(nuevo.getByText("Es tu primer ingreso")).toBeVisible();
    await nuevo.goto("/inventario");
    await expect(nuevo).toHaveURL(/\/cambiar-password$/);

    // Contraseña actual incorrecta.
    const definitiva = `Definitiva.${sufijo()}.9`;
    await nuevo.getByLabel("Contraseña actual").fill("No.Es.La.Temporal.1");
    await nuevo.getByLabel("Nueva contraseña", { exact: true }).fill(definitiva);
    await nuevo.getByLabel("Repite la nueva contraseña").fill(definitiva);
    await nuevo.getByRole("button", { name: "Guardar nueva contraseña" }).click();
    await expect(nuevo.getByRole("main")).toContainText(/contraseña actual (no es correcta|es incorrecta|incorrecta)/i);

    // La nueva no puede ser igual a la temporal.
    await nuevo.getByLabel("Contraseña actual").fill(usuario.temporal);
    await nuevo.getByLabel("Nueva contraseña", { exact: true }).fill(usuario.temporal);
    await nuevo.getByLabel("Repite la nueva contraseña").fill(usuario.temporal);
    await nuevo.getByRole("button", { name: "Guardar nueva contraseña" }).click();
    await expect(nuevo.getByRole("main")).toContainText(/distinta/i);
    await expect(nuevo).toHaveURL(/\/cambiar-password$/);

    // Cambio válido → entra al panel con la navegación de bodeguero de Ñuñoa.
    await nuevo.getByLabel("Contraseña actual").fill(usuario.temporal);
    await nuevo.getByLabel("Nueva contraseña", { exact: true }).fill(definitiva);
    await nuevo.getByLabel("Repite la nueva contraseña").fill(definitiva);
    await nuevo.getByRole("button", { name: "Guardar nueva contraseña" }).click();
    await expect(nuevo).toHaveURL(/\/panel/);
    await expect(nuevo.getByRole("heading", { level: 1 })).toContainText("Hola, Prueba");
    await expect(nuevo.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Retiro" })).toBeVisible();
    await expect(nuevo.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Usuarios" })).toHaveCount(0);
    await expect(nuevo.getByRole("banner")).toContainText(CENTROS.nunoa);

    // La temporal dejó de servir; la definitiva funciona.
    await nuevo.getByRole("button", { name: /Menú de usuario/ }).click();
    await nuevo.getByRole("menuitem", { name: "Salir" }).click();
    await expect(nuevo).toHaveURL(/\/login/);
    await iniciarSesion(nuevo, usuario.email, usuario.temporal);
    await expect(nuevo.getByRole("alert").filter({ hasText: ERROR_CREDENCIALES })).toBeVisible();
    await iniciarSesion(nuevo, usuario.email, definitiva);
    await expect(nuevo).toHaveURL(/\/panel$/);

    await expect(await filaDeUsuario(page, usuario)).not.toContainText("Nunca ingresó");
  });

  test("validaciones al crear: campos obligatorios, centros y correo duplicado", async ({ page }) => {
    await page.goto("/admin/usuarios");
    await page.getByRole("button", { name: "Nuevo usuario" }).click();
    const dialogo = page.getByRole("dialog", { name: "Nuevo usuario" });
    await dialogo.getByRole("button", { name: "Crear usuario" }).click();
    await expect(dialogo).toContainText("Ingresa el nombre y apellido");
    await expect(dialogo).toContainText("Ingresa un email válido");
    await expect(dialogo).toContainText("Selecciona un rol");

    await dialogo.getByLabel("Nombre y apellido").fill("Duplicado E2E");
    await dialogo.getByLabel("Email").fill("BODEGA@redinsumos.cl");
    await marcar(dialogo.getByRole("radio", { name: /^Visitante/ }));
    await dialogo.getByRole("button", { name: "Crear usuario" }).click();
    await expect(dialogo).toContainText("Asigna al menos un centro");
    await marcar(dialogo.getByRole("checkbox", { name: CENTROS.valpo }));
    await dialogo.getByRole("button", { name: "Crear usuario" }).click();
    await expect(dialogo).toContainText(/Ya existe un usuario con (ese|este) (email|correo)/i);
    await expect(page.getByRole("dialog", { name: "Usuario creado" })).toHaveCount(0);
  });

  test("desactivar un usuario cierra su sesión de inmediato y le impide volver a entrar", async ({ page, abrirAnonimo }) => {
    const usuario = await crearUsuario(page, "Visitante");
    const definitiva = `Definitiva.${sufijo()}.9`;
    const sesionUsuario = await abrirAnonimo();
    await primerIngreso(sesionUsuario, usuario, definitiva);
    await sesionUsuario.goto("/inventario");
    await expect(sesionUsuario.getByRole("heading", { level: 1, name: "Inventario" })).toBeVisible();

    const fila = await filaDeUsuario(page, usuario);
    await fila.getByRole("button", { name: `Acciones para ${usuario.nombre}` }).click();
    await page.getByRole("menuitem", { name: "Desactivar usuario" }).click();
    const confirmacion = page.getByRole("alertdialog", { name: "¿Desactivar el usuario?" });
    await expect(confirmacion).toContainText("Se cerrarán sus sesiones de inmediato");
    await confirmacion.getByRole("button", { name: "Desactivar" }).click();
    await expect(confirmacion).toBeHidden();
    await expect(page.getByRole("row").filter({ hasText: usuario.email })).toContainText("Inactivo");

    // La sesión abierta deja de valer en la siguiente navegación…
    await sesionUsuario.goto("/alertas");
    await expect(sesionUsuario).toHaveURL(/\/login/);
    // …y no puede iniciar sesión otra vez (mismo mensaje genérico).
    await iniciarSesion(sesionUsuario, usuario.email, definitiva);
    await expect(sesionUsuario.getByRole("alert").filter({ hasText: ERROR_CREDENCIALES })).toBeVisible();
    await expect(sesionUsuario).toHaveURL(/\/login/);

    // Al reactivarlo puede volver a entrar.
    await page.getByRole("row").filter({ hasText: usuario.email }).getByRole("button", { name: `Acciones para ${usuario.nombre}` }).click();
    await page.getByRole("menuitem", { name: /Reactivar|Activar/ }).click();
    const reactivar = page.getByRole("alertdialog");
    if (await reactivar.isVisible().catch(() => false)) await reactivar.getByRole("button", { name: /Reactivar|Activar/ }).click();
    await expect(page.getByRole("row").filter({ hasText: usuario.email })).toContainText("Activo");
    await iniciarSesion(sesionUsuario, usuario.email, definitiva);
    await expect(sesionUsuario).toHaveURL(/\/panel$/);
  });

  test("el administrador no puede desactivarse a sí mismo", async ({ page }) => {
    await page.goto("/admin/usuarios?q=admin@redinsumos.cl");
    const fila = page.getByRole("row").filter({ hasText: "admin@redinsumos.cl" });
    await expect(fila).toContainText("Tú");
    await fila.getByRole("button", { name: /Acciones para/ }).click();
    const desactivar = page.getByRole("menuitem", { name: "Desactivar usuario" });
    if ((await desactivar.count()) > 0) await expect(desactivar).toBeDisabled();
  });

  test("cinco contraseñas incorrectas bloquean la cuenta aunque después se use la correcta", async ({ page, abrirAnonimo }) => {
    const usuario = await crearUsuario(page, "Visitante");
    const intruso = await abrirAnonimo();
    for (let intento = 1; intento <= 5; intento++) {
      await iniciarSesion(intruso, usuario.email, `Incorrecta.${intento}.2026`);
      await expect(intruso.getByRole("alert").filter({ hasText: ERROR_CREDENCIALES })).toBeVisible();
    }
    await iniciarSesion(intruso, usuario.email, usuario.temporal);
    await expect(intruso.getByRole("alert").filter({ hasText: ERROR_CREDENCIALES })).toBeVisible();
    await expect(intruso).toHaveURL(/\/login/);

    // Restablecer la contraseña desde administración desbloquea la cuenta.
    const fila = await filaDeUsuario(page, usuario);
    await fila.getByRole("button", { name: `Acciones para ${usuario.nombre}` }).click();
    await page.getByRole("menuitem", { name: "Restablecer contraseña" }).click();
    const confirmar = page.getByRole("alertdialog");
    await confirmar.getByRole("button", { name: /Restablecer/ }).click();
    const resultado = page.getByRole("dialog").filter({ hasText: "Contraseña temporal" });
    const nuevaTemporal = await resultado.getByLabel("Contraseña temporal").inputValue();
    expect(nuevaTemporal).not.toBe(usuario.temporal);
    await iniciarSesion(intruso, usuario.email, nuevaTemporal);
    await expect(intruso).toHaveURL(/\/cambiar-password$/);
  });

  test("cambiar el rol y los centros de un usuario rige de inmediato para su sesión abierta", async ({ page, abrirAnonimo }) => {
    const usuario = await crearUsuario(page, "Bodeguero");
    const sesionUsuario = await abrirAnonimo();
    await primerIngreso(sesionUsuario, usuario, `Definitiva.${sufijo()}.9`);
    await sesionUsuario.goto("/movimientos/retiro");
    await expect(sesionUsuario.getByRole("heading", { level: 1, name: "Registrar retiro" })).toBeVisible();

    // El administrador lo pasa a Visitante de Valparaíso.
    const fila = await filaDeUsuario(page, usuario);
    await fila.getByRole("button", { name: `Acciones para ${usuario.nombre}` }).click();
    await page.getByRole("menuitem", { name: "Editar datos, rol y centros" }).click();
    const dialogo = page.getByRole("dialog", { name: "Editar usuario" });
    await marcar(dialogo.getByRole("radio", { name: /^Visitante/ }));
    await desmarcar(dialogo.getByRole("checkbox", { name: CENTROS.nunoa }));
    await marcar(dialogo.getByRole("checkbox", { name: CENTROS.valpo }));
    await dialogo.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(dialogo).toBeHidden();
    const actualizada = page.getByRole("row").filter({ hasText: usuario.email });
    await expect(actualizada).toContainText("Visitante");
    await expect(actualizada).toContainText(CENTROS.valpo);

    // Su sesión anterior ya no puede retirar: o se cerró, o quedó sin permiso.
    await sesionUsuario.goto("/movimientos/retiro");
    await expect(sesionUsuario).toHaveURL(/\/(login|sin-permiso)/);
    if (sesionUsuario.url().includes("/login")) {
      await sesionUsuario.getByLabel("Correo electrónico").fill(usuario.email);
    }
    await expect(sesionUsuario.getByRole("heading", { name: "Registrar retiro" })).toHaveCount(0);
  });

  test("cambiar la propia contraseña cierra las demás sesiones del usuario", async ({ page, abrirAnonimo }) => {
    const usuario = await crearUsuario(page, "Visitante");
    const primera = `Primera.${sufijo()}.9`;
    const segunda = `Segunda.${sufijo()}.9`;
    const equipoA = await abrirAnonimo();
    await primerIngreso(equipoA, usuario, primera);
    const equipoB = await abrirAnonimo();
    await iniciarSesion(equipoB, usuario.email, primera);
    await expect(equipoB).toHaveURL(/\/panel$/);

    await equipoA.getByRole("button", { name: /Menú de usuario/ }).click();
    await equipoA.getByRole("menuitem", { name: "Cambiar contraseña" }).click();
    await expect(equipoA).toHaveURL(/\/cambiar-password$/);
    await equipoA.getByLabel("Contraseña actual").fill(primera);
    await equipoA.getByLabel("Nueva contraseña", { exact: true }).fill(segunda);
    await equipoA.getByLabel("Repite la nueva contraseña").fill(segunda);
    await equipoA.getByRole("button", { name: "Guardar nueva contraseña" }).click();
    await expect(equipoA).toHaveURL(/\/panel/);

    // El otro equipo pierde la sesión; el que hizo el cambio la conserva.
    await equipoB.goto("/inventario");
    await expect(equipoB).toHaveURL(/\/login/);
    await equipoA.goto("/inventario");
    await expect(equipoA.getByRole("heading", { level: 1, name: "Inventario" })).toBeVisible();
    await iniciarSesion(equipoB, usuario.email, primera);
    await expect(equipoB.getByRole("alert").filter({ hasText: ERROR_CREDENCIALES })).toBeVisible();
  });
});
