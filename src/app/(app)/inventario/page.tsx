import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { buttonClasses, PageHeader } from "@/components/ui";
import { enumParam, paginaParam, textoParam } from "@/lib/parametros";
import { fraseAlcanceTotal, puede } from "@/lib/permisos";
import { contextoPagina } from "@/server/auth/sesion";
import { esErrorDominio } from "@/server/errores";
import {
  detalleInsumo,
  FILTROS_ESTADO_INVENTARIO,
  listarCategorias,
  listarInventario,
  listarUbicaciones,
  ORDENES_INVENTARIO,
  type DetalleInsumo,
} from "@/server/servicios";
import { VistaInventario } from "./vista-inventario";
import { SinCentroActivo } from "@/components/shell/sin-centro";

export const metadata: Metadata = { title: "Inventario" };

export default async function PaginaInventario({ searchParams }: PageProps<"/inventario">) {
  const { actor, centroId, centro, sinCentro } = await contextoPagina("inventario:ver");
  if (sinCentro) return <SinCentroActivo titulo="Inventario" />;
  const sp = await searchParams;
  const verId = textoParam(sp.ver);

  const [categorias, ubicaciones] = await Promise.all([listarCategorias(actor), listarUbicaciones(actor, { centroId })]);
  const filtros = {
    q: textoParam(sp.q) ?? "",
    categoria: categorias.find((c) => c.id === textoParam(sp.categoria))?.id ?? "",
    ubicacion: ubicaciones.find((u) => u.id === textoParam(sp.ubicacion))?.id ?? "",
    estado: enumParam(sp.estado, FILTROS_ESTADO_INVENTARIO) ?? "",
    orden: enumParam(sp.orden, ORDENES_INVENTARIO) ?? "",
  } as const;

  const [inventario, detalle] = await Promise.all([
    listarInventario(actor, {
      centroId,
      texto: filtros.q,
      categoriaId: filtros.categoria,
      ubicacionId: filtros.ubicacion,
      estado: filtros.estado || null,
      orden: filtros.orden || null,
      pagina: paginaParam(sp.pagina),
    }),
    verId
      ? detalleInsumo(actor, verId, { centroId }).catch((error: unknown): DetalleInsumo | null => {
          if (esErrorDominio(error) && error.codigo === "NO_ENCONTRADO") return null;
          throw error;
        })
      : null,
  ]);

  const puedeIngresar = puede(actor.rol, "movimientos:ingreso");
  const puedeRetirar = puede(actor.rol, "movimientos:retiro");

  return (
    <>
      <PageHeader
        titulo="Inventario"
        descripcion={
          centro
            ? `Qué hay en ${centro.nombre}: cantidades, lotes, vencimientos y dónde está cada cosa.`
            : `Qué hay en ${fraseAlcanceTotal(actor.rol)}: cantidades, lotes, vencimientos y dónde está cada cosa.`
        }
        acciones={
          puedeIngresar || puedeRetirar ? (
            <>
              {puedeRetirar ? (
                <Link href="/movimientos/retiro" className={buttonClasses({ variant: "secundario" })}>
                  <ArrowUpFromLine aria-hidden />
                  Registrar retiro
                </Link>
              ) : null}
              {puedeIngresar ? (
                <Link href="/movimientos/ingreso" className={buttonClasses()}>
                  <ArrowDownToLine aria-hidden />
                  Registrar ingreso
                </Link>
              ) : null}
            </>
          ) : undefined
        }
      />
      <VistaInventario
        inventario={inventario}
        categorias={categorias}
        ubicaciones={ubicaciones}
        filtros={filtros}
        verId={verId}
        detalle={detalle}
        mostrarCentro={centro === null}
        permisos={{
          ingresar: puedeIngresar,
          retirar: puedeRetirar,
          darDeBaja: puede(actor.rol, "movimientos:merma"),
          trasladar: puede(actor.rol, "movimientos:traslado"),
        }}
      />
    </>
  );
}
