import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText, X } from "lucide-react";
import { etiquetaAccion, etiquetaEntidad, resumenAuditoria, tonoAccion } from "@/components/admin/auditoria-legible";
import { BotonDetalleAuditoria } from "@/components/admin/detalle-auditoria";
import { FiltroFecha, FiltroSelect, LimpiarFiltros } from "@/components/admin/filtros-url";
import { Alert, Badge, buttonClasses, Card, DataTable, EmptyState, PageHeader, Pagination, type Columna } from "@/components/ui";
import { formatearFechaHora, hoyEnSantiago, parsearDia } from "@/lib/fechas";
import { contextoPagina } from "@/server/auth/sesion";
import { listarAuditoria, opcionesFiltroAuditoria, type FilaAuditoria } from "@/server/servicios";

export const metadata: Metadata = { title: "Auditoría" };

const COLUMNAS: Columna<FilaAuditoria>[] = [
  {
    clave: "fecha",
    encabezado: "Fecha y hora",
    movil: "oculto",
    className: "w-40",
    celda: (r) => <span className="cifras whitespace-nowrap text-texto-suave">{formatearFechaHora(r.creadoEn)}</span>,
  },
  {
    clave: "accion",
    encabezado: "Acción",
    movil: "titulo",
    celda: (r) => (
      <span className="block min-w-0">
        <Badge tono={tonoAccion(r.accion)} className="max-w-full">
          <span className="truncate">{etiquetaAccion(r.accion)}</span>
        </Badge>
        <span className="cifras mt-1 block text-xs font-normal text-texto-suave md:hidden">{formatearFechaHora(r.creadoEn)}</span>
      </span>
    ),
  },
  {
    clave: "resumen",
    encabezado: "Sobre qué",
    className: "max-w-md",
    celda: (r) => {
      const resumen = resumenAuditoria(r.accion, r.detalle);
      return (
        <span className="block min-w-0">
          <span className="block whitespace-normal text-texto md:truncate" title={resumen || undefined}>
            {resumen || <span className="text-texto-tenue">—</span>}
          </span>
        </span>
      );
    },
  },
  {
    clave: "usuario",
    encabezado: "Usuario",
    celda: (r) => (r.usuario ? r.usuario.nombre : <span className="text-texto-tenue">Sin identificar</span>),
  },
  {
    clave: "detalle",
    encabezado: "Detalle",
    alinear: "derecha",
    movil: "destacado",
    className: "w-24 py-1.5",
    celda: (r) => (
      <BotonDetalleAuditoria
        registro={{
          id: r.id,
          creadoEn: r.creadoEn,
          usuario: r.usuario ? { nombre: r.usuario.nombre, email: r.usuario.email } : null,
          accion: r.accion,
          entidad: r.entidad,
          entidadId: r.entidadId,
          detalle: r.detalle,
          ip: r.ip,
        }}
      />
    ),
  },
];

function parametro(valor: string | string[] | undefined): string | undefined {
  return typeof valor === "string" && valor !== "" ? valor : undefined;
}

export default async function PaginaAuditoria({ searchParams }: PageProps<"/admin/auditoria">) {
  const { actor } = await contextoPagina("auditoria:ver");
  const sp = await searchParams;
  const filtros = {
    usuarioId: parametro(sp.usuario),
    accion: parametro(sp.accion),
    entidad: parametro(sp.entidad),
    entidadId: parametro(sp.entidadId),
    desde: parsearDia(parametro(sp.desde)) ?? undefined,
    hasta: parsearDia(parametro(sp.hasta)) ?? undefined,
  };
  const rangoInvertido = Boolean(filtros.desde && filtros.hasta && filtros.desde > filtros.hasta);
  const [registros, opciones] = await Promise.all([
    listarAuditoria(actor, { ...filtros, pagina: Number(sp.pagina) || 1 }),
    opcionesFiltroAuditoria(actor),
  ]);
  const hayFiltros = Object.values(filtros).some(Boolean);
  const hoy = hoyEnSantiago();

  const sinEntidadId = new URLSearchParams();
  for (const [clave, valor] of Object.entries(sp)) {
    if (typeof valor === "string" && clave !== "entidadId" && clave !== "pagina") sinEntidadId.set(clave, valor);
  }

  return (
    <>
      <PageHeader
        titulo="Auditoría"
        descripcion="Registro de quién hizo qué y cuándo: ingresos al sistema, movimientos de stock y cambios de administración. Solo lectura."
      />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <span className="mb-1 block text-xs font-medium text-texto-suave">Usuario</span>
            <FiltroSelect
              parametro="usuario"
              label="Filtrar por usuario"
              todos="Todos"
              opciones={opciones.usuarios.map((u) => ({ value: u.id, label: u.activo ? u.nombre : `${u.nombre} (inactivo)` }))}
            />
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-texto-suave">Acción</span>
            <FiltroSelect
              parametro="accion"
              label="Filtrar por acción"
              todos="Todas"
              opciones={opciones.acciones
                .map((a) => ({ value: a, label: etiquetaAccion(a) }))
                .sort((a, b) => a.label.localeCompare(b.label, "es"))}
            />
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-texto-suave">Tipo de registro</span>
            <FiltroSelect
              parametro="entidad"
              label="Filtrar por tipo de registro"
              todos="Todos"
              opciones={opciones.entidades
                .map((e) => ({ value: e, label: etiquetaEntidad(e) }))
                .sort((a, b) => a.label.localeCompare(b.label, "es"))}
            />
          </div>
          <FiltroFecha parametro="desde" label="Desde" max={filtros.hasta ?? hoy} />
          <FiltroFecha parametro="hasta" label="Hasta" min={filtros.desde} max={hoy} />
        </div>
        {hayFiltros ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-borde pt-3">
            {filtros.entidadId ? (
              <Link
                href={sinEntidadId.size > 0 ? `/admin/auditoria?${sinEntidadId.toString()}` : "/admin/auditoria"}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-marca-50 px-3 text-sm font-medium text-marca-800 ring-1 ring-marca-200 ring-inset hover:bg-marca-100"
              >
                Historial de un solo registro
                <X className="size-4" aria-hidden />
                <span className="sr-only">(quitar filtro)</span>
              </Link>
            ) : null}
            <LimpiarFiltros parametros={["usuario", "accion", "entidad", "entidadId", "desde", "hasta"]} />
          </div>
        ) : null}
      </Card>

      {rangoInvertido ? (
        <Alert tono="alerta" className="mb-4">
          La fecha «Desde» es posterior a «Hasta»: no hay resultados posibles para ese rango.
        </Alert>
      ) : null}

      <Card relleno={false} className="overflow-hidden">
        <DataTable
          titulo="Registro de auditoría"
          columnas={COLUMNAS}
          filas={registros.items}
          claveFila={(r) => r.id}
          vacio={
            <EmptyState
              compacto
              icono={ScrollText}
              titulo={hayFiltros ? "Sin eventos para estos filtros" : "Aún no hay eventos registrados"}
              descripcion={hayFiltros ? "Amplía el rango de fechas o quita algún filtro." : undefined}
              accion={
                hayFiltros ? (
                  <Link href="/admin/auditoria" className={buttonClasses({ variant: "secundario" })}>
                    Quitar filtros
                  </Link>
                ) : undefined
              }
            />
          }
        />
      </Card>
      <Pagination {...registros} className="mt-4" />
    </>
  );
}
