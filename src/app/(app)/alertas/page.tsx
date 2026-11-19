import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, CalendarCheck2, ClipboardList, PackageCheck, Trash2 } from "lucide-react";
import { BarraFiltros, FiltroBusqueda, FiltroCentro, FiltroSelect } from "@/components/admin/filtros-url";
import {
  CLASE_ACCION_FILA,
  hrefDarDeBaja,
  hrefIngresar,
  hrefRetirar,
  ubicacionesDeIngreso,
  type UbicacionPorCentro,
} from "@/components/alertas/acciones";
import { PestanasEnlace, type PestanaEnlace } from "@/components/alertas/pestanas-enlace";
import { CeldaInsumo, DosLineas } from "@/components/reportes/piezas";
import {
  Alert,
  BadgeEstadoStock,
  BadgeEstadoVencimiento,
  buttonClasses,
  Card,
  DataTable,
  EmptyState,
  LeyendaSemaforo,
  PageHeader,
  Pagination,
  type Columna,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { limitesSemaforo, MESES_SEMAFORO_AMARILLO, MESES_SEMAFORO_ROJO } from "@/lib/estados";
import { formatearDia, hoyEnSantiago, sumarDias } from "@/lib/fechas";
import { leerFiltros } from "@/lib/filtros-reportes";
import { formatearNumero, pluralizar } from "@/lib/formato";
import { construirHref, leerOpcion, leerTexto, resolverCentro } from "@/lib/parametros-url";
import { puede, type Rol } from "@/lib/permisos";
import { POR_PAGINA_DEFECTO } from "@/lib/resultado";
import { contextoPagina } from "@/server/auth/sesion";
import { cantidadConUnidad, unidadSegun } from "@/lib/unidades";
import {
  listarCategorias,
  listarUbicaciones,
  obtenerAlertas,
  type AlertaStock,
  type AlertaVencimiento,
} from "@/server/servicios";
import { SinCentroActivo } from "@/components/shell/sin-centro";

export const metadata: Metadata = { title: "Alertas" };

/** Pestañas: stock, vencidos y los dos colores de alerta del semáforo (rojo y amarillo). */
const PESTANAS = ["sin-stock", "bajo-minimo", "vencidos", "rojo", "amarillo"] as const;
type Pestana = (typeof PESTANAS)[number];
const ETIQUETA_PESTANA: Record<"vencidos" | "rojo" | "amarillo", string> = {
  vencidos: "Lotes vencidos con stock",
  rojo: "Lotes en rojo",
  amarillo: "Lotes en amarillo",
};

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

function columnasStock(mostrarCentro: boolean, ubicacionesIngreso: UbicacionPorCentro | null): Columna<AlertaStock>[] {
  return [
    {
      clave: "insumo",
      encabezado: "Insumo",
      movil: "titulo",
      className: "md:w-[38%]",
      celda: (a) => <CeldaInsumo nombre={a.nombre} codigo={a.codigo} extra={mostrarCentro ? a.centro : a.categoria} />,
    },
    // El estado es el de la pestaña: en escritorio no ocupa columna; en móvil identifica la tarjeta.
    ...(ubicacionesIngreso
      ? []
      : [
          {
            clave: "estado",
            encabezado: "Estado",
            movil: "destacado",
            celda: (a: AlertaStock) => <BadgeEstadoStock estado={a.tipo} />,
          } satisfies Columna<AlertaStock>,
        ]),
    {
      clave: "disponible",
      encabezado: "Disponible",
      alinear: "derecha",
      celda: (a) => <DisponibleVsMinimo alerta={a} />,
    },
    {
      clave: "faltante",
      encabezado: "Falta",
      alinear: "derecha",
      celda: (a) => (
        <span className="cifras whitespace-nowrap font-semibold">
          {formatearNumero(a.faltante)} <span className="font-normal text-texto-tenue">{unidadSegun(a.faltante, a.unidadMedida)}</span>
        </span>
      ),
    },
    {
      clave: "maximo",
      encabezado: "Al máximo",
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
    ...(ubicacionesIngreso
      ? [
          {
            clave: "accion",
            encabezado: "Acción",
            alinear: "derecha",
            movil: "destacado",
            className: "w-px py-1.5",
            celda: (a: AlertaStock) => (
              <Link href={hrefIngresar(a, ubicacionesIngreso)} aria-label={`Ingresar ${a.nombre}`} className={CLASE_ACCION_FILA}>
                <ArrowDownToLine aria-hidden />
                Ingresar
              </Link>
            ),
          } satisfies Columna<AlertaStock>,
        ]
      : []),
  ];
}

function columnasVencimiento(
  mostrarCentro: boolean,
  vencidos: boolean,
  permisos: { retirar: boolean; darDeBaja: boolean },
): Columna<AlertaVencimiento>[] {
  const conAccion = vencidos ? permisos.darDeBaja : permisos.retirar;
  return [
    {
      clave: "insumo",
      encabezado: "Insumo",
      movil: "titulo",
      className: "md:w-[30%]",
      celda: (a) => <CeldaInsumo nombre={a.nombre} codigo={a.codigo} extra={`Lote ${a.numeroLote}`} />,
    },
    {
      clave: "dias",
      encabezado: vencidos ? "Vencimiento" : "Semáforo",
      movil: "destacado",
      celda: (a) => (
        <span className="inline-flex flex-col items-end gap-1 md:items-start">
          <BadgeEstadoVencimiento estado={a.tipo} dias={a.dias} />
          <span className="cifras text-xs whitespace-nowrap text-texto-suave">
            <span className="sr-only">{vencidos ? "Venció el " : "Vence el "}</span>
            {formatearDia(a.fechaVencimiento)}
          </span>
        </span>
      ),
    },
    {
      clave: "ubicacion",
      encabezado: "Ubicación",
      celda: (a) => <DosLineas principal={a.ubicacion} secundario={mostrarCentro ? a.centro : undefined} />,
    },
    {
      clave: "cantidad",
      encabezado: "Cantidad",
      alinear: "derecha",
      celda: (a) => (
        <span className="cifras whitespace-nowrap font-semibold">
          {formatearNumero(a.cantidad)}{" "}
          <span className="font-normal text-texto-tenue">{unidadSegun(a.cantidad, a.unidadMedida)}</span>
        </span>
      ),
    },
    ...(conAccion
      ? [
          {
            clave: "accion",
            encabezado: "Acción",
            alinear: "derecha",
            movil: "destacado",
            className: "w-px py-1.5",
            celda: (a: AlertaVencimiento) =>
              vencidos ? (
                <Link
                  href={hrefDarDeBaja(a)}
                  aria-label={`Dar de baja ${cantidadConUnidad(a.cantidad, a.unidadMedida)} del lote ${a.numeroLote} de ${a.nombre}`}
                  className={CLASE_ACCION_FILA}
                >
                  <Trash2 aria-hidden />
                  Dar de baja
                </Link>
              ) : (
                <Link
                  href={hrefRetirar(a)}
                  aria-label={`Retirar primero el lote ${a.numeroLote} de ${a.nombre}`}
                  className={CLASE_ACCION_FILA}
                >
                  <ArrowUpFromLine aria-hidden />
                  Retirar
                </Link>
              ),
          } satisfies Columna<AlertaVencimiento>,
        ]
      : []),
  ];
}

/** Aviso de la pestaña "Vencidos": qué hacer con ellos según lo que el rol puede hacer. */
const AVISO_VENCIDOS: Record<Rol, { titulo: string; texto: string }> = {
  ADMIN: {
    titulo: "El stock vencido no se puede retirar",
    texto: "Sepáralo y dalo de baja como merma para que deje de figurar en el inventario: usa «Dar de baja» en cada lote.",
  },
  BODEGUERO: {
    titulo: "El stock vencido no se puede retirar",
    texto: "Sepáralos y avisa a tu administrador para darlos de baja.",
  },
  VISITANTE: {
    titulo: "Lotes vencidos con stock",
    texto: "Estos lotes cumplieron su fecha de vencimiento y aún figuran con stock. El sistema no permite retirarlos para su uso.",
  },
};

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
  const { actor, centroId: centroActivoId, centro, centros, sinCentro } = await contextoPagina("alertas:ver");
  if (sinCentro) return <SinCentroActivo titulo="Alertas" />;
  const sp = await searchParams;
  const filtros = leerFiltros(sp);
  const centroId = resolverCentro(centroActivoId, centros, filtros.centro);
  const limites = limitesSemaforo(hoyEnSantiago());

  const puedeIngresar = puede(actor.rol, "movimientos:ingreso");
  const [alertas, categorias, ubicaciones] = await Promise.all([
    obtenerAlertas(actor, { centroId, categoriaId: filtros.categoriaId, texto: filtros.texto }),
    listarCategorias(actor),
    puedeIngresar ? listarUbicaciones(actor, { centroId: centroActivoId }) : [],
  ]);
  const { resumen } = alertas;
  const conteos: Record<Pestana, number> = {
    "sin-stock": resumen.sinStock,
    "bajo-minimo": resumen.bajoMinimo,
    vencidos: resumen.vencidos,
    rojo: resumen.rojo,
    amarillo: resumen.amarillo,
  };
  // Sin pestaña en la URL se abre la primera con alertas (lo más urgente primero).
  // `tab=por-vencer` (enlaces antiguos, tramos de 30/60/90 días) equivale hoy a "rojo".
  const pestana: Pestana =
    leerOpcion(sp, "tab", PESTANAS) ??
    (leerTexto(sp, "tab") === "por-vencer" ? "rojo" : undefined) ??
    PESTANAS.find((p) => conteos[p] > 0) ??
    "sin-stock";

  const comunes = { centro: centroActivoId ? undefined : filtros.centro, categoria: filtros.categoriaId, q: filtros.texto };
  const hrefPestana = (tab: Pestana, extra: Record<string, string | undefined> = {}) =>
    construirHref("/alertas", { tab, ...comunes, ...extra });

  const pestanas: PestanaEnlace[] = [
    { href: hrefPestana("sin-stock"), etiqueta: "Sin stock", contador: conteos["sin-stock"], tono: "peligro", activa: pestana === "sin-stock" },
    { href: hrefPestana("bajo-minimo"), etiqueta: "Bajo mínimo", contador: conteos["bajo-minimo"], tono: "alerta", activa: pestana === "bajo-minimo" },
    { href: hrefPestana("vencidos"), etiqueta: "Vencidos", contador: conteos.vencidos, tono: "peligro", activa: pestana === "vencidos" },
    { href: hrefPestana("rojo"), etiqueta: "Rojo", contador: conteos.rojo, tono: "peligro", activa: pestana === "rojo" },
    { href: hrefPestana("amarillo"), etiqueta: "Amarillo", contador: conteos.amarillo, tono: "alerta", activa: pestana === "amarillo" },
  ];

  const mostrarCentro = centroId === null && centros.length > 1;
  const hayFiltros = Boolean(filtros.texto || filtros.categoriaId || (!centroActivoId && centroId));
  const alcance = centro?.nombre ?? centros.find((c) => c.id === centroId)?.nombre ?? "Toda la red";
  const permisos = { retirar: puede(actor.rol, "movimientos:retiro"), darDeBaja: puede(actor.rol, "movimientos:merma") };
  const ubicacionesIngreso = puedeIngresar ? ubicacionesDeIngreso(ubicaciones) : null;
  const avisoVencidos = AVISO_VENCIDOS[actor.rol];

  const stock =
    pestana === "sin-stock"
      ? alertas.stock.filter((a) => a.tipo === "SIN_STOCK")
      : pestana === "bajo-minimo"
        ? alertas.stock.filter((a) => a.tipo === "BAJO_MINIMO")
        : null;
  const vencimientos =
    pestana === "vencidos"
      ? alertas.vencimientos.filter((a) => a.tipo === "VENCIDO")
      : pestana === "rojo"
        ? alertas.vencimientos.filter((a) => a.tipo === "ROJO")
        : pestana === "amarillo"
          ? alertas.vencimientos.filter((a) => a.tipo === "AMARILLO")
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
      titulo={pestana === "vencidos" ? "Sin lotes vencidos" : pestana === "rojo" ? "Nada en rojo" : "Nada en amarillo"}
      descripcion={
        pestana === "vencidos"
          ? "No hay lotes vencidos con stock."
          : pestana === "rojo"
            ? `Ningún lote con stock vence en menos de ${MESES_SEMAFORO_ROJO} meses.`
            : `Ningún lote con stock vence en ${MESES_SEMAFORO_ROJO} a ${MESES_SEMAFORO_AMARILLO} meses.`
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

      <BarraFiltros parametros={["q", "categoria", "centro"]}>
        <FiltroBusqueda placeholder="Insumo, código o lote…" />
        <FiltroSelect
          parametro="categoria"
          etiqueta="Categoría"
          todos="Todas"
          opciones={categorias.map((c) => ({ value: c.id, label: c.nombre }))}
        />
        <FiltroCentro centroActivoId={centroActivoId} centros={centros} />
      </BarraFiltros>

      <PestanasEnlace pestanas={pestanas} etiqueta="Tipos de alerta" />

      <div className="pt-4">
        {pestana === "vencidos" && vencimientos && vencimientos.length > 0 ? (
          <Alert tono={actor.rol === "VISITANTE" ? "info" : "peligro"} titulo={avisoVencidos.titulo} className="mb-4">
            {avisoVencidos.texto}
            {permisos.darDeBaja && vencimientos.length === 1 && vencimientos[0] ? (
              <>
                {" "}
                <Link href={hrefDarDeBaja(vencimientos[0])} className="font-semibold underline underline-offset-2">
                  Dar de baja el lote {vencimientos[0].numeroLote}
                </Link>
              </>
            ) : null}
          </Alert>
        ) : null}

        {pestana === "rojo" || pestana === "amarillo" ? (
          <div className="mb-4 rounded-control border border-borde bg-superficie px-4 py-3">
            <p className="text-sm text-texto">
              {pestana === "rojo" ? (
                <>
                  <strong className="font-semibold">Rojo:</strong> lotes con stock que vencen en menos de {MESES_SEMAFORO_ROJO} meses
                  (antes del {formatearDia(limites.amarilloDesde)}).{" "}
                  {permisos.retirar ? "Úsalos primero para que no se pierdan." : "Conviene usarlos primero."}
                </>
              ) : (
                <>
                  <strong className="font-semibold">Amarillo:</strong> lotes con stock que vencen en {MESES_SEMAFORO_ROJO} a{" "}
                  {MESES_SEMAFORO_AMARILLO} meses (entre el {formatearDia(limites.amarilloDesde)} y el{" "}
                  {formatearDia(sumarDias(limites.verdeDesde, -1))}). Tenlos presentes al planificar el consumo y las compras.
                </>
              )}
            </p>
            <LeyendaSemaforo className="mt-2" />
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
                    columnas={columnasStock(mostrarCentro, ubicacionesIngreso)}
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
                    titulo={ETIQUETA_PESTANA[pestana as keyof typeof ETIQUETA_PESTANA] ?? "Lotes"}
                    columnas={columnasVencimiento(mostrarCentro, pestana === "vencidos", permisos)}
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
