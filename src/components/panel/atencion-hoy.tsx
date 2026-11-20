import * as React from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarClock,
  CalendarX2,
  ChevronRight,
  CircleCheck,
  PackageX,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import {
  CLASE_ACCION_FILA,
  hrefDarDeBaja,
  hrefIngresar,
  hrefRetirar,
  type UbicacionPorCentro,
} from "@/components/alertas/acciones";
import { EnlaceComprar } from "@/components/proveedores/datos-proveedor";
import { Card, CardHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { describirVencimiento } from "@/lib/fechas";
import { formatearNumero, pluralizar } from "@/lib/formato";
import type { Rol } from "@/lib/permisos";
import { puede } from "@/lib/permisos";
import { cantidadConUnidad } from "@/lib/unidades";
import type { AlertaStock, AlertaVencimiento, AtencionHoy as Atencion, ProveedorEfectivo } from "@/server/servicios";

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
  children: React.ReactNode;
}) {
  if (total === 0) return null;
  return (
    <li>
      <div className="flex items-center gap-x-3 border-t border-borde bg-superficie-2 px-4 py-2.5 sm:px-5">
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

interface Accion {
  href: string;
  texto: string;
  /** Nombre accesible completo ("Ingresar Guante de nitrilo M"). */
  etiqueta: string;
  icono: LucideIcon;
}

/**
 * Fila: el bloque de texto enlaza a la ficha del insumo y, si el rol puede
 * resolver la alerta, un botón aparte lleva al formulario con el contexto.
 */
function Fila({
  href,
  titulo,
  detalle,
  valor,
  nota,
  accion,
  proveedor,
}: {
  href: string;
  titulo: string;
  detalle: string;
  valor: React.ReactNode;
  nota: string;
  accion?: Accion;
  /** Proveedor efectivo del insumo (solo en "Sin stock"): se nombra y, si tiene sitio, se ofrece "Ir a comprar". */
  proveedor?: ProveedorEfectivo | null;
}) {
  return (
    <li className="flex items-center gap-2 pr-3 hover:bg-marca-50/60 max-sm:flex-wrap sm:pr-4">
      {/* En móvil el valor baja a una segunda línea para no truncar el nombre del insumo. */}
      <Link
        href={href}
        className="group flex min-h-14 min-w-0 flex-1 flex-col justify-center gap-x-3 py-2.5 pr-1 pl-4 sm:flex-row sm:items-center sm:justify-start sm:pl-5"
      >
        <span className="min-w-0 sm:flex-1">
          <span className="block text-[0.9375rem] font-medium group-hover:text-marca-800 sm:truncate">{titulo}</span>
          <span className="block truncate text-xs text-texto-suave">{detalle}</span>
          {proveedor ? (
            <span className="block truncate text-xs text-texto-suave" data-proveedor-atencion>
              Proveedor: <span className="font-medium text-texto">{proveedor.razonSocial}</span>
              {proveedor.activo ? "" : " (inactivo)"}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 max-sm:mt-0.5 max-sm:flex max-sm:flex-wrap max-sm:items-baseline max-sm:gap-x-2 sm:text-right">
          <span className="cifras block text-sm font-semibold">{valor}</span>
          <span className="block text-xs text-texto-suave">{nota}</span>
        </span>
        {accion ? null : (
          <ChevronRight className="size-4 shrink-0 text-texto-tenue group-hover:text-marca-700 max-sm:hidden" aria-hidden />
        )}
      </Link>
      {/* Enlace secundario en escritorio; en móvil baja a su propia línea, dentro del detalle de la fila. */}
      <EnlaceComprar
        proveedor={proveedor}
        variante="enlace"
        className="shrink-0 max-sm:order-last max-sm:-mt-1.5 max-sm:mb-1 max-sm:ml-4 max-sm:basis-full"
      />
      {accion ? (
        <Link href={accion.href} aria-label={accion.etiqueta} className={cn(CLASE_ACCION_FILA, "min-h-11")}>
          <accion.icono aria-hidden className="max-sm:hidden" />
          {accion.texto}
        </Link>
      ) : null}
    </li>
  );
}

const fichaDe = (a: AlertaStock | AlertaVencimiento) => `/inventario/${a.insumoId}`;

/** Qué hacer con los vencidos, según lo que el rol puede hacer. */
const AYUDA_VENCIDOS: Record<Rol, string> = {
  ADMIN_RED: "Sepáralos y dalos de baja como merma.",
  ADMIN: "Sepáralos y dalos de baja como merma.",
  BODEGUERO: "Sepáralos y avisa a tu administrador para darlos de baja.",
  VISITANTE: "Lotes con la fecha de vencimiento cumplida que aún figuran con stock.",
};

/**
 * "Qué requiere atención hoy": lista priorizada (1.º sin stock, 2.º vencidos
 * por dar de baja, 3.º lo que vence esta semana). Cada fila lleva a la ficha
 * del insumo y, solo si el rol tiene el permiso, ofrece la acción que resuelve
 * la alerta con el insumo, la ubicación y el lote ya elegidos.
 */
export function AtencionHoy({
  atencion,
  mostrarCentro,
  rol,
  ubicacionesIngreso,
  className,
}: {
  atencion: Atencion;
  /** Muestra el centro en cada fila (vista "Toda la red"). */
  mostrarCentro: boolean;
  rol: Rol;
  /** Ubicación propuesta por centro para el botón "Ingresar". */
  ubicacionesIngreso: UbicacionPorCentro;
  className?: string;
}) {
  const puedeIngresar = puede(rol, "movimientos:ingreso");
  const puedeRetirar = puede(rol, "movimientos:retiro");
  const puedeDarDeBaja = puede(rol, "movimientos:merma");
  const soloLectura = !puedeIngresar && !puedeRetirar;
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
            ayuda={soloLectura ? "No queda stock utilizable de estos insumos." : "No queda stock utilizable: reponer cuanto antes."}
            icono={PackageX}
            tono="peligro"
            total={atencion.sinStock.total}
            mostrados={atencion.sinStock.items.length}
            hrefTodos="/alertas?tab=sin-stock"
          >
            {atencion.sinStock.items.map((a) => (
              <Fila
                key={`${a.insumoId}:${a.centroId}`}
                href={fichaDe(a)}
                titulo={a.nombre}
                detalle={lugar(a.centro, `${a.codigo} · ${a.categoria}`)}
                valor={`Faltan ${formatearNumero(a.faltante)}`}
                nota={`mínimo ${cantidadConUnidad(a.stockMinimo, a.unidadMedida)}`}
                proveedor={a.proveedor}
                accion={
                  puedeIngresar
                    ? { href: hrefIngresar(a, ubicacionesIngreso), texto: "Ingresar", etiqueta: `Ingresar ${a.nombre}`, icono: ArrowDownToLine }
                    : undefined
                }
              />
            ))}
          </Grupo>

          <Grupo
            orden={2}
            titulo={soloLectura ? "Lotes vencidos" : "Vencidos por dar de baja"}
            ayuda={AYUDA_VENCIDOS[rol]}
            icono={CalendarX2}
            tono="peligro"
            total={atencion.vencidos.total}
            mostrados={atencion.vencidos.items.length}
            hrefTodos="/alertas?tab=vencidos"
          >
            {atencion.vencidos.items.map((a) => (
              <Fila
                key={`${a.loteId}:${a.ubicacionId}`}
                href={fichaDe(a)}
                titulo={a.nombre}
                detalle={lugar(a.centro, `${a.ubicacion} · Lote ${a.numeroLote}`)}
                valor={cantidadConUnidad(a.cantidad, a.unidadMedida)}
                nota={describirVencimiento(a.dias)}
                accion={
                  puedeDarDeBaja
                    ? {
                        href: hrefDarDeBaja(a),
                        texto: "Dar de baja",
                        etiqueta: `Dar de baja el lote ${a.numeroLote} de ${a.nombre}`,
                        icono: Trash2,
                      }
                    : undefined
                }
              />
            ))}
          </Grupo>

          <Grupo
            orden={3}
            titulo="Vence esta semana"
            ayuda={soloLectura ? "Lotes con stock que vencen en los próximos 7 días." : "Úsalos primero para que no se pierdan."}
            icono={CalendarClock}
            tono="alerta"
            total={atencion.venceEstaSemana.total}
            mostrados={atencion.venceEstaSemana.items.length}
            hrefTodos="/alertas?tab=rojo"
          >
            {atencion.venceEstaSemana.items.map((a) => (
              <Fila
                key={`${a.loteId}:${a.ubicacionId}`}
                href={fichaDe(a)}
                titulo={a.nombre}
                detalle={lugar(a.centro, `${a.ubicacion} · Lote ${a.numeroLote}`)}
                valor={cantidadConUnidad(a.cantidad, a.unidadMedida)}
                nota={describirVencimiento(a.dias)}
                accion={
                  puedeRetirar
                    ? {
                        href: hrefRetirar(a),
                        texto: "Retirar",
                        etiqueta: `Retirar primero el lote ${a.numeroLote} de ${a.nombre}`,
                        icono: ArrowUpFromLine,
                      }
                    : undefined
                }
              />
            ))}
          </Grupo>
        </ol>
      )}
    </Card>
  );
}
