import { expect, type Page } from "@playwright/test";
import { marcar } from "./datos";
import { CENTROS, sufijo } from "./entorno";
import { iniciarSesion } from "./fixtures";

/** Ayudantes para crear y usar cuentas propias de cada test (por la interfaz de administración). */

export interface UsuarioPrueba {
  nombre: string;
  email: string;
  temporal: string;
}

export type RolNuevo = "Administrador" | "Bodeguero" | "Visitante";

/** Crea un usuario desde /admin/usuarios y devuelve su contraseña temporal. */
export async function crearUsuario(admin: Page, rol: RolNuevo, centros: string[] = [CENTROS.nunoa]): Promise<UsuarioPrueba> {
  const s = sufijo().toLowerCase();
  const usuario = { nombre: `Prueba E2E ${s}`, email: `e2e.${s}@redinsumos.cl` };
  await admin.goto("/admin/usuarios");
  await admin.getByRole("button", { name: "Nuevo usuario" }).click();
  const dialogo = admin.getByRole("dialog", { name: "Nuevo usuario" });
  await dialogo.getByLabel("Nombre y apellido").fill(usuario.nombre);
  // Con mayúsculas y espacios: el correo se normaliza.
  await dialogo.getByLabel("Correo electrónico").fill(`  ${usuario.email.toUpperCase()} `);
  await marcar(dialogo.getByRole("radio", { name: new RegExp(`^${rol}`) }));
  if (rol !== "Administrador") {
    for (const centro of centros) await marcar(dialogo.getByRole("checkbox", { name: centro }));
  }
  await dialogo.getByRole("button", { name: "Crear usuario" }).click();

  const creado = admin.getByRole("dialog", { name: "Usuario creado" });
  await expect(creado).toContainText(usuario.email);
  const temporal = await creado.getByLabel("Contraseña temporal").inputValue();
  expect(temporal.length).toBeGreaterThanOrEqual(10);
  await creado.getByRole("button", { name: /Cerrar sin copiar|Listo/ }).click();
  await expect(creado).toBeHidden();
  return { ...usuario, temporal };
}

/** Fila del usuario en la tabla de /admin/usuarios (filtrada por su email). */
export async function filaDeUsuario(admin: Page, usuario: UsuarioPrueba) {
  await admin.goto(`/admin/usuarios?q=${encodeURIComponent(usuario.email)}`);
  return admin.getByRole("row").filter({ hasText: usuario.email });
}

/** Primer ingreso: cambia la contraseña temporal por una definitiva. */
export async function primerIngreso(pagina: Page, usuario: UsuarioPrueba, nueva: string): Promise<void> {
  await iniciarSesion(pagina, usuario.email, usuario.temporal);
  await expect(pagina).toHaveURL(/\/cambiar-password$/);
  await pagina.getByLabel("Contraseña actual").fill(usuario.temporal);
  await pagina.getByLabel("Nueva contraseña", { exact: true }).fill(nueva);
  await pagina.getByLabel("Repite la nueva contraseña").fill(nueva);
  await pagina.getByRole("button", { name: "Guardar nueva contraseña" }).click();
  await expect(pagina).toHaveURL(/\/panel/);
}
