import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { redirect } from "next/navigation";
import { buttonClasses, PageHeader } from "@/components/ui";
import { FILTRO_SIN_PROVEEDOR } from "@/lib/esquemas/proveedor-insumo";
import { escribirSemaforo, ESTADOS_STOCK, leerSemaforo } from "@/lib/estados";
import { construirHref } from "@/lib/parametros-url";
import { enumParam, paginaParam, textoParam } from "@/lib/parametros";
import { fraseAlcanceTotal, puede } from "@/lib/permisos";
import { contextoPagina } from "@/server/auth/sesion";
import { esErrorDominio } from "@/server/errores";
import {
  detalleInsumo,
  detalleProveedorInsumo,
  listarCategorias,
  listarInventario,
  listarProveedoresActivos,
  listarUbicaciones,
  ORDENES_INVENTARIO,
  type DetalleInsumo,
  type DetalleProveedorInsumo,
} from "@/server/servicios";
import { VistaInventario } from "./vista-inventario";
import { SinCentroActivo } from "@/components/shell/sin-centro";

export const metadata: Metadata = { title: "Inventario" };

export default async function PaginaInventario({ searchParams }: PageProps<"/inventario">) {
  const { actor, centroId, centro, sinCentro } = await contextoPagina("inventario:ver");
  if (sinCentro) return <SinCentroActivo titulo="Inventario" />;
  const sp = await searchParams;
  const verId = textoParam(sp.ver);

  // Enlaces antiguos: `?estado=POR_VENCER|VENCIDO` ahora es el filtro de semáforo.
  const estadoPedido = textoParam(sp.estado);
  if (estadoPedido === "POR_VENCER" || estadoPedido === "VENCIDO") {
    const resto: Record<string, string | undefined> = {};
    for (const clave of ["q", "categoria", "ubicacion", "proveedor", "orden", "ver"] as const) resto[clave] = textoParam(sp[clave]) ?? undefined;
    redirect(construirHref("/inventario", { ...resto, semaforo: estadoPedido === "VENCIDO" ? "vencido" : "rojo,amarillo" }));
  }

  const [categorias, ubicaciones, proveedores] = await Promise.all([
    listarCategorias(actor),
    listarUbicaciones(actor, { centroId }),
    puede(actor.rol, "proveedores:ver") ? listarProveedoresActivos(actor) : [],
  ]);
  const proveedorPedido = textoParam(sp.proveedor);
  const filtros = {
    q: textoParam(sp.q) ?? "",
    categoria: categorias.find((c) => c.id === textoParam(sp.categoria))?.id ?? "",
    ubicacion: ubicaciones.find((u) => u.id === textoParam(sp.ubicacion))?.id ?? "",
    // Proveedor efectivo: uno activo o "sin" (insumos sin proveedor definido).
    proveedor: proveedorPedido === FILTRO_SIN_PROVEEDOR ? FILTRO_SIN_PROVEEDOR : (proveedores.find((p) => p.id === proveedorPedido)?.id ?? ""),
    estado: enumParam(sp.estado, ESTADOS_STOCK) ?? "",
    semaforo: escribirSemaforo(leerSemaforo(textoParam(sp.semaforo))) ?? "",
    orden: enumParam(sp.orden, ORDENES_INVENTARIO) ?? "",
  } as const;

  const siNoExiste = <T,>(error: unknown): T | null => {
    if (esErrorDominio(error) && error.codigo === "NO_ENCONTRADO") return null;
    throw error;
  };
  const [inventario, detalle, proveedorDetalle] = await Promise.all([
    listarInventario(actor, {
      centroId,
      texto: filtros.q,
      categoriaId: filtros.categoria,
      ubicacionId: filtros.ubicacion,
      proveedorId: filtros.proveedor || null,
      estado: filtros.estado || null,
      semaforo: leerSemaforo(filtros.semaforo),
      orden: filtros.orden || null,
      pagina: paginaParam(sp.pagina),
    }),
    verId ? detalleInsumo(actor, verId, { centroId }).catch((error: unknown) => siNoExiste<DetalleInsumo>(error)) : null,
    verId && puede(actor.rol, "proveedores:ver")
      ? detalleProveedorInsumo(actor, verId, { centroId }).catch((error: unknown) => siNoExiste<DetalleProveedorInsumo>(error))
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
        proveedores={proveedores}
        filtros={filtros}
        verId={verId}
        detalle={detalle}
        proveedorDetalle={proveedorDetalle}
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
