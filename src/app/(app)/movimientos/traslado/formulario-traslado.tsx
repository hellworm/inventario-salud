"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftRight, ArrowRight, Plus } from "lucide-react";
import { registrarTrasladoAccion } from "@/acciones/movimientos";
import { Alert, Button, buttonClasses, Card, Field, Input, Skeleton, Textarea, useAccion } from "@/components/ui";
import {
  CampoCantidad,
  Grupo,
  leerCantidad,
  SelectorLote,
  SelectUbicacion,
  type UbicacionOpcion,
} from "@/components/movimientos/campos";
import { ComboboxInsumo, type InsumoOpcion } from "@/components/movimientos/combobox-insumo";
import {
  AnuncioErrores,
  CifrasConfirmacion,
  Confirmacion,
  enfocarPrimerError,
  erroresDeEsquema,
  PanelExistencias,
  stockPorUbicacion,
  unirErrores,
  useExistenciasInsumo,
} from "@/components/movimientos/formulario";
import { esquemaTraslado } from "@/lib/esquemas/movimientos";
import type { ErroresCampo } from "@/lib/resultado";
import { cantidadConUnidad } from "@/lib/unidades";

interface TrasladoConfirmado {
  insumo: InsumoOpcion;
  origen: UbicacionOpcion;
  destino: UbicacionOpcion;
  numeroLote: string;
  cantidad: number;
  saldoOrigen: number;
  saldoDestino: number;
}

export interface FormularioTrasladoProps {
  /** Ubicaciones desde las que se puede trasladar (centro activo). */
  origenes: UbicacionOpcion[];
  /** Ubicaciones de destino posibles (todos los centros visibles). */
  destinos: UbicacionOpcion[];
  insumosIniciales: InsumoOpcion[];
  centroId: string | null;
  mostrarCentro: boolean;
  inicial: { insumo: InsumoOpcion | null; ubicacionId: string | null; loteId: string | null };
}

const nombreCompleto = (u: UbicacionOpcion) => `${u.nombre} (${u.centro})`;

export function FormularioTraslado({ origenes, destinos, insumosIniciales, centroId, mostrarCentro, inicial }: FormularioTrasladoProps) {
  const refFormulario = React.useRef<HTMLFormElement>(null);
  const [insumo, setInsumo] = React.useState<InsumoOpcion | null>(inicial.insumo);
  const [origenElegido, setOrigenElegido] = React.useState(inicial.ubicacionId ?? "");
  const [loteElegido, setLoteElegido] = React.useState(inicial.loteId ?? "");
  const [destinoId, setDestinoId] = React.useState("");
  const [cantidad, setCantidad] = React.useState("");
  const [motivo, setMotivo] = React.useState("");
  const [nota, setNota] = React.useState("");
  const [intentado, setIntentado] = React.useState(false);
  const [confirmado, setConfirmado] = React.useState<TrasladoConfirmado | null>(null);
  const [ronda, setRonda] = React.useState(0);

  const existencias = useExistenciasInsumo(insumo?.id ?? null, centroId);
  const traslado = useAccion(registrarTrasladoAccion, { toastError: false });

  const stock = React.useMemo(() => stockPorUbicacion(existencias.datos?.existencias ?? []), [existencias.datos]);
  const totalEn = React.useCallback(
    (id: string) => {
      const s = stock.get(id);
      return s ? s.disponible + s.vencido : 0;
    },
    [stock],
  );

  // Origen efectivo: el elegido o, si solo una ubicación tiene stock, esa.
  const origenId = React.useMemo(() => {
    if (origenElegido) return origenElegido;
    if (!existencias.datos) return "";
    const conStock = origenes.filter((u) => totalEn(u.id) > 0);
    return conStock.length === 1 ? conStock[0]!.id : "";
  }, [origenElegido, existencias.datos, origenes, totalEn]);
  const origen = origenes.find((u) => u.id === origenId) ?? null;
  const destino = destinos.find((u) => u.id === destinoId) ?? null;

  const lotes = React.useMemo(
    () => (existencias.datos?.existencias ?? []).filter((e) => e.ubicacionId === origenId),
    [existencias.datos, origenId],
  );
  const loteId = lotes.some((l) => l.loteId === loteElegido) ? loteElegido : lotes.length === 1 ? lotes[0]!.loteId : "";
  const lote = lotes.find((l) => l.loteId === loteId) ?? null;
  const pedido = leerCantidad(cantidad) ?? 0;
  const unidad = insumo?.unidadMedida ?? "unidad";
  const listo = insumo !== null && existencias.datos !== null;
  const entreCentros = origen !== null && destino !== null && origen.centroId !== destino.centroId;

  const valores = { loteId, ubicacionOrigenId: origenId, ubicacionDestinoId: destinoId, cantidad, motivo, nota };

  const validar = (): ErroresCampo => {
    const e = erroresDeEsquema(esquemaTraslado, valores);
    if (!insumo) e.insumoId = ["Elige el insumo que vas a trasladar"];
    if (!origenId) e.ubicacionOrigenId = ["Elige la ubicación de origen"];
    if (!destinoId) e.ubicacionDestinoId = ["Elige la ubicación de destino"];
    if (origenId && !lote) e.loteId = ["Elige el lote que vas a trasladar"];
    else delete e.loteId;
    if (!cantidad.trim()) e.cantidad = ["Ingresa la cantidad"];
    else if (lote && pedido > lote.cantidad) {
      e.cantidad = [`El lote ${lote.numeroLote} tiene solo ${cantidadConUnidad(lote.cantidad, unidad)} en ${origen?.nombre ?? "el origen"}.`];
    }
    return e;
  };
  const excede = lote !== null && pedido > lote.cantidad;
  const erroresLocales = intentado ? validar() : excede ? { cantidad: validar().cantidad ?? [] } : {};
  const errores = unirErrores(traslado.erroresCampo, erroresLocales);
  const errorGeneral = traslado.error && Object.keys(traslado.erroresCampo).length === 0 ? traslado.error : null;

  function alEditar<T>(setter: (valor: T) => void) {
    return (valor: T) => {
      if (traslado.error) traslado.limpiar();
      setter(valor);
    };
  }

  const enviar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    if (traslado.pendiente || !insumo || !origen || !destino || !lote || Object.keys(validar()).length > 0) {
      setIntentado(true);
      enfocarPrimerError(refFormulario.current);
      return;
    }
    const r = await traslado.ejecutar(valores);
    existencias.recargar();
    if (!r.ok) {
      setIntentado(true);
      enfocarPrimerError(refFormulario.current);
      return;
    }
    setConfirmado({
      insumo,
      origen,
      destino,
      numeroLote: r.datos.salida.numeroLote,
      cantidad: r.datos.salida.cantidad,
      saldoOrigen: r.datos.salida.saldoPosterior,
      saldoDestino: r.datos.entrada.saldoPosterior,
    });
  };

  const registrarOtro = () => {
    setInsumo(null);
    setOrigenElegido("");
    setLoteElegido("");
    setCantidad("");
    setNota("");
    setIntentado(false);
    setConfirmado(null);
    traslado.limpiar();
    setRonda((n) => n + 1);
  };

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
      {confirmado ? (
        <Confirmacion
          titulo="Traslado registrado"
          detalle={
            <CifrasConfirmacion
              cifras={[
                {
                  etiqueta: `Origen: ${nombreCompleto(confirmado.origen)}`,
                  valor: cantidadConUnidad(confirmado.saldoOrigen, confirmado.insumo.unidadMedida),
                  nota: `quedan del lote ${confirmado.numeroLote}`,
                },
                {
                  etiqueta: `Destino: ${nombreCompleto(confirmado.destino)}`,
                  valor: cantidadConUnidad(confirmado.saldoDestino, confirmado.insumo.unidadMedida),
                  nota: `ahora hay del lote ${confirmado.numeroLote}`,
                },
              ]}
            />
          }
          acciones={
            <>
              <Button size="lg" onClick={registrarOtro}>
                <Plus aria-hidden />
                Registrar otro traslado
              </Button>
              <Link href={`/inventario/${confirmado.insumo.id}`} className={buttonClasses({ variant: "secundario", size: "lg" })}>
                Ver el insumo
              </Link>
              <Link href="/movimientos?tipo=TRASLADO_SALIDA" className={buttonClasses({ variant: "fantasma", size: "lg" })}>
                Ver traslados
              </Link>
            </>
          }
        >
          Trasladaste <strong>{cantidadConUnidad(confirmado.cantidad, confirmado.insumo.unidadMedida)}</strong> de{" "}
          <strong>{confirmado.insumo.nombre}</strong> (lote {confirmado.numeroLote}) desde {nombreCompleto(confirmado.origen)} hacia{" "}
          {nombreCompleto(confirmado.destino)}.
        </Confirmacion>
      ) : (
        <Card>
          <form ref={refFormulario} noValidate onSubmit={enviar} className="space-y-5" aria-label="Registrar traslado">
            <AnuncioErrores errores={errores} visible={intentado} />
            {errorGeneral ? <Alert tono="peligro">{errorGeneral}</Alert> : null}

            <Field label="Insumo" requerido error={errores.insumoId}>
              <ComboboxInsumo
                key={ronda}
                valor={insumo}
                onCambiar={alEditar((nuevo: InsumoOpcion | null) => {
                  setInsumo(nuevo);
                  setOrigenElegido("");
                  setLoteElegido("");
                  setCantidad("");
                })}
                iniciales={insumosIniciales}
                autoFocus={ronda > 0}
              />
            </Field>

            <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-3">
              <Field label="Origen" requerido error={errores.ubicacionOrigenId}>
                <SelectUbicacion
                  name="ubicacionOrigenId"
                  ubicaciones={origenes}
                  valor={origenId}
                  placeholder="¿Desde dónde?"
                  onCambiar={alEditar((id: string) => {
                    setOrigenElegido(id);
                    setLoteElegido("");
                  })}
                  detalle={existencias.datos ? (u) => (totalEn(u.id) > 0 ? cantidadConUnidad(totalEn(u.id), unidad) : "sin stock") : undefined}
                  deshabilitar={existencias.datos ? (u) => totalEn(u.id) === 0 : undefined}
                />
              </Field>
              <ArrowRight className="mt-9 hidden size-5 text-texto-tenue sm:block" aria-hidden />
              <Field label="Destino" requerido error={errores.ubicacionDestinoId}>
                <SelectUbicacion
                  name="ubicacionDestinoId"
                  ubicaciones={destinos}
                  valor={destinoId}
                  placeholder="¿Hacia dónde?"
                  onCambiar={alEditar(setDestinoId)}
                  deshabilitar={(u) => u.id === origenId}
                />
              </Field>
            </div>

            {entreCentros && origen && destino ? (
              <Alert tono="info" titulo="Traslado entre centros">
                El stock sale de {origen.centro} y entra a {destino.centro}. Queda registrado en el historial de ambos centros.
              </Alert>
            ) : null}

            {insumo && origenId ? (
              !listo ? (
                existencias.error ? (
                  <Alert tono="peligro">{existencias.error}</Alert>
                ) : (
                  <Skeleton className="h-16 w-full rounded-control" />
                )
              ) : lotes.length === 0 ? (
                <Alert tono="alerta">No hay stock de este insumo en la ubicación de origen.</Alert>
              ) : (
                <Grupo
                  leyenda="Lote a trasladar"
                  requerido
                  error={errores.loteId}
                  ayuda="Se pueden trasladar lotes vencidos, por ejemplo a una zona de cuarentena."
                >
                  <SelectorLote name="loteId" lotes={lotes} valor={loteId} onCambiar={alEditar(setLoteElegido)} unidad={unidad} />
                </Grupo>
              )
            ) : null}

            <Field label="Cantidad a trasladar" requerido error={errores.cantidad} className="sm:max-w-sm">
              <CampoCantidad valor={cantidad} onCambiar={alEditar(setCantidad)} unidad={unidad} maximo={lote?.cantidad} />
            </Field>

            <Field label="Motivo" opcional error={errores.motivo}>
              <Input
                name="motivo"
                value={motivo}
                onChange={(e) => alEditar(setMotivo)(e.target.value)}
                maxLength={200}
                autoComplete="off"
                placeholder="Ej.: Reposición de sala, préstamo entre centros"
              />
            </Field>
            <Field label="Nota" opcional error={errores.nota}>
              <Textarea name="nota" value={nota} onChange={(e) => alEditar(setNota)(e.target.value)} rows={2} maxLength={500} />
            </Field>

            <div className="flex flex-col gap-3 border-t border-borde pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-texto-suave" aria-live="polite">
                {lote && origen && destino && pedido > 0 && pedido <= lote.cantidad ? (
                  <>
                    Vas a mover <strong className="text-texto">{cantidadConUnidad(pedido, unidad)}</strong> del lote{" "}
                    <strong className="cifras text-texto">{lote.numeroLote}</strong>: {origen.nombre} → {destino.nombre}
                    {entreCentros ? ` (${destino.centro})` : ""}. En el origen {lote.cantidad - pedido === 1 ? "quedará" : "quedarán"}{" "}
                    <strong className="text-texto">{lote.cantidad - pedido}</strong>.
                  </>
                ) : (
                  "Los campos con * son obligatorios."
                )}
              </p>
              <Button type="submit" size="lg" cargando={traslado.pendiente} className="sm:min-w-52">
                <ArrowLeftRight aria-hidden />
                Registrar traslado
              </Button>
            </div>
          </form>
        </Card>
      )}

      <PanelExistencias
        className="xl:sticky xl:top-20"
        insumo={confirmado?.insumo ?? insumo}
        estado={existencias}
        mostrarCentro={mostrarCentro}
        ubicacionDestacada={origenId}
      />
    </div>
  );
}
