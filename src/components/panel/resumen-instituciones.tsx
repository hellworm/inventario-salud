import Link from "next/link";
import { Building2, ChevronRight, CircleCheck, Landmark, X } from "lucide-react";
import { Card, CardHeader, SEMAFORO_UI } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatearNumero, pluralizar } from "@/lib/formato";
import type { ResumenCentro, ResumenInstitucion } from "@/server/servicios";

/**
 * "La red por institución": el resumen del administrador de la red en la vista
 * "Toda la red". Una tarjeta por institución con sus centros, lo que falta
 * (sin stock, bajo mínimo) y su semáforo de vencimientos (lotes vencidos, en
 * rojo y en amarillo); al elegir una (`/panel?institucion=<id>`) se despliega
 * el detalle de sus centros, y cada conteo lleva a Alertas ya filtrado por
 * centro y tipo.
 *
 * Solo recibe datos ya autorizados (`resumenPorInstitucion`, solo ADMIN_RED).
 */

const INDICADORES = [
  { clave: "sinStock", etiqueta: "Sin stock", tab: "sin-stock", tono: "peligro", frase: "sin stock", color: null },
  { clave: "bajoMinimo", etiqueta: "Bajo mínimo", tab: "bajo-minimo", tono: "alerta", frase: "bajo el mínimo", color: null },
  // Semáforo de vencimientos: lotes con stock (mismas pestañas que /alertas).
  { clave: "vencidos", etiqueta: "Vencidos", tab: "vencidos", tono: "peligro", frase: "lotes vencidos", color: "VENCIDO" },
  { clave: "rojo", etiqueta: "Rojo", tab: "rojo", tono: "peligro", frase: "lotes en rojo", color: "ROJO" },
  { clave: "amarillo", etiqueta: "Amarillo", tab: "amarillo", tono: "alerta", frase: "lotes en amarillo", color: "AMARILLO" },
] as const;

type Indicador = (typeof INDICADORES)[number];

/** Etiqueta del indicador; los del semáforo llevan su forma (octágono, triángulo…), no solo el color. */
function EtiquetaIndicador({ ind }: { ind: Indicador }) {
  const ui = ind.color ? SEMAFORO_UI[ind.color] : null;
  return (
    <span className="inline-flex items-center justify-center gap-1 text-xs leading-tight text-texto-suave">
      {ui ? <ui.icono className={cn("size-3 shrink-0", ui.texto)} aria-hidden /> : null}
      {ind.etiqueta}
    </span>
  );
}

type Tono = (typeof INDICADORES)[number]["tono"];

const CLASE_TONO: Record<Tono, string> = {
  peligro: "bg-peligro-50 text-peligro-800 ring-peligro-600/25",
  alerta: "bg-alerta-50 text-alerta-800 ring-alerta-500/40",
};

/** Ancla de la sección: al elegir una institución la página vuelve aquí. */
const ANCLA = "red-por-institucion";

function totalAlertas(i: Pick<ResumenCentro, "sinStock" | "bajoMinimo" | "vencidos" | "rojo" | "amarillo">): number {
  return i.sinStock + i.bajoMinimo + i.vencidos + i.rojo + i.amarillo;
}

function Cifra({ valor, tono }: { valor: number; tono: Tono }) {
  return (
    <span
      className={cn(
        "cifras inline-flex min-h-7 min-w-9 items-center justify-center rounded-full px-2 text-sm font-semibold",
        valor === 0 ? "text-texto-tenue" : cn("ring-1 ring-inset", CLASE_TONO[tono]),
      )}
    >
      {formatearNumero(valor)}
    </span>
  );
}

export function ResumenInstituciones({
  instituciones,
  seleccionadaId,
  className,
}: {
  instituciones: readonly ResumenInstitucion[];
  /** Institución elegida (`?institucion=`); un id desconocido se ignora. */
  seleccionadaId?: string | null;
  className?: string;
}) {
  if (instituciones.length === 0) return null;
  const seleccionada = instituciones.find((i) => i.institucionId === seleccionadaId) ?? null;
  const centros = instituciones.reduce((s, i) => s + i.centros, 0);

  return (
    <Card id={ANCLA} className={cn("scroll-mt-20", className)} data-resumen-instituciones>
      <CardHeader
        titulo="La red por institución"
        descripcion={`${pluralizar(instituciones.length, "institución", "instituciones")} · ${pluralizar(centros, "centro activo", "centros activos")}. Qué falta y el semáforo de vencimientos (lotes) de cada una. Elige una para ver sus centros.`}
      />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Instituciones de la red">
        {instituciones.map((i) => {
          const elegida = seleccionada?.institucionId === i.institucionId;
          const alertas = totalAlertas(i);
          return (
            <li key={i.institucionId} className="min-w-0">
              <Link
                href={elegida ? `/panel#${ANCLA}` : `/panel?institucion=${i.institucionId}#${ANCLA}`}
                scroll={false}
                aria-current={elegida ? "true" : undefined}
                data-institucion={i.institucion}
                className={cn(
                  "group flex h-full flex-col rounded-control border p-3.5 transition-colors sm:p-4",
                  elegida
                    ? "border-marca-600 bg-marca-50/60 ring-1 ring-marca-600"
                    : "border-borde bg-superficie hover:border-marca-400",
                )}
              >
                <span className="flex items-start gap-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-superficie-2 text-texto-suave group-aria-[current]:bg-marca-100 group-aria-[current]:text-marca-800">
                    <Landmark className="size-[1.125rem]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.9375rem] leading-snug font-semibold break-words text-texto">{i.institucion}</span>
                    <span className="block text-sm text-texto-suave">
                      {i.centros === 0 ? "Sin centros activos" : pluralizar(i.centros, "centro")}
                      {i.centros > 0 && alertas === 0 ? " · sin alertas" : ""}
                    </span>
                  </span>
                  <ChevronRight
                    className={cn("mt-1 size-5 shrink-0 text-texto-tenue transition-transform", elegida && "rotate-90 text-marca-700")}
                    aria-hidden
                  />
                </span>
                <span className="mt-3 grid grid-cols-5 gap-1 border-t border-borde pt-3">
                  {INDICADORES.map((ind) => (
                    <span key={ind.clave} className="flex min-w-0 flex-col items-center gap-1 text-center">
                      <Cifra valor={i[ind.clave]} tono={ind.tono} />
                      <EtiquetaIndicador ind={ind} />
                    </span>
                  ))}
                </span>
                <span className="sr-only">
                  {elegida ? ". Seleccionada: ocultar sus centros" : ". Ver sus centros"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {seleccionada ? (
        <section aria-labelledby="titulo-centros-institucion" className="mt-4 rounded-control border border-borde" data-detalle-institucion>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-borde px-3.5 py-2.5 sm:px-4">
            <h3 id="titulo-centros-institucion" className="min-w-0 flex-1 text-[0.9375rem] font-semibold break-words text-texto">
              Detalle por centro: {seleccionada.institucion}
            </h3>
            <Link
              href={`/panel#${ANCLA}`}
              scroll={false}
              className="inline-flex min-h-9 items-center gap-1 rounded-md text-sm font-medium text-marca-700 underline-offset-4 hover:underline pointer-coarse:min-h-11"
            >
              <X className="size-4" aria-hidden />
              Quitar filtro
            </Link>
          </div>
          {seleccionada.detalle.length === 0 ? (
            <p className="px-3.5 py-4 text-sm text-texto-suave sm:px-4">Esta institución aún no tiene centros activos.</p>
          ) : (
            <ul className="divide-y divide-borde">
              {seleccionada.detalle.map((c) => {
                const alertas = totalAlertas(c);
                return (
                  <li
                    key={c.centroId}
                    className="flex flex-col gap-2 px-3.5 py-3 sm:px-4 md:flex-row md:items-center md:gap-4"
                    data-centro={c.centro}
                  >
                    <span className="flex min-w-0 flex-1 items-start gap-2.5">
                      <Building2 className="mt-0.5 size-4 shrink-0 text-texto-tenue" aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-[0.9375rem] font-medium break-words text-texto">{c.centro}</span>
                        <span className="block text-sm text-texto-suave">{c.comuna}</span>
                      </span>
                    </span>
                    {alertas === 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-sm text-exito-700">
                        <CircleCheck className="size-4 shrink-0" aria-hidden />
                        Sin alertas
                      </span>
                    ) : (
                      <span className="grid grid-cols-5 gap-1 md:w-[27rem] md:shrink-0">
                        {INDICADORES.map((ind) => {
                          const valor = c[ind.clave];
                          const contenido = (
                            <>
                              <Cifra valor={valor} tono={ind.tono} />
                              <EtiquetaIndicador ind={ind} />
                            </>
                          );
                          const clase = "flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-md text-center";
                          return valor === 0 ? (
                            <span key={ind.clave} className={clase}>
                              {contenido}
                            </span>
                          ) : (
                            <Link
                              key={ind.clave}
                              href={`/alertas?tab=${ind.tab}&centro=${c.centroId}`}
                              aria-label={`${formatearNumero(valor)} ${ind.frase} en ${c.centro}`}
                              className={cn(clase, "hover:bg-superficie-2")}
                            >
                              {contenido}
                            </Link>
                          );
                        })}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
    </Card>
  );
}
