"use client";

import * as React from "react";
import Link from "next/link";
import { MinusCircle, Plus, PlusCircle, SlidersHorizontal, Trash2 } from "lucide-react";
import { registrarAjusteAccion, registrarMermaAccion, type StockActual } from "@/acciones/movimientos";
import { Alert, Button, buttonClasses, Card, ConfirmDialog, Field, Input, Select, Skeleton, Textarea, useAccion } from "@/components/ui";
import {
  CampoCantidad,
  Grupo,
  leerCantidad,
  OpcionesTarjeta,
  SelectorLote,
  SelectUbicacion,
  ubicacionPorDefecto,
  type LoteSeleccionable,
  type OpcionTarjeta,
  type UbicacionOpcion,
} from "@/components/movimientos/campos";
import { ComboboxInsumo, type InsumoOpcion } from "@/components/movimientos/combobox-insumo";
import {
  AnuncioErrores,
  CifrasConfirmacion,
  Confirmacion,
  enfocarPrimerError,
  PanelExistencias,
  stockPorUbicacion,
  unirErrores,
  useExistenciasInsumo,
} from "@/components/movimientos/formulario";
import { calcularEstadoVencimiento, diasParaVencer, MOTIVOS_AJUSTE, MOTIVOS_MERMA } from "@/lib/estados";
import { formatearDia, type DiaISO } from "@/lib/fechas";
import { formatearNumero } from "@/lib/formato";
import { nuevaClaveIdempotencia } from "@/lib/esquemas/base";
import type { ErroresCampo } from "@/lib/resultado";
import { cantidadConUnidad } from "@/lib/unidades";
import type { TipoAjuste } from "./tipos";

const OTRO = "Otro";
const MOTIVO_VENCIMIENTO = "Vencimiento";

const OPCIONES_TIPO: readonly OpcionTarjeta<TipoAjuste>[] = [
  { valor: "SUMAR", titulo: "Sumar stock", descripcion: "Ajuste positivo: hay más de lo registrado", icono: PlusCircle },
  { valor: "RESTAR", titulo: "Restar stock", descripcion: "Ajuste negativo: hay menos de lo registrado", icono: MinusCircle },
  { valor: "MERMA", titulo: "Dar de baja", descripcion: "Merma: vencido, dañado o perdido", icono: Trash2 },
];

const TEXTOS: Record<TipoAjuste, { boton: string; confirmado: string; verbo: string; cantidad: string }> = {
  SUMAR: { boton: "Registrar ajuste", confirmado: "Ajuste registrado", verbo: "Sumaste", cantidad: "Cantidad a sumar" },
  RESTAR: { boton: "Registrar ajuste", confirmado: "Ajuste registrado", verbo: "Restaste", cantidad: "Cantidad a restar" },
  MERMA: { boton: "Dar de baja", confirmado: "Merma registrada", verbo: "Diste de baja", cantidad: "Cantidad a dar de baja" },
};

interface AjusteConfirmado {
  tipo: TipoAjuste;
  insumo: InsumoOpcion;
  ubicacion: UbicacionOpcion;
  numeroLote: string;
  cantidad: number;
  saldoLote: number;
  motivo: string;
  stock: StockActual | null;
}

export interface FormularioAjusteProps {
  ubicaciones: UbicacionOpcion[];
  insumosIniciales: InsumoOpcion[];
  centroId: string | null;
  mostrarCentro: boolean;
  hoy: DiaISO;
  puedeMerma: boolean;
  inicial: {
    tipo: TipoAjuste | null;
    insumo: InsumoOpcion | null;
    ubicacionId: string | null;
    loteId: string | null;
    /** Prellenado al llegar con un lote vencido: todo su saldo y motivo "Vencimiento". */
    cantidad?: string | null;
    motivo?: string | null;
  };
}

export function FormularioAjuste({ ubicaciones, insumosIniciales, centroId, mostrarCentro, hoy, puedeMerma, inicial }: FormularioAjusteProps) {
  const refFormulario = React.useRef<HTMLFormElement>(null);
  const [tipo, setTipo] = React.useState<TipoAjuste>(inicial.tipo ?? "RESTAR");
  const [insumo, setInsumo] = React.useState<InsumoOpcion | null>(inicial.insumo);
  const [ubicacionId, setUbicacionId] = React.useState(() => ubicacionPorDefecto(ubicaciones, inicial.ubicacionId));
  const [loteElegido, setLoteElegido] = React.useState(inicial.loteId ?? "");
  const [cantidad, setCantidad] = React.useState(inicial.cantidad ?? "");
  const [motivoOpcion, setMotivoOpcion] = React.useState(inicial.motivo ?? "");
  const [porConfirmar, setPorConfirmar] = React.useState(false);
  const [motivoOtro, setMotivoOtro] = React.useState("");
  const [nota, setNota] = React.useState("");
  const [intentado, setIntentado] = React.useState(false);
  const [confirmado, setConfirmado] = React.useState<AjusteConfirmado | null>(null);
  const [ronda, setRonda] = React.useState(0);
  // Clave de idempotencia: un doble envío o un reintento no duplica el movimiento.
  const [claveIdempotencia, setClaveIdempotencia] = React.useState(nuevaClaveIdempotencia);

  const existencias = useExistenciasInsumo(insumo?.id ?? null, centroId);
  const ajuste = useAccion(registrarAjusteAccion, { toastError: false });
  const merma = useAccion(registrarMermaAccion, { toastError: false });
  const accion = tipo === "MERMA" ? merma : ajuste;

  const ubicacion = ubicaciones.find((u) => u.id === ubicacionId) ?? null;
  const stock = React.useMemo(() => stockPorUbicacion(existencias.datos?.existencias ?? []), [existencias.datos]);
  const unidad = insumo?.unidadMedida ?? "unidad";

  // Lotes con stock en la ubicación; al sumar se agregan los demás lotes
  // registrados del insumo (un ajuste positivo puede crear la existencia).
  const lotes = React.useMemo((): LoteSeleccionable[] => {
    if (!existencias.datos) return [];
    const aqui: LoteSeleccionable[] = existencias.datos.existencias.filter((e) => e.ubicacionId === ubicacionId);
    if (tipo !== "SUMAR") return aqui;
    const presentes = new Set(aqui.map((l) => l.loteId));
    const otros = existencias.datos.lotesRegistrados
      .filter((l) => !presentes.has(l.loteId))
      .map((l) => ({
        loteId: l.loteId,
        numeroLote: l.numeroLote,
        fechaVencimiento: l.fechaVencimiento,
        diasParaVencer: diasParaVencer(l.fechaVencimiento, hoy),
        estadoVencimiento: calcularEstadoVencimiento(l.fechaVencimiento, hoy),
        cantidad: 0,
      }));
    return [...aqui, ...otros];
  }, [existencias.datos, ubicacionId, tipo, hoy]);

  const loteId = lotes.some((l) => l.loteId === loteElegido) ? loteElegido : lotes.length === 1 ? lotes[0]!.loteId : "";
  const lote = lotes.find((l) => l.loteId === loteId) ?? null;
  const pedido = leerCantidad(cantidad) ?? 0;
  const signo = tipo === "SUMAR" ? 1 : -1;
  const saldoNuevo = lote ? lote.cantidad + signo * pedido : null;
  const motivos: readonly string[] = tipo === "MERMA" ? MOTIVOS_MERMA : MOTIVOS_AJUSTE;
  const motivo = motivoOpcion === OTRO ? motivoOtro.trim() : motivoOpcion;
  const listo = insumo !== null && ubicacion !== null && existencias.datos !== null;

  const validar = (): ErroresCampo => {
    const e: ErroresCampo = {};
    if (!insumo) e.insumoId = ["Elige el insumo"];
    if (!ubicacionId) e.ubicacionId = ["Elige la ubicación"];
    if (listo && !lote) e.loteId = [lotes.length === 0 ? "No hay lotes de este insumo en la ubicación" : "Elige el lote"];
    if (!cantidad.trim()) e.cantidad = ["Ingresa la cantidad"];
    else if (pedido === 0) e.cantidad = ["La cantidad debe ser un número entero mayor que cero"];
    else if (lote && signo < 0 && pedido > lote.cantidad) {
      e.cantidad = [`El lote ${lote.numeroLote} tiene solo ${cantidadConUnidad(lote.cantidad, unidad)} aquí.`];
    }
    if (!motivoOpcion) e.motivo = [tipo === "MERMA" ? "Indica el motivo de la merma" : "Indica el motivo del ajuste"];
    else if (motivoOpcion === OTRO && !motivoOtro.trim()) e.motivo = ["Describe el motivo"];
    return e;
  };
  const excede = lote !== null && signo < 0 && pedido > lote.cantidad;
  const erroresLocales = intentado ? validar() : excede ? { cantidad: validar().cantidad ?? [] } : {};
  const errores = unirErrores(accion.erroresCampo, erroresLocales);
  const errorGeneral = accion.error && Object.keys(accion.erroresCampo).length === 0 ? accion.error : null;

  function alEditar<T>(setter: (valor: T) => void) {
    return (valor: T) => {
      if (ajuste.error) ajuste.limpiar();
      if (merma.error) merma.limpiar();
      setter(valor);
    };
  }

  // Dar de baja por "Vencimiento" un lote que sigue vigente suele ser un error.
  const venceDespues = tipo === "MERMA" && motivoOpcion === MOTIVO_VENCIMIENTO && lote !== null && lote.estadoVencimiento !== "VENCIDO";
  const avisoVigente =
    venceDespues && lote
      ? lote.fechaVencimiento
        ? `El lote ${lote.numeroLote} no está vencido: vence el ${formatearDia(lote.fechaVencimiento)}.`
        : `El lote ${lote.numeroLote} no tiene fecha de vencimiento.`
      : null;

  // Ajustes y mermas no se pueden deshacer: se valida y luego se pide confirmar.
  const enviar = (evento: React.FormEvent) => {
    evento.preventDefault();
    if (accion.pendiente || !insumo || !ubicacion || !lote || Object.keys(validar()).length > 0) {
      setIntentado(true);
      enfocarPrimerError(refFormulario.current);
      return;
    }
    setPorConfirmar(true);
  };

  const registrar = async () => {
    if (accion.pendiente || !insumo || !ubicacion || !lote) return;
    const comun = { ubicacionId, loteId, cantidad, motivo, nota, claveIdempotencia };
    const r =
      tipo === "MERMA"
        ? await merma.ejecutar(comun)
        : await ajuste.ejecutar({ ...comun, sentido: tipo === "SUMAR" ? "POSITIVO" : "NEGATIVO" });
    existencias.recargar();
    if (!r.ok) {
      setIntentado(true);
      enfocarPrimerError(refFormulario.current);
      return;
    }
    setClaveIdempotencia(nuevaClaveIdempotencia());
    setConfirmado({
      tipo,
      insumo,
      ubicacion,
      numeroLote: r.datos.movimiento.numeroLote,
      cantidad: r.datos.movimiento.cantidad,
      saldoLote: r.datos.movimiento.saldoPosterior,
      motivo,
      stock: r.datos.stock,
    });
  };

  const registrarOtro = () => {
    setClaveIdempotencia(nuevaClaveIdempotencia());
    setLoteElegido("");
    setCantidad("");
    setNota("");
    setIntentado(false);
    setConfirmado(null);
    ajuste.limpiar();
    merma.limpiar();
    setRonda((n) => n + 1);
  };

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
      {confirmado ? (
        <Confirmacion
          titulo={TEXTOS[confirmado.tipo].confirmado}
          detalle={
            <CifrasConfirmacion
              cifras={[
                {
                  etiqueta: `Lote ${confirmado.numeroLote} en ${confirmado.ubicacion.nombre}`,
                  valor: cantidadConUnidad(confirmado.saldoLote, confirmado.insumo.unidadMedida),
                  nota: "saldo después del movimiento",
                },
                ...(confirmado.stock
                  ? [
                      {
                        etiqueta: `Disponible en ${confirmado.ubicacion.centro}`,
                        valor: cantidadConUnidad(confirmado.stock.disponibleCentro, confirmado.insumo.unidadMedida),
                        nota:
                          confirmado.stock.vencidoCentro > 0
                            ? `más ${formatearNumero(confirmado.stock.vencidoCentro)} en lotes vencidos`
                            : "sin lotes vencidos",
                      },
                    ]
                  : []),
              ]}
            />
          }
          acciones={
            <>
              <Button size="lg" onClick={registrarOtro}>
                <Plus aria-hidden />
                Registrar otro
              </Button>
              <Link href={`/inventario/${confirmado.insumo.id}`} className={buttonClasses({ variant: "secundario", size: "lg" })}>
                Ver el insumo
              </Link>
              <Link href="/movimientos" className={buttonClasses({ variant: "fantasma", size: "lg" })}>
                Ver movimientos
              </Link>
            </>
          }
        >
          {TEXTOS[confirmado.tipo].verbo} <strong>{cantidadConUnidad(confirmado.cantidad, confirmado.insumo.unidadMedida)}</strong> de{" "}
          <strong>{confirmado.insumo.nombre}</strong> (lote {confirmado.numeroLote}) en {confirmado.ubicacion.nombre}. Motivo:{" "}
          {confirmado.motivo}.
        </Confirmacion>
      ) : (
        <Card>
          <form ref={refFormulario} noValidate onSubmit={enviar} className="space-y-5" aria-label="Registrar ajuste o merma">
            <AnuncioErrores errores={errores} visible={intentado} />
            {errorGeneral ? <Alert tono="peligro">{errorGeneral}</Alert> : null}

            <Grupo leyenda="¿Qué necesitas hacer?" requerido>
              <OpcionesTarjeta<TipoAjuste>
                name="tipo"
                columnas={3}
                valor={tipo}
                onCambiar={alEditar((nuevo: TipoAjuste) => {
                  setTipo(nuevo);
                  setMotivoOpcion("");
                  setMotivoOtro("");
                })}
                opciones={puedeMerma ? OPCIONES_TIPO : OPCIONES_TIPO.filter((o) => o.valor !== "MERMA")}
              />
            </Grupo>

            <Field label="Insumo" requerido error={errores.insumoId}>
              <ComboboxInsumo
                key={ronda}
                valor={insumo}
                onCambiar={alEditar((nuevo: InsumoOpcion | null) => {
                  setInsumo(nuevo);
                  setLoteElegido("");
                  setCantidad("");
                })}
                iniciales={insumosIniciales}
              />
            </Field>

            <Field label="Ubicación" requerido error={errores.ubicacionId}>
              <SelectUbicacion
                name="ubicacionId"
                ubicaciones={ubicaciones}
                valor={ubicacionId}
                onCambiar={alEditar((id: string) => {
                  setUbicacionId(id);
                  setLoteElegido("");
                })}
                detalle={
                  existencias.datos
                    ? (u) => {
                        const s = stock.get(u.id);
                        const total = s ? s.disponible + s.vencido : 0;
                        return total > 0 ? cantidadConUnidad(total, unidad) : "sin stock";
                      }
                    : undefined
                }
                // Restar o dar de baja exige stock en la ubicación (igual que retiro y traslado).
                deshabilitar={
                  existencias.datos && tipo !== "SUMAR"
                    ? (u) => {
                        const s = stock.get(u.id);
                        return (s ? s.disponible + s.vencido : 0) === 0;
                      }
                    : undefined
                }
              />
            </Field>

            {insumo && ubicacion ? (
              !existencias.datos ? (
                existencias.error ? (
                  <Alert tono="peligro">{existencias.error}</Alert>
                ) : (
                  <Skeleton className="h-16 w-full rounded-control" />
                )
              ) : lotes.length === 0 ? (
                <Alert tono="alerta" titulo="No hay lotes para ajustar aquí">
                  {tipo === "SUMAR"
                    ? "Este insumo aún no tiene lotes registrados. Para crear un lote nuevo registra un ingreso."
                    : "Este insumo no tiene stock en la ubicación elegida."}{" "}
                  {tipo === "SUMAR" ? (
                    <Link href={`/movimientos/ingreso?insumo=${insumo.id}&ubicacion=${ubicacion.id}`} className="font-semibold underline underline-offset-2">
                      Registrar ingreso
                    </Link>
                  ) : null}
                </Alert>
              ) : (
                <Grupo
                  leyenda="Lote"
                  requerido
                  error={errores.loteId}
                  ayuda={tipo === "SUMAR" ? "Incluye lotes registrados del insumo que hoy no tienen stock en esta ubicación." : undefined}
                >
                  <SelectorLote name="loteId" lotes={lotes} valor={loteId} onCambiar={alEditar(setLoteElegido)} unidad={unidad} />
                </Grupo>
              )
            ) : null}

            <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2">
              <Field label={TEXTOS[tipo].cantidad} requerido error={errores.cantidad}>
                <CampoCantidad
                  valor={cantidad}
                  onCambiar={alEditar(setCantidad)}
                  unidad={unidad}
                  maximo={signo < 0 ? lote?.cantidad : undefined}
                />
              </Field>
              {lote && saldoNuevo !== null && pedido > 0 && saldoNuevo >= 0 ? (
                <div className="rounded-control bg-superficie-2 px-4 py-3 ring-1 ring-borde ring-inset sm:mt-[1.625rem]" aria-live="polite">
                  <p className="text-sm text-texto-suave">Saldo del lote en {ubicacion?.nombre}</p>
                  <p className="cifras text-lg font-semibold text-texto">
                    {formatearNumero(lote.cantidad)} <span className="font-normal text-texto-tenue">→</span> {formatearNumero(saldoNuevo)}
                    <span className={"ml-2 text-sm font-semibold " + (signo > 0 ? "text-exito-700" : "text-peligro-700")}>
                      ({signo > 0 ? "+" : "−"}
                      {formatearNumero(pedido)})
                    </span>
                  </p>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2">
              <Field label="Motivo" requerido error={motivoOpcion === OTRO ? undefined : errores.motivo}>
                <Select
                  name="motivo"
                  value={motivoOpcion}
                  onChange={(e) => alEditar(setMotivoOpcion)(e.target.value)}
                  placeholder="Selecciona el motivo…"
                  opciones={motivos.map((m) => ({ value: m, label: m }))}
                />
              </Field>
              {motivoOpcion === OTRO ? (
                <Field label="¿Cuál?" requerido error={errores.motivo}>
                  <Input
                    name="motivoOtro"
                    value={motivoOtro}
                    onChange={(e) => alEditar(setMotivoOtro)(e.target.value)}
                    maxLength={200}
                    autoComplete="off"
                    placeholder="Describe el motivo"
                  />
                </Field>
              ) : null}
            </div>

            {avisoVigente ? (
              <Alert tono="alerta" titulo="Revisa el motivo">
                {avisoVigente} Si la baja es por otra causa (daño, pérdida, contaminación), elige ese motivo.
              </Alert>
            ) : null}

            <Field label="Nota" opcional error={errores.nota}>
              <Textarea name="nota" value={nota} onChange={(e) => alEditar(setNota)(e.target.value)} rows={2} maxLength={500} />
            </Field>

            <Alert tono="info" titulo="Este movimiento queda auditado">
              Se guarda con tu usuario, la fecha y el motivo en el historial y en la auditoría. No se puede editar ni borrar: un error
              se corrige con otro ajuste.
            </Alert>

            <div className="flex flex-col gap-3 border-t border-borde pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-texto-suave">Los campos con * son obligatorios.</p>
              <Button
                type="submit"
                size="lg"
                variant={tipo === "MERMA" ? "peligro" : "primario"}
                cargando={accion.pendiente}
                className="sm:min-w-52"
              >
                {tipo === "MERMA" ? <Trash2 aria-hidden /> : <SlidersHorizontal aria-hidden />}
                {TEXTOS[tipo].boton}
              </Button>
            </div>
          </form>
          <ConfirmDialog
            open={porConfirmar}
            onOpenChange={setPorConfirmar}
            peligro={tipo === "MERMA"}
            titulo={tipo === "MERMA" ? "¿Dar de baja este stock?" : "¿Registrar este ajuste?"}
            textoConfirmar={TEXTOS[tipo].boton}
            textoCancelar="Volver a revisar"
            descripcion={
              insumo && ubicacion && lote && saldoNuevo !== null ? (
                <>
                  Vas a {tipo === "MERMA" ? "dar de baja" : tipo === "SUMAR" ? "sumar" : "restar"}{" "}
                  <strong className="text-texto">{cantidadConUnidad(pedido, unidad)}</strong> de{" "}
                  <strong className="text-texto">{insumo.nombre}</strong>, lote <span className="cifras">{lote.numeroLote}</span>, en{" "}
                  {ubicacion.nombre}
                  {mostrarCentro ? ` (${ubicacion.centro})` : ""}. {saldoNuevo === 1 ? "Quedará" : "Quedarán"}{" "}
                  <strong className="text-texto">{formatearNumero(saldoNuevo)}</strong> en ese lote. Motivo: {motivo}.
                </>
              ) : undefined
            }
            onConfirmar={() => {
              void registrar();
            }}
          >
            {avisoVigente ? <Alert tono="alerta">{avisoVigente} ¿Seguro que el motivo es “Vencimiento”?</Alert> : null}
            <p>No se puede editar ni borrar después: un error se corrige con otro ajuste.</p>
          </ConfirmDialog>
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
