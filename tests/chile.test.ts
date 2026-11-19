import { describe, expect, it } from "vitest";
import { calcularDv, formatearRut, limpiarRut, normalizarRut, validarRut } from "@/lib/chile/rut";
import {
  calcularEstadoStock,
  calcularEstadoVencimiento,
} from "@/lib/estados";
import {
  diaEnSantiago,
  diasEntre,
  finDelDia,
  formatearDia,
  formatearFechaHora,
  inicioDelDia,
  parsearDia,
  sumarDias,
} from "@/lib/fechas";
import { formatearCLP, formatearNumero, parsearNumero } from "@/lib/formato";
import { zRut } from "@/lib/esquemas/base";

describe("RUT (módulo 11)", () => {
  it("calcula el dígito verificador", () => {
    expect(calcularDv(12345678)).toBe("5");
    expect(calcularDv("11111111")).toBe("1");
    expect(calcularDv(76123456)).toBe("0");
    expect(calcularDv(6)).toBe("K");
    expect(calcularDv(20347878)).toBe("K");
  });

  it("valida RUT con distintos formatos", () => {
    expect(validarRut("12.345.678-5")).toBe(true);
    expect(validarRut("12345678-5")).toBe(true);
    expect(validarRut("123456785")).toBe(true);
    expect(validarRut("20.347.878-k")).toBe(true);
    expect(validarRut(" 76.123.456-0 ")).toBe(true);
  });

  it("rechaza RUT inválidos", () => {
    expect(validarRut("12.345.678-9")).toBe(false);
    expect(validarRut("")).toBe(false);
    expect(validarRut(null)).toBe(false);
    expect(validarRut("abc")).toBe(false);
    expect(validarRut("12.345.678-")).toBe(false);
    expect(validarRut("1234567890123-1")).toBe(false);
    expect(validarRut("0-0")).toBe(false);
    expect(validarRut("12a345678-5")).toBe(false);
  });

  it("limpia, normaliza y formatea", () => {
    expect(limpiarRut("12.345.678-k")).toBe("12345678K");
    expect(normalizarRut("12.345.678-5")).toBe("12345678-5");
    expect(normalizarRut("020.347.878-k")).toBe("20347878-K");
    expect(formatearRut("123456785")).toBe("12.345.678-5");
    expect(formatearRut("76123456-0")).toBe("76.123.456-0");
    expect(formatearRut("")).toBe("");
  });

  it("el esquema zod valida y normaliza", () => {
    expect(zRut.parse("12.345.678-5")).toBe("12345678-5");
    expect(zRut.safeParse("12.345.678-0").success).toBe(false);
  });
});

describe("fechas en America/Santiago", () => {
  it("resuelve el día calendario chileno, no el UTC", () => {
    // 02:30 UTC del 15 de julio = 22:30 del 14 de julio en Santiago (UTC-4).
    expect(diaEnSantiago(new Date("2026-07-15T02:30:00Z"))).toBe("2026-07-14");
    // En verano Chile continental está en UTC-3.
    expect(diaEnSantiago(new Date("2026-01-15T02:30:00Z"))).toBe("2026-01-14");
    expect(diaEnSantiago(new Date("2026-01-15T03:00:00Z"))).toBe("2026-01-15");
  });

  it("calcula inicio y fin de un día en Santiago", () => {
    expect(inicioDelDia("2026-07-14").toISOString()).toBe("2026-07-14T04:00:00.000Z");
    expect(inicioDelDia("2026-01-14").toISOString()).toBe("2026-01-14T03:00:00.000Z");
    expect(finDelDia("2026-01-14").toISOString()).toBe("2026-01-15T03:00:00.000Z");
  });

  it("parsea y formatea días", () => {
    expect(parsearDia("2026-03-05")).toBe("2026-03-05");
    expect(parsearDia("05-03-2026")).toBe("2026-03-05");
    expect(parsearDia("5/3/2026")).toBe("2026-03-05");
    expect(parsearDia("31-02-2026")).toBeNull();
    expect(parsearDia("hola")).toBeNull();
    expect(formatearDia("2026-03-05")).toBe("05-03-2026");
    expect(formatearDia(new Date("2026-03-05T00:00:00Z"))).toBe("05-03-2026");
    expect(formatearDia(null)).toBe("—");
    expect(formatearFechaHora(new Date("2026-07-15T02:30:00Z"))).toBe("14-07-2026 22:30");
  });

  it("opera con días", () => {
    expect(sumarDias("2026-02-27", 3)).toBe("2026-03-02");
    expect(sumarDias("2026-01-01", -1)).toBe("2025-12-31");
    expect(diasEntre("2026-01-01", "2026-01-31")).toBe(30);
    expect(diasEntre("2026-01-31", "2026-01-01")).toBe(-30);
  });
});

describe("estados derivados", () => {
  it("estado de stock", () => {
    expect(calcularEstadoStock(0, 10)).toBe("SIN_STOCK");
    expect(calcularEstadoStock(0, null)).toBe("SIN_STOCK");
    expect(calcularEstadoStock(5, 10)).toBe("BAJO_MINIMO");
    expect(calcularEstadoStock(10, 10)).toBe("OK");
    expect(calcularEstadoStock(3, null)).toBe("OK");
  });

  it("estado de vencimiento: el día de vencimiento aún es utilizable", () => {
    const hoy = "2026-06-10";
    expect(calcularEstadoVencimiento("2026-06-09", hoy)).toBe("VENCIDO");
    // El día de vencimiento todavía se puede usar: es ROJO, no VENCIDO.
    expect(calcularEstadoVencimiento("2026-06-10", hoy)).toBe("ROJO");
    expect(calcularEstadoVencimiento("2026-09-09", hoy)).toBe("ROJO");
    expect(calcularEstadoVencimiento("2026-09-10", hoy)).toBe("AMARILLO");
    expect(calcularEstadoVencimiento("2026-12-10", hoy)).toBe("VERDE");
    expect(calcularEstadoVencimiento(null, hoy)).toBe("SIN_VENCIMIENTO");
  });
});

describe("formato es-CL", () => {
  it("números y CLP", () => {
    expect(formatearNumero(1234567)).toBe("1.234.567");
    expect(formatearCLP(12500)).toBe("$12.500");
    expect(formatearNumero(null)).toBe("—");
    expect(parsearNumero("1.250,5")).toBe(1250.5);
    expect(parsearNumero("$ 12.500")).toBe(12500);
    expect(parsearNumero("abc")).toBeNull();
  });
});
