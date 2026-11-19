import { beforeEach, describe, expect, it } from "vitest";
import {
  cambiarPassword,
  cerrarSesionPorToken,
  hashearToken,
  iniciarSesion,
  MENSAJE_CREDENCIALES,
  validarTokenSesion,
} from "@/server/auth/autenticacion";
import {
  BLOQUEO_MS,
  DURACION_SESION_MS,
  MAX_INTENTOS_FALLIDOS,
  VIDA_MAXIMA_SESION_MS,
} from "@/server/auth/constantes";
import { hashearPassword, verificarPassword } from "@/server/auth/password";
import { db } from "@/server/db";
import { establecerUsuarioActivo } from "@/server/servicios";
import { crearEscenario, esperarError, type Escenario } from "./soporte/escenario";

const PASSWORD = "Clave-Segura-2026";
let e: Escenario;
let usuarioId: string;

beforeEach(async () => {
  e = await crearEscenario();
  const u = await db.usuario.create({
    data: {
      nombre: "Ana Pérez",
      email: "ana@test.cl",
      passwordHash: await hashearPassword(PASSWORD),
      rol: "BODEGUERO",
      institucionId: e.institucion,
      debeCambiarPassword: true,
      centros: { create: [{ centroId: e.centroA }] },
    },
  });
  usuarioId = u.id;
});

describe("contraseñas", () => {
  it("usa argon2id y verifica correctamente", async () => {
    const hash = await hashearPassword("otra-clave-123");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verificarPassword(hash, "otra-clave-123")).toBe(true);
    expect(await verificarPassword(hash, "otra-clave-124")).toBe(false);
    expect(await verificarPassword("no-es-un-hash", "x")).toBe(false);
  });
});

describe("inicio de sesión", () => {
  it("crea la sesión guardando solo el hash del token", async () => {
    const r = await iniciarSesion("  ANA@Test.cl ", PASSWORD, { ip: "10.0.0.1", userAgent: "vitest" });
    expect(r.usuario).toMatchObject({ email: "ana@test.cl", rol: "BODEGUERO", debeCambiarPassword: true, centroIds: [e.centroA] });
    expect(r.token.length).toBeGreaterThanOrEqual(40);

    const sesiones = await db.sesion.findMany();
    expect(sesiones).toHaveLength(1);
    expect(sesiones[0]!.tokenHash).toBe(hashearToken(r.token));
    expect(sesiones[0]!.tokenHash).not.toContain(r.token);
    expect(sesiones[0]!.ip).toBe("10.0.0.1");

    const usuario = await db.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    expect(usuario.ultimoAcceso).not.toBeNull();
    expect(await db.registroAuditoria.count({ where: { accion: "LOGIN_OK" } })).toBe(1);
  });

  it("responde con el mismo mensaje si el email no existe o la clave es incorrecta", async () => {
    const a = await esperarError(iniciarSesion("nadie@test.cl", PASSWORD), "CREDENCIALES_INVALIDAS");
    const b = await esperarError(iniciarSesion("ana@test.cl", "incorrecta-123"), "CREDENCIALES_INVALIDAS");
    expect(a.message).toBe(MENSAJE_CREDENCIALES);
    expect(b.message).toBe(MENSAJE_CREDENCIALES);
    expect(await db.sesion.count()).toBe(0);
  });

  it("bloquea temporalmente tras varios intentos fallidos, con el mismo mensaje", async () => {
    for (let i = 0; i < MAX_INTENTOS_FALLIDOS; i++) {
      await esperarError(iniciarSesion("ana@test.cl", "mala-clave-000"), "CREDENCIALES_INVALIDAS");
    }
    const bloqueado = await db.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    expect(bloqueado.bloqueadoHasta).not.toBeNull();

    // Ni con la clave correcta puede entrar mientras dure el bloqueo.
    const error = await esperarError(iniciarSesion("ana@test.cl", PASSWORD), "CREDENCIALES_INVALIDAS");
    expect(error.message).toBe(MENSAJE_CREDENCIALES);
    expect(await db.registroAuditoria.count({ where: { accion: "LOGIN_BLOQUEADO" } })).toBe(1);

    // Pasado el bloqueo vuelve a entrar y se limpian los contadores.
    const despues = new Date(Date.now() + BLOQUEO_MS + 1000);
    await iniciarSesion("ana@test.cl", PASSWORD, {}, despues);
    const limpio = await db.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    expect(limpio).toMatchObject({ intentosFallidos: 0, bloqueadoHasta: null });
  });

  it("un usuario inactivo no puede iniciar sesión", async () => {
    await db.usuario.update({ where: { id: usuarioId }, data: { activo: false } });
    const error = await esperarError(iniciarSesion("ana@test.cl", PASSWORD), "CREDENCIALES_INVALIDAS");
    expect(error.message).toBe(MENSAJE_CREDENCIALES);
  });
});

describe("sesiones", () => {
  it("valida el token y rechaza tokens desconocidos o manipulados", async () => {
    const { token } = await iniciarSesion("ana@test.cl", PASSWORD);
    const sesion = await validarTokenSesion(token);
    expect(sesion?.usuario).toMatchObject({ id: usuarioId, rol: "BODEGUERO" });
    expect(await validarTokenSesion(`${token}x`)).toBeNull();
    expect(await validarTokenSesion("")).toBeNull();
    expect(await validarTokenSesion(undefined)).toBeNull();
  });

  it("expiración deslizante: el uso extiende la sesión; sin uso, expira", async () => {
    const t0 = new Date();
    const { token, expiraEn } = await iniciarSesion("ana@test.cl", PASSWORD, {}, t0);
    expect(expiraEn.getTime()).toBe(t0.getTime() + DURACION_SESION_MS);

    const enUso = new Date(t0.getTime() + DURACION_SESION_MS / 2);
    const renovada = await validarTokenSesion(token, enUso);
    expect(renovada?.expiraEn.getTime()).toBe(enUso.getTime() + DURACION_SESION_MS);

    const aunVigente = new Date(t0.getTime() + DURACION_SESION_MS + 60_000);
    expect(await validarTokenSesion(token, aunVigente)).not.toBeNull();

    const abandonada = new Date(aunVigente.getTime() + DURACION_SESION_MS + 1000);
    expect(await validarTokenSesion(token, abandonada)).toBeNull();
    expect(await db.sesion.count()).toBe(0);
  });

  it("tiene una vida máxima absoluta aunque se use continuamente", async () => {
    const t0 = new Date();
    const { token } = await iniciarSesion("ana@test.cl", PASSWORD, {}, t0);
    let ahora = t0;
    while (ahora.getTime() + DURACION_SESION_MS / 2 < t0.getTime() + VIDA_MAXIMA_SESION_MS) {
      ahora = new Date(ahora.getTime() + DURACION_SESION_MS / 2);
      const s = await validarTokenSesion(token, ahora);
      expect(s).not.toBeNull();
      expect(s!.expiraEn.getTime()).toBeLessThanOrEqual(t0.getTime() + VIDA_MAXIMA_SESION_MS);
    }
    expect(await validarTokenSesion(token, new Date(t0.getTime() + VIDA_MAXIMA_SESION_MS + 1))).toBeNull();
  });

  it("cerrar sesión invalida el token", async () => {
    const { token } = await iniciarSesion("ana@test.cl", PASSWORD);
    await cerrarSesionPorToken(token);
    expect(await validarTokenSesion(token)).toBeNull();
    expect(await db.registroAuditoria.count({ where: { accion: "LOGOUT" } })).toBe(1);
  });

  it("desactivar un usuario invalida todas sus sesiones de inmediato", async () => {
    const a = await iniciarSesion("ana@test.cl", PASSWORD);
    const b = await iniciarSesion("ana@test.cl", PASSWORD);
    const r = await establecerUsuarioActivo(e.admin, usuarioId, false);
    expect(r.sesionesCerradas).toBe(2);
    expect(await validarTokenSesion(a.token)).toBeNull();
    expect(await validarTokenSesion(b.token)).toBeNull();
    expect(await db.registroAuditoria.count({ where: { accion: "USUARIO_DESACTIVADO" } })).toBe(1);
    await esperarError(establecerUsuarioActivo(e.admin, e.admin.usuarioId, false), "OPERACION_INVALIDA");
  });

  it("una sesión existente deja de valer si el usuario queda inactivo por otra vía", async () => {
    const { token } = await iniciarSesion("ana@test.cl", PASSWORD);
    await db.usuario.update({ where: { id: usuarioId }, data: { activo: false } });
    expect(await validarTokenSesion(token)).toBeNull();
  });
});

describe("cambio de contraseña", () => {
  it("aplica la política mínima y exige la contraseña actual", async () => {
    await esperarError(cambiarPassword(usuarioId, { actual: "no-es-la-actual", nueva: "Nueva-Clave-2027" }), "PASSWORD_ACTUAL_INCORRECTA");
    await esperarError(cambiarPassword(usuarioId, { actual: PASSWORD, nueva: "corta1" }), "PASSWORD_DEBIL");
    await esperarError(cambiarPassword(usuarioId, { actual: PASSWORD, nueva: "sololetrassinnumero" }), "PASSWORD_DEBIL");
    await esperarError(cambiarPassword(usuarioId, { actual: PASSWORD, nueva: PASSWORD }), "PASSWORD_DEBIL");
    await esperarError(cambiarPassword(usuarioId, { actual: PASSWORD, nueva: "ana-12345678" }), "PASSWORD_DEBIL");
  });

  it("cambia la clave, apaga debeCambiarPassword y cierra las otras sesiones", async () => {
    const actual = await iniciarSesion("ana@test.cl", PASSWORD);
    const otra = await iniciarSesion("ana@test.cl", PASSWORD);
    const sesionActual = await validarTokenSesion(actual.token);

    await cambiarPassword(usuarioId, { actual: PASSWORD, nueva: "Nueva-Clave-2027" }, { sesionActualId: sesionActual!.sesionId });

    const usuario = await db.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    expect(usuario.debeCambiarPassword).toBe(false);
    expect(await validarTokenSesion(actual.token)).not.toBeNull();
    expect(await validarTokenSesion(otra.token)).toBeNull();
    await esperarError(iniciarSesion("ana@test.cl", PASSWORD), "CREDENCIALES_INVALIDAS");
    expect((await iniciarSesion("ana@test.cl", "Nueva-Clave-2027")).usuario.debeCambiarPassword).toBe(false);
    expect(await db.registroAuditoria.count({ where: { accion: "PASSWORD_CAMBIADA" } })).toBe(1);
  });
});
