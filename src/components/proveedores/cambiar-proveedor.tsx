"use client";

import * as React from "react";
import { ArrowRight, Building2, Globe2, Search, Undo2 } from "lucide-react";
import { definirProveedorInstitucionAccion, definirProveedorRedAccion } from "@/acciones/proveedor-insumo";
import { Alert, Button, Dialog, DialogContent, DialogFooter, DialogTrigger, Input, Select, toast } from "@/components/ui";
import { avisarSesionVencida, esSesionVencida } from "@/components/ui";
import { formatearRut } from "@/lib/chile/rut";
import { cn } from "@/lib/cn";
import { normalizarTexto } from "@/lib/formato";
import type { DetalleProveedorInsumo } from "@/server/servicios";

export interface OpcionProveedorActivo {
  id: string;
  rut: string;
  razonSocial: string;
}

type Ambito = "RED" | "INSTITUCION";

/** Valor del selector que significa "sin proveedor" (red) o "volver al de la red" (institución). */
const NINGUNO = "";

const CLASE_OPCION =
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-control border px-3 py-2 text-left transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-marca-100";

/**
 * "Cambiar proveedor" de un insumo: buscador de proveedores ACTIVOS, indicación
 * clara de qué se cambia (el predeterminado de la red o el de una institución),
 * "Volver al predeterminado de la red" y un paso de confirmación. El servidor
 * vuelve a validar permiso e institución; el cambio queda en la auditoría.
 */
export function BotonCambiarProveedor({
  insumo,
  detalle,
  proveedores,
  instituciones = [],
  sugeridoId,
  children,
  variant = "secundario",
  size = "sm",
  className,
}: {
  insumo: { id: string; nombre: string };
  detalle: DetalleProveedorInsumo;
  /** Proveedores activos (los inactivos no se ofrecen). */
  proveedores: readonly OpcionProveedorActivo[];
  /** Solo para el administrador de la red: instituciones para las que puede definir un proveedor propio. */
  instituciones?: readonly { id: string; nombre: string }[];
  /** Proveedor que el diálogo trae elegido (p. ej. "Usar como predeterminado" con el del último ingreso). */
  sugeridoId?: string;
  /** Texto del botón (por defecto "Cambiar proveedor" o "Definir proveedor"). */
  children?: React.ReactNode;
  variant?: "primario" | "secundario" | "fantasma";
  size?: "sm" | "md";
  className?: string;
}) {
  const { cambiarRed, cambiarInstitucion } = detalle.permisos;
  // El administrador de institución solo cambia el de SU institución; el de la red elige el ámbito.
  const ambitos: Ambito[] = [...(cambiarRed ? (["RED"] as const) : []), ...(cambiarInstitucion && (!cambiarRed || instituciones.length > 0) ? (["INSTITUCION"] as const) : [])];
  const institucionInicial = detalle.institucion?.id ?? instituciones[0]?.id ?? "";

  const [abierto, setAbierto] = React.useState(false);
  const [paso, setPaso] = React.useState<"elegir" | "confirmar">("elegir");
  const [ambito, setAmbito] = React.useState<Ambito>(ambitos[0] ?? "INSTITUCION");
  const [institucionId, setInstitucionId] = React.useState(institucionInicial);
  const [elegido, setElegido] = React.useState<string>(NINGUNO);
  const [busqueda, setBusqueda] = React.useState("");
  const [pendiente, setPendiente] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const idBase = React.useId();

  /** Nombre de la institución a la que se aplica el cambio (ámbito INSTITUCION). */
  const nombreInstitucion =
    instituciones.find((i) => i.id === institucionId)?.nombre ?? (detalle.institucion?.id === institucionId ? detalle.institucion.nombre : null);
  /** Lo que hoy está definido en el nivel que se va a cambiar. */
  const actual =
    ambito === "RED"
      ? detalle.red
      : ((detalle.institucion?.id === institucionId ? detalle.institucion.proveedor : null) ??
        detalle.porInstitucion.find((p) => p.institucionId === institucionId)?.proveedor ??
        null);

  const abrir = (abrirlo: boolean) => {
    setAbierto(abrirlo);
    if (!abrirlo) return;
    const inicial = ambitos[0] ?? "INSTITUCION";
    setPaso("elegir");
    setAmbito(inicial);
    setInstitucionId(institucionInicial);
    setBusqueda("");
    setError(null);
    const vigente = inicial === "RED" ? detalle.red : (detalle.institucion?.proveedor ?? null);
    setElegido(sugeridoId && proveedores.some((p) => p.id === sugeridoId) ? sugeridoId : vigente && proveedores.some((p) => p.id === vigente.id) ? vigente.id : NINGUNO);
  };

  const buscado = normalizarTexto(busqueda);
  const visibles = buscado
    ? proveedores.filter((p) => normalizarTexto(p.razonSocial).includes(buscado) || p.rut.replace(/\D/g, "").includes(busqueda.replace(/\D/g, "") || "·"))
    : proveedores;
  const nuevo = proveedores.find((p) => p.id === elegido) ?? null;
  const sinCambio = (actual?.id ?? NINGUNO) === elegido;
  const etiquetaNinguno = ambito === "RED" ? "Sin proveedor predeterminado" : "Usar el predeterminado de la red";
  const describir = (p: { razonSocial: string } | null) =>
    p ? p.razonSocial : ambito === "RED" ? "Sin proveedor" : `Predeterminado de la red${detalle.red ? ` (${detalle.red.razonSocial})` : " (sin definir)"}`;

  const confirmar = async () => {
    setPendiente(true);
    setError(null);
    let r: Awaited<ReturnType<typeof definirProveedorRedAccion>> | Awaited<ReturnType<typeof definirProveedorInstitucionAccion>>;
    try {
      r =
        ambito === "RED"
          ? await definirProveedorRedAccion({ insumoId: insumo.id, proveedorId: elegido })
          : await definirProveedorInstitucionAccion({ insumoId: insumo.id, institucionId, proveedorId: elegido });
    } catch {
      r = { ok: false, error: "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo." };
    }
    setPendiente(false);
    if (esSesionVencida(r)) return avisarSesionVencida();
    if (!r.ok) {
      setError(r.error);
      setPaso("elegir");
      return;
    }
    toast.exito(
      ambito === "RED"
        ? nuevo
          ? `Proveedor predeterminado de la red: ${nuevo.razonSocial}`
          : "El insumo quedó sin proveedor predeterminado en la red"
        : nuevo
          ? `Proveedor de ${nombreInstitucion ?? "la institución"}: ${nuevo.razonSocial}`
          : `${nombreInstitucion ?? "La institución"} volvió al predeterminado de la red`,
    );
    setAbierto(false);
  };

  if (ambitos.length === 0) return null;
  const esPropia = !cambiarRed;

  return (
    <Dialog open={abierto} onOpenChange={abrir}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          {children ?? (detalle.efectivo ? "Cambiar proveedor" : "Definir proveedor")}
        </Button>
      </DialogTrigger>
      <DialogContent titulo={paso === "confirmar" ? "Confirma el cambio de proveedor" : "Cambiar proveedor"} descripcion={insumo.nombre}>
        {paso === "elegir" ? (
          <div className="space-y-4">
            {error ? <Alert tono="peligro">{error}</Alert> : null}

            {ambitos.length > 1 ? (
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-texto">¿Qué quieres cambiar?</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      { valor: "RED", titulo: "Predeterminado de la red", ayuda: "Para todas las instituciones que no tengan uno propio.", icono: Globe2 },
                      { valor: "INSTITUCION", titulo: "Solo para una institución", ayuda: "Sobrescribe el de la red solo para ella.", icono: Building2 },
                    ] as const
                  ).map((o) => (
                    <label key={o.valor} className={cn(CLASE_OPCION, "items-start", ambito === o.valor ? "border-marca-600 bg-marca-50" : "border-borde-fuerte/70 bg-superficie hover:bg-superficie-2")}>
                      <input
                        type="radio"
                        name={`${idBase}-ambito`}
                        value={o.valor}
                        checked={ambito === o.valor}
                        onChange={() => {
                          setAmbito(o.valor);
                          const vigente = o.valor === "RED" ? detalle.red : (detalle.porInstitucion.find((p) => p.institucionId === institucionId)?.proveedor ?? null);
                          setElegido(vigente && proveedores.some((p) => p.id === vigente.id) ? vigente.id : NINGUNO);
                        }}
                        className="mt-1 size-4 shrink-0 accent-marca-600"
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-texto">
                          <o.icono className="size-4 shrink-0 text-texto-suave" aria-hidden />
                          {o.titulo}
                        </span>
                        <span className="block text-xs text-texto-suave">{o.ayuda}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            {ambito === "INSTITUCION" && cambiarRed ? (
              <div className="space-y-1.5">
                <label htmlFor={`${idBase}-institucion`} className="block text-sm font-medium text-texto">
                  Institución
                </label>
                <Select
                  id={`${idBase}-institucion`}
                  value={institucionId}
                  onChange={(e) => {
                    setInstitucionId(e.target.value);
                    const vigente = detalle.porInstitucion.find((p) => p.institucionId === e.target.value)?.proveedor ?? null;
                    setElegido(vigente && proveedores.some((p) => p.id === vigente.id) ? vigente.id : NINGUNO);
                  }}
                  opciones={instituciones.map((i) => ({ value: i.id, label: i.nombre }))}
                />
              </div>
            ) : null}

            <Alert tono="info" titulo={ambito === "RED" ? "Cambias el predeterminado de la red" : esPropia ? "Cambias el proveedor para tu institución" : "Cambias el proveedor de una institución"} data-ambito-cambio={ambito}>
              {ambito === "RED" ? (
                <>Vale para todas las instituciones, salvo las que definieron un proveedor propio para este insumo.</>
              ) : (
                <>
                  Solo cambia para <strong className="font-semibold">{nombreInstitucion ?? "la institución"}</strong>. Las demás instituciones
                  siguen con el suyo{esPropia ? "; el predeterminado de la red lo define el administrador de la red" : ""}.
                </>
              )}
              <span className="mt-1 block">
                Hoy: <strong className="font-semibold">{describir(actual)}</strong>
                {actual && !actual.activo ? " (inactivo)" : ""}
              </span>
            </Alert>

            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-texto">Proveedor</legend>
              {proveedores.length > 6 ? (
                <Input
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre o RUT"
                  aria-label="Buscar proveedor"
                  inicio={<Search aria-hidden />}
                  autoComplete="off"
                  className="mb-2"
                />
              ) : null}
              <div className="max-h-[38dvh] space-y-1.5 overflow-y-auto pr-0.5" role="radiogroup" aria-label="Proveedores activos">
                {visibles.map((p) => (
                  <label key={p.id} className={cn(CLASE_OPCION, elegido === p.id ? "border-marca-600 bg-marca-50" : "border-borde bg-superficie hover:bg-superficie-2")}>
                    <input
                      type="radio"
                      name={`${idBase}-proveedor`}
                      value={p.id}
                      checked={elegido === p.id}
                      onChange={() => setElegido(p.id)}
                      className="size-4 shrink-0 accent-marca-600"
                    />
                    <span className="min-w-0">
                      <span className="block text-[0.9375rem] font-medium break-words text-texto">{p.razonSocial}</span>
                      <span className="cifras block text-xs text-texto-suave">{formatearRut(p.rut)}</span>
                    </span>
                  </label>
                ))}
                {visibles.length === 0 ? (
                  <p className="px-1 py-3 text-sm text-texto-suave">
                    {proveedores.length === 0 ? "No hay proveedores activos. Agrégalos en Administración › Proveedores." : "Ningún proveedor activo coincide con la búsqueda."}
                  </p>
                ) : null}
                {ambito === "RED" ? (
                  <label className={cn(CLASE_OPCION, elegido === NINGUNO ? "border-marca-600 bg-marca-50" : "border-borde bg-superficie hover:bg-superficie-2")}>
                    <input
                      type="radio"
                      name={`${idBase}-proveedor`}
                      value={NINGUNO}
                      checked={elegido === NINGUNO}
                      onChange={() => setElegido(NINGUNO)}
                      className="size-4 shrink-0 accent-marca-600"
                    />
                    <span className="text-[0.9375rem] text-texto-suave">{etiquetaNinguno}</span>
                  </label>
                ) : null}
              </div>
            </fieldset>

            <DialogFooter className="sm:items-center">
              {ambito === "INSTITUCION" && actual ? (
                <Button
                  variant="fantasma"
                  className="sm:mr-auto"
                  onClick={() => {
                    setElegido(NINGUNO);
                    setPaso("confirmar");
                  }}
                >
                  <Undo2 aria-hidden />
                  Volver al predeterminado de la red
                </Button>
              ) : null}
              <Button variant="secundario" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
              <Button disabled={sinCambio || (ambito === "INSTITUCION" && elegido === NINGUNO)} onClick={() => setPaso("confirmar")}>
                Continuar
                <ArrowRight aria-hidden />
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4" data-confirmar-proveedor>
            <p className="text-[0.9375rem] text-texto">
              {ambito === "RED" ? (
                <>
                  Vas a cambiar el <strong className="font-semibold">proveedor predeterminado de la red</strong> de este insumo.
                </>
              ) : (
                <>
                  Vas a cambiar el proveedor de este insumo <strong className="font-semibold">solo para {nombreInstitucion ?? "la institución"}</strong>.
                </>
              )}
            </p>
            <dl className="grid gap-px overflow-hidden rounded-control border border-borde bg-borde text-sm sm:grid-cols-2">
              <div className="bg-superficie-2 px-3 py-2.5">
                <dt className="text-xs text-texto-suave">Hoy</dt>
                <dd className="font-medium break-words text-texto">{describir(actual)}</dd>
              </div>
              <div className="bg-superficie px-3 py-2.5">
                <dt className="text-xs text-texto-suave">Quedará</dt>
                <dd className="font-semibold break-words text-texto">{describir(nuevo)}</dd>
              </div>
            </dl>
            <p className="text-sm text-texto-suave">
              {ambito === "RED"
                ? "Las instituciones con un proveedor propio para este insumo no cambian."
                : "Las demás instituciones y el predeterminado de la red no cambian."}{" "}
              No modifica los ingresos ya registrados. El cambio queda en la auditoría.
            </p>
            <DialogFooter>
              <Button variant="secundario" onClick={() => setPaso("elegir")} disabled={pendiente}>
                Volver
              </Button>
              <Button onClick={() => void confirmar()} cargando={pendiente}>
                Confirmar cambio
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
