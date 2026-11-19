import { describe, expect, it } from "vitest";
import { calcularCobertura, calcularReposicion, nivelDeCobertura } from "@/lib/abastecimiento";
import { BOM_UTF8, escaparCeldaCsv, filaCsv, generarCsv, neutralizarFormula, nombreArchivoCsv } from "@/lib/csv";

describe("CSV para Excel es-CL", () => {
  it("antepone ' a los textos que una planilla interpretaría como fórmula", () => {
    expect(neutralizarFormula("=SUMA(A1:A9)")).toBe("'=SUMA(A1:A9)");
    expect(neutralizarFormula("+56 9 1234 5678")).toBe("'+56 9 1234 5678");
    expect(neutralizarFormula("-cmd|' /C calc'!A0")).toBe("'-cmd|' /C calc'!A0");
    expect(neutralizarFormula("@SUM(1+1)")).toBe("'@SUM(1+1)");
    expect(neutralizarFormula("\t=1+1")).toBe("'\t=1+1");
    expect(neutralizarFormula("\r=1+1")).toBe("'\r=1+1");
    expect(neutralizarFormula("Guantes de nitrilo")).toBe("Guantes de nitrilo");
    expect(neutralizarFormula("L-2026 = lote")).toBe("L-2026 = lote");
  });

  it("escapa separadores, comillas y saltos de línea", () => {
    expect(escaparCeldaCsv("Suero; 500 ml")).toBe('"Suero; 500 ml"');
    expect(escaparCeldaCsv('Jeringa "luer"')).toBe('"Jeringa ""luer"""');
    expect(escaparCeldaCsv("línea 1\nlínea 2")).toBe('"línea 1\nlínea 2"');
    expect(escaparCeldaCsv('=HYPERLINK("http://x";"clic")')).toBe('"\'=HYPERLINK(""http://x"";""clic"")"');
    expect(escaparCeldaCsv("Ñuñoa")).toBe("Ñuñoa");
  });

  it("escribe números con coma decimal y sin miles; los negativos no se alteran", () => {
    expect(escaparCeldaCsv(1250)).toBe("1250");
    expect(escaparCeldaCsv(12.5)).toBe("12,5");
    expect(escaparCeldaCsv(-30)).toBe("-30");
    expect(escaparCeldaCsv(Number.NaN)).toBe("");
    expect(escaparCeldaCsv(null)).toBe("");
    expect(escaparCeldaCsv(undefined)).toBe("");
    expect(escaparCeldaCsv(true)).toBe("Sí");
  });

  it("genera el documento con BOM, separador ; y CRLF", () => {
    const csv = generarCsv(["Insumo", "Cantidad"], [["Gasa", 3], ["=1+1", 0.5]]);
    expect(csv.startsWith(BOM_UTF8)).toBe(true);
    expect(csv).toBe("﻿Insumo;Cantidad\r\nGasa;3\r\n'=1+1;0,5\r\n");
    expect(filaCsv([])).toBe("\r\n");
  });

  it("arma nombres de archivo seguros", () => {
    expect(nombreArchivoCsv("Lista de reposición", "19-11-2026")).toBe("lista-de-reposicion_19-11-2026.csv");
    expect(nombreArchivoCsv("../../etc/passwd")).toBe("etc-passwd.csv");
    expect(nombreArchivoCsv("")).toBe("exportacion.csv");
  });
});

describe("calcularReposicion", () => {
  it("calcula lo que falta para el mínimo y para el máximo", () => {
    expect(calcularReposicion(30, 50, 80)).toEqual({ faltaParaMinimo: 20, faltaParaMaximo: 50, sugerido: 50 });
    expect(calcularReposicion(0, 50, null)).toEqual({ faltaParaMinimo: 50, faltaParaMaximo: null, sugerido: 50 });
  });

  it("no pide nada si ya se cumple y nunca devuelve negativos", () => {
    expect(calcularReposicion(60, 50, null)).toEqual({ faltaParaMinimo: 0, faltaParaMaximo: null, sugerido: 0 });
    expect(calcularReposicion(90, 50, 80)).toEqual({ faltaParaMinimo: 0, faltaParaMaximo: 0, sugerido: 0 });
    expect(calcularReposicion(-5, 10, 20)).toEqual({ faltaParaMinimo: 10, faltaParaMaximo: 20, sugerido: 20 });
  });

  it("ignora un máximo menor que el mínimo (mal configurado)", () => {
    expect(calcularReposicion(10, 50, 40)).toEqual({ faltaParaMinimo: 40, faltaParaMaximo: null, sugerido: 40 });
  });
});

describe("calcularCobertura", () => {
  it("divide el disponible por el consumo promedio diario", () => {
    expect(calcularCobertura(30, 30, 30)).toEqual({ promedioDiario: 1, diasCobertura: 30 });
    expect(calcularCobertura(30, 30, 10)).toEqual({ promedioDiario: 3, diasCobertura: 10 });
    expect(calcularCobertura(0, 12, 6)).toEqual({ promedioDiario: 2, diasCobertura: 0 });
  });

  it("trunca a un decimal (no promete días de más)", () => {
    // 10 ÷ (3 ÷ 7) = 23,33…
    expect(calcularCobertura(10, 3, 7).diasCobertura).toBe(23.3);
    // 29 ÷ (30 ÷ 30) = 29 exacto, sin errores de coma flotante
    expect(calcularCobertura(29, 30, 30).diasCobertura).toBe(29);
    expect(calcularCobertura(1, 3, 1).diasCobertura).toBe(0.3);
  });

  it("sin consumo no estima cobertura", () => {
    expect(calcularCobertura(100, 0, 30)).toEqual({ promedioDiario: 0, diasCobertura: null });
    expect(calcularCobertura(100, -4, 30).diasCobertura).toBeNull();
  });

  it("trata períodos inválidos como de un día", () => {
    expect(calcularCobertura(10, 5, 0)).toEqual({ promedioDiario: 5, diasCobertura: 2 });
    expect(calcularCobertura(10, 5, Number.NaN).diasCobertura).toBe(2);
  });

  it("clasifica el nivel de cobertura", () => {
    expect(nivelDeCobertura(null)).toBe("SIN_CONSUMO");
    expect(nivelDeCobertura(0)).toBe("CRITICA");
    expect(nivelDeCobertura(6.9)).toBe("CRITICA");
    expect(nivelDeCobertura(7)).toBe("BAJA");
    expect(nivelDeCobertura(29.9)).toBe("BAJA");
    expect(nivelDeCobertura(30)).toBe("ADECUADA");
  });
});
