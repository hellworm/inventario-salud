import fs from "node:fs";
import path from "node:path";
import { digitoVerificadorGtin } from "../src/lib/gs1";
import { argumentosCamaraFalsa, escribirVideoDeCodigo } from "./soporte/camara-falsa";
import { crearInsumo } from "./soporte/datos";
import { expect, test } from "./soporte/fixtures";

/**
 * Escáner con CÁMARA: Chromium usa como cámara un video generado con un
 * DataMatrix GS1 (GTIN + vencimiento + lote). Comprueba de punta a punta que
 * la app pide la cámara, decodifica el código (lector WebAssembly servido por
 * el propio sitio, sin violar la CSP), interpreta la cadena GS1 y abre el
 * ingreso con insumo, lote y vencimiento ya puestos.
 *
 * El video se fija al lanzar el navegador, así que este archivo usa un solo
 * código y lo crea al cargar el módulo.
 */

// GTIN propio de este archivo (prefijo 2: uso interno), con dígito verificador válido.
const CUERPO = `2${String(Date.now()).slice(-11).padStart(11, "0")}`;
const EAN = `${CUERPO}${digitoVerificadorGtin(CUERPO)}`;
const ANIO = new Date().getUTCFullYear() + 2;
const LOTE = "CAM-0457";
// Día 00 = último día del mes (junio → 30).
const CADENA_GS1 = `(01)0${EAN}(17)${String(ANIO).slice(2)}0600(10)${LOTE}`;
const VIDEO = escribirVideoDeCodigo(path.join("test-results", "camara-falsa", `gs1-${process.pid}.y4m`), {
  tipo: "gs1datamatrix",
  texto: CADENA_GS1,
});

const CHROMIUM_LOCAL = "/opt/pw-browsers/chromium";
const rutaChromium = process.env.E2E_CHROMIUM ?? (fs.existsSync(CHROMIUM_LOCAL) ? CHROMIUM_LOCAL : undefined);

test.use({
  launchOptions: { ...(rutaChromium ? { executablePath: rutaChromium } : {}), args: argumentosCamaraFalsa(VIDEO) },
});

test.describe("Escáner con la cámara (cámara falsa de Chromium)", () => {
  test("@movil lee un DataMatrix GS1 con la cámara y abre el ingreso con insumo, lote y vencimiento", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    const insumo = await crearInsumo(admin, { codigoBarras: EAN });

    const bodeguero = await abrirComo("bodega");
    // El lector (WebAssembly) debe venir del propio sitio.
    const wasm: string[] = [];
    bodeguero.on("request", (solicitud) => {
      if (solicitud.url().includes(".wasm")) wasm.push(solicitud.url());
    });
    const violaciones: string[] = [];
    bodeguero.on("console", (mensaje) => {
      if (/Content Security Policy|Permissions policy/i.test(mensaje.text())) violaciones.push(mensaje.text());
    });

    await bodeguero.goto("/movimientos/escanear");
    await bodeguero.getByRole("main").getByRole("button", { name: "Abrir la cámara" }).click();
    const dialogo = bodeguero.getByRole("dialog", { name: "Escanear código" });
    await expect(dialogo).toBeVisible();

    // La cámara se abre, el código se lee solo y la app navega al ingreso prellenado.
    await expect(bodeguero).toHaveURL(new RegExp(`/movimientos/ingreso\\?insumo=${insumo.id}&`), { timeout: 30_000 });
    await expect(bodeguero.getByRole("button", { name: new RegExp(`Cambiar insumo \\(seleccionado: ${insumo.nombre}`) })).toBeVisible();
    await expect(bodeguero.getByLabel("Número de lote")).toHaveValue(LOTE);
    await expect(bodeguero.getByLabel("Vencimiento")).toHaveValue(`${ANIO}-06-30`);
    await expect(bodeguero.locator("[data-datos-escaneados]")).toContainText(`el lote ${LOTE}`);
    await expect(bodeguero.getByRole("textbox", { name: "Cantidad" })).toBeFocused();

    // Sin CDN y sin violaciones de la política de seguridad.
    const origen = new URL(bodeguero.url()).origin;
    for (const url of wasm) expect(url.startsWith(`${origen}/_next/static/`), url).toBe(true);
    expect(violaciones).toEqual([]);

    // Al cerrar el escáner la cámara queda liberada (ninguna pista de video activa).
    const pistasActivas = await bodeguero.evaluate(() =>
      [...document.querySelectorAll("video")].flatMap((v) => (v.srcObject instanceof MediaStream ? v.srcObject.getTracks() : [])).filter((t) => t.readyState === "live").length,
    );
    expect(pistasActivas).toBe(0);
  });

  test("al cerrar el escáner sin leer nada, la cámara se libera", async ({ abrirComo, vigilancia }) => {
    // Se corta a propósito la descarga del lector: la consola lo registra como error.
    vigilancia.tolerar();
    const bodeguero = await abrirComo("bodega");
    await bodeguero.goto("/movimientos/escanear");
    // Se detiene el lector para que el diálogo quede abierto con la cámara encendida.
    await bodeguero.route("**/*.wasm", (ruta) => ruta.abort());
    await bodeguero.addInitScript(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      const flujos: MediaStream[] = [];
      (window as unknown as { __flujos: MediaStream[] }).__flujos = flujos;
      navigator.mediaDevices.getUserMedia = async (restricciones) => {
        const flujo = await original(restricciones);
        flujos.push(flujo);
        return flujo;
      };
    });
    await bodeguero.reload();
    await bodeguero.getByRole("main").getByRole("button", { name: "Abrir la cámara" }).click();
    const dialogo = bodeguero.getByRole("dialog", { name: "Escanear código" });
    await expect(dialogo).toBeVisible();
    const vivas = () =>
      bodeguero.evaluate(() =>
        (window as unknown as { __flujos: MediaStream[] }).__flujos.flatMap((f) => f.getTracks()).filter((t) => t.readyState === "live").length,
      );
    // Se pidió la cámara trasera…
    await expect.poll(async () => bodeguero.evaluate(() => (window as unknown as { __flujos: MediaStream[] }).__flujos.length)).toBeGreaterThan(0);
    // …y sin lector (falló su descarga) se explica y se ofrece escribir el código.
    await expect(dialogo).toContainText("No se pudo cargar el lector");
    await dialogo.getByRole("button", { name: "Cerrar el escáner" }).click();
    await expect(dialogo).toHaveCount(0);
    expect(await vivas()).toBe(0);
  });
});
