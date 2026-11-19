"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpFromLine, ListOrdered, Plus, Wand2 } from "lucide-react";
import { registrarRetiroAccion, type StockActual } from "@/acciones/movimientos";
import {
  Alert,
  BadgeEstadoVencimiento,
  Button,
  buttonClasses,
  Card,
  ConfirmDialog,
  Field,
  Input,
  Skeleton,
  Textarea,
  useAccion,
} from "@/components/ui";
import {
  CampoCantidad,
  Grupo,
  leerCantidad,
  OpcionesTarjeta,
  SelectorLote,
  SelectUbicacion,
  Sugerencias,
  ubicacionPorDefecto,
  type UbicacionOpcion,
} from "@/components/movimientos/campos";
import { BotonEscanearInsumo } from "@/components/escaner/boton-escanear-insumo";
import { ComboboxInsumo, type InsumoOpcion } from "@/components/movimientos/combobox-insumo";
import {
  AnuncioErrores,
  AYUDA_SIN_PACIENTES,
  CifrasConfirmacion,
  Confirmacion,
  enfocarPrimerError,
  erroresDeEsquema,
  PanelExistencias,
  ResumenErrores,
  stockPorUbicacion,
  unirErrores,
  useExistenciasInsumo,
} from "@/components/movimientos/formulario";
import { esquemaRetiro } from "@/lib/esquemas/movimientos";
import { planificarFefo } from "@/lib/fefo";
import { formatearDia } from "@/lib/fechas";
import { formatearNumero } from "@/lib/formato";
import { nuevaClaveIdempotencia } from "@/lib/esquemas/base";
import type { ErroresCampo } from "@/lib/resultado";
import { cantidadConUnidad, unidadSegun } from "@/lib/unidades";

/** Destinos frecuentes de un retiro (sugerencias; el campo es de texto libre). */
const MOTIVOS_RETIRO = ["Uso clínico", "Reposición de sala", "Procedimiento", "Urgencia"] as const;

type Modo = "FEFO" | "LOTE";

interface RetiroConfirmado {
  insumo: InsumoOpcion;
  ubicacion: UbicacionOpcion;
  /** Centro real del movimiento, según el servidor. */
  centro: string;
  repetido: boolean;
  cantidad: number;
  lotes: { id: string; numeroLote: string; cantidad: number; saldo: number }[];
  stock: StockActual | null;
}

export interface FormularioRetiroProps {
  ubicaciones: UbicacionOpcion[];
  insumosIniciales: InsumoOpcion[];
  centroId: string | null;
  mostrarCentro: boolean;
  puedeVerMovimientos: boolean;
  /** Si el rol puede registrar mermas (para ofrecer dar de baja lotes vencidos). */
  puedeDarDeBaja: boolean;
  inicial: { insumo: InsumoOpcion | null; ubicacionId: string | null; loteId: string | null };
}

export function FormularioRetiro({
  ubicaciones,
  insumosIniciales,
  centroId,
  mostrarCentro,
  puedeVerMovimientos,
  puedeDarDeBaja,
  inicial,
}: FormularioRetiroProps) {
  const refFormulario = React.useRef<HTMLFormElement>(null);
  const [insumo, setInsumo] = React.useState<InsumoOpcion | null>(inicial.insumo);
  const [ubicacionElegida, setUbicacionElegida] = React.useState(inicial.ubicacionId ?? "");
  const [modo, setModo] = React.useState<Modo>(inicial.loteId ? "LOTE" : "FEFO");
  const [loteElegido, setLoteElegido] = React.useState(inicial.loteId ?? "");
  const [cantidad, setCantidad] = React.useState("");
  const [motivo, setMotivo] = React.useState("");
  const [nota, setNota] = React.useState("");
  const [intentado, setIntentado] = React.useState(false);
  const [confirmado, setConfirmado] = React.useState<RetiroConfirmado | null>(null);
  const [ronda, setRonda] = React.useState(0);
  // Clave de idempotencia: un doble envío o un reintento no duplica el movimiento.
  const [claveIdempotencia, setClaveIdempotencia] = React.useState(nuevaClaveIdempotencia);
  const [porConfirmar, setPorConfirmar] = React.useState(false);

  const existencias = useExistenciasInsumo(insumo?.id ?? null, centroId);
  const retiro = useAccion(registrarRetiroAccion, { toastError: false });

  const stock = React.useMemo(() => stockPorUbicacion(existencias.datos?.existencias ?? []), [existencias.datos]);

  // Ubicación efectiva: la que eligió la persona; si no, la habitual cuando
  // tiene stock o, en su defecto, la única ubicación con stock disponible.
  const ubicacionId = React.useMemo(() => {
    if (ubicacionElegida) return ubicacionElegida;
    const habitual = ubicacionPorDefecto(ubicaciones);
    if (!existencias.datos) return habitual;
    if (habitual && (stock.get(habitual)?.disponible ?? 0) > 0) return habitual;
    const conStock = ubicaciones.filter((u) => (stock.get(u.id)?.disponible ?? 0) > 0);
    return conStock.length === 1 ? conStock[0]!.id : habitual;
  }, [ubicacionElegida, ubicaciones, existencias.datos, stock]);
  const ubicacion = ubicaciones.find((u) => u.id === ubicacionId) ?? null;

  const lotes = React.useMemo(
    () => (existencias.datos?.existencias ?? []).filter((e) => e.ubicacionId === ubicacionId),
    [existencias.datos, ubicacionId],
  );
  const pedido = leerCantidad(cantidad) ?? 0;
  const plan = planificarFefo(lotes, pedido);
  const retirables = lotes.filter((l) => l.estadoVencimiento !== "VENCIDO");
  const loteId = modo === "LOTE" ? (retirables.some((l) => l.loteId === loteElegido) ? loteElegido : "") : "";
  const lote = retirables.find((l) => l.loteId === loteId) ?? null;
  const tope = modo === "LOTE" ? (lote?.cantidad ?? 0) : plan.disponible;
  const unidad = insumo?.unidadMedida ?? "unidad";
  const listo = insumo !== null && ubicacion !== null && existencias.datos !== null;
  const sinStock = listo && plan.disponible === 0;
  // Mientras llegan las existencias no se puede validar ni enviar: el botón lo dice.
  const cargandoExistencias = insumo !== null && existencias.datos === null && !existencias.error;

  const valores = { ubicacionId, insumoId: insumo?.id ?? "", cantidad, loteId, motivo, nota };

  const validar = (): ErroresCampo => {
    const e = erroresDeEsquema(esquemaRetiro, valores);
    if (!insumo) e.insumoId = ["Elige el insumo que vas a retirar"];
    if (!ubicacionId) e.ubicacionId = ["Elige desde qué ubicación sale"];
    if (!cantidad.trim()) e.cantidad = ["Ingresa la cantidad"];
    if (listo && modo === "LOTE" && !lote && retirables.length > 0) e.loteId = ["Elige el lote del que vas a retirar"];
    if (listo && pedido > 0 && !e.loteId && pedido > tope) {
      e.cantidad = [
        modo === "LOTE" && lote
          ? `El lote ${lote.numeroLote} tiene solo ${cantidadConUnidad(lote.cantidad, unidad)} aquí.`
          : `Solo hay ${cantidadConUnidad(plan.disponible, unidad)} ${plan.disponible === 1 ? "disponible" : "disponibles"} en ${ubicacion?.nombre ?? "esta ubicación"}.`,
      ];
    }
    return e;
  };
  // Exceder el stock se avisa de inmediato, sin esperar a que se intente guardar.
  const excede = listo && pedido > 0 && pedido > tope && (modo === "FEFO" || lote !== null);
  const erroresLocales = intentado ? validar() : excede ? { cantidad: validar().cantidad ?? [] } : {};
  const errores = unirErrores(retiro.erroresCampo, erroresLocales);
  const errorGeneral = retiro.error && Object.keys(retiro.erroresCampo).length === 0 ? retiro.error : null;
  const camposVisibles = [
    "insumoId",
    "ubicacionId",
    ...(listo && !sinStock ? ["cantidad", ...(modo === "LOTE" ? ["loteId"] : [])] : []),
    "motivo",
    "nota",
  ];

  function alEditar<T>(setter: (valor: T) => void) {
    return (valor: T) => {
      if (retiro.error) retiro.limpiar();
      setter(valor);
    };
  }

  // Un retiro de más de la mitad de lo disponible en la ubicación pide confirmación.
  const retiroGrande = pedido * 2 > plan.disponible;

  const enviar = (evento: React.FormEvent) => {
    evento.preventDefault();
    if (retiro.pendiente || !insumo || !ubicacion || !listo || sinStock || Object.keys(validar()).length > 0) {
      setIntentado(true);
      enfocarPrimerError(refFormulario.current);
      return;
    }
    if (retiroGrande) setPorConfirmar(true);
    else void registrar();
  };

  const registrar = async () => {
    if (retiro.pendiente || !insumo || !ubicacion) return;
    const r = await retiro.ejecutar({ ...valores, claveIdempotencia });
    existencias.recargar();
    if (!r.ok) {
      setIntentado(true);
      enfocarPrimerError(refFormulario.current);
      return;
    }
    setClaveIdempotencia(nuevaClaveIdempotencia());
    const centroReal = r.datos.movimientos[0]?.centroId;
    setConfirmado({
      insumo,
      ubicacion,
      centro: ubicaciones.find((u) => u.centroId === centroReal)?.centro ?? ubicacion.centro,
      repetido: r.datos.repetido,
      cantidad: r.datos.cantidadTotal,
      lotes: r.datos.movimientos.map((m) => ({ id: m.id, numeroLote: m.numeroLote, cantidad: m.cantidad, saldo: m.saldoPosterior })),
      stock: r.datos.stock,
    });
  };

  const registrarOtro = () => {
    setClaveIdempotencia(nuevaClaveIdempotencia());
    setInsumo(null);
    setModo("FEFO");
    setLoteElegido("");
    setCantidad("");
    setNota("");
    setIntentado(false);
    setConfirmado(null);
    retiro.limpiar();
    setRonda((n) => n + 1);
  };

  const alCambiarInsumo = alEditar((nuevo: InsumoOpcion | null) => {
    setInsumo(nuevo);
    setUbicacionElegida("");
    setLoteElegido("");
    setModo("FEFO");
    setCantidad("");
  });

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
      {confirmado ? (
        <Confirmacion
          titulo="Retiro registrado"
          centro={confirmado.centro}
          repetido={confirmado.repetido}
          detalle={
            <>
              <CifrasConfirmacion
                cifras={[
                  ...(confirmado.stock
                    ? [
                        {
                          etiqueta: `Quedan en ${confirmado.ubicacion.nombre}`,
                          valor: cantidadConUnidad(confirmado.stock.disponibleUbicacion, confirmado.insumo.unidadMedida),
                          nota: "disponibles para usar",
                        },
                        {
                          etiqueta: `Total en ${confirmado.centro}`,
                          valor: cantidadConUnidad(confirmado.stock.disponibleCentro, confirmado.insumo.unidadMedida),
                          nota: "sumando todas las ubicaciones",
                        },
                      ]
                    : []),
                ]}
              />
              <p className="mt-4 text-sm font-medium text-texto">Se descontó de:</p>
              <ul className="mt-1 divide-y divide-borde text-sm">
                {confirmado.lotes.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="cifras font-medium text-texto">Lote {l.numeroLote}</span>
                    <span className="cifras text-texto-suave">
                      <strong className="font-semibold text-texto">−{formatearNumero(l.cantidad)}</strong> · queda{l.saldo === 1 ? "" : "n"}{" "}
                      {formatearNumero(l.saldo)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          }
          acciones={
            <>
              <Button size="lg" onClick={registrarOtro}>
                <Plus aria-hidden />
                Registrar otro retiro
              </Button>
              <Link href={`/inventario/${confirmado.insumo.id}`} className={buttonClasses({ variant: "secundario", size: "lg" })}>
                Ver el insumo
              </Link>
              {puedeVerMovimientos ? (
                <Link href="/movimientos" className={buttonClasses({ variant: "fantasma", size: "lg" })}>
                  Ver movimientos
                </Link>
              ) : null}
            </>
          }
        >
          Retiraste <strong>{cantidadConUnidad(confirmado.cantidad, confirmado.insumo.unidadMedida)}</strong> de{" "}
          <strong>{confirmado.insumo.nombre}</strong> desde {confirmado.ubicacion.nombre}
          {confirmado.stock ? (
            <>
              ; quedan <strong>{cantidadConUnidad(confirmado.stock.disponibleUbicacion, confirmado.insumo.unidadMedida)}</strong> ahí
            </>
          ) : null}
          .
        </Confirmacion>
      ) : (
        <Card>
          <form ref={refFormulario} noValidate onSubmit={enviar} className="space-y-5" aria-label="Registrar retiro">
            <AnuncioErrores errores={errores} visible={intentado} />
            {errorGeneral ? <Alert tono="peligro">{errorGeneral}</Alert> : null}
            <ResumenErrores errores={retiro.erroresCampo} camposVisibles={camposVisibles} />

            <div className="flex items-start gap-2">
              <Field label="Insumo" requerido error={errores.insumoId} className="min-w-0 flex-1">
                <ComboboxInsumo
                  key={ronda}
                  valor={insumo}
                  onCambiar={alCambiarInsumo}
                  iniciales={insumosIniciales}
                  priorizarRetirosDeCentroId={centroId}
                  autoFocus={ronda > 0}
                />
              </Field>
              {/* Alineado con el control (bajo la etiqueta del campo). */}
              <BotonEscanearInsumo alEncontrar={alCambiarInsumo} className="mt-[1.625rem]" />
            </div>

            <Field label="Desde la ubicación" requerido error={errores.ubicacionId}>
              <SelectUbicacion
                name="ubicacionId"
                ubicaciones={ubicaciones}
                valor={ubicacionId}
                onCambiar={alEditar((id: string) => {
                  setUbicacionElegida(id);
                  setLoteElegido("");
                })}
                detalle={
                  existencias.datos
                    ? (u) => {
                        const s = stock.get(u.id);
                        return s && s.disponible > 0 ? `${cantidadConUnidad(s.disponible, unidad)}` : "sin stock";
                      }
                    : undefined
                }
                // Sin stock vigente no hay nada que retirar ahí (igual que en traslado).
                deshabilitar={existencias.datos ? (u) => (stock.get(u.id)?.disponible ?? 0) === 0 : undefined}
              />
            </Field>

            {insumo && ubicacion ? (
              !existencias.datos ? (
                existencias.error ? (
                  <Alert tono="peligro">{existencias.error}</Alert>
                ) : (
                  <Skeleton className="h-20 w-full rounded-control" />
                )
              ) : (
                <div aria-live="polite" className="space-y-3">
                  <div
                    className={
                      "flex items-center justify-between gap-4 rounded-control px-4 py-3 ring-1 ring-inset " +
                      (sinStock ? "bg-peligro-50 ring-peligro-600/25" : "bg-marca-50 ring-marca-200")
                    }
                  >
                    <div className="min-w-0">
                      <p className={"text-sm font-medium " + (sinStock ? "text-peligro-800" : "text-marca-900")}>
                        Disponible en {ubicacion.nombre}
                      </p>
                      <p className="text-sm text-texto-suave">
                        {sinStock
                          ? "No hay stock vigente para retirar aquí."
                          : `En ${retirables.length} ${retirables.length === 1 ? "lote" : "lotes"} · se usa primero el que vence antes`}
                      </p>
                    </div>
                    <p className={"cifras shrink-0 text-right text-2xl font-semibold tracking-tight " + (sinStock ? "text-peligro-800" : "text-marca-900")}>
                      {formatearNumero(plan.disponible)}
                      <span className="ml-1.5 text-sm font-normal text-texto-suave">{unidadSegun(plan.disponible, unidad)}</span>
                    </p>
                  </div>
                  {plan.vencido > 0 ? (
                    <Alert tono="alerta" titulo={`${cantidadConUnidad(plan.vencido, unidad)} en lotes vencidos no se pueden retirar`}>
                      Los lotes vencidos no se usan: deben darse de baja como merma.{" "}
                      {puedeDarDeBaja ? (
                        <Link
                          href={`/movimientos/ajuste?tipo=merma&insumo=${insumo.id}&ubicacion=${ubicacion.id}`}
                          className="font-semibold underline underline-offset-2"
                        >
                          Dar de baja ahora
                        </Link>
                      ) : (
                        "Avisa a un administrador."
                      )}
                    </Alert>
                  ) : null}
                </div>
              )
            ) : null}

            {listo && !sinStock ? (
              <>
                <Grupo leyenda="¿De qué lote sale?">
                  <OpcionesTarjeta<Modo>
                    name="modo"
                    valor={modo}
                    onCambiar={alEditar(setModo)}
                    opciones={[
                      { valor: "FEFO", titulo: "Automático", descripcion: "Primero lo que vence antes", icono: Wand2 },
                      { valor: "LOTE", titulo: "Elegir lote", descripcion: "Un lote específico", icono: ListOrdered },
                    ]}
                  />
                </Grupo>

                {modo === "LOTE" ? (
                  <Grupo leyenda="Lote" requerido error={errores.loteId}>
                    <SelectorLote name="loteId" lotes={lotes} valor={loteId} onCambiar={alEditar(setLoteElegido)} unidad={unidad} bloquearVencidos />
                  </Grupo>
                ) : null}

                <Field label="Cantidad a retirar" requerido error={errores.cantidad} className="sm:max-w-sm">
                  <CampoCantidad valor={cantidad} onCambiar={alEditar(setCantidad)} unidad={unidad} maximo={tope} />
                </Field>

                {modo === "FEFO" && pedido > 0 && plan.faltante === 0 ? (
                  <div className="rounded-control border border-borde bg-superficie-2 px-4 py-3" aria-live="polite">
                    <p className="text-sm font-medium text-texto">
                      Se descontará de {plan.lineas.length === 1 ? "este lote" : `estos ${plan.lineas.length} lotes`}:
                    </p>
                    <ul className="mt-1.5 divide-y divide-borde text-sm">
                      {plan.lineas.map((l) => (
                        <li key={l.lote.loteId} className="flex items-center justify-between gap-3 py-2">
                          <span className="min-w-0">
                            <span className="cifras block truncate font-medium text-texto">Lote {l.lote.numeroLote}</span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-texto-suave">
                              {l.lote.fechaVencimiento ? <span className="cifras">Vence {formatearDia(l.lote.fechaVencimiento)}</span> : <span>Sin vencimiento</span>}
                              {l.lote.estadoVencimiento !== "SIN_VENCIMIENTO" ? (
                                <BadgeEstadoVencimiento estado={l.lote.estadoVencimiento} dias={l.lote.diasParaVencer} />
                              ) : null}
                            </span>
                          </span>
                          <span className="cifras shrink-0 text-right">
                            <strong className="block text-base font-semibold text-texto">−{formatearNumero(l.tomar)}</strong>
                            <span className="block text-xs text-texto-tenue">
                              {l.queda === 0 ? "se agota" : `queda${l.queda === 1 ? "" : "n"} ${formatearNumero(l.queda)}`}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : null}

            <Field label="Destino o motivo" opcional error={errores.motivo} ayuda={`Por ejemplo la sala, el turno o el procedimiento. ${AYUDA_SIN_PACIENTES}`}>
              <Input name="motivo" value={motivo} onChange={(e) => alEditar(setMotivo)(e.target.value)} maxLength={200} autoComplete="off" />
            </Field>
            <div className="-mt-2">
              <Sugerencias
                etiqueta="Motivos frecuentes"
                opciones={MOTIVOS_RETIRO.map((m) => ({ valor: m, texto: m }))}
                seleccionada={motivo}
                onElegir={alEditar(setMotivo)}
              />
            </div>

            <Field label="Nota" opcional error={errores.nota} ayuda={AYUDA_SIN_PACIENTES}>
              <Textarea name="nota" value={nota} onChange={(e) => alEditar(setNota)(e.target.value)} rows={2} maxLength={500} />
            </Field>

            <div className="flex flex-col gap-3 border-t border-borde pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-texto-suave" aria-live="polite">
                {listo && pedido > 0 && pedido <= tope && ubicacion ? (
                  <>
                    Vas a retirar <strong className="text-texto">{cantidadConUnidad(pedido, unidad)}</strong> desde{" "}
                    <strong className="text-texto">
                      {ubicacion.nombre}
                      {mostrarCentro ? ` (${ubicacion.centro})` : ""}
                    </strong>
                    ; {plan.disponible - pedido === 1 ? "quedará" : "quedarán"}{" "}
                    <strong className="text-texto">{formatearNumero(plan.disponible - pedido)}</strong> ahí.
                  </>
                ) : (
                  "Los campos con * son obligatorios."
                )}
              </p>
              <Button type="submit" size="lg" cargando={retiro.pendiente} disabled={sinStock || cargandoExistencias} className="sm:min-w-52">
                {cargandoExistencias ? (
                  "Cargando existencias…"
                ) : (
                  <>
                    <ArrowUpFromLine aria-hidden />
                    Registrar retiro
                  </>
                )}
              </Button>
            </div>
          </form>
          <ConfirmDialog
            open={porConfirmar}
            onOpenChange={setPorConfirmar}
            titulo="¿Retirar más de la mitad del stock?"
            textoConfirmar="Registrar retiro"
            textoCancelar="Volver a revisar"
            descripcion={
              insumo && ubicacion ? (
                <>
                  Vas a retirar <strong className="text-texto">{cantidadConUnidad(pedido, unidad)}</strong> de{" "}
                  <strong className="text-texto">{insumo.nombre}</strong>
                  {lote ? (
                    <>
                      , lote <span className="cifras">{lote.numeroLote}</span>,
                    </>
                  ) : null}{" "}
                  desde {ubicacion.nombre}
                  {mostrarCentro ? ` (${ubicacion.centro})` : ""}: es más de la mitad de {plan.disponible === 1 ? "lo disponible" : `los ${formatearNumero(plan.disponible)} disponibles`}{" "}
                  ahí. {plan.disponible - pedido === 1 ? "Quedará" : "Quedarán"}{" "}
                  <strong className="text-texto">{formatearNumero(plan.disponible - pedido)}</strong>.
                </>
              ) : undefined
            }
            onConfirmar={() => {
              void registrar();
            }}
          />
        </Card>
      )}

      <PanelExistencias
        className="xl:sticky xl:top-20"
        insumo={confirmado?.insumo ?? insumo}
        estado={existencias}
        mostrarCentro={mostrarCentro}
        ubicacionDestacada={ubicacionId}
      />
    </div>
  );
}
