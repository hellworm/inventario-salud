import type { Metadata } from "next";
import { MapPinOff } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui";
import { hoyEnSantiago } from "@/lib/fechas";
import { enumParam, textoParam } from "@/lib/parametros";
import { puede } from "@/lib/permisos";
import { contextoPagina } from "@/server/auth/sesion";
import { buscarInsumos, listarUbicaciones, obtenerOpcionInsumo } from "@/server/servicios";
import { FormularioAjuste } from "./formulario-ajuste";
import { TIPOS_AJUSTE } from "./tipos";

export const metadata: Metadata = { title: "Ajuste o merma" };

export default async function PaginaAjuste({ searchParams }: PageProps<"/movimientos/ajuste">) {
  const { actor, centroId, centro } = await contextoPagina("movimientos:ajuste");
  const sp = await searchParams;
  const insumoParam = textoParam(sp.insumo);
  const [ubicaciones, insumosIniciales, insumoInicial] = await Promise.all([
    listarUbicaciones(actor, { centroId }),
    buscarInsumos(actor, { limite: 20 }),
    insumoParam ? obtenerOpcionInsumo(actor, insumoParam) : null,
  ]);
  const ubicacionParam = textoParam(sp.ubicacion);
  const puedeMerma = puede(actor.rol, "movimientos:merma");
  const tipoParam = enumParam(sp.tipo, TIPOS_AJUSTE);

  return (
    <>
      <PageHeader
        titulo="Ajuste o merma"
        descripcion={
          centro
            ? `Corrige el stock de ${centro.nombre} tras un conteo o da de baja insumos vencidos, dañados o perdidos.`
            : "Corrige el stock tras un conteo o da de baja insumos vencidos, dañados o perdidos."
        }
        volver={{ href: "/inventario", label: "Inventario" }}
      />
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
            tipo: tipoParam === "MERMA" && !puedeMerma ? null : tipoParam,
            insumo: insumoInicial,
            ubicacionId: ubicaciones.some((u) => u.id === ubicacionParam) ? ubicacionParam : null,
            loteId: textoParam(sp.lote),
          }}
        />
      )}
    </>
  );
}
