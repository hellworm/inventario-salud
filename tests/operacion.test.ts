import { describe, expect, it } from "vitest";
import { analizarEntorno, mensajeEntornoInvalido } from "@/server/entorno";
import { describirError, limpiarDatos, limpiarTexto } from "@/server/registro";

const URL_VALIDA = "postgresql://app:Xk29fLq81mZp03Wd@db.interno:5432/redinsumos?schema=public";

describe("validación de entorno", () => {
  it("acepta una configuración mínima y aplica valores por defecto", () => {
    const r = analizarEntorno({ DATABASE_URL: URL_VALIDA });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entorno.SESION_HORAS).toBe(12);
    expect(r.entorno.NODE_ENV).toBe("development");
    expect(r.advertencias).toEqual([]);
  });

  it("falla con mensaje claro si falta DATABASE_URL", () => {
    const r = analizarEntorno({});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]).toMatch(/^DATABASE_URL: falta/);
    expect(mensajeEntornoInvalido(r.errores)).toContain("Configuración inválida");
  });

  it("rechaza DATABASE_URL vacía, de otro motor o mal formada, sin repetir errores", () => {
    for (const valor of ["", "   ", "mysql://u:p@h/b", "postgresql://", "postgresql://u:p@h:5432"]) {
      const r = analizarEntorno({ DATABASE_URL: valor });
      expect(r.ok, valor).toBe(false);
      if (!r.ok) expect(r.errores, valor).toHaveLength(1);
    }
  });

  it("nunca incluye el valor de la variable (ni la clave) en los errores", () => {
    const r = analizarEntorno({ DATABASE_URL: "mysql://usuario:SuperSecreta123@servidor/base", SESION_HORAS: "x" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errores.join(" ")).not.toContain("SuperSecreta123");
    expect(r.errores.some((e) => e.startsWith("SESION_HORAS:"))).toBe(true);
  });

  it("valida SESION_HORAS", () => {
    expect(analizarEntorno({ DATABASE_URL: URL_VALIDA, SESION_HORAS: "8" })).toMatchObject({
      ok: true,
      entorno: { SESION_HORAS: 8 },
    });
    expect(analizarEntorno({ DATABASE_URL: URL_VALIDA, SESION_HORAS: "" })).toMatchObject({ ok: true });
    for (const valor of ["0", "-3", "abc", "500"]) {
      expect(analizarEntorno({ DATABASE_URL: URL_VALIDA, SESION_HORAS: valor }).ok, valor).toBe(false);
    }
  });

  it("advierte en producción si la clave de la base es de ejemplo o corta", () => {
    const debil = analizarEntorno({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://medired:medired_dev@localhost:5432/medired",
    });
    expect(debil).toMatchObject({ ok: true });
    if (debil.ok) expect(debil.advertencias).toHaveLength(1);

    const fuerte = analizarEntorno({ NODE_ENV: "production", DATABASE_URL: URL_VALIDA });
    if (fuerte.ok) expect(fuerte.advertencias).toEqual([]);
  });
});

describe("registro sin datos sensibles", () => {
  it("oculta credenciales incrustadas en direcciones", () => {
    const texto = limpiarTexto("No conecta a postgresql://app:Secreta99@db:5432/base?schema=public");
    expect(texto).not.toContain("Secreta99");
    expect(texto).toContain("postgresql://app:[oculto]@db:5432/base");
  });

  it("oculta valores de claves sensibles, también anidadas", () => {
    const limpio = limpiarDatos({
      email: "ana@ejemplo.cl",
      password: "Secreta99",
      nueva: { passwordHash: "$argon2id$abc", tokenHash: "abc", otro: 1 },
      cabeceras: { cookie: "ri_sesion=abc", Authorization: "Bearer abc" },
    });
    const texto = JSON.stringify(limpio);
    expect(texto).not.toMatch(/Secreta99|argon2id|ri_sesion=abc|Bearer abc/);
    expect(texto).toContain("ana@ejemplo.cl");
    expect(texto).toContain('"otro":1');
  });

  it("describe errores con nombre, código y pila, limpiando el mensaje", () => {
    const error = Object.assign(new Error("fallo en postgres://u:Clave123@h/b"), { code: "P1001" });
    const d = describirError(error);
    expect(d.nombre).toBe("Error");
    expect(d.codigo).toBe("P1001");
    expect(JSON.stringify(d)).not.toContain("Clave123");
    expect(typeof d.pila).toBe("string");
    expect(describirError("texto suelto")).toEqual({ mensaje: "texto suelto" });
  });
});
