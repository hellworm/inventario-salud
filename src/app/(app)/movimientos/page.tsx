import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { buttonClasses, PageHeader } from "@/components/ui";
import { TIPOS_MOVIMIENTO } from "@/lib/estados";
import { diaParam, enumParam, paginaParam, textoParam } from "@/lib/parametros";
import { puede } from "@/lib/permisos";
import { contextoPagina } from "@/server/auth/sesion";
import {
  buscarInsumos,
  listarMovimientos,
  listarUbicaciones,
  obtenerMovimiento,
  obtenerOpcionInsumo,
  obtenerTraslado,
  usuariosConMovimientos,
} from "@/server/servicios";
import { VistaMovimientos } from "./vista-movimientos";

export const metadata: Metadata = { title: "Movimientos" };

export default async function PaginaMovimientos({ searchParams }: PageProps<"/movimientos">) {
  const { actor, centroId, centro } = await contextoPagina("movimientos:ver");
  const sp = await searchParams;
  const insumoParam = textoParam(sp.insumo);
  const movId = textoParam(sp.mov);

  const [ubicaciones, usuarios, insumosIniciales, insumoFiltro] = await Promise.all([
    // Incluye ubicaciones inactivas: pueden tener historial.
    listarUbicaciones(actor, { centroId, soloActivas: false }),
    usuariosConMovimientos(actor, { centroId }),
    buscarInsumos(actor, { limite: 20 }),
    insumoParam ? obtenerOpcionInsumo(actor, insumoParam) : null,
  ]);
  const filtros = {
    q: textoParam(sp.q) ?? "",
    tipo: enumParam(sp.tipo, TIPOS_MOVIMIENTO) ?? "",
    desde: diaParam(sp.desde) ?? "",
    hasta: diaParam(sp.hasta) ?? "",
    ubicacion: ubicaciones.find((u) => u.id === textoParam(sp.ubicacion))?.id ?? "",
    usuario: usuarios.find((u) => u.id === textoParam(sp.usuario))?.id ?? "",
    insumo: insumoFiltro?.id ?? "",
  } as const;

  const movimientos = await listarMovimientos(actor, {
    centroId,
    texto: filtros.q,
    tipo: filtros.tipo || null,
    desde: filtros.desde,
    hasta: filtros.hasta,
    ubicacionId: filtros.ubicacion,
    usuarioId: filtros.usuario,
    insumoId: filtros.insumo,
    pagina: paginaParam(sp.pagina),
  });

  // Detalle abierto (`?mov=`): se toma de la página actual o se busca por id.
  const detalle = movId ? (movimientos.items.find((m) => m.id === movId) ?? (await obtenerMovimiento(actor, movId))) : null;
  const traslado = detalle?.trasladoGrupoId ? await obtenerTraslado(actor, detalle.trasladoGrupoId) : [];

  const puedeIngresar = puede(actor.rol, "movimientos:ingreso");
  const puedeRetirar = puede(actor.rol, "movimientos:retiro");

  return (
    <>
      <PageHeader
        titulo="Movimientos"
        descripcion={
          centro
            ? `Historial de entradas y salidas de ${centro.nombre}. Cada registro es permanente.`
            : "Historial de entradas y salidas de toda la red. Cada registro es permanente."
        }
        acciones={
          puedeIngresar || puedeRetirar ? (
            <>
              {puedeRetirar ? (
                <Link href="/movimientos/retiro" className={buttonClasses({ variant: "secundario" })}>
                  <ArrowUpFromLine aria-hidden />
                  Retirar
                </Link>
              ) : null}
              {puedeIngresar ? (
                <Link href="/movimientos/ingreso" className={buttonClasses()}>
                  <ArrowDownToLine aria-hidden />
                  Ingresar
                </Link>
              ) : null}
            </>
          ) : undefined
        }
      />
      <VistaMovimientos
        movimientos={movimientos}
        ubicaciones={ubicaciones}
        usuarios={usuarios}
        insumosIniciales={insumosIniciales}
        insumoFiltro={insumoFiltro}
        filtros={filtros}
        movId={movId}
        detalle={detalle}
        traslado={traslado}
        mostrarCentro={centro === null}
      />
    </>
  );
}
