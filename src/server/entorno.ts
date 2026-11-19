import "server-only";
import { z } from "zod";

/**
 * Validación de la configuración (variables de entorno).
 *
 * Se ejecuta al arrancar el servidor (`src/instrumentation.ts`) y al inicio de
 * los scripts de operación (`scripts/`). Si falta algo, el proceso termina de
 * inmediato con un mensaje claro en vez de fallar más tarde con un error
 * difícil de interpretar.
 *
 * Nunca se imprime el valor de una variable: solo su nombre y el problema.
 */

const AYUDA_URL = "Es la dirección de conexión a PostgreSQL (postgresql://usuario:clave@servidor:5432/base?schema=public).";

const zUrlPostgres = z
  .string({ error: `falta. ${AYUDA_URL}` })
  .trim()
  .min(1, { message: `está vacía. ${AYUDA_URL}`, abort: true })
  .refine((valor) => /^postgres(ql)?:\/\//.test(valor), {
    message: 'debe comenzar con "postgresql://". Ejemplo: postgresql://usuario:clave@servidor:5432/base?schema=public',
    abort: true,
  })
  .refine(
    (valor) => {
      try {
        const url = new URL(valor);
        return url.hostname.length > 0 && url.pathname.length > 1;
      } catch {
        return false;
      }
    },
    {
      message:
        "no es una dirección válida. Revisa que tenga servidor y nombre de base, y que la clave no contenga caracteres especiales sin codificar (@ : / ? #).",
    },
  );

const esquemaEntorno = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"], { error: 'debe ser "development", "production" o "test".' })
    .default("development"),
  DATABASE_URL: zUrlPostgres,
  SESION_HORAS: z
    .string()
    .trim()
    .optional()
    .transform((valor) => (valor === undefined || valor === "" ? undefined : Number(valor)))
    .refine((valor) => valor === undefined || (Number.isFinite(valor) && valor > 0 && valor <= 168), {
      message: "debe ser un número de horas mayor que 0 y de hasta 168 (7 días). Ejemplo: 12.",
    })
    .transform((valor) => valor ?? 12),
  PRISMA_LOG: z.enum(["", "query"], { error: 'solo admite el valor "query" (o dejarla sin definir).' }).optional(),
});

export type Entorno = z.output<typeof esquemaEntorno>;

export type ResultadoEntorno =
  | { ok: true; entorno: Entorno; advertencias: string[] }
  | { ok: false; errores: string[] };

/** Fragmentos de claves de ejemplo o de desarrollo que no deben llegar a producción. */
const CLAVES_INSEGURAS = ["medired_dev", "cambia", "ejemplo", "password", "postgres", "123456"];

/** Analiza un conjunto de variables sin efectos secundarios (se puede probar). */
export function analizarEntorno(variables: Record<string, string | undefined>): ResultadoEntorno {
  const resultado = esquemaEntorno.safeParse({
    NODE_ENV: variables.NODE_ENV,
    DATABASE_URL: variables.DATABASE_URL,
    SESION_HORAS: variables.SESION_HORAS,
    PRISMA_LOG: variables.PRISMA_LOG,
  });
  if (!resultado.success) {
    const errores = resultado.error.issues.map((problema) => `${problema.path.join(".")}: ${problema.message}`);
    return { ok: false, errores };
  }

  const advertencias: string[] = [];
  if (resultado.data.NODE_ENV === "production") {
    let clave = "";
    try {
      clave = decodeURIComponent(new URL(resultado.data.DATABASE_URL).password);
    } catch {
      clave = "";
    }
    const claveMinusculas = clave.toLowerCase();
    if (clave.length < 12 || CLAVES_INSEGURAS.some((c) => claveMinusculas.includes(c))) {
      advertencias.push(
        "DATABASE_URL: la clave de la base de datos parece de ejemplo o es muy corta. En producción usa una clave larga y aleatoria.",
      );
    }
  }
  return { ok: true, entorno: resultado.data, advertencias };
}

/** Texto listo para mostrar cuando la configuración es inválida. */
export function mensajeEntornoInvalido(errores: readonly string[]): string {
  return [
    "",
    "✖ Configuración inválida: RedInsumos no puede iniciar.",
    "",
    ...errores.map((e) => `  - ${e}`),
    "",
    "Revisa el archivo .env (o las variables del servicio). El archivo .env.example",
    "explica cada variable. Más ayuda en docs/DESPLIEGUE.md.",
    "",
  ].join("\n");
}

/**
 * Valida `process.env`. Si la configuración es inválida imprime el detalle y
 * termina el proceso con código 1.
 */
export function validarEntorno(): Entorno {
  const resultado = analizarEntorno(process.env);
  if (!resultado.ok) {
    console.error(mensajeEntornoInvalido(resultado.errores));
    process.exit(1);
  }
  for (const advertencia of resultado.advertencias) {
    console.warn(`⚠ Configuración: ${advertencia}`);
  }
  return resultado.entorno;
}
