import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { ErrorDominio } from "../errores";

export const LARGO_MINIMO_PASSWORD = 10;
export const LARGO_MAXIMO_PASSWORD = 128;

// Argon2id (algorithm: 2) con parámetros recomendados por OWASP.
const OPCIONES = {
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashearPassword(password: string): Promise<string> {
  return hash(password, OPCIONES);
}

export async function verificarPassword(hashGuardado: string, password: string): Promise<boolean> {
  try {
    return await verify(hashGuardado, password);
  } catch {
    return false;
  }
}

/** Política mínima de contraseñas. Lanza `ErrorDominio` si no se cumple. */
export function validarPoliticaPassword(password: string): void {
  if (password.length < LARGO_MINIMO_PASSWORD) {
    throw new ErrorDominio(
      "PASSWORD_DEBIL",
      `La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres.`,
      { campo: "nueva" },
    );
  }
  if (password.length > LARGO_MAXIMO_PASSWORD) {
    throw new ErrorDominio(
      "PASSWORD_DEBIL",
      `La contraseña no puede superar los ${LARGO_MAXIMO_PASSWORD} caracteres.`,
      { campo: "nueva" },
    );
  }
  if (!/[a-zA-ZñÑ]/.test(password) || !/\d/.test(password)) {
    throw new ErrorDominio(
      "PASSWORD_DEBIL",
      "La contraseña debe incluir al menos una letra y un número.",
      { campo: "nueva" },
    );
  }
}
