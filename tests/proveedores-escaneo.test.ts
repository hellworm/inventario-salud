import { beforeAll, describe, expect, it } from "vitest";
import { dominioDeSitioWeb, esquemaProveedor, normalizarSitioWeb } from "@/lib/esquemas/proveedores";
import { db } from "@/server/db";
import {
  actualizarProveedor,
  asociarCodigoBarras,
  buscarInsumoPorCodigo,
  crearProveedor,
  establecerProveedorActivo,
  listarDirectorioProveedores,
  listarProveedoresAdmin,
  registrarIngreso,
} from "@/server/servicios";
import { crearEscenario, esperarError, type Escenario } from "./soporte/escenario";

describe("sitio web del proveedor: validación estricta", () => {
  it("normaliza y agrega https:// si falta", () => {
    expect(normalizarSitioWeb("www.ejemplo-insumos.cl")).toBe("https://www.ejemplo-insumos.cl/");
    expect(normalizarSitioWeb("  ejemplo-insumos.cl/tienda?cat=1  ")).toBe("https://ejemplo-insumos.cl/tienda?cat=1");
    expect(normalizarSitioWeb("HTTPS://WWW.Ejemplo.CL/Compras")).toBe("https://www.ejemplo.cl/Compras");
    expect(normalizarSitioWeb("http://ejemplo.cl")).toBe("http://ejemplo.cl/");
    expect(normalizarSitioWeb("ejemplo.cl:8443/pedidos")).toBe("https://ejemplo.cl:8443/pedidos");
    expect(dominioDeSitioWeb("https://www.ejemplo-insumos.cl/tienda")).toBe("www.ejemplo-insumos.cl");
    expect(dominioDeSitioWeb("no es url")).toBe("");
  });

  it("rechaza todo lo que no sea http(s) con un dominio real", () => {
    const malas = [
      "javascript:alert(1)",
      "JavaScript:alert(document.cookie)",
      " javascript:alert(1)",
      "java\tscript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "ftp://ejemplo.cl/archivo",
      "mailto:ventas@ejemplo.cl",
      "tel:+56912345678",
      "//ejemplo.cl",
      "https://",
      "https://usuario:clave@ejemplo.cl/",
      "https://ejemplo.cl/<script>",
      'https://ejemplo.cl/"onmouseover="x',
      "https://ejemplo .cl",
      "http://localhost:3000",
      "http://192.168.0.10/admin",
      "ejemplo",
      "https://ejemplo.cl/\u0000",
      "https://ejemplo.cl/" + "a".repeat(300),
      "",
      "   ",
    ];
    for (const mala of malas) expect(normalizarSitioWeb(mala), JSON.stringify(mala)).toBeNull();
  });

  it("el esquema del proveedor entrega la URL normalizada o undefined", () => {
    const base = { rut: "76.123.456-0", razonSocial: "Proveedor" };
    expect(esquemaProveedor.parse({ ...base, sitioWeb: "www.ejemplo.cl" }).sitioWeb).toBe("https://www.ejemplo.cl/");
    expect(esquemaProveedor.parse({ ...base, sitioWeb: "" }).sitioWeb).toBeUndefined();
    expect(esquemaProveedor.parse(base).sitioWeb).toBeUndefined();
    const mala = esquemaProveedor.safeParse({ ...base, sitioWeb: "javascript:alert(1)" });
    expect(mala.success).toBe(false);
    expect(mala.error?.issues[0]).toMatchObject({ path: ["sitioWeb"], message: "Ingresa un sitio web válido, p. ej. www.ejemplo.cl." });
  });
});

describe("proveedores: sitio web, directorio y permisos", () => {
  let e: Escenario;
  let idDos: string;

  beforeAll(async () => {
    e = await crearEscenario();
    idDos = (await crearProveedor(e.admin, { rut: "77.058.612-7", razonSocial: "Ándes Insumos Ltda.", sitioWeb: "ejemplo-andes.cl", telefono: "+56 2 2345 6789", email: "Ventas@Ejemplo-Andes.cl", contacto: "Ana Rojas" })).id;
  });

  it("crear y editar guardan el sitio normalizado y lo auditan", async () => {
    const fila = await db.proveedor.findUniqueOrThrow({ where: { id: idDos } });
    expect(fila.sitioWeb).toBe("https://ejemplo-andes.cl/");
    await actualizarProveedor(e.admin, { id: idDos, rut: "77058612-7", razonSocial: "Ándes Insumos Ltda.", sitioWeb: "https://tienda.ejemplo-andes.cl/compras", telefono: "+56 2 2345 6789", email: "ventas@ejemplo-andes.cl", contacto: "Ana Rojas" });
    expect((await db.proveedor.findUniqueOrThrow({ where: { id: idDos } })).sitioWeb).toBe("https://tienda.ejemplo-andes.cl/compras");
    const auditoria = await db.registroAuditoria.findFirstOrThrow({ where: { accion: "PROVEEDOR_ACTUALIZADO", entidadId: idDos } });
    expect(auditoria.detalle).toMatchObject({
      cambios: { sitioWeb: { antes: "https://ejemplo-andes.cl/", despues: "https://tienda.ejemplo-andes.cl/compras" } },
    });
    const error = await esperarError(
      actualizarProveedor(e.admin, { id: idDos, rut: "77058612-7", razonSocial: "X", sitioWeb: "javascript:alert(1)" }),
      "VALIDACION",
    );
    expect(error.message).toBeTruthy();
    expect((await listarProveedoresAdmin(e.admin, { texto: "andes" })).items[0]).toMatchObject({ sitioWeb: "https://tienda.ejemplo-andes.cl/compras" });
  });

  it("la base de datos tampoco admite un enlace que no sea http(s)", async () => {
    for (const malo of ["javascript:alert(1)", "data:text/html,x", "https://ejemplo.cl/ con espacio", `https://ejemplo.cl/${"a".repeat(300)}`]) {
      await expect(db.proveedor.update({ where: { id: idDos }, data: { sitioWeb: malo } }), malo).rejects.toThrow();
    }
    expect((await db.proveedor.findUniqueOrThrow({ where: { id: idDos } })).sitioWeb).toBe("https://tienda.ejemplo-andes.cl/compras");
  });

  it("directorio: solo activos, con contacto; primero el usado más recientemente en los centros del actor", async () => {
    // Sin ingresos: orden alfabético (sin distinguir la tilde inicial lo decide la base: se comprueba por contenido).
    const inicial = await listarDirectorioProveedores(e.admin);
    expect(inicial.total).toBe(2);
    expect(inicial.items.map((p) => p.razonSocial).sort()).toEqual(["Proveedor Uno SpA", "Ándes Insumos Ltda."].sort());
    expect(inicial.items.find((p) => p.id === idDos)).toMatchObject({
      rut: "77058612-7",
      telefono: "+56 2 2345 6789",
      email: "ventas@ejemplo-andes.cl",
      contacto: "Ana Rojas",
      sitioWeb: "https://tienda.ejemplo-andes.cl/compras",
      ultimoIngreso: null,
    });

    // Un ingreso en el centro B con "Proveedor Uno": pasa primero para quien ve el centro B…
    await registrarIngreso(e.admin, { ubicacionId: e.bodegaB, insumoId: e.guantes, numeroLote: "P-1", fechaVencimiento: e.dia(300), cantidad: 5, proveedorId: e.proveedor });
    expect((await listarDirectorioProveedores(e.bodegueroB)).items[0]).toMatchObject({ id: e.proveedor });
    expect((await listarDirectorioProveedores(e.admin)).items[0]?.id).toBe(e.proveedor);
    // …y un ingreso posterior en el centro A con el otro proveedor lo deja primero para el centro A.
    await registrarIngreso(e.admin, { ubicacionId: e.bodegaA, insumoId: e.guantes, numeroLote: "P-2", fechaVencimiento: e.dia(300), cantidad: 5, proveedorId: idDos });
    expect((await listarDirectorioProveedores(e.bodeguero)).items[0]?.id).toBe(idDos);
    expect((await listarDirectorioProveedores(e.admin, { centroId: e.centroB })).items[0]?.id).toBe(e.proveedor);
    // El bodeguero del centro B no ve (ni le ordena) el uso del centro A.
    const deB = await listarDirectorioProveedores(e.bodegueroB);
    expect(deB.items.map((p) => [p.id, p.ultimoIngreso !== null])).toEqual([
      [e.proveedor, true],
      [idDos, false],
    ]);

    // Límite, búsqueda sin tildes y orden por nombre.
    const limitado = await listarDirectorioProveedores(e.admin, { limite: 1 });
    expect(limitado.items).toHaveLength(1);
    expect(limitado.total).toBe(2);
    expect((await listarDirectorioProveedores(e.admin, { texto: "andes" })).items.map((p) => p.id)).toEqual([idDos]);
    expect((await listarDirectorioProveedores(e.admin, { texto: "ana rojas" })).total).toBe(1);

    await establecerProveedorActivo(e.admin, idDos, false);
    expect((await listarDirectorioProveedores(e.admin)).items.map((p) => p.id)).toEqual([e.proveedor]);
    await establecerProveedorActivo(e.admin, idDos, true);
  });

  it("los tres roles leen el directorio; solo el administrador gestiona", async () => {
    for (const actor of [e.admin, e.bodeguero, e.visitante]) {
      expect((await listarDirectorioProveedores(actor)).total).toBe(2);
    }
    await esperarError(listarDirectorioProveedores(e.visitante, { centroId: e.centroB }), "SIN_ACCESO_AL_CENTRO");
    await esperarError(crearProveedor(e.bodeguero, { rut: "96.754.380-2", razonSocial: "No" }), "SIN_PERMISO");
    await esperarError(actualizarProveedor(e.visitante, { id: idDos, rut: "77058612-7", razonSocial: "No" }), "SIN_PERMISO");
    await esperarError(establecerProveedorActivo(e.bodeguero, idDos, false), "SIN_PERMISO");
  });

  it("un enlace inválido que ya estuviera guardado nunca llega a la interfaz", async () => {
    // Simula un dato importado por fuera de la aplicación (pasa el CHECK pero no la validación completa).
    await db.proveedor.update({ where: { id: idDos }, data: { sitioWeb: "https://usuario:clave@ejemplo.cl/" } });
    expect((await listarDirectorioProveedores(e.admin)).items.find((p) => p.id === idDos)?.sitioWeb).toBeNull();
  });
});

describe("búsqueda por código escaneado y asociación del código", () => {
  let e: Escenario;
  const EAN = "7804100000006";

  beforeAll(async () => {
    e = await crearEscenario();
    await db.insumo.update({ where: { id: e.dializador }, data: { codigoBarras: EAN } });
    await db.insumo.update({ where: { id: e.insumoInactivo }, data: { codigoBarras: "OLD-BARRA-1" } });
  });

  it("encuentra el insumo por EAN-13, GTIN-14 o cadena GS1 y devuelve lote y vencimiento", async () => {
    for (const leido of [EAN, `0${EAN}`, " 780 4100 000006 "]) {
      const r = await buscarInsumoPorCodigo(e.bodeguero, leido);
      expect(r.coincidencias.map((c) => c.codigo), leido).toEqual(["DIA-001"]);
      expect(r.codigo).toMatchObject({ tipo: "GTIN", gtin: `0${EAN}`, lote: null });
    }
    const gs1 = await buscarInsumoPorCodigo(e.bodeguero, `]d2010${EAN}17300531\u001d10L2611-045`.replace("\u001d10", "10"));
    expect(gs1.coincidencias.map((c) => c.id)).toEqual([e.dializador]);
    expect(gs1.codigo).toMatchObject({ tipo: "GS1", codigo: EAN, lote: "L2611-045", vencimiento: "2030-05-31" });
    expect(gs1.coincidencias[0]).toMatchObject({ activo: true, unidadMedida: "unidad", controlaVencimiento: true });

    const conParentesis = await buscarInsumoPorCodigo(e.visitante, `(01)0${EAN}(10)AB-1(17)300500`);
    expect(conParentesis.coincidencias).toHaveLength(1);
    expect(conParentesis.codigo).toMatchObject({ lote: "AB-1", vencimiento: "2030-05-31" });
  });

  it("también cuando el catálogo guarda el código como GTIN-14", async () => {
    await db.insumo.update({ where: { id: e.dializador }, data: { codigoBarras: `0${EAN}` } });
    expect((await buscarInsumoPorCodigo(e.admin, EAN)).coincidencias.map((c) => c.codigo)).toEqual(["DIA-001"]);
    await db.insumo.update({ where: { id: e.dializador }, data: { codigoBarras: EAN } });
  });

  it("un código que no es GTIN se busca exacto como código de barras o código interno", async () => {
    expect((await buscarInsumoPorCodigo(e.admin, "gua-001")).coincidencias.map((c) => c.codigo)).toEqual(["GUA-001"]);
    const inactivo = await buscarInsumoPorCodigo(e.admin, "OLD-BARRA-1");
    expect(inactivo.coincidencias).toMatchObject([{ codigo: "OLD-001", activo: false }]);
    expect((await buscarInsumoPorCodigo(e.admin, "GUA")).coincidencias).toEqual([]); // no es búsqueda parcial
  });

  it("sin coincidencia devuelve el código interpretado (con lote y fechas) y ninguna fila", async () => {
    const r = await buscarInsumoPorCodigo(e.bodeguero, "(01)04006381333931(17)300531(10)X9");
    expect(r.coincidencias).toEqual([]);
    expect(r.codigo).toMatchObject({ tipo: "GS1", codigo: "4006381333931", lote: "X9", vencimiento: "2030-05-31" });
    expect(await buscarInsumoPorCodigo(e.bodeguero, "   ")).toEqual({ codigo: null, coincidencias: [] });
    // Comodines y comillas son texto literal.
    expect((await buscarInsumoPorCodigo(e.bodeguero, "%")).coincidencias).toEqual([]);
    expect((await buscarInsumoPorCodigo(e.bodeguero, "' OR 1=1 --")).coincidencias).toEqual([]);
  });

  it("asociar el código: solo quien gestiona el catálogo, auditado y sin duplicar productos", async () => {
    await esperarError(asociarCodigoBarras(e.bodeguero, { insumoId: e.guantes, codigoBarras: "4006381333931" }), "SIN_PERMISO");
    await esperarError(asociarCodigoBarras(e.visitante, { insumoId: e.guantes, codigoBarras: "4006381333931" }), "SIN_PERMISO");

    const r = await asociarCodigoBarras(e.admin, { insumoId: e.guantes, codigoBarras: "4006381333931" });
    expect(r).toMatchObject({ codigo: "GUA-001", codigoBarras: "4006381333931", anterior: null });
    expect((await buscarInsumoPorCodigo(e.bodeguero, "04006381333931")).coincidencias.map((c) => c.codigo)).toEqual(["GUA-001"]);
    const auditoria = await db.registroAuditoria.findMany({ where: { accion: "INSUMO_ACTUALIZADO", entidadId: e.guantes } });
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]).toMatchObject({ usuarioId: e.admin.usuarioId });
    expect(auditoria[0]!.detalle).toMatchObject({
      codigo: "GUA-001",
      origen: "escaner",
      cambios: { codigoBarras: { antes: null, despues: "4006381333931" } },
    });

    // Repetir lo mismo no vuelve a auditar.
    await asociarCodigoBarras(e.admin, { insumoId: e.guantes, codigoBarras: "4006381333931" });
    expect(await db.registroAuditoria.count({ where: { accion: "INSUMO_ACTUALIZADO", entidadId: e.guantes } })).toBe(1);

    // El mismo producto (aunque venga como GTIN-14) no puede quedar en otro insumo.
    const duplicado = await esperarError(asociarCodigoBarras(e.admin, { insumoId: e.tela, codigoBarras: `0${EAN}` }), "DUPLICADO");
    expect(duplicado.message).toContain("Dializador");
    await esperarError(asociarCodigoBarras(e.admin, { insumoId: e.tela, codigoBarras: "con espacios" }), "VALIDACION");
    await esperarError(asociarCodigoBarras(e.admin, { insumoId: "no-existe", codigoBarras: "ABC-1" }), "NO_ENCONTRADO");

    // Reemplazar el código de un insumo deja el anterior en la auditoría.
    const reemplazo = await asociarCodigoBarras(e.admin, { insumoId: e.guantes, codigoBarras: "036000291452" });
    expect(reemplazo.anterior).toBe("4006381333931");
    expect((await buscarInsumoPorCodigo(e.admin, "4006381333931")).coincidencias).toEqual([]);
  });
});
