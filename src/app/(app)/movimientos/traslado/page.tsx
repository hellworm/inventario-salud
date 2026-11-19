import type { Metadata } from "next";
import { MapPinOff } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui";
import { textoParam } from "@/lib/parametros";
import { contextoPagina } from "@/server/auth/sesion";
import { buscarInsumos, listarUbicaciones, obtenerOpcionInsumo } from "@/server/servicios";
import { volverDeFormulario } from "../volver";
import { FormularioTraslado } from "./formulario-traslado";

export const metadata: Metadata = { title: "Registrar traslado" };

export default async function PaginaTraslado({ searchParams }: PageProps<"/movimientos/traslado">) {
  const { actor, centroId, centro } = await contextoPagina("movimientos:traslado");
  const sp = await searchParams;
  const volver = await volverDeFormulario(sp.volver);
  const insumoParam = textoParam(sp.insumo);
  // El origen se limita al centro activo; el destino puede ser cualquier
  // ubicación activa de los centros a los que el usuario tiene acceso.
  const [destinos, insumosIniciales, insumoInicial] = await Promise.all([
    listarUbicaciones(actor),
    buscarInsumos(actor, { limite: 20 }),
    insumoParam ? obtenerOpcionInsumo(actor, insumoParam) : null,
  ]);
  const origenes = centroId ? destinos.filter((u) => u.centroId === centroId) : destinos;
  const ubicacionParam = textoParam(sp.ubicacion);

  return (
    <>
      <PageHeader
        titulo="Registrar traslado"
        descripcion={
          centro
            ? `Mueve stock desde ${centro.nombre} a otra ubicación del mismo centro o de otro centro de la red.`
            : "Mueve stock entre ubicaciones, dentro de un centro o entre centros de la red."
        }
        volver={volver}
      />
      {origenes.length === 0 || destinos.length < 2 ? (
        <EmptyState
          icono={MapPinOff}
          titulo="Faltan ubicaciones para trasladar"
          descripcion="Se necesitan al menos dos ubicaciones activas: una de origen y otra de destino."
        />
      ) : (
        <FormularioTraslado
          origenes={origenes}
          destinos={destinos}
          insumosIniciales={insumosIniciales}
          centroId={centroId}
          mostrarCentro={centro === null}
          inicial={{
            insumo: insumoInicial,
            ubicacionId: origenes.some((u) => u.id === ubicacionParam) ? ubicacionParam : null,
            loteId: textoParam(sp.lote),
          }}
        />
      )}
    </>
  );
}
