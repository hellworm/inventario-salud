"use client";

import * as React from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { actualizarCategoriaAccion, crearCategoriaAccion, eliminarCategoriaAccion } from "@/acciones/admin-catalogo";
import {
  Alert,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  Field,
  Input,
  toast,
  useAccion,
} from "@/components/ui";
import { esquemaCategoria } from "@/lib/esquemas/catalogo";
import { pluralizar } from "@/lib/formato";
import { texto, useValidacion } from "./use-validacion";

interface CategoriaEditable {
  id: string;
  nombre: string;
}

function DialogoCategoria({
  categoria,
  open,
  onOpenChange,
}: {
  categoria?: CategoriaEditable;
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
}) {
  const crear = useAccion(crearCategoriaAccion, {
    exito: (r) => `Categoría "${r.nombre}" creada`,
    alExito: () => onOpenChange(false),
    toastError: false,
  });
  const actualizar = useAccion(actualizarCategoriaAccion, {
    exito: "Categoría actualizada",
    alExito: () => onOpenChange(false),
    toastError: false,
  });
  const accion = categoria ? actualizar : crear;
  const validacion = useValidacion(esquemaCategoria, accion.erroresCampo);
  const hayErroresCampo = Object.keys(validacion.errores).length > 0;

  function cambiarApertura(abierto: boolean) {
    if (accion.pendiente) return;
    if (abierto) {
      accion.limpiar();
      validacion.reiniciar();
    }
    onOpenChange(abierto);
  }

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const valores = { nombre: texto(new FormData(evento.currentTarget), "nombre") };
    if (!validacion.validar(valores)) return;
    if (categoria) void actualizar.ejecutar({ ...valores, id: categoria.id });
    else void crear.ejecutar(valores);
  }

  return (
    <Dialog open={open} onOpenChange={cambiarApertura}>
      <DialogContent
        ancho="sm"
        titulo={categoria ? "Renombrar categoría" : "Nueva categoría"}
        descripcion={
          categoria
            ? "El cambio se refleja en todos los insumos de la categoría."
            : "Las categorías ordenan el catálogo y sirven para filtrar el inventario."
        }
      >
        <form noValidate onSubmit={enviar} onChange={validacion.alCambiar}>
          {accion.error && !hayErroresCampo ? (
            <Alert tono="peligro" className="mb-4">
              {accion.error}
            </Alert>
          ) : null}
          <Field label="Nombre" requerido error={validacion.errores.nombre} ayuda="Ej.: Diálisis, Curación, Protección personal">
            <Input name="nombre" defaultValue={categoria?.nombre} maxLength={60} autoComplete="off" autoFocus />
          </Field>
          <DialogFooter>
            <Button variant="secundario" onClick={() => cambiarApertura(false)} disabled={accion.pendiente}>
              Cancelar
            </Button>
            <Button type="submit" cargando={accion.pendiente}>
              {categoria ? "Guardar" : "Crear categoría"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Botón "Nueva categoría" con su diálogo. */
export function BotonNuevaCategoria({ variant }: { variant?: "primario" | "secundario" }) {
  const [abierto, setAbierto] = React.useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setAbierto(true)}>
        <Plus aria-hidden />
        Nueva categoría
      </Button>
      {abierto ? <DialogoCategoria open onOpenChange={setAbierto} /> : null}
    </>
  );
}

/** Acciones por fila: renombrar y eliminar (solo si no tiene insumos). */
export function AccionesCategoria({ categoria, insumos }: { categoria: CategoriaEditable; insumos: number }) {
  const [editando, setEditando] = React.useState(false);
  const tieneInsumos = insumos > 0;
  return (
    <span className="relative z-10 inline-flex items-center justify-end gap-1">
      <Button variant="fantasma" size="icono" aria-label={`Renombrar ${categoria.nombre}`} title="Renombrar" onClick={() => setEditando(true)}>
        <Pencil aria-hidden />
      </Button>
      {editando ? <DialogoCategoria categoria={categoria} open onOpenChange={setEditando} /> : null}
      {tieneInsumos ? (
        <Button
          variant="fantasma"
          size="icono"
          aria-label={`Eliminar ${categoria.nombre}`}
          title="No se puede eliminar: tiene insumos"
          onClick={() =>
            toast.info(
              "No se puede eliminar",
              `"${categoria.nombre}" tiene ${pluralizar(insumos, "insumo")}. Muévelos a otra categoría primero.`,
            )
          }
          className="text-texto-tenue/60"
        >
          <Trash2 aria-hidden />
        </Button>
      ) : (
        <ConfirmDialog
          disparador={
            <Button
              variant="fantasma"
              size="icono"
              aria-label={`Eliminar ${categoria.nombre}`}
              title="Eliminar"
              className="hover:bg-peligro-50 hover:text-peligro-700"
            >
              <Trash2 aria-hidden />
            </Button>
          }
          titulo="¿Eliminar la categoría?"
          descripcion={
            <>
              <strong className="font-semibold text-texto">{categoria.nombre}</strong> no tiene insumos. Esta acción no se
              puede deshacer.
            </>
          }
          peligro
          textoConfirmar="Eliminar"
          onConfirmar={async () => {
            const r = await eliminarCategoriaAccion({ id: categoria.id });
            if (r.ok) toast.exito(`Categoría "${categoria.nombre}" eliminada`);
            else toast.error("No se pudo eliminar", r.error);
          }}
        />
      )}
    </span>
  );
}
