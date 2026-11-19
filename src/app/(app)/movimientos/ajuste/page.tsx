import type { Metadata } from "next";
import { MapPinOff } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui";
import { hoyEnSantiago } from "@/lib/fechas";
import { enumParam, textoParam } from "@/lib/parametros";
import { puede } from "@/lib/permisos";
import { contextoPagina } from "@/server/auth/sesion";
import { esErrorDominio } from "@/server/errores";
import { buscarInsumos, detalleInsumo, listarUbicaciones, obtenerOpcionInsumo } from "@/server/servicios";
import { volverDeFormulario } from "../volver";
import { FormularioAjuste } from "./formulario-ajuste";
import { TIPOS_AJUSTE } from "./tipos";
import { AvisoCambioCentro } from "@/components/movimientos/aviso-cambio-centro";

export const metadata: Metadata = { title: "Ajuste o merma" };

export default async function PaginaAjuste({ searchParams }: PageProps<"/movimientos/ajuste">) {
  const { actor, centroId, centro } = await contextoPagina("movimientos:ajuste");
  const sp = await searchParams;
  const volver = await volverDeFormulario(sp.volver);
  const insumoParam = textoParam(sp.insumo);
  const [ubicaciones, insumosIniciales, insumoInicial] = await Promise.all([
    listarUbicaciones(actor, { centroId }),
    buscarInsumos(actor, { limite: 20 }),
    insumoParam ? obtenerOpcionInsumo(actor, insumoParam) : null,
  ]);
  const ubicacionParam = textoParam(sp.ubicacion);
  const puedeMerma = puede(actor.rol, "movimientos:merma");
  const tipoParam = enumParam(sp.tipo, TIPOS_AJUSTE);
  const tipoInicial = tipoParam === "MERMA" && !puedeMerma ? null : tipoParam;
  const loteParam = textoParam(sp.lote);
  let ubicacionInicial = ubicaciones.some((u) => u.id === ubicacionParam) ? ubicacionParam : null;

  // Merma de un lote VENCIDO (enlace desde alertas o la ficha): se propone dar
  // de baja todo su saldo con motivo "Vencimiento"; la persona puede cambiarlo.
  let cantidadInicial: string | null = null;
  let motivoInicial: string | null = null;
  if (tipoInicial === "MERMA" && insumoInicial && loteParam) {
    const existencias = await detalleInsumo(actor, insumoInicial.id, { centroId })
      .then((d) => d.existencias)
      .catch((error: unknown) => {
        if (esErrorDominio(error)) return [];
        throw error;
      });
    const delLote = existencias.filter(
      (e) => e.loteId === loteParam && ubicaciones.some((u) => u.id === e.ubicacionId) && (!ubicacionInicial || e.ubicacionId === ubicacionInicial),
    );
    const vencida = delLote.length === 1 ? delLote[0] : undefined;
    if (vencida && vencida.estadoVencimiento === "VENCIDO" && vencida.cantidad > 0) {
      ubicacionInicial = vencida.ubicacionId;
      cantidadInicial = String(vencida.cantidad);
      motivoInicial = "Vencimiento";
    }
  }

  return (
    <>
      <PageHeader
        titulo="Ajuste o merma"
        descripcion={
          centro
            ? `Corrige el stock de ${centro.nombre} tras un conteo o da de baja insumos vencidos, dañados o perdidos.`
            : "Corrige el stock tras un conteo o da de baja insumos vencidos, dañados o perdidos."
        }
        volver={volver}
      />
      <AvisoCambioCentro centroId={centroId} nombre={centro?.nombre ?? null} />
      {ubicaciones.length === 0 ? (
        <EmptyState
          icono={MapPinOff}
          titulo="No hay ubicaciones activas"
          descripcion="Este centro no tiene bodegas ni salas activas donde ajustar stock."
        />
      ) : (
        <FormularioAjuste
          ubicaciones={ubicaciones}
          insumosIniciales={insumosIniciales}
          centroId={centroId}
          mostrarCentro={centro === null}
          hoy={hoyEnSantiago()}
          puedeMerma={puedeMerma}
          inicial={{
            tipo: tipoInicial,
            insumo: insumoInicial,
            ubicacionId: ubicacionInicial,
            loteId: loteParam,
            cantidad: cantidadInicial,
            motivo: motivoInicial,
          }}
        />
      )}
    </>
  );
}
