/**
 * Utilidades puras (sin base de datos): números y montos, unidades, lectura de
 * parámetros de URL, errores de formulario, etiquetas de auditoría y proxy.
 */
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { etiquetaAccion, formatearValor, tieneEtiquetaPropia, tonoAccion } from "@/components/admin/auditoria-legible";
import { conPuntoFinal, erroresSinControl, esSesionVencida, rutaLoginConDestino, unirErrores } from "@/lib/errores-formulario";
import { MONTO_MAXIMO, zMontoOpcional } from "@/lib/esquemas/base";
import { esquemaIngreso, normalizarNumeroLote } from "@/lib/esquemas/movimientos";
import { DIA_FILTRO_MAXIMO, DIA_FILTRO_MINIMO, parsearDiaFiltro } from "@/lib/fechas";
import { leerFiltros } from "@/lib/filtros-reportes";
import { formatearDecimalFijo, formatearMonto, interpretarNumero, parsearNumero } from "@/lib/formato";
import {
  acotarPagina,
  diaParam,
  enumParam,
  limpiarTexto,
  PAGINA_MAXIMA,
  paginaParam,
  textoParam,
} from "@/lib/parametros";
import { construirHref, leerDia, leerEntero, leerOpcion, leerPagina, leerTexto, parametrosDe } from "@/lib/parametros-url";
import { cantidadConSigno, cantidadConUnidad, pluralUnidad, unidadSegun } from "@/lib/unidades";
import { proxy } from "@/proxy";
import { COOKIE_SESION } from "@/server/auth/constantes";

describe("B-01 — números escritos por una persona (parsearNumero / interpretarNumero)", () => {
  it("la coma es decimal y el punto separa miles solo si agrupa de a tres", () => {
    expect(parsearNumero("1250")).toBe(1250);
    expect(parsearNumero("1250,5")).toBe(1250.5);
    expect(parsearNumero("1.250")).toBe(1250);
    expect(parsearNumero("1.250,5")).toBe(1250.5);
    expect(parsearNumero("1.250.000,75")).toBe(1250000.75);
    expect(parsearNumero("$ 12.500")).toBe(12500);
    expect(parsearNumero(" 0,5 ")).toBe(0.5);
    expect(parsearNumero("-3")).toBe(-3);
  });

  it("un punto usado como decimal NO se adivina: se rechaza con la sugerencia con coma", () => {
    // Antes: "1250.5" → 12505 y "1.5" → 15 (se borraban todos los puntos).
    expect(parsearNumero("1250.5")).toBeNull();
    expect(parsearNumero("1.5")).toBeNull();
    expect(parsearNumero("12.50")).toBeNull();
    expect(interpretarNumero("1250.5")).toEqual({ ok: false, motivo: "punto_decimal", sugerencia: "1250,5" });
    expect(interpretarNumero("1.5")).toEqual({ ok: false, motivo: "punto_decimal", sugerencia: "1,5" });
    expect(interpretarNumero("$ 12.50")).toEqual({ ok: false, motivo: "punto_decimal", sugerencia: "12,50" });
  });

  it("rechaza lo que no es un número y distingue el vacío", () => {
    for (const texto of ["abc", "1.25.0", "1,2,3", "1.250.5", "12abc", "1e3", "0x10", ",5", "5,", "1..2", "1 250,5x"]) {
      expect(parsearNumero(texto), texto).toBeNull();
    }
    expect(interpretarNumero("")).toEqual({ ok: false, motivo: "vacio" });
    expect(interpretarNumero("   ")).toEqual({ ok: false, motivo: "vacio" });
    expect(interpretarNumero(null)).toEqual({ ok: false, motivo: "vacio" });
    expect(interpretarNumero("abc")).toEqual({ ok: false, motivo: "invalido" });
  });
});

describe("B-01 — zMontoOpcional (costo unitario)", () => {
  const mensaje = (v: unknown) => zMontoOpcional.safeParse(v).error?.issues[0]?.message;

  it("acepta el formato chileno y devuelve el número con hasta 2 decimales", () => {
    expect(zMontoOpcional.parse("1.250,5")).toBe(1250.5);
    expect(zMontoOpcional.parse("1250,5")).toBe(1250.5);
    expect(zMontoOpcional.parse("12.500")).toBe(12500);
    expect(zMontoOpcional.parse("1000")).toBe(1000);
    expect(zMontoOpcional.parse(1250.5)).toBe(1250.5);
    expect(zMontoOpcional.parse("0,555")).toBe(0.56);
    expect(zMontoOpcional.parse("")).toBeUndefined();
    expect(zMontoOpcional.parse("  ")).toBeUndefined();
    expect(zMontoOpcional.parse(null)).toBeUndefined();
    expect(zMontoOpcional.parse(undefined)).toBeUndefined();
  });

  it("rechaza el punto decimal con un mensaje que dice cómo escribirlo", () => {
    expect(mensaje("1250.5")).toBe("Usa coma para los decimales: 1250,5.");
    expect(mensaje("1.5")).toBe("Usa coma para los decimales: 1,5.");
  });

  it("rechaza montos inválidos, negativos o absurdos (tope de sanidad)", () => {
    expect(mensaje("abc")).toMatch(/monto válido/);
    expect(mensaje("-5")).toMatch(/monto válido/);
    expect(mensaje(-1)).toMatch(/monto válido/);
    expect(mensaje(Number.POSITIVE_INFINITY)).toMatch(/monto válido/);
    expect(zMontoOpcional.parse(String(MONTO_MAXIMO))).toBe(MONTO_MAXIMO);
    expect(mensaje("100.000.001")).toMatch(/demasiado grande/);
    expect(mensaje(MONTO_MAXIMO + 1)).toMatch(/demasiado grande/);
  });
});

describe("formato de decimales y montos", () => {
  it("formatearDecimalFijo redondea y rellena a los decimales pedidos", () => {
    expect(formatearDecimalFijo(5.8)).toBe("5,8");
    expect(formatearDecimalFijo(6.07)).toBe("6,1");
    expect(formatearDecimalFijo(66)).toBe("66,0");
    expect(formatearDecimalFijo(1234.5, 2)).toBe("1.234,50");
    expect(formatearDecimalFijo(0, 0)).toBe("0");
    expect(formatearDecimalFijo(null)).toBe("—");
    expect(formatearDecimalFijo(undefined)).toBe("—");
    expect(formatearDecimalFijo(Number.NaN)).toBe("—");
  });

  it("formatearMonto conserva los decimales que se guardarán", () => {
    expect(formatearMonto(1250.5)).toBe("$1.250,5");
    expect(formatearMonto(1250)).toBe("$1.250");
    expect(formatearMonto(0.56)).toBe("$0,56");
    expect(formatearMonto(-3.5)).toBe("-$3,5");
    expect(formatearMonto(null)).toBe("—");
  });
});

describe("unidades de medida", () => {
  it("cantidadConSigno concuerda la unidad y usa el signo tipográfico", () => {
    expect(cantidadConSigno(3, "caja", 1)).toBe("+3 cajas");
    expect(cantidadConSigno(1, "caja", -1)).toBe("−1 caja");
    expect(cantidadConSigno(1500, "ampolla", -1)).toBe("−1.500 ampollas");
    expect(cantidadConSigno(0, "frasco", 1)).toBe("+0 frascos");
    expect(cantidadConSigno(2, "bidón", 0)).toBe("−2 bidones");
  });

  it("pluraliza las unidades del catálogo", () => {
    expect(pluralUnidad("unidad")).toBe("unidades");
    expect(pluralUnidad("bidón")).toBe("bidones");
    expect(pluralUnidad("kit")).toBe("kits");
    expect(pluralUnidad("par")).toBe("pares");
    expect(unidadSegun(1, "frasco")).toBe("frasco");
    expect(unidadSegun(4, "frasco")).toBe("frascos");
    expect(cantidadConUnidad(98, "unidad")).toBe("98 unidades");
  });
});

describe("B-02 — página acotada", () => {
  it("acotarPagina solo acepta enteros seguros entre 1 y PAGINA_MAXIMA", () => {
    expect(acotarPagina(1)).toBe(1);
    expect(acotarPagina(37)).toBe(37);
    expect(acotarPagina("12")).toBe(12);
    expect(acotarPagina(" 12 ")).toBe(12);
    expect(acotarPagina(PAGINA_MAXIMA)).toBe(PAGINA_MAXIMA);
    for (const valor of [
      0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, PAGINA_MAXIMA + 1, 1e21, "Infinity", "99999999999999999999", "1e3",
      "0x10", "-2", "2.5", "abc", "", null, undefined, true, [3], {},
    ]) {
      expect(acotarPagina(valor), String(valor)).toBe(1);
    }
  });

  it("paginaParam y leerPagina usan la misma regla", () => {
    expect(paginaParam("3")).toBe(3);
    expect(paginaParam("99999999999999999999")).toBe(1);
    expect(paginaParam("Infinity")).toBe(1);
    expect(paginaParam(["2", "3"])).toBe(1);
    expect(paginaParam(undefined)).toBe(1);
    expect(leerPagina({ pagina: "4" })).toBe(4);
    expect(leerPagina({ pagina: "Infinity" })).toBe(1);
    expect(leerPagina({ paginaMermas: "2" }, "paginaMermas")).toBe(2);
    expect(leerPagina({})).toBe(1);
  });
});

describe("B-03 — texto de la URL sin caracteres de control", () => {
  it("limpiarTexto quita el byte nulo y otros caracteres de control, recorta y acota", () => {
    expect(limpiarTexto("\u0000")).toBe("");
    expect(limpiarTexto("gua\u0000nte")).toBe("gua nte");
    expect(limpiarTexto("  guante\t\n ")).toBe("guante");
    expect(limpiarTexto("\u0007\u001b[31mrojo\u007f")).toBe("[31mrojo");
    expect(limpiarTexto("Diálisis Ñuñoa 1,8 m²")).toBe("Diálisis Ñuñoa 1,8 m²");
    expect(limpiarTexto("a".repeat(500))).toHaveLength(200);
    expect(limpiarTexto("abcdef", 3)).toBe("abc");
  });

  it("textoParam y leerTexto devuelven nulo/indefinido si no queda nada", () => {
    expect(textoParam("\u0000")).toBeNull();
    expect(textoParam("  ")).toBeNull();
    expect(textoParam(undefined)).toBeNull();
    expect(textoParam(["a", "b"])).toBeNull();
    expect(textoParam(" guante\u0000 ")).toBe("guante");
    expect(leerTexto({ q: "\u0000" }, "q")).toBeUndefined();
    expect(leerTexto({ q: ["dializador\u0000", "otro"] }, "q")).toBe("dializador");
    expect(leerTexto({}, "q")).toBeUndefined();
  });

  it("enumParam, leerOpcion y leerEntero no aceptan valores fuera de lo permitido", () => {
    expect(enumParam("retiro", ["INGRESO", "RETIRO"] as const)).toBe("RETIRO");
    expect(enumParam("otro", ["INGRESO", "RETIRO"] as const)).toBeNull();
    expect(leerOpcion({ orden: "consumo" }, "orden", ["cobertura", "consumo"] as const)).toBe("consumo");
    expect(leerOpcion({ orden: "x" }, "orden", ["cobertura", "consumo"] as const)).toBeUndefined();
    expect(leerEntero({ dias: "30" }, "dias")).toBe(30);
    for (const valor of ["0", "-1", "1.5", "1e3", "Infinity", "99999999999999999999", "abc"]) {
      expect(leerEntero({ dias: valor }, "dias"), valor).toBeUndefined();
    }
  });
});

describe("B-04 — fechas de filtros acotadas (2000–2100)", () => {
  it("parsearDiaFiltro ignora las fechas fuera de rango y las inválidas", () => {
    expect(parsearDiaFiltro("2026-11-19")).toBe("2026-11-19");
    expect(parsearDiaFiltro("19-11-2026")).toBe("2026-11-19");
    expect(parsearDiaFiltro(DIA_FILTRO_MINIMO)).toBe("2000-01-01");
    expect(parsearDiaFiltro(DIA_FILTRO_MAXIMO)).toBe("2100-12-31");
    expect(parsearDiaFiltro("9999-12-31")).toBeNull();
    expect(parsearDiaFiltro("2101-01-01")).toBeNull();
    expect(parsearDiaFiltro("1999-12-31")).toBeNull();
    expect(parsearDiaFiltro("0001-01-01")).toBeNull();
    expect(parsearDiaFiltro("2026-02-30")).toBeNull();
    expect(parsearDiaFiltro("")).toBeNull();
    expect(parsearDiaFiltro(null)).toBeNull();
  });

  it("diaParam, leerDia y leerFiltros aplican el mismo rango", () => {
    expect(diaParam("2026-11-19")).toBe("2026-11-19");
    expect(diaParam("9999-12-31")).toBeNull();
    expect(diaParam("19-11-2026")).toBeNull();
    expect(leerDia({ desde: "2026-01-05" }, "desde")).toBe("2026-01-05");
    expect(leerDia({ desde: "9999-12-31" }, "desde")).toBeUndefined();
    const f = leerFiltros(
      parametrosDe(new URLSearchParams("desde=9999-12-31&hasta=2026-11-19&pagina=99999999999999999999&q=%00gua&dias=60&tipo=RETIRO")),
    );
    expect(f).toMatchObject({ desde: undefined, hasta: "2026-11-19", pagina: 1, texto: "gua", dias: 60, tipo: "RETIRO" });
  });

  it("construirHref omite los vacíos", () => {
    expect(construirHref("/reportes/consumo", { centro: null, q: "", dias: 30, orden: undefined })).toBe("/reportes/consumo?dias=30");
    expect(construirHref("/alertas", {})).toBe("/alertas");
  });
});

describe("B-15 — número de lote en forma canónica", () => {
  it("recorta, colapsa los espacios internos y pasa a mayúsculas", () => {
    expect(normalizarNumeroLote("  l-01   a ")).toBe("L-01 A");
    expect(normalizarNumeroLote("L\t01\n A")).toBe("L 01 A");
    expect(normalizarNumeroLote("abc123")).toBe("ABC123");
    expect(normalizarNumeroLote("   ")).toBe("");
  });

  it("el esquema de ingreso entrega el lote normalizado y exige que no quede vacío", () => {
    const base = { ubicacionId: "u1", insumoId: "i1", cantidad: "5" };
    expect(esquemaIngreso.parse({ ...base, numeroLote: " lote   7  b " }).numeroLote).toBe("LOTE 7 B");
    const vacio = esquemaIngreso.safeParse({ ...base, numeroLote: "    " });
    expect(vacio.success).toBe(false);
    expect(vacio.error?.issues[0]?.message).toBe("Ingresa el número de lote.");
    expect(esquemaIngreso.safeParse({ ...base, numeroLote: "x".repeat(61) }).success).toBe(false);
  });
});

describe("errores de formulario", () => {
  it("erroresSinControl devuelve solo lo que no tiene dónde mostrarse, sin repetir", () => {
    const errores = {
      cantidad: ["Solo hay 3"],
      fechaVencimiento: ["El lote L1 ya está registrado sin fecha"],
      claveIdempotencia: ["Clave de idempotencia inválida."],
      loteId: ["Clave de idempotencia inválida."],
      vacio: [],
    };
    expect(erroresSinControl(errores, ["cantidad", "nota"])).toEqual([
      "El lote L1 ya está registrado sin fecha.",
      "Clave de idempotencia inválida.",
    ]);
    expect(erroresSinControl(errores, ["cantidad", "fechaVencimiento", "claveIdempotencia", "loteId"])).toEqual([]);
    expect(erroresSinControl({}, [])).toEqual([]);
  });

  it("unirErrores prioriza la validación local y uniforma la puntuación", () => {
    expect(unirErrores({ cantidad: ["Del servidor"], nota: ["Muy larga"] }, { cantidad: ["Ingresa la cantidad"] })).toEqual({
      cantidad: ["Ingresa la cantidad."],
      nota: ["Muy larga."],
    });
    expect(conPuntoFinal("¿Seguro?")).toBe("¿Seguro?");
    expect(conPuntoFinal(" Listo ")).toBe("Listo.");
  });
});

describe("B-07 — sesión vencida", () => {
  it("esSesionVencida reconoce el código NO_AUTENTICADO", () => {
    expect(esSesionVencida({ ok: false, codigo: "NO_AUTENTICADO" })).toBe(true);
    expect(esSesionVencida({ ok: false, codigo: "VALIDACION" })).toBe(false);
    expect(esSesionVencida({ ok: true })).toBe(false);
  });

  it("rutaLoginConDestino conserva la ruta y sus parámetros", () => {
    const ruta = rutaLoginConDestino({ pathname: "/movimientos/retiro", search: "?insumo=abc&ubicacion=u1" });
    const url = new URL(ruta, "http://localhost");
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("motivo")).toBe("sesion");
    expect(url.searchParams.get("destino")).toBe("/movimientos/retiro?insumo=abc&ubicacion=u1");
    expect(rutaLoginConDestino({ pathname: "/", search: "" })).toBe("/login?motivo=sesion");
    expect(rutaLoginConDestino({ pathname: "/login", search: "?destino=/x" })).toBe("/login?motivo=sesion");
  });

  it("el proxy no redirige las Server Actions sin sesión (las responde accionSegura); las páginas sí", () => {
    const accion = proxy(
      new NextRequest("http://localhost/movimientos/retiro", { method: "POST", headers: { "next-action": "abc123" } }),
    );
    expect(accion.headers.get("location")).toBeNull();
    expect(accion.status).toBe(200);

    const pagina = proxy(new NextRequest("http://localhost/movimientos/retiro?insumo=x"));
    expect(pagina.status).toBe(307);
    const destino = new URL(pagina.headers.get("location") ?? "");
    expect(destino.pathname).toBe("/login");
    expect(destino.searchParams.get("destino")).toBe("/movimientos/retiro?insumo=x");

    // Un POST cualquiera (sin cabecera de acción) sigue redirigiéndose.
    const post = proxy(new NextRequest("http://localhost/movimientos/retiro", { method: "POST" }));
    expect(post.status).toBe(307);
    // Con cookie mal formada la acción pasa igual y la cookie se borra.
    const malFormada = proxy(
      new NextRequest("http://localhost/panel", { method: "POST", headers: { "next-action": "x", cookie: `${COOKIE_SESION}=corta` } }),
    );
    expect(malFormada.headers.get("location")).toBeNull();
    expect(malFormada.headers.get("set-cookie") ?? "").toContain(`${COOKIE_SESION}=;`);
  });
});

describe("auditoría legible", () => {
  /** Acciones que el código escribe: literales `accion: "X"` y `? "X" : "Y"` junto a `accion:`. */
  function accionesDelCodigo(): string[] {
    const acciones = new Set<string>();
    const recorrer = (dir: string) => {
      for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
        const ruta = path.join(dir, entrada.name);
        if (entrada.isDirectory()) recorrer(ruta);
        else if (/\.tsx?$/.test(entrada.name)) {
          const texto = fs.readFileSync(ruta, "utf8");
          for (const linea of texto.split("\n")) {
            if (!/\baccion:/.test(linea) && !/auditarFalloLogin\(/.test(linea)) continue;
            for (const m of linea.matchAll(/"([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)"/g)) acciones.add(m[1]!);
          }
        }
      }
    };
    const raiz = path.resolve(import.meta.dirname, "..");
    recorrer(path.join(raiz, "src", "server"));
    recorrer(path.join(raiz, "scripts"));
    return [...acciones].sort();
  }

  it("toda acción que escribe el código tiene etiqueta propia en español", () => {
    const acciones = accionesDelCodigo();
    // Sanidad del propio test: debe encontrar las acciones conocidas.
    expect(acciones).toEqual(expect.arrayContaining(["LOGIN_OK", "LOGIN_FALLIDO_AGREGADO", "LOTE_ACTUALIZADO", "PASSWORD_CAMBIO_BLOQUEADO", "USUARIO_DESACTIVADO", "REPORTE_EXPORTADO"]));
    expect(acciones.length).toBeGreaterThan(30);
    expect(acciones.filter((a) => !tieneEtiquetaPropia(a))).toEqual([]);
  });

  it("etiquetas y motivos nuevos", () => {
    expect(etiquetaAccion("LOGIN_FALLIDO_AGREGADO")).toBe("Intentos de ingreso fallidos (resumen)");
    expect(etiquetaAccion("PASSWORD_CAMBIO_BLOQUEADO")).toMatch(/Cambio de contraseña bloqueado/);
    expect(etiquetaAccion("LOTE_ACTUALIZADO")).toBe("Vencimiento de lote corregido");
    expect(tonoAccion("LOGIN_FALLIDO_AGREGADO")).toBe("alerta");
    expect(tonoAccion("PASSWORD_CAMBIO_BLOQUEADO")).toBe("alerta");
    for (const motivo of ["limite_ip", "limite_ip_email", "limite_cuenta", "bloqueo_cuenta", "password_temporal_vencida", "intentos_password_actual", "email_desconocido", "password_incorrecta", "usuario_inactivo"]) {
      const legible = formatearValor("motivo", motivo);
      expect(legible, motivo).not.toBe(motivo);
      expect(legible, motivo).not.toMatch(/_/);
    }
    // Respaldo genérico para acciones de versiones futuras.
    expect(etiquetaAccion("CATEGORIA_FUSIONADA")).toBe("Categoría fusionada");
  });
});

describe("mensajes de validación (zod)", () => {
  const carpeta = path.resolve(import.meta.dirname, "..", "src", "lib", "esquemas");
  const fuentes = fs
    .readdirSync(carpeta)
    .map((archivo) => ({ archivo, lineas: fs.readFileSync(path.join(carpeta, archivo), "utf8").split("\n") }));

  /** Literales que parecen frases para la persona (empiezan con mayúscula y tienen espacios). */
  function frases(): { archivo: string; frase: string }[] {
    const salida: { archivo: string; frase: string }[] = [];
    for (const { archivo, lineas } of fuentes) {
      for (const linea of lineas) {
        if (/^\s*(\/\/|\*|\/\*)/.test(linea) || /^import /.test(linea)) continue;
        for (const m of linea.matchAll(/(["`])([A-ZÁÉÍÓÚÑ¿][^"`\n]* [^"`\n]*?)\1/g)) salida.push({ archivo, frase: m[2]! });
      }
    }
    return salida;
  }

  it("todos terminan en punto (o signo de cierre) y ninguno dice 'email'", () => {
    const todas = frases();
    expect(todas.length).toBeGreaterThan(40);
    expect(todas.filter((f) => !/[.!?…:]$/.test(f.frase))).toEqual([]);
    expect(todas.filter((f) => /\bemail\b/i.test(f.frase))).toEqual([]);
  });

  it("tutean: sin voseo ni trato de usted en los imperativos", () => {
    const sospechosas = frases().filter((f) => /\b(Ingrese|Seleccione|Indique|Asigne|Revise|Use|Ingresá|Seleccioná|Indicá|Usá)\b/.test(f.frase));
    expect(sospechosas).toEqual([]);
  });
});
