import "server-only";
import type { Actor } from "@/lib/permisos";
import { registrarAuditoria } from "../auditoria";
import { verificarPermiso } from "../autorizacion";
import { enTransaccion } from "../db";
import { ErrorDominio, noEncontrado } from "../errores";

/**
 * Activa o desactiva un usuario. Al desactivar se eliminan TODAS sus sesiones
 * en la misma transacción (queda fuera de inmediato).
 *
 * Es el ejemplo canónico de mutación administrativa: permiso → transacción →
 * cambio → auditoría. Permiso: `usuarios:gestionar`.
 */
export async function establecerUsuarioActivo(
  actor: Actor,
  usuarioId: string,
  activo: boolean,
): Promise<{ id: string; activo: boolean; sesionesCerradas: number }> {
  verificarPermiso(actor, "usuarios:gestionar");
  if (!activo && usuarioId === actor.usuarioId) {
    throw new ErrorDominio("OPERACION_INVALIDA", "No puedes desactivar tu propia cuenta.");
  }
  return enTransaccion(async (tx) => {
    const usuario = await tx.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, email: true, activo: true },
    });
    if (!usuario) throw noEncontrado("El usuario");

    let sesionesCerradas = 0;
    if (usuario.activo !== activo) {
      await tx.usuario.update({
        where: { id: usuarioId },
        data: { activo, ...(activo ? { intentosFallidos: 0, bloqueadoHasta: null } : {}) },
      });
      await registrarAuditoria(tx, actor, {
        accion: activo ? "USUARIO_ACTIVADO" : "USUARIO_DESACTIVADO",
        entidad: "Usuario",
        entidadId: usuarioId,
        detalle: { email: usuario.email },
      });
    }
    if (!activo) {
      sesionesCerradas = (await tx.sesion.deleteMany({ where: { usuarioId } })).count;
    }
    return { id: usuarioId, activo, sesionesCerradas };
  });
}
