import type { APIResponse, Page } from "@playwright/test";
import { crearInsumo, esperarStockEnGrilla, marcar, registrarIngreso } from "./soporte/datos";
import { CENTROS, CUENTAS, INSTITUCIONES, diaSantiago, sufijo } from "./soporte/entorno";
import { expect, test } from "./soporte/fixtures";
import { primerIngreso } from "./soporte/usuarios";

/**
 * Nivel Institución de punta a punta:
 *  - el administrador de una institución no ve ni toca nada de la otra;
 *  - el administrador de la red ve el total y el resumen por institución;
 *  - se crea una institución con su primer administrador, que hace su primer ingreso.
 *
 * Seed: Andes (Ñuñoa + Concepción, cuenta `andes`) y Cerro Alegre (Consultorio
 * Cerro Alegre, cuenta `cerro`); `admin` es el administrador de la red.
 */

/** Id de un centro, leído de su enlace en /admin/centros (con una sesión que lo ve). */
async function idDeCentro(pagina: Page, nombre: string): Promise<string> {
  await pagina.goto("/admin/centros");
  const href = await pagina.getByRole("main").getByRole("link", { name: new RegExp(nombre) }).first().getAttribute("href");
  return (href as string).split("/").pop() as string;
}

async function textoCsv(respuesta: APIResponse): Promise<string> {
  expect(respuesta.status()).toBe(200);
  return (await respuesta.body()).toString("utf8");
}

/** Abre el selector de centro activo del shell y devuelve su menú. */
async function abrirSelectorDeCentro(pagina: Page) {
  await pagina.getByRole("banner").getByRole("button", { name: /Cambiar centro activo/ }).click();
  const menu = pagina.getByRole("menu");
  await expect(menu).toBeVisible();
  return menu;
}

/**
 * Reescribe el cuerpo de las Server Actions que salen de la página (como haría
 * alguien que manipula la solicitud): reemplaza `buscar` por `reemplazo`.
 * Devuelve cuántas solicitudes modificó.
 */
async function manipularAcciones(pagina: Page, buscar: string, reemplazo: string): Promise<{ modificadas: number }> {
  const estado = { modificadas: 0 };
  await pagina.route("**/*", async (ruta) => {
    const solicitud = ruta.request();
    const cuerpo = solicitud.postData();
    if (solicitud.method() === "POST" && solicitud.headers()["next-action"] && cuerpo?.includes(buscar)) {
      estado.modificadas += 1;
      await ruta.continue({ postData: cuerpo.split(buscar).join(reemplazo) });
    } else {
      await ruta.continue();
    }
  });
  return estado;
}

test.describe("Administrador de institución: no ve la otra institución", () => {
  test("selector de centro, panel, inventario y menú: solo su institución @movil", async ({ abrirComo, isMobile }) => {
    const andes = await abrirComo("andes");
    await andes.goto("/panel");
    // Parte en "Toda mi institución" (nunca "Toda la red").
    const barra = andes.getByRole("banner");
    await expect(barra).toContainText("Toda mi institución");
    await expect(barra).not.toContainText("Toda la red");
    await expect(andes.getByRole("main")).toContainText("Resumen de toda tu institución");
    // El resumen de la red por institución es solo del administrador de la red.
    await expect(andes.locator("[data-resumen-instituciones]")).toHaveCount(0);
    await expect(andes.getByRole("main")).not.toContainText(CENTROS.valpo);
    await expect(andes.getByRole("main")).not.toContainText(INSTITUCIONES.cerro);

    const menu = await abrirSelectorDeCentro(andes);
    await expect(menu.getByRole("menuitem")).toHaveText([/Toda mi institución/, new RegExp(CENTROS.conce), new RegExp(CENTROS.nunoa)]);
    await expect(menu).not.toContainText(CENTROS.valpo);
    await expect(menu).not.toContainText("Toda la red");
    // Elegir un centro y volver a toda la institución.
    await menu.getByRole("menuitem", { name: new RegExp(CENTROS.nunoa) }).click();
    await expect(barra).toContainText(CENTROS.nunoa);
    await (await abrirSelectorDeCentro(andes)).getByRole("menuitem", { name: /Toda mi institución/ }).click();
    await expect(barra).toContainText("Toda mi institución");

    // Su menú de usuario dice a qué institución pertenece.
    await andes.getByRole("button", { name: /Menú de usuario/ }).click();
    await expect(andes.locator("[data-institucion-usuario]")).toHaveText(INSTITUCIONES.andes);
    await andes.keyboard.press("Escape");

    if (!isMobile) {
      await expect(andes.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Instituciones" })).toHaveCount(0);
    }
    // El historial y las alertas de toda su institución no mencionan el centro ajeno.
    for (const ruta of ["/movimientos", "/alertas", "/inventario"]) {
      await andes.goto(ruta);
      await expect(andes.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(andes.getByRole("main")).not.toContainText(CENTROS.valpo);
    }
  });

  test("URL directa con ids de la otra institución: nada se abre ni se filtra", async ({ abrirComo, vigilancia }) => {
    vigilancia.tolerar(); // se provocan respuestas 403/404 a propósito
    const red = await abrirComo("admin");
    const centroAjeno = await idDeCentro(red, CENTROS.valpo);
    const centroPropio = await idDeCentro(red, CENTROS.nunoa);
    await red.goto("/admin/usuarios?q=bodega.valparaiso");
    const filaAjena = red.getByRole("row").filter({ hasText: "bodega.valparaiso@redinsumos.cl" });
    await expect(filaAjena).toContainText(INSTITUCIONES.cerro);
    await red.goto("/admin/instituciones");
    const hrefUsuarios = await red.getByRole("row").filter({ hasText: INSTITUCIONES.cerro }).getByRole("link", { name: /activo/ }).getAttribute("href");
    const institucionAjena = new URL(hrefUsuarios as string, "http://x").searchParams.get("institucion") as string;
    expect(institucionAjena).toBeTruthy();

    const andes = await abrirComo("andes");
    // Administración de instituciones: sin permiso.
    await andes.goto("/admin/instituciones");
    await expect(andes).toHaveURL(/\/sin-permiso$/);

    // Centros: solo los suyos; la ficha de un centro ajeno "no existe".
    await andes.goto("/admin/centros");
    const principal = andes.getByRole("main");
    await expect(principal.getByRole("link", { name: new RegExp(CENTROS.nunoa) })).toBeVisible();
    await expect(principal.getByRole("link", { name: new RegExp(CENTROS.conce) })).toBeVisible();
    await expect(principal).not.toContainText(CENTROS.valpo);
    await expect(principal).not.toContainText(INSTITUCIONES.cerro);
    await andes.goto(`/admin/centros/${centroAjeno}`);
    await expect(andes.getByRole("heading", { name: "No encontramos esta página" })).toBeVisible();
    await expect(andes.getByRole("main")).not.toContainText(CENTROS.valpo);
    await andes.goto(`/admin/centros/${centroPropio}`);
    await expect(andes.getByRole("heading", { level: 1, name: CENTROS.nunoa })).toBeVisible();

    // Usuarios: ni los de la otra institución ni los administradores de la red, tampoco forzando filtros.
    for (const consulta of ["", `?institucion=${institucionAjena}`, `?centro=${centroAjeno}`, "?q=valparaiso", "?q=carolina", "?rol=ADMIN_RED"]) {
      await andes.goto(`/admin/usuarios${consulta}`);
      await expect(andes.getByRole("heading", { level: 1, name: "Usuarios" })).toBeVisible();
      const tabla = andes.getByRole("main");
      await expect(tabla).not.toContainText("bodega.valparaiso@redinsumos.cl");
      await expect(tabla).not.toContainText(CUENTAS.cerro.email);
      await expect(tabla).not.toContainText(CUENTAS.admin.email);
    }
    await andes.goto("/admin/usuarios");
    await expect(andes.getByRole("main")).toContainText(CUENTAS.bodega.email);
    // El filtro por institución no existe para él; el de rol no ofrece "Administrador de la red".
    await expect(andes.getByLabel("Institución", { exact: true })).toHaveCount(0);
    await expect(andes.getByLabel("Rol", { exact: true }).locator("option")).toHaveText([
      "Todos", "Administrador de institución", "Bodeguero", "Visitante",
    ]);

    // Vistas con ?centro=: un centro ajeno se ignora (sigue viendo solo lo suyo).
    for (const ruta of [`/alertas?centro=${centroAjeno}`, `/reportes/existencias?centro=${centroAjeno}`, `/alertas/reposicion?centro=${centroAjeno}`]) {
      await andes.goto(ruta);
      await expect(andes.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(andes.getByRole("main")).not.toContainText(CENTROS.valpo);
    }

    // Auditoría: solo registros de su institución.
    await andes.goto("/admin/auditoria");
    await expect(andes.getByRole("table", { name: "Registro de auditoría" })).toBeVisible();
    await expect(andes.getByRole("main")).toContainText(INSTITUCIONES.andes);
    await expect(andes.getByRole("main")).not.toContainText(CENTROS.valpo);
    await expect(andes.getByLabel("Institución", { exact: true })).toHaveCount(0);
    await andes.goto(`/admin/auditoria?institucion=${institucionAjena}`);
    await expect(andes.getByRole("main")).not.toContainText(CENTROS.valpo);
    await andes.goto(`/admin/auditoria?entidad=Centro&entidadId=${centroAjeno}`);
    await expect(andes.getByRole("heading", { name: "Sin eventos para estos filtros" })).toBeVisible();
  });

  test("exportación CSV: sin filas de la otra institución, y pedir un centro ajeno se rechaza", async ({ abrirComo, vigilancia }) => {
    vigilancia.tolerar();
    const red = await abrirComo("admin");
    const centroAjeno = await idDeCentro(red, CENTROS.valpo);
    const andes = await abrirComo("andes");
    const cerro = await abrirComo("cerro");

    // (Hasta 10 descargas por usuario y minuto: este test hace 8 con la cuenta de Andes.)
    const propios: Record<string, string> = {};
    for (const reporte of ["existencias", "movimientos", "consumo"]) {
      const propio = await textoCsv(await andes.request.get(`/reportes/exportar/${reporte}`));
      propios[reporte] = propio;
      expect(propio, `${reporte}: sin el centro ajeno`).not.toContain(CENTROS.valpo);
      const rechazo = await andes.request.get(`/reportes/exportar/${reporte}?centro=${centroAjeno}`);
      expect(rechazo.status(), `${reporte}?centro=<ajeno> debe rechazarse`).toBe(403);
      expect((await rechazo.body()).toString("utf8")).not.toContain(CENTROS.valpo);
    }
    const reposicion = await textoCsv(await andes.request.get("/alertas/reposicion/exportar"));
    expect(reposicion).not.toContain(CENTROS.valpo);
    expect((await andes.request.get(`/alertas/reposicion/exportar?centro=${centroAjeno}`)).status()).toBe(403);

    // Control: cada institución recibe lo suyo (y su propio centro sí lo puede pedir).
    const deAndes = propios.existencias as string;
    expect(deAndes).toContain(CENTROS.nunoa);
    expect(deAndes).toContain(CENTROS.conce);
    const deCerro = await textoCsv(await cerro.request.get("/reportes/exportar/existencias"));
    expect(deCerro).toContain(CENTROS.valpo);
    expect(deCerro).not.toContain(CENTROS.nunoa);
    expect(deCerro).not.toContain(CENTROS.conce);
    expect((await cerro.request.get(`/reportes/exportar/existencias?centro=${centroAjeno}`)).status()).toBe(200);
  });

  test("Server Action manipulada: no edita un centro ajeno, no asigna centros ajenos y no crea administradores de la red", async ({ abrirComo }) => {
    const red = await abrirComo("admin");
    const centroAjeno = await idDeCentro(red, CENTROS.valpo);
    const centroPropio = await idDeCentro(red, CENTROS.nunoa);

    // 1) Editar un centro propio, cambiando el id en la solicitud por el del centro ajeno.
    const andes = await abrirComo("andes");
    const edicion = await manipularAcciones(andes, centroPropio, centroAjeno);
    await andes.goto(`/admin/centros/${centroPropio}`);
    await andes.getByLabel("Dirección").fill(`Dirección tomada ${sufijo()}`);
    await andes.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(andes.getByRole("main")).toContainText("El centro no existe o no tienes acceso");
    expect(edicion.modificadas).toBeGreaterThan(0);
    await red.goto(`/admin/centros/${centroAjeno}`);
    await expect(red.getByLabel("Dirección")).toHaveValue("Lautaro Rosas 485");
    await red.goto(`/admin/centros/${centroPropio}`);
    await expect(red.getByLabel("Dirección")).toHaveValue("Av. Irarrázaval 2841");

    // 2) Crear un bodeguero cambiando el centro propio por el ajeno en la solicitud.
    const andes2 = await abrirComo("andes");
    const asignacion = await manipularAcciones(andes2, centroPropio, centroAjeno);
    const s = sufijo().toLowerCase();
    await andes2.goto("/admin/usuarios");
    await andes2.getByRole("button", { name: "Nuevo usuario" }).click();
    const dialogo = andes2.getByRole("dialog", { name: "Nuevo usuario" });
    // El formulario no ofrece ni el rol de red, ni otra institución, ni centros ajenos.
    await expect(dialogo.getByRole("radio")).toHaveCount(3);
    await expect(dialogo.getByRole("radio", { name: /^Administrador de la red/ })).toHaveCount(0);
    await expect(dialogo.locator('select[name="institucionId"]')).toHaveCount(0);
    await dialogo.getByLabel("Nombre y apellido").fill(`Intruso E2E ${s}`);
    await dialogo.getByLabel("Correo electrónico").fill(`intruso.${s}@redinsumos.cl`);
    await marcar(dialogo.getByRole("radio", { name: /^Bodeguero/ }));
    await expect(dialogo.getByRole("checkbox", { name: CENTROS.valpo })).toHaveCount(0);
    await marcar(dialogo.getByRole("checkbox", { name: CENTROS.nunoa }));
    await dialogo.getByRole("button", { name: "Crear usuario" }).click();
    await expect(dialogo).toContainText("no existe o no pertenece a la institución del usuario");
    expect(asignacion.modificadas).toBeGreaterThan(0);
    await expect(andes2.getByRole("dialog", { name: "Usuario creado" })).toHaveCount(0);

    // 3) Crear un administrador de institución cambiando el rol por ADMIN_RED en la solicitud.
    const andes3 = await abrirComo("andes");
    const escalada = await manipularAcciones(andes3, '"rol":"ADMIN"', '"rol":"ADMIN_RED"');
    await andes3.goto("/admin/usuarios");
    await andes3.getByRole("button", { name: "Nuevo usuario" }).click();
    const dialogo3 = andes3.getByRole("dialog", { name: "Nuevo usuario" });
    await dialogo3.getByLabel("Nombre y apellido").fill(`Escalada E2E ${s}`);
    await dialogo3.getByLabel("Correo electrónico").fill(`escalada.${s}@redinsumos.cl`);
    await marcar(dialogo3.getByRole("radio", { name: /^Administrador de institución/ }));
    await dialogo3.getByRole("button", { name: "Crear usuario" }).click();
    await expect(dialogo3).toContainText("No tienes permiso para asignar ese rol");
    expect(escalada.modificadas).toBeGreaterThan(0);

    // Nada de lo anterior quedó creado.
    await red.goto(`/admin/usuarios?q=${s}`);
    await expect(red.getByRole("heading", { name: "Ningún usuario coincide" })).toBeVisible();
  });

  test("catálogo compartido: crea insumos y define sus mínimos, pero no modifica los existentes", async ({ abrirComo }) => {
    const andes = await abrirComo("andes");
    await andes.goto("/admin/insumos");
    await expect(andes.locator("[data-aviso-catalogo-compartido]")).toContainText("contacta al administrador de la red");
    // Crea un insumo nuevo: queda en la ficha, de solo lectura, con los mínimos de SUS centros.
    const insumo = await crearInsumo(andes);
    const principal = andes.getByRole("main");
    await expect(principal).toContainText("Este insumo es compartido por toda la red; para modificarlo contacta al administrador de la red.");
    await expect(andes.locator("[data-insumo-solo-lectura]")).toContainText(insumo.codigo);
    await expect(andes.getByRole("button", { name: "Guardar datos del insumo" })).toHaveCount(0);
    await expect(andes.getByRole("button", { name: /Desactivar|Eliminar/ })).toHaveCount(0);
    await expect(andes.getByLabel(`Mínimo en ${CENTROS.nunoa}`)).toBeVisible();
    await expect(andes.getByLabel(`Mínimo en ${CENTROS.conce}`)).toBeVisible();
    await expect(andes.getByLabel(`Mínimo en ${CENTROS.valpo}`)).toHaveCount(0);
    await andes.getByLabel(`Mínimo en ${CENTROS.nunoa}`).fill("7");
    await andes.getByRole("button", { name: "Guardar mínimos y máximos" }).click();
    await expect(andes.getByRole("region", { name: /Notificaciones/ }).or(andes.locator("[data-sonner-toaster], [role=status]")).first()).toBeVisible();

    // Categorías: puede crear; no renombra ni elimina.
    await andes.goto("/admin/categorias");
    await expect(andes.locator("[data-aviso-catalogo-compartido]")).toBeVisible();
    await expect(andes.getByRole("button", { name: "Nueva categoría" })).toBeVisible();
    await expect(andes.getByRole("button", { name: /^(Renombrar|Eliminar) / })).toHaveCount(0);

    // El administrador de la red sí edita ese mismo insumo y ve los centros de todas las instituciones.
    const red = await abrirComo("admin");
    await red.goto(`/admin/insumos/${insumo.id}`);
    await expect(red.getByRole("button", { name: "Guardar datos del insumo" })).toBeVisible();
    await expect(red.getByLabel(`Mínimo en ${CENTROS.nunoa}`)).toHaveValue("7");
    await expect(red.getByLabel(`Mínimo en ${CENTROS.valpo}`)).toBeVisible();
    // Y la otra institución no ve el mínimo que definió Andes.
    const cerro = await abrirComo("cerro");
    await cerro.goto(`/admin/insumos/${insumo.id}`);
    await expect(cerro.getByLabel(`Mínimo en ${CENTROS.valpo}`)).toHaveValue("");
    await expect(cerro.getByLabel(`Mínimo en ${CENTROS.nunoa}`)).toHaveCount(0);
  });
});

test.describe("Administrador de la red: ve el total", () => {
  test("panel: la red por institución, con detalle por centro y enlaces a las alertas @movil", async ({ abrirComo }) => {
    const red = await abrirComo("admin");
    await red.goto("/panel");
    await expect(red.getByRole("banner")).toContainText("Toda la red");
    const resumen = red.locator("[data-resumen-instituciones]");
    await expect(resumen.getByRole("heading", { name: "La red por institución" })).toBeVisible();
    const tarjetas = resumen.getByRole("list", { name: "Instituciones de la red" }).getByRole("link");
    const andes = tarjetas.filter({ hasText: INSTITUCIONES.andes });
    const cerro = tarjetas.filter({ hasText: INSTITUCIONES.cerro });
    await expect(andes).toContainText("2 centros");
    await expect(cerro).toContainText("1 centro");
    for (const etiqueta of ["Sin stock", "Bajo mínimo", "Vencidos", "Por vencer"]) await expect(andes).toContainText(etiqueta);

    // Elegir una institución filtra el detalle a SUS centros.
    await andes.click();
    await expect(red).toHaveURL(/\/panel\?institucion=[a-z0-9_]+/);
    const detalle = resumen.locator("[data-detalle-institucion]");
    await expect(detalle.getByRole("heading")).toContainText(INSTITUCIONES.andes);
    await expect(detalle.locator("[data-centro]")).toHaveCount(2);
    await expect(detalle).toContainText(CENTROS.nunoa);
    await expect(detalle).toContainText(CENTROS.conce);
    await expect(detalle).not.toContainText(CENTROS.valpo);
    await expect(resumen.getByRole("link", { name: new RegExp(INSTITUCIONES.andes) }).first()).toHaveAttribute("aria-current", "true");

    await cerro.click();
    await expect(detalle.getByRole("heading")).toContainText(INSTITUCIONES.cerro);
    await expect(detalle.locator("[data-centro]")).toHaveCount(1);
    await expect(detalle).toContainText(CENTROS.valpo);
    // Un conteo del detalle lleva a Alertas ya filtrado por ese centro.
    const conteo = detalle.getByRole("link").filter({ hasNotText: "Quitar filtro" }).first();
    await expect(conteo).toHaveAttribute("href", /\/alertas\?tab=[a-z-]+&centro=[a-z0-9]+/);
    await conteo.click();
    await expect(red).toHaveURL(/\/alertas\?tab=/);
    await expect(red.getByRole("heading", { level: 1 })).toContainText("Alertas");
    await expect(red.getByRole("main")).toContainText(CENTROS.valpo);

    // "Quitar filtro" vuelve al resumen completo; un id inventado se ignora.
    await red.goto("/panel?institucion=no-existe");
    await expect(resumen.locator("[data-detalle-institucion]")).toHaveCount(0);
    await expect(tarjetas).toHaveCount(await tarjetas.count());
  });

  test("selector de centro agrupado por institución; centros, usuarios y auditoría de toda la red", async ({ abrirComo }) => {
    const red = await abrirComo("admin");
    await red.goto("/panel");
    const menu = await abrirSelectorDeCentro(red);
    await expect(menu.getByRole("menuitem").first()).toContainText("Toda la red");
    // (Otros tests crean instituciones en la misma base: se comprueban las del seed.)
    const grupos = await menu.locator("[data-grupo-institucion]").allInnerTexts();
    expect(grupos).toEqual(expect.arrayContaining([INSTITUCIONES.andes, INSTITUCIONES.cerro]));
    // Cada centro aparece bajo el encabezado de SU institución (los grupos van en orden alfabético).
    const orden = await menu.locator("[data-grupo-institucion], [role=menuitem]").allInnerTexts();
    const posicion = (texto: string) => orden.findIndex((t) => t.includes(texto));
    expect(posicion(INSTITUCIONES.andes)).toBeLessThan(posicion(CENTROS.conce));
    expect(posicion(CENTROS.conce)).toBeLessThan(posicion(CENTROS.nunoa));
    expect(posicion(CENTROS.nunoa)).toBeLessThan(posicion(INSTITUCIONES.cerro));
    expect(posicion(INSTITUCIONES.cerro)).toBeLessThan(posicion(CENTROS.valpo));
    await menu.getByRole("menuitem", { name: new RegExp(CENTROS.valpo) }).click();
    await expect(red.getByRole("banner")).toContainText(CENTROS.valpo);
    // Con un centro activo ya no se muestra el resumen por institución.
    await expect(red.locator("[data-resumen-instituciones]")).toHaveCount(0);
    await (await abrirSelectorDeCentro(red)).getByRole("menuitem", { name: /Toda la red/ }).click();
    await expect(red.locator("[data-resumen-instituciones]")).toBeVisible();

    // Centros agrupados por institución.
    await red.goto("/admin/centros");
    const grupoAndes = red.locator(`section[data-institucion="${INSTITUCIONES.andes}"]`);
    const grupoCerro = red.locator(`section[data-institucion="${INSTITUCIONES.cerro}"]`);
    await expect(grupoAndes.getByRole("link", { name: new RegExp(CENTROS.nunoa) })).toBeVisible();
    await expect(grupoAndes.getByRole("link", { name: new RegExp(CENTROS.conce) })).toBeVisible();
    await expect(grupoAndes).not.toContainText(CENTROS.valpo);
    await expect(grupoCerro.getByRole("link", { name: new RegExp(CENTROS.valpo) })).toBeVisible();
    // "Agregar centro" de un grupo llega al formulario con esa institución elegida.
    await grupoCerro.getByRole("link", { name: `Agregar centro a ${INSTITUCIONES.cerro}` }).click();
    await expect(red).toHaveURL(/\/admin\/centros\/nuevo\?institucion=/);
    await expect(red.getByLabel("Institución").locator("option:checked")).toHaveText(INSTITUCIONES.cerro);

    // Usuarios: ve los de todas y filtra por institución.
    await red.goto("/admin/usuarios?q=%40redinsumos.cl&rol=ADMIN");
    await expect(red.getByRole("main")).toContainText(CUENTAS.andes.email);
    await expect(red.getByRole("main")).toContainText(CUENTAS.cerro.email);
    await red.getByLabel("Institución", { exact: true }).selectOption({ label: INSTITUCIONES.cerro });
    await expect(red).toHaveURL(/institucion=/);
    const tabla = red.getByRole("table", { name: "Usuarios" });
    await expect(tabla).toContainText(CUENTAS.cerro.email);
    await expect(tabla).not.toContainText(CUENTAS.andes.email);
    await expect(tabla).not.toContainText(CUENTAS.bodega.email);

    // Instituciones: conteos de centros y usuarios.
    await red.goto("/admin/instituciones");
    const filaAndes = red.getByRole("row").filter({ hasText: INSTITUCIONES.andes });
    await expect(filaAndes).toContainText("2 activos");
    await expect(filaAndes).toContainText(/\d+ administrador/);
    // No se puede desactivar una institución con centros activos con stock.
    await filaAndes.getByRole("button", { name: `Acciones para ${INSTITUCIONES.andes}` }).click();
    await red.getByRole("menuitem", { name: "Desactivar institución" }).click();
    const confirmar = red.getByRole("alertdialog", { name: "¿Desactivar la institución?" });
    await expect(confirmar).toContainText("Hoy tiene stock en sus centros");
    await confirmar.getByRole("button", { name: "Desactivar" }).click();
    await expect(red.getByText(/tiene 2 centros activos con stock/).first()).toBeVisible();
    await red.reload();
    await expect(red.getByRole("row").filter({ hasText: INSTITUCIONES.andes })).toContainText("Activo");

    // Auditoría: columna de institución y filtro (incluye los eventos de red).
    await red.goto("/admin/auditoria");
    await expect(red.getByRole("columnheader", { name: "Institución" })).toBeVisible();
    await red.getByLabel("Institución", { exact: true }).selectOption({ label: "Eventos de la red (sin institución)" });
    await expect(red).toHaveURL(/institucion=red/);
    await expect(red.getByRole("table", { name: "Registro de auditoría" }).locator("tbody tr").first()).toContainText("Red");
  });
});

test.describe("Alta de una institución", () => {
  test("crear institución + su primer administrador + primer centro + primer ingreso", async ({ abrirComo, abrirAnonimo }) => {
    const s = sufijo();
    const institucion = `Clínica E2E ${s}`;
    const administrador = { nombre: `Admin Inst ${s}`, email: `admin.${s.toLowerCase()}@redinsumos.cl` };
    const centro = `Centro E2E ${s}`;

    // El administrador de la red crea la institución con su primer administrador.
    const red = await abrirComo("admin");
    await red.goto("/admin/instituciones");
    await red.getByRole("button", { name: "Nueva institución" }).click();
    const dialogo = red.getByRole("dialog", { name: "Nueva institución" });
    await dialogo.getByRole("button", { name: "Crear institución" }).click();
    await expect(dialogo).toContainText("Ingresa el nombre de la institución");
    await expect(dialogo).toContainText("Ingresa el nombre y apellido");
    await dialogo.getByLabel("Nombre de la institución").fill(institucion);
    await dialogo.getByLabel("RUT").fill("76.543.210-3");
    await expect(dialogo.getByRole("checkbox", { name: "Crear a su primer administrador" })).toBeChecked();
    await dialogo.getByLabel("Nombre y apellido").fill(administrador.nombre);
    await dialogo.getByLabel("Correo electrónico").fill(CUENTAS.bodega.email); // ya existe
    await dialogo.getByRole("button", { name: "Crear institución" }).click();
    await expect(dialogo).toContainText(/Ya existe un usuario con ese correo/);
    await dialogo.getByLabel("Correo electrónico").fill(administrador.email);
    await dialogo.getByRole("button", { name: "Crear institución" }).click();

    // La contraseña temporal del administrador se muestra una sola vez.
    const creada = red.getByRole("dialog", { name: "Institución creada" });
    await expect(creada).toContainText(administrador.email);
    await expect(creada).toContainText("Solo se muestra esta vez");
    const temporal = await creada.getByLabel("Contraseña temporal").inputValue();
    expect(temporal.length).toBeGreaterThanOrEqual(10);
    await creada.getByRole("button", { name: /Cerrar sin copiar|Listo/ }).click();
    const fila = red.getByRole("row").filter({ hasText: institucion });
    await expect(fila).toContainText("0 activos");
    await expect(fila).toContainText("1 administrador");

    // Primer ingreso del administrador de la institución: cambia la contraseña y parte sin centros.
    const nuevo = await abrirAnonimo();
    await primerIngreso(nuevo, { ...administrador, temporal }, `Definitiva.${s}.9`);
    await expect(nuevo.getByRole("banner")).toContainText("Administrador de institución");
    await nuevo.goto("/admin/centros");
    await expect(nuevo.getByRole("heading", { name: "Aún no hay centros" })).toBeVisible();
    await expect(nuevo.getByRole("main")).not.toContainText(CENTROS.nunoa);
    await nuevo.goto("/admin/usuarios");
    await expect(nuevo.getByRole("table", { name: "Usuarios" }).locator("tbody tr")).toHaveCount(1);
    await expect(nuevo.getByRole("main")).toContainText(administrador.email);

    // Crea su primer centro (no elige institución: es la suya).
    await nuevo.goto("/admin/centros/nuevo");
    await expect(nuevo.getByRole("main")).toContainText(`Se agrega a ${institucion}`);
    await expect(nuevo.locator('select[name="institucionId"]')).toHaveCount(0);
    await nuevo.getByLabel("Nombre del centro").fill(centro);
    await nuevo.getByLabel("Tipo de centro").selectOption({ label: "Clínica" });
    await nuevo.getByLabel("Dirección").fill("Av. Nueva 123");
    await nuevo.getByLabel("Región").selectOption({ label: "Valparaíso" });
    await nuevo.getByLabel("Comuna").selectOption({ label: "Valparaíso" });
    await nuevo.getByRole("button", { name: "Crear centro" }).click();
    await expect(nuevo.getByRole("heading", { level: 1, name: centro })).toBeVisible();
    await expect(nuevo.getByRole("main")).toContainText("Bodega principal");

    // Primer ingreso de stock: un insumo creado por él mismo, en la bodega de su centro.
    const insumo = await crearInsumo(nuevo);
    await registrarIngreso(nuevo, {
      insumo,
      ubicacion: { nombre: "Bodega principal", centro },
      lote: `INST-${s}`,
      vence: diaSantiago(300),
      cantidad: 15,
    });
    await esperarStockEnGrilla(nuevo, insumo, 15);
    await nuevo.goto("/movimientos");
    await expect(nuevo.getByRole("main")).toContainText(insumo.nombre);
    await expect(nuevo.getByRole("main")).not.toContainText(CENTROS.nunoa);

    // La red ve la institución nueva en su resumen; las demás instituciones no ven nada de ella.
    await red.goto("/panel");
    await expect(red.locator("[data-resumen-instituciones]")).toContainText(institucion);
    await red.goto("/admin/centros");
    await expect(red.locator(`section[data-institucion="${institucion}"]`).getByRole("link", { name: new RegExp(centro) })).toBeVisible();
    const andes = await abrirComo("andes");
    await andes.goto("/admin/centros");
    await expect(andes.getByRole("main")).not.toContainText(centro);
    await andes.goto(`/inventario?q=${insumo.codigo}`);
    await expect(andes.getByRole("main")).not.toContainText(cajasDe(15));
    await andes.goto("/admin/usuarios?q=" + encodeURIComponent(administrador.email));
    await expect(andes.getByRole("heading", { name: "Ningún usuario coincide" })).toBeVisible();
  });
});

/** "15 cajas" como expresión (sin confundir con 115). */
function cajasDe(n: number): RegExp {
  return new RegExp(`(^|\\D)${n}\\s+cajas?`);
}
