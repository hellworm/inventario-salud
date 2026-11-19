"use server";

/** Server Actions de administración del catálogo: insumos, categorías y parámetros de stock. */
import {
  esquemaActualizarCategoria,
  esquemaActualizarInsumo,
  esquemaCambiarActivo,
  esquemaCategoria,
  esquemaInsumo,
  esquemaParametrosStock,
  esquemaSoloId,
} from "@/lib/esquemas/catalogo";
import { accionSegura } from "@/server/accion-segura";
import {
  actualizarCategoria,
  actualizarInsumo,
  crearCategoria,
  crearInsumo,
  eliminarCategoria,
  eliminarInsumo,
  establecerInsumoActivo,
  guardarParametrosStock,
} from "@/server/servicios";

export const crearInsumoAccion = accionSegura(
  { esquema: esquemaInsumo, permiso: "catalogo:gestionar" },
  ({ actor, datos }) => crearInsumo(actor, datos),
);

export const actualizarInsumoAccion = accionSegura(
  { esquema: esquemaActualizarInsumo, permiso: "catalogo:gestionar" },
  ({ actor, datos }) => actualizarInsumo(actor, datos),
);

export const establecerInsumoActivoAccion = accionSegura(
  { esquema: esquemaCambiarActivo, permiso: "catalogo:gestionar" },
  ({ actor, datos }) => establecerInsumoActivo(actor, datos.id, datos.activo),
);

export const eliminarInsumoAccion = accionSegura(
  { esquema: esquemaSoloId, permiso: "catalogo:gestionar" },
  ({ actor, datos }) => eliminarInsumo(actor, datos.id),
);

export const guardarParametrosStockAccion = accionSegura(
  { esquema: esquemaParametrosStock, permiso: "parametros:gestionar" },
  ({ actor, datos }) => guardarParametrosStock(actor, datos),
);

export const crearCategoriaAccion = accionSegura(
  { esquema: esquemaCategoria, permiso: "catalogo:gestionar" },
  ({ actor, datos }) => crearCategoria(actor, datos),
);

export const actualizarCategoriaAccion = accionSegura(
  { esquema: esquemaActualizarCategoria, permiso: "catalogo:gestionar" },
  ({ actor, datos }) => actualizarCategoria(actor, datos),
);

export const eliminarCategoriaAccion = accionSegura(
  { esquema: esquemaSoloId, permiso: "catalogo:gestionar" },
  ({ actor, datos }) => eliminarCategoria(actor, datos.id),
);
