"use server";

/** Server Actions de administración de proveedores. */
import { esquemaCambiarActivo } from "@/lib/esquemas/catalogo";
import { esquemaActualizarProveedor, esquemaProveedor } from "@/lib/esquemas/proveedores";
import { accionSegura } from "@/server/accion-segura";
import { actualizarProveedor, crearProveedor, establecerProveedorActivo } from "@/server/servicios";

export const crearProveedorAccion = accionSegura(
  { esquema: esquemaProveedor, permiso: "proveedores:gestionar" },
  ({ actor, datos }) => crearProveedor(actor, datos),
);

export const actualizarProveedorAccion = accionSegura(
  { esquema: esquemaActualizarProveedor, permiso: "proveedores:gestionar" },
  ({ actor, datos }) => actualizarProveedor(actor, datos),
);

export const establecerProveedorActivoAccion = accionSegura(
  { esquema: esquemaCambiarActivo, permiso: "proveedores:gestionar" },
  ({ actor, datos }) => establecerProveedorActivo(actor, datos.id, datos.activo),
);
