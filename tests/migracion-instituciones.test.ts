import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";

/**
 * Migración de datos `instituciones`: una base YA DESPLEGADA (una sola
 * organización, rol ADMIN = operador) debe migrar sin pérdida.
 *
 * Se arma una base temporal aparte con las migraciones ANTERIORES, se cargan
 * datos con la forma antigua (SQL directo) y se aplica la migración nueva con
 * `prisma migrate deploy`, igual que en un despliegue real.
 */

const RAIZ = path.resolve(import.meta.dirname, "..");
const MIGRACIONES = path.join(RAIZ, "prisma", "migrations");
const NUEVA = "20261120120000_instituciones";

const urlTests = new URL(process.env.DATABASE_URL!);
const nombreBase = `${urlTests.pathname.slice(1).replace(/_test$/, "")}_migracion_test`;
const urlTemporal = new URL(urlTests);
urlTemporal.pathname = `/${nombreBase}`;

let directorio: string;
let temporal: PrismaClient;

function migrar(): void {
  execFileSync(path.join(RAIZ, "node_modules", ".bin", "prisma"), ["migrate", "deploy"], {
    cwd: directorio,
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: urlTemporal.toString() },
  });
}

function copiarMigracion(nombre: string): void {
  fs.cpSync(path.join(MIGRACIONES, nombre), path.join(directorio, "prisma", "migrations", nombre), { recursive: true });
}

const sql = (texto: string) => temporal.$executeRawUnsafe(texto);
const consultar = <T>(texto: string) => temporal.$queryRawUnsafe<T[]>(texto);

beforeAll(async () => {
  if (!/_test$/.test(nombreBase)) throw new Error("La base temporal de migración debe terminar en _test");
  await db.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${nombreBase}"`);
  await db.$executeRawUnsafe(`CREATE DATABASE "${nombreBase}"`);

  // Proyecto Prisma mínimo con las migraciones anteriores a la nueva.
  directorio = fs.mkdtempSync(path.join(os.tmpdir(), "redinsumos-migracion-"));
  fs.mkdirSync(path.join(directorio, "prisma", "migrations"), { recursive: true });
  fs.writeFileSync(
    path.join(directorio, "prisma", "schema.prisma"),
    'datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n',
  );
  fs.copyFileSync(path.join(MIGRACIONES, "migration_lock.toml"), path.join(directorio, "prisma", "migrations", "migration_lock.toml"));
  const anteriores = fs
    .readdirSync(MIGRACIONES)
    .filter((n) => fs.statSync(path.join(MIGRACIONES, n)).isDirectory() && n < NUEVA)
    .sort();
  expect(anteriores.length).toBeGreaterThanOrEqual(3);
  for (const nombre of anteriores) copiarMigracion(nombre);
  migrar();

  temporal = new PrismaClient({ datasourceUrl: urlTemporal.toString() });

  // --- Datos con la forma ANTERIOR (sin instituciones, rol ADMIN = operador) ---
  const ahora = "CURRENT_TIMESTAMP";
  await sql(`INSERT INTO "centros" ("id","nombre","tipo","direccion","comuna","region","actualizadoEn") VALUES
    ('c1','Centro Uno','DIALISIS','Av. 1','Ñuñoa','Metropolitana de Santiago',${ahora}),
    ('c2','Centro Dos','CONSULTORIO','Av. 2','Valparaíso','Valparaíso',${ahora})`);
  await sql(`INSERT INTO "ubicaciones" ("id","centroId","nombre","actualizadoEn") VALUES ('u1','c1','Bodega',${ahora})`);
  await sql(`INSERT INTO "usuarios" ("id","nombre","email","passwordHash","rol","actualizadoEn") VALUES
    ('adm1','Operadora','operadora@test.cl','x','ADMIN',${ahora}),
    ('adm2','Operador inactivo','operador2@test.cl','x','ADMIN',${ahora}),
    ('bod1','Bodeguero','bodeguero@test.cl','x','BODEGUERO',${ahora}),
    ('vis1','Visitante','visitante@test.cl','x','VISITANTE',${ahora})`);
  await sql(`UPDATE "usuarios" SET "activo" = false WHERE "id" = 'adm2'`);
  await sql(`INSERT INTO "usuarios_centros" ("usuarioId","centroId") VALUES ('bod1','c1'), ('vis1','c1'), ('vis1','c2'), ('adm1','c1')`);
  await sql(`INSERT INTO "categorias" ("id","nombre") VALUES ('cat1','General')`);
  await sql(`INSERT INTO "insumos" ("id","codigo","nombre","categoriaId","unidadMedida","actualizadoEn") VALUES ('i1','GUA-1','Guantes','cat1','caja',${ahora})`);
  await sql(`INSERT INTO "lotes" ("id","insumoId","numeroLote") VALUES ('l1','i1','L-1')`);
  await sql(`INSERT INTO "existencias" ("id","loteId","ubicacionId","cantidad") VALUES ('e1','l1','u1',30)`);
  await sql(`INSERT INTO "movimientos" ("id","tipo","insumoId","loteId","ubicacionId","centroId","cantidad","saldoPosterior","usuarioId")
    VALUES ('m1','INGRESO','i1','l1','u1','c1',30,30,'bod1')`);
  await sql(`INSERT INTO "parametros_stock" ("id","insumoId","centroId","stockMinimo") VALUES ('p1','i1','c1',10)`);
  // Auditoría histórica: de la institución (movimientos, centros, usuarios no admin) y de red.
  await sql(`INSERT INTO "registros_auditoria" ("id","usuarioId","accion","entidad","entidadId","detalle") VALUES
    ('a1','bod1','MOVIMIENTO_INGRESO','Movimiento','m1','{"cantidad":30}'),
    ('a2','adm1','CENTRO_CREADO','Centro','c1','{}'),
    ('a3','adm1','USUARIO_CREADO','Usuario','bod1','{}'),
    ('a4','adm1','PARAMETROS_STOCK_ACTUALIZADOS','Insumo','i1','{}'),
    ('a5','bod1','LOGIN_OK','Usuario','bod1','{}'),
    ('a6','vis1','REPORTE_EXPORTADO','Reporte','reposicion','{}'),
    ('a7','adm1','LOTE_ACTUALIZADO','Lote','l1','{}'),
    ('r1','adm1','INSUMO_CREADO','Insumo','i1','{}'),
    ('r2','adm1','LOGIN_OK','Usuario','adm1','{}'),
    ('r3',NULL,'LOGIN_FALLIDO','Usuario',NULL,'{"motivo":"email_desconocido"}'),
    ('r4','adm1','USUARIO_CREADO','Usuario','adm2','{}'),
    ('r5','adm1','CATEGORIA_CREADA','Categoria','cat1','{}'),
    ('r6','adm1','PROVEEDOR_CREADO','Proveedor','prov1','{}')`);

  // --- La migración nueva, como en un despliegue ---
  copiarMigracion(NUEVA);
  migrar();
}, 120_000);

afterAll(async () => {
  await temporal?.$disconnect();
  await db.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${nombreBase}"`);
  if (directorio) fs.rmSync(directorio, { recursive: true, force: true });
});

describe("migración de datos al nivel Institución", () => {
  it("crea la institución por defecto y le asigna todos los centros existentes", async () => {
    const instituciones = await consultar<{ id: string; nombre: string; activo: boolean }>(`SELECT "id","nombre","activo" FROM "instituciones"`);
    expect(instituciones).toEqual([{ id: "institucion_inicial", nombre: "Institución principal", activo: true }]);
    const centros = await consultar<{ id: string; institucionId: string }>(`SELECT "id","institucionId" FROM "centros" ORDER BY "id"`);
    expect(centros).toEqual([
      { id: "c1", institucionId: "institucion_inicial" },
      { id: "c2", institucionId: "institucion_inicial" },
    ]);
  });

  it("los ADMIN existentes pasan a ADMIN_RED (sin institución); los demás quedan en la institución por defecto", async () => {
    const usuarios = await consultar<{ id: string; rol: string; institucionId: string | null; activo: boolean }>(
      `SELECT "id","rol"::text AS rol,"institucionId","activo" FROM "usuarios" ORDER BY "id"`,
    );
    expect(usuarios).toEqual([
      { id: "adm1", rol: "ADMIN_RED", institucionId: null, activo: true },
      { id: "adm2", rol: "ADMIN_RED", institucionId: null, activo: false },
      { id: "bod1", rol: "BODEGUERO", institucionId: "institucion_inicial", activo: true },
      { id: "vis1", rol: "VISITANTE", institucionId: "institucion_inicial", activo: true },
    ]);
    // El tipo Rol queda con los cuatro valores, en orden.
    const roles = await consultar<{ rol: string }>(`SELECT unnest(enum_range(NULL::"Rol"))::text AS rol`);
    expect(roles.map((r) => r.rol)).toEqual(["ADMIN_RED", "ADMIN", "BODEGUERO", "VISITANTE"]);
  });

  it("conserva las asignaciones de centros (las de los administradores de la red sobran y se quitan)", async () => {
    const asignaciones = await consultar<{ usuarioId: string; centroId: string }>(
      `SELECT "usuarioId","centroId" FROM "usuarios_centros" ORDER BY "usuarioId","centroId"`,
    );
    expect(asignaciones).toEqual([
      { usuarioId: "bod1", centroId: "c1" },
      { usuarioId: "vis1", centroId: "c1" },
      { usuarioId: "vis1", centroId: "c2" },
    ]);
  });

  it("no se pierde stock, movimientos ni parámetros", async () => {
    const [conteos] = await consultar<Record<string, bigint>>(`SELECT
      (SELECT COUNT(*) FROM "movimientos") AS movimientos,
      (SELECT SUM("cantidad") FROM "existencias") AS unidades,
      (SELECT COUNT(*) FROM "parametros_stock") AS parametros,
      (SELECT COUNT(*) FROM "registros_auditoria") AS auditoria,
      (SELECT COUNT(*) FROM "lotes") AS lotes`);
    expect(Object.fromEntries(Object.entries(conteos!).map(([k, v]) => [k, Number(v)]))).toEqual({
      movimientos: 1, unidades: 30, parametros: 1, auditoria: 13, lotes: 1,
    });
  });

  it("la auditoría histórica se reparte: lo de la institución a ella, lo demás como evento de red", async () => {
    const filas = await consultar<{ id: string; institucionId: string | null; detalle: unknown }>(
      `SELECT "id","institucionId","detalle" FROM "registros_auditoria" ORDER BY "id"`,
    );
    const deInstitucion = filas.filter((f) => f.institucionId === "institucion_inicial").map((f) => f.id);
    const deRed = filas.filter((f) => f.institucionId === null).map((f) => f.id);
    expect(deInstitucion).toEqual(["a1", "a2", "a3", "a4", "a5", "a6", "a7"]);
    expect(deRed).toEqual(["r1", "r2", "r3", "r4", "r5", "r6"]);
    // El contenido de los registros no cambió.
    expect(filas.find((f) => f.id === "a1")!.detalle).toEqual({ cantidad: 30 });
  });

  it("la bitácora sigue siendo inmutable después de la migración (el trigger quedó habilitado)", async () => {
    await expect(sql(`UPDATE "registros_auditoria" SET "institucionId" = NULL WHERE "id" = 'a1'`)).rejects.toThrow(/inmutables/);
    await expect(sql(`DELETE FROM "registros_auditoria" WHERE "id" = 'a1'`)).rejects.toThrow(/inmutables/);
    await expect(sql(`UPDATE "movimientos" SET "cantidad" = 1 WHERE "id" = 'm1'`)).rejects.toThrow(/inmutable/);
    const triggers = await consultar<{ tgname: string; tgenabled: string }>(
      `SELECT "tgname","tgenabled"::text AS tgenabled FROM pg_trigger WHERE "tgrelid" = '"registros_auditoria"'::regclass AND NOT "tgisinternal" ORDER BY 1`,
    );
    expect(triggers).toEqual([
      { tgname: "registros_auditoria_sin_truncate", tgenabled: "O" },
      { tgname: "registros_auditoria_sin_update_ni_delete", tgenabled: "O" },
    ]);
  });

  it("las restricciones nuevas quedan activas: centro sin institución y rol/institución incoherentes se rechazan", async () => {
    await expect(
      sql(`INSERT INTO "centros" ("id","nombre","tipo","direccion","comuna","region","actualizadoEn") VALUES ('c3','Sin institución','OTRO','x','x','x',CURRENT_TIMESTAMP)`),
    ).rejects.toThrow(/23502|institucionId/);
    await expect(
      sql(`INSERT INTO "usuarios" ("id","nombre","email","passwordHash","rol","actualizadoEn") VALUES ('x1','X','x1@test.cl','x','ADMIN',CURRENT_TIMESTAMP)`),
    ).rejects.toThrow(/usuarios_institucion_segun_rol/);
    await expect(sql(`UPDATE "usuarios" SET "institucionId" = 'institucion_inicial' WHERE "id" = 'adm1'`)).rejects.toThrow(
      /usuarios_institucion_segun_rol/,
    );
    await expect(sql(`UPDATE "centros" SET "institucionId" = 'no-existe' WHERE "id" = 'c1'`)).rejects.toThrow(/centros_institucionId_fkey/);
    await expect(sql(`DELETE FROM "instituciones" WHERE "id" = 'institucion_inicial'`)).rejects.toThrow(/fkey/);
  });
});

describe("migración en una base vacía", () => {
  it("la base de tests (migrada desde cero) no trae ninguna institución por defecto", async () => {
    // `limpiarBD` no corre en este archivo: se consulta directo por el id fijo.
    expect(await db.institucion.count({ where: { id: "institucion_inicial" } })).toBe(0);
  });
});
