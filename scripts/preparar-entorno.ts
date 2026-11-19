/**
 * Preparación común de los scripts de operación: carga `.env` (si existe) y
 * valida la configuración antes de tocar la base de datos.
 *
 * Debe importarse ANTES que cualquier módulo de `@/server`.
 */
import { config as cargarEnv } from "dotenv";
import { validarEntorno } from "@/server/entorno";

cargarEnv({ quiet: true });

export const entorno = validarEntorno();
