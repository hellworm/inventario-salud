import fs from "node:fs";
import path from "node:path";
import { test as preparar } from "@playwright/test";
import { ROLES, rutaSesion } from "./soporte/entorno";
import { iniciarSesionComo } from "./soporte/fixtures";

/**
 * Un inicio de sesión por rol y por ejecución: el resto de la suite reutiliza
 * estas sesiones (storageState), así no se repiten logins ni se arriesga el
 * bloqueo de cuentas por intentos fallidos.
 */
for (const rol of ROLES) {
  preparar(`sesión de ${rol}`, async ({ page }) => {
    fs.mkdirSync(path.dirname(rutaSesion(rol)), { recursive: true });
    await iniciarSesionComo(page, rol);
    await page.context().storageState({ path: rutaSesion(rol) });
  });
}
