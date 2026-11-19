import { formatearRut } from "@/lib/chile/rut";
import { ETIQUETA_TIPO_CENTRO, ETIQUETA_TIPO_UBICACION } from "@/lib/estados";
import { formatearDia } from "@/lib/fechas";
import { formatearNumero } from "@/lib/formato";
import { NOMBRE_ROL } from "@/lib/permisos";

/**
 * Traducción del registro de auditoría a lenguaje de usuario: nombres de
 * acciones, entidades y campos, y formato de valores. Todo tiene un respaldo
 * genérico, así que una acción nueva se ve razonable aunque no esté listada.
 */

export type ValorJson = string | number | boolean | null | ValorJson[] | { [clave: string]: ValorJson };
export type DetalleAuditoria = { [clave: string]: ValorJson };
export type TonoAccion = "neutro" | "marca" | "exito" | "alerta" | "peligro" | "info";

const ETIQUETA_ACCION: Readonly<Record<string, string>> = {
  LOGIN_OK: "Inicio de sesión",
  LOGIN_FALLIDO: "Intento de ingreso fallido",
  LOGIN_BLOQUEADO: "Ingreso rechazado (cuenta bloqueada)",
  LOGOUT: "Cierre de sesión",
  PASSWORD_CAMBIADA: "Cambió su contraseña",
  MOVIMIENTO_INGRESO: "Ingreso de stock",
  MOVIMIENTO_RETIRO: "Retiro de stock",
  MOVIMIENTO_AJUSTE: "Ajuste de stock",
  MOVIMIENTO_MERMA: "Merma",
  MOVIMIENTO_TRASLADO: "Traslado",
  LOTE_CREADO: "Lote creado",
  INSUMO_CREADO: "Insumo creado",
  INSUMO_ACTUALIZADO: "Insumo modificado",
  INSUMO_ACTIVADO: "Insumo reactivado",
  INSUMO_DESACTIVADO: "Insumo desactivado",
  INSUMO_ELIMINADO: "Insumo eliminado",
  PARAMETROS_STOCK_ACTUALIZADOS: "Mínimos y máximos modificados",
  CATEGORIA_CREADA: "Categoría creada",
  CATEGORIA_ACTUALIZADA: "Categoría renombrada",
  CATEGORIA_ELIMINADA: "Categoría eliminada",
  CENTRO_CREADO: "Centro creado",
  CENTRO_ACTUALIZADO: "Centro modificado",
  CENTRO_ACTIVADO: "Centro reactivado",
  CENTRO_DESACTIVADO: "Centro desactivado",
  UBICACION_CREADA: "Ubicación creada",
  UBICACION_ACTUALIZADA: "Ubicación modificada",
  UBICACION_ACTIVADA: "Ubicación reactivada",
  UBICACION_DESACTIVADA: "Ubicación desactivada",
  PROVEEDOR_CREADO: "Proveedor creado",
  PROVEEDOR_ACTUALIZADO: "Proveedor modificado",
  PROVEEDOR_ACTIVADO: "Proveedor reactivado",
  PROVEEDOR_DESACTIVADO: "Proveedor desactivado",
  USUARIO_CREADO: "Usuario creado",
  USUARIO_ACTUALIZADO: "Usuario modificado",
  USUARIO_ACTIVADO: "Usuario reactivado",
  USUARIO_DESACTIVADO: "Usuario desactivado",
  USUARIO_PASSWORD_RESTABLECIDA: "Contraseña restablecida",
  USUARIO_DESBLOQUEADO: "Cuenta desbloqueada",
};

const ETIQUETA_ENTIDAD: Readonly<Record<string, string>> = {
  Usuario: "Usuario",
  Insumo: "Insumo",
  Categoria: "Categoría",
  Centro: "Centro",
  Ubicacion: "Ubicación",
  Proveedor: "Proveedor",
  Movimiento: "Movimiento",
  Lote: "Lote",
};

const ETIQUETA_CAMPO: Readonly<Record<string, string>> = {
  nombre: "Nombre",
  email: "Email",
  rol: "Rol",
  centros: "Centros",
  centro: "Centro",
  codigo: "Código",
  categoria: "Categoría",
  descripcion: "Descripción",
  unidadMedida: "Unidad de medida",
  presentacion: "Presentación",
  fabricante: "Fabricante",
  registroSanitario: "Registro sanitario ISP",
  codigoBarras: "Código de barras",
  requiereCadenaFrio: "Requiere cadena de frío",
  controlaVencimiento: "Controla vencimiento",
  tipo: "Tipo",
  rut: "RUT",
  direccion: "Dirección",
  region: "Región",
  comuna: "Comuna",
  telefono: "Teléfono",
  razonSocial: "Razón social",
  contacto: "Contacto",
  insumo: "Insumo",
  lote: "Lote",
  numeroLote: "Número de lote",
  fechaVencimiento: "Vencimiento",
  fechaFabricacion: "Fabricación",
  cantidad: "Cantidad",
  saldoPosterior: "Saldo del lote después",
  ubicacion: "Ubicación",
  motivo: "Motivo",
  modo: "Selección de lote",
  sentido: "Sentido",
  documentoRef: "Documento de respaldo",
  proveedor: "Proveedor",
  costoUnitario: "Costo unitario",
  nota: "Nota",
  origen: "Origen",
  destino: "Destino",
  entreCentros: "Entre centros distintos",
  sesionesCerradas: "Sesiones cerradas",
};

/** Claves técnicas que no aportan a quien lee (se dejan solo en "datos técnicos"). */
const CLAVES_TECNICAS = new Set(["cambios", "trasladoGrupoId", "movimientoEntradaId", "movimientoSalidaId"]);

const VALORES_CONOCIDOS: Readonly<Record<string, string>> = {
  ...NOMBRE_ROL,
  ...ETIQUETA_TIPO_CENTRO,
  ...ETIQUETA_TIPO_UBICACION,
  FEFO: "Automática (primero el que vence antes)",
  MANUAL: "Lote elegido a mano",
  POSITIVO: "Aumenta el stock (+)",
  NEGATIVO: "Disminuye el stock (−)",
  email_desconocido: "El email no corresponde a ningún usuario",
  password_incorrecta: "Contraseña incorrecta",
  usuario_inactivo: "El usuario está desactivado",
};

function aPalabras(clave: string): string {
  const texto = clave
    .replace(/_/g, " ")
    .replace(/([a-záéíóúñ])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function etiquetaAccion(accion: string): string {
  return ETIQUETA_ACCION[accion] ?? aPalabras(accion);
}

export function etiquetaEntidad(entidad: string): string {
  return ETIQUETA_ENTIDAD[entidad] ?? aPalabras(entidad);
}

export function etiquetaCampo(campo: string): string {
  return ETIQUETA_CAMPO[campo] ?? aPalabras(campo);
}

export function tonoAccion(accion: string): TonoAccion {
  if (/^LOGIN_(FALLIDO|BLOQUEADO)$/.test(accion)) return "alerta";
  if (/^(LOGIN_OK|LOGOUT)$/.test(accion)) return "neutro";
  if (/_(DESACTIVAD[OA]|ELIMINAD[OA])$/.test(accion) || accion === "MOVIMIENTO_MERMA") return "peligro";
  if (/_(CREAD[OA]|ACTIVAD[OA])$/.test(accion) || accion === "MOVIMIENTO_INGRESO") return "exito";
  if (accion.startsWith("MOVIMIENTO_")) return "marca";
  return "info";
}

/** Valor suelto → texto legible ("—" si está vacío). */
export function formatearValor(campo: string, valor: ValorJson | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (typeof valor === "number") return formatearNumero(valor);
  if (typeof valor === "string") {
    if (campo === "rut") return formatearRut(valor);
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return formatearDia(valor);
    return VALORES_CONOCIDOS[valor] ?? valor;
  }
  if (Array.isArray(valor)) {
    if (valor.length === 0) return "Ninguno";
    return valor.map((v) => formatearValor(campo, v)).join(", ");
  }
  return Object.entries(valor)
    .map(([k, v]) => `${etiquetaCampo(k)}: ${formatearValor(k, v)}`)
    .join(" · ");
}

export interface CambioCampo {
  campo: string;
  antes: string;
  despues: string;
}

/** `detalle.cambios` → filas "campo / antes / después". */
export function extraerCambios(detalle: DetalleAuditoria): CambioCampo[] {
  const cambios = detalle.cambios;
  if (cambios === null || typeof cambios !== "object" || Array.isArray(cambios)) return [];
  return Object.entries(cambios).flatMap(([campo, par]) => {
    if (par === null || typeof par !== "object" || Array.isArray(par)) return [];
    return [{ campo: etiquetaCampo(campo), antes: formatearValor(campo, par.antes), despues: formatearValor(campo, par.despues) }];
  });
}

export interface CambioParametro {
  centro: string;
  minimoAntes: string;
  minimoDespues: string;
  maximoAntes: string;
  maximoDespues: string;
}

/** Detalle de `PARAMETROS_STOCK_ACTUALIZADOS` → una fila por centro. */
export function extraerParametros(detalle: DetalleAuditoria): CambioParametro[] {
  const centros = detalle.centros;
  if (!Array.isArray(centros)) return [];
  const numero = (v: ValorJson | undefined) => (typeof v === "number" ? formatearNumero(v) : "Sin definir");
  return centros.flatMap((c) => {
    if (c === null || typeof c !== "object" || Array.isArray(c) || typeof c.centro !== "string") return [];
    return [
      {
        centro: c.centro,
        minimoAntes: numero(c.minimoAntes),
        minimoDespues: numero(c.minimoDespues),
        maximoAntes: numero(c.maximoAntes),
        maximoDespues: numero(c.maximoDespues),
      },
    ];
  });
}

/** Pares etiqueta / valor del detalle, sin claves técnicas ni estructuras con vista propia. */
export function extraerDatos(detalle: DetalleAuditoria): { etiqueta: string; valor: string }[] {
  const esParametros = extraerParametros(detalle).length > 0;
  return Object.entries(detalle)
    .filter(([clave]) => !CLAVES_TECNICAS.has(clave) && !(esParametros && clave === "centros"))
    .map(([clave, valor]) => ({ etiqueta: etiquetaCampo(clave), valor: formatearValor(clave, valor) }));
}

/** Frase corta para la tabla: sobre qué recayó la acción. */
export function resumenAuditoria(accion: string, detalle: DetalleAuditoria): string {
  const t = (clave: string) => (typeof detalle[clave] === "string" ? (detalle[clave] as string) : null);
  const n = (clave: string) => (typeof detalle[clave] === "number" ? formatearNumero(detalle[clave] as number) : null);

  if (accion === "MOVIMIENTO_TRASLADO") {
    return [n("cantidad") && t("insumo") ? `${n("cantidad")} × ${t("insumo")}` : t("insumo"), t("origen") && t("destino") ? `${t("origen")} → ${t("destino")}` : null]
      .filter(Boolean)
      .join(" · ");
  }
  if (accion.startsWith("MOVIMIENTO_")) {
    return [n("cantidad") && t("insumo") ? `${n("cantidad")} × ${t("insumo")}` : t("insumo"), t("lote") ? `lote ${t("lote")}` : null, t("centro")]
      .filter(Boolean)
      .join(" · ");
  }
  if (accion === "LOTE_CREADO") return [t("insumo"), t("numeroLote") ? `lote ${t("numeroLote")}` : null].filter(Boolean).join(" · ");
  if (accion === "LOGIN_FALLIDO") return t("motivo") ? formatearValor("motivo", t("motivo")) : "";

  const sujeto = t("razonSocial") ?? t("nombre") ?? t("email") ?? "";
  const cambios = extraerCambios(detalle);
  if (cambios.length > 0) {
    const campos = cambios.map((c) => c.campo.toLowerCase()).join(", ");
    return sujeto ? `${sujeto} · cambió ${campos}` : `Cambió ${campos}`;
  }
  const parametros = extraerParametros(detalle);
  if (parametros.length > 0) return `${sujeto} · ${parametros.map((p) => p.centro).join(", ")}`;
  const contexto = t("centro");
  return contexto && sujeto ? `${sujeto} · ${contexto}` : sujeto;
}
