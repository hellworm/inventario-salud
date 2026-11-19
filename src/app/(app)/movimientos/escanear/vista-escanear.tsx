"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Keyboard, PackagePlus, ScanBarcode, SearchX } from "lucide-react";
import { asociarCodigoBarrasAccion } from "@/acciones/admin-catalogo";
import { BotonEscanear } from "@/components/escaner/boton-escanear";
import { ComboboxInsumo, type InsumoOpcion } from "@/components/movimientos/combobox-insumo";
import { Alert, BadgeActivo, Button, buttonClasses, Card, Checkbox, Field, Input, useAccion } from "@/components/ui";
import { hrefEscaneo, hrefIngresoEscaneado, RUTA_ESCANEAR } from "@/lib/escaneo";
import { formatearDia, type DiaISO } from "@/lib/fechas";
import { LARGO_MAXIMO_CODIGO } from "@/lib/gs1";
import { construirHref } from "@/lib/parametros-url";

interface DatosLeidos {
  lote: string | null;
  vence: DiaISO | null;
  fab: DiaISO | null;
}

export interface VistaEscanearProps {
  /** Lo que venía en `?codigo=` (ya saneado), o `null` si aún no se escanea nada. */
  pedido: string | null;
  /** Código interpretado por el servidor; `null` si lo pedido no es un código utilizable. */
  codigo: { codigo: string; tipo: "GS1" | "GTIN" | "TEXTO" } | null;
  datos: DatosLeidos;
  ubicacion: string | null;
  coincidencias: (InsumoOpcion & { activo: boolean })[];
  insumosIniciales: InsumoOpcion[];
  puedeGestionarCatalogo: boolean;
  codigoGuardable: boolean;
}

/** Datos que venían en el código (lote y fechas), como texto corto. */
function DatosDelCodigo({ datos }: { datos: DatosLeidos }) {
  if (!datos.lote && !datos.vence && !datos.fab) return null;
  return (
    <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm" data-datos-codigo>
      {datos.lote ? (
        <div className="flex gap-1.5">
          <dt className="text-texto-suave">Lote</dt>
          <dd className="cifras font-semibold">{datos.lote}</dd>
        </div>
      ) : null}
      {datos.vence ? (
        <div className="flex gap-1.5">
          <dt className="text-texto-suave">Vence</dt>
          <dd className="cifras font-semibold">{formatearDia(datos.vence)}</dd>
        </div>
      ) : null}
      {datos.fab ? (
        <div className="flex gap-1.5">
          <dt className="text-texto-suave">Fabricación</dt>
          <dd className="cifras font-semibold">{formatearDia(datos.fab)}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/** Pantalla inicial: abrir la cámara o escribir el código (también para lectores USB/Bluetooth). */
function Inicio({ ubicacion, aviso }: { ubicacion: string | null; aviso?: React.ReactNode }) {
  const router = useRouter();
  const [texto, setTexto] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, iniciar] = React.useTransition();

  function buscar(evento: React.FormEvent) {
    evento.preventDefault();
    const href = texto.trim() ? hrefEscaneo(texto, { ubicacion }) : null;
    if (!href) return setError(texto.trim() ? "Ese código no se puede leer. Revísalo e inténtalo de nuevo." : "Escribe o escanea un código.");
    setError(null);
    iniciar(() => router.push(href));
  }

  return (
    <Card className="mx-auto max-w-xl sm:p-6">
      {aviso}
      <div className="flex flex-col items-center text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-marca-50 text-marca-700">
          <ScanBarcode className="size-7" aria-hidden />
        </span>
        <h2 className="mt-3 text-lg font-semibold tracking-tight">Escanea el código del envase</h2>
        <p className="mt-1 max-w-md text-[0.9375rem] text-texto-suave">
          Sirve el código de barras y el cuadrado pequeño (DataMatrix). Si el código trae el lote y el vencimiento, se completan solos.
        </p>
        <BotonEscanear ubicacion={ubicacion} className={buttonClasses({ size: "lg" }) + " mt-5 w-full sm:w-auto sm:min-w-64"}>
          <ScanBarcode aria-hidden />
          Abrir la cámara
        </BotonEscanear>
      </div>

      <form noValidate onSubmit={buscar} className="mt-6 border-t border-borde pt-5">
        <Field
          label="O escribe el código"
          error={error ?? undefined}
          ayuda="Los números bajo las barras. Con un lector de códigos conectado, haz clic aquí y dispara el lector."
        >
          <Input
            name="codigo"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              if (error) setError(null);
            }}
            maxLength={LARGO_MAXIMO_CODIGO}
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Ej.: 7804100000006"
            inicio={<Keyboard aria-hidden />}
            className="cifras"
          />
        </Field>
        <Button type="submit" variant="secundario" bloque className="mt-3" cargando={pendiente}>
          Buscar insumo
        </Button>
      </form>
    </Card>
  );
}

export function VistaEscanear({
  pedido,
  codigo,
  datos,
  ubicacion,
  coincidencias,
  insumosIniciales,
  puedeGestionarCatalogo,
  codigoGuardable,
}: VistaEscanearProps) {
  const router = useRouter();
  const [insumo, setInsumo] = React.useState<InsumoOpcion | null>(null);
  const [guardarCodigo, setGuardarCodigo] = React.useState(true);
  const [navegando, iniciarNavegacion] = React.useTransition();
  const asociar = useAccion(asociarCodigoBarrasAccion, {
    exito: (r) => `Código guardado en ${r.nombre}`,
    toastError: false,
  });

  if (!pedido) return <Inicio ubicacion={ubicacion} />;
  if (!codigo) {
    return (
      <Inicio
        ubicacion={ubicacion}
        aviso={
          <Alert tono="alerta" titulo="Ese código no se puede leer" className="mb-5">
            Inténtalo de nuevo o escribe los números que aparecen bajo las barras.
          </Alert>
        }
      />
    );
  }

  const destino = (insumoId: string) => hrefIngresoEscaneado(insumoId, { ...datos, ubicacion });
  const puedeAsociar = puedeGestionarCatalogo && codigoGuardable;

  // Código que coincide con más de un insumo, o con uno inactivo.
  if (coincidencias.length > 0) {
    const activos = coincidencias.filter((c) => c.activo);
    return (
      <Card className="mx-auto max-w-2xl sm:p-6">
        <h2 className="text-lg font-semibold tracking-tight">
          {activos.length === 0 ? "Este código es de un insumo inactivo" : "Este código coincide con más de un insumo"}
        </h2>
        <p className="cifras mt-1 text-sm break-all text-texto-suave">Código {codigo.codigo}</p>
        <DatosDelCodigo datos={datos} />
        <ul className="mt-4 divide-y divide-borde overflow-hidden rounded-control border border-borde">
          {coincidencias.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{c.nombre}</span>
                <span className="cifras block text-xs text-texto-suave">{c.codigo}</span>
              </span>
              {c.activo ? (
                <Link href={destino(c.id)} className={buttonClasses({ size: "sm" })}>
                  Ingresar este
                  <ArrowRight aria-hidden />
                </Link>
              ) : (
                <BadgeActivo activo={false} />
              )}
            </li>
          ))}
        </ul>
        {activos.length === 0 ? (
          <p className="mt-3 text-sm text-texto-suave">
            Un insumo inactivo no admite ingresos.{" "}
            {puedeGestionarCatalogo ? "Reactívalo en Administración › Insumos." : "Pide a tu administrador que lo reactive."}
          </p>
        ) : null}
        <BotonEscanear ubicacion={ubicacion} className={buttonClasses({ variant: "secundario" }) + " mt-5"}>
          <ScanBarcode aria-hidden />
          Escanear otro código
        </BotonEscanear>
      </Card>
    );
  }

  const continuar = async () => {
    if (!insumo) return;
    if (puedeAsociar && guardarCodigo) {
      const r = await asociar.ejecutar({ insumoId: insumo.id, codigoBarras: codigo.codigo });
      if (!r.ok) return;
    }
    iniciarNavegacion(() => router.push(destino(insumo.id)));
  };

  // (b) Ningún insumo tiene este código.
  return (
    <Card className="mx-auto max-w-2xl sm:p-6" data-codigo-no-reconocido>
      <div className="flex items-start gap-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-alerta-50 text-alerta-700">
          <SearchX className="size-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">No reconocemos este código</h2>
          <p className="cifras mt-0.5 text-sm break-all text-texto-suave">Código {codigo.codigo}</p>
          <DatosDelCodigo datos={datos} />
        </div>
      </div>

      <p className="mt-4 text-[0.9375rem] text-texto-suave">
        Ningún insumo del catálogo tiene este código. Puedes registrar el ingreso igual: busca el insumo por su nombre
        {datos.lote || datos.vence ? " y conservaremos el lote y el vencimiento leídos" : ""}.
      </p>

      <div className="mt-4 space-y-4">
        <Field label="¿Qué insumo es?" error={asociar.erroresCampo.insumoId}>
          <ComboboxInsumo
            valor={insumo}
            onCambiar={(nuevo) => {
              if (asociar.error) asociar.limpiar();
              setInsumo(nuevo);
            }}
            iniciales={insumosIniciales}
          />
        </Field>

        {puedeAsociar ? (
          <div>
            <Checkbox
              name="guardarCodigo"
              checked={guardarCodigo}
              onChange={(e) => setGuardarCodigo(e.target.checked)}
              label="Asociar este código a ese insumo"
              descripcion={
                insumo?.codigoBarras && insumo.codigoBarras !== codigo.codigo
                  ? `Reemplazará su código actual (${insumo.codigoBarras}). La próxima vez se reconocerá al escanearlo.`
                  : "La próxima vez se reconocerá al escanearlo. Queda registrado en la auditoría."
              }
            />
          </div>
        ) : puedeGestionarCatalogo ? (
          <Alert tono="info">
            Este código tiene caracteres que el catálogo no admite como código de barras, así que no se puede asociar a un insumo. Puedes
            continuar con el ingreso.
          </Alert>
        ) : (
          <Alert tono="info" titulo="Para que se reconozca la próxima vez">
            Pide a tu administrador que registre este código en el insumo. Mientras tanto puedes continuar con el ingreso.
          </Alert>
        )}

        {asociar.error ? (
          <Alert tono="peligro">{asociar.erroresCampo.codigoBarras?.[0] ?? asociar.error}</Alert>
        ) : null}
      </div>

      <div className="mt-6 flex flex-col gap-2 border-t border-borde pt-5 sm:flex-row sm:flex-wrap">
        <Button size="lg" disabled={!insumo} cargando={asociar.pendiente || navegando} onClick={() => void continuar()}>
          {puedeAsociar && guardarCodigo ? "Asociar y continuar con el ingreso" : "Continuar con el ingreso"}
          <ArrowRight aria-hidden />
        </Button>
        <BotonEscanear ubicacion={ubicacion} className={buttonClasses({ variant: "secundario", size: "lg" })}>
          <ScanBarcode aria-hidden />
          Escanear otro
        </BotonEscanear>
        {puedeAsociar ? (
          <Link
            href={construirHref("/admin/insumos/nuevo", { codigoBarras: codigo.codigo })}
            className={buttonClasses({ variant: "fantasma", size: "lg" })}
          >
            <PackagePlus aria-hidden />
            Crear insumo con este código
          </Link>
        ) : null}
      </div>
      <p className="mt-3 text-xs text-texto-tenue">
        ¿Escribiste mal el código? <Link href={RUTA_ESCANEAR} className="font-medium text-marca-700 underline underline-offset-2">Volver a intentarlo</Link>
      </p>
    </Card>
  );
}
