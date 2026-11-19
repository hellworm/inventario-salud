import type { Metadata } from "next";
import Link from "next/link";
import { Download, PackageCheck } from "lucide-react";
import { BotonImprimir } from "@/components/alertas/boton-imprimir";
import { BarraFiltros, FiltroCentro, FiltroSelect } from "@/components/admin/filtros-url";
import "@/components/alertas/impresion.css";
import { BadgeEstadoStock, buttonClasses, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatearDia, formatearFechaHora } from "@/lib/fechas";
import { leerFiltros } from "@/lib/filtros-reportes";
import { formatearNumero, pluralizar } from "@/lib/formato";
import { construirHref, resolverCentro } from "@/lib/parametros-url";
import { contextoPagina } from "@/server/auth/sesion";
import { pluralUnidad, unidadSegun } from "@/lib/unidades";
import { listaReposicion, listarCategorias, type AlertaStock } from "@/server/servicios";

export const metadata: Metadata = { title: "Lista de reposición" };

const numero = (valor: number | null) => (valor === null ? "—" : formatearNumero(valor));

function TablaReposicion({ items, titulo }: { items: AlertaStock[]; titulo: string }) {
  return (
    <>
      {/* Tabla: escritorio e impresión */}
      <div className="hidden overflow-x-auto md:block print:block print:overflow-visible">
        <table className="w-full border-collapse text-sm print:text-[10pt]">
          <caption className="sr-only">{titulo}</caption>
          <thead>
            <tr className="border-b border-borde bg-superficie-2 text-left text-xs tracking-wide text-texto-suave uppercase print:border-b-2 print:border-texto print:bg-transparent print:text-[8pt] print:text-texto">
              <th scope="col" className="px-4 py-3 font-semibold xl:w-[36%] print:w-[36%] print:px-1.5 print:py-1.5">Insumo</th>
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
                  </Link>
                </th>
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
  const { sesion, actor, centroId: centroActivoId, centro, centros } = await contextoPagina("alertas:ver");
  const filtros = leerFiltros(await searchParams);
  const centroId = resolverCentro(centroActivoId, centros, filtros.centro);

  const [lista, categorias] = await Promise.all([
    listaReposicion(actor, { centroId, categoriaId: filtros.categoriaId }),
    listarCategorias(actor),
  ]);
  const alcance = centro?.nombre ?? centros.find((c) => c.id === centroId)?.nombre ?? "Toda la red";
  const categoria = categorias.find((c) => c.id === filtros.categoriaId)?.nombre;
  const hrefCsv = construirHref("/alertas/reposicion/exportar", { centro: centroId, categoria: filtros.categoriaId });
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
        </p>
        <p className="text-[9pt] text-texto-suave">
          RedInsumos · Generada el {formatearFechaHora(new Date())} por {sesion.usuario.nombre} · Stock disponible al{" "}
          {formatearDia(lista.dia)} (no incluye lotes vencidos)
        </p>
      </div>

      <BarraFiltros parametros={["categoria", "centro"]}>
        <FiltroSelect
          parametro="categoria"
          etiqueta="Categoría"
          todos="Todas"
          opciones={categorias.map((c) => ({ value: c.id, label: c.nombre }))}
        />
        <FiltroCentro centroActivoId={centroActivoId} centros={centros} />
      </BarraFiltros>

      {lista.grupos.length === 0 ? (
        <EmptyState
          icono={PackageCheck}
          titulo="Nada que reponer"
          descripcion="Todos los insumos con stock mínimo definido están sobre su mínimo."
        />
      ) : (
        <div className="space-y-4 print:space-y-6">
          {lista.grupos.map((g) => (
            <Card key={g.centroId} relleno={false} className="overflow-hidden print:rounded-none print:border-0 print:shadow-none">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4 sm:px-5 print:px-0 print:pt-0 print:pb-2">
                <h2 className="text-base font-semibold tracking-tight print:text-[12pt]">{g.centro}</h2>
                <p className="text-sm text-texto-suave print:text-[9pt]">{pluralizar(g.items.length, "insumo")} por reponer</p>
              </div>
              <TablaReposicion items={g.items} titulo={`Reposición de ${g.centro}`} />
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
