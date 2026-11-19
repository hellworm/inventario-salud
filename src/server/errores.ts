/** Errores de dominio: tienen un código estable y un mensaje en español. */

export const CODIGOS_ERROR = [
  "NO_AUTENTICADO",
  "SIN_PERMISO",
  "SIN_ACCESO_AL_CENTRO",
  "VALIDACION",
  "NO_ENCONTRADO",
  "INACTIVO",
  "DUPLICADO",
  "EN_USO",
  "STOCK_INSUFICIENTE",
  "LOTE_VENCIDO",
  "LOTE_INCONSISTENTE",
  "VENCIMIENTO_REQUERIDO",
  "TRASLADO_INVALIDO",
  "CREDENCIALES_INVALIDAS",
  "PASSWORD_DEBIL",
  "PASSWORD_ACTUAL_INCORRECTA",
  "OPERACION_INVALIDA",
] as const;
export type CodigoError = (typeof CODIGOS_ERROR)[number];

export class ErrorDominio extends Error {
  readonly codigo: CodigoError;
  /** Datos extra para la UI o los tests (p. ej. stock disponible). */
  readonly detalle?: Readonly<Record<string, unknown>>;
  /** Campo del formulario al que corresponde el error, si aplica. */
  readonly campo?: string;

  constructor(
    codigo: CodigoError,
    mensaje: string,
    opciones?: { detalle?: Record<string, unknown>; campo?: string },
  ) {
    super(mensaje);
    this.name = "ErrorDominio";
    this.codigo = codigo;
    this.detalle = opciones?.detalle;
    this.campo = opciones?.campo;
  }
}

export function esErrorDominio(error: unknown): error is ErrorDominio {
  return error instanceof ErrorDominio;
}

/** Atajo para "no existe o no tienes acceso" (no se distingue, a propósito). */
export function noEncontrado(entidad: string): ErrorDominio {
  return new ErrorDominio("NO_ENCONTRADO", `${entidad} no existe o no tienes acceso.`);
}
