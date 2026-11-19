/**
 * Fechas en zona horaria de Chile continental.
 *
 * - Un "día" (vencimiento, fabricación) se maneja como texto ISO `YYYY-MM-DD`
 *   o como `Date` a medianoche UTC (así lo entrega Prisma para columnas DATE).
 * - Un "instante" (creadoEn) es un `Date` normal y se muestra en hora de Santiago.
 */

export const ZONA_HORARIA = "America/Santiago";

/** Día calendario en formato ISO `YYYY-MM-DD`. */
export type DiaISO = string;

const fmtPartesDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_HORARIA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Día calendario en Santiago para un instante dado (por defecto, ahora). */
export function diaEnSantiago(instante: Date = new Date()): DiaISO {
  return fmtPartesDia.format(instante);
}

/** Alias legible: el "hoy" de Chile. */
export function hoyEnSantiago(ahora: Date = new Date()): DiaISO {
  return diaEnSantiago(ahora);
}

const RE_DIA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_DIA_CL = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/;

function esDiaValido(anio: number, mes: number, dia: number): boolean {
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/**
 * Interpreta `YYYY-MM-DD` (input type=date) o `dd-MM-yyyy` y devuelve el día
 * ISO, o `null` si no es una fecha real.
 */
export function parsearDia(texto: string | null | undefined): DiaISO | null {
  if (!texto) return null;
  const t = texto.trim();
  let anio: number, mes: number, dia: number;
  const iso = RE_DIA_ISO.exec(t);
  const cl = RE_DIA_CL.exec(t);
  if (iso) {
    [anio, mes, dia] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (cl) {
    [dia, mes, anio] = [Number(cl[1]), Number(cl[2]), Number(cl[3])];
  } else {
    return null;
  }
  if (!esDiaValido(anio, mes, dia)) return null;
  return `${String(anio).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Rango admitido para las fechas de FILTROS (historial, reportes, auditoría). */
export const DIA_FILTRO_MINIMO: DiaISO = "2000-01-01";
export const DIA_FILTRO_MAXIMO: DiaISO = "2100-12-31";

/**
 * Como `parsearDia`, pero para filtros de consulta: una fecha fuera de
 * 2000–2100 se ignora (`null`). Único punto donde se acotan: lo usan los
 * lectores de URL y, como defensa, los servicios. Sin esto, `?desde=9999-12-31`
 * produce instantes fuera del rango que maneja la base de datos.
 */
export function parsearDiaFiltro(texto: string | null | undefined): DiaISO | null {
  const dia = parsearDia(texto);
  return dia !== null && dia >= DIA_FILTRO_MINIMO && dia <= DIA_FILTRO_MAXIMO ? dia : null;
}

/** Día ISO → `Date` a medianoche UTC (lo que espera Prisma para columnas DATE). */
export function diaADate(dia: DiaISO): Date {
  return new Date(`${dia}T00:00:00.000Z`);
}

/** `Date` de una columna DATE (medianoche UTC) → día ISO. */
export function dateADia(fecha: Date): DiaISO {
  return fecha.toISOString().slice(0, 10);
}

/** Suma (o resta) días a un día ISO. */
export function sumarDias(dia: DiaISO, cantidad: number): DiaISO {
  const d = diaADate(dia);
  d.setUTCDate(d.getUTCDate() + cantidad);
  return dateADia(d);
}

/** Días completos desde `desde` hasta `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: DiaISO, hasta: DiaISO): number {
  return Math.round((diaADate(hasta).getTime() - diaADate(desde).getTime()) / 86_400_000);
}

/** Instante en que comienza un día calendario de Santiago (para filtros por fecha). */
export function inicioDelDia(dia: DiaISO): Date {
  // Se prueba el desfase real de ese día (Chile cambia entre UTC-3 y UTC-4).
  for (const desfase of [3, 4, 5, 6]) {
    const candidato = new Date(`${dia}T00:00:00.000Z`);
    candidato.setUTCHours(desfase);
    if (diaEnSantiago(candidato) === dia && diaEnSantiago(new Date(candidato.getTime() - 1)) !== dia) {
      return candidato;
    }
  }
  const respaldo = new Date(`${dia}T00:00:00.000Z`);
  respaldo.setUTCHours(4);
  return respaldo;
}

/** Instante en que termina (exclusivo) un día calendario de Santiago. */
export function finDelDia(dia: DiaISO): Date {
  return inicioDelDia(sumarDias(dia, 1));
}

function aDia(valor: Date | DiaISO): DiaISO {
  return typeof valor === "string" ? valor : dateADia(valor);
}

/** Día → `dd-MM-yyyy`. Acepta día ISO o `Date` de columna DATE. */
export function formatearDia(valor: Date | DiaISO | null | undefined): string {
  if (!valor) return "—";
  const [anio, mes, dia] = aDia(valor).split("-");
  return `${dia}-${mes}-${anio}`;
}

const fmtFechaHora = new Intl.DateTimeFormat("es-CL", {
  timeZone: ZONA_HORARIA,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function partes(fmt: Intl.DateTimeFormat, instante: Date): Record<string, string> {
  const r: Record<string, string> = {};
  for (const p of fmt.formatToParts(instante)) r[p.type] = p.value;
  return r;
}

/** Instante → `dd-MM-yyyy` en hora de Santiago. */
export function formatearFecha(instante: Date | null | undefined): string {
  if (!instante) return "—";
  return formatearDia(diaEnSantiago(instante));
}

/** Instante → `dd-MM-yyyy HH:mm` en hora de Santiago. */
export function formatearFechaHora(instante: Date | null | undefined): string {
  if (!instante) return "—";
  const p = partes(fmtFechaHora, instante);
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}`;
}

const fmtRelativo = new Intl.RelativeTimeFormat("es-CL", { numeric: "auto" });

/** "hace 3 horas", "ayer", "en 5 días"… */
export function formatearRelativo(instante: Date, ahora: Date = new Date()): string {
  const seg = Math.round((instante.getTime() - ahora.getTime()) / 1000);
  const abs = Math.abs(seg);
  if (abs < 60) return "hace un momento";
  if (abs < 3600) return fmtRelativo.format(Math.trunc(seg / 60), "minute");
  if (abs < 86_400) return fmtRelativo.format(Math.trunc(seg / 3600), "hour");
  if (abs < 86_400 * 30) return fmtRelativo.format(Math.trunc(seg / 86_400), "day");
  return formatearFecha(instante);
}

/** Texto corto para un vencimiento: "Vence en 12 días", "Venció hace 3 días". */
export function describirVencimiento(dias: number | null): string {
  if (dias === null) return "Sin vencimiento";
  if (dias < -1) return `Venció hace ${-dias} días`;
  if (dias === -1) return "Venció ayer";
  if (dias === 0) return "Vence hoy";
  if (dias === 1) return "Vence mañana";
  return `Vence en ${dias} días`;
}
