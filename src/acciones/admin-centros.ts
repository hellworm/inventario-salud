"use server";

/** Server Actions de administración de centros y sus ubicaciones. */
import { esquemaCambiarActivo } from "@/lib/esquemas/catalogo";
import {
  esquemaActualizarCentro,
  esquemaActualizarUbicacion,
  esquemaCentro,
  esquemaUbicacion,
} from "@/lib/esquemas/centros";
import { accionSegura } from "@/server/accion-segura";
import {
  actualizarCentro,
  actualizarUbicacion,
  crearCentro,
  crearUbicacion,
  establecerCentroActivo,
  establecerUbicacionActiva,
} from "@/server/servicios";

export const crearCentroAccion = accionSegura(
  { esquema: esquemaCentro, permiso: "centros:gestionar" },
  ({ actor, datos }) => crearCentro(actor, datos),
);

export const actualizarCentroAccion = accionSegura(
  { esquema: esquemaActualizarCentro, permiso: "centros:gestionar" },
  ({ actor, datos }) => actualizarCentro(actor, datos),
);

export const establecerCentroActivoAccion = accionSegura(
  { esquema: esquemaCambiarActivo, permiso: "centros:gestionar" },
  ({ actor, datos }) => establecerCentroActivo(actor, datos.id, datos.activo),
);

export const crearUbicacionAccion = accionSegura(
  { esquema: esquemaUbicacion, permiso: "centros:gestionar" },
  ({ actor, datos }) => crearUbicacion(actor, datos),
);

export const actualizarUbicacionAccion = accionSegura(
  { esquema: esquemaActualizarUbicacion, permiso: "centros:gestionar" },
  ({ actor, datos }) => actualizarUbicacion(actor, datos),
);

export const establecerUbicacionActivaAccion = accionSegura(
  { esquema: esquemaCambiarActivo, permiso: "centros:gestionar" },
  ({ actor, datos }) => establecerUbicacionActiva(actor, datos.id, datos.activo),
);
