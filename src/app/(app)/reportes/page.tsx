import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Boxes, CalendarClock, FileSpreadsheet, History, TrendingDown, type LucideIcon } from "lucide-react";
import { Alert, PageHeader } from "@/components/ui";
import { REPORTES, type ClaveReporte } from "@/components/reportes/piezas";
import { contextoPagina } from "@/server/auth/sesion";

export const metadata: Metadata = { title: "Reportes" };

const ICONO: Record<ClaveReporte, LucideIcon> = {
  existencias: Boxes,
  movimientos: History,
  consumo: TrendingDown,
  vencimientos: CalendarClock,
};

const RESPONDE: Record<ClaveReporte, string> = {
  existencias: "¿Qué tenemos, dónde está y cuánto vale?",
  movimientos: "¿Qué entró y qué salió en el período?",
  consumo: "¿Cuánto se usa y para cuántos días alcanza?",
  vencimientos: "¿Qué se va a perder y qué se dio de baja?",
};

export default async function PaginaReportes() {
  const { centro } = await contextoPagina("reportes:ver");
  return (
    <>
      <PageHeader
        titulo="Reportes"
        descripcion={<>{centro ? centro.nombre : "Toda la red"} · Revisa la vista previa y descarga el detalle para Excel.</>}
      />
      <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        {REPORTES.map((r) => {
          const Icono = ICONO[r.clave];
          return (
            <li key={r.clave}>
              <Link
                href={r.href}
                className="group flex h-full items-start gap-4 rounded-tarjeta border border-borde bg-superficie p-4 shadow-tarjeta transition-colors hover:border-marca-300 sm:p-5"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-marca-50 text-marca-700">
                  <Icono className="size-[1.375rem]" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold tracking-tight">{r.titulo}</span>
                  <span className="mt-0.5 block text-[0.9375rem] text-texto">{RESPONDE[r.clave]}</span>
                  <span className="mt-1 block text-sm text-texto-suave">{r.descripcion}</span>
                </span>
                <ArrowRight
                  className="mt-1 size-5 shrink-0 text-texto-tenue transition-transform group-hover:translate-x-0.5 group-hover:text-marca-700"
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
      <Alert tono="info" className="mt-5" titulo="Descargas para Excel">
        <span className="inline-flex items-start gap-2">
          <FileSpreadsheet className="mt-0.5 size-4 shrink-0" aria-hidden />
          Cada reporte se exporta como CSV con los filtros que tengas aplicados y se abre directamente en Excel. Las descargas quedan
          registradas en la auditoría.
        </span>
      </Alert>
    </>
  );
}
