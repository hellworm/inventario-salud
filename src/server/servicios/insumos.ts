import "server-only";
import { Prisma } from "@prisma/client";
import {
  esquemaActualizarInsumo,
  esquemaAsociarCodigoBarras,
  esquemaInsumo,
  esquemaParametrosStock,
  type DatosInsumo,
  type EntradaActualizarInsumo,
  type EntradaAsociarCodigoBarras,
  type EntradaInsumo,
  type EntradaParametrosStock,
} from "@/lib/esquemas/catalogo";
import { variantesGtin } from "@/lib/gs1";
import { veTodaLaRed, type Actor } from "@/lib/permisos";
import type { Paginado } from "@/lib/resultado";
import { registrarAuditoria } from "../auditoria";
import { alcanceDeCentros, verificarPermiso } from "../autorizacion";
import { db, enTransaccion, type Tx } from "../db";
import { ErrorDominio, noEncontrado } from "../errores";
import { validar } from "../validacion";
import {
  armarPaginado,
  calcularCambios,
  comoJson,
  conUnicidad,
  normalizarPagina,
  patronLike,
  type FiltroEstado,
  type OpcionesPagina,
  textoDeBusqueda,
} from "./apoyo-admin";
import {
  exigirProveedorAsignable,
  proveedorDeFila,
  sqlProveedorEfectivo,
  type ColumnasProveedorSql,
  type ProveedorEfectivo,
} from "./proveedor-insumo";

export interface FilaInsumoAdmin {
  id: string;
  codigo: string;
  nombre: string;
  categoriaId: string;
  categoria: string;
  unidadMedida: string;
  presentacion: string | null;
  fabricante: string | null;
  requiereCadenaFrio: boolean;
  controlaVencimiento: boolean;
  activo: boolean;
  /** Centros con stock mínimo o máximo definido. */
  centrosConParametro: number;
  /**
   * Proveedor efectivo para quien consulta: el predeterminado de la red
   * (ADMIN_RED) o el de su institución si lo sobrescribió (ADMIN).
   */
  proveedor: ProveedorEfectivo | null;
}

export interface FiltrosInsumosAdmin extends OpcionesPagina {
  texto?: string | null;
  categoriaId?: string | null;
  estado?: FiltroEstado | null;
}

/**
 * Catálogo completo (activos e inactivos) para administración. Busca por
 * nombre, código, fabricante o código de barras, sin distinguir tildes.
 * `centrosConParametro` cuenta solo los centros del alcance del actor.
 * Permiso: `catalogo:crear`.
 */
export async function listarInsumosAdmin(actor: Actor, filtros: FiltrosInsumosAdmin = {}): Promise<Paginado<FilaInsumoAdmin>> {
  verificarPermiso(actor, "catalogo:crear");
  const alcance = alcanceDeCentros(actor);
  const enAlcance =
    alcance === null
      ? Prisma.empty
      : alcance.length === 0
        ? Prisma.sql`AND FALSE`
        : Prisma.sql`AND p."centroId" IN (${Prisma.join(alcance)})`;
  const { pagina, porPagina, saltar } = normalizarPagina(filtros);
  const texto = textoDeBusqueda(filtros.texto);

  const condiciones: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (texto) {
    const patron = patronLike(texto);
    condiciones.push(Prisma.sql`(
      unaccent(i."nombre") ILIKE unaccent(${patron})
      OR i."codigo" ILIKE ${patron}
      OR unaccent(COALESCE(i."fabricante", '')) ILIKE unaccent(${patron})
      OR i."codigoBarras" = ${texto}
    )`);
  }
  if (filtros.categoriaId) condiciones.push(Prisma.sql`i."categoriaId" = ${filtros.categoriaId}`);
  if (filtros.estado === "activos") condiciones.push(Prisma.sql`i."activo"`);
  if (filtros.estado === "inactivos") condiciones.push(Prisma.sql`NOT i."activo"`);
  const donde = Prisma.join(condiciones, " AND ");
  // Proveedor efectivo: el de la institución del administrador o, para la red, el predeterminado.
  const prov = sqlProveedorEfectivo({
    insumoId: Prisma.sql`i."id"`,
    predeterminado: Prisma.sql`i."proveedorId"`,
    institucionId: veTodaLaRed(actor) ? null : actor.institucionId,
  });

  const [conteo, filas] = await Promise.all([
    db.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS total FROM "insumos" i WHERE ${donde}`),
    db.$queryRaw<(Omit<FilaInsumoAdmin, "centrosConParametro" | "proveedor"> & ColumnasProveedorSql & { centrosConParametro: bigint })[]>(Prisma.sql`
      SELECT i."id", i."codigo", i."nombre", i."categoriaId", c."nombre" AS "categoria", i."unidadMedida",
             i."presentacion", i."fabricante", i."requiereCadenaFrio", i."controlaVencimiento", i."activo",
             (SELECT COUNT(*) FROM "parametros_stock" p WHERE p."insumoId" = i."id" ${enAlcance}) AS "centrosConParametro"
             ${prov.columnas}
      FROM "insumos" i
      JOIN "categorias" c ON c."id" = i."categoriaId"
      ${prov.uniones}
      WHERE ${donde}
      ORDER BY i."activo" DESC, i."nombre" ASC, i."id" ASC
      LIMIT ${porPagina} OFFSET ${saltar}
    `),
  ]);
  return armarPaginado(
    filas.map((f): FilaInsumoAdmin => ({
      id: f.id,
      codigo: f.codigo,
      nombre: f.nombre,
      categoriaId: f.categoriaId,
      categoria: f.categoria,
      unidadMedida: f.unidadMedida,
      presentacion: f.presentacion,
      fabricante: f.fabricante,
      requiereCadenaFrio: f.requiereCadenaFrio,
      controlaVencimiento: f.controlaVencimiento,
      activo: f.activo,
      centrosConParametro: Number(f.centrosConParametro),
      proveedor: proveedorDeFila(f),
    })),
    Number(conteo[0]?.total ?? 0),
    pagina,
    porPagina,
  );
}

export interface ParametroCentro {
  centroId: string;
  centro: string;
  institucion: string;
  centroActivo: boolean;
  stockMinimo: number | null;
  stockMaximo: number | null;
  /** Unidades físicas del insumo hoy en el centro (referencia para definir el mínimo). */
  stockActual: number;
}

export interface InsumoAdmin {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  categoriaId: string;
  unidadMedida: string;
  presentacion: string | null;
  fabricante: string | null;
  registroSanitario: string | null;
  codigoBarras: string | null;
  requiereCadenaFrio: boolean;
  controlaVencimiento: boolean;
  /** Proveedor predeterminado de la red (id); el detalle lo da `detalleProveedorInsumo`. */
  proveedorId: string | null;
  activo: boolean;
  creadoEn: Date;
  actualizadoEn: Date;
  /** Tiene lotes o movimientos: no se puede eliminar, solo desactivar. */
  tieneHistoria: boolean;
  /** Unidades físicas en los centros del alcance del actor (toda la red para ADMIN_RED). */
  stockTotal: number;
  /** Una fila por centro del alcance del actor (los inactivos solo si ya tienen parámetro). */
  parametros: ParametroCentro[];
}

/**
 * Ficha de un insumo, con sus parámetros de stock por centro. Los datos del
 * insumo son del catálogo común; el stock y los parámetros se limitan a los
 * centros del alcance del actor (su institución para un ADMIN).
 * Permiso: `catalogo:crear`.
 */
export async function obtenerInsumoAdmin(actor: Actor, insumoId: string): Promise<InsumoAdmin> {
  verificarPermiso(actor, "catalogo:crear");
  const alcance = alcanceDeCentros(actor);
  const enAlcance = alcance === null ? {} : { id: { in: alcance } };
  const [insumo, centros, stock] = await Promise.all([
    db.insumo.findUnique({
      where: { id: insumoId },
      include: {
        parametros: alcance === null ? true : { where: { centroId: { in: alcance } } },
        _count: { select: { lotes: true, movimientos: true } },
      },
    }),
    db.centro.findMany({
      where: enAlcance,
      select: { id: true, nombre: true, activo: true, institucion: { select: { nombre: true } } },
      orderBy: [{ institucion: { nombre: "asc" } }, { nombre: "asc" }],
    }),
    db.$queryRaw<{ centroId: string; cantidad: bigint }[]>(Prisma.sql`
      SELECT u."centroId", COALESCE(SUM(e."cantidad"), 0) AS cantidad
      FROM "existencias" e
      JOIN "lotes" l ON l."id" = e."loteId"
      JOIN "ubicaciones" u ON u."id" = e."ubicacionId"
      WHERE l."insumoId" = ${insumoId}
        ${alcance === null ? Prisma.empty : alcance.length === 0 ? Prisma.sql`AND FALSE` : Prisma.sql`AND u."centroId" IN (${Prisma.join(alcance)})`}
      GROUP BY u."centroId"
    `),
  ]);
  if (!insumo) throw noEncontrado("El insumo");

  const stockPorCentro = new Map(stock.map((s) => [s.centroId, Number(s.cantidad)]));
  const parametroPorCentro = new Map(insumo.parametros.map((p) => [p.centroId, p]));
  const { parametros: _parametros, _count, ...datos } = insumo;
  void _parametros;
  return {
    ...datos,
    tieneHistoria: _count.lotes > 0 || _count.movimientos > 0,
    stockTotal: [...stockPorCentro.values()].reduce((s, n) => s + n, 0),
    parametros: centros
      .filter((c) => c.activo || parametroPorCentro.has(c.id))
      .map((c) => {
        const p = parametroPorCentro.get(c.id);
        return {
          centroId: c.id,
          centro: c.nombre,
          institucion: c.institucion.nombre,
          centroActivo: c.activo,
          stockMinimo: p ? p.stockMinimo : null,
          stockMaximo: p ? p.stockMaximo : null,
          stockActual: stockPorCentro.get(c.id) ?? 0,
        };
      }),
  };
}

/** Datos del catálogo de un insumo (sin su proveedor predeterminado, que se trata aparte). */
type DatosCatalogoInsumo = Omit<DatosInsumo, "proveedorId">;

async function exigirInsumoValido(tx: Tx, datos: DatosCatalogoInsumo, exceptoId?: string): Promise<void> {
  const otro = exceptoId ? { id: { not: exceptoId } } : {};
  const mismoCodigo = await tx.insumo.findFirst({
    where: { codigo: { equals: datos.codigo, mode: "insensitive" }, ...otro },
    select: { nombre: true },
  });
  if (mismoCodigo) {
    throw new ErrorDominio("DUPLICADO", `El código ${datos.codigo} ya lo usa "${mismoCodigo.nombre}".`, { campo: "codigo" });
  }
  if (datos.codigoBarras) {
    // El mismo producto no puede quedar en dos insumos, aunque el código venga escrito de
    // otra forma (EAN-13 / GTIN-14): el escáner no sabría cuál elegir.
    const equivalentes = [...new Set([datos.codigoBarras, ...variantesGtin(datos.codigoBarras)])];
    const mismaBarra = await tx.insumo.findFirst({
      where: { codigoBarras: { in: equivalentes }, ...otro },
      select: { nombre: true },
    });
    if (mismaBarra) {
      throw new ErrorDominio("DUPLICADO", `Ese código de barras ya lo usa "${mismaBarra.nombre}".`, {
        campo: "codigoBarras",
      });
    }
  }
  const categoria = await tx.categoria.findUnique({ where: { id: datos.categoriaId }, select: { id: true } });
  if (!categoria) {
    throw new ErrorDominio("NO_ENCONTRADO", "La categoría seleccionada ya no existe.", { campo: "categoriaId" });
  }
}

function camposInsumo(datos: DatosCatalogoInsumo) {
  return {
    codigo: datos.codigo,
    nombre: datos.nombre,
    descripcion: datos.descripcion ?? null,
    categoriaId: datos.categoriaId,
    unidadMedida: datos.unidadMedida,
    presentacion: datos.presentacion ?? null,
    fabricante: datos.fabricante ?? null,
    registroSanitario: datos.registroSanitario ?? null,
    codigoBarras: datos.codigoBarras ?? null,
    requiereCadenaFrio: datos.requiereCadenaFrio,
    controlaVencimiento: datos.controlaVencimiento,
  };
}

/**
 * Crea un insumo en el catálogo común. Permiso: `catalogo:crear` (también un
 * administrador de institución). Una vez creado es de toda la red: editarlo,
 * desactivarlo o eliminarlo exige `catalogo:gestionar` (solo ADMIN_RED).
 */
export async function crearInsumo(actor: Actor, entrada: EntradaInsumo): Promise<{ id: string; codigo: string; nombre: string }> {
  verificarPermiso(actor, "catalogo:crear");
  const datos = validar(esquemaInsumo, entrada);
  return conUnicidad(
    () =>
      enTransaccion(async (tx) => {
        await exigirInsumoValido(tx, datos);
        // Quien crea el insumo puede dejarle su proveedor predeterminado de la red.
        const proveedor = datos.proveedorId ? await exigirProveedorAsignable(tx, datos.proveedorId) : null;
        const insumo = await tx.insumo.create({
          data: { ...camposInsumo(datos), proveedorId: datos.proveedorId ?? null },
          select: { id: true, codigo: true, nombre: true },
        });
        await registrarAuditoria(tx, actor, {
          accion: "INSUMO_CREADO",
          entidad: "Insumo",
          entidadId: insumo.id,
          detalle: {
            codigo: insumo.codigo,
            nombre: insumo.nombre,
            unidadMedida: datos.unidadMedida,
            requiereCadenaFrio: datos.requiereCadenaFrio,
            controlaVencimiento: datos.controlaVencimiento,
            ...(proveedor ? { proveedor } : {}),
          },
        });
        return insumo;
      }),
    "Ya existe un insumo con ese código.",
    "codigo",
  );
}

/** Actualiza los datos de un insumo. Permiso: `catalogo:gestionar`. */
export async function actualizarInsumo(
  actor: Actor,
  entrada: EntradaActualizarInsumo,
): Promise<{ id: string; codigo: string; nombre: string }> {
  verificarPermiso(actor, "catalogo:gestionar");
  const { id, ...datos } = validar(esquemaActualizarInsumo, entrada);
  return conUnicidad(
    () =>
      enTransaccion(async (tx) => {
        const actual = await tx.insumo.findUnique({ where: { id } });
        if (!actual) throw noEncontrado("El insumo");
        await exigirInsumoValido(tx, datos, id);
        const nuevos = camposInsumo(datos);
        const cambios = calcularCambios(
          {
            codigo: actual.codigo,
            nombre: actual.nombre,
            descripcion: actual.descripcion,
            categoriaId: actual.categoriaId,
            unidadMedida: actual.unidadMedida,
            presentacion: actual.presentacion,
            fabricante: actual.fabricante,
            registroSanitario: actual.registroSanitario,
            codigoBarras: actual.codigoBarras,
            requiereCadenaFrio: actual.requiereCadenaFrio,
            controlaVencimiento: actual.controlaVencimiento,
          },
          nuevos,
        );
        // Proveedor predeterminado de la red: `undefined` = no se toca; `null` = se quita.
        const cambiaProveedor = datos.proveedorId !== undefined && datos.proveedorId !== actual.proveedorId;
        if (cambiaProveedor) {
          const despues = datos.proveedorId ? await exigirProveedorAsignable(tx, datos.proveedorId) : null;
          const antes = actual.proveedorId
            ? ((await tx.proveedor.findUnique({ where: { id: actual.proveedorId }, select: { razonSocial: true } }))?.razonSocial ?? null)
            : null;
          cambios.proveedor = { antes, despues };
        }
        if (Object.keys(cambios).length === 0) return { id, codigo: actual.codigo, nombre: actual.nombre };

        if (cambios.categoriaId) {
          // En la auditoría se guarda el nombre de la categoría, no su id.
          const nombres = await tx.categoria.findMany({
            where: { id: { in: [actual.categoriaId, datos.categoriaId] } },
            select: { id: true, nombre: true },
          });
          const nombreDe = (catId: string) => nombres.find((c) => c.id === catId)?.nombre ?? catId;
          cambios.categoria = { antes: nombreDe(actual.categoriaId), despues: nombreDe(datos.categoriaId) };
          delete cambios.categoriaId;
        }
        const insumo = await tx.insumo.update({
          where: { id },
          data: cambiaProveedor ? { ...nuevos, proveedorId: datos.proveedorId } : nuevos,
          select: { id: true, codigo: true, nombre: true },
        });
        await registrarAuditoria(tx, actor, {
          accion: "INSUMO_ACTUALIZADO",
          entidad: "Insumo",
          entidadId: id,
          detalle: comoJson({ codigo: insumo.codigo, nombre: insumo.nombre, cambios }),
        });
        return insumo;
      }),
    "Ya existe un insumo con ese código.",
    "codigo",
  );
}

/**
 * Asocia un código de barras a un insumo existente (flujo de escaneo: "no
 * reconocemos este código"). Si el insumo ya tenía otro, lo reemplaza; queda
 * en la auditoría con el valor anterior. El mismo producto no puede quedar en
 * dos insumos, aunque el código esté escrito de otra forma (EAN-13 / GTIN-14).
 * Permiso: `catalogo:gestionar`.
 */
export async function asociarCodigoBarras(
  actor: Actor,
  entrada: EntradaAsociarCodigoBarras,
): Promise<{ id: string; codigo: string; nombre: string; codigoBarras: string; anterior: string | null }> {
  verificarPermiso(actor, "catalogo:gestionar");
  const { insumoId, codigoBarras } = validar(esquemaAsociarCodigoBarras, entrada);
  return enTransaccion(async (tx) => {
    const actual = await tx.insumo.findUnique({
      where: { id: insumoId },
      select: { id: true, codigo: true, nombre: true, codigoBarras: true },
    });
    if (!actual) throw noEncontrado("El insumo");
    const equivalentes = [...new Set([codigoBarras, ...variantesGtin(codigoBarras)])];
    const otro = await tx.insumo.findFirst({
      where: { codigoBarras: { in: equivalentes }, id: { not: insumoId } },
      select: { nombre: true },
    });
    if (otro) {
      throw new ErrorDominio("DUPLICADO", `Ese código de barras ya lo usa "${otro.nombre}".`, { campo: "codigoBarras" });
    }
    if (actual.codigoBarras !== codigoBarras) {
      await tx.insumo.update({ where: { id: insumoId }, data: { codigoBarras } });
      await registrarAuditoria(tx, actor, {
        accion: "INSUMO_ACTUALIZADO",
        entidad: "Insumo",
        entidadId: insumoId,
        detalle: comoJson({
          codigo: actual.codigo,
          nombre: actual.nombre,
          cambios: { codigoBarras: { antes: actual.codigoBarras, despues: codigoBarras } },
          origen: "escaner",
        }),
      });
    }
    return { id: actual.id, codigo: actual.codigo, nombre: actual.nombre, codigoBarras, anterior: actual.codigoBarras };
  });
}

/**
 * Activa o desactiva un insumo. Un insumo inactivo no admite nuevos ingresos,
 * pero su stock e historial se conservan. Permiso: `catalogo:gestionar`.
 */
export async function establecerInsumoActivo(
  actor: Actor,
  insumoId: string,
  activo: boolean,
): Promise<{ id: string; activo: boolean }> {
  verificarPermiso(actor, "catalogo:gestionar");
  return enTransaccion(async (tx) => {
    const insumo = await tx.insumo.findUnique({
      where: { id: insumoId },
      select: { id: true, codigo: true, nombre: true, activo: true },
    });
    if (!insumo) throw noEncontrado("El insumo");
    if (insumo.activo !== activo) {
      await tx.insumo.update({ where: { id: insumoId }, data: { activo } });
      await registrarAuditoria(tx, actor, {
        accion: activo ? "INSUMO_ACTIVADO" : "INSUMO_DESACTIVADO",
        entidad: "Insumo",
        entidadId: insumoId,
        detalle: { codigo: insumo.codigo, nombre: insumo.nombre },
      });
    }
    return { id: insumoId, activo };
  });
}

/**
 * Elimina un insumo SOLO si nunca tuvo lotes ni movimientos (p. ej. creado
 * por error). Con historia se debe desactivar. Permiso: `catalogo:gestionar`.
 */
export async function eliminarInsumo(actor: Actor, insumoId: string): Promise<{ id: string }> {
  verificarPermiso(actor, "catalogo:gestionar");
  return enTransaccion(async (tx) => {
    const insumo = await tx.insumo.findUnique({
      where: { id: insumoId },
      select: { id: true, codigo: true, nombre: true, _count: { select: { lotes: true, movimientos: true } } },
    });
    if (!insumo) throw noEncontrado("El insumo");
    if (insumo._count.lotes > 0 || insumo._count.movimientos > 0) {
      throw new ErrorDominio(
        "EN_USO",
        `"${insumo.nombre}" tiene movimientos registrados y no se puede eliminar. Puedes desactivarlo.`,
      );
    }
    await tx.insumo.delete({ where: { id: insumoId } });
    await registrarAuditoria(tx, actor, {
      accion: "INSUMO_ELIMINADO",
      entidad: "Insumo",
      entidadId: insumoId,
      detalle: { codigo: insumo.codigo, nombre: insumo.nombre },
    });
    return { id: insumoId };
  });
}

/**
 * Guarda los parámetros de stock (mínimo / máximo) de un insumo para varios
 * centros a la vez. Una fila sin mínimo ni máximo elimina el parámetro de ese
 * centro. Solo se auditan los centros que realmente cambian (un registro por
 * institución afectada).
 * Permiso: `parametros:gestionar` EN CADA CENTRO: un administrador de
 * institución solo puede tocar los centros de su institución; si la entrada
 * trae un centro ajeno se rechaza todo (`SIN_ACCESO_AL_CENTRO`).
 */
export async function guardarParametrosStock(
  actor: Actor,
  entrada: EntradaParametrosStock,
): Promise<{ insumoId: string; actualizados: number }> {
  verificarPermiso(actor, "parametros:gestionar");
  const datos = validar(esquemaParametrosStock, entrada);
  const ids = datos.parametros.map((p) => p.centroId);
  if (new Set(ids).size !== ids.length) {
    throw new ErrorDominio("VALIDACION", "Hay centros repetidos en los parámetros.");
  }
  for (const centroId of ids) verificarPermiso(actor, "parametros:gestionar", centroId);

  return enTransaccion(async (tx) => {
    const insumo = await tx.insumo.findUnique({ where: { id: datos.insumoId }, select: { id: true, codigo: true, nombre: true } });
    if (!insumo) throw noEncontrado("El insumo");
    const [centros, actuales] = await Promise.all([
      tx.centro.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true, institucionId: true } }),
      tx.parametroStock.findMany({ where: { insumoId: insumo.id, centroId: { in: ids } } }),
    ]);
    const nombreCentro = new Map(centros.map((c) => [c.id, c.nombre]));
    const institucionDeCentro = new Map(centros.map((c) => [c.id, c.institucionId]));
    const actualPorCentro = new Map(actuales.map((p) => [p.centroId, p]));

    const cambios: { institucionId: string; centro: string; minimoAntes: number | null; minimoDespues: number | null; maximoAntes: number | null; maximoDespues: number | null }[] = [];
    for (const p of datos.parametros) {
      const centro = nombreCentro.get(p.centroId);
      if (centro === undefined) throw noEncontrado("El centro");
      const actual = actualPorCentro.get(p.centroId);
      const vacio = p.stockMinimo === undefined && p.stockMaximo === undefined;
      const minimo = vacio ? null : (p.stockMinimo ?? 0);
      const maximo = vacio ? null : (p.stockMaximo ?? null);
      const minimoAntes = actual ? actual.stockMinimo : null;
      const maximoAntes = actual ? actual.stockMaximo : null;
      if (minimo === minimoAntes && maximo === maximoAntes) continue;

      if (minimo === null) {
        await tx.parametroStock.deleteMany({ where: { insumoId: insumo.id, centroId: p.centroId } });
      } else {
        await tx.parametroStock.upsert({
          where: { insumoId_centroId: { insumoId: insumo.id, centroId: p.centroId } },
          create: { insumoId: insumo.id, centroId: p.centroId, stockMinimo: minimo, stockMaximo: maximo },
          update: { stockMinimo: minimo, stockMaximo: maximo },
        });
      }
      cambios.push({ institucionId: institucionDeCentro.get(p.centroId)!, centro, minimoAntes, minimoDespues: minimo, maximoAntes, maximoDespues: maximo });
    }

    // Un registro por institución: cada una ve solo los cambios de sus centros.
    for (const institucionId of [...new Set(cambios.map((c) => c.institucionId))].sort()) {
      await registrarAuditoria(tx, actor, {
        accion: "PARAMETROS_STOCK_ACTUALIZADOS",
        entidad: "Insumo",
        entidadId: insumo.id,
        institucionId,
        detalle: comoJson({
          codigo: insumo.codigo,
          nombre: insumo.nombre,
          centros: cambios
            .filter((c) => c.institucionId === institucionId)
            .map(({ institucionId: _institucion, ...cambio }) => {
              void _institucion;
              return cambio;
            }),
        }),
      });
    }
    return { insumoId: insumo.id, actualizados: cambios.length };
  });
}
