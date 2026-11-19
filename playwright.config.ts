import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Suite de punta a punta (Playwright). Ver README, sección "Pruebas e2e".
 *
 * Variables:
 *  - E2E_BASE_URL      URL de un servidor ya levantado (no se arranca ninguno).
 *  - E2E_PORT          Puerto del servidor que arranca la suite (3200 por defecto).
 *  - E2E_DATABASE_URL  Base que usa ese servidor (por defecto `medired_e2e`).
 *  - E2E_CHROMIUM      Ruta a un Chromium ya instalado (si el runner no encuentra el suyo).
 *
 * La suite NUNCA debe apuntar a la base de demostración: crea datos nuevos
 * en cada ejecución (insumos, usuarios, proveedores… con sufijos únicos).
 */
const PUERTO = Number(process.env.E2E_PORT ?? 3200);
const URL_BASE = process.env.E2E_BASE_URL ?? `http://localhost:${PUERTO}`;
const BASE_E2E =
  process.env.E2E_DATABASE_URL ?? "postgresql://medired:medired_dev@localhost:5432/medired_e2e?schema=public";

// Chromium preinstalado (imágenes de CI con /opt/pw-browsers): se usa si existe.
const CHROMIUM_LOCAL = "/opt/pw-browsers/chromium";
const rutaChromium = process.env.E2E_CHROMIUM ?? (fs.existsSync(CHROMIUM_LOCAL) ? CHROMIUM_LOCAL : undefined);
const lanzamiento = rutaChromium ? { executablePath: rutaChromium } : {};

/** Flujos principales que también se ejecutan en móvil (390 px). */
const ETIQUETA_MOVIL = /@movil/;
/** Pruebas propias de tablet horizontal (1024 × 768, táctil): solo corren en el proyecto `tablet`. */
const ETIQUETA_TABLET = /@tablet/;

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 4,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "test-results/e2e-informe" }]] : "list",
  use: {
    baseURL: URL_BASE,
    locale: "es-CL",
    timezoneId: "America/Santiago",
    trace: "off",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: "preparacion", testMatch: /sesiones\.setup\.ts/, use: { launchOptions: lanzamiento } },
    {
      name: "escritorio",
      dependencies: ["preparacion"],
      grepInvert: ETIQUETA_TABLET,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, launchOptions: lanzamiento },
    },
    {
      name: "movil",
      dependencies: ["preparacion"],
      grep: ETIQUETA_MOVIL,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 2,
        launchOptions: lanzamiento,
      },
    },
    {
      name: "tablet",
      dependencies: ["preparacion"],
      grep: ETIQUETA_TABLET,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1024, height: 768 },
        hasTouch: true,
        deviceScaleFactor: 2,
        launchOptions: lanzamiento,
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Requiere `npm run build` previo. Si ya hay un servidor en el puerto, se reutiliza.
        command: `node scripts/iniciar.mjs -p ${PUERTO}`,
        url: `${URL_BASE}/login`,
        reuseExistingServer: true,
        timeout: 120_000,
        // TRUST_PROXY=1: los tests del limitador de login envían su propia X-Forwarded-For
        // (una IP distinta por test); el resto de la suite no la envía y queda sin IP.
        env: { DATABASE_URL: BASE_E2E, TRUST_PROXY: "1" },
        stdout: "ignore",
        // E2E_VER_SERVIDOR=1 muestra los errores que el servidor escribe durante la suite.
        stderr: process.env.E2E_VER_SERVIDOR ? "pipe" : "ignore",
      },
});
