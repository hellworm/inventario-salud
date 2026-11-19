import { CENTROS, INSTITUCIONES, comoSeMuestra, diaSantiago, sufijo } from "./soporte/entorno";
import { avisos, desmarcar, marcar } from "./soporte/datos";
import { expect, iniciarSesion, ipDePrueba, sesionDe, test } from "./soporte/fixtures";
import { crearUsuario, filaDeUsuario, primerIngreso } from "./soporte/usuarios";

const ERROR_CREDENCIALES = "Correo electrónico o contraseña incorrectos";

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
    // La contraseña temporal vence a las 72 horas y la lista lo dice (día 3 o 4 según la hora).
    await expect(fila).toContainText(
      new RegExp(`Contraseña temporal vence el (${comoSeMuestra(diaSantiago(3))}|${comoSeMuestra(diaSantiago(4))})`),
    );
    await expect(fila).not.toContainText("Contraseña temporal vencida");

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
    // B-12: el error no vacía lo que ya se escribió; solo la contraseña actual rechazada.
    await expect(nuevo.getByLabel("Contraseña actual")).toHaveValue("");
    await expect(nuevo.getByLabel("Nueva contraseña", { exact: true })).toHaveValue(definitiva);
    await expect(nuevo.getByLabel("Repite la nueva contraseña")).toHaveValue(definitiva);

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

    const despues = await filaDeUsuario(page, usuario);
    await expect(despues).not.toContainText("Nunca ingresó");
    // Ya cambió su contraseña: no queda nada "temporal" en la lista.
    await expect(despues).not.toContainText("Contraseña temporal");
  });

  test("validaciones al crear: campos obligatorios, centros y correo duplicado", async ({ page }) => {
    await page.goto("/admin/usuarios");
    await page.getByRole("button", { name: "Nuevo usuario" }).click();
    const dialogo = page.getByRole("dialog", { name: "Nuevo usuario" });
    await dialogo.getByRole("button", { name: "Crear usuario" }).click();
    await expect(dialogo).toContainText("Ingresa el nombre y apellido");
    await expect(dialogo).toContainText("Ingresa un correo electrónico válido");
    await expect(dialogo).toContainText("Selecciona un rol");

    await dialogo.getByLabel("Nombre y apellido").fill("Duplicado E2E");
    await dialogo.getByLabel("Correo electrónico").fill("BODEGA@redinsumos.cl");
    await marcar(dialogo.getByRole("radio", { name: /^Visitante/ }));
    await dialogo.getByRole("button", { name: "Crear usuario" }).click();
    // El administrador de la red debe elegir primero la institución; los centros que se ofrecen son solo los suyos.
    await expect(dialogo).toContainText("Selecciona la institución del usuario");
    await dialogo.locator('select[name="institucionId"]').selectOption({ label: INSTITUCIONES.cerro });
    await expect(dialogo.getByRole("checkbox", { name: CENTROS.valpo })).toBeVisible();
    await expect(dialogo.getByRole("checkbox", { name: CENTROS.nunoa })).toHaveCount(0);
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

  test("cinco fallos desde una misma conexión bloquean la cuenta DESDE ESA conexión; el titular entra desde otra red", async ({ page, abrirDesdeIp }) => {
    const usuario = await crearUsuario(page, "Visitante");
    const ipIntruso = ipDePrueba();
    const intruso = await abrirDesdeIp(ipIntruso);
    for (let intento = 1; intento <= 5; intento++) {
      await iniciarSesion(intruso, usuario.email, `Incorrecta.${intento}.2026`);
      await expect(intruso.getByRole("alert").filter({ hasText: ERROR_CREDENCIALES })).toBeVisible();
    }
    // Desde la conexión del intruso ni siquiera la contraseña correcta entra (mismo mensaje genérico).
    await iniciarSesion(intruso, usuario.email, usuario.temporal);
    await expect(intruso.getByRole("alert").filter({ hasText: ERROR_CREDENCIALES })).toBeVisible();
    await expect(intruso).toHaveURL(/\/login/);

    // El titular, desde OTRA red, no quedó fuera: entra con su contraseña.
    const titular = await abrirDesdeIp(ipDePrueba());
    await iniciarSesion(titular, usuario.email, usuario.temporal);
    await expect(titular).toHaveURL(/\/cambiar-password$/);

    // La conexión bloqueada sigue bloqueada aunque el titular haya entrado desde otra parte.
    await iniciarSesion(intruso, usuario.email, usuario.temporal);
    await expect(intruso.getByRole("alert").filter({ hasText: ERROR_CREDENCIALES })).toBeVisible();

    // El administrador ve el bloqueo y lo levanta; la auditoría registró el rechazo con su IP.
    const fila = await filaDeUsuario(page, usuario);
    await expect(fila).toContainText("Bloqueada");
    await fila.getByRole("button", { name: `Acciones para ${usuario.nombre}` }).click();
    await page.getByRole("menuitem", { name: "Desbloquear cuenta" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Desbloquear" }).click();
    await expect(avisos(page)).toContainText(/desbloquead/i);
    await expect(await filaDeUsuario(page, usuario)).not.toContainText("Bloqueada");
    await iniciarSesion(intruso, usuario.email, usuario.temporal);
    await expect(intruso).toHaveURL(/\/cambiar-password$/);

    await page.goto(`/admin/auditoria?accion=LOGIN_BLOQUEADO&desde=${diaSantiago(0)}`);
    const rechazo = page.getByRole("table", { name: "Registro de auditoría" }).locator("tbody tr").filter({ hasText: usuario.nombre }).first();
    await expect(rechazo).toContainText("Ingreso rechazado por bloqueo");
    await rechazo.getByRole("button", { name: /Ver detalle/ }).click();
    const detalle = page.getByRole("dialog");
    await expect(detalle).toContainText("Demasiados intentos fallidos con esta cuenta desde la misma dirección IP");
    await expect(detalle).toContainText(ipIntruso);
  });

  test("veinte intentos desde una misma IP con cualquier correo frenan a esa IP, no a las demás", async ({ page, abrirDesdeIp }) => {
    test.slow();
    const usuario = await crearUsuario(page, "Visitante");
    const ipRuidosa = ipDePrueba();
    const ruidosa = await abrirDesdeIp(ipRuidosa);
    // 20 intentos con correos que no existen (no tocan ninguna cuenta real).
    for (let intento = 1; intento <= 20; intento++) {
      await iniciarSesion(ruidosa, `nadie.${sufijo().toLowerCase()}@redinsumos.cl`, "Clave.Mala.2026");
      await expect(ruidosa.getByRole("alert").filter({ hasText: ERROR_CREDENCIALES })).toBeVisible();
      await expect(ruidosa.getByRole("button", { name: "Ingresar" })).toBeEnabled();
    }
    // El intento 21, aun con credenciales correctas, se rechaza desde esa IP.
    await iniciarSesion(ruidosa, usuario.email, usuario.temporal);
    await expect(ruidosa.getByRole("alert").filter({ hasText: ERROR_CREDENCIALES })).toBeVisible();
    await expect(ruidosa).toHaveURL(/\/login/);
    // Desde otra IP la misma cuenta entra sin problema: la cuenta no quedó bloqueada.
    const otra = await abrirDesdeIp(ipDePrueba());
    await iniciarSesion(otra, usuario.email, usuario.temporal);
    await expect(otra).toHaveURL(/\/cambiar-password$/);
    await expect(await filaDeUsuario(page, usuario)).not.toContainText("Bloqueada");
  });

  test("sin IP confiable el bloqueo es por cuenta: cinco fallos la bloquean y restablecer la contraseña la libera", async ({ page, abrirSinIp }) => {
    // El servidor no puede determinar la IP de estas solicitudes (como en un despliegue sin TRUST_PROXY).
    const usuario = await crearUsuario(page, "Visitante");
    const intruso = await abrirSinIp();
    for (let intento = 1; intento <= 5; intento++) {
      await iniciarSesion(intruso, usuario.email, `Incorrecta.${intento}.2026`);
      await expect(intruso.getByRole("alert").filter({ hasText: ERROR_CREDENCIALES })).toBeVisible();
    }
    await iniciarSesion(intruso, usuario.email, usuario.temporal);
    await expect(intruso.getByRole("alert").filter({ hasText: ERROR_CREDENCIALES })).toBeVisible();
    await expect(intruso).toHaveURL(/\/login/);
    // En este modo el bloqueo alcanza a todos: tampoco entra desde otro navegador.
    const otro = await abrirSinIp();
    await iniciarSesion(otro, usuario.email, usuario.temporal);
    await expect(otro.getByRole("alert").filter({ hasText: ERROR_CREDENCIALES })).toBeVisible();

    // Restablecer la contraseña desde administración desbloquea la cuenta.
    const fila = await filaDeUsuario(page, usuario);
    await expect(fila).toContainText("Bloqueada");
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

    // El administrador lo pasa a Visitante de Concepción (otro centro de SU institución:
    // un usuario no cambia de institución, y los centros de otra ni se ofrecen).
    const fila = await filaDeUsuario(page, usuario);
    await fila.getByRole("button", { name: `Acciones para ${usuario.nombre}` }).click();
    await page.getByRole("menuitem", { name: "Editar datos, rol y centros" }).click();
    const dialogo = page.getByRole("dialog", { name: "Editar usuario" });
    await marcar(dialogo.getByRole("radio", { name: /^Visitante/ }));
    await expect(dialogo.getByRole("checkbox", { name: CENTROS.valpo })).toHaveCount(0);
    await desmarcar(dialogo.getByRole("checkbox", { name: CENTROS.nunoa }));
    await marcar(dialogo.getByRole("checkbox", { name: CENTROS.conce }));
    await dialogo.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(dialogo).toBeHidden();
    const actualizada = page.getByRole("row").filter({ hasText: usuario.email });
    await expect(actualizada).toContainText("Visitante");
    await expect(actualizada).toContainText(CENTROS.conce);

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
