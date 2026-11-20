import type { Locator, Page } from "@playwright/test";
import { avisos, crearInsumo, definirMinimo, filaDeInventario, llenarIngreso, type InsumoPrueba } from "./soporte/datos";
import { CENTROS, INSTITUCIONES, rutValido, sufijo, UBICACIONES } from "./soporte/entorno";
import { expect, test } from "./soporte/fixtures";

/**
 * Proveedor por insumo: predeterminado de la red, preferencia por institución,
 * lo que ve cada rol, preselección en el ingreso, reposición agrupada por
 * proveedor y enlaces "Ir a comprar".
 */

/** Proveedores del seed (prisma/seed.ts). */
const RENALES = { razon: "Insumos Renales del Pacífico SpA", sitio: "https://www.ejemplo-renalespacifico.cl/", telefono: "+56 2 2890 1144" };
const ANDINA = { razon: "Distribuidora Clínica Andina Ltda.", sitio: "https://www.ejemplo-clinicaandina.cl/" };
const CORDILLERA = { razon: "Suministros Médicos Cordillera Ltda." };

/** Tarjeta "Proveedor" de la ficha del insumo. */
async function tarjetaProveedor(pagina: Page, insumo: InsumoPrueba): Promise<Locator> {
  await pagina.goto(`/inventario/${insumo.id}`);
  const tarjeta = pagina.locator("#proveedor");
  await expect(tarjeta.getByRole("heading", { name: "Proveedor" })).toBeVisible();
  return tarjeta;
}

/** En el diálogo "Cambiar proveedor": elige un proveedor (buscándolo si hay buscador). */
async function elegirProveedor(dialogo: Locator, razonSocial: string): Promise<void> {
  const buscador = dialogo.getByRole("searchbox", { name: "Buscar proveedor" });
  if (await buscador.count()) await buscador.fill(razonSocial);
  await dialogo.getByRole("radio", { name: new RegExp(razonSocial.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).check();
}

/** Paso de confirmación del diálogo: comprueba "Hoy / Quedará" y confirma. */
async function confirmarCambio(pagina: Page, dialogo: Locator, hoy: string | RegExp, quedara: string | RegExp, aviso: string | RegExp): Promise<void> {
  const resumen = dialogo.locator("[data-confirmar-proveedor]");
  await expect(resumen).toBeVisible();
  await expect(resumen.locator("dl > div").nth(0)).toContainText(hoy);
  await expect(resumen.locator("dl > div").nth(1)).toContainText(quedara);
  await expect(resumen).toContainText("El cambio queda en la auditoría");
  await dialogo.getByRole("button", { name: "Confirmar cambio" }).click();
  await expect(dialogo).toBeHidden();
  await expect(avisos(pagina)).toContainText(aviso);
}

/** El enlace "Ir a comprar" abre el sitio del proveedor en otra pestaña, sin `opener` ni `referrer`. */
async function esperarIrAComprar(contenedor: Locator, sitio: string): Promise<void> {
  const enlace = contenedor.getByRole("link", { name: /Ir a comprar/ }).first();
  await expect(enlace).toHaveAttribute("href", sitio);
  await expect(enlace).toHaveAttribute("target", "_blank");
  await expect(enlace).toHaveAttribute("rel", "noopener noreferrer");
}

test.describe("Proveedor por insumo", () => {
  test("la red define el predeterminado, una institución lo sobrescribe para sí y cada rol ve el suyo", async ({ abrirComo }) => {
    test.setTimeout(180_000);
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin);
    // Con un mínimo en Ñuñoa el insumo aparece en el inventario de Andes. (El consultorio de
    // Cerro Alegre no se toca: `coherencia.spec.ts` compara sus contadores en paralelo.)
    await definirMinimo(admin, insumo, CENTROS.nunoa, 10);

    // 1. Administrador de la red: sin proveedor → lo define desde la ficha como predeterminado de la red.
    const tarjeta = await tarjetaProveedor(admin, insumo);
    await expect(tarjeta).toContainText("Sin proveedor definido");
    await tarjeta.getByRole("button", { name: "Definir proveedor" }).click();
    const dialogo = admin.getByRole("dialog", { name: "Cambiar proveedor" });
    await expect(dialogo.getByRole("radio", { name: /Predeterminado de la red/ })).toBeChecked();
    await expect(dialogo.locator('[data-ambito-cambio="RED"]')).toContainText("Cambias el predeterminado de la red");
    // Mientras no elige nada distinto no puede continuar.
    await expect(dialogo.getByRole("button", { name: "Continuar" })).toBeDisabled();
    await elegirProveedor(dialogo, RENALES.razon);
    await dialogo.getByRole("button", { name: "Continuar" }).click();
    const confirmacion = admin.getByRole("dialog", { name: "Confirma el cambio de proveedor" });
    await expect(confirmacion).toContainText("proveedor predeterminado de la red");
    await confirmarCambio(admin, confirmacion, "Sin proveedor", RENALES.razon, `Proveedor predeterminado de la red: ${RENALES.razon}`);

    await expect(tarjeta.locator("[data-proveedor-efectivo]")).toHaveText(RENALES.razon);
    await expect(tarjeta).toContainText("Predeterminado de la red");
    await esperarIrAComprar(tarjeta, RENALES.sitio);
    await expect(tarjeta.getByRole("link", { name: /Teléfono/ })).toHaveAttribute("href", "tel:+56228901144");
    await expect(tarjeta.getByRole("link", { name: /Correo electrónico/ })).toHaveAttribute("href", /^mailto:ventas@/);

    // …y se ve en la grilla del inventario, en su columna.
    const filaAdmin = await filaDeInventario(admin, insumo);
    await expect(filaAdmin.locator("[data-columna-proveedor]")).toContainText(RENALES.razon);

    // 2. Administrador de la institución Andes: lo sobrescribe SOLO para la suya.
    const andes = await abrirComo("andes");
    const tarjetaAndes = await tarjetaProveedor(andes, insumo);
    await expect(tarjetaAndes.locator("[data-proveedor-efectivo]")).toHaveText(RENALES.razon);
    await tarjetaAndes.getByRole("button", { name: "Cambiar proveedor" }).click();
    const dialogoAndes = andes.getByRole("dialog", { name: "Cambiar proveedor" });
    // No elige ámbito: solo puede cambiar el de su institución, y se le dice con todas sus letras.
    await expect(dialogoAndes.getByRole("radio", { name: /Predeterminado de la red/ })).toHaveCount(0);
    const ambito = dialogoAndes.locator('[data-ambito-cambio="INSTITUCION"]');
    await expect(ambito).toContainText("Cambias el proveedor para tu institución");
    await expect(ambito).toContainText(INSTITUCIONES.andes);
    await expect(ambito).toContainText("el predeterminado de la red lo define el administrador de la red");
    await elegirProveedor(dialogoAndes, ANDINA.razon);
    await dialogoAndes.getByRole("button", { name: "Continuar" }).click();
    const confirmacionAndes = andes.getByRole("dialog", { name: "Confirma el cambio de proveedor" });
    await expect(confirmacionAndes).toContainText(`solo para ${INSTITUCIONES.andes}`);
    await confirmarCambio(andes, confirmacionAndes, RENALES.razon, ANDINA.razon, `Proveedor de ${INSTITUCIONES.andes}: ${ANDINA.razon}`);
    await expect(tarjetaAndes.locator("[data-proveedor-efectivo]")).toHaveText(ANDINA.razon);
    await expect(tarjetaAndes).toContainText("De tu institución");
    await expect(tarjetaAndes.locator("[data-proveedor-red]")).toContainText(RENALES.razon);
    await esperarIrAComprar(tarjetaAndes, ANDINA.sitio);

    // 3. La otra institución sigue viendo el de la red (administrador y bodeguero de Cerro Alegre).
    for (const rol of ["cerro", "valpo"] as const) {
      const pagina = await abrirComo(rol);
      const suTarjeta = await tarjetaProveedor(pagina, insumo);
      await expect(suTarjeta.locator("[data-proveedor-efectivo]"), `${rol} ve el predeterminado de la red`).toHaveText(RENALES.razon);
      await expect(suTarjeta).not.toContainText(ANDINA.razon);
      await esperarIrAComprar(suTarjeta, RENALES.sitio);
    }
    const cerroAdmin = await abrirComo("cerro");
    await cerroAdmin.goto(`/admin/insumos?q=${insumo.codigo}`);
    const filaCerro = cerroAdmin.getByRole("row").filter({ hasText: insumo.codigo });
    await expect(filaCerro).toContainText(RENALES.razon);
    await expect(filaCerro).not.toContainText(ANDINA.razon);

    // 4. Bodeguero y visitante de Andes lo ven (el de SU institución) pero no pueden cambiarlo.
    for (const rol of ["bodega", "visita"] as const) {
      const pagina = await abrirComo(rol);
      const suTarjeta = await tarjetaProveedor(pagina, insumo);
      await expect(suTarjeta.locator("[data-proveedor-efectivo]"), `${rol} ve el de su institución`).toHaveText(ANDINA.razon);
      await esperarIrAComprar(suTarjeta, ANDINA.sitio);
      await expect(suTarjeta.getByRole("button", { name: /Cambiar proveedor|Definir proveedor|Usar como predeterminado/ })).toHaveCount(0);
      // En la grilla y en el panel lateral, igual.
      const fila = await filaDeInventario(pagina, insumo);
      await expect(fila.locator("[data-columna-proveedor]")).toContainText(ANDINA.razon);
      await fila.getByRole("button").first().click();
      const panel = pagina.getByRole("dialog", { name: insumo.nombre });
      await expect(panel.locator("[data-proveedor-efectivo]")).toHaveText(ANDINA.razon);
      await esperarIrAComprar(panel, ANDINA.sitio);
      await expect(panel.getByRole("button", { name: /Cambiar proveedor/ })).toHaveCount(0);
    }

    // 5. El administrador de la red, en "Toda la red", ve el de la red y el desglose por institución.
    const tarjetaRed = await tarjetaProveedor(admin, insumo);
    await expect(tarjetaRed.locator("[data-proveedor-efectivo]")).toHaveText(RENALES.razon);
    const desglose = tarjetaRed.locator("[data-desglose-instituciones]");
    await expect(desglose).toContainText(INSTITUCIONES.andes);
    await expect(desglose).toContainText(ANDINA.razon);

    // 6. Ingreso: el proveedor llega preseleccionado (el de cada institución), sin impedir cambiarlo.
    const bodega = await abrirComo("bodega");
    await llenarIngreso(bodega, { insumo, ubicacion: UBICACIONES.nunoaBodega, lote: `PV-${insumo.sufijo}`, vence: "2031-12-31", cantidad: 5 });
    const selector = bodega.getByLabel("Proveedor");
    await expect(selector.locator("option:checked")).toContainText(ANDINA.razon);
    await expect(bodega.locator("[data-proveedor-sugerido]")).toContainText("Proveedor predeterminado de este insumo en tu institución");
    const valpo = await abrirComo("valpo");
    await valpo.goto(`/movimientos/ingreso?insumo=${insumo.id}`);
    await expect(valpo.getByLabel("Proveedor").locator("option:checked")).toContainText(RENALES.razon);

    // Registrar con OTRO proveedor no cambia el predeterminado.
    await selector.selectOption({ label: await etiquetaDe(selector, CORDILLERA.razon) });
    await expect(bodega.locator("[data-proveedor-sugerido]")).toContainText(`El predeterminado de este insumo es ${ANDINA.razon}`);
    await expect(bodega.locator("[data-proveedor-sugerido]")).toContainText("no cambia el predeterminado");
    await bodega.getByRole("button", { name: "Registrar ingreso" }).click();
    await expect(bodega.getByRole("heading", { name: "Ingreso registrado" })).toBeVisible();
    await expect((await tarjetaProveedor(bodega, insumo)).locator("[data-proveedor-efectivo]")).toHaveText(ANDINA.razon);

    // 7. Andes vuelve al predeterminado de la red.
    const otraVez = await tarjetaProveedor(andes, insumo);
    await otraVez.getByRole("button", { name: "Cambiar proveedor" }).click();
    await andes.getByRole("dialog", { name: "Cambiar proveedor" }).getByRole("button", { name: "Volver al predeterminado de la red" }).click();
    await confirmarCambio(
      andes,
      andes.getByRole("dialog", { name: "Confirma el cambio de proveedor" }),
      ANDINA.razon,
      `Predeterminado de la red (${RENALES.razon})`,
      "volvió al predeterminado de la red",
    );
    await expect(otraVez.locator("[data-proveedor-efectivo]")).toHaveText(RENALES.razon);
    await expect(otraVez).toContainText("Predeterminado de la red");

    // 8. Auditoría: la red ve los tres cambios; Andes solo los de su institución; Cerro Alegre, ninguno.
    const DE_RED = "Proveedor predeterminado de la red modificado";
    const DE_INSTITUCION = "Proveedor del insumo para la institución modificado";
    const registros = (pagina: Page, accion: string) => pagina.getByRole("main").getByRole("row").filter({ hasText: accion });
    await admin.goto(`/admin/auditoria?entidad=Insumo&entidadId=${insumo.id}`);
    await expect(registros(admin, DE_RED)).toHaveCount(1);
    await expect(registros(admin, DE_INSTITUCION)).toHaveCount(2);
    await andes.goto(`/admin/auditoria?entidad=Insumo&entidadId=${insumo.id}`);
    await expect(registros(andes, DE_INSTITUCION)).toHaveCount(2);
    await expect(registros(andes, DE_RED)).toHaveCount(0);
    const cerro = await abrirComo("cerro");
    await cerro.goto(`/admin/auditoria?entidad=Insumo&entidadId=${insumo.id}`);
    await expect(cerro.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(registros(cerro, DE_INSTITUCION)).toHaveCount(0);
  });

  test("un administrador de institución no puede cambiar el predeterminado de la red ni el de otra institución por la interfaz de administración", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin);
    // Administrador de la red: campo "Proveedor predeterminado" en la edición del insumo.
    await admin.goto(`/admin/insumos/${insumo.id}`);
    await admin.getByLabel("Proveedor predeterminado").selectOption({ label: RENALES.razon });
    await admin.getByRole("button", { name: "Guardar datos del insumo" }).click();
    await expect(avisos(admin)).toContainText("Datos del insumo guardados");
    await admin.goto(`/admin/insumos?q=${insumo.codigo}`);
    await expect(admin.getByRole("row").filter({ hasText: insumo.codigo })).toContainText(RENALES.razon);

    // Administrador de institución: ve el de la red en solo lectura y fija el de SU institución en su sección.
    const cerro = await abrirComo("cerro");
    await cerro.goto(`/admin/insumos/${insumo.id}`);
    await expect(cerro.getByLabel("Proveedor predeterminado")).toHaveCount(0);
    await expect(cerro.locator("[data-insumo-solo-lectura]")).toContainText("Proveedor predeterminado de la red");
    await expect(cerro.locator("[data-insumo-solo-lectura]")).toContainText(RENALES.razon);
    const seccion = cerro.locator("#proveedor");
    await expect(seccion.getByRole("heading", { name: "Proveedor de tu institución" })).toBeVisible();
    await seccion.getByRole("button", { name: "Cambiar proveedor" }).click();
    const dialogo = cerro.getByRole("dialog", { name: "Cambiar proveedor" });
    await expect(dialogo.getByRole("combobox", { name: "Institución" })).toHaveCount(0);
    await elegirProveedor(dialogo, CORDILLERA.razon);
    await dialogo.getByRole("button", { name: "Continuar" }).click();
    await confirmarCambio(cerro, cerro.getByRole("dialog", { name: "Confirma el cambio de proveedor" }), RENALES.razon, CORDILLERA.razon, CORDILLERA.razon);
    await expect(seccion.locator("[data-proveedor-efectivo]")).toHaveText(CORDILLERA.razon);
    // Cordillera no tiene sitio web: no hay "Ir a comprar".
    await expect(seccion.getByRole("link", { name: /Ir a comprar/ })).toHaveCount(0);
    await cerro.goto(`/admin/insumos?q=${insumo.codigo}`);
    await expect(cerro.getByRole("row").filter({ hasText: insumo.codigo })).toContainText(CORDILLERA.razon);

    // La otra institución no se entera; la red sigue con su predeterminado.
    const andes = await abrirComo("andes");
    await andes.goto(`/admin/insumos?q=${insumo.codigo}`);
    await expect(andes.getByRole("row").filter({ hasText: insumo.codigo })).toContainText(RENALES.razon);
    await andes.goto(`/admin/insumos/${insumo.id}`);
    await expect(andes.getByRole("main")).not.toContainText(CORDILLERA.razon);
    await admin.goto(`/admin/insumos/${insumo.id}`);
    await expect(admin.getByLabel("Proveedor predeterminado").locator("option:checked")).toHaveText(RENALES.razon);
  });

  test("al crear un insumo se puede indicar su proveedor; sin proveedor, la ficha sugiere el del último ingreso", async ({ abrirComo }) => {
    // Un administrador de institución crea el insumo con proveedor predeterminado (queda para toda la red).
    const andes = await abrirComo("andes");
    const s = sufijo();
    await andes.goto("/admin/insumos/nuevo");
    await andes.getByRole("textbox", { name: "Código", exact: true }).fill(`E2E-${s}`);
    await andes.getByLabel("Categoría").selectOption({ label: "Curación" });
    await andes.getByRole("textbox", { name: "Nombre", exact: true }).fill(`Insumo con proveedor ${s}`);
    await andes.getByLabel("Unidad de medida").selectOption({ label: "Caja" });
    await andes.getByLabel("Proveedor predeterminado").selectOption({ label: ANDINA.razon });
    await andes.getByRole("button", { name: "Crear insumo" }).click();
    await andes.waitForURL(/\/admin\/insumos\/(?!nuevo)[^/]+$/);
    const idCreado = new URL(andes.url()).pathname.split("/").pop() as string;
    const cerro = await abrirComo("cerro");
    await cerro.goto(`/inventario/${idCreado}`);
    await expect(cerro.locator("#proveedor [data-proveedor-efectivo]")).toHaveText(ANDINA.razon);
    await expect(cerro.locator("#proveedor")).toContainText("Predeterminado de la red");

    // Insumo sin proveedor: tras un ingreso con proveedor, la ficha lo ofrece como "Último proveedor".
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin, { controlaVencimiento: false });
    const bodega = await abrirComo("bodega");
    await llenarIngreso(bodega, { insumo, ubicacion: UBICACIONES.nunoaBodega, lote: `UL-${insumo.sufijo}`, cantidad: 3 });
    const selector = bodega.getByLabel("Proveedor");
    await expect(selector).toHaveValue("");
    await selector.selectOption({ label: await etiquetaDe(selector, RENALES.razon) });
    await bodega.getByRole("button", { name: "Registrar ingreso" }).click();
    await expect(bodega.getByRole("heading", { name: "Ingreso registrado" })).toBeVisible();

    const deBodega = await tarjetaProveedor(bodega, insumo);
    await expect(deBodega).toContainText("Sin proveedor definido");
    await expect(deBodega.locator("[data-ultimo-proveedor]")).toContainText(`Último proveedor: ${RENALES.razon}`);
    await expect(deBodega.locator("[data-ultimo-proveedor]")).toContainText("No es el proveedor definido");
    await expect(deBodega.getByRole("button", { name: "Usar como predeterminado" })).toHaveCount(0);
    // La otra institución no ve ese ingreso: no hay sugerencia.
    const deCerro = await tarjetaProveedor(cerro, insumo);
    await expect(deCerro).toContainText("Sin proveedor definido");
    await expect(deCerro.locator("[data-ultimo-proveedor]")).toHaveCount(0);

    // El administrador de Andes lo usa como predeterminado de su institución, con confirmación.
    const deAndes = await tarjetaProveedor(andes, insumo);
    await deAndes.getByRole("button", { name: "Usar como predeterminado" }).click();
    const dialogo = andes.getByRole("dialog", { name: "Cambiar proveedor" });
    await expect(dialogo.getByRole("radio", { name: new RegExp(RENALES.razon) })).toBeChecked();
    await dialogo.getByRole("button", { name: "Continuar" }).click();
    await confirmarCambio(andes, andes.getByRole("dialog", { name: "Confirma el cambio de proveedor" }), /Predeterminado de la red \(sin definir\)/, RENALES.razon, RENALES.razon);
    await expect(deAndes.locator("[data-proveedor-efectivo]")).toHaveText(RENALES.razon);
    await expect(deAndes.locator("[data-ultimo-proveedor]")).toHaveCount(0);
  });

  test("proveedor inactivo: no se ofrece para elegir y el insumo que lo tenía lo muestra marcado", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const s = sufijo();
    const proveedor = { razon: `Proveedor por desactivar e2e ${s}`, rut: rutValido() };
    await admin.goto("/admin/proveedores");
    await admin.getByRole("button", { name: "Nuevo proveedor" }).click();
    const nuevo = admin.getByRole("dialog", { name: "Nuevo proveedor" });
    await nuevo.getByLabel("RUT").fill(proveedor.rut.canonico);
    await nuevo.getByLabel("Razón social").fill(proveedor.razon);
    await nuevo.getByRole("button", { name: "Crear proveedor" }).click();
    await expect(nuevo).toBeHidden();

    const insumo = await crearInsumo(admin);
    const tarjeta = await tarjetaProveedor(admin, insumo);
    await tarjeta.getByRole("button", { name: "Definir proveedor" }).click();
    const dialogo = admin.getByRole("dialog", { name: "Cambiar proveedor" });
    await elegirProveedor(dialogo, proveedor.razon);
    await dialogo.getByRole("button", { name: "Continuar" }).click();
    await confirmarCambio(admin, admin.getByRole("dialog", { name: "Confirma el cambio de proveedor" }), "Sin proveedor", proveedor.razon, proveedor.razon);

    await admin.goto(`/admin/proveedores?q=${encodeURIComponent(proveedor.razon)}`);
    await admin.getByRole("button", { name: `Acciones para ${proveedor.razon}` }).click();
    await admin.getByRole("menuitem", { name: "Desactivar" }).click();
    await admin.getByRole("alertdialog").getByRole("button", { name: /Desactivar/ }).click();
    await expect(admin.getByRole("alertdialog")).toHaveCount(0);

    // La asignación no se borró: se muestra marcada y se sugiere cambiarla.
    const marcada = await tarjetaProveedor(admin, insumo);
    await expect(marcada.locator("[data-proveedor-efectivo]")).toHaveText(proveedor.razon);
    await expect(marcada).toContainText("Inactivo");
    await expect(marcada).toContainText("Este proveedor está inactivo");
    await expect(marcada).toContainText("Conviene cambiarlo por uno activo");
    // No se ofrece para elegir…
    await marcada.getByRole("button", { name: "Cambiar proveedor" }).click();
    const cambiar = admin.getByRole("dialog", { name: "Cambiar proveedor" });
    await expect(cambiar.getByRole("radio", { name: new RegExp(RENALES.razon) })).toBeVisible();
    await expect(cambiar.getByRole("radio", { name: new RegExp(proveedor.razon) })).toHaveCount(0);
    const buscador = cambiar.getByRole("searchbox", { name: "Buscar proveedor" });
    if (await buscador.count()) {
      await buscador.fill(proveedor.razon);
      await expect(cambiar).toContainText("Ningún proveedor activo coincide");
    }
    await cambiar.getByRole("button", { name: "Cancelar" }).click();
    // …ni se preselecciona en el ingreso (se avisa por qué).
    await admin.goto(`/movimientos/ingreso?insumo=${insumo.id}`);
    await expect(admin.locator("[data-proveedor-sugerido]")).toContainText("está inactivo");
    await expect(admin.getByLabel("Proveedor")).toHaveValue("");
  });

  test("@movil reposición agrupada por proveedor, alertas con «Ir a comprar», filtro del inventario y CSV", async ({ abrirComo }) => {
    test.setTimeout(120_000);
    const admin = await abrirComo("admin");
    // Proveedor propio del test: su grupo y su conteo de insumos son exactos.
    const s = sufijo();
    const proveedor = { razon: `Proveedor reposición e2e ${s}`, rut: rutValido(), dominio: `www.ejemplo-rep-${s.toLowerCase()}.cl`, telefono: "+56 2 2345 6789" };
    await admin.goto("/admin/proveedores");
    await admin.getByRole("button", { name: "Nuevo proveedor" }).click();
    const nuevo = admin.getByRole("dialog", { name: "Nuevo proveedor" });
    await nuevo.getByLabel("RUT").fill(proveedor.rut.canonico);
    await nuevo.getByLabel("Razón social").fill(proveedor.razon);
    await nuevo.getByLabel("Teléfono").fill(proveedor.telefono);
    await nuevo.getByLabel("Correo electrónico").fill(`ventas@ejemplo-rep-${s.toLowerCase()}.cl`);
    await nuevo.getByLabel("Sitio web (para comprar)").fill(proveedor.dominio);
    await nuevo.getByRole("button", { name: "Crear proveedor" }).click();
    await expect(nuevo).toBeHidden();
    const sitio = `https://${proveedor.dominio}/`;

    // Insumo con ese proveedor (definido al crearlo) y bajo el mínimo en Ñuñoa.
    await admin.goto("/admin/insumos/nuevo");
    await admin.getByRole("textbox", { name: "Código", exact: true }).fill(`E2E-${s}`);
    await admin.getByLabel("Categoría").selectOption({ label: "Curación" });
    await admin.getByRole("textbox", { name: "Nombre", exact: true }).fill(`Insumo reposición ${s}`);
    await admin.getByLabel("Unidad de medida").selectOption({ label: "Caja" });
    await admin.getByLabel("Proveedor predeterminado").selectOption({ label: proveedor.razon });
    await admin.getByRole("button", { name: "Crear insumo" }).click();
    await admin.waitForURL(/\/admin\/insumos\/(?!nuevo)[^/]+$/);
    const insumo: InsumoPrueba = { id: new URL(admin.url()).pathname.split("/").pop() as string, codigo: `E2E-${s}`, nombre: `Insumo reposición ${s}`, sufijo: s };
    await definirMinimo(admin, insumo, CENTROS.nunoa, 12, 40);

    const bodega = await abrirComo("bodega");
    // Lista de reposición: se elige "Agrupar por → Proveedor" y queda en la URL.
    await bodega.goto("/alertas/reposicion");
    await expect(bodega.locator('[data-agrupada-por="centro"]')).toBeVisible();
    await bodega.getByLabel("Agrupar por").selectOption({ label: "Proveedor" });
    await expect(bodega).toHaveURL(/agrupar=proveedor/);
    const grupo = bodega.locator("[data-grupo-proveedor]").filter({ has: bodega.getByRole("heading", { name: proveedor.razon }) });
    await expect(grupo).toHaveCount(1);
    await expect(grupo).toContainText("1 insumo por reponer");
    await expect(grupo).toContainText(insumo.nombre);
    await expect(grupo.getByRole("link", { name: proveedor.telefono })).toHaveAttribute("href", "tel:+56223456789");
    await esperarIrAComprar(grupo, sitio);
    // En la hoja impresa, el encabezado del grupo lleva RUT, teléfono y correo.
    await bodega.emulateMedia({ media: "print" });
    const impreso = grupo.locator("[data-contacto-impreso]");
    await expect(impreso).toBeVisible();
    await expect(impreso).toContainText(proveedor.rut.conPuntos);
    await expect(impreso).toContainText(proveedor.telefono);
    await expect(impreso).toContainText(`ventas@ejemplo-rep-${s.toLowerCase()}.cl`);
    await bodega.emulateMedia({ media: "screen" });

    // CSV: columnas del proveedor; con `agrupar=proveedor` las filas van ordenadas por proveedor.
    const csv = await bodega.request.get("/alertas/reposicion/exportar?agrupar=proveedor");
    expect(csv.status()).toBe(200);
    const texto = await csv.text();
    const [encabezado, ...lineas] = texto.replace(/^﻿/, "").trim().split("\r\n");
    expect(encabezado?.endsWith(";Proveedor;RUT proveedor;Teléfono proveedor;Correo proveedor")).toBe(true);
    const linea = lineas.find((l) => l.includes(insumo.codigo));
    expect(linea, "el insumo del test está en el CSV").toBeTruthy();
    expect(linea?.endsWith(`;${proveedor.razon};${proveedor.rut.conPuntos};'${proveedor.telefono};ventas@ejemplo-rep-${s.toLowerCase()}.cl`)).toBe(true);
    const iProveedor = (encabezado ?? "").split(";").indexOf("Proveedor");
    const columna = lineas.map((l) => l.split(";")[iProveedor] ?? "");
    const conProveedor = columna.filter((p) => p !== "");
    expect(conProveedor).toEqual([...conProveedor].sort((a, b) => a.localeCompare(b, "es")));
    // Los "sin proveedor" van al final.
    expect(columna.slice(conProveedor.length).every((p) => p === "")).toBe(true);

    // Alertas → Sin stock: el proveedor junto al insumo y el acceso "Ir a comprar".
    await bodega.goto(`/alertas?tab=sin-stock&q=${insumo.codigo}`);
    const alerta = bodega.getByRole("main").locator("tbody tr, li").filter({ hasText: insumo.codigo }).filter({ visible: true }).first();
    await expect(alerta).toContainText(proveedor.razon);
    await esperarIrAComprar(alerta, sitio);

    // Directorio: "Insumos que le compras" enlaza al inventario filtrado por ese proveedor.
    await bodega.goto(`/proveedores?q=${encodeURIComponent(proveedor.razon)}`);
    const fila = bodega.getByRole("main").locator("li[data-proveedor]").filter({ hasText: proveedor.razon });
    await fila.locator("summary").click();
    const enlace = fila.locator("a[data-insumos-proveedor]");
    await expect(enlace).toContainText("Insumos que le compras: 1 insumo");
    await enlace.click();
    await expect(bodega).toHaveURL(/\/inventario\?proveedor=/);
    await expect(bodega.getByRole("status").filter({ hasText: "insumo" })).toContainText(/^1 insumo con estos filtros/);
    await expect(bodega.getByRole("main")).toContainText(insumo.nombre);
    await expect(bodega.getByRole("combobox", { name: "Proveedor" }).locator("option:checked")).toHaveText(proveedor.razon);
    // El filtro por proveedor vive en la URL y se puede quitar.
    await bodega.getByRole("button", { name: "Limpiar filtros" }).click();
    await expect(bodega).toHaveURL(/\/inventario$/);

    // La otra institución no tiene ese insumo en su inventario: para ella el proveedor no abastece nada.
    const valpo = await abrirComo("valpo");
    await valpo.goto(`/proveedores?q=${encodeURIComponent(proveedor.razon)}`);
    const filaValpo = valpo.getByRole("main").locator("li[data-proveedor]").filter({ hasText: proveedor.razon });
    await filaValpo.locator("summary").click();
    await expect(filaValpo.locator("[data-insumos-proveedor]")).toContainText("Ningún insumo del inventario");
  });
});

/** Etiqueta completa de la opción del `<select>` de proveedores que contiene la razón social. */
async function etiquetaDe(select: Locator, razonSocial: string): Promise<string> {
  const etiquetas = await select.locator("option").allInnerTexts();
  const etiqueta = etiquetas.find((e) => e.includes(razonSocial));
  expect(etiqueta, `"${razonSocial}" debe estar entre los proveedores`).toBeTruthy();
  return etiqueta as string;
}
