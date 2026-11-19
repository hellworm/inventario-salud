import { expect, type Locator, type Page } from "@playwright/test";
import { sufijo, type Ubicacion } from "./entorno";

/**
 * Ayudantes para que cada test cree y opere SUS PROPIOS datos por la interfaz
 * (insumo nuevo con código único → stock exacto y sin interferencia entre tests).
 */

export interface InsumoPrueba {
  id: string;
  codigo: string;
  nombre: string;
  sufijo: string;
}

export interface OpcionesInsumo {
  /** Por defecto controla vencimiento. */
  controlaVencimiento?: boolean;
  categoria?: string;
  nombre?: string;
  /** Código de barras (p. ej. un EAN-13), para los flujos de escaneo. */
  codigoBarras?: string;
}

/** Crea un insumo en el catálogo (requiere una página con sesión ADMIN). Unidad: caja. */
export async function crearInsumo(pagina: Page, opciones: OpcionesInsumo = {}): Promise<InsumoPrueba> {
  const s = sufijo();
  const codigo = `E2E-${s}`;
  const nombre = opciones.nombre ?? `Insumo e2e ${s}`;
  await pagina.goto("/admin/insumos/nuevo");
  await pagina.getByRole("textbox", { name: "Código", exact: true }).fill(codigo);
  await pagina.getByLabel("Categoría").selectOption({ label: opciones.categoria ?? "Curación" });
  await pagina.getByRole("textbox", { name: "Nombre", exact: true }).fill(nombre);
  await pagina.getByLabel("Unidad de medida").selectOption({ label: "Caja" });
  if (opciones.controlaVencimiento === false) {
    await pagina.getByRole("checkbox", { name: /Controla fecha de vencimiento/ }).uncheck();
  }
  if (opciones.codigoBarras) await pagina.getByLabel("Código de barras").fill(opciones.codigoBarras);
  await pagina.getByRole("button", { name: "Crear insumo" }).click();
  await pagina.waitForURL(/\/admin\/insumos\/(?!nuevo)[^/]+$/);
  const id = new URL(pagina.url()).pathname.split("/").pop() as string;
  await expect(pagina.getByRole("heading", { level: 1, name: nombre })).toBeVisible();
  return { id, codigo, nombre, sufijo: s };
}

/** Define mínimo y máximo del insumo en un centro (página ADMIN). */
export async function definirMinimo(
  pagina: Page,
  insumo: InsumoPrueba,
  centro: string,
  minimo: number,
  maximo?: number,
): Promise<void> {
  await pagina.goto(`/admin/insumos/${insumo.id}`);
  await pagina.getByLabel(`Mínimo en ${centro}`).fill(String(minimo));
  if (maximo !== undefined) await pagina.getByLabel(`Máximo en ${centro}`).fill(String(maximo));
  await pagina.getByRole("button", { name: "Guardar mínimos y máximos" }).click();
  await expect(avisos(pagina)).toContainText(/guardad|actualizad/i);
}

/** Región de avisos (toasts). */
export function avisos(pagina: Page): Locator {
  return pagina.getByRole("region", { name: /Notifications/ });
}

/**
 * Elige una ubicación en un `<select>` de ubicaciones. Funciona tanto con un
 * centro activo ("Bodega central") como en toda la red ("Bodega central · Centro…"),
 * y con el detalle de stock que agregan algunos formularios ("… — 8 cajas").
 */
export async function elegirUbicacion(pagina: Page, etiqueta: string | RegExp, ubicacion: Ubicacion): Promise<void> {
  const select = pagina.getByRole("combobox", { name: etiqueta });
  await expect(select).toBeVisible();
  const valor = await valorDeUbicacion(select, ubicacion);
  expect(valor, `la ubicación "${ubicacion.nombre}" (${ubicacion.centro}) debe estar entre las opciones`).toBeTruthy();
  await select.selectOption(valor as string);
}

/** `value` de la opción que corresponde a la ubicación, o `null` si no se ofrece. */
export async function valorDeUbicacion(select: Locator, ubicacion: Ubicacion): Promise<string | null> {
  return select.locator("option").evaluateAll(
    (opciones, u) => {
      const candidata = (opciones as HTMLOptionElement[]).find((o) => {
        const texto = (o.textContent ?? "").trim();
        const esNombre = texto === u.nombre || [" ·", " (", " —"].some((sep) => texto.startsWith(u.nombre + sep));
        if (!esNombre) return false;
        const grupo = o.parentElement instanceof HTMLOptGroupElement ? o.parentElement.label : null;
        return grupo === null || grupo === u.centro;
      });
      return candidata ? candidata.value : null;
    },
    { nombre: ubicacion.nombre, centro: ubicacion.centro },
  );
}

/** Textos de las opciones de un `<select>` (sin el marcador de posición vacío). */
export async function opcionesDe(select: Locator): Promise<string[]> {
  return select
    .locator("option")
    .evaluateAll((opciones) =>
      (opciones as HTMLOptionElement[]).filter((o) => o.value !== "").map((o) => (o.textContent ?? "").trim()),
    );
}

export interface DatosIngreso {
  insumo: InsumoPrueba;
  ubicacion: Ubicacion;
  lote: string;
  /** `YYYY-MM-DD`. Omitir si el lote ya existe o el insumo no controla vencimiento. */
  vence?: string;
  cantidad: number;
  documento?: string;
}

/** Llena el formulario de ingreso (sin enviarlo). */
export async function llenarIngreso(pagina: Page, d: DatosIngreso): Promise<void> {
  await pagina.goto(`/movimientos/ingreso?insumo=${d.insumo.id}`);
  await expect(pagina.getByRole("button", { name: /Cambiar insumo/ })).toBeVisible();
  await elegirUbicacion(pagina, "Ubicación de destino", d.ubicacion);
  await pagina.getByLabel("Número de lote").fill(d.lote);
  if (d.vence) await pagina.getByLabel("Vencimiento").fill(d.vence);
  await pagina.getByRole("textbox", { name: "Cantidad" }).fill(String(d.cantidad));
  if (d.documento) await pagina.getByLabel("Guía o factura").fill(d.documento);
}

/** Registra un ingreso por la interfaz y espera la confirmación. */
export async function registrarIngreso(pagina: Page, d: DatosIngreso): Promise<void> {
  await llenarIngreso(pagina, d);
  await pagina.getByRole("button", { name: "Registrar ingreso" }).click();
  await expect(pagina.getByRole("heading", { name: "Ingreso registrado" })).toBeVisible();
}

/** Abre el formulario de retiro con el insumo y la ubicación ya elegidos. */
export async function abrirRetiro(pagina: Page, insumo: InsumoPrueba, ubicacion: Ubicacion): Promise<void> {
  await pagina.goto(`/movimientos/retiro?insumo=${insumo.id}`);
  await expect(pagina.getByRole("button", { name: /Cambiar insumo/ })).toBeVisible();
  await elegirUbicacion(pagina, "Desde la ubicación", ubicacion);
  await expect(pagina.getByText(`Disponible en ${ubicacion.nombre}`)).toBeVisible();
}

/**
 * Diálogo de confirmación abierto (ajuste, merma, retiro grande…): comprueba
 * su título y lo que debe decir, y pulsa el botón indicado.
 */
export async function confirmarEnDialogo(
  pagina: Page,
  titulo: string | RegExp,
  boton: string | RegExp,
  debeDecir: (string | RegExp)[] = [],
): Promise<void> {
  const dialogo = pagina.getByRole("alertdialog", { name: titulo });
  await expect(dialogo).toBeVisible();
  for (const texto of debeDecir) await expect(dialogo).toContainText(texto);
  await dialogo.getByRole("button", { name: boton }).click();
}

export const TITULO_RETIRO_GRANDE = "¿Retirar más de la mitad del stock?";

/**
 * Envía el formulario de retiro ya lleno. Con `masDeLaMitad` EXIGE que el
 * sistema pida confirmar (retiro de más del 50 % de lo disponible en la
 * ubicación) y confirma; sin él, exige que NO la pida.
 */
export async function enviarRetiro(pagina: Page, opciones: { masDeLaMitad?: boolean } = {}): Promise<void> {
  await pagina.getByRole("button", { name: "Registrar retiro" }).click();
  if (opciones.masDeLaMitad) {
    await confirmarEnDialogo(pagina, TITULO_RETIRO_GRANDE, "Registrar retiro", ["es más de la mitad"]);
  } else {
    await expect(pagina.getByRole("alertdialog")).toHaveCount(0);
  }
}

/** Retiro automático (FEFO) por la interfaz; espera la confirmación. */
export async function registrarRetiro(
  pagina: Page,
  insumo: InsumoPrueba,
  ubicacion: Ubicacion,
  cantidad: number,
  opciones: { motivo?: string; masDeLaMitad?: boolean } = {},
): Promise<void> {
  await abrirRetiro(pagina, insumo, ubicacion);
  await pagina.getByRole("textbox", { name: "Cantidad a retirar" }).fill(String(cantidad));
  if (opciones.motivo) await pagina.getByLabel("Destino o motivo").fill(opciones.motivo);
  await enviarRetiro(pagina, opciones);
  await expect(pagina.getByRole("heading", { name: "Retiro registrado" })).toBeVisible();
}

/** Expresión para "N caja(s)" sin confundir 14 con 114. */
export function cajas(n: number): RegExp {
  return new RegExp(`(^|[^\\d.])${n.toLocaleString("es-CL")}\\s+cajas?(?![\\w])`);
}

/**
 * Fila (escritorio) o tarjeta (móvil) del insumo en la grilla de inventario.
 * Navega a /inventario filtrando por el código único del insumo.
 */
export async function filaDeInventario(pagina: Page, insumo: InsumoPrueba): Promise<Locator> {
  await pagina.goto(`/inventario?q=${insumo.codigo}`);
  return filaVisible(pagina, insumo.codigo);
}

/** Fila de tabla o elemento de lista visible que contiene el texto. */
export function filaVisible(pagina: Page, texto: string | RegExp): Locator {
  return pagina
    .getByRole("main")
    .locator("tbody tr, li")
    .filter({ hasText: texto })
    .filter({ visible: true })
    .first();
}

/** Comprueba el stock disponible que muestra la grilla de inventario para el insumo. */
export async function esperarStockEnGrilla(pagina: Page, insumo: InsumoPrueba, cantidad: number): Promise<void> {
  const fila = await filaDeInventario(pagina, insumo);
  await expect(fila, `la grilla debe mostrar ${cantidad} cajas de ${insumo.codigo}`).toContainText(cajas(cantidad), {
    useInnerText: true,
  });
}

/** "Disponible" de la ficha del insumo (/inventario/[id]) como número. */
export async function disponibleEnFicha(pagina: Page, insumo: InsumoPrueba): Promise<number> {
  await pagina.goto(`/inventario/${insumo.id}`);
  const resumen = pagina.getByRole("region", { name: "Resumen de stock" });
  await expect(resumen).toBeVisible();
  const texto = await resumen.locator("p").nth(1).innerText();
  return Number(texto.replace(/\./g, "").trim());
}

/** Fila de la ficha (tabla "Existencias por lote y ubicación") de un lote en una ubicación. */
export function filaDeLote(pagina: Page, lote: string, ubicacion?: Ubicacion): Locator {
  let filas = pagina
    .getByRole("main")
    .locator("tbody tr, li")
    .filter({ hasText: lote })
    .filter({ visible: true });
  if (ubicacion) filas = filas.filter({ hasText: ubicacion.nombre });
  return filas.first();
}

/**
 * Marca un radio o checkbox del kit haciendo clic en su etiqueta (el `<input>`
 * real está visualmente oculto) y espera a que quede marcado.
 */
export async function marcar(control: Locator): Promise<void> {
  if (!(await control.isChecked())) await control.locator("xpath=ancestor::label[1]").click();
  await expect(control).toBeChecked();
}

export async function desmarcar(control: Locator): Promise<void> {
  if (await control.isChecked()) await control.locator("xpath=ancestor::label[1]").click();
  await expect(control).not.toBeChecked();
}
