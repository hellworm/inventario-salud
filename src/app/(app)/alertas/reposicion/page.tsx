import type { Metadata } from "next";
import Link from "next/link";
import { Download, Mail, PackageCheck, Phone } from "lucide-react";
import { BotonImprimir } from "@/components/alertas/boton-imprimir";
import { BarraFiltros, FiltroCentro, FiltroSelect } from "@/components/admin/filtros-url";
import "@/components/alertas/impresion.css";
import { EnlaceComprar } from "@/components/proveedores/datos-proveedor";
import { BadgeEstadoStock, buttonClasses, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatearRut } from "@/lib/chile/rut";
import { formatearDia, formatearFechaHora } from "@/lib/fechas";
import { leerFiltros } from "@/lib/filtros-reportes";
import { formatearNumero, pluralizar } from "@/lib/formato";
import { construirHref, leerOpcion, resolverCentro } from "@/lib/parametros-url";
import { etiquetaAlcanceTotal } from "@/lib/permisos";
import { contextoPagina } from "@/server/auth/sesion";
import { pluralUnidad, unidadSegun } from "@/lib/unidades";
import {
  AGRUPACIONES_REPOSICION,
  listaReposicion,
  listarCategorias,
  type AlertaStock,
  type ProveedorEfectivo,
} from "@/server/servicios";
import { SinCentroActivo } from "@/components/shell/sin-centro";

export const metadata: Metadata = { title: "Lista de reposición" };

const numero = (valor: number | null) => (valor === null ? "—" : formatearNumero(valor));

const nombreProveedor = (p: ProveedorEfectivo | null) => (p ? `${p.razonSocial}${p.activo ? "" : " (inactivo)"}` : "Sin proveedor");

/**
 * Tabla de un grupo. `columna` es el dato que NO da el encabezado del grupo:
 * el proveedor (lista agrupada por centro) o el centro (agrupada por proveedor);
 * `null` si no hace falta (un solo centro).
 */
function TablaReposicion({ items, titulo, columna }: { items: AlertaStock[]; titulo: string; columna: "proveedor" | "centro" | null }) {
  const dato = (i: AlertaStock) => (columna === "proveedor" ? nombreProveedor(i.proveedor) : i.centro);
  return (
    <>
      {/* Tabla: escritorio e impresión */}
      <div className="hidden overflow-x-auto md:block print:block print:overflow-visible">
        <table className="w-full border-collapse text-sm print:text-[10pt]">
          <caption className="sr-only">{titulo}</caption>
          <thead>
            <tr className="border-b border-borde bg-superficie-2 text-left text-xs tracking-wide text-texto-suave uppercase print:border-b-2 print:border-texto print:bg-transparent print:text-[8pt] print:text-texto">
              <th scope="col" className="px-4 py-3 font-semibold xl:w-[30%] print:w-[30%] print:px-1.5 print:py-1.5">Insumo</th>
              {columna ? (
                <th scope="col" className="px-4 py-3 font-semibold max-xl:hidden print:table-cell print:px-1.5 print:py-1.5">
                  {columna === "proveedor" ? "Proveedor" : "Centro"}
                </th>
              ) : null}
              <th scope="col" className="px-4 py-3 font-semibold print:px-1.5 print:py-1.5">Estado</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold print:px-1.5 print:py-1.5">Disponible</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold print:px-1.5 print:py-1.5">Mínimo</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold max-xl:hidden print:table-cell print:px-1.5 print:py-1.5">Máximo</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold print:px-1.5 print:py-1.5">Falta mínimo</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold max-xl:hidden print:table-cell print:px-1.5 print:py-1.5">Falta máximo</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold print:px-1.5 print:py-1.5">Sugerido</th>
              <th scope="col" className="hidden w-[22mm] px-1.5 py-1.5 text-right font-semibold print:table-cell">Pedido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde print:divide-borde-fuerte">
            {items.map((i) => (
              <tr key={`${i.insumoId}:${i.centroId}`}>
                <th scope="row" className="px-4 text-left font-normal print:px-1.5">
                  {/* Todo el bloque es el enlace: objetivo táctil de más de 44 px de alto. */}
                  <Link href={`/inventario/${i.insumoId}`} className="group flex min-h-12 flex-col justify-center py-2 print:min-h-0 print:py-1.5 print:no-underline">
                    <span className="font-medium text-texto group-hover:text-marca-700">{i.nombre}</span>
                    <span className="text-xs text-texto-tenue print:text-[8pt] print:text-texto-suave">
                      {i.codigo} · {i.categoria} · en {pluralUnidad(i.unidadMedida)}
                    </span>
                    {/* Bajo xl no hay columna: el dato va bajo el nombre (en la hoja impresa sí hay columna). */}
                    {columna ? (
                      <span className="text-xs text-texto-suave xl:hidden print:hidden">
                        {columna === "proveedor" ? "Proveedor: " : "Centro: "}
                        {dato(i)}
                      </span>
                    ) : null}
                  </Link>
                </th>
                {columna ? (
                  <td className="px-4 py-3 text-texto-suave max-xl:hidden xl:min-w-44 print:table-cell print:min-w-0 print:px-1.5 print:py-1.5 print:text-texto" data-columna-reposicion={columna}>
                    {dato(i)}
                  </td>
                ) : null}
                <td className="px-4 py-3 print:px-1.5 print:py-1.5">
                  <span className="print:hidden">
                    <BadgeEstadoStock estado={i.tipo} />
                  </span>
                  <span className="hidden font-semibold whitespace-nowrap print:inline">{i.tipo === "SIN_STOCK" ? "SIN STOCK" : "Bajo mínimo"}</span>
                </td>
                <td className="cifras px-4 py-3 text-right print:px-1.5 print:py-1.5">{numero(i.disponible)}</td>
                <td className="cifras px-4 py-3 text-right print:px-1.5 print:py-1.5">{numero(i.stockMinimo)}</td>
                <td className="cifras px-4 py-3 text-right text-texto-suave max-xl:hidden print:table-cell print:px-1.5 print:py-1.5 print:text-texto">{numero(i.stockMaximo)}</td>
                <td className="cifras px-4 py-3 text-right print:px-1.5 print:py-1.5">{numero(i.faltante)}</td>
                <td className="cifras px-4 py-3 text-right text-texto-suave max-xl:hidden print:table-cell print:px-1.5 print:py-1.5 print:text-texto">{numero(i.faltaParaMaximo)}</td>
                <td className="cifras px-4 py-3 text-right font-semibold print:px-1.5 print:py-1.5">{numero(i.sugerido)}</td>
                <td className="hidden px-1.5 py-1.5 print:table-cell">
                  <span className="block h-[7mm] rounded-sm border border-borde-fuerte" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tarjetas: móvil */}
      <ul className="divide-y divide-borde md:hidden print:hidden" aria-label={titulo}>
        {items.map((i) => (
          <li key={`${i.insumoId}:${i.centroId}`} className="relative px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/inventario/${i.insumoId}`} className="text-[0.9375rem] font-semibold after:absolute after:inset-0">
                  {i.nombre}
                </Link>
                <p className="truncate text-xs text-texto-tenue">
                  {i.codigo} · {i.categoria}
                </p>
                {columna ? (
                  <p className="truncate text-xs text-texto-suave">
                    {columna === "proveedor" ? "Proveedor: " : "Centro: "}
                    {dato(i)}
                  </p>
                ) : null}
              </div>
              <BadgeEstadoStock estado={i.tipo} className="shrink-0" />
            </div>
            <dl className="mt-2.5 grid grid-cols-3 gap-x-3 text-sm">
              <div>
                <dt className="text-xs text-texto-tenue">Disponible</dt>
                <dd className="cifras">
                  {numero(i.disponible)} <span className="text-texto-tenue">de {numero(i.stockMinimo)}</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-texto-tenue">Falta (mínimo)</dt>
                <dd className="cifras">{numero(i.faltante)}</dd>
              </div>
              <div>
                <dt className="text-xs text-texto-tenue">Sugerido</dt>
                <dd className="cifras font-semibold">
                  {numero(i.sugerido)} <span className="font-normal text-texto-tenue">{unidadSegun(i.sugerido, i.unidadMedida)}</span>
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

export default async function PaginaReposicion({ searchParams }: PageProps<"/alertas/reposicion">) {
  const { sesion, actor, centroId: centroActivoId, centro, centros, sinCentro } = await contextoPagina("alertas:ver");
  if (sinCentro) return <SinCentroActivo titulo="Lista de reposición" />;
  const sp = await searchParams;
  const filtros = leerFiltros(sp);
  const centroId = resolverCentro(centroActivoId, centros, filtros.centro);
  // `?agrupar=proveedor`: un grupo por distribuidor, para armar un pedido a cada uno.
  const agrupar = leerOpcion(sp, "agrupar", AGRUPACIONES_REPOSICION) ?? "centro";

  const [lista, categorias] = await Promise.all([
    listaReposicion(actor, { centroId, categoriaId: filtros.categoriaId }),
    listarCategorias(actor),
  ]);
  const alcance = centro?.nombre ?? centros.find((c) => c.id === centroId)?.nombre ?? etiquetaAlcanceTotal(actor.rol);
  const categoria = categorias.find((c) => c.id === filtros.categoriaId)?.nombre;
  const hrefCsv = construirHref("/alertas/reposicion/exportar", {
    centro: centroId,
    categoria: filtros.categoriaId,
    agrupar: agrupar === "proveedor" ? "proveedor" : undefined,
  });
  const variosCentros = lista.grupos.length > 1;
  const resumen =
    lista.totalItems === 0
      ? "Nada que reponer"
      : `${pluralizar(lista.totalItems, "insumo")} por reponer · ${formatearNumero(lista.sinStock)} sin stock`;

  return (
    <div data-imprimible>
      {/* Un solo <h1> en el documento: en la hoja impresa queda el título y se ocultan el enlace, la descripción y los botones. */}
      <PageHeader
        className="print:mb-1 print:[&_a]:hidden print:[&_p]:hidden print:[&>div:last-child]:hidden print:[&_h1]:text-[18pt] print:[&_h1]:leading-tight"
        titulo="Lista de reposición"
        descripcion={
          <>
            {alcance} · {resumen}
          </>
        }
        volver={{ href: "/alertas", label: "Alertas" }}
        acciones={
          <>
            <BotonImprimir />
            {/* Descarga directa (Route Handler): no se navega con el router. */}
            <a href={hrefCsv} download className={buttonClasses()}>
              <Download aria-hidden />
              Exportar CSV
            </a>
          </>
        }
      />

      {/* Datos del documento impreso (en pantalla ya están en el encabezado y los filtros) */}
      <div className="mb-5 hidden border-b-2 border-texto pb-3 print:block">
        <p className="text-[10pt]">
          {alcance}
          {categoria ? ` · ${categoria}` : ""} · {resumen}
          {agrupar === "proveedor" ? " · agrupada por proveedor" : ""}
        </p>
        <p className="text-[9pt] text-texto-suave">
          RedInsumos · Generada el {formatearFechaHora(new Date())} por {sesion.usuario.nombre} · Stock disponible al{" "}
          {formatearDia(lista.dia)} (no incluye lotes vencidos)
        </p>
      </div>

      <BarraFiltros parametros={["categoria", "centro", "agrupar"]}>
        <FiltroSelect
          parametro="categoria"
          etiqueta="Categoría"
          todos="Todas"
          opciones={categorias.map((c) => ({ value: c.id, label: c.nombre }))}
        />
        <FiltroCentro centroActivoId={centroActivoId} centros={centros} />
        <FiltroSelect
          parametro="agrupar"
          etiqueta="Agrupar por"
          opciones={[
            { value: "centro", label: "Centro" },
            { value: "proveedor", label: "Proveedor" },
          ]}
        />
      </BarraFiltros>

      {lista.grupos.length === 0 ? (
        <EmptyState
          icono={PackageCheck}
          titulo="Nada que reponer"
          descripcion="Todos los insumos con stock mínimo definido están sobre su mínimo."
        />
      ) : agrupar === "proveedor" ? (
        <div className="space-y-4 print:space-y-6" data-agrupada-por="proveedor">
          {lista.porProveedor.map((g) => (
            <Card
              key={g.proveedor?.id ?? "sin-proveedor"}
              relleno={false}
              className="overflow-hidden print:rounded-none print:border-0 print:shadow-none"
              data-grupo-proveedor={g.proveedor?.id ?? "sin"}
            >
              <div className="p-4 sm:px-5 print:px-0 print:pt-0 print:pb-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 className="text-base font-semibold tracking-tight print:text-[12pt]">
                    {g.proveedor ? g.proveedor.razonSocial : "Sin proveedor definido"}
                    {g.proveedor && !g.proveedor.activo ? <span className="font-normal text-texto-suave"> (inactivo)</span> : null}
                  </h2>
                  <p className="text-sm text-texto-suave print:text-[9pt]">{pluralizar(g.items.length, "insumo")} por reponer</p>
                </div>
                {g.proveedor ? (
                  <>
                    {/* Pantalla: enlaces para llamar, escribir o ir a comprar. */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm print:hidden">
                      {g.proveedor.telefono ? (
                        <a href={`tel:${g.proveedor.telefono.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-11 items-center gap-1.5 text-marca-700 underline-offset-4 hover:underline pointer-fine:min-h-8">
                          <Phone className="size-4 shrink-0 text-texto-tenue" aria-hidden />
                          <span className="cifras">{g.proveedor.telefono}</span>
                        </a>
                      ) : null}
                      {g.proveedor.email ? (
                        <a href={`mailto:${g.proveedor.email}`} className="inline-flex min-h-11 min-w-0 items-center gap-1.5 text-marca-700 underline-offset-4 hover:underline pointer-fine:min-h-8">
                          <Mail className="size-4 shrink-0 text-texto-tenue" aria-hidden />
                          <span className="min-w-0 break-all">{g.proveedor.email}</span>
                        </a>
                      ) : null}
                      <EnlaceComprar proveedor={g.proveedor} />
                    </div>
                    {/* Hoja impresa: los datos para hacer el pedido, en el encabezado del grupo. */}
                    <p className="mt-0.5 hidden text-[9pt] text-texto-suave print:block" data-contacto-impreso>
                      {[
                        `RUT ${formatearRut(g.proveedor.rut)}`,
                        g.proveedor.telefono ? `Tel. ${g.proveedor.telefono}` : null,
                        g.proveedor.email,
                        g.proveedor.contacto ? `Contacto: ${g.proveedor.contacto}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </>
                ) : (
                  <p className="mt-0.5 text-sm text-texto-suave print:text-[9pt]">
                    Estos insumos no tienen proveedor: defínelo en la ficha de cada insumo.
                  </p>
                )}
              </div>
              <TablaReposicion
                items={g.items}
                titulo={`Reposición de ${g.proveedor ? g.proveedor.razonSocial : "insumos sin proveedor"}`}
                columna={variosCentros ? "centro" : null}
              />
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4 print:space-y-6" data-agrupada-por="centro">
          {lista.grupos.map((g) => (
            <Card key={g.centroId} relleno={false} className="overflow-hidden print:rounded-none print:border-0 print:shadow-none">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4 sm:px-5 print:px-0 print:pt-0 print:pb-2">
                <h2 className="text-base font-semibold tracking-tight print:text-[12pt]">{g.centro}</h2>
                <p className="text-sm text-texto-suave print:text-[9pt]">{pluralizar(g.items.length, "insumo")} por reponer</p>
              </div>
              <TablaReposicion items={g.items} titulo={`Reposición de ${g.centro}`} columna="proveedor" />
            </Card>
          ))}
        </div>
      )}

      <p className="mt-4 max-w-3xl text-sm text-texto-suave print:mt-5 print:text-[8.5pt]">
        <strong className="font-semibold text-texto">Sugerido</strong>: cantidad para llegar al stock máximo; si el insumo no tiene
        máximo definido, la que falta para el mínimo. Cada cantidad va en la unidad de medida del insumo. Solo aparecen insumos con stock mínimo configurado en el centro.
      </p>

      {/* Firmas: solo en la hoja impresa */}
      <div className="mt-14 hidden grid-cols-2 gap-12 text-[9pt] text-texto-suave print:grid" data-no-cortar>
        <p className="border-t border-texto pt-1.5">Preparado por</p>
        <p className="border-t border-texto pt-1.5">Aprobado por</p>
      </div>
    </div>
  );
}
