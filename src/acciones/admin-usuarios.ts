"use server";

/** Server Actions de administración de usuarios. */
import { esquemaCambiarActivo, esquemaSoloId } from "@/lib/esquemas/catalogo";
import { esquemaActualizarUsuario, esquemaCrearUsuario } from "@/lib/esquemas/usuarios";
import { accionSegura } from "@/server/accion-segura";
import {
  actualizarUsuario,
  crearUsuario,
  desbloquearUsuario,
  establecerUsuarioActivo,
  restablecerPasswordUsuario,
} from "@/server/servicios";

export const crearUsuarioAccion = accionSegura(
  { esquema: esquemaCrearUsuario, permiso: "usuarios:gestionar" },
  ({ actor, datos }) => crearUsuario(actor, datos),
);

export const actualizarUsuarioAccion = accionSegura(
  { esquema: esquemaActualizarUsuario, permiso: "usuarios:gestionar" },
  ({ actor, datos }) => actualizarUsuario(actor, datos),
);

export const establecerUsuarioActivoAccion = accionSegura(
  { esquema: esquemaCambiarActivo, permiso: "usuarios:gestionar" },
  ({ actor, datos }) => establecerUsuarioActivo(actor, datos.id, datos.activo),
);

export const restablecerPasswordUsuarioAccion = accionSegura(
  { esquema: esquemaSoloId, permiso: "usuarios:gestionar" },
  ({ actor, datos }) => restablecerPasswordUsuario(actor, datos.id),
);

export const desbloquearUsuarioAccion = accionSegura(
  { esquema: esquemaSoloId, permiso: "usuarios:gestionar" },
  ({ actor, datos }) => desbloquearUsuario(actor, datos.id),
);
