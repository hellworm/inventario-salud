"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Barcode, Save } from "lucide-react";
import { actualizarInsumoAccion, crearInsumoAccion } from "@/acciones/admin-catalogo";
import { Alert, Button, buttonClasses, Checkbox, Field, Input, Select, Textarea, useAccion } from "@/components/ui";
import { esquemaInsumo, type EntradaInsumo } from "@/lib/esquemas/catalogo";
import { UNIDADES_MEDIDA } from "@/lib/estados";
import { texto, useValidacion } from "./use-validacion";

export interface ValoresInsumo {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  categoriaId: string;
  unidadMedida: string;
  presentacion: string | null;
  fabricante: string | null;
  registroSanitario: string | null;
  codigoBarras: string | null;
  requiereCadenaFrio: boolean;
  controlaVencimiento: boolean;
}

function Seccion({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-x-8 gap-y-4 border-t border-borde pt-6 first:border-t-0 first:pt-0 lg:grid-cols-[15rem_1fr]">
      <legend className="sr-only">{titulo}</legend>
      <div aria-hidden>
        <p className="text-[0.9375rem] font-semibold text-texto">{titulo}</p>
        {descripcion ? <p className="mt-1 text-sm text-texto-suave">{descripcion}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

/** Formulario para crear (sin `insumo`) o editar un insumo del catálogo. */
export function FormularioInsumo({
  insumo,
  categorias,
}: {
  insumo?: ValoresInsumo;
  categorias: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const crear = useAccion(crearInsumoAccion, {
    exito: (r) => `Insumo ${r.codigo} creado. Ahora puedes definir sus mínimos por centro.`,
    alExito: (r) => router.push(`/admin/insumos/${r.id}`),
    toastError: false,
  });
  const actualizar = useAccion(actualizarInsumoAccion, { exito: "Cambios guardados", toastError: false });
  const accion = insumo ? actualizar : crear;
  const validacion = useValidacion(esquemaInsumo, accion.erroresCampo);
  const e = validacion.errores;

  const unidades: string[] = [...UNIDADES_MEDIDA];
  if (insumo && !unidades.includes(insumo.unidadMedida)) unidades.unshift(insumo.unidadMedida);

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const f = new FormData(evento.currentTarget);
    const valores: EntradaInsumo = {
      codigo: texto(f, "codigo"),
      nombre: texto(f, "nombre"),
      descripcion: texto(f, "descripcion"),
      categoriaId: texto(f, "categoriaId"),
      unidadMedida: texto(f, "unidadMedida"),
      presentacion: texto(f, "presentacion"),
      fabricante: texto(f, "fabricante"),
      registroSanitario: texto(f, "registroSanitario"),
      codigoBarras: texto(f, "codigoBarras"),
      requiereCadenaFrio: f.get("requiereCadenaFrio") === "on",
      controlaVencimiento: f.get("controlaVencimiento") === "on",
    };
    if (!validacion.validar(valores)) return;
    if (insumo) void actualizar.ejecutar({ ...valores, id: insumo.id });
    else void crear.ejecutar(valores);
  }

  const hayErroresCampo = Object.keys(e).length > 0;

  return (
    <form noValidate onSubmit={enviar} onChange={validacion.alCambiar} className="space-y-6">
      {accion.error && !hayErroresCampo ? <Alert tono="peligro">{accion.error}</Alert> : null}
      {hayErroresCampo ? (
        <Alert tono="peligro">Revisa los campos marcados antes de guardar.</Alert>
      ) : null}

      <Seccion titulo="Identificación" descripcion="Cómo se reconoce el insumo en toda la red.">
        <Field label="Código (SKU)" requerido error={e.codigo} ayuda="Único en el catálogo. Ej.: JER-10">
          <Input
            name="codigo"
            defaultValue={insumo?.codigo}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={30}
            className="uppercase placeholder:normal-case"
            autoFocus={!insumo}
          />
        </Field>
        <Field label="Categoría" requerido error={e.categoriaId}>
          <Select
            name="categoriaId"
            defaultValue={insumo?.categoriaId ?? ""}
            placeholder="Selecciona…"
            opciones={categorias.map((c) => ({ value: c.id, label: c.nombre }))}
          />
        </Field>
        <Field label="Nombre" requerido error={e.nombre} className="sm:col-span-2">
          <Input name="nombre" defaultValue={insumo?.nombre} maxLength={120} autoComplete="off" />
        </Field>
        <Field label="Descripción" opcional error={e.descripcion} className="sm:col-span-2">
          <Textarea name="descripcion" defaultValue={insumo?.descripcion ?? ""} rows={2} maxLength={500} />
        </Field>
      </Seccion>

      <Seccion titulo="Presentación" descripcion="La unidad en que se cuenta el stock y cómo viene envasado.">
        <Field label="Unidad de medida" requerido error={e.unidadMedida} ayuda="El stock se cuenta en esta unidad.">
          <Select
            name="unidadMedida"
            defaultValue={insumo?.unidadMedida ?? ""}
            placeholder="Selecciona…"
            opciones={unidades.map((u) => ({ value: u, label: u.charAt(0).toUpperCase() + u.slice(1) }))}
          />
        </Field>
        <Field label="Presentación" opcional error={e.presentacion} ayuda="Ej.: Caja de 100 unidades">
          <Input name="presentacion" defaultValue={insumo?.presentacion ?? ""} maxLength={120} />
        </Field>
        <Field label="Fabricante" opcional error={e.fabricante} className="sm:col-span-2">
          <Input name="fabricante" defaultValue={insumo?.fabricante ?? ""} maxLength={120} />
        </Field>
      </Seccion>

      <Seccion titulo="Registro y trazabilidad" descripcion="Datos para fiscalización y lectura con escáner.">
        <Field label="Registro sanitario ISP" opcional error={e.registroSanitario} ayuda="Ej.: DM-1234/22">
          <Input name="registroSanitario" defaultValue={insumo?.registroSanitario ?? ""} maxLength={40} autoComplete="off" />
        </Field>
        <Field label="Código de barras" opcional error={e.codigoBarras} ayuda="Puedes escanearlo con el lector.">
          <Input
            name="codigoBarras"
            defaultValue={insumo?.codigoBarras ?? ""}
            maxLength={64}
            inputMode="numeric"
            autoComplete="off"
            inicio={<Barcode aria-hidden />}
          />
        </Field>
      </Seccion>

      <Seccion titulo="Manejo" descripcion="Reglas que el sistema aplica al registrar movimientos.">
        <div className="sm:col-span-2">
          <Checkbox
            name="controlaVencimiento"
            defaultChecked={insumo ? insumo.controlaVencimiento : true}
            label="Controla fecha de vencimiento"
            descripcion="Cada ingreso exigirá la fecha de vencimiento del lote y habrá alertas antes de que venza."
          />
          <Checkbox
            name="requiereCadenaFrio"
            defaultChecked={insumo?.requiereCadenaFrio ?? false}
            label="Requiere cadena de frío"
            descripcion="Se muestra como refrigerado para guardarlo en la ubicación correcta."
          />
        </div>
      </Seccion>

      <div className="flex flex-col-reverse gap-2 border-t border-borde pt-5 sm:flex-row sm:justify-end">
        <Link href="/admin/insumos" className={buttonClasses({ variant: "secundario" })}>
          {insumo ? "Volver al catálogo" : "Cancelar"}
        </Link>
        <Button type="submit" cargando={accion.pendiente}>
          <Save aria-hidden />
          {insumo ? "Guardar cambios" : "Crear insumo"}
        </Button>
      </div>
    </form>
  );
}
