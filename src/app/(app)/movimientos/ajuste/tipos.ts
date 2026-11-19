/** Operaciones de la página "Ajuste o merma" (valor del parámetro `?tipo=`). */
export const TIPOS_AJUSTE = ["SUMAR", "RESTAR", "MERMA"] as const;
export type TipoAjuste = (typeof TIPOS_AJUSTE)[number];
