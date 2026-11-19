"use client";

import * as React from "react";
import { DoorOpen, MapPin, Pencil, Plus, Snowflake, Warehouse, type LucideIcon } from "lucide-react";
import { actualizarUbicacionAccion, crearUbicacionAccion } from "@/acciones/admin-centros";
import {
  Alert,
  Badge,
  BadgeActivo,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  Field,
  Input,
  Select,
  useAccion,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { esquemaUbicacion } from "@/lib/esquemas/centros";
import { ETIQUETA_TIPO_UBICACION, TIPOS_UBICACION, type TipoUbicacion } from "@/lib/estados";
import { pluralizar } from "@/lib/formato";
import { BotonCambiarActivo } from "./boton-cambiar-activo";
import { useFocoAlCerrar } from "./use-foco-al-cerrar";
import { texto, useValidacion } from "./use-validacion";

export interface UbicacionEditable {
  id: string;
  nombre: string;
  tipo: TipoUbicacion;
  descripcion: string | null;
  activo: boolean;
  existencias: number;
  lotesConStock: number;
}

const ICONO_TIPO: Record<TipoUbicacion, LucideIcon> = {
  BODEGA: Warehouse,
  SALA: DoorOpen,
  REFRIGERADO: Snowflake,
  OTRO: MapPin,
};

const AYUDA_TIPO: Record<TipoUbicacion, string> = {
  BODEGA: "Almacenamiento general del centro.",
  SALA: "Sala de procedimientos, box o pabellón donde se usan los insumos.",
  REFRIGERADO: "Refrigerador o cámara de frío (insumos con cadena de frío).",
  OTRO: "Cualquier otro lugar: carro de paro, cuarentena, tránsito…",
};

function DialogoUbicacion({
  centroId,
  ubicacion,
  onCerrar,
}: {
  centroId: string;
  ubicacion?: UbicacionEditable;
  onCerrar: () => void;
}) {
  const crear = useAccion(crearUbicacionAccion, {
    exito: (r) => `Ubicación "${r.nombre}" creada`,
    alExito: onCerrar,
    toastError: false,
  });
  const actualizar = useAccion(actualizarUbicacionAccion, { exito: "Ubicación actualizada", alExito: onCerrar, toastError: false });
  const accion = ubicacion ? actualizar : crear;
  const validacion = useValidacion(esquemaUbicacion, accion.erroresCampo);
  const e = validacion.errores;
  const [tipo, setTipo] = React.useState<TipoUbicacion | "">(ubicacion?.tipo ?? "BODEGA");

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const f = new FormData(evento.currentTarget);
    const valores = {
      centroId,
      nombre: texto(f, "nombre"),
      tipo: tipo as TipoUbicacion,
      descripcion: texto(f, "descripcion"),
    };
    if (!validacion.validar(valores)) return;
    if (ubicacion) void actualizar.ejecutar({ id: ubicacion.id, nombre: valores.nombre, tipo: valores.tipo, descripcion: valores.descripcion });
    else void crear.ejecutar(valores);
  }

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto && !accion.pendiente) onCerrar();
      }}
    >
      <DialogContent
        ancho="sm"
        titulo={ubicacion ? "Editar ubicación" : "Nueva ubicación"}
        descripcion="Un lugar físico dentro del centro donde se guardan o usan insumos."
      >
        <form noValidate onSubmit={enviar} onChange={validacion.alCambiar} className="space-y-4">
          {accion.error && Object.keys(e).length === 0 ? <Alert tono="peligro">{accion.error}</Alert> : null}
          <Field label="Nombre" requerido error={e.nombre} ayuda="Ej.: Bodega central, Sala 2, Refrigerador de vacunas">
            <Input name="nombre" defaultValue={ubicacion?.nombre} maxLength={80} autoComplete="off" autoFocus />
          </Field>
          <Field label="Tipo" requerido error={e.tipo} ayuda={tipo ? AYUDA_TIPO[tipo] : undefined}>
            <Select
              name="tipo"
              value={tipo}
              onChange={(ev) => setTipo(ev.target.value as TipoUbicacion)}
              opciones={TIPOS_UBICACION.map((t) => ({ value: t, label: ETIQUETA_TIPO_UBICACION[t] }))}
            />
          </Field>
          <Field label="Descripción" opcional error={e.descripcion}>
            <Input name="descripcion" defaultValue={ubicacion?.descripcion ?? ""} maxLength={200} autoComplete="off" />
          </Field>
          <DialogFooter>
            <Button variant="secundario" onClick={onCerrar} disabled={accion.pendiente}>
              Cancelar
            </Button>
            <Button type="submit" cargando={accion.pendiente}>
              {ubicacion ? "Guardar" : "Crear ubicación"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Lista de ubicaciones de un centro con alta, edición y activar / desactivar. */
export function GestorUbicaciones({ centroId, ubicaciones }: { centroId: string; ubicaciones: UbicacionEditable[] }) {
  const [dialogo, setDialogo] = React.useState<{ ubicacion?: UbicacionEditable } | null>(null);
  const foco = useFocoAlCerrar();
  const abrir = (ubicacion?: UbicacionEditable) => {
    foco.recordar();
    setDialogo({ ubicacion });
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-texto">Ubicaciones</h2>
          <p className="mt-0.5 text-sm text-texto-suave">Bodegas, salas y refrigeradores donde se guarda el stock de este centro.</p>
        </div>
        <Button variant="secundario" onClick={() => abrir()}>
          <Plus aria-hidden />
          Agregar ubicación
        </Button>
      </div>

      {ubicaciones.length === 0 ? (
        <EmptyState
          compacto
          icono={Warehouse}
          titulo="Este centro no tiene ubicaciones"
          descripcion="Agrega al menos una (por ejemplo, la bodega) para poder registrar stock."
        />
      ) : (
        <ul className="divide-y divide-borde rounded-control border border-borde" aria-label="Ubicaciones del centro">
          {ubicaciones.map((u) => {
            const Icono = ICONO_TIPO[u.tipo];
            return (
              <li key={u.id} className={cn("flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center", !u.activo && "bg-superficie-2/60")}>
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl",
                      u.activo ? "bg-marca-50 text-marca-700" : "bg-superficie-2 text-texto-tenue",
                    )}
                  >
                    <Icono className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={cn("text-[0.9375rem] font-semibold", u.activo ? "text-texto" : "text-texto-suave")}>{u.nombre}</span>
                      <Badge tono="neutro">{ETIQUETA_TIPO_UBICACION[u.tipo]}</Badge>
                      {!u.activo ? <BadgeActivo activo={false} /> : null}
                    </p>
                    <p className="cifras mt-0.5 text-sm text-texto-suave">
                      {u.lotesConStock > 0 ? `${pluralizar(u.lotesConStock, "lote")} con stock` : "Sin existencias"}
                      {u.descripcion ? ` · ${u.descripcion}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
                  <Button variant="secundario" size="sm" onClick={() => abrir(u)} aria-label={`Editar ${u.nombre}`}>
                    <Pencil aria-hidden />
                    Editar
                  </Button>
                  <BotonCambiarActivo
                    entidad="ubicacion"
                    id={u.id}
                    nombre={u.nombre}
                    activo={u.activo}
                    size="sm"
                    aviso={
                      u.activo && u.existencias > 0
                        ? `Hoy guarda stock de ${pluralizar(u.lotesConStock, "lote")}: tendrás que trasladarlo o darlo de baja antes.`
                        : undefined
                    }
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {dialogo ? <DialogoUbicacion centroId={centroId} ubicacion={dialogo.ubicacion} 
          onCerrar={() => {
            setDialogo(null);
            foco.devolver();
          }}
        /> : null}
    </div>
  );
}
