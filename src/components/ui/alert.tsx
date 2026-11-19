import * as React from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type AlertTono = "info" | "exito" | "alerta" | "peligro";

const ESTILO: Record<AlertTono, { clases: string; icono: LucideIcon }> = {
  info: { clases: "border-info-700/20 bg-info-50 text-info-800", icono: Info },
  exito: { clases: "border-exito-600/25 bg-exito-50 text-exito-800", icono: CircleCheck },
  alerta: { clases: "border-alerta-500/40 bg-alerta-50 text-alerta-800", icono: TriangleAlert },
  peligro: { clases: "border-peligro-600/25 bg-peligro-50 text-peligro-800", icono: CircleAlert },
};

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  tono?: AlertTono;
  titulo?: React.ReactNode;
}

/** Mensaje en línea (errores de formulario, avisos). Los errores usan role="alert". */
export function Alert({ tono = "info", titulo, className, children, ...props }: AlertProps) {
  const { clases, icono: Icono } = ESTILO[tono];
  return (
    <div
      role={tono === "peligro" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-control border px-3.5 py-3 text-sm", clases, className)}
      {...props}
    >
      <Icono className="mt-0.5 size-[1.125rem] shrink-0" aria-hidden />
      <div className="min-w-0">
        {titulo ? <p className="font-semibold">{titulo}</p> : null}
        {children ? <div className={cn(titulo && "mt-0.5")}>{children}</div> : null}
      </div>
    </div>
  );
}
