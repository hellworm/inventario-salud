"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDownToLine, CalendarCheck, PackagePlus, Plus } from "lucide-react";
import { registrarIngresoAccion, type StockActual } from "@/acciones/movimientos";
import {
  Alert,
  Badge,
  Button,
  buttonClasses,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
  useAccion,
} from "@/components/ui";
import {
  CampoCantidad,
  leerCantidad,
  SelectUbicacion,
  Sugerencias,
  ubicacionPorDefecto,
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
  unirErrores,
  useExistenciasInsumo,
} from "@/components/movimientos/formulario";
import { formatearRut } from "@/lib/chile/rut";
import { esquemaIngreso } from "@/lib/esquemas/movimientos";
import { calcularEstadoVencimiento } from "@/lib/estados";
import { describirVencimiento, diasEntre, formatearDia, type DiaISO } from "@/lib/fechas";
import { nuevaClaveIdempotencia } from "@/lib/esquemas/base";
import type { ErroresCampo } from "@/lib/resultado";
import { cantidadConUnidad } from "@/lib/unidades";

interface ProveedorOpcion {
  id: string;
  rut: string;
  razonSocial: string;
}

interface LineaRegistrada {
  id: string;
  insumo: string;
  numeroLote: string;
  cantidad: number;
  unidad: string;
}

interface IngresoConfirmado {
  insumo: InsumoOpcion;
  ubicacion: UbicacionOpcion;
  numeroLote: string;
  loteCreado: boolean;
  cantidad: number;
  saldoLote: number;
  stock: StockActual | null;
}

export interface FormularioIngresoProps {
  ubicaciones: UbicacionOpcion[];
  proveedores: ProveedorOpcion[];
  insumosIniciales: InsumoOpcion[];
  /** Centro activo (`null` = toda la red). */
  centroId: string | null;
  mostrarCentro: boolean;
  /** Día de hoy en Santiago (lo calcula el servidor). */
  hoy: DiaISO;
  puedeVerMovimientos: boolean;
  inicial: { insumo: InsumoOpcion | null; ubicacionId: string | null; numeroLote: string | null };
}

export function FormularioIngreso({
  ubicaciones,
  proveedores,
  insumosIniciales,
  centroId,
  mostrarCentro,
  hoy,
  puedeVerMovimientos,
  inicial,
}: FormularioIngresoProps) {
  const refFormulario = React.useRef<HTMLFormElement>(null);
  const [insumo, setInsumo] = React.useState<InsumoOpcion | null>(inicial.insumo);
  const [ubicacionId, setUbicacionId] = React.useState(() => ubicacionPorDefecto(ubicaciones, inicial.ubicacionId));
  const [numeroLote, setNumeroLote] = React.useState(inicial.numeroLote ?? "");
  const [fechaVencimiento, setFechaVencimiento] = React.useState("");
  const [cantidad, setCantidad] = React.useState("");
  const [proveedorId, setProveedorId] = React.useState("");
  const [documentoRef, setDocumentoRef] = React.useState("");
  const [costoUnitario, setCostoUnitario] = React.useState("");
  const [nota, setNota] = React.useState("");
  const [intentado, setIntentado] = React.useState(false);
  const [confirmado, setConfirmado] = React.useState<IngresoConfirmado | null>(null);
  const [lineas, setLineas] = React.useState<LineaRegistrada[]>([]);
  const [ronda, setRonda] = React.useState(0);
  // Clave de idempotencia: un doble envío o un reintento no duplica el movimiento.
  const [claveIdempotencia, setClaveIdempotencia] = React.useState(nuevaClaveIdempotencia);

  const existencias = useExistenciasInsumo(insumo?.id ?? null, centroId);
  const ingreso = useAccion(registrarIngresoAccion, { toastError: false });

  const ubicacion = ubicaciones.find((u) => u.id === ubicacionId) ?? null;
  const loteNormalizado = numeroLote.trim().toUpperCase();
  const lotesRegistrados = existencias.datos?.lotesRegistrados ?? [];
  const loteExistente = loteNormalizado ? (lotesRegistrados.find((l) => l.numeroLote === loteNormalizado) ?? null) : null;
  const loteExistenteVencido =
    loteExistente !== null && calcularEstadoVencimiento(loteExistente.fechaVencimiento, hoy) === "VENCIDO";
  const pideVencimiento = insumo !== null && loteExistente === null;
  const vencimientoObligatorio = pideVencimiento && insumo.controlaVencimiento;

  const valores = {
    ubicacionId,
    insumoId: insumo?.id ?? "",
    numeroLote,
    fechaVencimiento: loteExistente ? (loteExistente.fechaVencimiento ?? "") : fechaVencimiento,
    cantidad,
    proveedorId,
    documentoRef,
    costoUnitario,
    nota,
  };

  const validar = (): ErroresCampo => {
    const e = erroresDeEsquema(esquemaIngreso, valores);
    if (!insumo) e.insumoId = ["Elige el insumo que estás ingresando"];
    if (!ubicacionId) e.ubicacionId = ["Elige la ubicación donde quedará guardado"];
    if (!cantidad.trim()) e.cantidad = ["Ingresa la cantidad"];
    if (loteExistenteVencido && loteExistente) {
      e.numeroLote = [`El lote ${loteExistente.numeroLote} venció el ${formatearDia(loteExistente.fechaVencimiento)}; no se puede ingresar.`];
    }
    if (pideVencimiento && !e.fechaVencimiento) {
      if (vencimientoObligatorio && !fechaVencimiento) {
        e.fechaVencimiento = ["Este insumo controla vencimiento: ingresa la fecha del lote"];
      } else if (fechaVencimiento && diasEntre(hoy, fechaVencimiento) < 0) {
        e.fechaVencimiento = ["Esa fecha ya pasó: no se pueden ingresar lotes vencidos"];
      }
    }
    return e;
  };
  const erroresLocales = intentado ? validar() : {};
  const errores = unirErrores(ingreso.erroresCampo, erroresLocales);
  const errorGeneral = ingreso.error && Object.keys(ingreso.erroresCampo).length === 0 ? ingreso.error : null;

  /** Envuelve un setter: al editar se descartan los errores del servidor. */
  function alEditar<T>(setter: (valor: T) => void) {
    return (valor: T) => {
      if (ingreso.error) ingreso.limpiar();
      setter(valor);
    };
  }

  const enviar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    if (ingreso.pendiente || !insumo || !ubicacion || Object.keys(validar()).length > 0) {
      setIntentado(true);
      enfocarPrimerError(refFormulario.current);
      return;
    }
    const r = await ingreso.ejecutar({ ...valores, claveIdempotencia });
    if (!r.ok) {
      setIntentado(true);
      enfocarPrimerError(refFormulario.current);
      return;
    }
    setClaveIdempotencia(nuevaClaveIdempotencia());
    const { movimiento, loteCreado, stock } = r.datos;
    setConfirmado({
      insumo,
      ubicacion,
      numeroLote: movimiento.numeroLote,
      loteCreado,
      cantidad: movimiento.cantidad,
      saldoLote: movimiento.saldoPosterior,
      stock,
    });
    setLineas((previas) => [
      { id: movimiento.id, insumo: insumo.nombre, numeroLote: movimiento.numeroLote, cantidad: movimiento.cantidad, unidad: insumo.unidadMedida },
      ...previas,
    ]);
    existencias.recargar();
  };

  /** Deja el formulario listo para otra línea de la misma guía o factura. */
  const registrarOtro = () => {
    setClaveIdempotencia(nuevaClaveIdempotencia());
    setInsumo(null);
    setNumeroLote("");
    setFechaVencimiento("");
    setCantidad("");
    setCostoUnitario("");
    setNota("");
    setIntentado(false);
    setConfirmado(null);
    ingreso.limpiar();
    setRonda((n) => n + 1);
  };

  // Primero los lotes que hoy tienen stock (los más probables), luego los más recientes.
  const conStock = new Set((existencias.datos?.existencias ?? []).map((x) => x.loteId));
  const sugerenciasLote = [
    ...lotesRegistrados.filter((l) => conStock.has(l.loteId)),
    ...lotesRegistrados.filter((l) => !conStock.has(l.loteId)),
  ]
    .filter((l) => calcularEstadoVencimiento(l.fechaVencimiento, hoy) !== "VENCIDO")
    .slice(0, 4)
    .map((l) => ({
    valor: l.numeroLote,
    texto: (
      <>
        <span className="cifras font-semibold">{l.numeroLote}</span>
        {l.fechaVencimiento ? <span className="cifras font-normal text-texto-tenue">vence {formatearDia(l.fechaVencimiento)}</span> : null}
      </>
    ),
  }));

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
      {confirmado ? (
        <Confirmacion
          titulo="Ingreso registrado"
          detalle={
            <CifrasConfirmacion
              cifras={[
                ...(confirmado.stock
                  ? [
                      {
                        etiqueta: `Ahora hay en ${confirmado.ubicacion.centro}`,
                        valor: cantidadConUnidad(confirmado.stock.disponibleCentro, confirmado.insumo.unidadMedida),
                        nota: "disponibles para usar",
                      },
                    ]
                  : []),
                {
                  etiqueta: `Lote ${confirmado.numeroLote} en ${confirmado.ubicacion.nombre}`,
                  valor: cantidadConUnidad(confirmado.saldoLote, confirmado.insumo.unidadMedida),
                  nota: confirmado.loteCreado ? "Lote nuevo" : "Lote que ya existía",
                },
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
              {puedeVerMovimientos ? (
                <Link href="/movimientos" className={buttonClasses({ variant: "fantasma", size: "lg" })}>
                  Ver movimientos
                </Link>
              ) : null}
            </>
          }
        >
          Ingresaste <strong>{cantidadConUnidad(confirmado.cantidad, confirmado.insumo.unidadMedida)}</strong> de{" "}
          <strong>{confirmado.insumo.nombre}</strong> en {confirmado.ubicacion.nombre}
          {confirmado.stock ? (
            <>
              ; ahora hay <strong>{cantidadConUnidad(confirmado.stock.disponibleCentro, confirmado.insumo.unidadMedida)}</strong>
            </>
          ) : null}
          .
          {documentoRef || proveedorId ? (
            <span className="mt-1 block text-sm text-texto-suave">
              “Registrar otro” conserva la ubicación{proveedorId ? ", el proveedor" : ""}
              {documentoRef ? ` y el documento ${documentoRef}` : ""}.
            </span>
          ) : null}
        </Confirmacion>
      ) : (
        <Card>
          <form ref={refFormulario} noValidate onSubmit={enviar} className="space-y-5" aria-label="Registrar ingreso">
            <AnuncioErrores errores={errores} visible={intentado} />
            {errorGeneral ? <Alert tono="peligro">{errorGeneral}</Alert> : null}

            <Field label="Insumo" requerido error={errores.insumoId}>
              <ComboboxInsumo
                key={ronda}
                valor={insumo}
                onCambiar={alEditar((nuevo: InsumoOpcion | null) => {
                  setInsumo(nuevo);
                  setNumeroLote("");
                  setFechaVencimiento("");
                })}
                iniciales={insumosIniciales}
                autoFocus={ronda > 0}
              />
            </Field>

            <Field label="Ubicación de destino" requerido error={errores.ubicacionId}>
              <SelectUbicacion name="ubicacionId" ubicaciones={ubicaciones} valor={ubicacionId} onCambiar={alEditar(setUbicacionId)} />
            </Field>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field
                label="Número de lote"
                requerido
                error={errores.numeroLote}
                ayuda={insumo ? undefined : "Tal como aparece en la caja o etiqueta."}
              >
                <Input
                  name="numeroLote"
                  value={numeroLote}
                  onChange={(e) => alEditar(setNumeroLote)(e.target.value.toUpperCase())}
                  autoCapitalize="characters"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={60}
                  className="cifras"
                  placeholder="Ej.: L2611-045"
                />
              </Field>

              {loteExistente ? (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-texto">Vencimiento</p>
                  <div
                    className="flex min-h-11 items-center gap-2.5 rounded-control border border-borde bg-superficie-2 px-3.5 py-2 text-[0.9375rem]"
                    role="status"
                  >
                    <CalendarCheck className="size-[1.125rem] shrink-0 text-texto-tenue" aria-hidden />
                    <span className="cifras font-medium text-texto">
                      {loteExistente.fechaVencimiento ? formatearDia(loteExistente.fechaVencimiento) : "Sin vencimiento"}
                    </span>
                    <Badge tono="info">Lote existente</Badge>
                  </div>
                  <p className="text-sm text-texto-suave">
                    El lote ya está registrado: se suma a él y conserva su fecha
                    {loteExistente.fechaVencimiento ? ` (${describirVencimiento(diasEntre(hoy, loteExistente.fechaVencimiento)).toLowerCase()})` : ""}.
                  </p>
                </div>
              ) : (
                <Field
                  label="Vencimiento"
                  requerido={vencimientoObligatorio}
                  opcional={insumo !== null && !insumo.controlaVencimiento}
                  error={errores.fechaVencimiento}
                  ayuda={
                    fechaVencimiento || (loteNormalizado && insumo && existencias.datos) ? (
                      <>
                        {/* El selector nativo usa el formato del dispositivo: se repite la fecha como la muestra la app. */}
                        {fechaVencimiento ? (
                          <span className="block">
                            Vence el <strong className="cifras font-semibold text-texto">{formatearDia(fechaVencimiento)}</strong> (día-mes-año)
                          </span>
                        ) : null}
                        {loteNormalizado && insumo && existencias.datos ? (
                          <span className="inline-flex items-center gap-1.5">
                            <PackagePlus className="size-4 text-texto-tenue" aria-hidden />
                            Lote nuevo para este insumo.
                          </span>
                        ) : null}
                      </>
                    ) : undefined
                  }
                >
                  <Input
                    name="fechaVencimiento"
                    type="date"
                    lang="es-CL"
                    min={hoy}
                    value={fechaVencimiento}
                    onChange={(e) => alEditar(setFechaVencimiento)(e.target.value)}
                    className="cifras"
                  />
                </Field>
              )}
            </div>

            {insumo && sugerenciasLote.length > 0 && !loteExistente ? (
              <div className="-mt-2 space-y-1.5">
                <p className="text-sm text-texto-suave">¿Es un lote que ya tienes? Tócalo para usarlo:</p>
                <Sugerencias etiqueta="Lotes registrados de este insumo" opciones={sugerenciasLote} onElegir={alEditar(setNumeroLote)} />
              </div>
            ) : null}

            <Field label="Cantidad" requerido error={errores.cantidad} className="sm:max-w-sm">
              <CampoCantidad valor={cantidad} onCambiar={alEditar(setCantidad)} unidad={insumo?.unidadMedida} />
            </Field>

            <div role="group" aria-labelledby="titulo-respaldo" className="border-t border-borde pt-5">
              <h2 id="titulo-respaldo" className="mb-4 text-sm font-semibold text-texto">
                Respaldo del ingreso
                <span className="block font-normal text-texto-tenue sm:ml-2 sm:inline">Se conserva al registrar varias líneas</span>
              </h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field label="Proveedor" opcional error={errores.proveedorId}>
                  <Select
                    name="proveedorId"
                    value={proveedorId}
                    onChange={(e) => alEditar(setProveedorId)(e.target.value)}
                    placeholder="Sin proveedor"
                    opciones={proveedores.map((p) => ({ value: p.id, label: `${p.razonSocial} · ${formatearRut(p.rut)}` }))}
                  />
                </Field>
                <Field label="Guía o factura" opcional error={errores.documentoRef}>
                  <Input
                    name="documentoRef"
                    value={documentoRef}
                    onChange={(e) => alEditar(setDocumentoRef)(e.target.value)}
                    maxLength={80}
                    autoComplete="off"
                    placeholder="Ej.: Guía 45871"
                  />
                </Field>
                <Field
                  label={`Costo unitario${insumo ? ` (por ${insumo.unidadMedida})` : ""}`}
                  opcional
                  error={errores.costoUnitario}
                >
                  <Input
                    name="costoUnitario"
                    value={costoUnitario}
                    onChange={(e) => alEditar(setCostoUnitario)(e.target.value)}
                    inputMode="decimal"
                    autoComplete="off"
                    inicio="$"
                    placeholder="0"
                    className="cifras"
                  />
                </Field>
                <Field label="Nota" opcional error={errores.nota} className="sm:col-span-2">
                  <Textarea name="nota" value={nota} onChange={(e) => alEditar(setNota)(e.target.value)} rows={2} maxLength={500} />
                </Field>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-borde pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-texto-suave" aria-live="polite">
                {insumo && ubicacion && leerCantidad(cantidad) ? (
                  <>
                    Vas a ingresar <strong className="text-texto">{cantidadConUnidad(leerCantidad(cantidad) ?? 0, insumo.unidadMedida)}</strong> en{" "}
                    <strong className="text-texto">
                      {ubicacion.nombre}
                      {mostrarCentro ? ` (${ubicacion.centro})` : ""}
                    </strong>
                    .
                  </>
                ) : (
                  "Los campos con * son obligatorios."
                )}
              </p>
              <Button type="submit" size="lg" cargando={ingreso.pendiente} className="sm:min-w-52">
                <ArrowDownToLine aria-hidden />
                Registrar ingreso
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="space-y-4 xl:sticky xl:top-20">
        {lineas.length > 0 ? (
          <Card>
            <CardHeader
              titulo="Registrados en esta sesión"
              descripcion={documentoRef ? `Documento: ${documentoRef}` : `${lineas.length} ${lineas.length === 1 ? "línea" : "líneas"}`}
            />
            <ol className="divide-y divide-borde text-sm">
              {lineas.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-texto">{l.insumo}</span>
                    <span className="cifras block truncate text-xs text-texto-suave">Lote {l.numeroLote}</span>
                  </span>
                  <span className="cifras shrink-0 font-semibold text-exito-700">+{cantidadConUnidad(l.cantidad, l.unidad)}</span>
                </li>
              ))}
            </ol>
          </Card>
        ) : null}
        <PanelExistencias
          insumo={confirmado?.insumo ?? insumo}
          estado={existencias}
          mostrarCentro={mostrarCentro}
          ubicacionDestacada={ubicacionId}
        />
      </div>
    </div>
  );
}
