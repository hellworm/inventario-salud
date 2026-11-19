import { execSync } from "node:child_process";
import { config as cargarEnv } from "dotenv";

/** Aplica las migraciones a la base de tests antes de ejecutar la suite. */
export default function setup(): void {
  cargarEnv({ quiet: true });
  const url =
    process.env.DATABASE_URL_TEST ??
    "postgresql://medired:medired_dev@localhost:5432/medired_test?schema=public";
  if (!/_test(\?|$)/.test(url)) {
    throw new Error(`DATABASE_URL_TEST debe apuntar a una base *_test (recibido: ${url})`);
  }
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url },
  });
}
