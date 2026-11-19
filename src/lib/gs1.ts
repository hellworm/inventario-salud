/**
 * Códigos de barras: GTIN (EAN-13, EAN-8, UPC-A, GTIN-14) y cadenas GS1
 * (GS1-128, GS1 DataMatrix, GS1 QR y GS1 Digital Link).
 *
 * Código isomórfico y puro: lo usan el escáner (cliente) y la búsqueda por
 * código (servidor). No depende de ninguna librería de lectura.
 *
 * Los insumos médicos suelen traer un DataMatrix GS1 con:
 *   (01) GTIN · (17) vencimiento AAMMDD · (10) lote · (11) fabricación · (21) serie
 */
import { dateADia, hoyEnSantiago, type DiaISO } from "./fechas";

// ---------------------------------------------------------------------------
// GTIN
// ---------------------------------------------------------------------------

/** Largos válidos de un GTIN: EAN-8, UPC-A (12), EAN-13 y GTIN-14. */
const LARGOS_GTIN = [8, 12, 13, 14] as const;

/**
 * Dígito verificador GS1 (módulo 10) para el cuerpo de un GTIN (sin su último
 * dígito). Sirve para cualquier largo: desde la derecha, pesos 3, 1, 3, 1…
 */
export function digitoVerificadorGtin(cuerpo: string): number {
  let suma = 0;
  for (let i = cuerpo.length - 1, peso = 3; i >= 0; i--, peso = peso === 3 ? 1 : 3) {
    suma += (cuerpo.charCodeAt(i) - 48) * peso;
  }
  return (10 - (suma % 10)) % 10;
}

/** ¿Es un GTIN de 8, 12, 13 o 14 dígitos con dígito verificador correcto? */
export function validarGtin(codigo: string | null | undefined): boolean {
  if (!codigo || !/^\d+$/.test(codigo)) return false;
  if (!LARGOS_GTIN.some((n) => n === codigo.length)) return false;
  if (/^0+$/.test(codigo)) return false;
  return digitoVerificadorGtin(codigo.slice(0, -1)) === Number(codigo.slice(-1));
}

/**
 * Forma canónica de un GTIN: 14 dígitos, completando con ceros a la izquierda
 * (así EAN-13 `7804100000006`, UPC-A y GTIN-14 `07804100000006` son el mismo
 * producto). `null` si no es un GTIN válido.
 */
export function normalizarGtin(codigo: string | null | undefined): string | null {
  const limpio = (codigo ?? "").trim();
  return validarGtin(limpio) ? limpio.padStart(14, "0") : null;
}

/**
 * Todas las formas equivalentes de un GTIN (14, 13, 12 y 8 dígitos, según los
 * ceros a la izquierda que tenga), para compararlo con un código guardado en
 * cualquiera de ellas. Vacío si no es un GTIN válido.
 */
export function variantesGtin(codigo: string | null | undefined): string[] {
  const gtin14 = normalizarGtin(codigo);
  if (!gtin14) return [];
  const variantes = [gtin14];
  for (const largo of [13, 12, 8]) {
    const ceros = 14 - largo;
    if (/^0+$/.test(gtin14.slice(0, ceros))) variantes.push(gtin14.slice(ceros));
  }
  return variantes;
}

/**
 * Forma habitual de escribir un GTIN-14: sin el cero inicial si lo tiene
 * (EAN-13, el que va impreso bajo las barras); con indicador de empaque
 * (primer dígito 1–9) se conservan los 14.
 */
export function gtinParaMostrar(gtin14: string): string {
  return gtin14.startsWith("0") ? gtin14.slice(1) : gtin14;
}

// ---------------------------------------------------------------------------
// Cadenas GS1 (identificadores de aplicación)
// ---------------------------------------------------------------------------

/** Separador de campos variables: FNC1 se transmite como GS (ASCII 29). */
const GS = "\u001d";

interface DefinicionAi {
  /** Prefijo del identificador (2–4 dígitos; los AI con decimales se listan por su prefijo de 3). */
  prefijo: string;
  /** Largo total del identificador. */
  largoAi: number;
  /** Largo fijo del dato (no necesita separador). */
  fijo?: number;
  /** Largo máximo del dato variable (termina en GS o al final). */
  max?: number;
}

/**
 * Identificadores de aplicación admitidos (GS1 General Specifications). No es
 * la tabla completa: cubre logística, fechas, lote/serie, cantidades, pesos y
 * los de uso sanitario. Un AI desconocido invalida la lectura como GS1.
 */
const TABLA_AI: readonly DefinicionAi[] = [
  { prefijo: "00", largoAi: 2, fijo: 18 },
  { prefijo: "01", largoAi: 2, fijo: 14 },
  { prefijo: "02", largoAi: 2, fijo: 14 },
  { prefijo: "10", largoAi: 2, max: 20 },
  { prefijo: "11", largoAi: 2, fijo: 6 },
  { prefijo: "12", largoAi: 2, fijo: 6 },
  { prefijo: "13", largoAi: 2, fijo: 6 },
  { prefijo: "15", largoAi: 2, fijo: 6 },
  { prefijo: "16", largoAi: 2, fijo: 6 },
  { prefijo: "17", largoAi: 2, fijo: 6 },
  { prefijo: "20", largoAi: 2, fijo: 2 },
  { prefijo: "21", largoAi: 2, max: 20 },
  { prefijo: "22", largoAi: 2, max: 20 },
  { prefijo: "235", largoAi: 3, max: 28 },
  { prefijo: "240", largoAi: 3, max: 30 },
  { prefijo: "241", largoAi: 3, max: 30 },
  { prefijo: "242", largoAi: 3, max: 6 },
  { prefijo: "243", largoAi: 3, max: 20 },
  { prefijo: "250", largoAi: 3, max: 30 },
  { prefijo: "251", largoAi: 3, max: 30 },
  { prefijo: "253", largoAi: 3, max: 30 },
  { prefijo: "254", largoAi: 3, max: 20 },
  { prefijo: "30", largoAi: 2, max: 8 },
  // 310n–369n: medidas (peso, largo, volumen…): 4 dígitos de AI y 6 de dato.
  ...["31", "32", "33", "34", "35", "36"].map((p): DefinicionAi => ({ prefijo: p, largoAi: 4, fijo: 6 })),
  { prefijo: "37", largoAi: 2, max: 8 },
  { prefijo: "390", largoAi: 4, max: 15 },
  { prefijo: "391", largoAi: 4, max: 18 },
  { prefijo: "392", largoAi: 4, max: 15 },
  { prefijo: "393", largoAi: 4, max: 18 },
  { prefijo: "400", largoAi: 3, max: 30 },
  { prefijo: "401", largoAi: 3, max: 30 },
  { prefijo: "402", largoAi: 3, fijo: 17 },
  { prefijo: "403", largoAi: 3, max: 30 },
  ...["410", "411", "412", "413", "414", "415", "416", "417"].map((p): DefinicionAi => ({ prefijo: p, largoAi: 3, fijo: 13 })),
  { prefijo: "420", largoAi: 3, max: 20 },
  { prefijo: "421", largoAi: 3, max: 12 },
  { prefijo: "422", largoAi: 3, fijo: 3 },
  { prefijo: "7003", largoAi: 4, fijo: 10 },
  // 710–716: número nacional de reembolso sanitario (NHRN).
  ...["710", "711", "712", "713", "714", "715", "716"].map((p): DefinicionAi => ({ prefijo: p, largoAi: 3, max: 20 })),
  { prefijo: "8003", largoAi: 4, max: 30 },
  { prefijo: "8004", largoAi: 4, max: 30 },
  { prefijo: "8010", largoAi: 4, max: 30 },
  { prefijo: "8200", largoAi: 4, max: 70 },
  { prefijo: "90", largoAi: 2, max: 30 },
  ...["91", "92", "93", "94", "95", "96", "97", "98", "99"].map((p): DefinicionAi => ({ prefijo: p, largoAi: 2, max: 90 })),
];

function definicionDe(texto: string, desde: number): DefinicionAi | null {
  // El prefijo más largo primero ("7003" antes que un hipotético "70").
  for (const largo of [4, 3, 2]) {
    const prefijo = texto.slice(desde, desde + largo);
    if (prefijo.length < largo || !/^\d+$/.test(prefijo)) continue;
    const definicion = TABLA_AI.find((d) => d.prefijo === prefijo);
    if (definicion) return definicion;
  }
  return null;
}

/** Caracteres admitidos en un dato alfanumérico GS1 (juego 82 de caracteres). */
const RE_DATO_GS1 = /^[!"%&'()*+,\-./0-9:;<=>?A-Z_a-z]+$/;

export interface ElementoGs1 {
  /** Identificador de aplicación ("01", "17", "3103"…). */
  ai: string;
  valor: string;
}

export interface DatosGs1 {
  /** GTIN del AI (01), en 14 dígitos y con dígito verificador válido; `null` si no viene. */
  gtin: string | null;
  /** Lote, AI (10). */
  lote: string | null;
  /** Vencimiento, AI (17). */
  vencimiento: DiaISO | null;
  /** Fabricación, AI (11). */
  fabricacion: DiaISO | null;
  /** Serie, AI (21). */
  serie: string | null;
  /** Todos los elementos leídos, en orden. */
  elementos: ElementoGs1[];
}

/**
 * Interpreta una fecha GS1 `AAMMDD`.
 *
 * - Siglo (GS1 General Specifications §7.12): con `d = AA − (año actual % 100)`,
 *   si `d ≥ 51` es del siglo anterior, si `d ≤ −50` del siguiente y si no del
 *   actual (en 2026: "76" → 2076, "77" → 1977).
 * - Día `00` (solo se conoce el mes): `ultimoDia` → último día del mes (así se
 *   lee un vencimiento); si no, el día 1 (fabricación).
 * Devuelve `null` si no es una fecha real.
 */
export function fechaGs1(aammdd: string, opciones: { diaCero: "ultimoDia" | "primerDia"; hoy?: DiaISO }): DiaISO | null {
  if (!/^\d{6}$/.test(aammdd)) return null;
  const aa = Number(aammdd.slice(0, 2));
  const mes = Number(aammdd.slice(2, 4));
  let dia = Number(aammdd.slice(4, 6));
  if (mes < 1 || mes > 12) return null;
  const anioActual = Number((opciones.hoy ?? hoyEnSantiago()).slice(0, 4));
  let siglo = Math.floor(anioActual / 100);
  const diferencia = aa - (anioActual % 100);
  if (diferencia >= 51) siglo -= 1;
  else if (diferencia <= -50) siglo += 1;
  const anio = siglo * 100 + aa;
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  if (dia === 0) dia = opciones.diaCero === "ultimoDia" ? ultimoDia : 1;
  if (dia > ultimoDia) return null;
  return dateADia(new Date(Date.UTC(anio, mes - 1, dia)));
}

function armarDatos(elementos: ElementoGs1[], hoy?: DiaISO): DatosGs1 | null {
  if (elementos.length === 0) return null;
  const valorDe = (ai: string) => elementos.find((e) => e.ai === ai)?.valor ?? null;
  const gtinLeido = valorDe("01");
  // Un (01) con dígito verificador incorrecto es una mala lectura: se descarta todo.
  if (gtinLeido !== null && !validarGtin(gtinLeido)) return null;
  const vencimientoLeido = valorDe("17");
  const fabricacionLeida = valorDe("11");
  const vencimiento = vencimientoLeido ? fechaGs1(vencimientoLeido, { diaCero: "ultimoDia", hoy }) : null;
  const fabricacion = fabricacionLeida ? fechaGs1(fabricacionLeida, { diaCero: "primerDia", hoy }) : null;
  if ((vencimientoLeido && !vencimiento) || (fabricacionLeida && !fabricacion)) return null;
  return { gtin: gtinLeido, lote: valorDe("10"), vencimiento, fabricacion, serie: valorDe("21"), elementos };
}

/** Valida un dato contra la definición de su AI. */
function datoValido(definicion: DefinicionAi, valor: string): boolean {
  if (valor.length === 0) return false;
  if (definicion.fijo !== undefined) return valor.length === definicion.fijo && /^\d+$/.test(valor);
  return valor.length <= (definicion.max ?? 0) && RE_DATO_GS1.test(valor);
}

/** Forma con paréntesis: `(01)07804100000006(17)270531(10)L2611-045`. */
function parsearConParentesis(texto: string, hoy?: DiaISO): DatosGs1 | null {
  const elementos: ElementoGs1[] = [];
  const re = /\((\d{2,4})\)([^(]*)/gy;
  let fin = 0;
  for (let m = re.exec(texto); m !== null; m = re.exec(texto)) {
    const ai = m[1]!;
    const valor = m[2]!.replaceAll(GS, "").trim();
    const definicion = definicionDe(ai, 0);
    if (!definicion || definicion.largoAi !== ai.length || !datoValido(definicion, valor)) return null;
    elementos.push({ ai, valor });
    fin = re.lastIndex;
  }
  if (fin !== texto.length) return null;
  return armarDatos(elementos, hoy);
}

/** Forma cruda: AI y datos seguidos; los datos de largo variable terminan en GS (FNC1) o al final. */
function parsearCrudo(texto: string, hoy?: DiaISO): DatosGs1 | null {
  const elementos: ElementoGs1[] = [];
  let pos = 0;
  while (pos < texto.length) {
    if (texto[pos] === GS) {
      pos++;
      continue;
    }
    const definicion = definicionDe(texto, pos);
    if (!definicion) return null;
    const ai = texto.slice(pos, pos + definicion.largoAi);
    if (ai.length < definicion.largoAi || !/^\d+$/.test(ai)) return null;
    pos += definicion.largoAi;
    let valor: string;
    if (definicion.fijo !== undefined) {
      valor = texto.slice(pos, pos + definicion.fijo);
      pos += definicion.fijo;
    } else {
      const corte = texto.indexOf(GS, pos);
      valor = corte === -1 ? texto.slice(pos) : texto.slice(pos, corte);
      pos = corte === -1 ? texto.length : corte + 1;
    }
    if (!datoValido(definicion, valor)) return null;
    elementos.push({ ai, valor });
  }
  return armarDatos(elementos, hoy);
}

/** GS1 Digital Link: `https://id.gs1.org/01/07804100000006/10/L2611?17=270531`. */
function parsearDigitalLink(texto: string, hoy?: DiaISO): DatosGs1 | null {
  if (!/^https?:\/\//i.test(texto)) return null;
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return null;
  }
  const partes = url.pathname.split("/").filter(Boolean);
  const inicio = partes.indexOf("01");
  if (inicio === -1 || (partes.length - inicio) % 2 !== 0) return null;
  const elementos: ElementoGs1[] = [];
  const agregar = (ai: string, bruto: string): boolean => {
    let valor: string;
    try {
      valor = decodeURIComponent(bruto);
    } catch {
      return false;
    }
    const definicion = definicionDe(ai, 0);
    // En Digital Link el GTIN puede venir en 8, 12 o 13 dígitos: se completa a 14.
    if (ai === "01" && /^\d{8,14}$/.test(valor)) valor = valor.padStart(14, "0");
    if (!definicion || definicion.largoAi !== ai.length || !datoValido(definicion, valor)) return false;
    elementos.push({ ai, valor });
    return true;
  };
  for (let i = inicio; i < partes.length; i += 2) {
    if (!agregar(partes[i]!, partes[i + 1]!)) return null;
  }
  for (const [clave, valor] of url.searchParams) {
    // Los parámetros que no son identificadores de aplicación (p. ej. `linkType`) se ignoran.
    if (/^\d{2,4}$/.test(clave) && !agregar(clave, valor)) return null;
  }
  return armarDatos(elementos, hoy);
}

/**
 * Quita lo que los lectores anteponen o intercalan y deja la cadena en forma
 * cruda: identificador de simbología (`]d2`, `]C1`, `]Q3`, `]e0`…), FNC1
 * inicial y marcadores de texto del separador (`<GS>`, `{GS}`, `^]`).
 */
function limpiarLectura(texto: string): { texto: string; simbologiaGs1: boolean } {
  let t = texto.trim();
  const simbologia = /^\][A-Za-z][0-9A-Za-z]/.exec(t);
  // ]C1 (GS1-128), ]e0 (DataBar), ]d2 (GS1 DataMatrix), ]Q3 (GS1 QR), ]J1 (GS1 DotCode).
  const simbologiaGs1 = simbologia !== null && /^\](C1|e0|d2|Q3|J1)$/.test(simbologia[0]);
  if (simbologia) t = t.slice(3);
  t = t.replace(/<GS>|\{GS\}|\^\]|\\x1d|\\u001d/gi, GS);
  while (t.startsWith(GS)) t = t.slice(1);
  return { texto: t, simbologiaGs1 };
}

/**
 * Interpreta una cadena GS1 en cualquiera de sus formas (con paréntesis, cruda
 * con FNC1/GS, o Digital Link). Devuelve `null` si el texto no es una cadena
 * GS1 válida y completa: no adivina.
 *
 * Para no confundir un código numérico cualquiera con una cadena GS1, la forma
 * cruda solo se acepta si trae un GTIN (01) válido o si el lector declaró una
 * simbología GS1 (`]d2`, `]C1`…).
 */
export function parsearGs1(textoLeido: string | null | undefined, hoy?: DiaISO): DatosGs1 | null {
  if (!textoLeido) return null;
  const { texto, simbologiaGs1 } = limpiarLectura(textoLeido);
  if (texto === "" || texto.length > 500) return null;
  if (texto.startsWith("(")) return parsearConParentesis(texto, hoy);
  if (/^https?:\/\//i.test(texto)) return parsearDigitalLink(texto, hoy);
  const datos = parsearCrudo(texto, hoy);
  if (!datos) return null;
  return datos.gtin !== null || simbologiaGs1 ? datos : null;
}

// ---------------------------------------------------------------------------
// Interpretación de un código escaneado o escrito
// ---------------------------------------------------------------------------

/** Largo máximo de un código leído (un DataMatrix GS1 típico tiene 40–60 caracteres). */
export const LARGO_MAXIMO_CODIGO = 300;

export interface CodigoInterpretado {
  /**
   * - `GS1`: cadena con identificadores de aplicación (puede traer lote y fechas).
   * - `GTIN`: EAN-13, EAN-8, UPC-A o GTIN-14 con dígito verificador válido.
   * - `TEXTO`: cualquier otro contenido (Code 128 o QR con un código propio).
   */
  tipo: "GS1" | "GTIN" | "TEXTO";
  /** Código del producto tal como se muestra y se guarda en el insumo (EAN-13, GTIN-14 o el texto leído). */
  codigo: string;
  /** GTIN en 14 dígitos, si el código es de producto. */
  gtin: string | null;
  /** Valores con los que puede estar guardado el mismo producto (`Insumo.codigoBarras`). */
  candidatos: string[];
  lote: string | null;
  vencimiento: DiaISO | null;
  fabricacion: DiaISO | null;
  serie: string | null;
}

/**
 * Interpreta lo que entrega un lector (cámara, pistola USB/Bluetooth) o lo que
 * escribe una persona. `null` si viene vacío o es demasiado largo.
 */
export function interpretarCodigo(textoLeido: string | null | undefined, hoy?: DiaISO): CodigoInterpretado | null {
  const bruto = (textoLeido ?? "").trim();
  if (bruto === "" || bruto.length > LARGO_MAXIMO_CODIGO) return null;

  // 1. Código de producto "pelado" (con o sin espacios o guiones de separación).
  const soloDigitos = bruto.replace(/[\s-]/g, "");
  if (/^\d+$/.test(soloDigitos) && validarGtin(soloDigitos)) {
    const gtin = normalizarGtin(soloDigitos)!;
    return {
      tipo: "GTIN",
      codigo: soloDigitos,
      gtin,
      candidatos: variantesGtin(gtin),
      lote: null,
      vencimiento: null,
      fabricacion: null,
      serie: null,
    };
  }

  // 2. Cadena GS1.
  const gs1 = parsearGs1(bruto, hoy);
  if (gs1) {
    const { gtin, lote, vencimiento, fabricacion, serie } = gs1;
    if (gtin) {
      return { tipo: "GS1", codigo: gtinParaMostrar(gtin), gtin, candidatos: variantesGtin(gtin), lote, vencimiento, fabricacion, serie };
    }
  }

  // 3. Otro contenido: se busca tal cual (sin identificador de simbología ni caracteres de control).
  const texto = limpiarLectura(bruto).texto.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120);
  if (texto === "") return null;
  return { tipo: "TEXTO", codigo: texto, gtin: null, candidatos: [texto], lote: null, vencimiento: null, fabricacion: null, serie: null };
}
