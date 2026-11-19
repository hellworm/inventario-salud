import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Boxes, ScrollText } from "lucide-react";
import { BotonCambiarActivo } from "@/components/admin/boton-cambiar-activo";
import { BotonEliminarInsumo } from "@/components/admin/boton-eliminar-insumo";
import { FormularioInsumo } from "@/components/admin/formulario-insumo";
import { TablaParametros } from "@/components/admin/tabla-parametros";
import { Alert, BadgeActivo, buttonClasses, Card, CardHeader, PageHeader } from "@/components/ui";
import { formatearFechaHora } from "@/lib/fechas";
import type { Actor } from "@/lib/permisos";
import { cantidadConUnidad } from "@/lib/unidades";
import { contextoPagina, obtenerSesion } from "@/server/auth/sesion";
import { esErrorDominio } from "@/server/errores";
import { listarCategorias, obtenerInsumoAdmin, type InsumoAdmin } from "@/server/servicios";

/** Una sola lectura por solicitud: la comparten el título de la pestaña y la página. */
const cargarInsumo = cache((actor: Actor, insumoId: string) => obtenerInsumoAdmin(actor, insumoId));

/** Título de la pestaña con el nombre real del insumo (sin revelar nada a quien no puede verlo). */
export async function generateMetadata({ params }: PageProps<"/admin/insumos/[insumoId]">): Promise<Metadata> {
  const sesion = await obtenerSesion();
  if (!sesion) return { title: "Editar insumo" };
  try {
    const { insumoId } = await params;
    const insumo = await cargarInsumo(sesion.actor, insumoId);
    return { title: `${insumo.nombre} · Editar insumo` };
  } catch {
    return { title: "Editar insumo" };
  }
}

export default async function PaginaEditarInsumo({ params }: PageProps<"/admin/insumos/[insumoId]">) {
  const { actor } = await contextoPagina("catalogo:gestionar");
  const { insumoId } = await params;

  let insumo: InsumoAdmin;
  try {
    insumo = await cargarInsumo(actor, insumoId);
  } catch (error) {
    if (esErrorDominio(error) && error.codigo === "NO_ENCONTRADO") notFound();
    throw error;
  }
  const categorias = await listarCategorias(actor);

  return (
    <>
      <PageHeader
        titulo={insumo.nombre}
        descripcion={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="cifras">{insumo.codigo}</span>
            <BadgeActivo activo={insumo.activo} />
            <span>
              {insumo.stockTotal > 0
                ? `Stock en la red: ${cantidadConUnidad(insumo.stockTotal, insumo.unidadMedida)}`
                : "Sin stock en la red"}
            </span>
          </span>
        }
        volver={{ href: "/admin/insumos", label: "Insumos" }}
        acciones={
          <Link href={`/inventario/${insumo.id}`} className={buttonClasses({ variant: "secundario" })}>
            <Boxes aria-hidden />
            Ver en inventario
          </Link>
        }
      />

      {!insumo.activo ? (
        <Alert tono="alerta" titulo="Insumo inactivo" className="mb-4">
          No aparece al registrar ingresos. Reactívalo más abajo si se vuelve a usar.
        </Alert>
      ) : null}

      <div className="space-y-4">
        <Card className="sm:p-6">
          <CardHeader
            titulo="Datos del insumo"
            descripcion="Se guardan con el botón «Guardar datos del insumo», aparte de los mínimos y máximos."
            className="mb-5"
          />
          <FormularioInsumo
            insumo={{
              id: insumo.id,
              codigo: insumo.codigo,
              nombre: insumo.nombre,
              descripcion: insumo.descripcion,
              categoriaId: insumo.categoriaId,
              unidadMedida: insumo.unidadMedida,
              presentacion: insumo.presentacion,
              fabricante: insumo.fabricante,
              registroSanitario: insumo.registroSanitario,
              codigoBarras: insumo.codigoBarras,
              requiereCadenaFrio: insumo.requiereCadenaFrio,
              controlaVencimiento: insumo.controlaVencimiento,
            }}
            categorias={categorias}
          />
        </Card>

        <Card className="sm:p-6" id="parametros">
          <CardHeader
            titulo="Stock mínimo y máximo por centro"
            descripcion="Cuando el stock disponible de un centro baja del mínimo, aparece en Alertas. El máximo es una referencia para no sobrestockear. Esta sección se guarda con su propio botón."
          />
          <TablaParametros
            insumoId={insumo.id}
            unidadMedida={insumo.unidadMedida}
            filas={insumo.parametros}
          />
        </Card>

        <Card className="sm:p-6">
          <CardHeader
            titulo="Estado e historial"
            descripcion={
              insumo.tieneHistoria
                ? "Este insumo tiene movimientos registrados: no se puede eliminar, pero sí desactivar."
                : "Este insumo aún no tiene movimientos. Si lo creaste por error puedes eliminarlo."
            }
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <BotonCambiarActivo
              entidad="insumo"
              id={insumo.id}
              nombre={insumo.nombre}
              activo={insumo.activo}
              aviso={
                insumo.activo && insumo.stockTotal > 0
                  ? `Aún hay ${cantidadConUnidad(insumo.stockTotal, insumo.unidadMedida)} en stock: se podrán seguir retirando.`
                  : undefined
              }
            />
            <Link
              href={`/admin/auditoria?entidad=Insumo&entidadId=${insumo.id}`}
              className={buttonClasses({ variant: "secundario" })}
            >
              <ScrollText aria-hidden />
              Ver historial de cambios
            </Link>
            {!insumo.tieneHistoria ? <BotonEliminarInsumo id={insumo.id} nombre={insumo.nombre} /> : null}
          </div>
          <p className="mt-4 text-sm text-texto-tenue">
            Creado el {formatearFechaHora(insumo.creadoEn)} · Última modificación {formatearFechaHora(insumo.actualizadoEn)}
          </p>
        </Card>
      </div>
    </>
  );
}
