/**
 * Pruebas de las piezas que dependen de Next (cookies, redirect, sesión de la
 * solicitud). Se simulan `next/headers`, `next/navigation` y `next/cache`; la
 * base de datos y los servicios son los reales.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  cabeceras: new Map<string, string>(),
  borradas: [] as string[],
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nombre: string) => (estado.cookies.has(nombre) ? { name: nombre, value: estado.cookies.get(nombre)! } : undefined),
    has: (nombre: string) => estado.cookies.has(nombre),
    set: (nombre: string, valor: string) => void estado.cookies.set(nombre, valor),
    delete: (nombre: string) => {
      estado.borradas.push(nombre);
      estado.cookies.delete(nombre);
    },
  }),
  headers: async () => ({ get: (nombre: string) => estado.cabeceras.get(nombre.toLowerCase()) ?? null }),
}));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  },
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("REDIRECT:")) throw error;
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
// `cache` de React memoiza por solicitud; fuera de un render no debe memoizar entre tests.
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T,>(f: T) => f }));

import { cambiarCentroActivoAccion } from "@/acciones/auth";
import { existenciasInsumoAccion } from "@/acciones/consultas";
import { corregirVencimientoLoteAccion, registrarIngresoAccion } from "@/acciones/movimientos";
import { iniciarSesion } from "@/server/auth/autenticacion";
import { COOKIE_CENTRO, COOKIE_SESION } from "@/server/auth/constantes";
import { hashearPassword } from "@/server/auth/password";
import { obtenerCentroActivo, obtenerMetaSolicitud, obtenerSesion } from "@/server/auth/sesion";
import { db } from "@/server/db";
import { responderCsv } from "@/server/respuesta-csv";
import { MAXIMO_EXPORTACIONES_POR_MINUTO, registrarIngreso } from "@/server/servicios";
import { crearEscenario, type Escenario } from "./soporte/escenario";

const PASSWORD = "Clave-Segura-2026";
let e: Escenario;

/** Deja la solicitud simulada autenticada como el usuario indicado. */
async function entrarComo(usuarioId: string, cambios: { debeCambiarPassword?: boolean } = {}): Promise<void> {
  const usuario = await db.usuario.update({
    where: { id: usuarioId },
    data: { passwordHash: await hashearPassword(PASSWORD), debeCambiarPassword: cambios.debeCambiarPassword ?? false },
  });
  const { token } = await iniciarSesion(usuario.email, PASSWORD);
  estado.cookies.set(COOKIE_SESION, token);
}

beforeEach(async () => {
  estado.cookies.clear();
  estado.cabeceras.clear();
  estado.borradas.length = 0;
  delete process.env.TRUST_PROXY;
  e = await crearEscenario();
});

describe("M1 — obtenerMetaSolicitud", () => {
  it("sin TRUST_PROXY no confía en X-Forwarded-For; con TRUST_PROXY=1 toma la IP que agregó el proxy", async () => {
    estado.cabeceras.set("x-forwarded-for", "1.1.1.1, 203.0.113.9");
    estado.cabeceras.set("x-real-ip", "9.9.9.9");
    estado.cabeceras.set("user-agent", "U".repeat(600));
    expect((await obtenerMetaSolicitud()).ip).toBeNull();
    process.env.TRUST_PROXY = "1";
    const meta = await obtenerMetaSolicitud();
    expect(meta.ip).toBe("203.0.113.9");
    expect(meta.userAgent).toHaveLength(255);
  });
});

describe("B10 — cambiarCentroActivoAccion", () => {
  it("cambia el centro de un usuario con sesión normal", async () => {
    await entrarComo(e.bodeguero.usuarioId);
    await cambiarCentroActivoAccion(e.centroA);
    expect(estado.cookies.get(COOKIE_CENTRO)).toBe(e.centroA);
  });

  it("no hace nada si el usuario tiene pendiente el cambio de contraseña", async () => {
    await entrarComo(e.bodeguero.usuarioId, { debeCambiarPassword: true });
    await expect(cambiarCentroActivoAccion(e.centroA)).rejects.toThrow("REDIRECT:/cambiar-password");
    expect(estado.cookies.has(COOKIE_CENTRO)).toBe(false);
  });

  it("con una cookie de sesión que ya no vale: la borra y manda a /login", async () => {
    estado.cookies.set(COOKIE_SESION, "t".repeat(43));
    await expect(cambiarCentroActivoAccion(e.centroA)).rejects.toThrow("REDIRECT:/login");
    expect(estado.borradas).toContain(COOKIE_SESION);
    expect(estado.cookies.has(COOKIE_CENTRO)).toBe(false);
  });
});

describe("B-11 — sin centro activo no es lo mismo que toda la red", () => {
  it("distingue al usuario cuyo único centro quedó inactivo del administrador que ve toda la red", async () => {
    await entrarComo(e.bodeguero.usuarioId);
    expect(await obtenerCentroActivo((await obtenerSesion())!)).toMatchObject({
      centroId: e.centroA,
      sinCentro: false,
      puedeVerTodaLaRed: false,
    });

    await db.centro.update({ where: { id: e.centroA }, data: { activo: false } });
    const sinCentro = await obtenerCentroActivo((await obtenerSesion())!);
    expect(sinCentro).toMatchObject({ centroId: null, centro: null, centros: [], sinCentro: true, puedeVerTodaLaRed: false });

    // El administrador también tiene centroId null ("Toda la red"), pero NO está sin centro.
    estado.cookies.clear();
    await entrarComo(e.admin.usuarioId);
    expect(await obtenerCentroActivo((await obtenerSesion())!)).toMatchObject({
      centroId: null,
      sinCentro: false,
      puedeVerTodaLaRed: true,
    });
  });
});

describe("B10 — las acciones descartan la cookie de una sesión inválida", () => {
  it("accionSegura responde NO_AUTENTICADO y borra la cookie inválida, pero no una válida", async () => {
    estado.cookies.set(COOKIE_SESION, "z".repeat(43));
    const r = await existenciasInsumoAccion({ insumoId: e.dializador });
    expect(r).toMatchObject({ ok: false, codigo: "NO_AUTENTICADO" });
    expect(estado.borradas).toEqual([COOKIE_SESION]);

    estado.borradas.length = 0;
    await entrarComo(e.visitante.usuarioId);
    expect((await existenciasInsumoAccion({ insumoId: e.dializador })).ok).toBe(true);
    expect(estado.borradas).toEqual([]);
  });
});

describe("B1 — existenciasInsumoAccion", () => {
  it("entrega lotesRegistrados solo a quien puede registrar ingresos, y solo los de sus centros", async () => {
    await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "EN-A", fechaVencimiento: e.dia(100), cantidad: 5 });
    await registrarIngreso(e.bodegueroB, { ubicacionId: e.bodegaB, insumoId: e.dializador, numeroLote: "EN-B", fechaVencimiento: e.dia(200), cantidad: 5 });

    await entrarComo(e.visitante.usuarioId);
    const visitante = await existenciasInsumoAccion({ insumoId: e.dializador });
    expect(visitante.ok && visitante.datos.lotesRegistrados).toEqual([]);
    expect(visitante.ok && visitante.datos.existencias.map((x) => x.numeroLote)).toEqual(["EN-A"]);

    await entrarComo(e.bodeguero.usuarioId);
    const bodeguero = await existenciasInsumoAccion({ insumoId: e.dializador });
    expect(bodeguero.ok && bodeguero.datos.lotesRegistrados.map((l) => l.numeroLote)).toEqual(["EN-A"]);

    await entrarComo(e.admin.usuarioId);
    const admin = await existenciasInsumoAccion({ insumoId: e.dializador });
    expect(admin.ok && admin.datos.lotesRegistrados.map((l) => l.numeroLote).sort()).toEqual(["EN-A", "EN-B"]);
  });
});

describe("B2 / B6 — acciones de movimientos", () => {
  it("corregirVencimientoLoteAccion: el bodeguero no pasa el filtro de permiso; el ADMIN sí", async () => {
    const ing = await registrarIngreso(e.bodeguero, { ubicacionId: e.bodegaA, insumoId: e.dializador, numeroLote: "X-1", fechaVencimiento: e.dia(100), cantidad: 5 });
    const entrada = { loteId: ing.movimiento.loteId, fechaVencimiento: e.dia(120), motivo: "Corrección" };
    await entrarComo(e.bodeguero.usuarioId);
    expect(await corregirVencimientoLoteAccion(entrada)).toMatchObject({ ok: false, codigo: "SIN_PERMISO" });
    await entrarComo(e.admin.usuarioId);
    expect(await corregirVencimientoLoteAccion(entrada)).toMatchObject({ ok: true, datos: { cambiado: true, fechaVencimiento: e.dia(120) } });
  });

  it("doble envío de la acción de ingreso con la misma clave: un solo movimiento", async () => {
    await entrarComo(e.bodeguero.usuarioId);
    const entrada = {
      ubicacionId: e.bodegaA, insumoId: e.guantes, numeroLote: "DOBLE", fechaVencimiento: e.dia(90), cantidad: "12",
      claveIdempotencia: "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b",
    };
    const [a, b] = await Promise.all([registrarIngresoAccion(entrada), registrarIngresoAccion(entrada)]);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.datos.movimiento.id).toBe(b.datos.movimiento.id);
      expect([a.datos.repetido, b.datos.repetido].sort()).toEqual([false, true]);
      expect(a.datos.stock?.disponibleUbicacion).toBe(12);
    }
    expect(await db.movimiento.count()).toBe(1);
    expect(await registrarIngresoAccion({ ...entrada, claveIdempotencia: "no-uuid" })).toMatchObject({ ok: false, codigo: "VALIDACION" });
  });
});

describe("exportaciones — límite por usuario", () => {
  const exportacion = async () => ({
    archivo: "prueba.csv",
    encabezados: ["A"],
    filas: (async function* () {
      yield ["1"];
    })(),
  });

  it("sin sesión responde 401 y con cambio de contraseña pendiente 403", async () => {
    expect((await responderCsv(exportacion)).status).toBe(401);
    await entrarComo(e.admin.usuarioId, { debeCambiarPassword: true });
    expect((await responderCsv(exportacion)).status).toBe(403);
  });

  it("tras N descargas en un minuto responde 429 con Retry-After, sin afectar a otros usuarios", async () => {
    await entrarComo(e.admin.usuarioId);
    for (let i = 0; i < MAXIMO_EXPORTACIONES_POR_MINUTO; i++) {
      const r = await responderCsv(exportacion);
      expect(r.status, `descarga ${i + 1}`).toBe(200);
      expect(await r.text()).toContain("A");
    }
    let preparadas = 0;
    const bloqueada = await responderCsv(async () => {
      preparadas++;
      return exportacion();
    });
    expect(bloqueada.status).toBe(429);
    expect(Number(bloqueada.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(preparadas).toBe(0);

    await entrarComo(e.bodeguero.usuarioId);
    expect((await responderCsv(exportacion)).status).toBe(200);
  });

  it("avisa en la cabecera cuando la exportación quedó truncada", async () => {
    await entrarComo(e.admin.usuarioId);
    const r = await responderCsv(async () => ({ ...(await exportacion()), truncada: true }));
    expect(r.headers.get("X-Exportacion-Truncada")).toBe("1");
    expect((await responderCsv(exportacion)).headers.get("X-Exportacion-Truncada")).toBeNull();
  });
});
