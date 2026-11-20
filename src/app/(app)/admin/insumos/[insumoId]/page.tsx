import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Boxes, ScrollText } from "lucide-react";
import { BotonCambiarActivo } from "@/components/admin/boton-cambiar-activo";
import { BotonEliminarInsumo } from "@/components/admin/boton-eliminar-insumo";
import { FormularioInsumo } from "@/components/admin/formulario-insumo";
import { BotonCambiarProveedor } from "@/components/proveedores/cambiar-proveedor";
import { BloqueProveedor } from "@/components/proveedores/datos-proveedor";
import { TablaParametros } from "@/components/admin/tabla-parametros";
import { Alert, BadgeActivo, buttonClasses, Card, CardHeader, PageHeader } from "@/components/ui";
import { formatearFechaHora } from "@/lib/fechas";
import { puede, veTodaLaRed, type Actor } from "@/lib/permisos";
import { cantidadConUnidad } from "@/lib/unidades";
import { AvisoCatalogoCompartido } from "@/components/admin/aviso-catalogo-compartido";
import { contextoPagina, obtenerSesion } from "@/server/auth/sesion";
import { esErrorDominio } from "@/server/errores";
import {
  detalleProveedorInsumo,
  listarCategorias,
  listarOpcionesInstitucion,
  listarProveedoresActivos,
  obtenerInsumoAdmin,
  type InsumoAdmin,
} from "@/server/servicios";

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
  const { actor } = await contextoPagina("catalogo:crear");
  // Los datos del insumo son de toda la red: solo el administrador de la red los
  // modifica. Un administrador de institución los ve y gestiona SUS mínimos y máximos.
  const puedeModificar = puede(actor.rol, "catalogo:gestionar");
  const esRed = veTodaLaRed(actor);
  const { insumoId } = await params;

  let insumo: InsumoAdmin;
  try {
    insumo = await cargarInsumo(actor, insumoId);
  } catch (error) {
    if (esErrorDominio(error) && error.codigo === "NO_ENCONTRADO") notFound();
    throw error;
  }
  const [categorias, proveedores, proveedor, instituciones] = await Promise.all([
    listarCategorias(actor),
    listarProveedoresActivos(actor),
    detalleProveedorInsumo(actor, insumoId),
    esRed ? listarOpcionesInstitucion(actor) : [],
  ]);

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
                ? `Stock en ${esRed ? "la red" : "tu institución"}: ${cantidadConUnidad(insumo.stockTotal, insumo.unidadMedida)}`
                : `Sin stock en ${esRed ? "la red" : "tu institución"}`}
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
          No aparece al registrar ingresos. {puedeModificar ? "Reactívalo más abajo si se vuelve a usar." : "Si se vuelve a usar, pide al administrador de la red que lo reactive."}
        </Alert>
      ) : null}

      <div className="space-y-4">
        {puedeModificar ? (
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
              proveedorId: insumo.proveedorId,
            }}
            categorias={categorias}
            proveedores={proveedores}
            proveedorInactivo={proveedor.red && !proveedor.red.activo ? { id: proveedor.red.id, razonSocial: proveedor.red.razonSocial } : null}
          />
        </Card>
        ) : (
          <Card className="sm:p-6">
            <CardHeader titulo="Datos del insumo" className="mb-4" />
            <AvisoCatalogoCompartido que="insumo" className="mb-5" />
            <dl className="grid gap-x-6 gap-y-4 text-[0.9375rem] sm:grid-cols-2 xl:grid-cols-3" data-insumo-solo-lectura>
              {(
                [
                  ["Código", insumo.codigo],
                  ["Nombre", insumo.nombre],
                  ["Categoría", categorias.find((c) => c.id === insumo.categoriaId)?.nombre ?? "—"],
                  ["Unidad de medida", insumo.unidadMedida],
                  ["Presentación", insumo.presentacion ?? "—"],
                  ["Fabricante", insumo.fabricante ?? "—"],
                  ["Registro sanitario ISP", insumo.registroSanitario ?? "—"],
                  ["Código de barras", insumo.codigoBarras ?? "—"],
                  ["Requiere cadena de frío", insumo.requiereCadenaFrio ? "Sí" : "No"],
                  ["Controla vencimiento", insumo.controlaVencimiento ? "Sí" : "No"],
                  [
                    "Proveedor predeterminado de la red",
                    proveedor.red ? `${proveedor.red.razonSocial}${proveedor.red.activo ? "" : " (inactivo)"}` : "Sin definir",
                  ],
                ] as const
              ).map(([etiqueta, valor]) => (
                <div key={etiqueta} className="min-w-0">
                  <dt className="text-sm text-texto-suave">{etiqueta}</dt>
                  <dd className="font-medium break-words text-texto">{valor}</dd>
                </div>
              ))}
              {insumo.descripcion ? (
                <div className="min-w-0 sm:col-span-2 xl:col-span-3">
                  <dt className="text-sm text-texto-suave">Descripción</dt>
                  <dd className="break-words text-texto">{insumo.descripcion}</dd>
                </div>
              ) : null}
            </dl>
          </Card>
        )}

        <Card className="sm:p-6" id="proveedor">
          <CardHeader
            titulo={esRed ? "Proveedor por institución" : "Proveedor de tu institución"}
            descripcion={
              esRed
                ? "El predeterminado de la red se edita arriba, en los datos del insumo. Aquí puedes definir un proveedor propio para una institución: vale solo para ella."
                : "Si tu institución le compra este insumo a otro proveedor, defínelo aquí: sobrescribe el predeterminado de la red solo para tu institución. Se guarda de inmediato."
            }
          />
          <div className="max-w-xl">
            <BloqueProveedor
              detalle={proveedor}
              acciones={
                <BotonCambiarProveedor
                  insumo={{ id: insumo.id, nombre: insumo.nombre }}
                  detalle={proveedor}
                  proveedores={proveedores}
                  instituciones={instituciones.filter((i) => i.activo)}
                />
              }
            />
          </div>
        </Card>

        <Card className="sm:p-6" id="parametros">
          <CardHeader
            titulo="Stock mínimo y máximo por centro"
            descripcion={`Cuando el stock disponible de un centro baja del mínimo, aparece en Alertas. El máximo es una referencia para no sobrestockear. Esta sección se guarda con su propio botón.${esRed ? "" : " Solo ves los centros de tu institución."}`}
          />
          <TablaParametros
            insumoId={insumo.id}
            unidadMedida={insumo.unidadMedida}
            filas={insumo.parametros}
            mostrarInstitucion={esRed && new Set(insumo.parametros.map((p) => p.institucion)).size > 1}
          />
        </Card>

        {puedeModificar ? (
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
        ) : null}
      </div>
    </>
  );
}
