import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck2, CalendarX2, ClipboardList, PackageCheck } from "lucide-react";
import { FiltroSelect } from "@/components/alertas/filtro-select";
import { PestanasEnlace, type PestanaEnlace } from "@/components/alertas/pestanas-enlace";
import {
  Alert,
  Badge,
  BadgeEstadoStock,
  BadgeEstadoVencimiento,
  buttonClasses,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  Pagination,
  SearchInput,
  type Columna,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { describirVencimiento, formatearDia } from "@/lib/fechas";
import { leerFiltros } from "@/lib/filtros-reportes";
import { formatearNumero, pluralizar } from "@/lib/formato";
import { construirHref, leerOpcion, resolverCentro } from "@/lib/parametros-url";
import { puede } from "@/lib/permisos";
import { POR_PAGINA_DEFECTO } from "@/lib/resultado";
import { contextoPagina } from "@/server/auth/sesion";
import { listarCategorias, obtenerAlertas, type AlertaStock, type AlertaVencimiento } from "@/server/servicios";

export const metadata: Metadata = { title: "Alertas" };

const PESTANAS = ["sin-stock", "bajo-minimo", "vencidos", "por-vencer"] as const;
type Pestana = (typeof PESTANAS)[number];
const TRAMOS = ["30", "60", "90"] as const;

const ETIQUETA_TRAMO: Record<(typeof TRAMOS)[number], string> = {
  "30": "30 días o menos",
  "60": "31 a 60 días",
  "90": "61 a 90 días",
};

function InsumoCelda({ nombre, codigo, extra }: { nombre: string; codigo: string; extra?: string }) {
  return (
    <span className="block min-w-0">
      <span className="block truncate font-medium">{nombre}</span>
      <span className="block truncate text-xs font-normal text-texto-tenue">
        {codigo}
        {extra ? ` · ${extra}` : ""}
      </span>
    </span>
  );
}

/** Disponible frente al mínimo, con una barra proporcional (el texto lleva el dato exacto). */
function DisponibleVsMinimo({ alerta }: { alerta: AlertaStock }) {
  const proporcion = Math.min(100, Math.round((alerta.disponible / alerta.stockMinimo) * 100));
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="cifras whitespace-nowrap">
        <strong className="font-semibold">{formatearNumero(alerta.disponible)}</strong>
        <span className="text-texto-tenue"> de {formatearNumero(alerta.stockMinimo)}</span>
      </span>
      <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-superficie-2 ring-1 ring-borde ring-inset md:block" aria-hidden>
        <span
          className={cn("block h-full rounded-full", alerta.tipo === "SIN_STOCK" ? "bg-peligro-600" : "bg-alerta-500")}
          style={{ width: `${proporcion}%` }}
        />
      </span>
    </span>
  );
}

function columnasStock(mostrarCentro: boolean): Columna<AlertaStock>[] {
  return [
    {
      clave: "insumo",
      encabezado: "Insumo",
      movil: "titulo",
      celda: (a) => <InsumoCelda nombre={a.nombre} codigo={a.codigo} extra={a.categoria} />,
    },
    { clave: "estado", encabezado: "Estado", movil: "destacado", celda: (a) => <BadgeEstadoStock estado={a.tipo} /> },
    ...(mostrarCentro
      ? [{ clave: "centro", encabezado: "Centro", celda: (a: AlertaStock) => a.centro } satisfies Columna<AlertaStock>]
      : []),
    {
      clave: "disponible",
      encabezado: "Disponible / mínimo",
      alinear: "derecha",
      celda: (a) => <DisponibleVsMinimo alerta={a} />,
    },
    {
      clave: "faltante",
      encabezado: "Falta reponer",
      alinear: "derecha",
      celda: (a) => (
        <span className="cifras whitespace-nowrap font-semibold">
          {formatearNumero(a.faltante)} <span className="font-normal text-texto-tenue">{a.unidadMedida}</span>
        </span>
      ),
    },
    {
      clave: "maximo",
      encabezado: "Para el máximo",
      alinear: "derecha",
      movil: "oculto",
      celda: (a) =>
        a.faltaParaMaximo === null ? (
          <span className="text-texto-tenue" title="Sin stock máximo definido">
            —
          </span>
        ) : (
          <span className="cifras whitespace-nowrap text-texto-suave">{formatearNumero(a.faltaParaMaximo)}</span>
        ),
    },
  ];
}

function columnasVencimiento(mostrarCentro: boolean): Columna<AlertaVencimiento>[] {
  return [
    {
      clave: "insumo",
      encabezado: "Insumo",
      movil: "titulo",
      celda: (a) => <InsumoCelda nombre={a.nombre} codigo={a.codigo} />,
    },
    {
      clave: "dias",
      encabezado: "Días restantes",
      movil: "destacado",
      celda: (a) =>
        a.tipo === "VENCIDO" ? (
          <Badge tono="peligro" icono={CalendarX2}>
            {describirVencimiento(a.dias)}
          </Badge>
        ) : (
          <BadgeEstadoVencimiento estado="POR_VENCER" dias={a.dias} />
        ),
    },
    { clave: "lote", encabezado: "Lote", celda: (a) => <span className="cifras whitespace-nowrap">{a.numeroLote}</span> },
    {
      clave: "ubicacion",
      encabezado: "Ubicación",
      celda: (a) => (mostrarCentro ? `${a.centro} · ${a.ubicacion}` : a.ubicacion),
    },
    {
      clave: "cantidad",
      encabezado: "Cantidad",
      alinear: "derecha",
      celda: (a) => (
        <span className="cifras whitespace-nowrap font-semibold">
          {formatearNumero(a.cantidad)} <span className="font-normal text-texto-tenue">{a.unidadMedida}</span>
        </span>
      ),
    },
    {
      clave: "fecha",
      encabezado: "Vencimiento",
      alinear: "derecha",
      celda: (a) => <span className="cifras whitespace-nowrap text-texto-suave">{formatearDia(a.fechaVencimiento)}</span>,
    },
  ];
}

function pagina<T>(items: readonly T[], numero: number) {
  const totalPaginas = Math.max(1, Math.ceil(items.length / POR_PAGINA_DEFECTO));
  const actual = Math.min(Math.max(numero, 1), totalPaginas);
  return {
    items: items.slice((actual - 1) * POR_PAGINA_DEFECTO, actual * POR_PAGINA_DEFECTO),
    total: items.length,
    pagina: actual,
    porPagina: POR_PAGINA_DEFECTO,
    totalPaginas,
  };
}

export default async function PaginaAlertas({ searchParams }: PageProps<"/alertas">) {
  const { actor, centroId: centroActivoId, centro, centros } = await contextoPagina("alertas:ver");
  const sp = await searchParams;
  const filtros = leerFiltros(sp);
  const centroId = resolverCentro(centroActivoId, centros, filtros.centro);
  const tramo = leerOpcion(sp, "tramo", TRAMOS);

  const [alertas, categorias] = await Promise.all([
    obtenerAlertas(actor, { centroId, categoriaId: filtros.categoriaId, texto: filtros.texto }),
    listarCategorias(actor),
  ]);
  const { resumen } = alertas;
  const porVencerTotal = resumen.porVencer30 + resumen.porVencer60 + resumen.porVencer90;
  const conteos: Record<Pestana, number> = {
    "sin-stock": resumen.sinStock,
    "bajo-minimo": resumen.bajoMinimo,
    vencidos: resumen.vencidos,
    "por-vencer": porVencerTotal,
  };
  // Sin pestaña en la URL se abre la primera con alertas (lo más urgente primero).
  const pestana: Pestana = leerOpcion(sp, "tab", PESTANAS) ?? PESTANAS.find((p) => conteos[p] > 0) ?? "sin-stock";

  const comunes = { centro: centroActivoId ? undefined : filtros.centro, categoria: filtros.categoriaId, q: filtros.texto };
  const hrefPestana = (tab: Pestana, extra: Record<string, string | undefined> = {}) =>
    construirHref("/alertas", { tab, ...comunes, ...extra });

  const pestanas: PestanaEnlace[] = [
    { href: hrefPestana("sin-stock"), etiqueta: "Sin stock", contador: conteos["sin-stock"], tono: "peligro", activa: pestana === "sin-stock" },
    { href: hrefPestana("bajo-minimo"), etiqueta: "Bajo mínimo", contador: conteos["bajo-minimo"], tono: "alerta", activa: pestana === "bajo-minimo" },
    { href: hrefPestana("vencidos"), etiqueta: "Vencidos", contador: conteos.vencidos, tono: "peligro", activa: pestana === "vencidos" },
    { href: hrefPestana("por-vencer"), etiqueta: "Por vencer", contador: conteos["por-vencer"], tono: "alerta", activa: pestana === "por-vencer" },
  ];

  const mostrarCentro = centroId === null && centros.length > 1;
  const hayFiltros = Boolean(filtros.texto || filtros.categoriaId || (!centroActivoId && centroId));
  const alcance = centro?.nombre ?? centros.find((c) => c.id === centroId)?.nombre ?? "Toda la red";
  const puedeDarDeBaja = puede(actor.rol, "movimientos:merma");

  const stock =
    pestana === "sin-stock"
      ? alertas.stock.filter((a) => a.tipo === "SIN_STOCK")
      : pestana === "bajo-minimo"
        ? alertas.stock.filter((a) => a.tipo === "BAJO_MINIMO")
        : null;
  const vencimientos =
    pestana === "vencidos"
      ? alertas.vencimientos.filter((a) => a.tipo === "VENCIDO")
      : pestana === "por-vencer"
        ? alertas.vencimientos.filter((a) => a.tipo === "POR_VENCER" && (!tramo || String(a.tramo) === tramo))
        : null;

  const vacio = hayFiltros ? (
    <EmptyState compacto titulo="Sin resultados" descripcion="Ninguna alerta coincide con los filtros aplicados." />
  ) : pestana === "sin-stock" || pestana === "bajo-minimo" ? (
    <EmptyState
      compacto
      icono={PackageCheck}
      titulo={pestana === "sin-stock" ? "Nada sin stock" : "Nada bajo el mínimo"}
      descripcion="Todos los insumos con mínimo definido están cubiertos."
    />
  ) : (
    <EmptyState
      compacto
      icono={CalendarCheck2}
      titulo={pestana === "vencidos" ? "Sin lotes vencidos" : "Nada por vencer"}
      descripcion={
        pestana === "vencidos" ? "No hay stock vencido que dar de baja." : "Ningún lote con stock vence en los próximos 90 días."
      }
    />
  );

  return (
    <>
      <PageHeader
        titulo="Alertas"
        descripcion={
          <>
            {alcance} · {resumen.total === 0 ? "sin alertas activas" : pluralizar(resumen.total, "alerta activa", "alertas activas")}
            {hayFiltros ? " con los filtros aplicados" : ""}
          </>
        }
        acciones={
          <Link
            href={construirHref("/alertas/reposicion", { centro: comunes.centro, categoria: comunes.categoria })}
            className={buttonClasses({ variant: "secundario" })}
          >
            <ClipboardList aria-hidden />
            Lista de reposición
          </Link>
        }
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:flex lg:items-center">
        <SearchInput
          placeholder="Buscar insumo, código o lote…"
          label="Buscar en las alertas"
          className="sm:col-span-2 lg:w-80 lg:flex-none"
        />
        <FiltroSelect
          parametro="categoria"
          etiqueta="Categoría"
          todos="Todas las categorías"
          opciones={categorias.map((c) => ({ value: c.id, label: c.nombre }))}
          className="lg:w-64"
        />
        {!centroActivoId && centros.length > 1 ? (
          <FiltroSelect
            parametro="centro"
            etiqueta="Centro"
            todos="Todos los centros"
            opciones={centros.map((c) => ({ value: c.id, label: c.nombre }))}
            className="lg:w-64"
          />
        ) : null}
        {hayFiltros ? (
          <Link href={construirHref("/alertas", { tab: pestana })} className={buttonClasses({ variant: "fantasma", size: "sm" })}>
            Limpiar filtros
          </Link>
        ) : null}
      </div>

      <PestanasEnlace pestanas={pestanas} etiqueta="Tipos de alerta" />

      <div className="pt-4">
        {pestana === "vencidos" && vencimientos && vencimientos.length > 0 ? (
          <Alert tono="peligro" titulo="El stock vencido no se puede retirar" className="mb-4">
            {puedeDarDeBaja ? (
              <>
                Sepáralo y regístralo como merma para que deje de figurar en el inventario.{" "}
                <Link href="/movimientos/ajuste" className="font-semibold underline underline-offset-2">
                  Registrar merma
                </Link>
              </>
            ) : (
              "Sepáralo del resto y avisa a un administrador para que lo dé de baja como merma."
            )}
          </Alert>
        ) : null}

        {pestana === "por-vencer" ? (
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar por días restantes">
            {[undefined, ...TRAMOS].map((t) => {
              const activo = tramo === t;
              const cantidad =
                t === undefined ? porVencerTotal : t === "30" ? resumen.porVencer30 : t === "60" ? resumen.porVencer60 : resumen.porVencer90;
              return (
                <Link
                  key={t ?? "todos"}
                  href={hrefPestana("por-vencer", { tramo: t })}
                  scroll={false}
                  aria-current={activo ? "true" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors sm:min-h-9",
                    activo
                      ? "border-marca-600 bg-marca-50 text-marca-800"
                      : "border-borde-fuerte/70 bg-superficie text-texto-suave hover:border-borde-fuerte hover:text-texto",
                  )}
                >
                  {t === undefined ? "Todos" : ETIQUETA_TRAMO[t]}
                  <span className="cifras text-xs font-semibold">{formatearNumero(cantidad)}</span>
                </Link>
              );
            })}
          </div>
        ) : null}

        {stock ? (
          (() => {
            const p = pagina(stock, filtros.pagina ?? 1);
            return (
              <>
                <Card relleno={false} className="overflow-hidden">
                  <DataTable
                    titulo={pestana === "sin-stock" ? "Insumos sin stock" : "Insumos bajo el mínimo"}
                    columnas={columnasStock(mostrarCentro)}
                    filas={p.items}
                    claveFila={(a) => `${a.insumoId}:${a.centroId}`}
                    hrefFila={(a) => `/inventario/${a.insumoId}`}
                    vacio={vacio}
                  />
                </Card>
                <Pagination {...p} className="mt-4" />
              </>
            );
          })()
        ) : vencimientos ? (
          (() => {
            const p = pagina(vencimientos, filtros.pagina ?? 1);
            return (
              <>
                <Card relleno={false} className="overflow-hidden">
                  <DataTable
                    titulo={pestana === "vencidos" ? "Lotes vencidos con stock" : "Lotes por vencer"}
                    columnas={columnasVencimiento(mostrarCentro)}
                    filas={p.items}
                    claveFila={(a) => `${a.loteId}:${a.ubicacionId}`}
                    hrefFila={(a) => `/inventario/${a.insumoId}`}
                    vacio={vacio}
                  />
                </Card>
                <Pagination {...p} className="mt-4" />
              </>
            );
          })()
        ) : null}
      </div>
    </>
  );
}
