"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, CircleCheck, CircleSlash, EllipsisVertical, Pencil, Plus, Users } from "lucide-react";
import { actualizarInstitucionAccion, crearInstitucionAccion } from "@/acciones/admin-instituciones";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  Input,
  toast,
  useAccion,
} from "@/components/ui";
import { formatearRut, validarRut } from "@/lib/chile/rut";
import { esquemaInstitucion, type EntradaInstitucion } from "@/lib/esquemas/instituciones";
import { ConfirmarActivo } from "./boton-cambiar-activo";
import { useFocoAlCerrar } from "./use-foco-al-cerrar";
import { texto, useValidacion } from "./use-validacion";
import { DialogoPasswordTemporal, type PasswordEntregada } from "./usuarios";

export interface InstitucionEditable {
  id: string;
  nombre: string;
  rut: string | null;
  activo: boolean;
  /** Para avisar antes de intentar desactivarla. */
  existencias: number;
}

function DialogoInstitucion({
  institucion,
  onCerrar,
  onCreada,
}: {
  institucion?: InstitucionEditable;
  onCerrar: () => void;
  /** Institución creada: con la contraseña temporal de su primer administrador, si se pidió. */
  onCreada: (resultado: { nombre: string; password: PasswordEntregada | null }) => void;
}) {
  const crear = useAccion(crearInstitucionAccion, {
    alExito: (r) => {
      if (!r.administrador) toast.exito(`Institución "${r.nombre}" creada`);
      onCreada({
        nombre: r.nombre,
        password: r.administrador
          ? {
              nombre: r.administrador.nombre,
              email: r.administrador.email,
              passwordTemporal: r.administrador.passwordTemporal,
              motivo: "creado",
              titulo: "Institución creada",
              descripcion: `"${r.nombre}" ya existe en la red. Entrega esta contraseña temporal a ${r.administrador.nombre}, su primer administrador.`,
            }
          : null,
      });
    },
    toastError: false,
  });
  const actualizar = useAccion(actualizarInstitucionAccion, {
    exito: "Cambios guardados",
    alExito: onCerrar,
    toastError: false,
  });
  const accion = institucion ? actualizar : crear;
  const validacion = useValidacion(esquemaInstitucion, accion.erroresCampo);
  const e = validacion.errores;
  const [rut, setRut] = React.useState(institucion?.rut ? formatearRut(institucion.rut) : "");
  const [conAdministrador, setConAdministrador] = React.useState(!institucion);

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const f = new FormData(evento.currentTarget);
    const valores: EntradaInstitucion = {
      nombre: texto(f, "nombre"),
      rut,
      administrador:
        !institucion && conAdministrador
          ? { nombre: texto(f, "administrador.nombre"), email: texto(f, "administrador.email") }
          : undefined,
    };
    if (!validacion.validar(valores)) return;
    if (institucion) void actualizar.ejecutar({ id: institucion.id, nombre: valores.nombre, rut: valores.rut });
    else void crear.ejecutar(valores);
  }

  const hayErroresCampo = Object.keys(e).length > 0;

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto && !accion.pendiente) onCerrar();
      }}
    >
      <DialogContent
        ancho="md"
        titulo={institucion ? "Editar institución" : "Nueva institución"}
        descripcion={
          institucion
            ? "El nombre se muestra a sus usuarios y en el resumen de la red."
            : "Una institución agrupa sus propios centros y usuarios. No ve nada de las demás instituciones."
        }
      >
        <form noValidate onSubmit={enviar} onChange={validacion.alCambiar} className="space-y-5">
          {accion.error && !hayErroresCampo ? <Alert tono="peligro">{accion.error}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre de la institución" requerido error={e.nombre} className="sm:col-span-2" ayuda="Ej.: Corporación Municipal de Salud Cerro Alegre">
              <Input name="nombre" defaultValue={institucion?.nombre} maxLength={120} autoComplete="off" autoFocus />
            </Field>
            <Field label="RUT" opcional error={e.rut} ayuda="Con dígito verificador. Ej.: 76.123.456-0">
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
              />
            </Field>
          </div>

          {!institucion ? (
            <fieldset className="rounded-control border border-borde px-3.5 pb-1">
              <legend className="sr-only">Primer administrador</legend>
              <Checkbox
                label="Crear a su primer administrador"
                descripcion="Será administrador de esta institución: podrá crear sus centros y sus demás usuarios."
                checked={conAdministrador}
                onChange={(ev) => setConAdministrador(ev.target.checked)}
              />
              {conAdministrador ? (
                <div className="grid gap-4 pb-3 sm:grid-cols-2">
                  <Field label="Nombre y apellido" requerido error={e["administrador.nombre"]}>
                    <Input name="administrador.nombre" maxLength={100} autoComplete="off" />
                  </Field>
                  <Field
                    label="Correo electrónico"
                    requerido
                    error={e["administrador.email"]}
                    ayuda="Lo usará para iniciar sesión."
                  >
                    <Input
                      name="administrador.email"
                      type="email"
                      inputMode="email"
                      maxLength={254}
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                  </Field>
                  <p className="text-sm text-texto-suave sm:col-span-2">
                    Al crear la institución verás una contraseña temporal para entregarle. La cambiará en su primer ingreso.
                  </p>
                </div>
              ) : (
                <p className="pb-3 text-sm text-texto-suave">Podrás crearlo después desde Usuarios, eligiendo esta institución.</p>
              )}
            </fieldset>
          ) : null}

          <DialogFooter>
            <Button variant="secundario" onClick={onCerrar} disabled={accion.pendiente}>
              Cancelar
            </Button>
            <Button type="submit" cargando={accion.pendiente}>
              {institucion ? "Guardar cambios" : "Crear institución"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BotonNuevaInstitucion() {
  const [abierto, setAbierto] = React.useState(false);
  const [password, setPassword] = React.useState<PasswordEntregada | null>(null);
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
        Nueva institución
      </Button>
      {abierto ? (
        <DialogoInstitucion
          onCerrar={() => {
            setAbierto(false);
            foco.devolver();
          }}
          onCreada={({ password: entregada }) => {
            setAbierto(false);
            if (entregada) setPassword(entregada);
            else foco.devolver();
          }}
        />
      ) : null}
      {password ? (
        <DialogoPasswordTemporal
          datos={password}
          onCerrar={() => {
            setPassword(null);
            foco.devolver();
          }}
        />
      ) : null}
    </>
  );
}

type Vista = "editar" | "estado" | null;

/** Menú de acciones por institución. */
export function AccionesInstitucion({ institucion }: { institucion: InstitucionEditable }) {
  const [vista, setVista] = React.useState<Vista>(null);
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
          <Button variant="fantasma" size="icono" aria-label={`Acciones para ${institucion.nombre}`}>
            <EllipsisVertical aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setVista("editar")}>
            <Pencil aria-hidden />
            Editar nombre y RUT
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/admin/centros">
              <Building2 aria-hidden />
              Ver sus centros
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/admin/usuarios?institucion=${institucion.id}`}>
              <Users aria-hidden />
              Ver sus usuarios
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem peligro={institucion.activo} onSelect={() => setVista("estado")}>
            {institucion.activo ? <CircleSlash aria-hidden /> : <CircleCheck aria-hidden />}
            {institucion.activo ? "Desactivar institución" : "Reactivar institución"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {vista === "editar" ? <DialogoInstitucion institucion={institucion} onCerrar={cerrar} onCreada={cerrar} /> : null}

      <ConfirmarActivo
        entidad="institucion"
        id={institucion.id}
        nombre={institucion.nombre}
        activo={institucion.activo}
        open={vista === "estado"}
        onOpenChange={(abierto) => {
          if (abierto) setVista("estado");
          else cerrar();
        }}
        aviso={
          institucion.activo && institucion.existencias > 0
            ? "Hoy tiene stock en sus centros: si alguno de esos centros está activo, primero habrá que dar de baja o retirar ese stock, o desactivar el centro."
            : undefined
        }
      />
    </span>
  );
}
