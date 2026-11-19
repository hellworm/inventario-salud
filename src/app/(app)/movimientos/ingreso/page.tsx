import type { Metadata } from "next";
import Link from "next/link";
import { MapPinOff } from "lucide-react";
import { buttonClasses, EmptyState, PageHeader } from "@/components/ui";
import { hoyEnSantiago } from "@/lib/fechas";
import { textoParam } from "@/lib/parametros";
import { fraseAlcanceTotal, puede } from "@/lib/permisos";
import { contextoPagina } from "@/server/auth/sesion";
import { buscarInsumos, listarProveedoresActivos, listarUbicaciones, obtenerOpcionInsumo } from "@/server/servicios";
import { volverDeFormulario } from "../volver";
import { FormularioIngreso } from "./formulario-ingreso";
import { SinCentroActivo } from "@/components/shell/sin-centro";
import { AvisoCambioCentro } from "@/components/movimientos/aviso-cambio-centro";

export const metadata: Metadata = { title: "Registrar ingreso" };


export default async function PaginaIngreso({ searchParams }: PageProps<"/movimientos/ingreso">) {
  const { actor, centroId, centro, sinCentro } = await contextoPagina("movimientos:ingreso");
  if (sinCentro) return <SinCentroActivo titulo="Registrar ingreso" />;
  const sp = await searchParams;
  const volver = await volverDeFormulario(sp.volver);
  const insumoParam = textoParam(sp.insumo);
  const [ubicaciones, proveedores, insumosIniciales, insumoInicial] = await Promise.all([
    listarUbicaciones(actor, { centroId }),
    listarProveedoresActivos(actor),
    buscarInsumos(actor, { limite: 20 }),
    insumoParam ? obtenerOpcionInsumo(actor, insumoParam) : null,
  ]);
  const ubicacionParam = textoParam(sp.ubicacion);

  return (
    <>
      <PageHeader
        titulo="Registrar ingreso"
        descripcion={
          centro
            ? `Entrada de insumos a ${centro.nombre}.`
            : `Entrada de insumos. Estás viendo ${fraseAlcanceTotal(actor.rol)}: elige con cuidado la ubicación de destino.`
        }
        volver={volver}
      />
      <AvisoCambioCentro centroId={centroId} nombre={centro?.nombre ?? null} />
      {ubicaciones.length === 0 ? (
        <EmptyState
          icono={MapPinOff}
          titulo="No hay ubicaciones activas"
          descripcion="Para ingresar stock se necesita al menos una bodega o sala activa en el centro."
          accion={
            puede(actor.rol, "centros:gestionar") ? (
              <Link href="/admin/centros" className={buttonClasses()}>
                Gestionar centros y ubicaciones
              </Link>
            ) : undefined
          }
        />
      ) : (
        <FormularioIngreso
          ubicaciones={ubicaciones}
          proveedores={proveedores}
          insumosIniciales={insumosIniciales}
          centroId={centroId}
          mostrarCentro={centro === null}
          hoy={hoyEnSantiago()}
          puedeVerMovimientos={puede(actor.rol, "movimientos:ver")}
          inicial={{
            insumo: insumoInicial?.activo ? insumoInicial : null,
            ubicacionId: ubicaciones.some((u) => u.id === ubicacionParam) ? ubicacionParam : null,
            numeroLote: textoParam(sp.lote),
          }}
        />
      )}
    </>
  );
}
