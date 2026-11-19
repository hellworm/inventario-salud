import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { proxy } from "@/proxy";
import {
  cambiarPassword,
  iniciarSesion,
  limpiarIntentosVencidos,
  MENSAJE_CREDENCIALES,
  retardoGlobalMs,
  validarTokenSesion,
} from "@/server/auth/autenticacion";
import {
  BLOQUEO_MS,
  COOKIE_SESION,
  MAX_AUDITORIA_LOGIN_POR_MINUTO,
  MAX_INTENTOS_FALLIDOS,
  MAX_INTENTOS_PASSWORD_ACTUAL,
  MAX_INTENTOS_POR_IP,
  opcionesCookieSesion,
  RETARDO_GLOBAL_BASE_MS,
  RETARDO_GLOBAL_MAXIMO_MS,
  UMBRAL_BLOQUEO_GLOBAL,
  VENTANA_PASSWORD_ACTUAL_MS,
  VIDA_MAXIMA_SESION_MS,
  VIGENCIA_PASSWORD_TEMPORAL_MS,
} from "@/server/auth/constantes";
import {
  extraerIpCliente,
  LARGO_MAXIMO_USER_AGENT,
  metaDeCabeceras,
  normalizarIp,
  proxiesDeConfianza,
} from "@/server/auth/meta-solicitud";
import {
  estadoSemaforoArgon2,
  hashearPassword,
  MAX_ARGON2_SIMULTANEOS,
  verificarPassword,
} from "@/server/auth/password";
import { db } from "@/server/db";
import { analizarEntorno } from "@/server/entorno";
import { consumirLimite } from "@/server/limitador";
import {
  crearUsuario,
  desbloquearUsuario,
  listarUsuarios,
  restablecerPasswordUsuario,
} from "@/server/servicios";
import { crearEscenario, esperarError, type Escenario } from "./soporte/escenario";

const PASSWORD = "Clave-Segura-2026";
const IP_A = "203.0.113.10";
const IP_B = "198.51.100.20";
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
      debeCambiarPassword: false,
      centros: { create: [{ centroId: e.centroA }] },
    },
  });
  usuarioId = u.id;
});

const fallar = (email: string, ip: string | null, ahora?: Date) =>
  esperarError(iniciarSesion(email, "clave-incorrecta-000", { ip }, ahora), "CREDENCIALES_INVALIDAS");

describe("M1 — IP y user-agent de la solicitud", () => {
  it("sin proxies de confianza no hay IP, diga lo que diga X-Forwarded-For", () => {
    expect(extraerIpCliente("1.2.3.4", 0)).toBeNull();
    expect(metaDeCabeceras(new Headers({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8" }), 0).ip).toBeNull();
  });

  it("toma la IP contando desde la derecha según los proxies de confianza, nunca la primera", () => {
    // El cliente inventó "1.1.1.1"; el proxy de confianza agregó la IP real al final.
    expect(extraerIpCliente("1.1.1.1, 203.0.113.7", 1)).toBe("203.0.113.7");
    expect(extraerIpCliente("1.1.1.1, 203.0.113.7, 10.0.0.2", 2)).toBe("203.0.113.7");
    expect(extraerIpCliente("203.0.113.7", 1)).toBe("203.0.113.7");
    // Menos saltos que proxies declarados: configuración incoherente → sin IP.
    expect(extraerIpCliente("203.0.113.7", 2)).toBeNull();
  });

  it("valida con net.isIP, normaliza y descarta lo que no es una IP", () => {
    expect(extraerIpCliente("1.1.1.1, <script>alert(1)</script>", 1)).toBeNull();
    expect(extraerIpCliente("1.1.1.1, 999.1.1.1", 1)).toBeNull();
    expect(extraerIpCliente(`1.1.1.1, ${"9".repeat(500)}`, 1)).toBeNull();
    expect(extraerIpCliente("x".repeat(5000), 1)).toBeNull();
    expect(normalizarIp("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(normalizarIp("[2001:DB8::1]")).toBe("2001:db8::1");
    expect(normalizarIp("")).toBeNull();
    expect(normalizarIp("localhost")).toBeNull();
  });

  it("ignora X-Real-IP y trunca el user-agent a 255 caracteres", () => {
    const cabeceras = new Headers({ "x-real-ip": "5.6.7.8", "user-agent": "A".repeat(1000) });
    const meta = metaDeCabeceras(cabeceras, 1);
    expect(meta.ip).toBeNull();
    expect(meta.userAgent).toHaveLength(LARGO_MAXIMO_USER_AGENT);
    expect(metaDeCabeceras(new Headers(), 1)).toEqual({ ip: null, userAgent: null });
  });

  it("TRUST_PROXY: se interpreta y se valida en el entorno", () => {
    expect(proxiesDeConfianza(undefined)).toBe(0);
    expect(proxiesDeConfianza("")).toBe(0);
    expect(proxiesDeConfianza("1")).toBe(1);
    expect(proxiesDeConfianza("true")).toBe(0);
    expect(proxiesDeConfianza("-1")).toBe(0);
    const url = "postgresql://u:UnaClaveLargaYAleatoria99@localhost:5432/base?schema=public";
    expect(analizarEntorno({ DATABASE_URL: url })).toMatchObject({ ok: true, entorno: { TRUST_PROXY: 0 } });
    expect(analizarEntorno({ DATABASE_URL: url, TRUST_PROXY: "2" })).toMatchObject({ ok: true, entorno: { TRUST_PROXY: 2 } });
    for (const valor of ["si", "-1", "11", "1.5"]) {
      expect(analizarEntorno({ DATABASE_URL: url, TRUST_PROXY: valor }).ok, valor).toBe(false);
    }
  });

  it("la sesión guarda el user-agent truncado", async () => {
    await iniciarSesion("ana@test.cl", PASSWORD, { ip: IP_A, userAgent: "B".repeat(900) });
    const sesion = await db.sesion.findFirstOrThrow();
    expect(sesion.userAgent).toHaveLength(LARGO_MAXIMO_USER_AGENT);
    expect(sesion.ip).toBe(IP_A);
  });
});

describe("M2 — límites de intentos de inicio de sesión", () => {
  it("por IP: tras 20 intentos con cualquier email se rechaza todo desde esa IP, sin tocar otras IP", async () => {
    for (let i = 0; i < MAX_INTENTOS_POR_IP; i++) await fallar(`nadie${i}@test.cl`, IP_A);
    // Ni con credenciales correctas: el límite se evalúa antes de verificar la contraseña.
    const error = await esperarError(iniciarSesion("ana@test.cl", PASSWORD, { ip: IP_A }), "CREDENCIALES_INVALIDAS");
    expect(error.message).toBe(MENSAJE_CREDENCIALES);
    expect(await db.registroAuditoria.count({ where: { accion: "LOGIN_BLOQUEADO", ip: IP_A } })).toBe(1);
    // Otra IP no se ve afectada.
    await iniciarSesion("ana@test.cl", PASSWORD, { ip: IP_B });
    // Pasada la ventana, la IP vuelve a poder entrar.
    await iniciarSesion("ana@test.cl", PASSWORD, { ip: IP_A }, new Date(Date.now() + 5 * 60_000 + 1000));
  });

  it("un ingreso correcto no consume el cupo de la IP", async () => {
    for (let i = 0; i < MAX_INTENTOS_POR_IP + 5; i++) await iniciarSesion("ana@test.cl", PASSWORD, { ip: IP_A });
    expect(await db.sesion.count()).toBe(MAX_INTENTOS_POR_IP + 5);
  });

  it("por par IP + email: un tercero no deja fuera al titular que entra desde otra IP", async () => {
    for (let i = 0; i < MAX_INTENTOS_FALLIDOS; i++) await fallar("ana@test.cl", IP_A);
    // Desde la IP atacante queda bloqueado (aunque acierte la clave)…
    const error = await esperarError(iniciarSesion("ana@test.cl", PASSWORD, { ip: IP_A }), "CREDENCIALES_INVALIDAS");
    expect(error.message).toBe(MENSAJE_CREDENCIALES);
    // …pero la cuenta NO quedó bloqueada: el titular entra desde su IP.
    const usuario = await db.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    expect(usuario.bloqueadoHasta).toBeNull();
    const ok = await iniciarSesion("ana@test.cl", PASSWORD, { ip: IP_B });
    expect(ok.usuario.id).toBe(usuarioId);
    // El bloqueo del par dura BLOQUEO_MS desde el último fallo y luego se levanta.
    await iniciarSesion("ana@test.cl", PASSWORD, { ip: IP_A }, new Date(Date.now() + BLOQUEO_MS + 1000));
  });

  it("con el par bloqueado no se vuelve a verificar la contraseña (no suma fallos)", async () => {
    for (let i = 0; i < MAX_INTENTOS_FALLIDOS; i++) await fallar("ana@test.cl", IP_A);
    const antes = await db.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    for (let i = 0; i < 4; i++) await fallar("ana@test.cl", IP_A);
    const despues = await db.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    expect(antes.intentosFallidos).toBe(MAX_INTENTOS_FALLIDOS);
    expect(despues.intentosFallidos).toBe(MAX_INTENTOS_FALLIDOS);
  });

  it("bloqueo global: solo tras un umbral alto, progresivo y acotado, y no aplica a la IP habitual del titular", async () => {
    // El titular ya entró alguna vez desde su IP habitual.
    await iniciarSesion("ana@test.cl", PASSWORD, { ip: IP_B });
    // Ataque distribuido: muchas IP, cada una bajo su límite de par.
    const t0 = new Date();
    let fallos = 0;
    for (let n = 0; fallos < UMBRAL_BLOQUEO_GLOBAL; n++) {
      for (let i = 0; i < MAX_INTENTOS_FALLIDOS && fallos < UMBRAL_BLOQUEO_GLOBAL; i++, fallos++) {
        await fallar("ana@test.cl", `192.0.2.${n + 1}`, t0);
        if (fallos < UMBRAL_BLOQUEO_GLOBAL - 1) {
          const u = await db.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
          expect(u.bloqueadoHasta, `fallo ${fallos + 1}`).toBeNull();
        }
      }
    }
    const bloqueado = await db.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    expect(bloqueado.bloqueadoHasta?.getTime()).toBe(t0.getTime() + RETARDO_GLOBAL_BASE_MS);

    // Una IP nueva queda retenida aunque acierte la clave…
    await esperarError(iniciarSesion("ana@test.cl", PASSWORD, { ip: "192.0.2.200" }, t0), "CREDENCIALES_INVALIDAS");
    // …pero el titular, desde su IP habitual, entra igual y limpia el contador.
    await iniciarSesion("ana@test.cl", PASSWORD, { ip: IP_B }, t0);
    const limpio = await db.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    expect(limpio).toMatchObject({ intentosFallidos: 0, bloqueadoHasta: null });
  });

  it("el retardo global crece de forma progresiva y nunca supera el máximo", () => {
    expect(retardoGlobalMs(UMBRAL_BLOQUEO_GLOBAL - 1)).toBe(0);
    expect(retardoGlobalMs(UMBRAL_BLOQUEO_GLOBAL)).toBe(RETARDO_GLOBAL_BASE_MS);
    expect(retardoGlobalMs(UMBRAL_BLOQUEO_GLOBAL + 1)).toBe(RETARDO_GLOBAL_BASE_MS * 2);
    expect(retardoGlobalMs(UMBRAL_BLOQUEO_GLOBAL + 2)).toBe(RETARDO_GLOBAL_BASE_MS * 4);
    expect(retardoGlobalMs(UMBRAL_BLOQUEO_GLOBAL + 50)).toBe(RETARDO_GLOBAL_MAXIMO_MS);
    expect(retardoGlobalMs(1_000_000)).toBe(RETARDO_GLOBAL_MAXIMO_MS);
  });

  it("«desbloquear» del ADMIN levanta también los bloqueos por IP + email", async () => {
    for (let i = 0; i < MAX_INTENTOS_FALLIDOS; i++) await fallar("ana@test.cl", IP_A);
    await esperarError(iniciarSesion("ana@test.cl", PASSWORD, { ip: IP_A }), "CREDENCIALES_INVALIDAS");

    const lista = await listarUsuarios(e.admin, { texto: "ana@test.cl" });
    expect(lista.items[0]).toMatchObject({ id: usuarioId, bloqueado: true });
    expect(lista.items[0]!.bloqueadoHasta).not.toBeNull();

    await desbloquearUsuario(e.admin, usuarioId);
    expect(await db.registroAuditoria.count({ where: { accion: "USUARIO_DESBLOQUEADO" } })).toBe(1);
    await iniciarSesion("ana@test.cl", PASSWORD, { ip: IP_A });
    expect((await listarUsuarios(e.admin, { texto: "ana@test.cl" })).items[0]!.bloqueado).toBe(false);
  });

  it("sin IP confiable el límite degrada a un bloqueo por cuenta, visible para el ADMIN", async () => {
    for (let i = 0; i < MAX_INTENTOS_FALLIDOS; i++) await fallar("ana@test.cl", null);
    const usuario = await db.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    expect(usuario.bloqueadoHasta).not.toBeNull();
    await esperarError(iniciarSesion("ana@test.cl", PASSWORD), "CREDENCIALES_INVALIDAS");
    await desbloquearUsuario(e.admin, usuarioId);
    await iniciarSesion("ana@test.cl", PASSWORD);
  });

  it("no inunda la auditoría: máximo N fallos por IP y minuto; el resto se agrega en un resumen", async () => {
    const t0 = new Date();
    const extra = 6;
    for (let i = 0; i < MAX_AUDITORIA_LOGIN_POR_MINUTO + extra; i++) await fallar(`x${i}@test.cl`, IP_A, t0);
    expect(await db.registroAuditoria.count({ where: { accion: "LOGIN_FALLIDO" } })).toBe(MAX_AUDITORIA_LOGIN_POR_MINUTO);
    expect(await db.registroAuditoria.count({ where: { accion: "LOGIN_FALLIDO_AGREGADO" } })).toBe(0);

    // El resumen lo escribe el mantenimiento (o el primer fallo de la ventana siguiente).
    const r = await limpiarIntentosVencidos(new Date(t0.getTime() + 61_000));
    expect(r.resumenesEscritos).toBe(1);
    const resumen = await db.registroAuditoria.findFirstOrThrow({ where: { accion: "LOGIN_FALLIDO_AGREGADO" } });
    expect(resumen.ip).toBe(IP_A);
    expect(resumen.detalle).toMatchObject({ omitidos: extra });
  });

  it("el resumen también se escribe al empezar la ventana siguiente desde la misma IP", async () => {
    const t0 = new Date();
    for (let i = 0; i < MAX_AUDITORIA_LOGIN_POR_MINUTO + 3; i++) await fallar(`x${i}@test.cl`, IP_A, t0);
    await fallar("otro@test.cl", IP_A, new Date(t0.getTime() + 61_000));
    const resumen = await db.registroAuditoria.findFirstOrThrow({ where: { accion: "LOGIN_FALLIDO_AGREGADO" } });
    expect(resumen.detalle).toMatchObject({ omitidos: 3 });
    expect(await db.registroAuditoria.count({ where: { accion: "LOGIN_FALLIDO" } })).toBe(MAX_AUDITORIA_LOGIN_POR_MINUTO + 1);
  });

  it("el mantenimiento borra los contadores vencidos y conserva los vigentes", async () => {
    await fallar("ana@test.cl", IP_A);
    expect(await db.limiteIntentos.count()).toBeGreaterThan(0);
    await limpiarIntentosVencidos(new Date());
    expect(await db.limiteIntentos.count()).toBeGreaterThan(0);
    const r = await limpiarIntentosVencidos(new Date(Date.now() + BLOQUEO_MS + 60_000));
    expect(r.contadoresEliminados).toBeGreaterThan(0);
    expect(await db.limiteIntentos.count()).toBe(0);
  });

  it("el limitador es atómico: 40 consumos simultáneos cuentan exactamente 40", async () => {
    const regla = { tipo: "EXPORTACION" as const, identificador: "u1", maximo: 10, ventanaMs: 60_000 };
    const estados = await Promise.all(Array.from({ length: 40 }, () => consumirLimite(regla)));
    expect(estados.map((s) => s.cuenta).sort((a, b) => a - b)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(estados.filter((s) => s.excedido)).toHaveLength(30);
    expect(await db.limiteIntentos.count()).toBe(1);
    // La clave se guarda como hash: no contiene el identificador.
    const fila = await db.limiteIntentos.findFirstOrThrow();
    expect(fila.clave).toMatch(/^[0-9a-f]{64}$/);
  });

  it("no guarda emails en claro en la tabla del limitador", async () => {
    await fallar("secreto-tecleado@test.cl", IP_A);
    const filas = await db.limiteIntentos.findMany();
    expect(JSON.stringify(filas)).not.toContain("secreto-tecleado");
  });

  it("argon2 nunca corre con más operaciones simultáneas que el tope del semáforo", async () => {
    const hash = await hashearPassword("otra-clave-123");
    let maximoEnCola = 0;
    const tareas = Array.from({ length: 14 }, () => verificarPassword(hash, "otra-clave-123"));
    maximoEnCola = estadoSemaforoArgon2().enCola;
    expect(estadoSemaforoArgon2().enCurso).toBe(MAX_ARGON2_SIMULTANEOS);
    expect(maximoEnCola).toBe(14 - MAX_ARGON2_SIMULTANEOS);
    expect((await Promise.all(tareas)).every(Boolean)).toBe(true);
    expect(estadoSemaforoArgon2()).toMatchObject({ enCurso: 0, enCola: 0 });
    expect(estadoSemaforoArgon2().maximoObservado).toBeLessThanOrEqual(MAX_ARGON2_SIMULTANEOS);
  });
});

describe("B10 — contraseñas temporales, cambio de contraseña y cookie", () => {
  it("la contraseña temporal de un usuario nuevo vence a las 72 horas, con el mensaje genérico", async () => {
    const creado = await crearUsuario(e.admin, {
      nombre: "Nueva Persona",
      email: "nueva@test.cl",
      rol: "VISITANTE",
      centroIds: [e.centroA],
    });
    const fila = await db.usuario.findUniqueOrThrow({ where: { id: creado.id } });
    const restante = fila.passwordTemporalExpira!.getTime() - Date.now();
    expect(restante).toBeGreaterThan(VIGENCIA_PASSWORD_TEMPORAL_MS - 60_000);
    expect(restante).toBeLessThanOrEqual(VIGENCIA_PASSWORD_TEMPORAL_MS);
    expect(creado.passwordTemporalExpira.getTime()).toBe(fila.passwordTemporalExpira!.getTime());

    // Dentro del plazo entra (y debe cambiarla).
    const dentro = new Date(Date.now() + VIGENCIA_PASSWORD_TEMPORAL_MS - 3_600_000);
    expect((await iniciarSesion("nueva@test.cl", creado.passwordTemporal, {}, dentro)).usuario.debeCambiarPassword).toBe(true);

    // Vencida: mismo mensaje que una clave incorrecta, sin sesión nueva.
    const vencida = new Date(Date.now() + VIGENCIA_PASSWORD_TEMPORAL_MS + 60_000);
    const sesionesAntes = await db.sesion.count();
    const error = await esperarError(
      iniciarSesion("nueva@test.cl", creado.passwordTemporal, {}, vencida),
      "CREDENCIALES_INVALIDAS",
    );
    expect(error.message).toBe(MENSAJE_CREDENCIALES);
    expect(await db.sesion.count()).toBe(sesionesAntes);
    const auditoria = await db.registroAuditoria.findFirstOrThrow({
      where: { accion: "LOGIN_FALLIDO", entidadId: creado.id },
      orderBy: { creadoEn: "desc" },
    });
    expect(auditoria.detalle).toMatchObject({ motivo: "password_temporal_vencida" });

    // El ADMIN la ve vencida y puede restablecerla: la nueva vuelve a servir.
    await db.usuario.update({ where: { id: creado.id }, data: { passwordTemporalExpira: new Date(Date.now() - 1000) } });
    const lista = await listarUsuarios(e.admin, { texto: "nueva@test.cl" });
    expect(lista.items[0]).toMatchObject({ passwordTemporalVencida: true });
    const nueva = await restablecerPasswordUsuario(e.admin, creado.id);
    await esperarError(iniciarSesion("nueva@test.cl", creado.passwordTemporal), "CREDENCIALES_INVALIDAS");
    expect((await iniciarSesion("nueva@test.cl", nueva.passwordTemporal)).usuario.debeCambiarPassword).toBe(true);
  });

  it("una contraseña definitiva no vence y cambiarla borra el vencimiento", async () => {
    const creado = await crearUsuario(e.admin, { nombre: "Otra Persona", email: "otra@test.cl", rol: "VISITANTE", centroIds: [e.centroA] });
    await cambiarPassword(creado.id, { actual: creado.passwordTemporal, nueva: "Definitiva-2027-x" });
    const fila = await db.usuario.findUniqueOrThrow({ where: { id: creado.id } });
    expect(fila).toMatchObject({ debeCambiarPassword: false, passwordTemporalExpira: null });
    const futuro = new Date(Date.now() + 30 * 86_400_000);
    await iniciarSesion("otra@test.cl", "Definitiva-2027-x", {}, futuro);
  });

  it("no se puede cambiar una contraseña temporal ya vencida desde una sesión abierta", async () => {
    const creado = await crearUsuario(e.admin, { nombre: "Tardía", email: "tardia@test.cl", rol: "VISITANTE", centroIds: [e.centroA] });
    const despues = new Date(Date.now() + VIGENCIA_PASSWORD_TEMPORAL_MS + 1000);
    await esperarError(
      cambiarPassword(creado.id, { actual: creado.passwordTemporal, nueva: "Definitiva-2027-x" }, { ahora: despues }),
      "OPERACION_INVALIDA",
    );
  });

  it("cambiarPassword limita los intentos sobre la contraseña actual", async () => {
    for (let i = 0; i < MAX_INTENTOS_PASSWORD_ACTUAL; i++) {
      await esperarError(cambiarPassword(usuarioId, { actual: `mala-${i}`, nueva: "Nueva-Clave-2027" }), "PASSWORD_ACTUAL_INCORRECTA");
    }
    // Agotados los intentos, ni la contraseña correcta sirve hasta que pase la ventana.
    const error = await esperarError(cambiarPassword(usuarioId, { actual: PASSWORD, nueva: "Nueva-Clave-2027" }), "DEMASIADOS_INTENTOS");
    expect(error.campo).toBe("actual");
    expect(await verificarPassword((await db.usuario.findUniqueOrThrow({ where: { id: usuarioId } })).passwordHash, PASSWORD)).toBe(true);
    expect(await db.registroAuditoria.count({ where: { accion: "PASSWORD_CAMBIO_BLOQUEADO" } })).toBe(1);

    const luego = new Date(Date.now() + VENTANA_PASSWORD_ACTUAL_MS + 1000);
    await cambiarPassword(usuarioId, { actual: PASSWORD, nueva: "Nueva-Clave-2027" }, { ahora: luego });
    await iniciarSesion("ana@test.cl", "Nueva-Clave-2027");
  });

  it("los intentos correctos no consumen el límite de la contraseña actual", async () => {
    for (let i = 0; i < MAX_INTENTOS_PASSWORD_ACTUAL + 3; i++) {
      await esperarError(cambiarPassword(usuarioId, { actual: PASSWORD, nueva: "corta1" }), "PASSWORD_DEBIL");
    }
    await cambiarPassword(usuarioId, { actual: PASSWORD, nueva: "Nueva-Clave-2027" });
  });

  it("dos cambios de contraseña simultáneos: se aplica exactamente uno, completo", async () => {
    const sesion = await iniciarSesion("ana@test.cl", PASSWORD);
    const resultados = await Promise.allSettled([
      cambiarPassword(usuarioId, { actual: PASSWORD, nueva: "Primera-Clave-2027" }),
      cambiarPassword(usuarioId, { actual: PASSWORD, nueva: "Segunda-Clave-2027" }),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const ganadora = resultados[0]!.status === "fulfilled" ? "Primera-Clave-2027" : "Segunda-Clave-2027";
    const fila = await db.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    expect(await verificarPassword(fila.passwordHash, ganadora)).toBe(true);
    // Todo o nada: una sola auditoría y las sesiones cerradas junto con el cambio.
    expect(await db.registroAuditoria.count({ where: { accion: "PASSWORD_CAMBIADA" } })).toBe(1);
    expect(await validarTokenSesion(sesion.token)).toBeNull();
  });

  it("la cookie de sesión dura la vida máxima de la sesión y el proxy no la renueva", () => {
    expect(opcionesCookieSesion().maxAge).toBe(VIDA_MAXIMA_SESION_MS / 1000);
    const token = "a".repeat(43);
    const solicitud = new NextRequest("http://localhost/panel", { headers: { cookie: `${COOKIE_SESION}=${token}` } });
    const respuesta = proxy(solicitud);
    expect(respuesta.headers.get("location")).toBeNull();
    // Con o sin token válido en BD, el proxy no reescribe la cookie: no la puede prolongar.
    expect(respuesta.headers.get("set-cookie") ?? "").not.toContain(COOKIE_SESION);
  });

  it("el proxy borra una cookie de sesión mal formada y manda a /login", () => {
    for (const valor of ["corto", "con espacios y símbolos <>".repeat(3), "x".repeat(500)]) {
      const solicitud = new NextRequest("http://localhost/inventario?q=1", {
        headers: { cookie: `${COOKIE_SESION}=${encodeURIComponent(valor)}` },
      });
      const respuesta = proxy(solicitud);
      expect(respuesta.headers.get("location")).toBe("http://localhost/login?destino=%2Finventario%3Fq%3D1");
      const cookie = respuesta.headers.get("set-cookie") ?? "";
      expect(cookie).toContain(`${COOKIE_SESION}=;`);
      expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/);
    }
  });

  it("B8 — el proxy envía una CSP con nonce distinto por solicitud y sin 'unsafe-inline' en scripts", () => {
    const pedir = (ruta: string, cookie?: string) =>
      proxy(new NextRequest(`http://localhost${ruta}`, cookie ? { headers: { cookie } } : undefined));
    const nonces = new Set<string>();
    for (const respuesta of [pedir("/login"), pedir("/login"), pedir("/panel", `${COOKIE_SESION}=${"a".repeat(43)}`), pedir("/panel")]) {
      const csp = respuesta.headers.get("content-security-policy") ?? "";
      const scripts = csp.split("; ").find((d) => d.startsWith("script-src")) ?? "";
      const nonce = /'nonce-([A-Za-z0-9+/=]{20,})'/.exec(scripts)?.[1];
      expect(nonce, csp).toBeDefined();
      nonces.add(nonce!);
      expect(scripts).toContain("'strict-dynamic'");
      expect(scripts).not.toContain("'unsafe-inline'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'self'");
    }
    expect(nonces.size).toBe(4);
    // Next toma el nonce de la cabecera de la SOLICITUD que reenvía el proxy.
    const respuesta = pedir("/login");
    const reenviada = respuesta.headers.get("x-middleware-request-content-security-policy");
    expect(reenviada).toBe(respuesta.headers.get("content-security-policy"));
  });

  it("validarTokenSesion rechaza tokens mal formados sin consultar la base", async () => {
    expect(await validarTokenSesion("token con espacios y más de veinte caracteres")).toBeNull();
    expect(await validarTokenSesion("'; DROP TABLE sesiones; --........")).toBeNull();
  });
});
