"use client";

import * as React from "react";
import { CircleCheck, CircleSlash } from "lucide-react";
import { establecerInsumoActivoAccion } from "@/acciones/admin-catalogo";
import { establecerCentroActivoAccion, establecerUbicacionActivaAccion } from "@/acciones/admin-centros";
import { establecerInstitucionActivaAccion } from "@/acciones/admin-instituciones";
import { establecerProveedorActivoAccion } from "@/acciones/admin-proveedores";
import { establecerUsuarioActivoAccion } from "@/acciones/admin-usuarios";
import { Button, ConfirmDialog, toast, type ButtonSize, type ButtonVariant } from "@/components/ui";
import { useFocoAlCerrar } from "./use-foco-al-cerrar";

const ACCIONES = {
  institucion: establecerInstitucionActivaAccion,
  insumo: establecerInsumoActivoAccion,
  centro: establecerCentroActivoAccion,
  ubicacion: establecerUbicacionActivaAccion,
  proveedor: establecerProveedorActivoAccion,
  usuario: establecerUsuarioActivoAccion,
} as const;

export type EntidadActivable = keyof typeof ACCIONES;

const TEXTOS: Record<EntidadActivable, { articulo: string; desactivar: string; activar: string; femenino: boolean }> = {
  institucion: {
    articulo: "la institución",
    femenino: true,
    desactivar:
      "Sus usuarios no podrán ingresar (se cierran sus sesiones) y no se le podrán crear centros ni usuarios. Sus datos e historial se conservan. No se puede desactivar mientras tenga centros activos con stock.",
    activar: "Sus usuarios podrán volver a ingresar.",
  },
  insumo: {
    articulo: "el insumo",
    femenino: false,
    desactivar: "Dejará de aparecer al registrar ingresos. Su stock e historial se conservan y puedes reactivarlo cuando quieras.",
    activar: "Volverá a estar disponible para registrar ingresos.",
  },
  centro: {
    articulo: "el centro",
    femenino: false,
    desactivar: "Dejará de aparecer en el selector de centros y no se podrán registrar movimientos en él. Su historial se conserva.",
    activar: "Volverá a aparecer en el selector de centros y admitirá movimientos.",
  },
  ubicacion: {
    articulo: "la ubicación",
    femenino: true,
    desactivar: "No se podrá elegir al registrar movimientos. Solo se puede desactivar si no guarda existencias.",
    activar: "Volverá a estar disponible para registrar movimientos.",
  },
  proveedor: {
    articulo: "el proveedor",
    femenino: false,
    desactivar: "Dejará de ofrecerse al registrar ingresos. Los ingresos anteriores conservan su referencia.",
    activar: "Volverá a ofrecerse al registrar ingresos.",
  },
  usuario: {
    articulo: "el usuario",
    femenino: false,
    desactivar: "Se cerrarán sus sesiones de inmediato y no podrá volver a ingresar. Sus movimientos quedan en el historial.",
    activar: "Podrá volver a ingresar con su contraseña actual. Si no la recuerda, restablécela después.",
  },
};

export interface ConfirmarActivoProps {
  entidad: EntidadActivable;
  id: string;
  nombre: string;
  /** Estado actual: la acción lo invierte. */
  activo: boolean;
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  /** Aviso adicional en la confirmación (p. ej. stock existente). */
  aviso?: React.ReactNode;
}

/** Confirmación controlada para activar / desactivar (útil desde un menú). */
export function ConfirmarActivo({ entidad, id, nombre, activo, open, onOpenChange, aviso }: ConfirmarActivoProps) {
  const t = TEXTOS[entidad];
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      titulo={activo ? `¿Desactivar ${t.articulo}?` : `¿Reactivar ${t.articulo}?`}
      descripcion={
        <>
          <strong className="font-semibold text-texto">{nombre}</strong>. {activo ? t.desactivar : t.activar}
          {aviso ? <span className="mt-2 block">{aviso}</span> : null}
        </>
      }
      peligro={activo}
      textoConfirmar={activo ? "Desactivar" : "Reactivar"}
      onConfirmar={async () => {
        const r = await ACCIONES[entidad]({ id, activo: !activo });
        if (r.ok) {
          toast.exito(`${nombre}: ${activo ? (t.femenino ? "desactivada" : "desactivado") : t.femenino ? "reactivada" : "reactivado"}`);
        } else {
          toast.error(activo ? "No se pudo desactivar" : "No se pudo reactivar", r.error);
        }
      }}
    />
  );
}

/** Botón con confirmación para activar / desactivar una entidad. */
export function BotonCambiarActivo({
  variant,
  size = "md",
  className,
  ...props
}: Omit<ConfirmarActivoProps, "open" | "onOpenChange"> & { variant?: ButtonVariant; size?: ButtonSize; className?: string }) {
  const [abierto, setAbierto] = React.useState(false);
  const foco = useFocoAlCerrar();
  return (
    <>
      <Button
        variant={variant ?? "secundario"}
        size={size}
        className={className}
        onClick={() => {
          foco.recordar();
          setAbierto(true);
        }}
      >
        {props.activo ? <CircleSlash aria-hidden /> : <CircleCheck aria-hidden />}
        {props.activo ? "Desactivar" : "Reactivar"}
      </Button>
      <ConfirmarActivo
        {...props}
        open={abierto}
        onOpenChange={(valor) => {
          setAbierto(valor);
          if (!valor) foco.devolver();
        }}
      />
    </>
  );
}
