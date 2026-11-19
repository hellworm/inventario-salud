import type { Metadata } from "next";
import { Check, KeyRound, Lock, Minus, Users } from "lucide-react";
import { BarraFiltros, FiltroBusqueda, FiltroSelect } from "@/components/admin/filtros-url";
import { INFO_ROL, ROLES_ORDENADOS } from "@/components/admin/roles-info";
import {
  AccionesUsuario,
  BotonNuevoUsuario,
  BotonRestablecerVencida,
  DistintivoYo,
  type AlcanceUsuarios,
} from "@/components/admin/usuarios";
import {
  Badge,
  BadgeActivo,
  BadgeRol,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  Pagination,
  type Columna,
} from "@/components/ui";
import { formatearFecha, formatearFechaHora, formatearRelativo } from "@/lib/fechas";
import { NOMBRE_ROL, rolesAsignables, veTodaLaRed, type Rol } from "@/lib/permisos";
import { contextoPagina } from "@/server/auth/sesion";
import { listarCentrosAdmin, listarOpcionesInstitucion, listarUsuarios, type FilaUsuario } from "@/server/servicios";
import { paginaParam, textoParam } from "@/lib/parametros";

export const metadata: Metadata = { title: "Usuarios" };

const ESTADOS = [
  { value: "activos", label: "Solo activos" },
  { value: "inactivos", label: "Solo inactivos" },
];

function columnas(usuarioActualId: string, alcance: AlcanceUsuarios): Columna<FilaUsuario>[] {
  // El administrador de la red ve usuarios de varias instituciones: se indica la de cada uno.
  const mostrarInstitucion = alcance.eligeInstitucion;
  return [
    {
      clave: "usuario",
      encabezado: "Usuario",
      movil: "titulo",
      className: "md:w-[30%]",
      celda: (u) => (
        <span className="block min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-medium">
            <span className="break-words">{u.nombre}</span>
            {u.id === usuarioActualId ? <DistintivoYo /> : null}
          </span>
          <span className="block text-xs font-normal break-all text-texto-tenue">{u.email}</span>
        </span>
      ),
    },
    { clave: "rol", encabezado: "Rol", celda: (u) => <BadgeRol rol={u.rol} /> },
    {
      clave: "centros",
      encabezado: mostrarInstitucion ? "Institución y centros" : "Centros",
      celda: (u) => (
        <span className="block whitespace-normal">
          {mostrarInstitucion && u.institucion ? (
            <span className="block font-medium text-texto" data-institucion-de-usuario>
              {u.institucion}
            </span>
          ) : null}
          {u.rol === "ADMIN_RED" ? (
            <span className="text-texto-suave">Toda la red</span>
          ) : u.rol === "ADMIN" ? (
            <span className="text-texto-suave">Todos los centros de la institución</span>
          ) : u.centros.length === 0 ? (
            <span className="font-medium text-alerta-800">Sin centros asignados</span>
          ) : (
            <span className="block" title={u.centros.map((c) => c.nombre).join(", ")}>
              {u.centros.map((c) => c.nombre).join(", ")}
            </span>
          )}
        </span>
      ),
    },
    {
      clave: "estado",
      encabezado: "Estado",
      celda: (u) => (
        <span className="block">
          <span className="flex flex-wrap gap-1.5">
            <BadgeActivo activo={u.activo} />
            {u.bloqueado ? (
              <Badge tono="peligro" icono={Lock}>
                Bloqueada
              </Badge>
            ) : null}
            {u.activo && u.debeCambiarPassword && !u.passwordTemporalVencida ? (
              <Badge tono="alerta" icono={KeyRound} title="Aún no cambia su contraseña temporal">
                Contraseña temporal
              </Badge>
            ) : null}
            {u.activo && u.passwordTemporalVencida ? (
              <Badge tono="peligro" icono={KeyRound}>
                Contraseña temporal vencida
              </Badge>
            ) : null}
          </span>
          {u.activo && u.debeCambiarPassword && u.passwordTemporalExpira && !u.passwordTemporalVencida ? (
            <span className="mt-1 block text-xs text-texto-suave" data-password-temporal="vigente">
              Contraseña temporal vence el <span className="cifras">{formatearFecha(u.passwordTemporalExpira)}</span>
            </span>
          ) : null}
          {u.activo && u.debeCambiarPassword && u.id !== usuarioActualId ? (
            <BotonRestablecerVencida usuario={{ id: u.id, nombre: u.nombre }} vencida={u.passwordTemporalVencida} />
          ) : null}
          <span className="mt-1 block text-xs text-texto-suave max-md:hidden" title={u.ultimoAcceso ? formatearFechaHora(u.ultimoAcceso) : undefined}>
            {u.ultimoAcceso ? `Ingresó ${formatearRelativo(u.ultimoAcceso)}` : "Nunca ingresó"}
          </span>
        </span>
      ),
    },
    {
      clave: "acciones",
      encabezado: "Acciones",
      alinear: "derecha",
      movil: "destacado",
      className: "w-16 py-1.5",
      celda: (u) => (
        <AccionesUsuario
          esYo={u.id === usuarioActualId}
          alcance={alcance}
          usuario={{
            id: u.id,
            nombre: u.nombre,
            email: u.email,
            rol: u.rol,
            activo: u.activo,
            bloqueado: u.bloqueado,
            institucionId: u.institucionId,
            centroIds: u.centros.map((c) => c.id),
          }}
        />
      ),
    },
  ];
}

function AyudaRoles() {
  return (
    <details className="group mb-4 rounded-tarjeta border border-borde bg-superficie shadow-tarjeta">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-[0.9375rem] font-medium text-texto sm:px-5 [&::-webkit-details-marker]:hidden">
        ¿Qué puede hacer cada rol?
        <span className="text-sm font-normal text-marca-700 group-open:hidden">Ver</span>
        <span className="hidden text-sm font-normal text-marca-700 group-open:inline">Ocultar</span>
      </summary>
      <div className="grid gap-x-4 gap-y-5 border-t border-borde px-4 py-4 sm:grid-cols-2 sm:px-5 xl:grid-cols-4">
        {ROLES_ORDENADOS.map((rol) => (
          <div key={rol}>
            <BadgeRol rol={rol} />
            <p className="mt-2 text-sm font-medium text-texto">{INFO_ROL[rol].resumen}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {INFO_ROL[rol].puede.map((p) => (
                <li key={p} className="flex items-start gap-1.5 text-texto">
                  <Check className="mt-0.5 size-4 shrink-0 text-exito-600" aria-hidden />
                  {p}
                </li>
              ))}
              {INFO_ROL[rol].noPuede.map((p) => (
                <li key={p} className="flex items-start gap-1.5 text-texto-suave">
                  <Minus className="mt-0.5 size-4 shrink-0 text-texto-tenue" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

export default async function PaginaAdminUsuarios({ searchParams }: PageProps<"/admin/usuarios">) {
  const { actor } = await contextoPagina("usuarios:gestionar");
  const sp = await searchParams;
  const texto = textoParam(sp.q) ?? undefined;
  const esRed = veTodaLaRed(actor);
  const roles = rolesAsignables(actor.rol);
  const rol = roles.find((r) => r === sp.rol) as Rol | undefined;
  const institucionId = esRed ? (textoParam(sp.institucion) ?? undefined) : undefined;
  const estado = sp.estado === "activos" || sp.estado === "inactivos" ? sp.estado : undefined;
  const centroId = textoParam(sp.centro) ?? undefined;

  // Todo lo que llega al formulario ya viene acotado al alcance del actor: sus
  // roles asignables, sus instituciones y sus centros (el servicio lo revalida).
  const [usuarios, centrosAlcance, instituciones] = await Promise.all([
    listarUsuarios(actor, { texto, rol, estado, centroId, institucionId, pagina: paginaParam(sp.pagina) }),
    listarCentrosAdmin(actor),
    listarOpcionesInstitucion(actor),
  ]);
  const alcance: AlcanceUsuarios = {
    roles,
    instituciones,
    eligeInstitucion: esRed,
    centros: centrosAlcance.map((c) => ({ id: c.id, nombre: c.nombre, activo: c.activo, institucionId: c.institucionId })),
  };
  // Con una institución elegida, el filtro de centros muestra solo los suyos.
  const centrosFiltro = institucionId ? alcance.centros.filter((c) => c.institucionId === institucionId) : alcance.centros;
  const hayFiltros = Boolean(texto || rol || estado || centroId || institucionId);
  const institucionPropia = !esRed ? (instituciones[0]?.nombre ?? null) : null;

  return (
    <>
      <PageHeader
        titulo="Usuarios"
        descripcion={
          institucionPropia
            ? `Quién puede entrar al sistema en ${institucionPropia}, con qué rol y en qué centros.`
            : "Quién puede entrar al sistema, de qué institución, con qué rol y en qué centros."
        }
        acciones={<BotonNuevoUsuario alcance={alcance} />}
      />

      <AyudaRoles />

      <BarraFiltros parametros={["q", "institucion", "rol", "centro", "estado"]}>
        <FiltroBusqueda placeholder="Nombre o correo electrónico…" />
        {esRed ? (
          <FiltroSelect
            parametro="institucion"
            etiqueta="Institución"
            todos="Todas"
            opciones={instituciones.map((i) => ({ value: i.id, label: i.activo ? i.nombre : `${i.nombre} (inactiva)` }))}
          />
        ) : null}
        <FiltroSelect parametro="rol" etiqueta="Rol" todos="Todos" opciones={roles.map((r) => ({ value: r, label: NOMBRE_ROL[r] }))} />
        <FiltroSelect
          parametro="centro"
          etiqueta="Centro"
          todos="Todos"
          opciones={centrosFiltro.map((c) => ({ value: c.id, label: c.nombre }))}
        />
        <FiltroSelect parametro="estado" etiqueta="Estado" todos="Activos e inactivos" opciones={ESTADOS} />
      </BarraFiltros>

      <Card relleno={false} className="overflow-hidden">
        <DataTable
          titulo="Usuarios"
          columnas={columnas(actor.usuarioId, alcance)}
          filas={usuarios.items}
          claveFila={(u) => u.id}
          claseFila={(u) => (u.activo ? undefined : "bg-superficie-2/60 [&_td]:text-texto-suave")}
          vacio={
            <EmptyState
              compacto
              icono={Users}
              titulo={hayFiltros ? "Ningún usuario coincide" : "Aún no hay usuarios"}
              descripcion={hayFiltros ? "Prueba con otro nombre o quita los filtros." : undefined}
            />
          }
        />
      </Card>
      <Pagination {...usuarios} className="mt-4" />
    </>
  );
}
