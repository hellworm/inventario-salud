import type { Locator, Page } from "@playwright/test";
import { digitoVerificadorGtin } from "../src/lib/gs1";
import { crearInsumo } from "./soporte/datos";
import { CENTROS, INSTITUCIONES, sufijo } from "./soporte/entorno";
import { expect, test } from "./soporte/fixtures";

/**
 * Semáforo, proveedores y escáner CON los cuatro roles:
 *  - el administrador de institución crea un insumo con el código escaneado,
 *    pero no lo asocia a un insumo que ya existe (catálogo compartido);
 *  - el visitante ve los proveedores (panel y directorio), sin editar;
 *  - el administrador de la red ve el semáforo de cada institución y centro.
 */

/** EAN-13 válido y único por ejecución (prefijo 2: uso interno). */
function eanDePrueba(): string {
  const cuerpo = `2${String(Math.floor(Math.random() * 1e11)).padStart(11, "0")}`;
  return `${cuerpo}${digitoVerificadorGtin(cuerpo)}`;
}

async function escribirCodigo(pagina: Page, codigo: string): Promise<void> {
  await pagina.goto("/movimientos/escanear");
  const campo = pagina.getByRole("main").getByLabel("O escribe el código");
  await campo.fill(codigo);
  await campo.press("Enter");
}

const numero = async (l: Locator) => Number((await l.innerText()).replace(/\D/g, ""));

test.describe("Escáner: administrador de institución", () => {
  test("@movil código no reconocido: puede crear el insumo con el código, pero no asociarlo a uno existente", async ({ abrirComo }) => {
    const red = await abrirComo("admin");
    const existente = await crearInsumo(red);
    const ean = eanDePrueba();

    const andes = await abrirComo("andes");
    await escribirCodigo(andes, ean);
    const principal = andes.getByRole("main");
    await expect(principal.getByRole("heading", { name: "No reconocemos este código" })).toBeVisible();
    // No se le ofrece asociar (modifica el catálogo compartido): se le explica a quién pedirlo.
    await expect(principal.getByRole("checkbox", { name: /Asociar este código/ })).toHaveCount(0);
    await expect(principal.locator("[data-aviso-asociar]")).toContainText(
      "Para asociarlo a un insumo existente, contacta al administrador de la red",
    );
    await expect(principal).not.toContainText("Pide a tu administrador");

    // Puede continuar con el ingreso eligiendo el insumo a mano: el código NO queda asociado.
    await principal.getByRole("combobox", { name: "¿Qué insumo es?" }).fill(existente.codigo);
    await andes.getByRole("option", { name: new RegExp(existente.nombre) }).click();
    const continuar = principal.getByRole("button", { name: "Continuar con el ingreso" });
    await expect(principal.getByRole("button", { name: /Asociar y continuar/ })).toHaveCount(0);
    await continuar.click();
    await expect(andes).toHaveURL(new RegExp(`/movimientos/ingreso\\?insumo=${existente.id}&`));
    await red.goto(`/admin/insumos/${existente.id}`);
    await expect(red.getByLabel("Código de barras")).toHaveValue("");

    // «Crear insumo con este código»: llega al formulario con el código puesto y lo crea.
    await escribirCodigo(andes, ean);
    const crear = principal.getByRole("link", { name: "Crear insumo con este código" });
    await expect(crear).toHaveAttribute("href", `/admin/insumos/nuevo?codigoBarras=${ean}`);
    await crear.click();
    await expect(andes.getByRole("heading", { level: 1, name: "Nuevo insumo" })).toBeVisible();
    await expect(andes.getByRole("main")).toContainText("El insumo quedará compartido con toda la red");
    await expect(andes.getByLabel("Código de barras")).toHaveValue(ean);
    const s = sufijo();
    const nombre = `Insumo escaneado ${s}`;
    await andes.getByRole("textbox", { name: "Código", exact: true }).fill(`ESC-${s}`);
    await andes.getByLabel("Categoría").selectOption({ label: "Curación" });
    await andes.getByRole("textbox", { name: "Nombre", exact: true }).fill(nombre);
    await andes.getByLabel("Unidad de medida").selectOption({ label: "Caja" });
    await andes.getByRole("button", { name: "Crear insumo" }).click();
    await andes.waitForURL(/\/admin\/insumos\/(?!nuevo)[^/]+$/);
    const idNuevo = new URL(andes.url()).pathname.split("/").pop() as string;

    // Desde entonces el código se reconoce, también en la OTRA institución (catálogo compartido)…
    await escribirCodigo(andes, ean);
    await expect(andes).toHaveURL(new RegExp(`/movimientos/ingreso\\?insumo=${idNuevo}&escaneado=1$`));
    const cerro = await abrirComo("cerro");
    await escribirCodigo(cerro, `0${ean}`);
    await expect(cerro).toHaveURL(new RegExp(`/movimientos/ingreso\\?insumo=${idNuevo}&`));
    // …y nadie puede repetir el mismo producto en un segundo insumo (aunque lo escriba como GTIN-14).
    await cerro.goto(`/admin/insumos/nuevo?codigoBarras=0${ean}`);
    await cerro.getByRole("textbox", { name: "Código", exact: true }).fill(`DUP-${s}`);
    await cerro.getByLabel("Categoría").selectOption({ label: "Curación" });
    await cerro.getByRole("textbox", { name: "Nombre", exact: true }).fill(`Duplicado ${s}`);
    await cerro.getByLabel("Unidad de medida").selectOption({ label: "Caja" });
    await cerro.getByRole("button", { name: "Crear insumo" }).click();
    await expect(cerro.getByRole("main")).toContainText(`Ese código de barras ya lo usa "${nombre}"`);
    await expect(cerro).toHaveURL(/\/admin\/insumos\/nuevo/);
  });

  test("el administrador de la red sí asocia; el de institución no puede editar el insumo para poner el código", async ({ abrirComo }) => {
    const red = await abrirComo("admin");
    const insumo = await crearInsumo(red);
    const ean = eanDePrueba();
    await escribirCodigo(red, ean);
    await expect(red.getByRole("main").getByRole("checkbox", { name: "Asociar este código a ese insumo" })).toBeChecked();

    // El administrador de institución ve la ficha del insumo en solo lectura: sin «Guardar cambios».
    const andes = await abrirComo("andes");
    await andes.goto(`/admin/insumos/${insumo.id}`);
    await expect(andes.getByRole("heading", { level: 1, name: insumo.nombre })).toBeVisible();
    await expect(andes.getByRole("button", { name: "Guardar cambios" })).toHaveCount(0);
  });
});

test.describe("Visitante: proveedores", () => {
  test("@movil ve la sección del panel y el directorio, con «Ir a comprar» y los datos desplegables, sin poder editar", async ({ abrirComo, isMobile }) => {
    const visita = await abrirComo("visita");
    await visita.goto("/panel");
    const principal = visita.getByRole("main");
    await expect(principal.getByRole("heading", { name: "Proveedores" })).toBeVisible();
    // El seed trae proveedores con sitio web: al menos uno ofrece «Ir a comprar» en una pestaña nueva.
    const comprar = principal.getByRole("link", { name: /^Ir a comprar en / }).first();
    await expect(comprar).toHaveAttribute("href", /^https:\/\//);
    await expect(comprar).toHaveAttribute("target", "_blank");
    await expect(comprar).toHaveAttribute("rel", /noopener/);
    // En pantallas táctiles, el objetivo mide al menos 44 px.
    if (isMobile) expect((await comprar.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    // El directorio completo abre para el visitante (solo lectura).
    await principal.locator('a[href="/proveedores"]').click();
    await expect(visita).toHaveURL(/\/proveedores$/);
    await expect(visita.getByRole("heading", { level: 1, name: "Proveedores" })).toBeVisible();
    const directorio = visita.getByRole("main");
    const fila = directorio.locator("li[data-proveedor]").filter({ hasText: "Insumos Renales del Pacífico SpA" });
    await expect(fila.getByRole("link", { name: /^Ir a comprar en / })).toHaveAttribute("href", "https://www.ejemplo-renalespacifico.cl/");
    // Teléfono y correo aparecen al desplegar.
    await expect(fila.getByRole("link", { name: /Teléfono/ })).toBeHidden();
    await fila.locator("summary").click();
    await expect(fila.getByRole("link", { name: /Teléfono/ })).toHaveAttribute("href", "tel:+56228901144");
    await expect(fila.getByRole("link", { name: /Correo electrónico/ })).toHaveAttribute("href", "mailto:ventas@renalespacifico.example");
    // Nada de edición ni de administración.
    await expect(directorio.getByRole("link", { name: /Editar/ })).toHaveCount(0);
    await expect(directorio.getByRole("link", { name: "Administrar proveedores" })).toHaveCount(0);
    const admin = await visita.request.get("/admin/proveedores", { maxRedirects: 0 });
    expect(admin.status()).not.toBe(200);
  });

  test("«Editar» es de los dos administradores (de la red y de institución), no del bodeguero", async ({ abrirComo }) => {
    for (const [rol, edita] of [["admin", true], ["andes", true], ["cerro", true], ["bodega", false]] as const) {
      const pagina = await abrirComo(rol);
      await pagina.goto("/proveedores?q=Renales");
      const fila = pagina.getByRole("main").locator("li[data-proveedor]").filter({ hasText: "Insumos Renales del Pacífico SpA" });
      await fila.locator("summary").click();
      await expect(fila.getByRole("link", { name: /Teléfono/ })).toBeVisible();
      await expect(fila.getByRole("link", { name: /Editar/ }), rol).toHaveCount(edita ? 1 : 0);
      await expect(pagina.getByRole("link", { name: "Administrar proveedores" }), rol).toHaveCount(edita ? 1 : 0);
    }
  });
});

test.describe("Administrador de la red: semáforo por institución", () => {
  test("@movil cada institución muestra vencidos, rojo y amarillo; al desplegarla, sus centros con enlaces a la pestaña correcta", async ({ abrirComo }) => {
    const red = await abrirComo("admin");
    await red.goto("/panel");
    const resumen = red.locator("[data-resumen-instituciones]");
    const tarjetas = resumen.getByRole("list", { name: "Instituciones de la red" }).getByRole("link");
    const andes = tarjetas.filter({ hasText: INSTITUCIONES.andes });
    for (const etiqueta of ["Sin stock", "Bajo mínimo", "Vencidos", "Rojo", "Amarillo"]) await expect(andes).toContainText(etiqueta);
    await expect(resumen).not.toContainText("Por vencer");
    // El seed deja lotes vencidos, en rojo y en amarillo en Andes (Ñuñoa y Concepción).
    for (const color of ["vencidos", "rojo", "amarillo"]) {
      expect(await numero(andes.locator(`[data-indicador="${color}"]`)), color).toBeGreaterThan(0);
    }
    // El resumen va antes del semáforo de toda la red, y ambos están en la página.
    const semaforo = red.getByRole("main").locator('a[data-semaforo="ROJO"]');
    await expect(semaforo).toBeVisible();
    const yResumen = (await resumen.boundingBox())!.y;
    const ySemaforo = (await semaforo.boundingBox())!.y;
    expect(yResumen).toBeLessThan(ySemaforo);

    // Desplegar Andes: una fila por centro, con los cinco indicadores.
    await andes.click();
    const detalle = resumen.locator("[data-detalle-institucion]");
    await expect(detalle.locator("[data-centro]")).toHaveCount(2);
    const nunoa = detalle.locator(`[data-centro="${CENTROS.nunoa}"]`);
    for (const etiqueta of ["Vencidos", "Rojo", "Amarillo"]) await expect(nunoa).toContainText(etiqueta);

    // Cada conteo del semáforo enlaza a su pestaña de Alertas con el centro, y el número coincide.
    const alertas = await abrirComo("admin");
    for (const [tab, frase, pestana] of [["rojo", "lotes en rojo", "Rojo"], ["amarillo", "lotes en amarillo", "Amarillo"], ["vencidos", "lotes vencidos", "Vencidos"]] as const) {
      // (Otros tests registran movimientos en paralelo: se reintenta hasta leer ambos lados en el mismo estado.)
      await expect(async () => {
        await red.reload();
        const enlace = nunoa.getByRole("link", { name: new RegExp(`${frase} en ${CENTROS.nunoa}`) });
        await expect(enlace).toHaveAttribute("href", new RegExp(`^/alertas\\?tab=${tab}&centro=[a-z0-9]+$`));
        const esperado = await numero(enlace.locator(".cifras"));
        await alertas.goto((await enlace.getAttribute("href"))!);
        // La pestaña activa de Alertas (ya filtrada por el centro) muestra el mismo total.
        const activa = alertas.getByRole("main").locator('a[aria-current="page"]');
        await expect(activa).toContainText(pestana);
        expect(await numero(activa), `pestaña ${tab}`).toBe(esperado);
      }).toPass({ timeout: 30_000 });
    }

    // Navegando de verdad: la pestaña Rojo del centro, sin lotes de la otra institución.
    await nunoa.getByRole("link", { name: new RegExp(`lotes en rojo en ${CENTROS.nunoa}`) }).click();
    await expect(red).toHaveURL(/\/alertas\?tab=rojo&centro=/);
    await expect(red.getByRole("main").locator('a[aria-current="page"]')).toContainText("Rojo");
    await expect(red.getByRole("banner")).toContainText(CENTROS.nunoa);
    await expect(red.getByRole("main")).not.toContainText(CENTROS.valpo);
  });

  test("la suma del semáforo de las instituciones del seed no supera el de toda la red, y un administrador de institución ve solo el suyo", async ({ abrirComo }) => {
    const red = await abrirComo("admin");
    const andes = await abrirComo("andes");
    await expect(async () => {
      await red.goto("/panel");
      await andes.goto("/panel");
      const tarjeta = red.locator("[data-resumen-instituciones]").getByRole("link").filter({ hasText: INSTITUCIONES.andes });
      for (const [indicador, color] of [["vencidos", "VENCIDO"], ["rojo", "ROJO"], ["amarillo", "AMARILLO"]] as const) {
        const enLaRed = await numero(tarjeta.locator(`[data-indicador="${indicador}"]`));
        const enSuPanel = await numero(andes.locator(`a[data-semaforo="${color}"] [data-conteo="lotes"]`));
        expect(enSuPanel, `${indicador}: tarjeta de Andes en la red = semáforo del panel de Andes`).toBe(enLaRed);
        const totalRed = await numero(red.locator(`a[data-semaforo="${color}"] [data-conteo="lotes"]`));
        expect(totalRed).toBeGreaterThanOrEqual(enLaRed);
      }
    }).toPass({ timeout: 45_000 });
    // El administrador de institución no tiene el resumen por institución.
    await expect(andes.locator("[data-resumen-instituciones]")).toHaveCount(0);
  });
});
