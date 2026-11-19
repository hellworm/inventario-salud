import { CENTROS, diaSantiago, rutValido, sufijo, UBICACIONES } from "./soporte/entorno";
import { avisos, crearInsumo, definirMinimo, filaVisible, registrarIngreso } from "./soporte/datos";
import { expect, sesionDe, test } from "./soporte/fixtures";

test.describe("Administración del catálogo", () => {
  test.use(sesionDe("admin"));

  test("crear insumo y definir sus parámetros de stock por centro", async ({ page, abrirComo }) => {
    const insumo = await crearInsumo(page, { categoria: "Fármacos" });
    await expect(avisos(page)).toContainText(`Insumo ${insumo.codigo} creado`);
    await expect(page.getByRole("main")).toContainText("Sin stock en la red");

    // Mínimo mayor que el máximo: se rechaza.
    await page.getByLabel(`Mínimo en ${CENTROS.nunoa}`).fill("30");
    await page.getByLabel(`Máximo en ${CENTROS.nunoa}`).fill("10");
    await page.getByRole("button", { name: "Guardar mínimos y máximos" }).click();
    await expect(page.getByRole("main")).toContainText("El máximo no puede ser menor que el mínimo");

    await definirMinimo(page, insumo, CENTROS.nunoa, 6, 40);
    await page.reload();
    await expect(page.getByLabel(`Mínimo en ${CENTROS.nunoa}`)).toHaveValue("6");
    await expect(page.getByLabel(`Máximo en ${CENTROS.nunoa}`)).toHaveValue("40");
    await expect(page.getByLabel(`Mínimo en ${CENTROS.valpo}`)).toHaveValue("");

    // Aparece en el catálogo de administración…
    await page.goto(`/admin/insumos?q=${insumo.codigo}`);
    const fila = page.getByRole("row").filter({ hasText: insumo.codigo });
    await expect(fila).toContainText("Fármacos");
    await expect(fila).toContainText("1 centro");
    await expect(fila).toContainText("Activo");

    // …y, con mínimo definido, el centro lo ve en su inventario como "sin stock" (el otro centro no).
    const nunoa = await abrirComo("bodega");
    await nunoa.goto(`/inventario?q=${insumo.codigo}`);
    await expect(filaVisible(nunoa, insumo.codigo)).toContainText("Sin stock");
    await expect(filaVisible(nunoa, insumo.codigo)).toContainText("mínimo 6");
    const valpo = await abrirComo("valpo");
    await valpo.goto(`/inventario?q=${insumo.codigo}`);
    await expect(valpo.getByRole("heading", { level: 1, name: "Inventario" })).toBeVisible();
    await expect(valpo.getByRole("main")).not.toContainText(insumo.nombre);
  });

  test("no admite códigos duplicados ni con formato inválido", async ({ page }) => {
    const insumo = await crearInsumo(page);
    await page.goto("/admin/insumos/nuevo");
    await page.getByRole("button", { name: "Crear insumo" }).click();
    const principal = page.getByRole("main");
    await expect(principal).toContainText("Ingresa el código del insumo");
    await expect(principal).toContainText("Ingresa el nombre del insumo");
    await expect(principal).toContainText("Selecciona una categoría");

    await page.getByLabel("Código (SKU)").fill("con espacios");
    await page.getByLabel("Categoría").selectOption({ label: "Curación" });
    await page.getByLabel("Nombre").fill("Duplicado e2e");
    await page.getByLabel("Unidad de medida").selectOption({ label: "Caja" });
    await page.getByRole("button", { name: "Crear insumo" }).click();
    await expect(principal).toContainText("Usa solo letras, números, guiones o puntos (sin espacios)");

    // Mismo código en minúsculas: sigue siendo duplicado.
    await page.getByLabel("Código (SKU)").fill(insumo.codigo.toLowerCase());
    await page.getByRole("button", { name: "Crear insumo" }).click();
    await expect(principal).toContainText(`El código ${insumo.codigo} ya lo usa "${insumo.nombre}".`);
    await expect(page).toHaveURL(/\/admin\/insumos\/nuevo$/);
  });

  test("un insumo desactivado con stock deja de ofrecerse para ingresos pero su stock sigue visible", async ({ page }) => {
    const insumo = await crearInsumo(page);
    await registrarIngreso(page, { insumo, ubicacion: UBICACIONES.nunoaBodega, lote: `IN-${insumo.sufijo}`, vence: diaSantiago(90), cantidad: 4 });

    await page.goto(`/admin/insumos/${insumo.id}`);
    // Con movimientos ya no se puede eliminar, solo desactivar.
    await expect(page.getByRole("button", { name: "Eliminar" })).toHaveCount(0);
    await page.getByRole("button", { name: "Desactivar" }).click();
    const confirmacion = page.getByRole("alertdialog");
    await confirmacion.getByRole("button", { name: /Desactivar/ }).click();
    await expect(page.getByRole("main")).toContainText("Inactivo");

    // El buscador de ingresos ya no lo ofrece y el enlace directo no lo preselecciona.
    await page.goto(`/movimientos/ingreso?insumo=${insumo.id}`);
    await expect(page.getByRole("button", { name: /Cambiar insumo/ })).toHaveCount(0);
    await page.getByRole("combobox", { name: "Insumo" }).fill(insumo.codigo);
    await expect(page.getByRole("status").filter({ hasText: /resultado|No encontramos|Sin resultados/i })).toBeVisible();
    await expect(page.getByRole("option", { name: new RegExp(insumo.codigo) })).toHaveCount(0);

    // El stock existente no desaparece del inventario.
    await page.goto(`/inventario/${insumo.id}`);
    await expect(page.getByRole("region", { name: "Resumen de stock" })).toContainText(/4\s*cajas/);
  });

  test("categorías: crear, rechazar duplicados (aunque cambien mayúsculas o espacios) y eliminar la vacía", async ({ page }) => {
    const nombre = `Categoría e2e ${sufijo()}`;
    await page.goto("/admin/categorias");
    await page.getByRole("button", { name: "Nueva categoría" }).click();
    let dialogo = page.getByRole("dialog", { name: "Nueva categoría" });
    await dialogo.getByRole("button", { name: "Crear categoría" }).click();
    await expect(dialogo).toContainText("Ingresa el nombre de la categoría");
    await dialogo.getByLabel("Nombre").fill(nombre);
    await dialogo.getByRole("button", { name: "Crear categoría" }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.getByRole("row").filter({ hasText: nombre })).toBeVisible();

    for (const variante of [nombre, `  ${nombre.toUpperCase()}  `, "Curación"]) {
      await page.getByRole("button", { name: "Nueva categoría" }).click();
      dialogo = page.getByRole("dialog", { name: "Nueva categoría" });
      await dialogo.getByLabel("Nombre").fill(variante);
      await dialogo.getByRole("button", { name: "Crear categoría" }).click();
      await expect(dialogo, `"${variante}" debe rechazarse por duplicada`).toContainText("Ya existe una categoría con ese nombre.");
      await dialogo.getByRole("button", { name: "Cancelar" }).click();
    }
    await expect(page.getByRole("row").filter({ hasText: new RegExp(nombre, "i") })).toHaveCount(1);

    // Una categoría con insumos no se puede eliminar; la vacía sí.
    await page.getByRole("button", { name: "Eliminar Curación" }).click();
    await expect(avisos(page)).toContainText("No se puede eliminar");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByRole("row").filter({ hasText: "Curación" })).toBeVisible();
    await page.getByRole("button", { name: `Eliminar ${nombre}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /Eliminar/ }).click();
    await expect(page.getByRole("row").filter({ hasText: nombre })).toHaveCount(0);
  });

  test("proveedores: RUT inválido se rechaza, RUT válido se guarda formateado y no se repite", async ({ page }) => {
    const rut = rutValido();
    const razon = `Proveedor e2e ${sufijo()}`;
    await page.goto("/admin/proveedores");
    await page.getByRole("button", { name: "Nuevo proveedor" }).click();
    const dialogo = page.getByRole("dialog", { name: "Nuevo proveedor" });
    await dialogo.getByRole("button", { name: "Crear proveedor" }).click();
    await expect(dialogo).toContainText("Ingresa el RUT");
    await expect(dialogo).toContainText("Ingresa la razón social");

    // Dígito verificador incorrecto.
    const dvMalo = rut.canonico.endsWith("-1") ? "2" : "1";
    await dialogo.getByLabel("RUT").fill(`${rut.cuerpo}-${dvMalo}`);
    await dialogo.getByLabel("Razón social").fill(razon);
    await dialogo.getByLabel("Email").fill("no-es-correo");
    await dialogo.getByRole("button", { name: "Crear proveedor" }).click();
    await expect(dialogo).toContainText("El RUT no es válido");
    await expect(dialogo).toContainText("Ingresa un email válido");

    // Válido, escrito sin puntos ni guion.
    await dialogo.getByLabel("RUT").fill(rut.canonico.replace("-", "").toLowerCase());
    await dialogo.getByLabel("Email").fill(`ventas.${rut.cuerpo}@proveedor.example`);
    await dialogo.getByRole("button", { name: "Crear proveedor" }).click();
    await expect(dialogo).toBeHidden();
    await page.goto(`/admin/proveedores?q=${encodeURIComponent(razon)}`);
    const fila = page.getByRole("row").filter({ hasText: razon });
    await expect(fila).toContainText(rut.conPuntos);
    await expect(fila).toContainText("Activo");

    // Mismo RUT con otro formato: duplicado.
    await page.getByRole("button", { name: "Nuevo proveedor" }).click();
    await dialogo.getByLabel("RUT").fill(rut.conPuntos);
    await dialogo.getByLabel("Razón social").fill(`${razon} bis`);
    await dialogo.getByRole("button", { name: "Crear proveedor" }).click();
    await expect(dialogo).toContainText(`El RUT ${rut.conPuntos} ya está registrado para "${razon}".`);
    await dialogo.getByRole("button", { name: "Cancelar" }).click();

    // El proveedor nuevo ya se puede elegir al registrar un ingreso.
    await page.goto("/movimientos/ingreso");
    await expect(page.getByRole("combobox", { name: "Proveedor" }).locator("option").filter({ hasText: razon })).toHaveCount(1);
  });
});
