import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText, X } from "lucide-react";
import {
  etiquetaAccion,
  etiquetaEntidad,
  nombresDelDetalle,
  resumenAuditoria,
  tonoAccion,
  type NombresAuditoria,
} from "@/components/admin/auditoria-legible";
import { BotonDetalleAuditoria } from "@/components/admin/detalle-auditoria";
import { BarraFiltros, FiltroFecha, FiltroSelect } from "@/components/admin/filtros-url";
import { Alert, Badge, buttonClasses, Card, DataTable, EmptyState, PageHeader, Pagination, type Columna } from "@/components/ui";
import { formatearFechaHora, hoyEnSantiago } from "@/lib/fechas";
import { contextoPagina } from "@/server/auth/sesion";
import {
  buscarInsumos,
  listarAuditoria,
  listarCategorias,
  opcionesFiltroAuditoria,
  type FilaAuditoria,
} from "@/server/servicios";
import { diaParam, paginaParam, textoParam } from "@/lib/parametros";

export const metadata: Metadata = { title: "Auditoría" };

/** Fila de auditoría con los nombres legibles que menciona su detalle. */
type FilaLegible = FilaAuditoria & { nombres: NombresAuditoria };

const COLUMNAS: Columna<FilaLegible>[] = [
  {
    clave: "accion",
    encabezado: "Acción y fecha",
    movil: "titulo",
    celda: (r) => (
      <span className="block min-w-0">
        <Badge tono={tonoAccion(r.accion)} className="max-w-full whitespace-normal">
          {etiquetaAccion(r.accion)}
        </Badge>
        <span className="cifras mt-1 block text-xs font-normal whitespace-nowrap text-texto-suave">{formatearFechaHora(r.creadoEn)}</span>
      </span>
    ),
  },
  {
    clave: "resumen",
    encabezado: "Sobre qué",
    celda: (r) => {
      const resumen = resumenAuditoria(r.accion, r.detalle, { entidadId: r.entidadId, nombres: r.nombres });
      return (
        <span className="block min-w-0">
          <span className="block whitespace-normal text-texto break-words">
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
          nombres: r.nombres,
        }}
      />
    ),
  },
];

function parametro(valor: string | string[] | undefined): string | undefined {
  return textoParam(valor) ?? undefined;
}

export default async function PaginaAuditoria({ searchParams }: PageProps<"/admin/auditoria">) {
  const { actor, centros } = await contextoPagina("auditoria:ver");
  const sp = await searchParams;
  const filtros = {
    usuarioId: parametro(sp.usuario),
    accion: parametro(sp.accion),
    entidad: parametro(sp.entidad),
    entidadId: parametro(sp.entidadId),
    desde: diaParam(sp.desde) ?? undefined,
    hasta: diaParam(sp.hasta) ?? undefined,
  };
  const rangoInvertido = Boolean(filtros.desde && filtros.hasta && filtros.desde > filtros.hasta);
  const [registros, opciones, insumos, categorias] = await Promise.all([
    listarAuditoria(actor, { ...filtros, pagina: paginaParam(sp.pagina) }),
    opcionesFiltroAuditoria(actor),
    buscarInsumos(actor, { soloActivos: false, limite: 500 }),
    listarCategorias(actor),
  ]);
  // El detalle guarda códigos e ids: aquí se resuelven a nombres para mostrarlos.
  const nombres: Record<string, string> = {};
  for (const c of centros) nombres[c.id] = c.nombre;
  for (const c of categorias) nombres[c.id] = c.nombre;
  for (const u of opciones.usuarios) nombres[u.id] = u.nombre;
  for (const i of insumos) {
    nombres[i.id] = i.nombre;
    nombres[`insumo:${i.codigo}`] = i.nombre;
  }
  const filas: FilaLegible[] = registros.items.map((r) => ({ ...r, nombres: nombresDelDetalle(r.detalle, nombres) }));
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

      <BarraFiltros parametros={["usuario", "accion", "entidad", "entidadId", "desde", "hasta"]}>
        <FiltroSelect
          parametro="usuario"
          etiqueta="Usuario"
          todos="Todos"
          opciones={opciones.usuarios.map((u) => ({ value: u.id, label: u.activo ? u.nombre : `${u.nombre} (inactivo)` }))}
        />
        <FiltroSelect
          parametro="accion"
          etiqueta="Acción"
          todos="Todas"
          opciones={opciones.acciones
            .map((a) => ({ value: a, label: etiquetaAccion(a) }))
            .sort((a, b) => a.label.localeCompare(b.label, "es"))}
        />
        <FiltroSelect
          parametro="entidad"
          etiqueta="Tipo de registro"
          todos="Todos"
          opciones={opciones.entidades
            .map((e) => ({ value: e, label: etiquetaEntidad(e) }))
            .sort((a, b) => a.label.localeCompare(b.label, "es"))}
        />
        <FiltroFecha parametro="desde" etiqueta="Desde" max={filtros.hasta ?? hoy} />
        <FiltroFecha parametro="hasta" etiqueta="Hasta" min={filtros.desde} max={hoy} />
        {filtros.entidadId ? (
          <Link
            href={sinEntidadId.size > 0 ? `/admin/auditoria?${sinEntidadId.toString()}` : "/admin/auditoria"}
            className="col-span-2 inline-flex min-h-11 items-center gap-1.5 justify-self-start rounded-full bg-marca-50 px-3 text-sm font-medium text-marca-800 ring-1 ring-marca-200 ring-inset hover:bg-marca-100"
          >
            Historial de un solo registro
            <X className="size-4" aria-hidden />
            <span className="sr-only">(quitar filtro)</span>
          </Link>
        ) : null}
      </BarraFiltros>

      {rangoInvertido ? (
        <Alert tono="alerta" className="mb-4">
          La fecha «Desde» es posterior a «Hasta»: no hay resultados posibles para ese rango.
        </Alert>
      ) : null}

      <Card relleno={false} className="overflow-hidden">
        <DataTable
          titulo="Registro de auditoría"
          columnas={COLUMNAS}
          filas={filas}
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
