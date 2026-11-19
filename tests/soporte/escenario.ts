import type { Actor } from "@/lib/permisos";
import { hoyEnSantiago, sumarDias, type DiaISO } from "@/lib/fechas";
import { db } from "@/server/db";
import { ErrorDominio, type CodigoError } from "@/server/errores";
import { expect } from "vitest";

/** Borra todos los datos de la base de tests. */
export async function limpiarBD(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (!/_test(\?|$)/.test(url)) throw new Error("Los tests solo pueden limpiar una base *_test");
  // El libro mayor y la auditoría son inmutables (triggers contra UPDATE, DELETE
  // y TRUNCATE). SOLO aquí, en la base de tests, se deshabilitan esos triggers
  // durante la limpieza, dentro de una transacción que los vuelve a habilitar.
  const INMUTABLES = ["movimientos", "registros_auditoria"];
  await db.$transaction([
    ...INMUTABLES.map((t) => db.$executeRawUnsafe(`ALTER TABLE "${t}" DISABLE TRIGGER USER`)),
    db.$executeRawUnsafe(`
      TRUNCATE TABLE "registros_auditoria", "movimientos", "existencias", "lotes", "parametros_stock",
        "proveedores", "insumos", "categorias", "sesiones", "usuarios_centros", "usuarios",
        "ubicaciones", "centros", "intentos_login" RESTART IDENTITY CASCADE
    `),
    ...INMUTABLES.map((t) => db.$executeRawUnsafe(`ALTER TABLE "${t}" ENABLE TRIGGER USER`)),
  ]);
}

export interface Escenario {
  hoy: DiaISO;
  /** Día relativo a hoy (Santiago). */
  dia: (desplazamiento: number) => DiaISO;
  centroA: string;
  centroB: string;
  bodegaA: string;
  salaA: string;
  bodegaB: string;
  ubicacionInactivaA: string;
  /** Controla vencimiento. */
  dializador: string;
  /** Controla vencimiento. */
  guantes: string;
  /** NO controla vencimiento. */
  tela: string;
  insumoInactivo: string;
  proveedor: string;
  admin: Actor;
  /** Bodeguero asignado solo al centro A. */
  bodeguero: Actor;
  /** Visitante asignado solo al centro A. */
  visitante: Actor;
  /** Bodeguero asignado solo al centro B. */
  bodegueroB: Actor;
}

/** Limpia la base y crea un escenario mínimo: 2 centros, 3 insumos, 4 usuarios. */
export async function crearEscenario(): Promise<Escenario> {
  await limpiarBD();
  const hoy = hoyEnSantiago();

  const [centroA, centroB] = await Promise.all([
    db.centro.create({
      data: { nombre: "Centro A", tipo: "DIALISIS", direccion: "Av. Uno 100", comuna: "Ñuñoa", region: "Metropolitana de Santiago" },
    }),
    db.centro.create({
      data: { nombre: "Centro B", tipo: "CONSULTORIO", direccion: "Calle Dos 200", comuna: "Valparaíso", region: "Valparaíso" },
    }),
  ]);
  const bodegaA = await db.ubicacion.create({ data: { centroId: centroA.id, nombre: "Bodega", tipo: "BODEGA" } });
  const salaA = await db.ubicacion.create({ data: { centroId: centroA.id, nombre: "Sala 1", tipo: "SALA" } });
  const inactivaA = await db.ubicacion.create({
    data: { centroId: centroA.id, nombre: "Bodega antigua", tipo: "BODEGA", activo: false },
  });
  const bodegaB = await db.ubicacion.create({ data: { centroId: centroB.id, nombre: "Bodega", tipo: "BODEGA" } });

  const categoria = await db.categoria.create({ data: { nombre: "General" } });
  const crearInsumo = (codigo: string, nombre: string, extra: { controlaVencimiento?: boolean; activo?: boolean } = {}) =>
    db.insumo.create({
      data: { codigo, nombre, categoriaId: categoria.id, unidadMedida: "unidad", ...extra },
    });
  const dializador = await crearInsumo("DIA-001", "Dializador 1.8 m²");
  const guantes = await crearInsumo("GUA-001", "Guantes de nitrilo M");
  const tela = await crearInsumo("TEL-001", "Tela adhesiva", { controlaVencimiento: false });
  const inactivo = await crearInsumo("OLD-001", "Insumo descontinuado", { activo: false });

  const proveedor = await db.proveedor.create({ data: { rut: "76123456-0", razonSocial: "Proveedor Uno SpA" } });

  const crearUsuario = async (email: string, rol: Actor["rol"], centros: string[]): Promise<Actor> => {
    const u = await db.usuario.create({
      data: {
        nombre: email.split("@")[0]!,
        email,
        passwordHash: "sin-uso-en-estos-tests",
        rol,
        debeCambiarPassword: false,
        centros: { create: centros.map((centroId) => ({ centroId })) },
      },
    });
    return { usuarioId: u.id, rol, centroIds: centros, ip: "127.0.0.1" };
  };

  return {
    hoy,
    dia: (n) => sumarDias(hoy, n),
    centroA: centroA.id,
    centroB: centroB.id,
    bodegaA: bodegaA.id,
    salaA: salaA.id,
    bodegaB: bodegaB.id,
    ubicacionInactivaA: inactivaA.id,
    dializador: dializador.id,
    guantes: guantes.id,
    tela: tela.id,
    insumoInactivo: inactivo.id,
    proveedor: proveedor.id,
    admin: await crearUsuario("admin@test.cl", "ADMIN", []),
    bodeguero: await crearUsuario("bodega@test.cl", "BODEGUERO", [centroA.id]),
    visitante: await crearUsuario("visita@test.cl", "VISITANTE", [centroA.id]),
    bodegueroB: await crearUsuario("bodegab@test.cl", "BODEGUERO", [centroB.id]),
  };
}

/** Afirma que la promesa falla con un `ErrorDominio` del código dado. */
export async function esperarError(promesa: Promise<unknown>, codigo: CodigoError): Promise<ErrorDominio> {
  let capturado: unknown;
  try {
    await promesa;
  } catch (error) {
    capturado = error;
  }
  expect(capturado, `se esperaba ErrorDominio ${codigo}`).toBeInstanceOf(ErrorDominio);
  const error = capturado as ErrorDominio;
  expect(error.codigo).toBe(codigo);
  return error;
}

/** Stock de un lote en una ubicación (0 si no hay fila). */
export async function stockDe(loteId: string, ubicacionId: string): Promise<number> {
  const e = await db.existencia.findUnique({ where: { loteId_ubicacionId: { loteId, ubicacionId } } });
  return e?.cantidad ?? 0;
}

/** Stock total de un insumo en una ubicación. */
export async function stockInsumo(insumoId: string, ubicacionId: string): Promise<number> {
  const r = await db.existencia.aggregate({
    where: { ubicacionId, lote: { insumoId } },
    _sum: { cantidad: true },
  });
  return r._sum.cantidad ?? 0;
}

/**
 * Crea un lote YA VENCIDO con stock, directo en la BD (el servicio de ingreso
 * no permite ingresar lotes vencidos).
 */
export async function sembrarLoteVencido(
  insumoId: string,
  ubicacionId: string,
  cantidad: number,
  numeroLote = "VENCIDO-1",
  diasVencido = 5,
): Promise<string> {
  const lote = await db.lote.create({
    data: {
      insumoId,
      numeroLote,
      fechaVencimiento: new Date(`${sumarDias(hoyEnSantiago(), -diasVencido)}T00:00:00.000Z`),
    },
  });
  await db.existencia.create({ data: { loteId: lote.id, ubicacionId, cantidad } });
  return lote.id;
}
