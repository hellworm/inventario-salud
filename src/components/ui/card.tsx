import * as React from "react";
import { cn } from "@/lib/cn";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

/** Superficie contenedora. `relleno={false}` para tablas a sangre. */
export function Card({ className, relleno = true, ...props }: DivProps & { relleno?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-tarjeta border border-borde bg-superficie shadow-tarjeta",
        relleno && "p-4 sm:p-5",
        className,
      )}
      {...props}
    />
  );
}

/** Cabecera con título a la izquierda y acciones opcionales a la derecha. */
export function CardHeader({
  className,
  titulo,
  descripcion,
  acciones,
  children,
  ...props
}: Omit<DivProps, "title"> & { titulo?: React.ReactNode; descripcion?: React.ReactNode; acciones?: React.ReactNode }) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2", className)} {...props}>
      <div className="min-w-0">
        {titulo ? <CardTitle>{titulo}</CardTitle> : null}
        {descripcion ? <CardDescription>{descripcion}</CardDescription> : null}
        {children}
      </div>
      {acciones ? <div className="flex shrink-0 items-center gap-2">{acciones}</div> : null}
    </div>
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-base font-semibold tracking-tight text-texto", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-0.5 text-sm text-texto-suave", className)} {...props} />;
}

export function CardContent({ className, ...props }: DivProps) {
  return <div className={cn(className)} {...props} />;
}

export function CardFooter({ className, ...props }: DivProps) {
  return (
    <div
      className={cn("mt-5 flex flex-col-reverse gap-2 border-t border-borde pt-4 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}
