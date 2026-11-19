import type { Page } from "@playwright/test";
import { digitoVerificadorGtin } from "../src/lib/gs1";
import { crearInsumo, elegirUbicacion, filaDeLote } from "./soporte/datos";
import { UBICACIONES } from "./soporte/entorno";
import { expect, test } from "./soporte/fixtures";

/**
 * Escáner de códigos: flujos por ENTRADA MANUAL del código (lo mismo que hace
 * un lector USB/Bluetooth). La lectura con cámara se prueba en
 * `escaner-camara.spec.ts`.
 */

const BODEGA = UBICACIONES.nunoaBodega;

/** EAN-13 válido y único por ejecución (prefijo 2: uso interno, no choca con productos reales). */
function eanDePrueba(): string {
  const cuerpo = `2${String(Math.floor(Math.random() * 1e11)).padStart(11, "0")}`;
  return `${cuerpo}${digitoVerificadorGtin(cuerpo)}`;
}

/** Fecha GS1 (AAMMDD) e ISO de un día dentro de `meses` meses, día 15. */
function fechaFutura(meses: number): { gs1: string; iso: string; cl: string } {
  const d = new Date();
  d.setUTCDate(15);
  d.setUTCMonth(d.getUTCMonth() + meses);
  const iso = d.toISOString().slice(0, 10);
  return { gs1: iso.slice(2).replaceAll("-", ""), iso, cl: `${iso.slice(8)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` };
}

/** Escribe un código en el campo manual de /movimientos/escanear y lo envía (como un lector USB: texto + Enter). */
async function escribirCodigo(pagina: Page, codigo: string): Promise<void> {
  await pagina.goto("/movimientos/escanear");
  await expect(pagina.getByRole("heading", { level: 1, name: "Escanear para ingresar" })).toBeVisible();
  const campo = pagina.getByRole("main").getByLabel("O escribe el código");
  await campo.fill(codigo);
  await campo.press("Enter");
}

test.describe("Escáner: ingresar productos por código", () => {
  test("@movil el código coincide con un insumo → ingreso prellenado con el foco en la cantidad", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const ean = eanDePrueba();
    const insumo = await crearInsumo(admin, { codigoBarras: ean });

    const bodeguero = await abrirComo("bodega");
    await escribirCodigo(bodeguero, ean);
    await expect(bodeguero).toHaveURL(new RegExp(`/movimientos/ingreso\\?insumo=${insumo.id}&escaneado=1$`));
    await expect(bodeguero.getByRole("button", { name: new RegExp(`Cambiar insumo \\(seleccionado: ${insumo.nombre}`) })).toBeVisible();
    await expect(bodeguero.getByRole("textbox", { name: "Cantidad" })).toBeFocused();
    // Un EAN no trae lote ni vencimiento: el aviso lo dice y los campos quedan vacíos.
    await expect(bodeguero.locator("[data-datos-escaneados]")).toContainText("no trae lote ni vencimiento");
    await expect(bodeguero.getByLabel("Número de lote")).toHaveValue("");

    // El mismo producto leído como GTIN-14 (cero a la izquierda) también se reconoce.
    await escribirCodigo(bodeguero, `0${ean}`);
    await expect(bodeguero).toHaveURL(new RegExp(`/movimientos/ingreso\\?insumo=${insumo.id}&`));
  });

  test("@movil un código GS1 completa además el lote, el vencimiento y la fabricación; el ingreso se registra", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const ean = eanDePrueba();
    const insumo = await crearInsumo(admin, { codigoBarras: ean });
    const vence = fechaFutura(14);
    const lote = `GS1-${insumo.sufijo}`;

    const bodeguero = await abrirComo("bodega");
    await escribirCodigo(bodeguero, `(01)0${ean}(17)${vence.gs1}(11)250301(10)${lote}`);
    await expect(bodeguero).toHaveURL(/\/movimientos\/ingreso\?insumo=/);
    await expect(bodeguero.getByLabel("Número de lote")).toHaveValue(lote);
    await expect(bodeguero.getByLabel("Vencimiento")).toHaveValue(vence.iso);
    const aviso = bodeguero.locator("[data-datos-escaneados]");
    await expect(aviso).toContainText("Datos leídos del código");
    await expect(aviso).toContainText(`el lote ${lote}`);
    await expect(aviso).toContainText(`el vencimiento ${vence.cl}`);
    await expect(bodeguero.locator("[data-fabricacion-leida]")).toContainText("01-03-2025");
    await expect(bodeguero.getByRole("textbox", { name: "Cantidad" })).toBeFocused();

    await elegirUbicacion(bodeguero, "Ubicación de destino", BODEGA);
    await bodeguero.getByRole("textbox", { name: "Cantidad" }).fill("7");
    await bodeguero.getByRole("button", { name: "Registrar ingreso" }).click();
    await expect(bodeguero.getByRole("heading", { name: "Ingreso registrado" })).toBeVisible();

    // La ficha muestra el lote con la fecha leída del código y su color del semáforo (más de 6 meses: verde).
    await bodeguero.goto(`/inventario/${insumo.id}`);
    const fila = filaDeLote(bodeguero, lote, BODEGA);
    await expect(fila).toContainText(vence.cl);
    await expect(fila).toContainText("Verde");
  });

  test("día 00 en el vencimiento GS1 = último día del mes", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const ean = eanDePrueba();
    await crearInsumo(admin, { codigoBarras: ean });
    const anio = new Date().getUTCFullYear() + 2;
    await escribirCodigo(admin, `010${ean}17${String(anio).slice(2)}0200` + `10FEB`);
    await expect(admin).toHaveURL(/\/movimientos\/ingreso\?/);
    const ultimo = new Date(Date.UTC(anio, 2, 0)).getUTCDate(); // 28 o 29
    await expect(admin.getByLabel("Vencimiento")).toHaveValue(`${anio}-02-${ultimo}`);
    await expect(admin.getByLabel("Número de lote")).toHaveValue("FEB");
  });

  test("@movil código no reconocido (bodeguero): puede buscar el insumo y continuar; se le indica pedir el registro al administrador", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin);
    const ean = eanDePrueba();
    const vence = fechaFutura(9);
    const lote = `NR-${insumo.sufijo}`;

    const bodeguero = await abrirComo("bodega");
    await escribirCodigo(bodeguero, `(01)0${ean}(17)${vence.gs1}(10)${lote}`);
    const principal = bodeguero.getByRole("main");
    await expect(principal.getByRole("heading", { name: "No reconocemos este código" })).toBeVisible();
    await expect(principal).toContainText(`Código ${ean}`);
    await expect(principal.locator("[data-datos-codigo]")).toContainText(lote);
    await expect(principal.locator("[data-datos-codigo]")).toContainText(vence.cl);
    await expect(principal).toContainText("Pide a tu administrador que registre este código");
    // El bodeguero no gestiona el catálogo: no puede asociar el código ni crear insumos.
    await expect(principal.getByRole("checkbox", { name: /Asociar este código/ })).toHaveCount(0);
    await expect(principal.getByRole("link", { name: /Crear insumo/ })).toHaveCount(0);
    const continuar = principal.getByRole("button", { name: "Continuar con el ingreso" });
    await expect(continuar).toBeDisabled();

    // Busca el insumo a mano y continúa: el lote y el vencimiento leídos se conservan.
    await principal.getByRole("combobox", { name: "¿Qué insumo es?" }).fill(insumo.codigo);
    await bodeguero.getByRole("option", { name: new RegExp(insumo.nombre) }).click();
    await continuar.click();
    await expect(bodeguero).toHaveURL(new RegExp(`/movimientos/ingreso\\?insumo=${insumo.id}&`));
    await expect(bodeguero.getByLabel("Número de lote")).toHaveValue(lote);
    await expect(bodeguero.getByLabel("Vencimiento")).toHaveValue(vence.iso);

    // No quedó asociado: al volver a leerlo sigue sin reconocerse.
    await escribirCodigo(bodeguero, ean);
    await expect(bodeguero.getByRole("heading", { name: "No reconocemos este código" })).toBeVisible();
  });

  test("código no reconocido (administrador): lo asocia a un insumo y desde entonces se reconoce; queda en la auditoría", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin);
    const ean = eanDePrueba();

    await escribirCodigo(admin, ean);
    const principal = admin.getByRole("main");
    await expect(principal.getByRole("heading", { name: "No reconocemos este código" })).toBeVisible();
    // Puede crear un insumo nuevo con el código ya puesto…
    const crear = principal.getByRole("link", { name: "Crear insumo con este código" });
    await expect(crear).toHaveAttribute("href", `/admin/insumos/nuevo?codigoBarras=${ean}`);
    // …o asociarlo a uno existente (marcado por defecto).
    const asociar = principal.getByRole("checkbox", { name: "Asociar este código a ese insumo" });
    await expect(asociar).toBeChecked();
    await principal.getByRole("combobox", { name: "¿Qué insumo es?" }).fill(insumo.codigo);
    await admin.getByRole("option", { name: new RegExp(insumo.nombre) }).click();
    await principal.getByRole("button", { name: "Asociar y continuar con el ingreso" }).click();
    await expect(admin).toHaveURL(new RegExp(`/movimientos/ingreso\\?insumo=${insumo.id}&`));

    // Desde ahora el bodeguero lo escanea y llega directo al ingreso.
    const bodeguero = await abrirComo("bodega");
    await escribirCodigo(bodeguero, ean);
    await expect(bodeguero).toHaveURL(new RegExp(`/movimientos/ingreso\\?insumo=${insumo.id}&escaneado=1$`));

    // El catálogo guarda el código y la auditoría registra quién lo cambió.
    await admin.goto(`/admin/insumos/${insumo.id}`);
    await expect(admin.getByLabel("Código de barras")).toHaveValue(ean);
    await admin.goto(`/admin/auditoria?q=${insumo.codigo}`);
    await expect(admin.getByRole("main")).toContainText("Insumo modificado");

    // La página de "nuevo insumo" recibe el código prellenado (y descarta uno con caracteres no admitidos).
    await admin.goto(`/admin/insumos/nuevo?codigoBarras=${eanDePrueba()}`);
    await expect(admin.getByLabel("Código de barras")).not.toHaveValue("");
    await admin.goto(`/admin/insumos/nuevo?codigoBarras=${encodeURIComponent('"><script>alert(1)</script>')}`);
    await expect(admin.getByLabel("Código de barras")).toHaveValue("");
  });

  test("un lote vencido según el código se avisa y no se puede ingresar", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const ean = eanDePrueba();
    await crearInsumo(admin, { codigoBarras: ean });
    await escribirCodigo(admin, `(01)0${ean}(17)240131(10)VIEJO`);
    await expect(admin).toHaveURL(/\/movimientos\/ingreso\?/);
    await expect(admin.locator("[data-datos-escaneados]")).toContainText("El código indica un lote vencido");
    await expect(admin.locator("[data-datos-escaneados]")).toContainText("31-01-2024");
    await elegirUbicacion(admin, "Ubicación de destino", BODEGA);
    await admin.getByRole("textbox", { name: "Cantidad" }).fill("1");
    await admin.getByRole("button", { name: "Registrar ingreso" }).click();
    await expect(admin.getByRole("main")).toContainText("no se pueden ingresar lotes vencidos");
    await expect(admin.getByRole("heading", { name: "Ingreso registrado" })).toHaveCount(0);
  });

  test("códigos ilegibles o con caracteres raros no rompen nada", async ({ abrirComo }) => {
    const bodeguero = await abrirComo("bodega");
    for (const codigo of ["<script>alert(1)</script>", "' OR 1=1 --", "%", "x".repeat(400), "\u001d\u001d"]) {
      await bodeguero.goto(`/movimientos/escanear?codigo=${encodeURIComponent(codigo)}&lote=${encodeURIComponent("<b>x</b>")}&vence=9999-99-99&fab=no`);
      await expect(bodeguero.getByRole("heading", { level: 1, name: "Escanear para ingresar" })).toBeVisible();
      await expect(bodeguero.getByRole("main")).toContainText(/No reconocemos este código|Ese código no se puede leer|Escanea el código del envase/);
    }
    // Campo vacío: se pide un código, sin navegar.
    await bodeguero.goto("/movimientos/escanear");
    await bodeguero.getByRole("main").getByRole("button", { name: "Buscar insumo" }).click();
    await expect(bodeguero.getByRole("main")).toContainText("Escribe o escanea un código.");
    await expect(bodeguero).toHaveURL(/\/movimientos\/escanear$/);
  });
});

test.describe("Escáner: botones, diálogo y permisos", () => {
  test("@movil el botón grande «Escanear» del panel abre el escáner; sin cámara explica qué pasa y deja escribir el código", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const ean = eanDePrueba();
    const insumo = await crearInsumo(admin, { codigoBarras: ean });

    const bodeguero = await abrirComo("bodega");
    await bodeguero.goto("/panel");
    const esMovil = (bodeguero.viewportSize()?.width ?? 1440) < 1280;
    if (esMovil) {
      // Botón grande de la pantalla principal y acceso en la barra inferior.
      await expect(bodeguero.getByRole("navigation", { name: "Accesos rápidos" }).getByRole("button", { name: "Escanear" })).toBeVisible();
      await bodeguero.getByRole("main").getByRole("button", { name: /Escanear[\s\S]*Ingresar un producto con la cámara/ }).click();
    } else {
      // En escritorio el acceso está en "Accesos rápidos" y lleva a la página de escaneo.
      await bodeguero.getByRole("main").getByRole("link", { name: /Escanear para ingresar/ }).click();
      await expect(bodeguero).toHaveURL(/\/movimientos\/escanear$/);
      await bodeguero.getByRole("main").getByRole("button", { name: "Abrir la cámara" }).click();
    }
    const dialogo = bodeguero.getByRole("dialog", { name: "Escanear código" });
    await expect(dialogo).toBeVisible();
    // El navegador de la suite no tiene cámara: se explica y el foco queda en el campo de texto.
    await expect(dialogo).toContainText("No encontramos una cámara");
    await expect(dialogo.getByRole("button", { name: "Reintentar" })).toBeVisible();
    const campo = dialogo.getByLabel("Escribir el código");
    await expect(campo).toBeFocused();

    // Un código ilegible se rechaza en el propio diálogo.
    await dialogo.getByRole("button", { name: "Buscar" }).click();
    await expect(dialogo).toContainText("Escribe el código que aparece bajo las barras.");

    // Como un lector USB: texto + Enter.
    await campo.fill(ean);
    await campo.press("Enter");
    await expect(bodeguero).toHaveURL(new RegExp(`/movimientos/ingreso\\?insumo=${insumo.id}&escaneado=1$`));
    await expect(bodeguero.getByRole("dialog", { name: "Escanear código" })).toHaveCount(0);
  });

  test("el diálogo se cierra con Escape y devuelve el foco al botón", async ({ abrirComo }) => {
    const bodeguero = await abrirComo("bodega");
    await bodeguero.goto("/movimientos/escanear");
    const boton = bodeguero.getByRole("main").getByRole("button", { name: "Abrir la cámara" });
    await boton.click();
    await expect(bodeguero.getByRole("dialog", { name: "Escanear código" })).toBeVisible();
    await bodeguero.keyboard.press("Escape");
    await expect(bodeguero.getByRole("dialog", { name: "Escanear código" })).toHaveCount(0);
    await expect(boton).toBeFocused();
  });

  test("@movil dentro del formulario de ingreso, escanear completa insumo, lote y vencimiento sin perder lo escrito", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const ean = eanDePrueba();
    const insumo = await crearInsumo(admin, { codigoBarras: ean });
    const vence = fechaFutura(4);

    const bodeguero = await abrirComo("bodega");
    await bodeguero.goto("/movimientos/ingreso");
    await bodeguero.getByLabel("Guía o factura").fill("Guía 777");
    await bodeguero.getByRole("button", { name: "Escanear el código del envase" }).click();
    const dialogo = bodeguero.getByRole("dialog", { name: "Escanear el insumo" });
    await dialogo.getByLabel("Escribir el código").fill(`(01)0${ean}(17)${vence.gs1}(10)EN-FORM`);
    await dialogo.getByRole("button", { name: "Buscar" }).click();
    await expect(dialogo).toHaveCount(0);
    await expect(bodeguero).toHaveURL(/\/movimientos\/ingreso$/);
    await expect(bodeguero.getByRole("button", { name: new RegExp(`Cambiar insumo \\(seleccionado: ${insumo.nombre}`) })).toBeVisible();
    await expect(bodeguero.getByLabel("Número de lote")).toHaveValue("EN-FORM");
    await expect(bodeguero.getByLabel("Vencimiento")).toHaveValue(vence.iso);
    await expect(bodeguero.getByLabel("Guía o factura")).toHaveValue("Guía 777");
    await expect(bodeguero.getByRole("textbox", { name: "Cantidad" })).toBeFocused();

    // Un código desconocido dentro del formulario: se avisa y se conservan lote y fecha para el insumo elegido a mano.
    const otro = eanDePrueba();
    await bodeguero.getByRole("button", { name: "Escanear el código del envase" }).click();
    await bodeguero.getByRole("dialog").getByLabel("Escribir el código").fill(`(01)0${otro}(17)${vence.gs1}(10)OTRO-LOTE`);
    await bodeguero.getByRole("dialog").getByRole("button", { name: "Buscar" }).click();
    const aviso = bodeguero.locator("[data-datos-escaneados]");
    await expect(aviso).toContainText("No reconocemos este código");
    await expect(aviso).toContainText(otro);
    await expect(bodeguero.getByLabel("Número de lote")).toHaveValue("OTRO-LOTE");
    await expect(bodeguero.getByLabel("Guía o factura")).toHaveValue("Guía 777");
  });

  test("en el formulario de retiro, escanear elige el insumo", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const ean = eanDePrueba();
    const insumo = await crearInsumo(admin, { codigoBarras: ean });
    const bodeguero = await abrirComo("bodega");
    await bodeguero.goto("/movimientos/retiro");
    await bodeguero.getByRole("button", { name: "Escanear el código del envase" }).click();
    const dialogo = bodeguero.getByRole("dialog", { name: "Escanear el insumo" });
    await dialogo.getByLabel("Escribir el código").fill(ean);
    await dialogo.getByLabel("Escribir el código").press("Enter");
    await expect(bodeguero.getByRole("button", { name: new RegExp(`Cambiar insumo \\(seleccionado: ${insumo.nombre}`) })).toBeVisible();
  });

  test("@movil el visitante no tiene escáner: ni botones ni acceso a la página", async ({ abrirComo }) => {
    const visitante = await abrirComo("visita");
    await visitante.goto("/panel");
    await expect(visitante.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(visitante.getByRole("button", { name: /Escanear/ })).toHaveCount(0);
    await expect(visitante.getByRole("link", { name: /Escanear/ })).toHaveCount(0);
    await visitante.goto("/movimientos/escanear?codigo=7804100000006");
    await expect(visitante).toHaveURL(/\/sin-permiso/);
  });

  test("cabeceras: la cámara solo para el propio sitio y WebAssembly sin habilitar eval", async ({ abrirComo }) => {
    const bodeguero = await abrirComo("bodega");
    const respuesta = await bodeguero.request.get("/panel");
    const politica = respuesta.headers()["permissions-policy"] ?? "";
    expect(politica).toContain("camera=(self)");
    expect(politica).toContain("microphone=()");
    expect(politica).toContain("geolocation=()");
    const csp = respuesta.headers()["content-security-policy"] ?? "";
    const scripts = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";
    expect(scripts).toContain("'wasm-unsafe-eval'");
    expect(scripts).not.toContain("'unsafe-eval'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toMatch(/https?:/); // ningún origen externo (el lector no viene de una CDN)
    expect(csp).toContain("media-src 'self' blob:");
  });
});
