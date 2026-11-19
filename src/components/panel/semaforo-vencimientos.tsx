import Link from "next/link";
import { ArrowRight, CircleCheck } from "lucide-react";
import { CantidadUnidad, DosLineas } from "@/components/reportes/piezas";
import { BadgeEstadoVencimiento, buttonClasses, Card, CardHeader, DataTable, SEMAFORO_UI, type Columna } from "@/components/ui";
import { cn } from "@/lib/cn";
import { DESCRIPCION_SEMAFORO, ETIQUETA_ESTADO_VENCIMIENTO, FILTRO_DE_COLOR, type ColorSemaforo } from "@/lib/estados";
import { formatearDia } from "@/lib/fechas";
import { formatearNumero, pluralizar } from "@/lib/formato";
import { puede, type Rol } from "@/lib/permisos";
import type { LoteSemaforo, ResumenSemaforo } from "@/server/servicios";

const COLORES: readonly Exclude<ColorSemaforo, "VENCIDO">[] = ["ROJO", "AMARILLO", "VERDE"];

/** Qué hacer con cada color, en pocas palabras. */
const CONSEJO: Record<Exclude<ColorSemaforo, "VENCIDO">, string> = {
  ROJO: "Úsalos primero",
  AMARILLO: "Tenlos presentes",
  VERDE: "Sin urgencia",
};

/** Qué hacer con los vencidos, según lo que el rol puede hacer (por permiso, no por nombre de rol). */
function queHacerConVencidos(rol: Rol): string {
  if (puede(rol, "movimientos:merma")) return "No se pueden usar: sepáralos y dalos de baja.";
  if (puede(rol, "movimientos:retiro")) return "No se pueden usar: sepáralos y avisa a tu administrador.";
  return "No se pueden usar.";
}

function columnasEnRojo(mostrarCentro: boolean): Columna<LoteSemaforo>[] {
  return [
    {
      clave: "insumo",
      encabezado: "Insumo y lote",
      movil: "titulo",
      className: "md:w-[34%]",
      celda: (l) => <DosLineas principal={<span className="font-medium">{l.nombre}</span>} secundario={`Lote ${l.numeroLote}`} />,
    },
    {
      clave: "ubicacion",
      encabezado: mostrarCentro ? "Ubicación y centro" : "Ubicación",
      celda: (l) => <DosLineas principal={l.ubicacion} secundario={mostrarCentro ? l.centro : undefined} />,
    },
    {
      clave: "vence",
      encabezado: "Vence el",
      celda: (l) => <span className="cifras whitespace-nowrap">{formatearDia(l.fechaVencimiento)}</span>,
    },
    {
      clave: "dias",
      encabezado: "Días restantes",
      movil: "destacado",
      celda: (l) => <BadgeEstadoVencimiento estado={l.color} dias={l.dias} />,
    },
    {
      clave: "cantidad",
      encabezado: "Cantidad",
      alinear: "derecha",
      celda: (l) => <CantidadUnidad cantidad={l.cantidad} unidad={l.unidadMedida} />,
    },
  ];
}

/**
 * Bloque "Semáforo de vencimientos" del panel:
 *  1. Vencidos, destacado aparte (solo si hay).
 *  2. Tres tarjetas grandes y clicables (Rojo / Amarillo / Verde) con el n.º de
 *     insumos y de lotes; cada una abre el inventario filtrado por ese color.
 *  3. La lista de productos en rojo (lo que vence antes primero); cada fila
 *     lleva a la ficha del insumo.
 * Cada color lleva su forma (octágono, triángulo, círculo) y su nombre escrito.
 */
export function SemaforoVencimientos({
  semaforo,
  enRojo,
  mostrarCentro,
  rol,
  className,
}: {
  semaforo: ResumenSemaforo;
  enRojo: readonly LoteSemaforo[];
  /** Muestra el centro en cada fila (vista "Toda la red"). */
  mostrarCentro: boolean;
  rol: Rol;
  className?: string;
}) {
  const vencidos = semaforo.VENCIDO;
  const IconoVencido = SEMAFORO_UI.VENCIDO.icono;
  const IconoRojo = SEMAFORO_UI.ROJO.icono;
  return (
    <Card relleno={false} className={cn("overflow-hidden", className)}>
      <CardHeader
        className="mb-0 px-4 pt-4 pb-3 sm:px-5 sm:pt-5"
        titulo={<span id="titulo-semaforo">Semáforo de vencimientos</span>}
        descripcion="Lotes con stock según cuánto falta para que venzan. Toca un color para ver sus insumos."
      />

      <div className="space-y-3 px-4 pb-4 sm:px-5 sm:pb-5">
        {vencidos.lotes > 0 ? (
          <Link
            href="/inventario?semaforo=vencido"
            data-semaforo="VENCIDO"
            className="group flex items-center gap-3 rounded-control border border-peligro-600/30 bg-peligro-50 px-3.5 py-3 transition-colors hover:border-peligro-600/60"
          >
            <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", SEMAFORO_UI.VENCIDO.suave)}>
              <IconoVencido className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem] font-semibold text-peligro-800">
                Vencidos: <span className="cifras" data-conteo="insumos">{pluralizar(vencidos.insumos, "insumo")}</span> ·{" "}
                <span className="cifras" data-conteo="lotes">{pluralizar(vencidos.lotes, "lote")}</span>
              </span>
              <span className="block text-sm text-peligro-800">{queHacerConVencidos(rol)}</span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-peligro-700 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        ) : null}

        <ul aria-labelledby="titulo-semaforo" className="grid grid-cols-3 gap-2 sm:gap-3">
          {COLORES.map((color) => {
            const { icono: Icono, suave, acento } = SEMAFORO_UI[color];
            const c = semaforo[color];
            return (
              <li key={color} className="min-w-0">
                <Link
                  href={`/inventario?semaforo=${FILTRO_DE_COLOR[color]}`}
                  data-semaforo={color}
                  aria-label={`${ETIQUETA_ESTADO_VENCIMIENTO[color]}: ${pluralizar(c.insumos, "insumo")}, ${pluralizar(c.lotes, "lote")}. ${DESCRIPCION_SEMAFORO[color]}. Ver en el inventario.`}
                  className={cn(
                    "group flex h-full flex-col rounded-control border border-l-4 border-borde bg-superficie p-3 transition-colors hover:bg-marca-50/50 sm:p-4",
                    acento,
                  )}
                >
                  <span className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg sm:size-9", suave)}>
                      <Icono className="size-[1.125rem] sm:size-5" aria-hidden />
                    </span>
                    <span className="min-w-0 text-[0.9375rem] leading-tight font-semibold text-texto sm:text-base">
                      {ETIQUETA_ESTADO_VENCIMIENTO[color]}
                    </span>
                    <ArrowRight
                      className="ml-auto size-4 shrink-0 text-texto-tenue transition-transform group-hover:translate-x-0.5 group-hover:text-marca-700 max-sm:hidden"
                      aria-hidden
                    />
                  </span>
                  <span className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
                    <span className="cifras text-[1.75rem] leading-9 font-semibold tracking-tight text-texto" data-conteo="insumos">
                      {formatearNumero(c.insumos)}
                    </span>
                    <span className="text-sm text-texto-suave">{c.insumos === 1 ? "insumo" : "insumos"}</span>
                  </span>
                  <span className="cifras text-sm text-texto-suave">
                    <span data-conteo="lotes">{formatearNumero(c.lotes)}</span> {c.lotes === 1 ? "lote" : "lotes"}
                  </span>
                  <span className="mt-2 border-t border-borde pt-2 text-xs leading-snug text-texto-suave">
                    {DESCRIPCION_SEMAFORO[color]}
                    <span className="max-sm:hidden"> · {CONSEJO[color]}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <section aria-labelledby="titulo-en-rojo" className="border-t border-borde">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-superficie-2 px-4 py-2.5 sm:px-5">
          <h3 id="titulo-en-rojo" className="flex items-center gap-2 text-sm font-semibold">
            <IconoRojo className={cn("size-4 shrink-0", SEMAFORO_UI.ROJO.texto)} aria-hidden />
            Productos en rojo
            <span className="cifras font-normal text-texto-suave">
              ({enRojo.length < semaforo.ROJO.lotes ? `${formatearNumero(enRojo.length)} de ${formatearNumero(semaforo.ROJO.lotes)}` : formatearNumero(semaforo.ROJO.lotes)})
            </span>
          </h3>
          <p className="text-xs text-texto-suave">Lo que vence antes, primero</p>
        </div>
        {enRojo.length === 0 ? (
          <div className="flex items-center gap-3 border-t border-borde px-4 py-5 sm:px-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-exito-50 text-exito-700">
              <CircleCheck className="size-5" aria-hidden />
            </span>
            <p className="text-[0.9375rem] text-texto-suave">
              <strong className="font-semibold text-texto">Nada en rojo.</strong> Ningún lote con stock vence en menos de 3 meses.
            </p>
          </div>
        ) : (
          <>
            <DataTable
              className="border-t border-borde"
              titulo="Productos en rojo: lotes con stock que vencen en menos de 3 meses"
              columnas={columnasEnRojo(mostrarCentro)}
              filas={enRojo}
              claveFila={(l) => l.existenciaId}
              hrefFila={(l) => `/inventario/${l.insumoId}`}
            />
            <div className="flex flex-wrap items-center gap-2 border-t border-borde px-4 py-2.5 sm:px-5">
              <Link href="/alertas?tab=rojo" className={cn(buttonClasses({ variant: "enlace" }), "pointer-coarse:!min-h-11 max-md:!min-h-11")}>
                Ver todos los lotes en rojo
                <ArrowRight aria-hidden />
              </Link>
            </div>
          </>
        )}
      </section>
    </Card>
  );
}
