"use client";

import * as React from "react";
import { ArrowRight, Eye } from "lucide-react";
import { Badge, Button, Dialog, DialogContent } from "@/components/ui";
import { formatearFechaHora } from "@/lib/fechas";
import {
  etiquetaAccion,
  etiquetaEntidad,
  extraerCambios,
  extraerDatos,
  extraerParametros,
  tonoAccion,
  type DetalleAuditoria as Detalle,
} from "./auditoria-legible";

export interface RegistroVisible {
  id: string;
  creadoEn: Date;
  usuario: { nombre: string; email: string } | null;
  accion: string;
  entidad: string;
  entidadId: string | null;
  detalle: Detalle;
  ip: string | null;
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-texto-tenue uppercase">{titulo}</h3>
      {children}
    </section>
  );
}

function Contenido({ registro }: { registro: RegistroVisible }) {
  const datos = extraerDatos(registro.detalle);
  const cambios = extraerCambios(registro.detalle);
  const parametros = extraerParametros(registro.detalle);

  return (
    <div>
      <Seccion titulo="Quién y cuándo">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-texto-tenue">Usuario</dt>
            <dd className="font-medium text-texto">
              {registro.usuario ? registro.usuario.nombre : "Sin usuario identificado"}
              {registro.usuario ? <span className="block font-normal break-all text-texto-suave">{registro.usuario.email}</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-texto-tenue">Fecha y hora</dt>
            <dd className="cifras font-medium text-texto">{formatearFechaHora(registro.creadoEn)}</dd>
          </div>
          <div>
            <dt className="text-texto-tenue">Sobre</dt>
            <dd className="font-medium text-texto">{etiquetaEntidad(registro.entidad)}</dd>
          </div>
          <div>
            <dt className="text-texto-tenue">Dirección IP</dt>
            <dd className="cifras font-medium text-texto">{registro.ip ?? "—"}</dd>
          </div>
        </dl>
      </Seccion>

      {datos.length > 0 ? (
        <Seccion titulo="Detalle">
          <dl className="divide-y divide-borde rounded-control border border-borde text-sm">
            {datos.map((d) => (
              <div key={d.etiqueta} className="grid gap-x-4 gap-y-0.5 px-3.5 py-2.5 sm:grid-cols-[11rem_1fr]">
                <dt className="text-texto-suave">{d.etiqueta}</dt>
                <dd className="font-medium break-words text-texto">{d.valor}</dd>
              </div>
            ))}
          </dl>
        </Seccion>
      ) : null}

      {cambios.length > 0 ? (
        <Seccion titulo="Qué cambió">
          <ul className="divide-y divide-borde rounded-control border border-borde text-sm">
            {cambios.map((c) => (
              <li key={c.campo} className="px-3.5 py-2.5">
                <p className="text-texto-suave">{c.campo}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="break-words text-texto-suave line-through decoration-texto-tenue/60">{c.antes}</span>
                  <ArrowRight className="size-4 shrink-0 text-texto-tenue" aria-label="cambió a" />
                  <span className="font-semibold break-words text-texto">{c.despues}</span>
                </p>
              </li>
            ))}
          </ul>
        </Seccion>
      ) : null}

      {parametros.length > 0 ? (
        <Seccion titulo="Mínimos y máximos por centro">
          <ul className="divide-y divide-borde rounded-control border border-borde text-sm">
            {parametros.map((p) => (
              <li key={p.centro} className="px-3.5 py-2.5">
                <p className="font-medium text-texto">{p.centro}</p>
                <p className="cifras mt-0.5 text-texto-suave">
                  Mínimo: {p.minimoAntes} → <span className="font-semibold text-texto">{p.minimoDespues}</span>
                  <span className="mx-2 text-texto-tenue">·</span>
                  Máximo: {p.maximoAntes} → <span className="font-semibold text-texto">{p.maximoDespues}</span>
                </p>
              </li>
            ))}
          </ul>
        </Seccion>
      ) : null}

      {datos.length === 0 && cambios.length === 0 && parametros.length === 0 ? (
        <p className="mt-5 text-sm text-texto-suave">Este evento no tiene información adicional.</p>
      ) : null}

      <details className="mt-5 text-sm">
        <summary className="inline-flex min-h-9 cursor-pointer items-center text-texto-suave hover:text-marca-700">Datos técnicos</summary>
        <dl className="mt-2 space-y-1 text-xs text-texto-suave">
          <div className="flex gap-2">
            <dt>Código de acción:</dt>
            <dd className="font-mono break-all">{registro.accion}</dd>
          </div>
          {registro.entidadId ? (
            <div className="flex gap-2">
              <dt className="shrink-0">Id del registro:</dt>
              <dd className="font-mono break-all">{registro.entidadId}</dd>
            </div>
          ) : null}
        </dl>
        <pre className="mt-2 max-h-56 overflow-auto rounded-control bg-superficie-2 p-3 font-mono text-xs leading-relaxed text-texto-suave">
          {JSON.stringify(registro.detalle, null, 2)}
        </pre>
      </details>
    </div>
  );
}

/** Botón "Ver detalle" de una fila de auditoría, con su diálogo de lectura. */
export function BotonDetalleAuditoria({ registro }: { registro: RegistroVisible }) {
  const [abierto, setAbierto] = React.useState(false);
  return (
    <>
      <Button
        variant="fantasma"
        size="sm"
        onClick={() => setAbierto(true)}
        aria-label={`Ver detalle: ${etiquetaAccion(registro.accion)}, ${formatearFechaHora(registro.creadoEn)}`}
      >
        <Eye aria-hidden />
        Ver
      </Button>
      {abierto ? (
        <Dialog open onOpenChange={setAbierto}>
          <DialogContent
            ancho="lg"
            titulo={
              <span className="flex flex-wrap items-center gap-2">
                {etiquetaAccion(registro.accion)}
                <Badge tono={tonoAccion(registro.accion)}>{etiquetaEntidad(registro.entidad)}</Badge>
              </span>
            }
          >
            <Contenido registro={registro} />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
