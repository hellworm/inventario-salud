import { describe, expect, it } from "vitest";
import { hrefEscaneo, hrefIngresoEscaneado } from "@/lib/escaneo";
import {
  digitoVerificadorGtin,
  fechaGs1,
  gtinParaMostrar,
  interpretarCodigo,
  normalizarGtin,
  parsearGs1,
  validarGtin,
  variantesGtin,
} from "@/lib/gs1";

const GS = "\u001d";
const HOY = "2026-11-19";

describe("GTIN: dígito verificador y validación", () => {
  it("calcula el dígito verificador para los cuatro largos", () => {
    expect(digitoVerificadorGtin("780410000000")).toBe(6); // EAN-13 7804100000006
    expect(digitoVerificadorGtin("400638133393")).toBe(1); // EAN-13 4006381333931
    expect(digitoVerificadorGtin("03600029145")).toBe(2); // UPC-A 036000291452
    expect(digitoVerificadorGtin("7351353")).toBe(7); // EAN-8 73513537
    expect(digitoVerificadorGtin("1061414100073")).toBe(6); // GTIN-14 10614141000736
    expect(digitoVerificadorGtin("0950600013435")).toBe(2); // GTIN-14 09506000134352
  });

  it("acepta EAN-13, EAN-8, UPC-A y GTIN-14 válidos", () => {
    for (const codigo of ["7804100000006", "4006381333931", "036000291452", "73513537", "10614141000736", "09506000134352"]) {
      expect(validarGtin(codigo), codigo).toBe(true);
    }
  });

  it("rechaza dígito verificador incorrecto, largos no estándar y texto", () => {
    for (const codigo of [
      "7804100000005", // dígito verificador malo
      "4006381333930",
      "780410000000", // 12 dígitos con verificador malo
      "12345", // largo no estándar
      "780410000000612", // 15 dígitos
      "78041000000O3", // letra O
      "0000000000000", // todo ceros
      "",
      " 7804100000006",
    ]) {
      expect(validarGtin(codigo), JSON.stringify(codigo)).toBe(false);
    }
    expect(validarGtin(null)).toBe(false);
    expect(validarGtin(undefined)).toBe(false);
  });
});

describe("GTIN: normalización GTIN-14 ↔ EAN-13 ↔ UPC-A ↔ EAN-8", () => {
  it("normaliza cualquier forma a 14 dígitos con ceros a la izquierda", () => {
    expect(normalizarGtin("7804100000006")).toBe("07804100000006");
    expect(normalizarGtin("07804100000006")).toBe("07804100000006");
    expect(normalizarGtin("036000291452")).toBe("00036000291452");
    expect(normalizarGtin("73513537")).toBe("00000073513537");
    expect(normalizarGtin(" 7804100000006 ")).toBe("07804100000006");
    expect(normalizarGtin("7804100000005")).toBeNull();
    expect(normalizarGtin("ABC")).toBeNull();
    expect(normalizarGtin(null)).toBeNull();
  });

  it("el mismo producto escrito como EAN-13, UPC-A o GTIN-14 comparte variantes", () => {
    // UPC-A 036000291452 = EAN-13 0036000291452 = GTIN-14 00036000291452
    const esperadas = ["00036000291452", "0036000291452", "036000291452"];
    expect(variantesGtin("036000291452")).toEqual(esperadas);
    expect(variantesGtin("0036000291452")).toEqual(esperadas);
    expect(variantesGtin("00036000291452")).toEqual(esperadas);
    // EAN-13 chileno (prefijo 780): GTIN-14 y EAN-13; no hay forma UPC-A.
    expect(variantesGtin("7804100000006")).toEqual(["07804100000006", "7804100000006"]);
    // EAN-8: las cuatro formas.
    expect(variantesGtin("73513537")).toEqual(["00000073513537", "0000073513537", "000073513537", "73513537"]);
  });

  it("un GTIN-14 con indicador de empaque NO equivale al EAN-13 de la unidad", () => {
    expect(variantesGtin("10614141000736")).toEqual(["10614141000736"]);
    expect(variantesGtin("10614141000736")).not.toContain("0614141000736");
    expect(variantesGtin("no-es-gtin")).toEqual([]);
  });

  it("gtinParaMostrar quita solo el cero inicial", () => {
    expect(gtinParaMostrar("07804100000006")).toBe("7804100000006");
    expect(gtinParaMostrar("10614141000736")).toBe("10614141000736");
  });
});

describe("fechas GS1 (AAMMDD)", () => {
  it("interpreta año, mes y día", () => {
    expect(fechaGs1("270531", { diaCero: "ultimoDia", hoy: HOY })).toBe("2027-05-31");
    expect(fechaGs1("261119", { diaCero: "ultimoDia", hoy: HOY })).toBe("2026-11-19");
  });

  it("día 00 = último día del mes en vencimientos (también febrero y bisiestos)", () => {
    expect(fechaGs1("270500", { diaCero: "ultimoDia", hoy: HOY })).toBe("2027-05-31");
    expect(fechaGs1("270400", { diaCero: "ultimoDia", hoy: HOY })).toBe("2027-04-30");
    expect(fechaGs1("270200", { diaCero: "ultimoDia", hoy: HOY })).toBe("2027-02-28");
    expect(fechaGs1("280200", { diaCero: "ultimoDia", hoy: HOY })).toBe("2028-02-29");
    expect(fechaGs1("271200", { diaCero: "ultimoDia", hoy: HOY })).toBe("2027-12-31");
  });

  it("día 00 = primer día del mes en fabricación", () => {
    expect(fechaGs1("250300", { diaCero: "primerDia", hoy: HOY })).toBe("2025-03-01");
  });

  it("siglo según la regla GS1 (ventana de −49 a +50 años)", () => {
    // En 2026: de 00 a 76 → 20xx; de 77 a 99 → 19xx.
    expect(fechaGs1("000101", { diaCero: "ultimoDia", hoy: HOY })).toBe("2000-01-01");
    expect(fechaGs1("760101", { diaCero: "ultimoDia", hoy: HOY })).toBe("2076-01-01");
    expect(fechaGs1("770101", { diaCero: "ultimoDia", hoy: HOY })).toBe("1977-01-01");
    expect(fechaGs1("990101", { diaCero: "ultimoDia", hoy: HOY })).toBe("1999-01-01");
    // En 2075: "25" queda 50 años atrás del 75 → siglo siguiente (2125); "26" → 2026.
    expect(fechaGs1("250101", { diaCero: "ultimoDia", hoy: "2075-06-01" })).toBe("2125-01-01");
    expect(fechaGs1("260101", { diaCero: "ultimoDia", hoy: "2075-06-01" })).toBe("2026-01-01");
  });

  it("rechaza fechas imposibles", () => {
    for (const mala of ["271301", "270001", "270230", "270431", "27053", "2705311", "27o531", ""]) {
      expect(fechaGs1(mala, { diaCero: "ultimoDia", hoy: HOY }), mala).toBeNull();
    }
    // 29 de febrero solo en año bisiesto.
    expect(fechaGs1("270229", { diaCero: "ultimoDia", hoy: HOY })).toBeNull();
    expect(fechaGs1("280229", { diaCero: "ultimoDia", hoy: HOY })).toBe("2028-02-29");
  });
});

describe("parsearGs1: forma cruda con FNC1 / <GS>", () => {
  it("DataMatrix típico de un insumo médico: GTIN + vencimiento + lote", () => {
    const d = parsearGs1(`0107804100000006172705311 0L2611-045`.replace(" ", ""), HOY);
    expect(d).toMatchObject({ gtin: "07804100000006", vencimiento: "2027-05-31", lote: "L2611-045", fabricacion: null, serie: null });
    expect(d?.elementos).toEqual([
      { ai: "01", valor: "07804100000006" },
      { ai: "17", valor: "270531" },
      { ai: "10", valor: "L2611-045" },
    ]);
  });

  it("los campos variables terminan en GS; el orden de los AI es libre", () => {
    const texto = `010780410000000610L2611-045${GS}17270531${GS}21SER123${GS}11250301`;
    expect(parsearGs1(texto, HOY)).toMatchObject({
      gtin: "07804100000006",
      lote: "L2611-045",
      vencimiento: "2027-05-31",
      serie: "SER123",
      fabricacion: "2025-03-01",
    });
  });

  it("acepta el identificador de simbología, el FNC1 inicial y los marcadores de texto del separador", () => {
    const esperado = { gtin: "07804100000006", lote: "AB12", vencimiento: "2027-05-31" };
    expect(parsearGs1(`]d2010780410000000610AB12${GS}17270531`, HOY)).toMatchObject(esperado);
    expect(parsearGs1(`]C1010780410000000610AB12${GS}17270531`, HOY)).toMatchObject(esperado);
    expect(parsearGs1(`]Q3010780410000000610AB12${GS}17270531`, HOY)).toMatchObject(esperado);
    expect(parsearGs1(`${GS}010780410000000610AB12${GS}17270531`, HOY)).toMatchObject(esperado);
    expect(parsearGs1("010780410000000610AB12<GS>17270531", HOY)).toMatchObject(esperado);
    expect(parsearGs1("010780410000000610AB12{GS}17270531", HOY)).toMatchObject(esperado);
    expect(parsearGs1("010780410000000610AB12^]17270531", HOY)).toMatchObject(esperado);
    expect(parsearGs1(`  010780410000000610AB12${GS}17270531${GS}  `, HOY)).toMatchObject(esperado);
  });

  it("día 00 en (17) = último día del mes; en (11) = primer día", () => {
    expect(parsearGs1("010780410000000617280200112502001 0X".replace(" ", ""), HOY)).toMatchObject({
      vencimiento: "2028-02-29",
      fabricacion: "2025-02-01",
      lote: "X",
    });
  });

  it("lee otros AI comunes sin confundirlos (cantidad, peso, SSCC, NHRN)", () => {
    const d = parsearGs1(`0107804100000006310300125010AB${GS}3712${GS}7151234567`, HOY);
    expect(d?.elementos).toEqual([
      { ai: "01", valor: "07804100000006" },
      { ai: "3103", valor: "001250" },
      { ai: "10", valor: "AB" },
      { ai: "37", valor: "12" },
      { ai: "715", valor: "1234567" },
    ]);
    // Sin (01) solo se acepta si el lector declaró simbología GS1.
    expect(parsearGs1("00106141410000000013", HOY)).toBeNull();
    expect(parsearGs1("]C100106141410000000013", HOY)).toMatchObject({ gtin: null, elementos: [{ ai: "00", valor: "106141410000000013" }] });
  });

  it("sin separador, un campo variable intermedio se traga lo que sigue (no se adivina)", () => {
    // Es lo que hace un lector que elimina el GS: el lote absorbe "17270531".
    expect(parsearGs1("010780410000000610AB1217270531", HOY)).toMatchObject({ lote: "AB1217270531", vencimiento: null });
  });

  it("devuelve null ante lecturas incompletas o inválidas", () => {
    const malas = [
      "",
      "   ",
      "0107804100000005" + "17270531", // GTIN con dígito verificador malo
      "01078041000000", // GTIN truncado
      "010780410000000617" + "2705", // fecha truncada
      "010780410000000617271340", // mes 13
      "010780410000000617270231", // 31 de febrero
      "0107804100000006" + "10", // lote vacío
      "0107804100000006" + "10" + "X".repeat(21), // lote de más de 20 caracteres
      "0107804100000006" + "89" + "ABC", // AI desconocido
      "0107804100000006" + "17" + "27O531", // letra en un campo numérico
      "0107804100000006" + "10AB€12", // carácter fuera del juego GS1
      "hola mundo",
      "7804100000006", // un EAN-13 pelado no es una cadena GS1
      "x".repeat(501),
    ];
    for (const mala of malas) expect(parsearGs1(mala, HOY), JSON.stringify(mala)).toBeNull();
    expect(parsearGs1(null, HOY)).toBeNull();
    expect(parsearGs1(undefined, HOY)).toBeNull();
  });
});

describe("parsearGs1: forma con paréntesis", () => {
  it("lee la forma legible por personas", () => {
    expect(parsearGs1("(01)07804100000006(17)270531(10)L2611-045", HOY)).toMatchObject({
      gtin: "07804100000006",
      vencimiento: "2027-05-31",
      lote: "L2611-045",
    });
    expect(parsearGs1("(01)07804100000006(10)LOTE 1(21)S-1(11)250301(17)270500", HOY)).toBeNull(); // espacio dentro del lote
    expect(parsearGs1("(01)07804100000006(10)LOTE-1(21)S-1(11)250301(17)270500", HOY)).toMatchObject({
      lote: "LOTE-1",
      serie: "S-1",
      fabricacion: "2025-03-01",
      vencimiento: "2027-05-31",
    });
    expect(parsearGs1("(01)07804100000006(3103)001250", HOY)?.elementos[1]).toEqual({ ai: "3103", valor: "001250" });
  });

  it("rechaza paréntesis mal formados, AI desconocidos y largos incorrectos", () => {
    for (const mala of [
      "(01)0780410000000", // 13 dígitos en un AI de 14
      "(01)07804100000005", // dígito verificador malo
      "(01)07804100000006(17)2705", // fecha corta
      "(01)07804100000006(89)X", // AI desconocido
      "(01)07804100000006basura(", // texto que sobra
      "(01)07804100000006(10)", // lote vacío
      "(1)07804100000006",
      "()",
    ]) {
      expect(parsearGs1(mala, HOY), mala).toBeNull();
    }
  });
});

describe("parsearGs1: GS1 Digital Link (QR)", () => {
  it("lee GTIN, lote y serie de la ruta y las fechas de la consulta", () => {
    expect(parsearGs1("https://id.gs1.org/01/07804100000006/10/L2611-045/21/S1?17=270531&11=250301&linkType=all", HOY)).toMatchObject({
      gtin: "07804100000006",
      lote: "L2611-045",
      serie: "S1",
      vencimiento: "2027-05-31",
      fabricacion: "2025-03-01",
    });
    // El GTIN puede venir en 13 dígitos y bajo cualquier dominio o prefijo de ruta.
    expect(parsearGs1("https://ejemplo.cl/productos/01/7804100000006", HOY)).toMatchObject({ gtin: "07804100000006", lote: null });
  });

  it("una URL cualquiera no es GS1", () => {
    expect(parsearGs1("https://ejemplo.cl/producto/123", HOY)).toBeNull();
    expect(parsearGs1("https://ejemplo.cl/01/7804100000005", HOY)).toBeNull();
    expect(parsearGs1("https://ejemplo.cl/01/7804100000006/10", HOY)).toBeNull();
  });
});

describe("interpretarCodigo: lo que entrega la cámara, un lector USB o una persona", () => {
  it("EAN-13, UPC-A, EAN-8 y GTIN-14 pelados", () => {
    expect(interpretarCodigo("7804100000006", HOY)).toEqual({
      tipo: "GTIN",
      codigo: "7804100000006",
      gtin: "07804100000006",
      candidatos: ["07804100000006", "7804100000006"],
      lote: null,
      vencimiento: null,
      fabricacion: null,
      serie: null,
    });
    expect(interpretarCodigo("036000291452", HOY)).toMatchObject({ tipo: "GTIN", gtin: "00036000291452" });
    expect(interpretarCodigo("73513537", HOY)).toMatchObject({ tipo: "GTIN", codigo: "73513537" });
    expect(interpretarCodigo("10614141000736", HOY)).toMatchObject({ tipo: "GTIN", candidatos: ["10614141000736"] });
    // Escrito con espacios o guiones, o con salto de línea del lector.
    expect(interpretarCodigo(" 7 804100 000006\n", HOY)).toMatchObject({ tipo: "GTIN", codigo: "7804100000006" });
    expect(interpretarCodigo("780-4100-000006", HOY)).toMatchObject({ tipo: "GTIN", codigo: "7804100000006" });
  });

  it("cadena GS1: código de producto + lote + vencimiento para prellenar el ingreso", () => {
    expect(interpretarCodigo(`]d20107804100000006172705311 0L2611-045`.replace(" ", ""), HOY)).toEqual({
      tipo: "GS1",
      codigo: "7804100000006",
      gtin: "07804100000006",
      candidatos: ["07804100000006", "7804100000006"],
      lote: "L2611-045",
      vencimiento: "2027-05-31",
      fabricacion: null,
      serie: null,
    });
    // Con indicador de empaque se conserva el GTIN-14.
    expect(interpretarCodigo("(01)10614141000736(17)270500(10)A1", HOY)).toMatchObject({
      tipo: "GS1",
      codigo: "10614141000736",
      vencimiento: "2027-05-31",
      lote: "A1",
    });
  });

  it("otro contenido se busca tal cual, sin caracteres de control ni identificador de simbología", () => {
    expect(interpretarCodigo("GUA-NIT-M", HOY)).toMatchObject({ tipo: "TEXTO", codigo: "GUA-NIT-M", candidatos: ["GUA-NIT-M"], gtin: null });
    expect(interpretarCodigo("]C0ABC\u0000123\u001d", HOY)).toMatchObject({ tipo: "TEXTO", codigo: "ABC123" });
    // Un número con dígito verificador incorrecto NO se trata como GTIN.
    expect(interpretarCodigo("7804100000005", HOY)).toMatchObject({ tipo: "TEXTO", codigo: "7804100000005" });
    // Una cadena con aspecto de GS1 pero inválida tampoco aporta lote ni fecha.
    expect(interpretarCodigo("010780410000000517270531", HOY)).toMatchObject({ tipo: "TEXTO", lote: null, vencimiento: null });
    expect(interpretarCodigo("x".repeat(200), HOY)?.codigo).toHaveLength(120);
  });

  it("vacío o demasiado largo → null", () => {
    expect(interpretarCodigo("", HOY)).toBeNull();
    expect(interpretarCodigo("   \n", HOY)).toBeNull();
    expect(interpretarCodigo("\u001d", HOY)).toBeNull();
    expect(interpretarCodigo(null, HOY)).toBeNull();
    expect(interpretarCodigo("1".repeat(301), HOY)).toBeNull();
  });
});

describe("rutas del flujo de escaneo", () => {
  it("hrefEscaneo lleva el código y los datos GS1 como parámetros simples", () => {
    expect(hrefEscaneo("7804100000006")).toBe("/movimientos/escanear?codigo=7804100000006");
    const gs1 = hrefEscaneo("(01)07804100000006(17)300531(10)L2611-045(11)250301", { ubicacion: "ubi1" });
    expect(gs1).toBe("/movimientos/escanear?codigo=7804100000006&lote=L2611-045&vence=2030-05-31&fab=2025-03-01&ubicacion=ubi1");
    expect(hrefEscaneo("   ")).toBeNull();
  });

  it("hrefIngresoEscaneado abre el ingreso prellenado", () => {
    expect(hrefIngresoEscaneado("ins1", { lote: "L1", vence: "2030-05-31", fab: null, ubicacion: null })).toBe(
      "/movimientos/ingreso?insumo=ins1&lote=L1&vence=2030-05-31&escaneado=1",
    );
  });
});
