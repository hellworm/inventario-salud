"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { eliminarInsumoAccion } from "@/acciones/admin-catalogo";
import { Button, ConfirmDialog, toast } from "@/components/ui";

/** Elimina un insumo sin historia (creado por error). Con movimientos solo se puede desactivar. */
export function BotonEliminarInsumo({ id, nombre }: { id: string; nombre: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      disparador={
        <Button variant="fantasma" className="text-peligro-700 hover:bg-peligro-50 hover:text-peligro-800">
          <Trash2 aria-hidden />
          Eliminar
        </Button>
      }
      titulo="¿Eliminar el insumo?"
      descripcion={
        <>
          <strong className="font-semibold text-texto">{nombre}</strong> no tiene movimientos, así que se puede eliminar
          por completo. Esta acción no se puede deshacer.
        </>
      }
      peligro
      textoConfirmar="Eliminar"
      onConfirmar={async () => {
        const r = await eliminarInsumoAccion({ id });
        if (r.ok) {
          toast.exito("Insumo eliminado");
          router.push("/admin/insumos");
        } else {
          toast.error("No se pudo eliminar", r.error);
        }
      }}
    />
  );
}
