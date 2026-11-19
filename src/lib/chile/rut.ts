/** Utilidades de RUT chileno (módulo 11). */

/** Quita puntos, guiones y espacios; deja la K en mayúscula. */
export function limpiarRut(valor: string): string {
  return valor.replace(/[^0-9kK]/g, "").toUpperCase();
}

/** Calcula el dígito verificador para el cuerpo numérico de un RUT. */
export function calcularDv(cuerpo: number | string): string {
  const digitos = String(cuerpo).replace(/\D/g, "");
  let suma = 0;
  let factor = 2;
  for (let i = digitos.length - 1; i >= 0; i--) {
    suma += Number(digitos[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

/** Valida formato y dígito verificador. Acepta con o sin puntos/guion. */
export function validarRut(valor: string | null | undefined): boolean {
  if (!valor) return false;
  if (!/^[0-9.\s]+-?\s*[0-9kK]$/.test(valor.trim())) return false;
  const limpio = limpiarRut(valor);
  if (limpio.length < 2 || limpio.length > 9) return false;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  if (!/^\d+$/.test(cuerpo) || Number(cuerpo) < 1) return false;
  return calcularDv(cuerpo) === dv;
}

/** Forma canónica para guardar en BD: `76123456-7` (sin puntos, con guion). */
export function normalizarRut(valor: string): string {
  const limpio = limpiarRut(valor);
  if (limpio.length < 2) return limpio;
  return `${Number(limpio.slice(0, -1))}-${limpio.slice(-1)}`;
}

/** Forma para mostrar: `76.123.456-7`. Si no es interpretable, devuelve el original. */
export function formatearRut(valor: string | null | undefined): string {
  if (!valor) return "";
  const limpio = limpiarRut(valor);
  if (limpio.length < 2) return valor;
  const cuerpo = String(Number(limpio.slice(0, -1)));
  const conPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${conPuntos}-${limpio.slice(-1)}`;
}
