# RedInsumos — Arquitectura y guía para construir sobre la base

Inventario en red de insumos médicos (Chile). Este documento es el **contrato** entre los
cimientos y las pantallas. Si algo de aquí no calza con el código, manda el código y se corrige
este documento.

## 1. Stack y decisiones

| Tema | Decisión |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript estricto |
| Estilos | Tailwind CSS 4 (tokens en `src/app/globals.css`), fuente Geist (paquete npm, sin red) |
| Datos | PostgreSQL 16 + Prisma **6.19.3 fijado** (no subir a 7/8) |
| Validación | zod 4, esquemas isomórficos en `src/lib/esquemas` |
| Auth | Propia: argon2id, sesiones en BD (solo hash SHA-256 del token), cookie httpOnly |
| UI | Kit propio en `src/components/ui` + primitivas Radix + íconos `lucide-react` |
| Tests | vitest contra la base real `medired_test` |

**Next 16 no es el Next que conoces.** Antes de usar una API, revisa
`node_modules/next/dist/docs/`. Lo que ya está resuelto aquí:

- `middleware` ahora es **`src/proxy.ts`** (export `proxy`).
- `params`, `searchParams`, `cookies()` y `headers()` son **asíncronos** (`await`).
- Los tipos globales `PageProps<"/ruta">` y `LayoutProps<"/ruta">` los genera `next typegen`
  (lo ejecuta `npm run typecheck`). Si agregas una ruta y el tipo falla, corre `npx next typegen`.
- **No usamos Cache Components** (`cacheComponents` desactivado): todo depende de la sesión y del
  stock en tiempo real, así que cada página se renderiza por solicitud. No uses `"use cache"`.
- Server Actions: un archivo `"use server"` solo puede exportar funciones async (y tipos).

## 2. Estructura de carpetas

```
prisma/
  schema.prisma            Modelo de datos (tablas snake_case con @@map, columnas camelCase)
  migrations/              Migración inicial (+ CHECKs, trigger de inmutabilidad, unaccent)
  seed.ts                  Seed demo (referencia idempotente + historial vía servicios)
src/
  proxy.ts                 Redirección optimista a /login y renovación de cookie (sin BD)
  app/
    layout.tsx             Raíz: <html lang="es-CL">, fuentes, <Toaster/>
    (auth)/                /login y /cambiar-password (layout de dos paneles)
    (app)/                 Área autenticada: layout con AppShell, loading, error, sin-permiso
      panel/               Implementado (mínimo real)             → agente C lo amplía
      inventario/, movimientos/…                                  → agente A
      alertas/, reportes/                                         → agente C
      admin/…                                                     → agente B
  acciones/                Server Actions ("use server"): auth.ts, movimientos.ts
  components/
    ui/                    UI kit (importar SIEMPRE desde "@/components/ui")
    shell/                 AppShell (sidebar, barra superior, navegación inferior), Logo
    en-construccion.tsx    Marcador de las páginas pendientes (bórralo al implementar)
  lib/                     Código ISOMÓRFICO (cliente y servidor), sin acceso a BD
    permisos.ts            ★ Fuente única de verdad de roles y permisos
    navegacion.ts          Mapa de navegación filtrado por permiso
    estados.ts             Estados de stock/vencimiento, etiquetas, motivos, enums de UI
    fechas.ts, formato.ts  Fechas America/Santiago, números es-CL, CLP
    chile/                 rut.ts, regiones.ts
    esquemas/              Esquemas zod (base.ts, movimientos.ts, auth.ts)
    resultado.ts           ResultadoAccion<T>, Paginado<T>
  server/                  SOLO servidor (todos importan "server-only")
    db.ts                  Cliente Prisma singleton + enTransaccion()
    errores.ts             ErrorDominio y códigos
    autorizacion.ts        verificarPermiso(), alcanceDeCentros()
    auditoria.ts           registrarAuditoria()
    validacion.ts          validar(esquema, datos), erroresDeZod()
    accion-segura.ts       ★ accionSegura(): patrón de toda Server Action
    auth/                  password.ts, autenticacion.ts (núcleo), sesion.ts (cookies/Next)
    servicios/             ★ Capa de servicios (única puerta a los datos de negocio)
tests/                     vitest (servicios, permisos, concurrencia, auth, utilidades)
docs/                      Este documento y capturas
```

Reglas de dependencia: `app` y `acciones` → `server/servicios` → `server/db`. Las páginas y
acciones **no usan Prisma directamente**; si falta una consulta, se agrega un servicio.
`src/lib` nunca importa de `src/server`.

## 3. Modelo de datos (resumen)

`Centro` 1—N `Ubicacion`. `Usuario` N—M `Centro` (`UsuarioCentro`). `Insumo` (catálogo común) N—1
`Categoria`. `ParametroStock` (insumo × centro: mínimo/máximo). `Lote` (insumo + número, vencimiento).
`Existencia` (lote × ubicación → `cantidad`, con `CHECK (cantidad >= 0)`). `Movimiento` = libro mayor
**inmutable** (un trigger SQL rechaza UPDATE/DELETE). `Proveedor` (RUT único normalizado),
`Sesion`, `RegistroAuditoria`.

- Ids: `cuid` (string). `Movimiento.cantidad` siempre > 0; el signo lo da el tipo
  (`SIGNO_MOVIMIENTO` en `lib/estados`).
- `Movimiento.saldoPosterior` = saldo **del lote en esa ubicación** después del movimiento.
- `fechaVencimiento` / `fechaFabricacion` son columnas `DATE`: Prisma las entrega como `Date` a
  medianoche UTC. Los servicios ya las devuelven como texto `YYYY-MM-DD` (`DiaISO`).
- Emails en minúsculas (CHECK en BD). RUT guardado como `76123456-7`.
- Nunca se borran centros, ubicaciones, insumos, proveedores ni usuarios con historia: se
  **desactivan** (`activo = false`). Las FK son `Restrict`.

## 4. Permisos

Fuente única: `src/lib/permisos.ts` (`PERMISOS_POR_ROL`, `puede`, `puedeEnCentro`).

| Permiso | ADMIN | BODEGUERO | VISITANTE |
|---|:-:|:-:|:-:|
| `panel:ver`, `inventario:ver`, `alertas:ver`, `catalogo:ver` | ✔ | ✔ sus centros | ✔ sus centros |
| `movimientos:ver`, `proveedores:ver` | ✔ | ✔ sus centros | — |
| `movimientos:ingreso`, `movimientos:retiro` | ✔ | ✔ sus centros | — |
| `movimientos:ajuste`, `movimientos:merma`, `movimientos:traslado` | ✔ | — | — |
| `reportes:ver`, `auditoria:ver` | ✔ | — | — |
| `catalogo:gestionar`, `centros:gestionar`, `usuarios:gestionar`, `proveedores:gestionar`, `parametros:gestionar` | ✔ | — | — |

ADMIN ve toda la red; los demás solo sus centros asignados. La autorización se valida **siempre
en el servidor y en tres capas**: página (`contextoPagina`), acción (`accionSegura`) y servicio
(`verificarPermiso(actor, permiso, centroId)` con el centro real del dato). En la UI, `puede(rol,
permiso)` solo decide qué se muestra.

Para un permiso nuevo: agrégalo a `PERMISOS` y a la matriz en `permisos.ts`, actualiza
`tests/permisos.test.ts` y esta tabla.

## 5. Autenticación y sesión

- Login email + contraseña (argon2id). Mensaje único de error (no revela si el email existe ni si
  está bloqueado). 5 intentos fallidos → bloqueo de 15 min.
- Sesión: token aleatorio de 32 bytes en cookie `ri_sesion` (httpOnly, sameSite=lax, secure en
  producción); en BD solo su SHA-256. Expiración deslizante de 12 h (`SESION_HORAS`), vida máxima
  absoluta de 7 días. `proxy.ts` renueva la cookie; la BD se renueva en `validarTokenSesion`.
- `debeCambiarPassword` obliga a pasar por `/cambiar-password` (≥10 caracteres, letra y número,
  distinta de la actual). Cambiar la contraseña cierra las demás sesiones.
- Desactivar un usuario elimina sus sesiones (`establecerUsuarioActivo`) y, además, toda sesión de
  un usuario inactivo se rechaza al validarse.

Helpers (`@/server/auth/sesion`):

| Helper | Uso |
|---|---|
| `obtenerSesion()` | `Sesion \| null`, memoizada por solicitud. |
| `requerirSesion()` | Redirige a `/login` (o `/cambiar-password`). |
| `requerirPermiso(permiso, centroId?)` | Para páginas/layouts: redirige a `/sin-permiso`. |
| `contextoPagina(permiso)` | ★ Lo normal en una página: `{ sesion, actor, centroId, centro, centros, puedeVerTodaLaRed }`. |
| `obtenerCentroActivo(sesion)` | Centro activo (cookie `ri_centro`); `centroId: null` = "Toda la red" (solo ADMIN). |

**Para agente B (usuarios):** al crear usuarios usa `hashearPassword` y `validarPoliticaPassword`
(`@/server/auth/password`), guarda el email con `normalizarEmail`, deja `debeCambiarPassword: true`
con una contraseña temporal, y llama a `invalidarSesionesDeUsuario(usuarioId)`
(`@/server/auth/autenticacion`) cuando cambies rol, centros asignados o restablezcas la clave.

## 6. Capa de servicios (`@/server/servicios`)

Todos reciben `actor: Actor` como primer argumento (`sesion.actor`) y validan permiso + centro.
Lanzan `ErrorDominio` (ver §8). Las mutaciones corren en una transacción con `SELECT … FOR UPDATE`
sobre las existencias, escriben el movimiento y la auditoría de forma atómica, y reintentan ante
interbloqueos. El tercer argumento `{ ahora }` existe solo para seed y tests: **no lo uses**.

### Mutaciones (`movimientos.ts`)

```ts
registrarIngreso(actor, entrada: EntradaIngreso): Promise<ResultadoIngreso>
  // { ubicacionId, insumoId, numeroLote, fechaVencimiento?, fechaFabricacion?, cantidad,
  //   proveedorId?, documentoRef?, costoUnitario?, nota? }
  // → { movimiento: MovimientoRegistrado, loteCreado: boolean }
registrarRetiro(actor, entrada: EntradaRetiro): Promise<ResultadoRetiro>
  // { ubicacionId, insumoId, cantidad, loteId?, motivo?, documentoRef?, nota? }
  // sin loteId = FEFO automático (puede consumir varios lotes)
  // → { movimientos: MovimientoRegistrado[], cantidadTotal }
registrarAjuste(actor, entrada: EntradaAjuste): Promise<MovimientoRegistrado>
  // { ubicacionId, loteId, sentido: "POSITIVO" | "NEGATIVO", cantidad, motivo, nota? }
registrarMerma(actor, entrada: EntradaMerma): Promise<MovimientoRegistrado>
  // { ubicacionId, loteId, cantidad, motivo, nota? }
registrarTraslado(actor, entrada: EntradaTraslado): Promise<ResultadoTraslado>
  // { loteId, ubicacionOrigenId, ubicacionDestinoId, cantidad, motivo?, nota? }
  // → { trasladoGrupoId, salida, entrada }

interface MovimientoRegistrado { id; tipo; insumoId; loteId; numeroLote; ubicacionId; centroId;
                                 cantidad; saldoPosterior; creadoEn }
```

Los tipos `Entrada*` salen de los esquemas zod de `@/lib/esquemas/movimientos` (aceptan los textos
de un formulario: `cantidad: "24"`, fechas `YYYY-MM-DD` o `dd-MM-yyyy`, `""` como vacío).

Reglas de negocio:

- **Ingreso:** el lote se identifica por insumo + `numeroLote` (se guarda en mayúsculas). Si existe
  se reutiliza; indicar un vencimiento distinto al registrado → `LOTE_INCONSISTENTE`. Si el insumo
  `controlaVencimiento`, el lote debe tener fecha → `VENCIMIENTO_REQUERIDO`. No se ingresan lotes
  vencidos → `LOTE_VENCIDO`. Ubicación, centro, insumo y proveedor deben estar activos → `INACTIVO`.
- **Retiro:** FEFO ordena por vencimiento (sin fecha al final) dentro de la ubicación. **Nunca**
  retira lotes vencidos (`LOTE_VENCIDO` si se pide uno; FEFO los salta). Sin stock vigente
  suficiente → `STOCK_INSUFICIENTE` con `detalle: { solicitado, disponible, vencido }`.
- **Merma:** única salida para lotes vencidos. Motivo obligatorio (`MOTIVOS_MERMA` sugiere valores).
- **Ajuste:** motivo obligatorio (`MOTIVOS_AJUSTE`). El positivo puede crear la existencia del
  lote en la ubicación. Para "conteo", la UI calcula la diferencia y envía sentido + cantidad.
- **Traslado:** exige permiso en el centro de origen y en el de destino; origen ≠ destino. Permite
  mover lotes vencidos (p. ej. a cuarentena).
- Un lote vence al **terminar** su día de vencimiento (ese día aún se puede usar), hora de Chile.

### Consultas

```ts
// inventario.ts
listarInventario(actor, filtros?: FiltrosInventario): Promise<Paginado<FilaInventario>>
  // filtros: { centroId?, ubicacionId?, categoriaId?, texto?, estado?, pagina?, porPagina? }
  // estado: "SIN_STOCK" | "BAJO_MINIMO" | "OK" | "VENCIDO" | "POR_VENCER"
detalleInsumo(actor, insumoId, { centroId? }?): Promise<DetalleInsumo>
  // { insumo, total, vencido, disponible, porVencer, stockMinimo, estadoStock,
  //   estadoVencimiento, proximoVencimiento, existencias[], parametros[] }

// consultas-movimientos.ts
listarMovimientos(actor, filtros?: FiltrosMovimientos): Promise<Paginado<FilaMovimiento>>
  // filtros: { centroId?, ubicacionId?, insumoId?, loteId?, tipo? (uno o varios), usuarioId?,
  //            proveedorId?, desde?, hasta?, texto?, pagina?, porPagina? }
obtenerTraslado(actor, trasladoGrupoId): Promise<FilaMovimiento[]>
condicionMovimientos(actor, filtros): Prisma.MovimientoWhereInput   // para reportes (agente C)

// alertas.ts
obtenerAlertas(actor, { centroId? }?): Promise<Alertas>
  // { stock: AlertaStock[], vencimientos: AlertaVencimiento[], resumen: ResumenAlertas }

// panel.ts
resumenPanel(actor, { centroId?, diasActividad?, ultimos? }?): Promise<ResumenPanel>

// catalogo.ts — opciones para formularios
listarCategorias(actor): Promise<OpcionCategoria[]>
buscarInsumos(actor, { texto?, categoriaId?, soloActivos?, limite? }?): Promise<OpcionInsumo[]>
listarUbicaciones(actor, { centroId?, soloActivas? }?): Promise<OpcionUbicacion[]>
listarProveedoresActivos(actor): Promise<OpcionProveedor[]>
lotesDisponibles(actor, { insumoId, ubicacionId, incluirVencidos? }): Promise<OpcionLote[]>  // FEFO
lotesDeInsumo(actor, insumoId, limite?)   // lotes ya registrados, para autocompletar ingresos

// usuarios.ts
establecerUsuarioActivo(actor, usuarioId, activo)   // ejemplo canónico de mutación administrativa
```

Convenciones de las consultas:

- `centroId` omitido o `null` = **todos los centros visibles del actor** (toda la red para ADMIN).
  Pasar un centro ajeno lanza `SIN_ACCESO_AL_CENTRO`. Lo habitual: pasar el `centroId` de
  `contextoPagina`.
- `Paginado<T>` = `{ items, total, pagina, porPagina, totalPaginas }`; por defecto 25, máximo 100.
- **Stock:** `total` = unidades físicas; `vencido` = en lotes vencidos; `disponible = total −
  vencido`. `estadoStock` compara `disponible` con el mínimo (suma de los mínimos de los centros
  del alcance): `SIN_STOCK` (≤ 0), `BAJO_MINIMO` (< mínimo), `OK`. Sin mínimo definido solo hay
  `SIN_STOCK` / `OK`.
- **Vencimiento:** `VENCIDO`, `POR_VENCER` (≤ `DIAS_POR_VENCER` = 90 días), `VIGENTE`,
  `SIN_VENCIMIENTO`. A nivel de insumo gana el peor estado entre sus lotes con stock. Tramos de
  alerta excluyentes: 30 (0–30), 60 (31–60), 90 (61–90).
- El inventario lista los insumos con existencias registradas o con parámetro de stock en el
  alcance (un consultorio no ve dializadores que nunca tuvo). Con `ubicacionId` se filtran los
  insumos con stock en esa ubicación y se agrega `enUbicacion`; los totales y estados siguen
  siendo del alcance de centros.
- Las alertas de stock existen solo para insumos con `ParametroStock` en el centro
  (`stockMinimo > 0`), una por insumo × centro.

### Cómo agregar un servicio (agentes A/B/C)

Archivo nuevo en `src/server/servicios/` (p. ej. `proveedores.ts`), exportado desde `index.ts`:

```ts
import "server-only";
import { esquemaProveedor, type EntradaProveedor } from "@/lib/esquemas/proveedores";
import type { Actor } from "@/lib/permisos";
import { registrarAuditoria } from "../auditoria";
import { verificarPermiso } from "../autorizacion";
import { enTransaccion } from "../db";
import { ErrorDominio } from "../errores";
import { validar } from "../validacion";

export async function crearProveedor(actor: Actor, entrada: EntradaProveedor) {
  verificarPermiso(actor, "proveedores:gestionar");          // 1. permiso (+ centroId si aplica)
  const datos = validar(esquemaProveedor, entrada);           // 2. validación zod
  return enTransaccion(async (tx) => {                        // 3. transacción
    if (await tx.proveedor.findUnique({ where: { rut: datos.rut } })) {
      throw new ErrorDominio("DUPLICADO", "Ya existe un proveedor con ese RUT.", { campo: "rut" });
    }
    const proveedor = await tx.proveedor.create({ data: datos });
    await registrarAuditoria(tx, actor, {                     // 4. auditoría en la misma tx
      accion: "PROVEEDOR_CREADO", entidad: "Proveedor", entidadId: proveedor.id,
      detalle: { rut: proveedor.rut, razonSocial: proveedor.razonSocial },
    });
    return proveedor;
  });
}
```

Toda mutación audita. `ErrorDominio` con `campo` hace que el error aparezca bajo ese campo del
formulario. No atrapes errores de unicidad de Postgres dentro de una transacción (la aborta):
verifica antes con una consulta. Agrega tests en `tests/` usando `tests/soporte/escenario.ts`.

## 7. Patrones canónicos

### Página (Server Component)

```tsx
// src/app/(app)/inventario/page.tsx
import type { Metadata } from "next";
import { DataTable, PageHeader, Pagination, SearchInput, type Columna } from "@/components/ui";
import { contextoPagina } from "@/server/auth/sesion";
import { listarInventario, type FilaInventario } from "@/server/servicios";

export const metadata: Metadata = { title: "Inventario" };

export default async function PaginaInventario({ searchParams }: PageProps<"/inventario">) {
  const { actor, centroId } = await contextoPagina("inventario:ver");   // sesión + permiso + centro
  const sp = await searchParams;                                         // ¡asíncrono!
  const inventario = await listarInventario(actor, {
    centroId,
    texto: typeof sp.q === "string" ? sp.q : undefined,
    pagina: Number(sp.pagina) || 1,
  });
  // …PageHeader, filtros (SearchInput escribe ?q=), DataTable, <Pagination {...inventario} />
}
```

- Los filtros y la página viven en la **URL** (`?q=`, `?estado=`, `?pagina=`): `SearchInput` y
  `Pagination` ya la sincronizan. La página relee `searchParams`.
- Lo interactivo va en un Client Component hermano (`formulario-x.tsx`, `"use client"`) que
  recibe datos serializables por props. No pases funciones ni íconos desde el servidor.
- Ruta dinámica: `const { insumoId } = await params;` y `notFound()` si el servicio lanza
  `NO_ENCONTRADO`.
- Muestra botones según `puede(actor.rol, "permiso")`.

### Server Action

```ts
// src/acciones/movimientos.ts
"use server";
import { esquemaIngreso } from "@/lib/esquemas/movimientos";
import { accionSegura } from "@/server/accion-segura";
import { registrarIngreso } from "@/server/servicios";

export const registrarIngresoAccion = accionSegura(
  { esquema: esquemaIngreso, permiso: "movimientos:ingreso" },
  ({ actor, datos }) => registrarIngreso(actor, datos),
);
```

`accionSegura` exige sesión, verifica el permiso del rol, valida con zod, traduce errores y
revalida. Devuelve siempre `ResultadoAccion<T>`:
`{ ok: true, datos } | { ok: false, error, codigo?, erroresCampo? }`. Por defecto revalida toda la
app (`revalidatePath("/", "layout")`); usa `revalidar: ["/ruta"]` o `false` para afinar. La acción
no lleva lógica de negocio: solo llama al servicio. Para acciones sin datos usa
`esquema: z.object({ id: zId })`.

### Formulario (Client Component)

```tsx
"use client";
import { useRouter } from "next/navigation";
import { registrarIngresoAccion } from "@/acciones/movimientos";
import { Alert, Button, Field, Input, useAccion } from "@/components/ui";

export function FormularioIngreso({ ubicacionId, insumoId }: { ubicacionId: string; insumoId: string }) {
  const router = useRouter();
  const ingreso = useAccion(registrarIngresoAccion, {
    exito: (r) => `Ingreso registrado: lote ${r.movimiento.numeroLote}`,   // toast
    alExito: () => router.push("/movimientos"),
  });
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void ingreso.ejecutar({
          ubicacionId, insumoId,
          numeroLote: String(f.get("numeroLote") ?? ""),
          fechaVencimiento: String(f.get("fechaVencimiento") ?? ""),
          cantidad: String(f.get("cantidad") ?? ""),
        });
      }}
      className="space-y-5"
    >
      {ingreso.error && Object.keys(ingreso.erroresCampo).length === 0 ? <Alert tono="peligro">{ingreso.error}</Alert> : null}
      <Field label="Número de lote" requerido error={ingreso.erroresCampo.numeroLote}>
        <Input name="numeroLote" autoCapitalize="characters" />
      </Field>
      <Field label="Vencimiento" error={ingreso.erroresCampo.fechaVencimiento}>
        <Input name="fechaVencimiento" type="date" />
      </Field>
      <Field label="Cantidad" requerido error={ingreso.erroresCampo.cantidad}>
        <Input name="cantidad" inputMode="numeric" />
      </Field>
      <Button type="submit" cargando={ingreso.pendiente}>Registrar ingreso</Button>
    </form>
  );
}
```

`useAccion` maneja `pendiente`, `error`, `erroresCampo` y los toasts (éxito y error). Las claves de
`erroresCampo` son las rutas de zod (`"cantidad"`, `"items.0.cantidad"`).

## 8. Errores

`ErrorDominio(codigo, mensaje, { campo?, detalle? })` en `@/server/errores`. Mensajes en español,
listos para el usuario. Códigos: `NO_AUTENTICADO`, `SIN_PERMISO`, `SIN_ACCESO_AL_CENTRO`,
`VALIDACION`, `NO_ENCONTRADO`, `INACTIVO`, `DUPLICADO`, `EN_USO`, `STOCK_INSUFICIENTE`,
`LOTE_VENCIDO`, `LOTE_INCONSISTENTE`, `VENCIMIENTO_REQUERIDO`, `TRASLADO_INVALIDO`,
`CREDENCIALES_INVALIDAS`, `PASSWORD_DEBIL`, `PASSWORD_ACTUAL_INCORRECTA`, `OPERACION_INVALIDA`.
Agrega códigos nuevos a `CODIGOS_ERROR`. Los errores inesperados se registran en el servidor y al
cliente llega un mensaje genérico (`codigo: "ERROR_INTERNO"`).

En páginas, un `ErrorDominio` no atrapado cae en `(app)/error.tsx`; atrapa `NO_ENCONTRADO` y llama
a `notFound()` cuando corresponda.

## 9. Utilidades Chile (`src/lib`)

| Módulo | Funciones |
|---|---|
| `chile/rut` | `validarRut`, `formatearRut` (12.345.678-5), `normalizarRut` (12345678-5), `calcularDv`, `limpiarRut` |
| `chile/regiones` | `REGIONES` (16 regiones con comunas principales), `NOMBRES_REGIONES`, `comunasDeRegion` |
| `fechas` | `hoyEnSantiago`, `diaEnSantiago`, `parsearDia`, `formatearDia` (dd-MM-yyyy), `formatearFecha`, `formatearFechaHora` (dd-MM-yyyy HH:mm), `formatearRelativo`, `describirVencimiento`, `sumarDias`, `diasEntre`, `inicioDelDia`, `finDelDia`, `diaADate`, `dateADia` |
| `formato` | `formatearNumero` (1.234), `formatearDecimal`, `formatearCLP` ($12.500), `formatearPorcentaje`, `formatearCantidad`, `pluralizar`, `parsearNumero`, `normalizarTexto` |
| `estados` | `calcularEstadoStock`, `calcularEstadoVencimiento`, `diasParaVencer`, `tramoDeVencimiento`, etiquetas (`ETIQUETA_*`), `SIGNO_MOVIMIENTO`, `MOTIVOS_MERMA`, `MOTIVOS_AJUSTE`, `UNIDADES_MEDIDA`, `TIPOS_*` |
| `esquemas/base` | `zId`, `zIdOpcional`, `zCantidad`, `zEnteroNoNegativo`, `zTexto(max)`, `zTextoOpcional(max)`, `zDia`, `zDiaOpcional`, `zMontoOpcional`, `zRut`, `zEmail`, `zPagina` |

Fechas: **nunca** uses `new Date().toLocaleDateString()` ni compares días en UTC. Un día es un
`DiaISO` (`YYYY-MM-DD`); un instante es un `Date` que se muestra con `formatearFechaHora`.
`<input type="date">` entrega y recibe `YYYY-MM-DD`, compatible con `zDia`.

## 10. UI kit (`@/components/ui`)

Principios: estética clínica sobria, primario teal (`marca-*`), mucho aire, objetivos táctiles
≥ 44 px, mobile-first, foco visible, contraste AA. El estado **nunca** se comunica solo con color
(los badges llevan ícono + texto). Usa los tokens semánticos de Tailwind: `bg-fondo`,
`bg-superficie`, `bg-superficie-2`, `border-borde`, `border-borde-fuerte`, `text-texto`,
`text-texto-suave`, `text-texto-tenue`, y las escalas `marca-*`, `exito-*`, `alerta-*`,
`peligro-*`, `info-*`. Radios `rounded-control` / `rounded-tarjeta`; sombras `shadow-tarjeta` /
`shadow-flotante`; `cifras` para números tabulares. No uses grises sueltos (`gray-500`).

| Componente | Uso |
|---|---|
| `Button` | `<Button variant="primario\|secundario\|fantasma\|peligro\|enlace" size="sm\|md\|lg\|icono" cargando bloque>`. Como enlace: `<Link className={buttonClasses({ variant: "secundario" })}>` o `<Button asChild><Link …/></Button>`. Los íconos van como hijos. |
| `Field` + `Label` | `<Field label="Cantidad" requerido error={errores.cantidad} ayuda="…">` envuelve un control y conecta id/aria. |
| `Input`, `PasswordInput`, `Textarea` | `<Input inicio={<Search/>} fin="unidades" />`. Texto base de 16 px (evita el zoom de iOS). |
| `Select` | Nativo: `<Select opciones={[{ value, label }]} placeholder="Selecciona…" />` o con `<option>` hijos. |
| `Checkbox` | `<Checkbox label="Requiere cadena de frío" descripcion="…" name="…" />` |
| `Badge` y derivados | `<Badge tono="neutro\|marca\|exito\|alerta\|peligro\|info" icono={X}>`, `<BadgeEstadoStock estado />`, `<BadgeEstadoVencimiento estado dias />`, `<BadgeTipoMovimiento tipo />`, `<BadgeRol rol />`, `<BadgeActivo activo />` |
| `Card` | `<Card>` con `<CardHeader titulo descripcion acciones />`, `CardFooter`. `relleno={false}` + `overflow-hidden` para tablas a sangre. |
| `DataTable` | Tabla en escritorio, tarjetas en móvil. Ver ejemplo abajo. Sirve en Server Components. |
| `Dialog` | `<Dialog><DialogTrigger asChild>…</DialogTrigger><DialogContent titulo descripcion ancho="sm\|md\|lg\|xl">…<DialogFooter/></DialogContent></Dialog>` (hoja inferior en móvil). |
| `Sheet` | Panel lateral: `<SheetContent titulo lado="derecha\|izquierda">`. |
| `ConfirmDialog` | `<ConfirmDialog disparador={<Button/>} titulo descripcion peligro textoConfirmar onConfirmar={async () => …} />` |
| `Tabs` | `<Tabs defaultValue="a"><TabsList><TabsTrigger value="a" contador={3}>…</TabsTrigger></TabsList><TabsContent value="a">…` |
| `DropdownMenu` | `DropdownMenuTrigger/Content/Item/Label/Separator` (acciones por fila, menús). |
| `toast` / `Toaster` | `toast.exito("Guardado")`, `toast.error("…")`, `toast.info("…")`. `Toaster` ya está en el layout raíz. |
| `Pagination` | `<Pagination {...paginado} />` (usa `?pagina=` y conserva los demás parámetros). |
| `SearchInput` | `<SearchInput placeholder="Buscar insumo…" />` sincroniza `?q=` con debounce; con `onBuscar` no toca la URL. `useDebounce(valor, ms)`. |
| `EmptyState` | `<EmptyState icono={X} titulo descripcion accion={…} compacto />` |
| `Skeleton` | `Skeleton`, `SkeletonTabla`, `SkeletonTarjetas` (para `loading.tsx`). |
| `PageHeader` | `<PageHeader titulo descripcion acciones volver={{ href, label }} />` — un solo `<h1>` por página. |
| `StatCard` | `<StatCard etiqueta valor detalle icono tono href />` |
| `Alert` | `<Alert tono="info\|exito\|alerta\|peligro" titulo>…</Alert>` para mensajes en línea. |
| `useAccion` | Ver §7. |

```tsx
const columnas: Columna<FilaInventario>[] = [
  { clave: "nombre", encabezado: "Insumo", movil: "titulo", celda: (f) => f.nombre },
  { clave: "estado", encabezado: "Estado", movil: "destacado", celda: (f) => <BadgeEstadoStock estado={f.estadoStock} /> },
  { clave: "disponible", encabezado: "Disponible", alinear: "derecha",
    celda: (f) => <span className="cifras">{formatearNumero(f.disponible)} {f.unidadMedida}</span> },
  { clave: "codigo", encabezado: "Código", movil: "oculto", celda: (f) => f.codigo },
];
<Card relleno={false} className="overflow-hidden">
  <DataTable titulo="Inventario" columnas={columnas} filas={inventario.items}
    claveFila={(f) => f.insumoId} hrefFila={(f) => `/inventario/${f.insumoId}`}
    vacio={<EmptyState compacto titulo="Sin resultados" />} />
</Card>
```

Si `columnas` contiene funciones y la tabla se renderiza desde un Client Component, define las
columnas en ese mismo componente (las funciones no cruzan el límite servidor → cliente).

**Shell:** `AppShell` (sidebar colapsable en ≥ lg; barra inferior + drawer en móvil), selector de
centro y menú de usuario. Para agregar una entrada de navegación edita `src/lib/navegacion.ts`
(con su permiso). El contenido de cada página se renderiza dentro de `<main>` con ancho máximo y
márgenes ya definidos: empieza directamente con `<PageHeader>`.

### Shell, tablet e impresión

- **Menú lateral:** completo solo desde `xl` (1280 px). Entre `lg` y `xl` (tablet horizontal) es un
  rail de íconos con pista al pasar el mouse o enfocar; su botón inferior abre el menú completo en
  un panel. Bajo `lg`, barra inferior + panel. Por eso las grillas de página de 2 columnas van en
  `xl:` (no en `lg:`): a 1024 px el contenido mide ~950 px.
- **Marcas estables del shell:** `data-shell="lateral|superior|inferior|contenido"` (además de
  `aside`, `header` + `main` y `nav[aria-label="Accesos rápidos"]`, que se conservan).
- **Impresión:** `globals.css` oculta en `@media print` el shell, los botones del kit (clase
  `ri-boton`), la paginación y todo lo que lleve `data-no-imprimir`.
- **Objetivos táctiles:** 44 px mínimo; lo que puede ser más compacto con mouse usa la variante
  `pointer-fine:` (p. ej. `Button size="sm"`), nunca un breakpoint de ancho.
- **Diálogos controlados:** `DialogContent`, `SheetContent` y `ConfirmDialog` devuelven el foco al
  elemento que lo tenía al abrir aunque no haya `Trigger` (`useDevolverFoco`). `ConfirmDialog`
  acepta `children`; `EmptyState` acepta `nivelTitulo` (usa `1` cuando es toda la página).
- **Volver coherente:** los formularios de movimientos aceptan `?volver=/ruta` (validada con
  `validarVolver` de `@/lib/navegacion`) y, si falta, usan la página anterior.
- **404 real:** el grupo `src/app/(directo)` no tiene `loading.tsx` por encima; ahí viven la ficha
  del insumo y el comodín `[...resto]`, para que `notFound()` responda con estado HTTP 404.
- **Vocabulario:** “Registrar ingreso / Registrar retiro” en la acción principal de una página;
  “Ingresar / Retirar” en acciones de fila o de panel; “Correo electrónico” (no “Email”);
  “contraseña temporal” (no “clave”); filtro “Vencidos”.

## 11. Convenciones

- **Idioma:** UI y mensajes en español de Chile (tuteo, sin voseo). Identificadores del dominio en
  español (`registrarIngreso`, `centroId`); nombres de componentes del kit en inglés (`Button`).
- **Archivos:** kebab-case. Componentes cliente junto a su página (`formulario-ingreso.tsx`).
- **Acciones:** `src/acciones/<area>.ts`, sufijo `Accion`. **Esquemas:** `src/lib/esquemas/<area>.ts`,
  prefijo `esquema`, tipos `Entrada*` (`z.input`) y `Datos*` (`z.output`).
- **Sin `any`**, sin TODOs sueltos, sin secretos en el repo.
- **Revalidación:** la hace `accionSegura`. Tras una acción desde el cliente no hace falta
  `router.refresh()`.
- **Auditoría:** `accion` en MAYÚSCULAS `ENTIDAD_VERBO` (`INSUMO_CREADO`, `USUARIO_DESACTIVADO`),
  `entidad` = nombre del modelo, `detalle` sin datos sensibles.
- **Commits:** mensajes claros en español; sin identificadores de herramientas de IA.
- **Agentes en paralelo:** cada uno trabaja en sus rutas y en archivos nuevos de `servicios/`,
  `acciones/` y `esquemas/`. Los archivos compartidos (`permisos.ts`, `navegacion.ts`,
  `servicios/index.ts`, `errores.ts`, `schema.prisma`, UI kit) se tocan con cambios mínimos y
  aditivos. Un cambio de schema requiere migración nueva (`npm run db:migrate -- --name x`); no
  edites la migración inicial.

## 12. Comandos

```bash
npm run dev          # desarrollo (http://localhost:3000)
npm run build        # build de producción        npm run start
npm run typecheck    # next typegen + tsc --noEmit
npm run lint         # eslint
npm test             # vitest (migra y usa medired_test; se ejecuta en serie)
npm run db:migrate   # prisma migrate dev         npm run db:deploy (producción)
npm run db:seed      # seed demo (idempotente; el historial solo se genera si no hay movimientos)
npm run db:reset     # borra TODO y vuelve a migrar + seed (solo desarrollo)
npm run db:studio    # Prisma Studio
```

`db:reset` es destructivo y Prisma lo bloquea cuando lo invoca un agente de IA: debe ejecutarlo una
persona. Variables en `.env` (ver `.env.example`): `DATABASE_URL`, `DATABASE_URL_TEST`,
`SESION_HORAS`. PostgreSQL local: `service postgresql start` si estuviera detenido.

### Cuentas demo (seed)

| Rol | Email | Contraseña | Centros |
|---|---|---|---|
| ADMIN | admin@redinsumos.cl | Admin.Demo.2026 | toda la red |
| BODEGUERO | bodega@redinsumos.cl | Bodega.Demo.2026 | Centro de Diálisis Ñuñoa |
| VISITANTE | visita@redinsumos.cl | Visita.Demo.2026 | Centro de Diálisis Ñuñoa |
| BODEGUERO | bodega.valparaiso@redinsumos.cl | Bodega.Valpo.2026 | Consultorio Cerro Alegre |
| BODEGUERO | bodega.concepcion@redinsumos.cl | Bodega.Conce.2026 | Centro de Diálisis Concepción |
| VISITANTE | nuevo@redinsumos.cl | Temporal.2026 (debe cambiarla) | Valparaíso y Concepción |

## 13. Seguridad y deudas conocidas

- Cabeceras en `next.config.ts`: CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`, COOP y HSTS en producción.
- **Deuda — CSP:** `script-src` permite `'unsafe-inline'` porque Next inyecta scripts en línea; el
  endurecimiento con nonces por solicitud (vía `proxy.ts`) queda pendiente.
- **Deuda — límite de intentos por IP:** hoy solo hay bloqueo por cuenta.
- **Deuda — recuperación de contraseña:** no hay flujo por correo; la restablece un ADMIN (agente B).
- **Deuda — limpieza de sesiones vencidas:** se borran al validarse o al iniciar sesión el mismo
  usuario; no hay tarea programada.
- **Deuda — búsqueda sin tildes:** `listarInventario` usa `unaccent`; `listarMovimientos` y
  `buscarInsumos` usan `contains` insensible a mayúsculas pero sensible a tildes.
- **Deuda — modo oscuro:** los tokens semánticos están preparados (`:root` en `globals.css`), sin
  tema oscuro definido.
- Comunas: `REGIONES` trae las principales por región, no el listado oficial completo.

## 14. Operación y despliegue

Guías: [`DESPLIEGUE.md`](DESPLIEGUE.md) (instalación y actualización), [`OPERACION.md`](OPERACION.md)
(tareas rutinarias y problemas) y [`PRIVACIDAD.md`](PRIVACIDAD.md). Piezas técnicas:

| Pieza | Dónde | Notas |
|---|---|---|
| Imagen de producción | `Dockerfile`, `docker-compose.yml`, `Caddyfile` | `output: "standalone"` en `next.config.ts`. Etapas `app` (servidor, usuario `node`) y `herramientas` (Prisma CLI + `scripts/`). Compose migra con `prisma migrate deploy` antes de iniciar la app. |
| Salud | `GET /api/salud` → `src/server/salud.ts` | Público (está en `RUTAS_PUBLICAS` de `proxy.ts`). 200 si la BD responde, 503 si no. |
| Configuración | `src/server/entorno.ts` | `validarEntorno()` (zod) corre en `src/instrumentation.ts` al iniciar el servidor y al inicio de cada script; no corre en `next build`. Una variable nueva se agrega al esquema, a `.env.example` y a la tabla de `DESPLIEGUE.md`. |
| Registro (logs) | `src/server/registro.ts` | `registrarError(contexto, mensaje, error, datos?)`: JSON por línea en producción, con contraseñas, tokens y credenciales de URL ocultos. Úsalo en vez de `console.error` en código de servidor. `onRequestError` (instrumentation) registra los errores que captura Next. |
| Scripts | `scripts/` | `admin:crear`, `sesiones:limpiar` (tsx, importan `./preparar-entorno` primero), `respaldo.sh` y `restaurar.sh` (bash + cliente PostgreSQL). |
| CI | `.github/workflows/ci.yml` | Migraciones, tipos, lint, pruebas, build e imagen Docker. |

La deuda "limpieza de sesiones vencidas" de §13 queda cubierta por `npm run sesiones:limpiar`
(servicio `mantenimiento` de Compose o cron). `npm run db:seed` es solo para demostración y se niega
a correr con `NODE_ENV=production` salvo `SEED_DEMO=1`.
