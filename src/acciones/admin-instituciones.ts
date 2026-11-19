"use server";

/** Server Actions de administración de instituciones (solo administrador de la red). */
import { esquemaCambiarActivo } from "@/lib/esquemas/catalogo";
import { esquemaActualizarInstitucion, esquemaInstitucion } from "@/lib/esquemas/instituciones";
import { accionSegura } from "@/server/accion-segura";
import { actualizarInstitucion, crearInstitucion, establecerInstitucionActiva } from "@/server/servicios";

export const crearInstitucionAccion = accionSegura(
  { esquema: esquemaInstitucion, permiso: "instituciones:gestionar" },
  ({ actor, datos }) => crearInstitucion(actor, datos),
);

export const actualizarInstitucionAccion = accionSegura(
  { esquema: esquemaActualizarInstitucion, permiso: "instituciones:gestionar" },
  ({ actor, datos }) => actualizarInstitucion(actor, datos),
);

export const establecerInstitucionActivaAccion = accionSegura(
  { esquema: esquemaCambiarActivo, permiso: "instituciones:gestionar" },
  ({ actor, datos }) => establecerInstitucionActiva(actor, datos.id, datos.activo),
);
