#!/usr/bin/env node
/**
 * Inicia la versión compilada (`npm run build`) fuera de Docker.
 *
 * El build usa `output: "standalone"`, con el que `next start` no es compatible.
 * El servidor autocontenido (`.next/standalone/server.js`) no incluye los
 * archivos estáticos ni `public/`: este script los copia y lo arranca, igual
 * que hace el Dockerfile.
 *
 *   npm start                 # puerto 3000 (o $PORT)
 *   npm start -- -p 3200      # otro puerto
 *
 * Las variables de `.env` se cargan si existen; las del entorno tienen prioridad.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(raiz, ".next", "standalone");
const servidor = path.join(standalone, "server.js");

if (!fs.existsSync(servidor)) {
  console.error("No se encontró .next/standalone/server.js. Ejecuta antes: npm run build");
  process.exit(1);
}

const argumentos = process.argv.slice(2);
function opcion(...nombres) {
  const i = argumentos.findIndex((a) => nombres.includes(a));
  return i >= 0 ? argumentos[i + 1] : undefined;
}
const puerto = opcion("-p", "--port") ?? process.env.PORT ?? "3000";
const anfitrion = opcion("-H", "--hostname") ?? process.env.HOSTNAME_APP ?? "0.0.0.0";
if (!/^\d{1,5}$/.test(puerto)) {
  console.error(`Puerto inválido: ${puerto}`);
  process.exit(1);
}

const archivoEnv = path.join(raiz, ".env");
if (fs.existsSync(archivoEnv)) process.loadEnvFile(archivoEnv); // no pisa lo ya definido

// Estáticos y public junto al servidor (se recopian en cada inicio: son del build actual).
for (const [origen, destino] of [
  [path.join(raiz, ".next", "static"), path.join(standalone, ".next", "static")],
  [path.join(raiz, "public"), path.join(standalone, "public")],
]) {
  if (!fs.existsSync(origen)) continue;
  fs.rmSync(destino, { recursive: true, force: true });
  fs.cpSync(origen, destino, { recursive: true });
}

const hijo = spawn(process.execPath, [servidor], {
  cwd: standalone,
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production", PORT: puerto, HOSTNAME: anfitrion },
});
for (const senal of ["SIGINT", "SIGTERM"]) process.on(senal, () => hijo.kill(senal));
hijo.on("exit", (codigo, senal) => process.exit(codigo ?? (senal ? 1 : 0)));
