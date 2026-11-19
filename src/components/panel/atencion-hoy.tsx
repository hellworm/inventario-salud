import * as React from "react";
import Link from "next/link";
import { CalendarClock, CalendarX2, ChevronRight, CircleCheck, PackageX, type LucideIcon } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { describirVencimiento } from "@/lib/fechas";
import { formatearNumero, pluralizar } from "@/lib/formato";
import type { AlertaStock, AlertaVencimiento, AtencionHoy as Atencion } from "@/server/servicios";

type Tono = "peligro" | "alerta";

const TONO: Record<Tono, string> = {
  peligro: "bg-peligro-50 text-peligro-700",
  alerta: "bg-alerta-50 text-alerta-700",
};

function Grupo({
  orden,
  titulo,
  ayuda,
  icono: Icono,
  tono,
  total,
  mostrados,
  hrefTodos,
  accion,
  children,
}: {
  orden: number;
  titulo: string;
  ayuda: string;
  icono: LucideIcon;
  tono: Tono;
  total: number;
  mostrados: number;
  hrefTodos: string;
  accion?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (total === 0) return null;
  return (
    <li>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-borde bg-superficie-2 px-4 py-2.5 sm:px-5">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", TONO[tono])}>
          <Icono className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">
            <span className="sr-only">Prioridad {orden}: </span>
            {titulo} <span className="cifras font-normal text-texto-suave">({formatearNumero(total)})</span>
          </h3>
          <p className="text-xs text-texto-suave">{ayuda}</p>
        </div>
        {accion}
      </div>
      <ul className="divide-y divide-borde">{children}</ul>
      {total > mostrados ? (
        <Link
          href={hrefTodos}
          className="flex min-h-11 items-center gap-1 border-t border-borde px-4 text-sm font-medium text-marca-700 hover:bg-marca-50/60 sm:px-5"
        >
          Ver {pluralizar(total - mostrados, "más", "más")}
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </li>
  );
}

function Fila({ href, titulo, detalle, valor, nota }: { href: string; titulo: string; detalle: string; valor: React.ReactNode; nota: string }) {
  return (
    <li>
      <Link href={href} className="group flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-marca-50/60 sm:px-5">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-medium group-hover:text-marca-800">{titulo}</span>
          <span className="block truncate text-xs text-texto-suave">{detalle}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="cifras block text-sm font-semibold">{valor}</span>
          <span className="block text-xs text-texto-suave">{nota}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-texto-tenue group-hover:text-marca-700" aria-hidden />
      </Link>
    </li>
  );
}

const fichaDe = (a: AlertaStock | AlertaVencimiento) => `/inventario/${a.insumoId}`;

/**
 * "Qué requiere atención hoy": lista priorizada (1.º sin stock, 2.º vencidos
 * por dar de baja, 3.º lo que vence esta semana). Cada fila lleva a la ficha
 * del insumo; las acciones de escritura solo aparecen si el rol puede hacerlas.
 */
export function AtencionHoy({
  atencion,
  mostrarCentro,
  puedeIngresar,
  puedeDarDeBaja,
  className,
}: {
  atencion: Atencion;
  /** Muestra el centro en cada fila (vista "Toda la red"). */
  mostrarCentro: boolean;
  puedeIngresar: boolean;
  puedeDarDeBaja: boolean;
  className?: string;
}) {
  const enlaceAccion = "inline-flex min-h-9 shrink-0 items-center rounded-control border border-borde-fuerte/70 bg-superficie px-3 text-sm font-medium hover:border-borde-fuerte hover:bg-superficie-2";
  const lugar = (centro: string, resto: string) => (mostrarCentro ? `${centro} · ${resto}` : resto);

  return (
    <Card relleno={false} className={cn("overflow-hidden", className)}>
      <CardHeader
        className="mb-0 p-4 sm:p-5"
        titulo="Qué requiere atención hoy"
        descripcion={
          atencion.total === 0 ? "Nada urgente por ahora" : `${pluralizar(atencion.total, "pendiente")}, en orden de prioridad`
        }
      />
      {atencion.total === 0 ? (
        <div className="flex items-center gap-3 border-t border-borde px-4 py-6 sm:px-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-exito-50 text-exito-700">
            <CircleCheck className="size-5" aria-hidden />
          </span>
          <p className="text-[0.9375rem] text-texto-suave">
            <strong className="font-semibold text-texto">Todo en orden.</strong> No hay insumos sin stock, lotes vencidos ni vencimientos
            esta semana.
          </p>
        </div>
      ) : (
        <ol>
          <Grupo
            orden={1}
            titulo="Sin stock"
            ayuda="No queda stock utilizable: reponer cuanto antes."
            icono={PackageX}
            tono="peligro"
            total={atencion.sinStock.total}
            mostrados={atencion.sinStock.items.length}
            hrefTodos="/alertas?tab=sin-stock"
            accion={
              puedeIngresar ? (
                <Link href="/movimientos/ingreso" className={enlaceAccion}>
                  Registrar ingreso
                </Link>
              ) : null
            }
          >
            {atencion.sinStock.items.map((a) => (
              <Fila
                key={`${a.insumoId}:${a.centroId}`}
                href={fichaDe(a)}
                titulo={a.nombre}
                detalle={lugar(a.centro, `${a.codigo} · ${a.categoria}`)}
                valor={`Faltan ${formatearNumero(a.faltante)}`}
                nota={`mínimo ${formatearNumero(a.stockMinimo)} ${a.unidadMedida}`}
              />
            ))}
          </Grupo>

          <Grupo
            orden={2}
            titulo="Vencidos por dar de baja"
            ayuda={
              puedeDarDeBaja
                ? "Sepáralos y regístralos como merma."
                : "Sepáralos y avisa a un administrador para darlos de baja."
            }
            icono={CalendarX2}
            tono="peligro"
            total={atencion.vencidos.total}
            mostrados={atencion.vencidos.items.length}
            hrefTodos="/alertas?tab=vencidos"
            accion={
              puedeDarDeBaja ? (
                <Link href="/movimientos/ajuste" className={enlaceAccion}>
                  Registrar merma
                </Link>
              ) : null
            }
          >
            {atencion.vencidos.items.map((a) => (
              <Fila
                key={`${a.loteId}:${a.ubicacionId}`}
                href={fichaDe(a)}
                titulo={a.nombre}
                detalle={lugar(a.centro, `${a.ubicacion} · Lote ${a.numeroLote}`)}
                valor={`${formatearNumero(a.cantidad)} ${a.unidadMedida}`}
                nota={describirVencimiento(a.dias)}
              />
            ))}
          </Grupo>

          <Grupo
            orden={3}
            titulo="Vence esta semana"
            ayuda="Úsalos primero para que no se pierdan."
            icono={CalendarClock}
            tono="alerta"
            total={atencion.venceEstaSemana.total}
            mostrados={atencion.venceEstaSemana.items.length}
            hrefTodos="/alertas?tab=por-vencer&tramo=30"
          >
            {atencion.venceEstaSemana.items.map((a) => (
              <Fila
                key={`${a.loteId}:${a.ubicacionId}`}
                href={fichaDe(a)}
                titulo={a.nombre}
                detalle={lugar(a.centro, `${a.ubicacion} · Lote ${a.numeroLote}`)}
                valor={`${formatearNumero(a.cantidad)} ${a.unidadMedida}`}
                nota={describirVencimiento(a.dias)}
              />
            ))}
          </Grupo>
        </ol>
      )}
    </Card>
  );
}
