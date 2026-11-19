"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { actualizarCentroAccion, crearCentroAccion } from "@/acciones/admin-centros";
import { Alert, Button, buttonClasses, Field, Input, Select, useAccion } from "@/components/ui";
import { comunasDeRegion, NOMBRES_REGIONES } from "@/lib/chile/regiones";
import { formatearRut, validarRut } from "@/lib/chile/rut";
import { esquemaCentro, type EntradaCentro } from "@/lib/esquemas/centros";
import { ETIQUETA_TIPO_CENTRO, TIPOS_CENTRO } from "@/lib/estados";
import { texto, useValidacion } from "./use-validacion";

export interface ValoresCentro {
  id: string;
  nombre: string;
  tipo: (typeof TIPOS_CENTRO)[number];
  rut: string | null;
  direccion: string;
  region: string;
  comuna: string;
  telefono: string | null;
}

const OTRA = "__otra__";

/** Formulario para crear (sin `centro`) o editar un centro de la red. */
export function FormularioCentro({ centro }: { centro?: ValoresCentro }) {
  const router = useRouter();
  const crear = useAccion(crearCentroAccion, {
    exito: (r) => `${r.nombre} creado con una bodega inicial`,
    alExito: (r) => router.push(`/admin/centros/${r.id}`),
    toastError: false,
  });
  const actualizar = useAccion(actualizarCentroAccion, { exito: "Cambios guardados", toastError: false });
  const accion = centro ? actualizar : crear;
  const validacion = useValidacion(esquemaCentro, accion.erroresCampo);
  const e = validacion.errores;

  const [rut, setRut] = React.useState(centro?.rut ? formatearRut(centro.rut) : "");
  const [region, setRegion] = React.useState(centro?.region ?? "");
  const comunas = comunasDeRegion(region);
  const comunaInicialEnLista = centro ? comunasDeRegion(centro.region).includes(centro.comuna) : true;
  const [comuna, setComuna] = React.useState(centro ? (comunaInicialEnLista ? centro.comuna : OTRA) : "");
  const [otraComuna, setOtraComuna] = React.useState(centro && !comunaInicialEnLista ? centro.comuna : "");

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const f = new FormData(evento.currentTarget);
    const valores: EntradaCentro = {
      nombre: texto(f, "nombre"),
      tipo: texto(f, "tipo") as EntradaCentro["tipo"],
      rut,
      direccion: texto(f, "direccion"),
      region,
      comuna: comuna === OTRA ? otraComuna : comuna,
      telefono: texto(f, "telefono"),
    };
    if (!validacion.validar(valores)) return;
    if (centro) void actualizar.ejecutar({ ...valores, id: centro.id });
    else void crear.ejecutar(valores);
  }

  const hayErroresCampo = Object.keys(e).length > 0;

  return (
    <form noValidate onSubmit={enviar} onChange={validacion.alCambiar} className="space-y-5">
      {accion.error && !hayErroresCampo ? <Alert tono="peligro">{accion.error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre del centro" requerido error={e.nombre} className="sm:col-span-2" ayuda="Ej.: Centro de Diálisis Ñuñoa">
          <Input name="nombre" defaultValue={centro?.nombre} maxLength={100} autoComplete="off" autoFocus={!centro} />
        </Field>
        <Field label="Tipo de centro" requerido error={e.tipo}>
          <Select
            name="tipo"
            defaultValue={centro?.tipo ?? ""}
            placeholder="Selecciona…"
            opciones={TIPOS_CENTRO.map((t) => ({ value: t, label: ETIQUETA_TIPO_CENTRO[t] }))}
          />
        </Field>
        <Field label="RUT" opcional error={e.rut} ayuda="Con dígito verificador. Ej.: 76.123.456-0">
          <Input
            name="rut"
            value={rut}
            onChange={(ev) => setRut(ev.target.value)}
            onBlur={() => {
              if (validarRut(rut)) setRut(formatearRut(rut));
            }}
            inputMode="text"
            autoComplete="off"
            maxLength={14}
            className="cifras"
          />
        </Field>
        <Field label="Dirección" requerido error={e.direccion} className="sm:col-span-2">
          <Input name="direccion" defaultValue={centro?.direccion} maxLength={160} autoComplete="off" />
        </Field>
        <Field label="Región" requerido error={e.region}>
          <Select
            name="region"
            value={region}
            onChange={(ev) => {
              setRegion(ev.target.value);
              setComuna("");
              setOtraComuna("");
              validacion.limpiarCampo("comuna");
            }}
            placeholder="Selecciona…"
            opciones={NOMBRES_REGIONES.map((r) => ({ value: r, label: r }))}
          />
        </Field>
        <Field
          label="Comuna"
          requerido
          error={comuna === OTRA ? undefined : e.comuna}
          ayuda={region ? undefined : "Elige primero la región."}
        >
          <Select
            name="comuna"
            value={comuna}
            onChange={(ev) => setComuna(ev.target.value)}
            disabled={!region}
            placeholder="Selecciona…"
          >
            {comunas.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {region ? <option value={OTRA}>Otra comuna…</option> : null}
          </Select>
        </Field>
        {comuna === OTRA ? (
          <Field label="Nombre de la comuna" requerido error={e.comuna} className="sm:col-start-2">
            <Input name="comuna" value={otraComuna} onChange={(ev) => setOtraComuna(ev.target.value)} maxLength={80} autoComplete="off" autoFocus />
          </Field>
        ) : null}
        <Field label="Teléfono" opcional error={e.telefono} ayuda="Ej.: +56 2 2345 6789">
          <Input name="telefono" type="tel" defaultValue={centro?.telefono ?? ""} maxLength={30} autoComplete="off" />
        </Field>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-borde pt-5 sm:flex-row sm:justify-end">
        <Link href="/admin/centros" className={buttonClasses({ variant: "secundario" })}>
          {centro ? "Volver a centros" : "Cancelar"}
        </Link>
        <Button type="submit" cargando={accion.pendiente}>
          {accion.pendiente ? null : <Save aria-hidden />}
          {centro ? "Guardar cambios" : "Crear centro"}
        </Button>
      </div>
    </form>
  );
}
