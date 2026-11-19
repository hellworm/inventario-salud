import type { Metadata } from "next";
import Link from "next/link";
import { Landmark } from "lucide-react";
import { AccionesInstitucion, BotonNuevaInstitucion } from "@/components/admin/instituciones";
import { Alert, Badge, BadgeActivo, Card, DataTable, EmptyState, PageHeader, type Columna } from "@/components/ui";
import { formatearRut } from "@/lib/chile/rut";
import { formatearNumero, pluralizar } from "@/lib/formato";
import { contextoPagina } from "@/server/auth/sesion";
import { listarInstituciones, type FilaInstitucion } from "@/server/servicios";

export const metadata: Metadata = { title: "Instituciones" };

const ENLACE = "font-medium text-marca-700 underline-offset-4 hover:underline";

const COLUMNAS: Columna<FilaInstitucion>[] = [
  {
    clave: "institucion",
    encabezado: "Institución",
    movil: "titulo",
    className: "md:w-[34%]",
    celda: (i) => (
      <span className="block min-w-0">
        <span className="block font-medium break-words whitespace-normal">{i.nombre}</span>
        <span className="cifras block text-xs font-normal text-texto-tenue">{i.rut ? formatearRut(i.rut) : "Sin RUT"}</span>
      </span>
    ),
  },
  {
    clave: "centros",
    encabezado: "Centros",
    celda: (i) => (
      <span className="block whitespace-normal">
        <span className="cifras font-medium text-texto">{pluralizar(i.centrosActivos, "activo", "activos")}</span>
        {i.centros > i.centrosActivos ? (
          <span className="cifras block text-xs text-texto-suave">
            {pluralizar(i.centros - i.centrosActivos, "inactivo", "inactivos")}
          </span>
        ) : null}
      </span>
    ),
  },
  {
    clave: "usuarios",
    encabezado: "Usuarios",
    celda: (i) => (
      <span className="block whitespace-normal">
        <Link href={`/admin/usuarios?institucion=${i.id}`} className={`cifras ${ENLACE}`}>
          {pluralizar(i.usuariosActivos, "activo", "activos")}
        </Link>
        {i.activo && i.administradores === 0 ? (
          <span className="mt-1 block">
            <Badge tono="alerta">Sin administrador</Badge>
          </span>
        ) : (
          <span className="cifras block text-xs text-texto-suave">
            {pluralizar(i.administradores, "administrador", "administradores")}
          </span>
        )}
      </span>
    ),
  },
  {
    clave: "stock",
    encabezado: "Stock",
    movil: "oculto",
    celda: (i) =>
      i.existencias > 0 ? (
        <span className="cifras">{formatearNumero(i.existencias)} unidades</span>
      ) : (
        <span className="text-texto-suave">Sin stock</span>
      ),
  },
  { clave: "estado", encabezado: "Estado", celda: (i) => <BadgeActivo activo={i.activo} /> },
  {
    clave: "acciones",
    encabezado: "Acciones",
    alinear: "derecha",
    movil: "destacado",
    className: "w-16 py-1.5",
    celda: (i) => (
      <AccionesInstitucion
        institucion={{ id: i.id, nombre: i.nombre, rut: i.rut, activo: i.activo, existencias: i.existencias }}
      />
    ),
  },
];

export default async function PaginaAdminInstituciones() {
  const { actor } = await contextoPagina("instituciones:gestionar");
  const instituciones = await listarInstituciones(actor);
  const sinAdministrador = instituciones.filter((i) => i.activo && i.administradores === 0);

  return (
    <>
      <PageHeader
        titulo="Instituciones"
        descripcion="Las organizaciones que usan la red. Cada una tiene sus propios centros y usuarios, y no ve nada de las demás."
        acciones={<BotonNuevaInstitucion />}
      />

      {sinAdministrador.length > 0 ? (
        <Alert tono="alerta" className="mb-4" titulo="Hay instituciones sin administrador">
          {sinAdministrador.map((i) => i.nombre).join(", ")}: nadie de la institución puede gestionar sus centros ni sus usuarios.
          Créale un administrador desde{" "}
          <Link href="/admin/usuarios" className={ENLACE}>
            Usuarios
          </Link>
          .
        </Alert>
      ) : null}

      <Card relleno={false} className="overflow-hidden">
        <DataTable
          titulo="Instituciones"
          columnas={COLUMNAS}
          filas={instituciones}
          claveFila={(i) => i.id}
          claseFila={(i) => (i.activo ? undefined : "bg-superficie-2/60 [&_td]:text-texto-suave")}
          vacio={
            <EmptyState
              compacto
              icono={Landmark}
              titulo="Aún no hay instituciones"
              descripcion="Crea la primera institución y a su administrador para empezar."
            />
          }
        />
      </Card>
    </>
  );
}
