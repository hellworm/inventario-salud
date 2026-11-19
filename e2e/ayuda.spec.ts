import type { Rol } from "./soporte/entorno";
import { expect, test } from "./soporte/fixtures";

/** Qué explica /ayuda a cada rol: solo lo que ese rol puede hacer. */
const TAREAS = {
  buscar: "Buscar un insumo y ver dónde está",
  alertas: "Ver qué falta o está por vencer",
  escanear: "Ingresar un producto escaneando su código",
  proveedores: "Ver los proveedores y dónde comprar",
  ingreso: "Registrar un ingreso (llegan insumos)",
  retiro: "Registrar un retiro (salen insumos para su uso)",
  historial: "Revisar lo registrado",
  traslado: "Trasladar insumos",
  ajuste: "Corregir el stock o dar de baja",
  vencimiento: "Corregir el vencimiento de un lote",
} as const;

const TODO_ADMIN = ["buscar", "alertas", "escanear", "proveedores", "ingreso", "retiro", "historial", "traslado", "ajuste", "vencimiento"] as const;
const POR_ROL: Record<Exclude<Rol, "valpo" | "cerro">, { etiqueta: string; ve: readonly (keyof typeof TAREAS)[] }> = {
  visita: { etiqueta: "Visitante", ve: ["buscar", "alertas", "proveedores"] },
  bodega: { etiqueta: "Bodeguero", ve: ["buscar", "alertas", "escanear", "proveedores", "ingreso", "retiro", "historial"] },
  andes: { etiqueta: "Administrador de institución", ve: TODO_ADMIN },
  admin: { etiqueta: "Administrador de la red", ve: TODO_ADMIN },
};

test.describe("Ayuda por rol", () => {
  for (const [rol, esperado] of Object.entries(POR_ROL) as [keyof typeof POR_ROL, (typeof POR_ROL)[keyof typeof POR_ROL]][]) {
    test(`${esperado.etiqueta}: /ayuda explica solo lo que su rol puede hacer`, async ({ abrirComo }) => {
      const pagina = await abrirComo(rol);
      await pagina.goto("/panel");
      await pagina.getByRole("button", { name: /Menú de usuario/ }).click();
      await pagina.getByRole("menuitem", { name: "Ayuda" }).click();
      await expect(pagina).toHaveURL(/\/ayuda$/);
      const principal = pagina.getByRole("main");
      await expect(principal.getByRole("heading", { level: 1, name: "Ayuda" })).toBeVisible();
      await expect(principal.getByText(esperado.etiqueta, { exact: true }).first()).toBeVisible();

      for (const [clave, titulo] of Object.entries(TAREAS)) {
        const tarea = principal.locator("details").filter({ hasText: titulo });
        if (esperado.ve.includes(clave as keyof typeof TAREAS)) await expect(tarea, titulo).toHaveCount(1);
        else await expect(tarea, `${titulo} no corresponde a ${esperado.etiqueta}`).toHaveCount(0);
      }
      // Ningún enlace de la ayuda lleva a una pantalla que el rol no puede abrir.
      const enlaces = await principal.locator("details a").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""));
      expect(enlaces.length).toBe(esperado.ve.length);
      for (const href of new Set(enlaces)) {
        const respuesta = await pagina.request.get(href, { maxRedirects: 0 });
        expect(respuesta.status(), `${href} debe abrir para ${esperado.etiqueta}`).toBe(200);
      }

      // Leyenda del semáforo de vencimiento, para todos los roles.
      const semaforo = principal.locator("#semaforo");
      await expect(semaforo).toContainText("Vence en menos de 3 meses");
      await expect(semaforo).toContainText("Vence en 3 a 6 meses");
      await expect(semaforo).toContainText("Vence en 6 meses o más");
      await expect(semaforo).toContainText("Ya venció");

      // Preguntas frecuentes que valen para todos, al día con la aplicación.
      await expect(principal).toContainText("72 horas");
      await expect(principal).toContainText("Tu sesión venció");
      await expect(principal).toContainText("¿Puedo instalarlo en la tablet o el teléfono?");
      await expect(principal).toContainText("No escribas nombres, RUT ni datos de pacientes");
    });
  }

  test("la ayuda describe las confirmaciones y las acciones desde alertas a quien las usa", async ({ abrirComo }) => {
    const admin = await abrirComo("admin");
    await admin.goto("/ayuda");
    const principal = admin.getByRole("main");
    const abrir = async (titulo: string) => {
      const tarea = principal.locator("details").filter({ hasText: titulo });
      if (!(await tarea.evaluate((d) => (d as HTMLDetailsElement).open))) await tarea.locator("summary").click();
      return tarea;
    };
    await expect(await abrir(TAREAS.retiro)).toContainText("Si retiras más de la mitad de lo disponible, el sistema te pide confirmar");
    await expect(await abrir(TAREAS.ajuste)).toContainText(/pide\s+confirmar/);
    await expect(await abrir(TAREAS.alertas)).toContainText("Ingresar");
    await expect(await abrir(TAREAS.alertas)).toContainText("Dar de baja");
    await expect(await abrir(TAREAS.ingreso)).toContainText("usa coma para los decimales");
    await expect(await abrir(TAREAS.vencimiento)).toContainText("Corregir vencimiento");
    await expect(await abrir(TAREAS.escanear)).toContainText("Escribir el código");
    await expect(await abrir(TAREAS.escanear)).toContainText("No reconocemos este código");
    await expect(await abrir(TAREAS.proveedores)).toContainText("Ir a comprar");

    // El bodeguero no ve nada sobre corregir vencimientos ni ajustes.
    const bodeguero = await abrirComo("bodega");
    await bodeguero.goto("/ayuda");
    await expect(bodeguero.getByRole("main")).not.toContainText("Corregir vencimiento");
    await expect(bodeguero.getByRole("main")).toContainText("Los traslados, ajustes y mermas los hace un administrador.");
  });
});
