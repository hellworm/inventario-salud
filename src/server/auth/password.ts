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

/**
 * Semáforo en proceso para argon2. Cada operación usa ~19 MiB y un hilo del
 * pool de libuv (4 por defecto): sin tope, una ráfaga de inicios de sesión
 * agotaría la memoria y dejaría sin hilos al resto del servidor. Se ejecutan
 * como máximo `MAX_ARGON2_SIMULTANEOS` a la vez; el resto espera en una cola
 * acotada y, si la cola se llena, se rechaza de inmediato.
 */
export const MAX_ARGON2_SIMULTANEOS = 3;
export const MAX_COLA_ARGON2 = 100;

let enCurso = 0;
let maximoObservado = 0;
const cola: (() => void)[] = [];

/** Para pruebas y diagnóstico. */
export function estadoSemaforoArgon2(): { enCurso: number; enCola: number; maximoObservado: number } {
  return { enCurso, enCola: cola.length, maximoObservado };
}

async function conSemaforo<T>(trabajo: () => Promise<T>): Promise<T> {
  if (enCurso >= MAX_ARGON2_SIMULTANEOS) {
    if (cola.length >= MAX_COLA_ARGON2) {
      throw new ErrorDominio(
        "DEMASIADOS_INTENTOS",
        "El sistema está atendiendo demasiadas solicitudes. Intenta nuevamente en unos segundos.",
      );
    }
    // Quien libera el turno lo traspasa directamente (no decrementa `enCurso`).
    await new Promise<void>((resolver) => cola.push(resolver));
  } else {
    enCurso++;
    maximoObservado = Math.max(maximoObservado, enCurso);
  }
  try {
    return await trabajo();
  } finally {
    const siguiente = cola.shift();
    if (siguiente) siguiente();
    else enCurso--;
  }
}

export function hashearPassword(password: string): Promise<string> {
  return conSemaforo(() => hash(password, OPCIONES));
}

export async function verificarPassword(hashGuardado: string, password: string): Promise<boolean> {
  return conSemaforo(async () => {
    try {
      return await verify(hashGuardado, password);
    } catch {
      return false;
    }
  });
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
