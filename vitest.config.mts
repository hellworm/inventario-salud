import path from "node:path";
import { config as cargarEnv } from "dotenv";
import { defineConfig } from "vitest/config";

cargarEnv({ quiet: true });

const urlTest =
  process.env.DATABASE_URL_TEST ??
  "postgresql://medired:medired_dev@localhost:5432/medired_test?schema=public";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` lanza fuera de un bundle de servidor de Next.
      "server-only": path.resolve(import.meta.dirname, "tests/soporte/vacio.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/soporte/global.ts"],
    // Todos los tests comparten la misma base: se ejecutan en serie.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: { DATABASE_URL: urlTest, TZ: "UTC" },
  },
});
