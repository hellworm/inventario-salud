import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { SinCentroActivo } from "@/components/shell/sin-centro";
import { hrefIngresoEscaneado } from "@/lib/escaneo";
import { normalizarNumeroLote } from "@/lib/esquemas/movimientos";
import { RE_CODIGO_BARRAS } from "@/lib/esquemas/catalogo";
import { LARGO_MAXIMO_CODIGO } from "@/lib/gs1";
import { diaParam, limpiarTexto, textoParam } from "@/lib/parametros";
import { puede } from "@/lib/permisos";
import { contextoPagina } from "@/server/auth/sesion";
import { buscarInsumoPorCodigo, buscarInsumos, listarUbicaciones } from "@/server/servicios";
import { volverDeFormulario } from "../volver";
import { VistaEscanear } from "./vista-escanear";

export const metadata: Metadata = { title: "Escanear para ingresar" };

/**
 * Escanear para ingresar.
 *  - Sin `?codigo=`: abre la cámara o permite escribir el código (lector USB).
 *  - Con `?codigo=`: busca el insumo EN EL SERVIDOR. Si coincide exactamente con
 *    un insumo activo, redirige al ingreso prellenado (insumo, lote y fechas);
 *    si no, muestra "No reconocemos este código" con las salidas posibles.
 * Los datos del código (`lote`, `vence`, `fab`) llegan como parámetros simples
 * y se validan aquí uno por uno.
 */
export default async function PaginaEscanear({ searchParams }: PageProps<"/movimientos/escanear">) {
  const { actor, centroId, centro, sinCentro } = await contextoPagina("movimientos:ingreso");
  if (sinCentro) return <SinCentroActivo titulo="Escanear para ingresar" />;
  const sp = await searchParams;
  const volver = await volverDeFormulario(sp.volver);

  const codigoPedido = typeof sp.codigo === "string" ? limpiarTexto(sp.codigo, LARGO_MAXIMO_CODIGO) : "";
  const loteLeido = textoParam(sp.lote);
  const datos = {
    lote: loteLeido ? normalizarNumeroLote(loteLeido).slice(0, 60) || null : null,
    vence: diaParam(sp.vence),
    fab: diaParam(sp.fab),
  };
  const ubicaciones = await listarUbicaciones(actor, { centroId });
  const ubicacionPedida = textoParam(sp.ubicacion);
  const ubicacion = ubicaciones.some((u) => u.id === ubicacionPedida) ? ubicacionPedida : null;

  const busqueda = codigoPedido ? await buscarInsumoPorCodigo(actor, codigoPedido) : null;
  const activos = busqueda?.coincidencias.filter((c) => c.activo) ?? [];
  if (busqueda?.codigo && activos.length === 1 && busqueda.coincidencias.length === 1) {
    // (a) El código coincide con un insumo: al ingreso, con lote y vencimiento si venían.
    redirect(hrefIngresoEscaneado(activos[0]!.id, { ...datos, ubicacion }));
  }

  const insumosIniciales = busqueda ? await buscarInsumos(actor, { limite: 20 }) : [];
  const codigo = busqueda?.codigo ?? null;

  return (
    <>
      <PageHeader
        titulo="Escanear para ingresar"
        descripcion={
          centro
            ? `Lee el código del envase para registrar su ingreso en ${centro.nombre}.`
            : "Lee el código del envase para registrar su ingreso."
        }
        volver={volver}
      />
      <VistaEscanear
        pedido={codigoPedido || null}
        codigo={codigo ? { codigo: codigo.codigo, tipo: codigo.tipo } : null}
        datos={datos}
        ubicacion={ubicacion}
        coincidencias={busqueda?.coincidencias ?? []}
        insumosIniciales={insumosIniciales}
        puedeGestionarCatalogo={puede(actor.rol, "catalogo:gestionar")}
        // Solo se puede guardar en el insumo un código con los caracteres que admite el catálogo.
        codigoGuardable={codigo !== null && codigo.codigo.length <= 64 && RE_CODIGO_BARRAS.test(codigo.codigo)}
      />
    </>
  );
}
