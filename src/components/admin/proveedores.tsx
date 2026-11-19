"use client";

import * as React from "react";
import { CircleCheck, CircleSlash, EllipsisVertical, Pencil, Plus } from "lucide-react";
import { actualizarProveedorAccion, crearProveedorAccion } from "@/acciones/admin-proveedores";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  Input,
  useAccion,
} from "@/components/ui";
import { formatearRut, validarRut } from "@/lib/chile/rut";
import { esquemaProveedor, type EntradaProveedor } from "@/lib/esquemas/proveedores";
import { ConfirmarActivo } from "./boton-cambiar-activo";
import { useFocoAlCerrar } from "./use-foco-al-cerrar";
import { texto, useValidacion } from "./use-validacion";

export interface ProveedorEditable {
  id: string;
  rut: string;
  razonSocial: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  sitioWeb: string | null;
  activo: boolean;
}

function DialogoProveedor({ proveedor, onCerrar }: { proveedor?: ProveedorEditable; onCerrar: () => void }) {
  const crear = useAccion(crearProveedorAccion, {
    exito: (r) => `Proveedor "${r.razonSocial}" creado`,
    alExito: onCerrar,
    toastError: false,
  });
  const actualizar = useAccion(actualizarProveedorAccion, { exito: "Proveedor actualizado", alExito: onCerrar, toastError: false });
  const accion = proveedor ? actualizar : crear;
  const validacion = useValidacion(esquemaProveedor, accion.erroresCampo);
  const e = validacion.errores;
  const [rut, setRut] = React.useState(proveedor ? formatearRut(proveedor.rut) : "");

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const f = new FormData(evento.currentTarget);
    const valores: EntradaProveedor = {
      rut,
      razonSocial: texto(f, "razonSocial"),
      contacto: texto(f, "contacto"),
      telefono: texto(f, "telefono"),
      email: texto(f, "email"),
      sitioWeb: texto(f, "sitioWeb"),
    };
    if (!validacion.validar(valores)) return;
    if (proveedor) void actualizar.ejecutar({ ...valores, id: proveedor.id });
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
        titulo={proveedor ? "Editar proveedor" : "Nuevo proveedor"}
        descripcion="Aparecerá como opción al registrar ingresos de insumos."
      >
        <form noValidate onSubmit={enviar} onChange={validacion.alCambiar} className="space-y-4">
          {accion.error && Object.keys(e).length === 0 ? <Alert tono="peligro">{accion.error}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-5">
            <Field label="RUT" requerido error={e.rut} ayuda="Ej.: 76.123.456-0" className="sm:col-span-2">
              <Input
                name="rut"
                value={rut}
                onChange={(ev) => setRut(ev.target.value)}
                onBlur={() => {
                  if (validarRut(rut)) setRut(formatearRut(rut));
                }}
                autoComplete="off"
                maxLength={14}
                className="cifras"
                autoFocus={!proveedor}
              />
            </Field>
            <Field label="Razón social" requerido error={e.razonSocial} className="sm:col-span-3">
              <Input name="razonSocial" defaultValue={proveedor?.razonSocial} maxLength={140} autoComplete="off" />
            </Field>
          </div>
          <Field label="Persona de contacto" opcional error={e.contacto}>
            <Input name="contacto" defaultValue={proveedor?.contacto ?? ""} maxLength={100} autoComplete="off" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Teléfono" opcional error={e.telefono} ayuda="Ej.: +56 9 8765 4321">
              <Input name="telefono" type="tel" defaultValue={proveedor?.telefono ?? ""} maxLength={30} autoComplete="off" />
            </Field>
            <Field label="Correo electrónico" opcional error={e.email}>
              <Input name="email" type="email" inputMode="email" defaultValue={proveedor?.email ?? ""} maxLength={254} autoComplete="off" />
            </Field>
          </div>
          <Field
            label="Sitio web (para comprar)"
            opcional
            error={e.sitioWeb}
            ayuda="Aparece como botón «Ir a comprar» en el panel. Ej.: www.ejemplo.cl"
          >
            <Input
              name="sitioWeb"
              type="url"
              inputMode="url"
              defaultValue={proveedor?.sitioWeb ?? ""}
              maxLength={300}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="https://"
            />
          </Field>
          <DialogFooter>
            <Button variant="secundario" onClick={onCerrar} disabled={accion.pendiente}>
              Cancelar
            </Button>
            <Button type="submit" cargando={accion.pendiente}>
              {proveedor ? "Guardar cambios" : "Crear proveedor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BotonNuevoProveedor() {
  const [abierto, setAbierto] = React.useState(false);
  const foco = useFocoAlCerrar();
  return (
    <>
      <Button
        onClick={() => {
          foco.recordar();
          setAbierto(true);
        }}
      >
        <Plus aria-hidden />
        Nuevo proveedor
      </Button>
      {abierto ? (
        <DialogoProveedor
          onCerrar={() => {
            setAbierto(false);
            foco.devolver();
          }}
        />
      ) : null}
    </>
  );
}

/** Menú de acciones por fila: editar y activar / desactivar. */
export function AccionesProveedor({ proveedor }: { proveedor: ProveedorEditable }) {
  const [vista, setVista] = React.useState<"editar" | "estado" | null>(null);
  const contenedor = React.useRef<HTMLSpanElement>(null);
  const foco = useFocoAlCerrar(contenedor);
  const cerrar = () => {
    setVista(null);
    foco.devolver();
  };
  return (
    <span className="inline-flex" ref={contenedor}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="fantasma" size="icono" aria-label={`Acciones para ${proveedor.razonSocial}`}>
            <EllipsisVertical aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setVista("editar")}>
            <Pencil aria-hidden />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem peligro={proveedor.activo} onSelect={() => setVista("estado")}>
            {proveedor.activo ? <CircleSlash aria-hidden /> : <CircleCheck aria-hidden />}
            {proveedor.activo ? "Desactivar" : "Reactivar"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {vista === "editar" ? <DialogoProveedor proveedor={proveedor} onCerrar={cerrar} /> : null}
      <ConfirmarActivo
        entidad="proveedor"
        id={proveedor.id}
        nombre={proveedor.razonSocial}
        activo={proveedor.activo}
        open={vista === "estado"}
        onOpenChange={(abierto) => (abierto ? setVista("estado") : cerrar())}
      />
    </span>
  );
}
