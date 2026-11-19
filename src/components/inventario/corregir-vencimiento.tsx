"use client";

import * as React from "react";
import { CalendarCog } from "lucide-react";
import { corregirVencimientoLoteAccion } from "@/acciones/movimientos";
import { AYUDA_SIN_PACIENTES } from "@/components/movimientos/formulario";
import { Alert, Button, Dialog, DialogContent, DialogFooter, DialogTrigger, Field, Input, Textarea, toast, useAccion } from "@/components/ui";
import { formatearDia, parsearDia, type DiaISO } from "@/lib/fechas";

export interface LoteCorregible {
  loteId: string;
  numeroLote: string;
  fechaVencimiento: DiaISO | null;
}

/**
 * Corrección administrativa del vencimiento de un lote (solo administradores): fecha
 * nueva + motivo obligatorio y un paso de confirmación. La fecha es del LOTE,
 * así que cambia en todas las ubicaciones y centros donde esté. Queda en la
 * auditoría (LOTE_ACTUALIZADO) con la fecha anterior, la nueva y el motivo.
 */
export function BotonCorregirVencimiento({
  lote,
  insumo,
  controlaVencimiento,
  className,
}: {
  lote: LoteCorregible;
  insumo: string;
  controlaVencimiento: boolean;
  className?: string;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [paso, setPaso] = React.useState<"datos" | "confirmar">("datos");
  const [fecha, setFecha] = React.useState(lote.fechaVencimiento ?? "");
  const [motivo, setMotivo] = React.useState("");
  const [erroresLocales, setErroresLocales] = React.useState<{ fechaVencimiento?: string; motivo?: string }>({});
  const correccion = useAccion(corregirVencimientoLoteAccion, { toastError: false });

  const alAbrir = (valor: boolean) => {
    if (correccion.pendiente) return;
    setAbierto(valor);
    if (valor) {
      setPaso("datos");
      setFecha(lote.fechaVencimiento ?? "");
      setMotivo("");
      setErroresLocales({});
      correccion.limpiar();
    }
  };

  const revisar = (evento: React.FormEvent) => {
    evento.preventDefault();
    const e: typeof erroresLocales = {};
    if (fecha && !parsearDia(fecha)) e.fechaVencimiento = "Fecha inválida.";
    else if (!fecha && controlaVencimiento) e.fechaVencimiento = "Este insumo controla vencimiento: el lote no puede quedar sin fecha.";
    else if ((fecha || null) === lote.fechaVencimiento) e.fechaVencimiento = "Es la misma fecha que ya tiene el lote.";
    if (!motivo.trim()) e.motivo = "Indica el motivo de la corrección.";
    setErroresLocales(e);
    correccion.limpiar();
    if (Object.keys(e).length === 0) setPaso("confirmar");
  };

  const confirmar = async () => {
    const r = await correccion.ejecutar({ loteId: lote.loteId, fechaVencimiento: fecha, motivo });
    if (!r.ok) {
      setPaso("datos");
      return;
    }
    setAbierto(false);
    toast.exito(
      r.datos.cambiado
        ? `Vencimiento del lote ${r.datos.numeroLote} corregido: ${r.datos.fechaVencimiento ? formatearDia(r.datos.fechaVencimiento) : "sin fecha"}`
        : `El lote ${r.datos.numeroLote} ya tenía esa fecha; no se cambió nada`,
    );
  };

  const antes = lote.fechaVencimiento ? formatearDia(lote.fechaVencimiento) : "sin fecha";
  const despues = fecha ? formatearDia(fecha) : "sin fecha";
  const errorServidorSinCampo =
    correccion.error && !correccion.erroresCampo.fechaVencimiento && !correccion.erroresCampo.motivo ? correccion.error : null;

  return (
    <Dialog open={abierto} onOpenChange={alAbrir}>
      <DialogTrigger asChild>
        <Button size="sm" variant="fantasma" className={className} aria-label={`Corregir vencimiento del lote ${lote.numeroLote}`}>
          <CalendarCog aria-hidden />
          Corregir vencimiento
        </Button>
      </DialogTrigger>
      <DialogContent
        titulo={paso === "datos" ? "Corregir vencimiento" : "¿Confirmas la corrección?"}
        descripcion={
          <>
            {insumo} · lote <span className="cifras font-medium text-texto">{lote.numeroLote}</span>
          </>
        }
        ancho="sm"
      >
        {paso === "datos" ? (
          <form noValidate onSubmit={revisar} className="space-y-5">
            {errorServidorSinCampo ? <Alert tono="peligro">{errorServidorSinCampo}</Alert> : null}
            <p className="text-sm text-texto-suave">
              Vencimiento registrado: <strong className="cifras font-semibold text-texto">{antes}</strong>. Usa esta corrección solo si la
              fecha se digitó mal: se cambia en todas las ubicaciones y centros donde esté el lote.
            </p>
            <Field
              label="Nueva fecha de vencimiento"
              requerido={controlaVencimiento}
              opcional={!controlaVencimiento}
              error={erroresLocales.fechaVencimiento ?? correccion.erroresCampo.fechaVencimiento}
              ayuda={
                fecha && parsearDia(fecha) ? (
                  <>
                    Vencerá el <strong className="cifras font-semibold text-texto">{formatearDia(fecha)}</strong> (día-mes-año)
                  </>
                ) : controlaVencimiento ? undefined : (
                  "Déjala en blanco si el lote no tiene vencimiento."
                )
              }
            >
              <Input
                name="fechaVencimiento"
                type="date"
                lang="es-CL"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="cifras"
              />
            </Field>
            <Field
              label="Motivo de la corrección"
              requerido
              error={erroresLocales.motivo ?? correccion.erroresCampo.motivo}
              ayuda={`Por ejemplo: "Error de digitación al ingresar". ${AYUDA_SIN_PACIENTES}`}
            >
              <Textarea name="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={200} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="secundario" onClick={() => alAbrir(false)}>
                Cancelar
              </Button>
              <Button type="submit">Revisar corrección</Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-2">
              <div className="rounded-control bg-superficie-2 px-3.5 py-3 ring-1 ring-borde ring-inset">
                <dt className="text-sm text-texto-suave">Vencimiento actual</dt>
                <dd className="cifras mt-0.5 text-lg font-semibold text-texto">{antes}</dd>
              </div>
              <div className="rounded-control bg-marca-50 px-3.5 py-3 ring-1 ring-marca-200 ring-inset">
                <dt className="text-sm text-texto-suave">Nuevo vencimiento</dt>
                <dd className="cifras mt-0.5 text-lg font-semibold text-texto">{despues}</dd>
              </div>
            </dl>
            <p className="text-sm text-texto">
              <span className="text-texto-suave">Motivo:</span> {motivo.trim()}
            </p>
            <Alert tono="alerta">
              El cambio aplica al lote en toda la red y puede dejarlo vencido o vigente. Queda registrado en la auditoría con tu usuario,
              la fecha anterior y el motivo.
            </Alert>
            <DialogFooter>
              <Button type="button" variant="secundario" onClick={() => setPaso("datos")} disabled={correccion.pendiente}>
                Volver a revisar
              </Button>
              <Button type="button" onClick={() => void confirmar()} cargando={correccion.pendiente}>
                Confirmar corrección
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
