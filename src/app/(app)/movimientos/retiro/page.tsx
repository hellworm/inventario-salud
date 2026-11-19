import type { Metadata } from "next";
import { MapPinOff } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui";
import { textoParam } from "@/lib/parametros";
import { puede } from "@/lib/permisos";
import { contextoPagina } from "@/server/auth/sesion";
import { buscarInsumos, listarUbicaciones, obtenerOpcionInsumo } from "@/server/servicios";
import { volverDeFormulario } from "../volver";
import { FormularioRetiro } from "./formulario-retiro";
import { SinCentroActivo } from "@/components/shell/sin-centro";
import { AvisoCambioCentro } from "@/components/movimientos/aviso-cambio-centro";

export const metadata: Metadata = { title: "Registrar retiro" };

export default async function PaginaRetiro({ searchParams }: PageProps<"/movimientos/retiro">) {
  const { actor, centroId, centro, sinCentro } = await contextoPagina("movimientos:retiro");
  if (sinCentro) return <SinCentroActivo titulo="Registrar retiro" />;
  const sp = await searchParams;
  const volver = await volverDeFormulario(sp.volver);
  const insumoParam = textoParam(sp.insumo);
  const [ubicaciones, insumosIniciales, insumoInicial] = await Promise.all([
    listarUbicaciones(actor, { centroId }),
    // Con un centro activo, primero lo más retirado ahí en los últimos 30 días.
    buscarInsumos(actor, { limite: 20, priorizarRetirosDeCentroId: centroId }),
    insumoParam ? obtenerOpcionInsumo(actor, insumoParam) : null,
  ]);
  const ubicacionParam = textoParam(sp.ubicacion);

  return (
    <>
      <PageHeader
        titulo="Registrar retiro"
        descripcion={
          centro
            ? `Salida de insumos de ${centro.nombre} para su uso.`
            : "Salida de insumos para su uso. Estás viendo toda la red: revisa bien la ubicación."
        }
        volver={volver}
      />
      <AvisoCambioCentro centroId={centroId} nombre={centro?.nombre ?? null} />
      {ubicaciones.length === 0 ? (
        <EmptyState
          icono={MapPinOff}
          titulo="No hay ubicaciones activas"
          descripcion="Este centro no tiene bodegas ni salas activas desde donde retirar."
        />
      ) : (
        <FormularioRetiro
          ubicaciones={ubicaciones}
          insumosIniciales={insumosIniciales}
          centroId={centroId}
          mostrarCentro={centro === null}
          puedeVerMovimientos={puede(actor.rol, "movimientos:ver")}
          puedeDarDeBaja={puede(actor.rol, "movimientos:merma")}
          inicial={{
            insumo: insumoInicial,
            ubicacionId: ubicaciones.some((u) => u.id === ubicacionParam) ? ubicacionParam : null,
            loteId: textoParam(sp.lote),
          }}
        />
      )}
    </>
  );
}
