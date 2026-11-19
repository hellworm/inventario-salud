import { test as base, expect, type BrowserContext, type BrowserContextOptions, type Page } from "@playwright/test";
import { CUENTAS, rutaSesion, type Rol } from "./entorno";

/** Problemas que ningún flujo debería provocar: errores JS y respuestas 5xx. */
export interface Vigilancia {
  problemas: string[];
  /** Deja de exigir "sin problemas" en este test (casos que provocan errores a propósito). */
  tolerar(): void;
}

interface Fixtures {
  vigilancia: Vigilancia;
  /** Abre una página con la sesión guardada del rol (contexto propio, se cierra sola). */
  abrirComo: (rol: Rol) => Promise<Page>;
  /** Abre una página sin sesión (contexto limpio). */
  abrirAnonimo: () => Promise<Page>;
  /** Opciones del proyecto (viewport, idioma…) para los contextos que crea la suite a mano. */
  opcionesContexto: BrowserContextOptions;
}

function vigilar(pagina: Page, problemas: string[]): void {
  pagina.on("pageerror", (error) => problemas.push(`[error JS] ${pagina.url()} → ${error.message}`));
  pagina.on("console", (mensaje) => {
    if (mensaje.type() !== "error") return;
    const texto = mensaje.text();
    // Los recursos con 4xx (p. ej. un 403 esperado) se evalúan en cada test.
    if (texto.startsWith("Failed to load resource")) return;
    problemas.push(`[consola] ${pagina.url()} → ${texto}`);
  });
  pagina.on("response", (respuesta) => {
    if (respuesta.status() >= 500) problemas.push(`[HTTP ${respuesta.status()}] ${respuesta.url()}`);
  });
}

export const test = base.extend<Fixtures>({
  vigilancia: [
    async ({}, usar) => {
      let exigir = true;
      const vigilancia: Vigilancia = { problemas: [], tolerar: () => (exigir = false) };
      await usar(vigilancia);
      if (exigir) {
        expect.soft(vigilancia.problemas, "errores de consola, excepciones JS o respuestas 5xx durante el test").toEqual([]);
      }
    },
    { auto: true },
  ],

  page: async ({ page, vigilancia }, usar) => {
    vigilar(page, vigilancia.problemas);
    await usar(page);
  },

  opcionesContexto: async (
    { baseURL, viewport, locale, timezoneId, hasTouch, isMobile, deviceScaleFactor, userAgent },
    usar,
  ) => {
    await usar({ baseURL, viewport, locale, timezoneId, hasTouch, isMobile, deviceScaleFactor, userAgent });
  },

  abrirComo: async ({ browser, opcionesContexto, vigilancia }, usar) => {
    const contextos: BrowserContext[] = [];
    await usar(async (rol) => {
      const contexto = await browser.newContext({ ...opcionesContexto, storageState: rutaSesion(rol) });
      contextos.push(contexto);
      const pagina = await contexto.newPage();
      vigilar(pagina, vigilancia.problemas);
      return pagina;
    });
    await Promise.all(contextos.map((c) => c.close()));
  },

  abrirAnonimo: async ({ browser, opcionesContexto, vigilancia }, usar) => {
    const contextos: BrowserContext[] = [];
    await usar(async () => {
      const contexto = await browser.newContext({ ...opcionesContexto, storageState: { cookies: [], origins: [] } });
      contextos.push(contexto);
      const pagina = await contexto.newPage();
      vigilar(pagina, vigilancia.problemas);
      return pagina;
    });
    await Promise.all(contextos.map((c) => c.close()));
  },
});

export { expect };

/** Inicia sesión por el formulario y espera a salir de /login. */
export async function iniciarSesion(pagina: Page, email: string, password: string): Promise<void> {
  await pagina.goto("/login");
  await pagina.getByLabel("Correo electrónico").fill(email);
  await pagina.getByLabel("Contraseña", { exact: true }).fill(password);
  await pagina.getByRole("button", { name: "Ingresar" }).click();
}

export async function iniciarSesionComo(pagina: Page, rol: Rol): Promise<void> {
  await iniciarSesion(pagina, CUENTAS[rol].email, CUENTAS[rol].password);
  await pagina.waitForURL("**/panel");
}

/** Usa en un `describe`: todos sus tests parten con la sesión del rol. */
export function sesionDe(rol: Rol): { storageState: string } {
  return { storageState: rutaSesion(rol) };
}
