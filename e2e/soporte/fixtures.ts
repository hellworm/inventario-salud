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
  /**
   * IP desde la que "llega" este test (cabecera `X-Forwarded-For`; el servidor
   * de la suite corre con `TRUST_PROXY=1`). Cada test tiene la suya: así el
   * límite de intentos por IP de un test no alcanza a los demás, igual que
   * personas en redes distintas. Sin la cabecera, Next pone la IP del socket
   * (127.0.0.1) y toda la suite compartiría un solo cupo.
   */
  ipDelTest: string;
  /** Abre una página sin sesión (contexto limpio). */
  abrirAnonimo: () => Promise<Page>;
  /**
   * Abre una página sin sesión cuya IP el servidor NO puede determinar
   * (`X-Forwarded-For` inválida → IP nula), como en un despliegue sin
   * `TRUST_PROXY`: el bloqueo por intentos degrada a "por cuenta".
   */
  abrirSinIp: () => Promise<Page>;
  /**
   * Abre una página sin sesión cuyas solicitudes llegan "desde" la IP indicada
   * (cabecera `X-Forwarded-For`; el servidor de la suite corre con
   * `TRUST_PROXY=1`). Para probar el limitador de intentos por IP. Con `rol`,
   * parte con la sesión guardada de ese rol.
   */
  abrirDesdeIp: (ip: string, rol?: Rol) => Promise<Page>;
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

  ipDelTest: async ({}, usar) => {
    await usar(ipDePrueba());
  },

  // También vale para la `page` por defecto del test y su `page.request`.
  extraHTTPHeaders: async ({ ipDelTest }, usar) => {
    await usar({ "X-Forwarded-For": ipDelTest });
  },

  opcionesContexto: async (
    { baseURL, viewport, locale, timezoneId, hasTouch, isMobile, deviceScaleFactor, userAgent, extraHTTPHeaders },
    usar,
  ) => {
    await usar({ baseURL, viewport, locale, timezoneId, hasTouch, isMobile, deviceScaleFactor, userAgent, extraHTTPHeaders });
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

  abrirDesdeIp: async ({ browser, opcionesContexto, vigilancia }, usar) => {
    const contextos: BrowserContext[] = [];
    await usar(async (ip, rol) => {
      const contexto = await browser.newContext({
        ...opcionesContexto,
        storageState: rol ? rutaSesion(rol) : { cookies: [], origins: [] },
        extraHTTPHeaders: { "X-Forwarded-For": ip },
      });
      contextos.push(contexto);
      const pagina = await contexto.newPage();
      vigilar(pagina, vigilancia.problemas);
      return pagina;
    });
    await Promise.all(contextos.map((c) => c.close()));
  },

  abrirSinIp: async ({ browser, opcionesContexto, vigilancia }, usar) => {
    const contextos: BrowserContext[] = [];
    await usar(async () => {
      const contexto = await browser.newContext({
        ...opcionesContexto,
        storageState: { cookies: [], origins: [] },
        extraHTTPHeaders: { "X-Forwarded-For": "desconocida" },
      });
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

/**
 * IP privada al azar para un test del limitador de intentos. Cada test usa las
 * suyas: los contadores por IP viven 5–15 minutos en la base y no deben
 * mezclarse entre tests ni entre ejecuciones seguidas de la suite.
 */
export function ipDePrueba(): string {
  const octeto = () => 1 + Math.floor(Math.random() * 254);
  return `10.${octeto()}.${octeto()}.${octeto()}`;
}

/** Usa en un `describe`: todos sus tests parten con la sesión del rol. */
export function sesionDe(rol: Rol): { storageState: string } {
  return { storageState: rutaSesion(rol) };
}

/**
 * Marca un test que hoy falla por un bug real de la aplicación (ver el informe
 * de QA): se espera que falle y la suite sigue en verde. Con
 * `E2E_EXIGIR_BUGS=1` se ejecuta como un test normal, para ver el fallo o
 * comprobar un arreglo. Al corregir el bug, quitar la llamada.
 */
export function bugConocido(motivo: string): void {
  test.fail(!process.env.E2E_EXIGIR_BUGS, motivo);
}
