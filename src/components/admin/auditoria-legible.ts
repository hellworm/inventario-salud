import { formatearRut } from "@/lib/chile/rut";
import { ETIQUETA_TIPO_CENTRO, ETIQUETA_TIPO_MOVIMIENTO, ETIQUETA_TIPO_UBICACION } from "@/lib/estados";
import { formatearDia, formatearFechaHora } from "@/lib/fechas";
import { formatearNumero } from "@/lib/formato";
import { NOMBRE_ROL } from "@/lib/permisos";

/**
 * Traducción del registro de auditoría a lenguaje de usuario: nombres de
 * acciones, entidades y campos, y formato de valores. Toda acción que el código
 * escribe con `registrarAuditoria` debe tener su etiqueta en `ETIQUETA_ACCION`
 * (lo comprueba `tests/utilidades.test.ts` leyendo el código fuente). El
 * respaldo genérico (`CATEGORIA_FUSIONADA` → "Categoría fusionada") existe solo
 * para registros antiguos o de versiones futuras.
 */

export type ValorJson = string | number | boolean | null | ValorJson[] | { [clave: string]: ValorJson };
export type DetalleAuditoria = { [clave: string]: ValorJson };
export type TonoAccion = "neutro" | "marca" | "exito" | "alerta" | "peligro" | "info";

/**
 * Nombres legibles de lo que el detalle guarda como identificador o código:
 * `{ "<id>": "Centro de Diálisis Ñuñoa", "insumo:GUA-NM": "Guante de nitrilo M" }`.
 * Lo arma la página (servidor) con `nombresDelDetalle`.
 */
export type NombresAuditoria = Readonly<Record<string, string>>;

const ETIQUETA_ACCION: Readonly<Record<string, string>> = {
  LOGIN_OK: "Inicio de sesión",
  LOGIN_FALLIDO: "Intento de ingreso fallido",
  LOGIN_BLOQUEADO: "Ingreso rechazado por bloqueo",
  LOGIN_FALLIDO_AGREGADO: "Intentos de ingreso fallidos (resumen)",
  LOGOUT: "Cierre de sesión",
  PASSWORD_CAMBIADA: "Cambió su contraseña",
  PASSWORD_CAMBIO_BLOQUEADO: "Cambio de contraseña bloqueado por intentos fallidos",
  MOVIMIENTO_INGRESO: "Ingreso de stock",
  MOVIMIENTO_RETIRO: "Retiro de stock",
  MOVIMIENTO_AJUSTE: "Ajuste de stock",
  MOVIMIENTO_MERMA: "Merma",
  MOVIMIENTO_TRASLADO: "Traslado",
  LOTE_CREADO: "Lote creado",
  LOTE_ACTUALIZADO: "Vencimiento de lote corregido",
  INSUMO_CREADO: "Insumo creado",
  INSUMO_ACTUALIZADO: "Insumo modificado",
  INSUMO_ACTIVADO: "Insumo reactivado",
  INSUMO_DESACTIVADO: "Insumo desactivado",
  INSUMO_ELIMINADO: "Insumo eliminado",
  INSUMO_PROVEEDOR_RED_ACTUALIZADO: "Proveedor predeterminado de la red modificado",
  INSUMO_PROVEEDOR_INSTITUCION_ACTUALIZADO: "Proveedor del insumo para la institución modificado",
  PARAMETROS_STOCK_ACTUALIZADOS: "Mínimos y máximos modificados",
  CATEGORIA_CREADA: "Categoría creada",
  CATEGORIA_ACTUALIZADA: "Categoría renombrada",
  CATEGORIA_ELIMINADA: "Categoría eliminada",
  INSTITUCION_CREADA: "Institución creada",
  INSTITUCION_ACTUALIZADA: "Institución modificada",
  INSTITUCION_ACTIVADA: "Institución reactivada",
  INSTITUCION_DESACTIVADA: "Institución desactivada",
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
  REPORTE_EXPORTADO: "Exportación a CSV",
  SESION_EXPIRADA: "Sesión expirada",
  SESIONES_CERRADAS: "Sesiones cerradas",
};

const ETIQUETA_ENTIDAD: Readonly<Record<string, string>> = {
  Usuario: "Usuario",
  Insumo: "Insumo",
  Categoria: "Categoría",
  Institucion: "Institución",
  Centro: "Centro",
  Ubicacion: "Ubicación",
  Proveedor: "Proveedor",
  Movimiento: "Movimiento",
  Lote: "Lote",
  Reporte: "Reporte",
  Sesion: "Sesión",
  ParametroStock: "Mínimos y máximos",
};

const ETIQUETA_CAMPO: Readonly<Record<string, string>> = {
  nombre: "Nombre",
  email: "Correo electrónico",
  rol: "Rol",
  centros: "Centros",
  institucion: "Institución",
  centro: "Centro",
  centroId: "Centro",
  codigo: "Código",
  categoria: "Categoría",
  categoriaId: "Categoría",
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
  insumoId: "Insumo",
  insumoNombre: "Insumo",
  lote: "Lote",
  loteId: "Lote",
  numeroLote: "Número de lote",
  fechaVencimiento: "Vencimiento",
  fechaFabricacion: "Fabricación",
  cantidad: "Cantidad",
  saldoPosterior: "Saldo del lote después",
  saldoAnterior: "Saldo del lote antes",
  ubicacion: "Ubicación",
  ubicacionId: "Ubicación",
  motivo: "Motivo",
  modo: "Selección de lote",
  sentido: "Sentido",
  documentoRef: "Documento de respaldo",
  proveedor: "Proveedor",
  proveedorId: "Proveedor",
  predeterminadoRed: "Proveedor predeterminado de la red",
  agrupar: "Agrupado por",
  costoUnitario: "Costo unitario",
  nota: "Nota",
  origen: "Origen",
  destino: "Destino",
  entreCentros: "Entre centros distintos",
  sesionesCerradas: "Sesiones cerradas",
  usuario: "Usuario",
  usuarioId: "Usuario",
  activo: "Activo",
  estado: "Estado",
  // Exportaciones
  formato: "Formato",
  reporte: "Reporte",
  filas: "Filas exportadas",
  texto: "Texto buscado",
  desde: "Desde",
  hasta: "Hasta",
  dias: "Horizonte de vencimiento (días)",
  orden: "Orden",
  topeAlcanzado: "Se alcanzó el tope de filas",
  // Ingreso al sistema
  intentos: "Intentos fallidos",
  intentosFallidos: "Intentos fallidos",
  bloqueadoHasta: "Bloqueada hasta",
  minutos: "Minutos de bloqueo",
  ip: "Dirección IP",
  omitidos: "Intentos no registrados uno a uno",
  ventanaSegundos: "Período resumido (segundos)",
  // Corrección de lotes
  unidadesAfectadas: "Unidades en stock afectadas",
  ubicacionesAfectadas: "Ubicaciones con stock afectadas",
  truncada: "Archivo incompleto (tope de filas)",
};

/** Palabras que el respaldo genérico debe escribir con tilde, eñe o en español. */
const PALABRAS: Readonly<Record<string, string>> = {
  categoria: "categoría",
  ubicacion: "ubicación",
  descripcion: "descripción",
  presentacion: "presentación",
  direccion: "dirección",
  region: "región",
  telefono: "teléfono",
  numero: "número",
  codigo: "código",
  minimo: "mínimo",
  maximo: "máximo",
  razon: "razón",
  sesion: "sesión",
  parametros: "parámetros",
  parametro: "parámetro",
  fabricacion: "fabricación",
  exportacion: "exportación",
  reposicion: "reposición",
  auditoria: "auditoría",
  contrasena: "contraseña",
  password: "contraseña",
  email: "correo electrónico",
  login: "ingreso",
  logout: "cierre de sesión",
  ip: "IP",
  rut: "RUT",
  csv: "CSV",
  isp: "ISP",
  frio: "frío",
  dias: "días",
  ultimo: "último",
  ultima: "última",
  accion: "acción",
  unico: "único",
};

/** Claves técnicas que no aportan a quien lee (se dejan solo en "datos técnicos"). */
const CLAVES_TECNICAS = new Set(["cambios", "trasladoGrupoId", "movimientoEntradaId", "movimientoSalidaId", "movimientoId", "sesionId"]);

const VALORES_CONOCIDOS: Readonly<Record<string, string>> = {
  ...NOMBRE_ROL,
  ...ETIQUETA_TIPO_CENTRO,
  ...ETIQUETA_TIPO_UBICACION,
  ...ETIQUETA_TIPO_MOVIMIENTO,
  FEFO: "Automática (primero el que vence antes)",
  MANUAL: "Lote elegido a mano",
  LOTE: "Lote elegido a mano",
  POSITIVO: "Aumenta el stock (+)",
  NEGATIVO: "Disminuye el stock (−)",
  CORRECCION: "Corrección de un administrador",
  email_desconocido: "El correo no corresponde a ningún usuario",
  limite_ip: "Demasiados intentos desde la misma dirección IP",
  limite_ip_email: "Demasiados intentos fallidos con esta cuenta desde la misma dirección IP",
  limite_cuenta: "Demasiados intentos fallidos con esta cuenta",
  bloqueo_cuenta: "La cuenta está bloqueada temporalmente por intentos fallidos",
  password_temporal_vencida: "La contraseña temporal venció (hay que restablecerla)",
  intentos_password_actual: "Demasiados intentos con la contraseña actual equivocada",
  password_incorrecta: "Contraseña incorrecta",
  usuario_inactivo: "El usuario está desactivado",
  cuenta_bloqueada: "La cuenta está bloqueada",
  csv: "CSV",
  cobertura: "Menor cobertura primero",
  consumo: "Mayor consumo primero",
  activos: "Solo activos",
  inactivos: "Solo inactivos",
};

/** Reportes exportables (`entidadId` de `REPORTE_EXPORTADO`). */
const NOMBRE_REPORTE: Readonly<Record<string, string>> = {
  existencias: "Existencias",
  movimientos: "Movimientos",
  mermas: "Mermas",
  consumo: "Consumo y cobertura",
  vencimientos: "Vencimientos",
  reposicion: "Lista de reposición",
  inventario: "Inventario",
};

/** `LOTE_ACTUALIZADO`, `categoriaId`, `stock_minimo` → "Lote actualizado", "Categoría", "Stock mínimo". */
function aPalabras(clave: string): string {
  const palabras = clave
    .replace(/Ids?$/, "")
    .replace(/_/g, " ")
    .replace(/([a-záéíóúñ0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => PALABRAS[p] ?? p);
  const texto = palabras.join(" ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** ¿La acción tiene etiqueta propia (no cae en el respaldo genérico)? */
export function tieneEtiquetaPropia(accion: string): boolean {
  return Object.hasOwn(ETIQUETA_ACCION, accion);
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
  if (/^LOGIN_(FALLIDO|BLOQUEADO|FALLIDO_AGREGADO)$/.test(accion) || accion === "PASSWORD_CAMBIO_BLOQUEADO") return "alerta";
  if (/^(LOGIN_OK|LOGOUT)$/.test(accion)) return "neutro";
  if (/_(DESACTIVAD[OA]|ELIMINAD[OA])$/.test(accion) || accion === "MOVIMIENTO_MERMA") return "peligro";
  if (/_(CREAD[OA]|ACTIVAD[OA])$/.test(accion) || accion === "MOVIMIENTO_INGRESO") return "exito";
  if (accion.startsWith("MOVIMIENTO_")) return "marca";
  return "info";
}

const esObjeto = (v: ValorJson | undefined): v is { [clave: string]: ValorJson } =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** Sin información: no se muestra (ni "Centro: —" ni listas vacías). */
function estaVacio(valor: ValorJson | undefined): boolean {
  if (valor === null || valor === undefined) return true;
  if (typeof valor === "string") return valor.trim() === "";
  if (Array.isArray(valor)) return valor.length === 0;
  if (esObjeto(valor)) return Object.values(valor).every(estaVacio);
  return false;
}

/** "Guante de nitrilo M (GUA-NM)" si se conoce el nombre; si no, el código tal cual. */
function insumoLegible(codigo: string, detalle: DetalleAuditoria, nombres: NombresAuditoria): string {
  const enDetalle = detalle.insumoNombre ?? detalle.nombreInsumo;
  const nombre = (typeof enDetalle === "string" && enDetalle.trim()) || nombres[`insumo:${codigo}`];
  return nombre && nombre !== codigo ? `${nombre} (${codigo})` : codigo;
}

/** Valor suelto → texto legible ("—" si está vacío). */
export function formatearValor(campo: string, valor: ValorJson | undefined, nombres: NombresAuditoria = {}): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (typeof valor === "number") return formatearNumero(valor);
  if (typeof valor === "string") {
    if (campo === "rut") return formatearRut(valor);
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return formatearDia(valor);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(valor) && !Number.isNaN(Date.parse(valor))) return formatearFechaHora(new Date(valor));
    if (campo === "insumo") return nombres[`insumo:${valor}`] ? `${nombres[`insumo:${valor}`]} (${valor})` : valor;
    if (campo === "reporte") return NOMBRE_REPORTE[valor] ?? aPalabras(valor);
    // Identificadores: se muestra el nombre; el id queda en "Datos técnicos".
    if (/Id$/.test(campo)) return nombres[valor] ?? "Registro no disponible (ver datos técnicos)";
    return VALORES_CONOCIDOS[valor] ?? valor;
  }
  if (Array.isArray(valor)) {
    if (valor.length === 0) return "Ninguno";
    return valor.map((v) => formatearValor(campo, v, nombres)).join(", ");
  }
  return Object.entries(valor)
    .filter(([, v]) => !estaVacio(v))
    .map(([k, v]) => `${etiquetaCampo(k)}: ${formatearValor(k, v, nombres)}`)
    .join(" · ");
}

export interface CambioCampo {
  campo: string;
  antes: string;
  despues: string;
}

/** `detalle.cambios` → filas "campo / antes / después". */
export function extraerCambios(detalle: DetalleAuditoria, nombres: NombresAuditoria = {}): CambioCampo[] {
  const cambios = detalle.cambios;
  if (!esObjeto(cambios)) return [];
  return Object.entries(cambios).flatMap(([campo, par]) => {
    if (!esObjeto(par)) return [];
    return [
      {
        campo: etiquetaCampo(campo),
        antes: estaVacio(par.antes) ? "Sin dato" : formatearValor(campo, par.antes, nombres),
        despues: estaVacio(par.despues) ? "Sin dato" : formatearValor(campo, par.despues, nombres),
      },
    ];
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
    if (!esObjeto(c) || typeof c.centro !== "string") return [];
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

export interface DatoAuditoria {
  etiqueta: string;
  valor: string;
}

/**
 * Pares etiqueta / valor del detalle en lenguaje de usuario: sin claves
 * técnicas, sin campos vacíos y con los objetos anidados (p. ej. los filtros
 * de una exportación) desplegados como filas propias.
 */
export function extraerDatos(detalle: DetalleAuditoria, nombres: NombresAuditoria = {}): DatoAuditoria[] {
  const esParametros = extraerParametros(detalle).length > 0;
  const tieneNombreInsumo = typeof detalle.insumo === "string";
  const filas: DatoAuditoria[] = [];
  const agregar = (clave: string, valor: ValorJson) => {
    if (CLAVES_TECNICAS.has(clave) || estaVacio(valor)) return;
    if (esParametros && clave === "centros") return;
    // El nombre del insumo ya se muestra junto a su código.
    if (tieneNombreInsumo && (clave === "insumoNombre" || clave === "nombreInsumo")) return;
    if (esObjeto(valor)) {
      for (const [k, v] of Object.entries(valor)) agregar(k, v);
      return;
    }
    const texto =
      clave === "insumo" && typeof valor === "string" ? insumoLegible(valor, detalle, nombres) : formatearValor(clave, valor, nombres);
    const etiqueta = etiquetaCampo(clave);
    // Dos claves pueden compartir etiqueta (p. ej. `centro` y `centroId`): se conserva la primera.
    if (!filas.some((f) => f.etiqueta === etiqueta)) filas.push({ etiqueta, valor: texto });
  };
  for (const [clave, valor] of Object.entries(detalle)) agregar(clave, valor);
  return filas;
}

/**
 * Subconjunto de `disponibles` que el detalle realmente menciona (ids y códigos
 * de insumo), para no enviar al navegador el catálogo completo en cada fila.
 */
export function nombresDelDetalle(detalle: DetalleAuditoria, disponibles: NombresAuditoria): NombresAuditoria {
  const salida: Record<string, string> = {};
  const recorrer = (clave: string, valor: ValorJson) => {
    if (typeof valor === "string") {
      const llave = clave === "insumo" ? `insumo:${valor}` : valor;
      const nombre = disponibles[llave];
      if (nombre) salida[llave] = nombre;
    } else if (Array.isArray(valor)) {
      for (const v of valor) recorrer(clave, v);
    } else if (esObjeto(valor)) {
      for (const [k, v] of Object.entries(valor)) recorrer(k, v);
    }
  };
  for (const [clave, valor] of Object.entries(detalle)) recorrer(clave, valor);
  return salida;
}

/** Frase corta para la tabla: sobre qué recayó la acción, con nombres en vez de códigos. */
export function resumenAuditoria(
  accion: string,
  detalle: DetalleAuditoria,
  contexto: { entidadId?: string | null; nombres?: NombresAuditoria } = {},
): string {
  const nombres = contexto.nombres ?? {};
  const t = (clave: string) => (typeof detalle[clave] === "string" && detalle[clave] !== "" ? (detalle[clave] as string) : null);
  const n = (clave: string) => (typeof detalle[clave] === "number" ? formatearNumero(detalle[clave] as number) : null);
  const unir = (partes: (string | null | undefined)[]) => partes.filter(Boolean).join(" · ");

  // Nombre del insumo; el código queda en el detalle.
  const codigo = t("insumo");
  const insumo = codigo ? (t("insumoNombre") ?? t("nombreInsumo") ?? nombres[`insumo:${codigo}`] ?? codigo) : null;
  const cantidadDeInsumo = n("cantidad") && insumo ? `${n("cantidad")} × ${insumo}` : insumo;

  if (accion === "MOVIMIENTO_TRASLADO") {
    return unir([cantidadDeInsumo, t("origen") && t("destino") ? `${t("origen")} → ${t("destino")}` : null]);
  }
  if (accion.startsWith("MOVIMIENTO_")) {
    return unir([cantidadDeInsumo, t("lote") ? `lote ${t("lote")}` : null, t("centro")]);
  }
  if (accion.startsWith("LOTE_")) {
    const lote = t("numeroLote") ?? t("lote");
    return unir([insumo, lote ? `lote ${lote}` : null]);
  }
  if (accion === "LOGIN_FALLIDO") return t("motivo") ? formatearValor("motivo", t("motivo")) : "";
  if (accion === "REPORTE_EXPORTADO") {
    const clave = contexto.entidadId ?? t("reporte");
    const filtros = esObjeto(detalle.filtros) ? detalle.filtros : detalle;
    const filas = typeof filtros.filas === "number" ? `${formatearNumero(filtros.filas)} ${filtros.filas === 1 ? "fila" : "filas"}` : null;
    return unir([clave ? (NOMBRE_REPORTE[clave] ?? aPalabras(clave)) : null, filas]);
  }

  const sujeto = t("razonSocial") ?? t("nombre") ?? t("email") ?? insumo ?? t("numeroLote") ?? t("codigo") ?? "";
  const cambios = extraerCambios(detalle);
  if (cambios.length > 0) {
    const campos = cambios.map((c) => c.campo.toLowerCase()).join(", ");
    return sujeto ? `${sujeto} · cambió ${campos}` : `Cambió ${campos}`;
  }
  const parametros = extraerParametros(detalle);
  if (parametros.length > 0) return unir([sujeto, parametros.map((p) => p.centro).join(", ")]);
  const lugar = t("centro");
  return lugar && sujeto ? `${sujeto} · ${lugar}` : sujeto;
}
