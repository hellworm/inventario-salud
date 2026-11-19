import "server-only";
import { db } from "./db";
import { registrarError } from "./registro";

const TIEMPO_MAXIMO_MS = 3000;

/**
 * Comprueba que la base de datos responde (consulta trivial con tiempo
 * máximo). No lanza: devuelve `false` y deja el detalle en el registro.
 */
export async function baseDeDatosDisponible(): Promise<boolean> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_, rechazar) => {
        temporizador = setTimeout(
          () => rechazar(new Error("La base de datos no respondió a tiempo.")),
          TIEMPO_MAXIMO_MS,
        );
      }),
    ]);
    return true;
  } catch (error) {
    registrarError("salud", "La comprobación de la base de datos falló.", error);
    return false;
  } finally {
    clearTimeout(temporizador);
  }
}
