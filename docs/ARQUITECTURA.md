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
| Auth | Propia: argon2id, sesiones en BD (solo hash SHA-256 del token), cookie httpOnly, limitador de intentos en BD |
| UI | Kit propio en `src/components/ui` + primitivas Radix + íconos `lucide-react` |
| Tests | vitest contra una base real `*_test` (`DATABASE_URL_TEST`) |

**Next 16 no es el Next que conoces.** Antes de usar una API, revisa
`node_modules/next/dist/docs/`. Lo que ya está resuelto aquí:

- `middleware` ahora es **`src/proxy.ts`** (export `proxy`), en runtime Node.
- `params`, `searchParams`, `cookies()` y `headers()` son **asíncronos** (`await`).
- Los tipos globales `PageProps<"/ruta">` y `LayoutProps<"/ruta">` los genera `next typegen`
  (lo ejecuta `npm run typecheck`). Si agregas una ruta y el tipo falla, corre `npx next typegen`.
- **No usamos Cache Components** (`cacheComponents` desactivado): todo depende de la sesión y del
  stock en tiempo real, así que cada página se renderiza por solicitud. No uses `"use cache"`.
  Además la CSP lleva un nonce por solicitud (§13): el layout raíz hace `await connection()` para
  que **ninguna** página se prerenderice (sus scripts quedarían sin nonce). No lo quites.
- Server Actions: un archivo `"use server"` solo puede exportar funciones async (y tipos).

## 2. Estructura de carpetas

```
prisma/
  schema.prisma            Modelo de datos (tablas snake_case con @@map, columnas camelCase)
  migrations/              Inicial (+ CHECKs, trigger de inmutabilidad, unaccent),
                           endurecimiento_seguridad (idempotencia, limitador, TRUNCATE, auditoría),
                           normaliza_numero_lote (lotes en forma canónica),
                           proveedor_sitio_web (columna + CHECK "solo http(s)"), instituciones
                           (nivel Institución, rol ADMIN_RED, alcance de la auditoría) y
                           proveedor_por_insumo (Insumo.proveedorId + proveedores_insumo_institucion)
  seed.ts                  Seed demo (referencia idempotente + historial vía servicios)
src/
  proxy.ts                 Redirección optimista a /login (las Server Actions pasan y responden
                           NO_AUTENTICADO) y CSP con nonce por solicitud (sin BD)
  app/
    layout.tsx             Raíz: <html lang="es-CL">, fuentes, <Toaster/>
    (auth)/                /login y /cambiar-password (layout de dos paneles)
    (app)/                 Área autenticada: layout con AppShell, loading, error, sin-permiso
      panel/, inventario/, movimientos/ (ingreso, retiro, traslado, ajuste, escanear)
      alertas/ (+ reposicion/exportar), reportes/ (+ exportar/[reporte]), ayuda/
      proveedores/ (directorio de solo lectura para los cuatro roles)
      admin/ (instituciones, insumos, categorias, centros, usuarios, proveedores, auditoria)
    (directo)/             Mismo shell, SIN loading.tsx por encima: ficha del insumo
                           (inventario/[insumoId]) y comodín [...resto] → 404 HTTP real (§10)
    api/salud/             Verificación de salud (pública)
  acciones/                Server Actions ("use server"): auth, movimientos, consultas (solo
                           lectura) y admin-* (instituciones, catálogo, centros, usuarios,
                           proveedores)
  components/
    ui/                    UI kit (importar SIEMPRE desde "@/components/ui")
    shell/                 AppShell (sidebar, barra superior, navegación inferior), Logo,
                           SinCentroActivo (estado "sin centro activo")
    movimientos/           ComboboxInsumo, campos y piezas comunes de los formularios,
                           AvisoCambioCentro (§10)
    escaner/               Escáner con la cámara: BotonEscanear, DialogoEscaner, lector (§15)
    proveedores/           Proveedor de un insumo: BloqueProveedor, EnlaceComprar,
                           BotonCambiarProveedor (§16)
    inventario/, panel/, alertas/, reportes/, admin/   Piezas de cada área
  lib/                     Código ISOMÓRFICO (cliente y servidor), sin acceso a BD
    permisos.ts            ★ Fuente única de verdad de roles y permisos
    navegacion.ts          Mapa de navegación filtrado por permiso
    estados.ts             ★ Semáforo de vencimiento (regla única) y estados de stock, etiquetas,
                           motivos, enums de UI
    gs1.ts, escaneo.ts     GTIN y cadenas GS1 (parser propio); rutas del flujo de escaneo (§15)
    fechas.ts, formato.ts  Fechas America/Santiago, números es-CL, CLP
    chile/                 rut.ts, regiones.ts
    esquemas/              Esquemas zod (base, movimientos, consultas, auth, catalogo, centros,
                           instituciones, proveedores, usuarios)
    resultado.ts           ResultadoAccion<T>, Paginado<T>
    csv.ts, unidades.ts, parametros.ts, parametros-url.ts, filtros-reportes.ts,
    fefo.ts, abastecimiento.ts, errores-formulario.ts   Utilidades compartidas (§9)
  server/                  SOLO servidor (todos importan "server-only")
    db.ts                  Cliente Prisma singleton + enTransaccion()
    errores.ts             ErrorDominio y códigos
    autorizacion.ts        verificarPermiso(), alcanceDeCentros(), verificarInstitucion()
    auditoria.ts           registrarAuditoria()
    validacion.ts          validar(esquema, datos), erroresDeZod()
    accion-segura.ts       ★ accionSegura(): patrón de toda Server Action
    respuesta-csv.ts       ★ responderCsv(): patrón de todo Route Handler de exportación
    limitador.ts           Limitador de intentos persistente (tabla intentos_login)
    entorno.ts, registro.ts, salud.ts                   Configuración, logs y salud (§14)
    auth/                  password.ts (argon2 + semáforo), autenticacion.ts (núcleo),
                           meta-solicitud.ts (IP/user-agent), sesion.ts (cookies/Next),
                           constantes.ts
    servicios/             ★ Capa de servicios (única puerta a los datos de negocio)
scripts/                   Operación (admin:crear, sesiones:limpiar, respaldo, restaurar) e
                           iniciar.mjs (npm start: servidor standalone + estáticos + public)
tests/                     vitest (servicios, permisos, concurrencia, auth, utilidades, cierre)
e2e/                       Playwright contra el build de producción (README, "Pruebas e2e")
docs/                      Este documento y capturas
```

Reglas de dependencia: `app` y `acciones` → `server/servicios` → `server/db`. Las páginas y
acciones **no usan Prisma directamente**; si falta una consulta, se agrega un servicio.
`src/lib` nunca importa de `src/server`.

## 3. Modelo de datos (resumen)

`Institucion` 1—N `Centro` 1—N `Ubicacion`. `Usuario` N—1 `Institucion` (salvo ADMIN_RED) y N—M
`Centro` (`UsuarioCentro`). `Insumo` (catálogo común a toda la red) N—1 `Categoria` y N—1 `Proveedor` opcional (`proveedorId`: proveedor
predeterminado de la red); `ProveedorInsumoInstitucion` (insumo × institución → proveedor preferido
de esa institución, único por par; §16). `ParametroStock` (insumo × centro: mínimo/máximo). `Lote` (insumo + número, vencimiento).
`Existencia` (lote × ubicación → `cantidad`, con `CHECK (cantidad >= 0)`). `Movimiento` = libro mayor
**inmutable**. `Proveedor` (RUT único normalizado; `sitioWeb` opcional, siempre `http(s)://`), `Sesion`, `RegistroAuditoria` (también
inmutable), `LimiteIntentos` (tabla `intentos_login`: contadores del limitador).

- **Instituciones (la red = todas las instituciones).** `Institucion` (nombre único, RUT opcional,
  `activo`). `Centro.institucionId` es obligatorio y **no cambia** (no es un campo editable).
  `Usuario.institucionId` es obligatorio salvo para `ADMIN_RED`, que no tiene institución: lo
  garantiza el `CHECK usuarios_institucion_segun_rol` (`(rol = 'ADMIN_RED') = (institucionId IS
  NULL)`). Las asignaciones `UsuarioCentro` solo pueden ser a centros de la institución del usuario
  (lo valida `resolverDestino` en `servicios/usuarios.ts`; además, al armar la sesión se descarta
  cualquier asignación a un centro de otra institución). Un `ADMIN` no lleva asignaciones: su
  alcance son todos los centros de su institución. Un usuario no se mueve de institución. Catálogo
  (`Insumo`, `Categoria`), `Proveedor` y `Lote` son **compartidos** por toda la red; stock,
  movimientos y parámetros son de cada centro y, por lo tanto, de su institución. Una institución
  desactivada deja fuera a sus usuarios (no pueden ingresar y sus sesiones se cierran).
- **Migración `instituciones`** (bases ya desplegadas): crea la institución `institucion_inicial`
  ("Institución principal") con todos los centros y usuarios existentes; los `ADMIN` existentes
  pasan a `ADMIN_RED` (eran el operador); la auditoría histórica de centros, movimientos y
  usuarios se atribuye a esa institución y el resto queda como evento de red. Para rellenar
  `registros_auditoria.institucionId` deshabilita el trigger de fila **solo** durante ese `UPDATE`
  y lo vuelve a habilitar dentro de la misma transacción. En una base vacía no crea instituciones.
- **Inmutabilidad:** triggers SQL rechazan `UPDATE`, `DELETE` y `TRUNCATE` sobre `movimientos` y
  `registros_auditoria` (solo admiten `INSERT`). Ningún código las modifica; el soporte de tests
  deshabilita los triggers únicamente dentro de su limpieza (`tests/soporte/escenario.ts`). Como la
  auditoría no se puede actualizar, **no se pueden borrar usuarios con registros de auditoría**
  (la FK `SET NULL` sería un `UPDATE`): los usuarios se desactivan. El endurecimiento con un rol de
  base de datos sin `UPDATE`/`DELETE` sobre esas tablas está en `DESPLIEGUE.md` §6.1.
- **Número de lote canónico:** `normalizarNumeroLote` (`@/lib/esquemas/movimientos`): sin espacios
  en los extremos, espacios internos colapsados a uno y en mayúsculas. Lo aplica el esquema de
  ingreso; la migración `normaliza_numero_lote` alineó los lotes existentes (sin fusionar los que
  quedarían duplicados).
- **Idempotencia:** `Movimiento.claveIdempotencia` + `indiceIdempotencia` (único en conjunto; un
  `CHECK` exige ambos o ninguno). Una operación con varios movimientos (retiro FEFO multi-lote,
  traslado) usa la misma clave con índices 0, 1, 2…
- `Usuario.passwordTemporalExpira`: vencimiento de la contraseña temporal (solo aplica mientras
  `debeCambiarPassword`; `null` = no vence, p. ej. las cuentas demo del seed).

- Ids: `cuid` (string). `Movimiento.cantidad` siempre > 0; el signo lo da el tipo
  (`SIGNO_MOVIMIENTO` en `lib/estados`).
- `Movimiento.saldoPosterior` = saldo **del lote en esa ubicación** después del movimiento.
- `fechaVencimiento` / `fechaFabricacion` son columnas `DATE`: Prisma las entrega como `Date` a
  medianoche UTC. Los servicios ya las devuelven como texto `YYYY-MM-DD` (`DiaISO`).
- Emails en minúsculas (CHECK en BD). RUT guardado como `76123456-7`.
- Nunca se borran centros, ubicaciones, insumos, proveedores ni usuarios con historia: se
  **desactivan** (`activo = false`). Las FK son `Restrict`.

## 4. Permisos

Fuente única: `src/lib/permisos.ts` (`PERMISOS_POR_ROL`, `puede`, `puedeEnCentro`,
`alcanzaInstitucion`, `rolesAsignables`) + `src/server/autorizacion.ts`.

Cuatro roles (nombres visibles en `NOMBRE_ROL`):

| Rol | Nombre visible | Alcance |
|---|---|---|
| `ADMIN_RED` | Administrador de la red | Toda la red: todas las instituciones, centros y usuarios. Es el operador de la plataforma. |
| `ADMIN` | Administrador de institución | **Su institución**: todos sus centros (sin asignarlos uno a uno) y sus usuarios. Nada de otras instituciones. |
| `BODEGUERO` | Bodeguero | Sus centros asignados. |
| `VISITANTE` | Visitante | Sus centros asignados. |

| Permiso | ADMIN_RED | ADMIN | BODEGUERO | VISITANTE |
|---|:-:|:-:|:-:|:-:|
| `panel:ver`, `inventario:ver`, `alertas:ver`, `catalogo:ver` | ✔ | ✔ su institución | ✔ sus centros | ✔ sus centros |
| `proveedores:ver` (directorio de proveedores: solo lectura) | ✔ | ✔ | ✔ | ✔ |
| `movimientos:ver` | ✔ | ✔ su institución | ✔ sus centros | — |
| `movimientos:ingreso`, `movimientos:retiro` | ✔ | ✔ su institución | ✔ sus centros | — |
| `movimientos:ajuste`, `movimientos:merma`, `movimientos:traslado` | ✔ | ✔ su institución | — | — |
| `reportes:ver`, `auditoria:ver` | ✔ | ✔ su institución | — | — |
| `centros:gestionar`, `usuarios:gestionar`, `parametros:gestionar` | ✔ | ✔ su institución | — | — |
| `proveedores:gestionar` (proveedores compartidos por la red) | ✔ | ✔ | — | — |
| `proveedores-insumo:gestionar` (proveedor preferido de una institución para un insumo, §16) | ✔ cualquiera | ✔ la suya | — | — |
| `catalogo:crear` (ver el catálogo de administración; crear insumos y categorías, con su proveedor predeterminado) | ✔ | ✔ | — | — |
| `catalogo:gestionar` (editar, desactivar o eliminar insumos y categorías; cambiar el proveedor predeterminado de la red) | ✔ | — | — | — |
| `instituciones:gestionar` | ✔ | — | — | — |

La autorización se valida **siempre en el servidor y en tres capas**: página (`contextoPagina`),
acción (`accionSegura`) y servicio (`verificarPermiso(actor, permiso, centroId)` con el centro real
del dato). En la UI, `puede(rol, permiso)` solo decide qué se muestra.

### Alcance: cómo se limita cada rol

- **`Actor`** = `{ usuarioId, rol, institucionId, centroIds, ip? }`. `institucionId` es `null`
  solo para `ADMIN_RED`. **`centroIds` es el alcance de centros ya resuelto** al armar la sesión
  (`alcanceDeUsuario` en `auth/autenticacion.ts`, en cada solicitud): los centros asignados
  (BODEGUERO, VISITANTE) o **todos los centros de su institución** (ADMIN). Para `ADMIN_RED` se
  ignora.
- **Datos de un centro** (inventario, movimientos, alertas, panel, reportes, exportaciones,
  ubicaciones, lotes, parámetros): `alcanceDeCentros(actor, centroId?)` devuelve `null` solo para
  `ADMIN_RED` (sin filtro); para los demás, `actor.centroIds`. Pedir un centro fuera del alcance
  lanza `SIN_ACCESO_AL_CENTRO`. Como el alcance del ADMIN ya viene acotado a su institución, todo
  servicio que usa `alcanceDeCentros` / `verificarPermiso(…, centroId)` queda aislado por
  institución sin lógica adicional.
- **Entidades administradas** (centros, ubicaciones, usuarios): se filtran por
  `institucionId` del actor (`centrosDelAlcance`, `usuariosDelAlcance`,
  `verificarInstitucion`). Lo que es de otra institución responde **`NO_ENCONTRADO`**: para un
  ADMIN "no existe" (tampoco los administradores de la red).
- **Reglas del ADMIN de institución** (todas en el servicio, no en la UI):
  crea centros solo en su institución; crea y edita usuarios solo de su institución, con roles
  `rolesAsignables("ADMIN")` = ADMIN, BODEGUERO, VISITANTE (**nunca** `ADMIN_RED`) y centros de su
  institución; nadie cambia de institución; define mínimos y máximos solo de sus centros (un
  centro ajeno en la entrada rechaza todo); traslada solo dentro de su institución; crea insumos
  y categorías pero no modifica los existentes; corrige el vencimiento solo de lotes que pasaron
  por sus centros y sin existencias en otra institución.
- **Traslados:** nunca cruzan instituciones, tampoco para `ADMIN_RED` (`TRASLADO_INVALIDO`).
- **Salvaguardas:** siempre queda al menos un `ADMIN_RED` activo (no se puede desactivar ni
  degradar al último); nadie se cambia su propio rol ni se desactiva; `npm run admin:crear` crea
  `ADMIN_RED`.
- **Vista "todos mis centros":** `centroId: null` en `contextoPagina` es "Toda la red" para
  `ADMIN_RED` y "Toda mi institución" para `ADMIN` (`etiquetaTodos`, `etiquetaAlcanceTotal(rol)`,
  `fraseAlcanceTotal(rol)`). `puedeVerTodaLaRed` es `true` solo para `ADMIN_RED`.

### Auditoría por institución

`RegistroAuditoria.institucionId` es el alcance de cada registro y se escribe al registrar
(`registrarAuditoria`, `server/auditoria.ts`):

- lo que ocurre **en un centro o sobre un usuario** lleva la institución de ese centro o usuario,
  lo haga quien lo haga (la institución también ve lo que el administrador de la red hizo sobre
  sus datos; en ese caso el visor le muestra "Administrador de la red", sin nombre ni correo);
- lo demás (sesiones, exportaciones, proveedores, insumos y categorías creados) lleva la
  institución **de quien actúa**;
- `null` = **evento de red**: acciones del administrador de la red que no pertenecen a una
  institución (catálogo, instituciones, proveedores editados por él), intentos de ingreso sin
  usuario y resúmenes del limitador.

`listarAuditoria` y `opcionesFiltroAuditoria` muestran a un ADMIN **solo** los registros de su
institución; los eventos de red los ve únicamente `ADMIN_RED` (que además puede filtrar por
institución o por "eventos de la red"). Un cambio de mínimos o una corrección de vencimiento que
toca varias instituciones escribe **un registro por institución**, cada uno solo con sus centros
y sus unidades. Al escribir un registro nuevo: pasa `institucionId` explícito si la entidad
pertenece a una institución; si lo omites se usa la del actor.

Para un permiso nuevo: agrégalo a `PERMISOS` y a la matriz en `permisos.ts`, actualiza
`tests/permisos.test.ts` y esta tabla.

## 5. Autenticación y sesión

- Login correo electrónico + contraseña (argon2id). Mensaje único de error ("Correo electrónico o
  contraseña incorrectos…"): no revela si el correo existe, si hay un bloqueo ni si una contraseña
  temporal venció.
- Sesión: token aleatorio de 32 bytes en cookie `ri_sesion` (httpOnly, sameSite=lax, secure en
  producción); en BD solo su SHA-256. Expiración deslizante de 12 h (`SESION_HORAS`), vida máxima
  absoluta de 7 días. La expiración deslizante vive **solo en la BD** (`validarTokenSesion`): la
  cookie dura los 7 días y `proxy.ts` **no la renueva**, así que una cookie con un token inválido
  nunca se prolonga. El proxy borra las cookies mal formadas y las Server Actions borran las que ya
  no valen (`descartarCookieSesionInvalida`).
- **Sesión vencida en un formulario:** el proxy NO redirige las Server Actions (cabecera
  `next-action`): un 307 a `/login` se vería como error de red. La acción llega a `accionSegura`,
  que responde `codigo: "NO_AUTENTICADO"`; `useAccion` y los hooks de consulta
  (`useExistenciasInsumo`, `ComboboxInsumo`) llaman a `avisarSesionVencida()`
  (`@/components/ui`): aviso "Tu sesión venció" y `location.assign("/login?motivo=sesion&destino=<ruta
  actual>")`. Una acción llamada sin `useAccion` debe comprobar `esSesionVencida(r)` por su cuenta.
- `debeCambiarPassword` obliga a pasar por `/cambiar-password` (≥10 caracteres, letra y número,
  distinta de la actual). Mientras esté pendiente, `accionSegura`, `responderCsv` y
  `cambiarCentroActivoAccion` rechazan todo. Cambiar la contraseña cierra las demás sesiones; es
  transaccional (bloquea la fila del usuario) y admite 5 intentos fallidos sobre la contraseña
  actual cada 15 min (`DEMASIADOS_INTENTOS`).
- **Contraseñas temporales** (usuario nuevo, restablecida por un ADMIN o por `admin:crear`): vencen
  a las 72 h (`VIGENCIA_PASSWORD_TEMPORAL_MS`). Vencida, el login responde el mensaje genérico y
  hay que restablecerla. `listarUsuarios` expone `passwordTemporalExpira` y
  `passwordTemporalVencida`.
- Desactivar un usuario elimina sus sesiones (`establecerUsuarioActivo`) y, además, toda sesión de
  un usuario inactivo se rechaza al validarse.

Helpers (`@/server/auth/sesion`):

| Helper | Uso |
|---|---|
| `obtenerSesion()` | `Sesion \| null`, memoizada por solicitud. |
| `requerirSesion()` | Redirige a `/login` (o `/cambiar-password`). |
| `requerirPermiso(permiso, centroId?)` | Para páginas/layouts: redirige a `/sin-permiso`. |
| `contextoPagina(permiso)` | ★ Lo normal en una página: `{ sesion, actor, centroId, centro, centros, puedeVerTodaLaRed, puedeVerTodos, etiquetaTodos, sinCentro }`. |
| `obtenerCentroActivo(sesion)` | Centro activo (cookie `ri_centro`); `centroId: null` = "Toda la red" (ADMIN_RED) o "Toda mi institución" (ADMIN) **solo si `sinCentro` es `false`**. `centros` viene ordenado por institución y nombre, con `institucionId` e `institucion`. |

**`sinCentro`** es `true` para quien no es administrador y no tiene ningún centro activo asignado
(su único centro fue desactivado). No es "toda la red": toda página que pueda ver un bodeguero o
un visitante empieza con `if (sinCentro) return <SinCentroActivo titulo="…" />;`
(`@/components/shell/sin-centro`). `sesion.usuario` trae además `institucionId` e `institucion`
(`{ id, nombre }`, `null` para ADMIN_RED).

Al crear o restablecer usuarios (ver `servicios/usuarios.ts`): `hashearPassword` y
`validarPoliticaPassword` (`@/server/auth/password`), email con `normalizarEmail`,
`debeCambiarPassword: true` + `passwordTemporalExpira`, y cerrar las sesiones del usuario cuando
cambien su rol, sus centros o su clave.

### IP de la solicitud (`TRUST_PROXY`)

`obtenerMetaSolicitud()` → `{ ip, userAgent }` (`auth/meta-solicitud.ts`). `X-Forwarded-For` es
falsificable, así que la IP **solo** se toma de ahí si `TRUST_PROXY` declara cuántos proxies de
confianza hay delante (0–10): se usa la posición `TRUST_PROXY` contando desde la derecha (la que
agregó el proxy propio, nunca la primera), validada con `net.isIP` y normalizada; si no valida, o
`TRUST_PROXY` es 0 / no está definida, `ip = null`. `X-Real-IP` se ignora. El user-agent se trunca
a 255. Esa IP es la que llega a `actor.ip`, a la auditoría, a las sesiones y al limitador.

### Límite de intentos (`server/limitador.ts`, `auth/autenticacion.ts`)

Limitador de ventana fija **persistente** (tabla `intentos_login`), atómico (un `INSERT … ON
CONFLICT DO UPDATE` por consumo). Las claves se guardan como SHA-256: no quedan emails en la tabla.

```ts
consumirLimite({ tipo, identificador, maximo, ventanaMs, sujeto?, ip? }, ahora?, cliente?)
  // → { cuenta, excedido, expiraEn, cuentaAnterior }
consultarLimite(regla, ahora?)  devolverIntento(tipo, identificador, ahora?)
liberarLimite(tipo, identificador, cliente?)  liberarSujeto(sujeto, cliente?, tipos?)
sujetoDeEmail(email)            limpiarLimitesVencidos(ahora?)
```

Tipos en uso: `LOGIN_IP`, `LOGIN_PAR`, `LOGIN_CUENTA`, `AUDITORIA_LOGIN`, `PASSWORD_ACTUAL`,
`EXPORTACION`. Para limitar algo nuevo, agrega un `TipoLimite` y llama a `consumirLimite`.

Inicio de sesión (constantes en `auth/constantes.ts`), todo con el mismo mensaje genérico:

| Capa | Regla | Notas |
|---|---|---|
| Por IP | 20 intentos / 5 min con cualquier email (`LOGIN_IP`) | Se evalúa antes de argon2. Un ingreso correcto devuelve su intento. |
| Por par IP + email | 5 fallos → ese par bloqueado 15 min desde el último fallo (`LOGIN_PAR`) | Antes de argon2. Un tercero desde otra IP no deja fuera al titular. Un ingreso correcto lo libera. |
| Global por cuenta | Tras 30 fallos seguidos (`Usuario.intentosFallidos`): retardo 30 s, 1 min, 2 min… máx. 15 min (`bloqueadoHasta`, `retardoGlobalMs`) | No aplica a las IP desde las que la cuenta inició sesión en los últimos 30 días (auditoría `LOGIN_OK`). |
| Sin IP confiable | El par degrada a la cuenta (`LOGIN_CUENTA`): 5 fallos → cuenta bloqueada 15 min (`bloqueadoHasta`) | Comportamiento histórico. Sin límite por IP ni IP en auditoría: por eso se recomienda `TRUST_PROXY`. |

Además: argon2 corre con un semáforo en proceso (`MAX_ARGON2_SIMULTANEOS = 3`, cola de 100; si se
llena, `DEMASIADOS_INTENTOS`), y la auditoría de fallos se acota a 10 registros por IP y minuto
(60 sin IP): el resto se cuenta y se resume en un `LOGIN_FALLIDO_AGREGADO` (`detalle.omitidos`); el
primer rechazo de cada bloqueo siempre se registra. `desbloquearUsuario` (ADMIN) limpia
`bloqueadoHasta`/`intentosFallidos` **y** los contadores `LOGIN_PAR`/`LOGIN_CUENTA`/
`PASSWORD_ACTUAL` de la cuenta; `FilaUsuario.bloqueado` refleja cualquiera de esos bloqueos.
`npm run sesiones:limpiar` borra los contadores vencidos (`limpiarIntentosVencidos`).

## 6. Capa de servicios (`@/server/servicios`)

Todos reciben `actor: Actor` como primer argumento (`sesion.actor`) y validan permiso + centro.
Lanzan `ErrorDominio` (ver §8). Las mutaciones corren en una transacción con `SELECT … FOR UPDATE`
sobre las existencias, escriben el movimiento y la auditoría de forma atómica, y reintentan ante
interbloqueos. La ubicación y su centro se leen con `FOR SHARE`; desactivar una ubicación o un
centro toma `FOR UPDATE` sobre esa fila antes de contar existencias, de modo que nunca queda stock
en algo inactivo por una carrera. El tercer argumento `{ ahora }` existe solo para seed y tests:
**no lo uses**.

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
corregirVencimientoLote(actor, entrada: EntradaCorregirVencimientoLote): Promise<ResultadoCorreccionLote>
  // { loteId, fechaVencimiento? (vacío = sin fecha), motivo }      SOLO ADMINISTRADORES
  // → { loteId, numeroLote, fechaVencimientoAnterior, fechaVencimiento, cambiado }

interface MovimientoRegistrado { id; tipo; insumoId; loteId; numeroLote; ubicacionId; centroId;
                                 cantidad; saldoPosterior; creadoEn; repetido? }
```

**Idempotencia.** Todas las entradas de movimiento aceptan `claveIdempotencia?: string` (UUID;
`zClaveIdempotencia`). Si la misma persona reenvía la misma clave (doble clic, reintento por red),
no se registra nada nuevo: se devuelve lo ya registrado con `repetido: true` (`ResultadoIngreso`,
`ResultadoRetiro` y `ResultadoTraslado` siempre traen `repetido`; ajuste y merma lo traen en el
movimiento). Dos envíos simultáneos se serializan con un bloqueo consultivo sobre la clave. Una
clave usada por otra persona o para otro tipo de operación → `OPERACION_INVALIDA`. Un intento que
falla no consume la clave. En el cliente: `nuevaClaveIdempotencia()` (`@/lib/esquemas/base`) al
montar el formulario y de nuevo tras cada éxito (así lo hacen los cuatro formularios de
`movimientos/`). Sin clave, cada llamada es una operación nueva.

Acciones (`@/acciones/movimientos`): `registrarIngresoAccion`, `registrarRetiroAccion`,
`registrarAjusteAccion`, `registrarMermaAccion`, `registrarTrasladoAccion` (las cuatro primeras
agregan `stock: StockActual | null`) y `corregirVencimientoLoteAccion` (permiso
`movimientos:ajuste`; el servicio exige además rol ADMIN_RED o ADMIN). La pantalla de esta última es
`BotonCorregirVencimiento` (`@/components/inventario/corregir-vencimiento`), en la tabla de lotes
de la ficha del insumo: fecha nueva + motivo + paso de confirmación.

Los tipos `Entrada*` salen de los esquemas zod de `@/lib/esquemas/movimientos` (aceptan los textos
de un formulario: `cantidad: "24"`, fechas `YYYY-MM-DD` o `dd-MM-yyyy`, `""` como vacío).

Reglas de negocio:

- **Ingreso:** el lote se identifica por insumo + `numeroLote` (en forma canónica: mayúsculas y
  espacios colapsados). `costoUnitario` es un `zMontoOpcional` (§9): un punto decimal se rechaza. Si existe
  se reutiliza; indicar un vencimiento distinto al registrado → `LOTE_INCONSISTENTE`. Si el insumo
  `controlaVencimiento`, el lote debe tener fecha → `VENCIMIENTO_REQUERIDO`. No se ingresan lotes
  vencidos → `LOTE_VENCIDO`. Ubicación, centro, insumo y proveedor deben estar activos → `INACTIVO`.
- **Fechas de lote** (`VALIDACION`): la fabricación no puede ser futura, el vencimiento no puede
  superar hoy + 15 años ni ser anterior a la fabricación.
- **Completar el vencimiento** de un lote que existía sin fecha (al ingresar indicando una): solo si
  el lote no tiene existencias en centros fuera del alcance del actor (o es ADMIN_RED); si no,
  `LOTE_INCONSISTENTE`. Se audita como `LOTE_ACTUALIZADO` (`cambios.fechaVencimiento.antes/despues`).
  Cambiar una fecha ya registrada es `corregirVencimientoLote` (solo administradores, con motivo,
  auditado; admite fechas pasadas: el lote queda vencido).
- **Lotes y alcance por institución.** Un lote es global por (insumo, número): dos instituciones
  que reciben el mismo lote del fabricante comparten la fila `Lote` y su fecha. Por eso: los lotes
  ya registrados solo se muestran a quien tiene (o tuvo) existencias o movimientos de ese lote en
  SUS centros (`lotesDeInsumo`); un ADMIN de institución solo corrige el vencimiento de un lote
  que pasó por sus centros (si no, `NO_ENCONTRADO`) y que no tiene existencias en centros de otra
  institución (`LOTE_INCONSISTENTE`: lo corrige el administrador de la red); la corrección se
  audita una vez por institución con existencias, cada una con sus unidades.
- **Retiro:** FEFO ordena por vencimiento (sin fecha al final) dentro de la ubicación. **Nunca**
  retira lotes vencidos (`LOTE_VENCIDO` si se pide uno; FEFO los salta). Sin stock vigente
  suficiente → `STOCK_INSUFICIENTE` con `detalle: { solicitado, disponible, vencido }`.
- **Merma:** única salida para lotes vencidos. Motivo obligatorio (`MOTIVOS_MERMA` sugiere valores).
- **Ajuste:** motivo obligatorio (`MOTIVOS_AJUSTE`). El positivo puede crear la existencia del
  lote en la ubicación. Para "conteo", la UI calcula la diferencia y envía sentido + cantidad.
- **Traslado:** exige permiso en el centro de origen y en el de destino; origen ≠ destino; ambos
  centros deben ser de la **misma institución** (`TRASLADO_INVALIDO`, también para ADMIN_RED).
  Permite mover lotes vencidos (p. ej. a cuarentena).
- Un lote vence al **terminar** su día de vencimiento (ese día aún se puede usar), hora de Chile.

### Consultas

```ts
// inventario.ts
listarInventario(actor, filtros?: FiltrosInventario): Promise<Paginado<FilaInventario>>
  // filtros: { centroId?, ubicacionId?, categoriaId?, texto?, estado?, semaforo?, pagina?, porPagina? }
  // estado: "SIN_STOCK" | "BAJO_MINIMO" | "OK" (y, por compatibilidad, "VENCIDO" | "POR_VENCER")
  // semaforo: ColorSemaforo[] → insumos con ALGÚN lote con stock de esos colores
  // cada fila trae estadoVencimiento (el peor de sus lotes) y semaforo (desglose por color)
detalleInsumo(actor, insumoId, { centroId? }?): Promise<DetalleInsumo>
  // { insumo, total, vencido, disponible, semaforo, stockMinimo, estadoStock,
  //   estadoVencimiento, proximoVencimiento, existencias[], parametros[] }

// semaforo.ts — semáforo de vencimiento agregado en SQL (ver "Semáforo" más abajo)
resumenSemaforo(actor, { centroId?, categoriaId?, texto? }?): Promise<ResumenSemaforo>
  // { VENCIDO, ROJO, AMARILLO, VERDE, SIN_VENCIMIENTO: { insumos, lotes, unidades }, limites }
lotesPorColor(actor, { color, centroId?, limite? }): Promise<LoteSemaforo[]>   // lo que vence antes, primero
sqlColorSemaforo(columna, limites), sqlEsColor(…), sqlEsAlgunColor(…)         // fragmentos SQL compartidos

// consultas-movimientos.ts
listarMovimientos(actor, filtros?: FiltrosMovimientos): Promise<Paginado<FilaMovimiento>>
  // filtros: { centroId?, ubicacionId?, insumoId?, loteId?, tipo? (uno o varios), usuarioId?,
  //            proveedorId?, desde?, hasta?, texto?, pagina?, porPagina? }
  // `texto` busca en insumo (nombre/código), lote y documento, sin distinguir tildes
condicionMovimientos(actor, filtros): Prisma.MovimientoWhereInput   // alcance + filtros, SIN texto
consultaPorTexto(where, texto): { contar(), ids({ limite, saltar?, despuesDe? }), agrupar("tipo" | "motivo") }
  // el mismo where + búsqueda con unaccent (SQL); la usan el historial y los reportes
obtenerTraslado(actor, trasladoGrupoId): Promise<FilaMovimiento[]>
obtenerMovimiento(actor, movimientoId): Promise<FilaMovimiento | null>
usuariosConMovimientos(actor, { centroId? }?): Promise<OpcionUsuarioMovimientos[]>

// alertas.ts
obtenerAlertas(actor, { centroId? }?): Promise<Alertas>
  // { stock: AlertaStock[], vencimientos: AlertaVencimiento[], resumen: ResumenAlertas }
  // vencimientos: lotes con stock VENCIDO | ROJO | AMARILLO (el verde no es alerta)
  // resumen: { sinStock, bajoMinimo, vencidos, rojo, amarillo, total }

// panel.ts
resumenPanel(actor, { centroId?, diasActividad?, ultimos? }?): Promise<ResumenPanel>
  // actividad[]: { dia, entradas, salidas, movimientos } = NÚMERO DE MOVIMIENTOS de entrada y de
  // salida por día (no unidades: cajas + ampollas + litros no se suman)
  // semaforo: ResumenSemaforo; enRojo: LoteSemaforo[] (los primeros LOTES_EN_ROJO_PANEL)

// catalogo.ts — opciones para formularios
listarCategorias(actor): Promise<OpcionCategoria[]>
buscarInsumos(actor, filtros?: FiltrosBuscarInsumos): Promise<OpcionInsumo[]>
  // { texto?, categoriaId?, soloActivos?, limite?, priorizarRetirosDeCentroId? }
  // sin tildes ni mayúsculas. `priorizarRetirosDeCentroId` (solo sin texto): primero lo más
  // retirado en ese centro en los últimos 30 días (con masUsado: true), luego el resto por nombre
listarUbicaciones(actor, { centroId?, soloActivas? }?): Promise<OpcionUbicacion[]>
listarProveedoresActivos(actor): Promise<OpcionProveedor[]>
buscarInsumoPorCodigo(actor, textoLeido): Promise<BusquedaPorCodigo>   // escáner (§15)
  // → { codigo: CodigoInterpretado | null, coincidencias: (OpcionInsumo & { activo })[] }
lotesDisponibles(actor, { insumoId, ubicacionId, incluirVencidos? }): Promise<OpcionLote[]>  // FEFO
lotesDeInsumo(actor, insumoId, limite?)   // lotes ya registrados, SOLO los que pasaron por los
                                          // centros del actor (todos para ADMIN_RED)
obtenerOpcionInsumo(actor, insumoId): Promise<(OpcionInsumo & { activo }) | null>

// usuarios.ts — todo limitado a la institución del actor (ADMIN_RED: toda la red)
listarUsuarios(actor, filtros?)                     // { texto?, rol?, estado?, centroId?, institucionId? }
crearUsuario / actualizarUsuario / restablecerPasswordUsuario / desbloquearUsuario
  // entrada: { nombre, email, rol, institucionId?, centroIds }. `resolverDestino` autoriza rol,
  // institución y centros (ver §4). ADMIN_RED indica la institución (o se deduce de los centros).
establecerUsuarioActivo(actor, usuarioId, activo)   // ejemplo canónico de mutación administrativa

// instituciones.ts — solo ADMIN_RED (`instituciones:gestionar`)
listarInstituciones(actor): Promise<FilaInstitucion[]>   // con conteos de centros, usuarios y stock
crearInstitucion(actor, { nombre, rut?, administrador?: { nombre, email } })
  // → { id, nombre, administrador: UsuarioConPasswordTemporal | null }  (todo en una transacción)
actualizarInstitucion(actor, { id, nombre, rut? })
establecerInstitucionActiva(actor, id, activo)   // EN_USO si tiene centros activos con stock;
                                                 // al desactivar cierra las sesiones de sus usuarios
listarOpcionesInstitucion(actor)   // para selects: todas (ADMIN_RED) o solo la propia (ADMIN)
resumenPorInstitucion(actor, resumenPanel.porCentro)   // panel "La red por institución" (ADMIN_RED)

// centros.ts
listarCentrosAdmin(actor, { institucionId? }?)   // con `institucionId` e `institucion`
crearCentro(actor, { …, institucionId? })        // ADMIN_RED la indica; ADMIN crea en la suya
// insumos.ts / categorias.ts: listar, ver y CREAR piden `catalogo:crear`; editar, desactivar y
// eliminar piden `catalogo:gestionar`. `obtenerInsumoAdmin` devuelve stock y parámetros SOLO de
// los centros del alcance; `guardarParametrosStock` exige el permiso en cada centro.
// proveedores.ts
listarDirectorioProveedores(actor, { centroId?, texto?, orden?: "uso" | "nombre", limite? }?)
  // activos con contacto y sitio web; "uso" = primero los usados más recientemente en ingresos
  // de los centros del alcance. Permiso proveedores:ver (los cuatro roles)
// insumos.ts
asociarCodigoBarras(actor, { insumoId, codigoBarras })   // catalogo:gestionar (solo ADMIN_RED: el
  // catálogo es compartido); audita INSUMO_ACTUALIZADO

// proveedor-insumo.ts — ★ única resolución del PROVEEDOR EFECTIVO de un insumo (§16)
proveedorEfectivoDeInsumo(actor, insumoId, { centroId? }?): Promise<ProveedorEfectivo | null>
detalleProveedorInsumo(actor, insumoId, { centroId? }?): Promise<DetalleProveedorInsumo>
  // { efectivo, red, institucion, porInstitucion (solo ADMIN_RED), ultimoIngreso, permisos }
definirProveedorRed(actor, { insumoId, proveedorId? })                    // catalogo:gestionar
definirProveedorInstitucion(actor, { insumoId, institucionId?, proveedorId? })
  // proveedores-insumo:gestionar; proveedorId vacío = volver al predeterminado de la red
sqlProveedorEfectivo({ insumoId, predeterminado, institucionId }), proveedorDeFila(fila),
institucionDeContexto(actor, centroId?)                                   // piezas para listados en SQL
// inventario.ts
contarInsumosPorProveedor(actor, { centroId? }?): Promise<Record<proveedorId, number>>

// administración: insumos.ts, categorias.ts, centros.ts, proveedores.ts, auditoria-consultas.ts
// reportes y exportaciones: reportes.ts, alertas.ts (listaReposicion), exportaciones.ts
```

Acciones de **solo lectura** para formularios (`@/acciones/consultas`, no revalidan):

```ts
buscarInsumosAccion({ texto?, priorizarRetirosDeCentroId? })   // permiso catalogo:ver, máx. 20
buscarPorCodigoAccion({ codigo })                              // permiso catalogo:ver (escáner)
existenciasInsumoAccion({ insumoId, centroId? })               // permiso inventario:ver
  // → { insumoId, existencias: ExistenciaDetalle[], lotesRegistrados }
  // lotesRegistrados solo llega con contenido a quien puede `movimientos:ingreso`
```

`priorizarRetirosDeCentroId` lo usa el formulario de retiro: la página lo pasa a `buscarInsumos`
para las opciones iniciales y `ComboboxInsumo` (prop `priorizarRetirosDeCentroId`) las refresca al
abrir y rotula "Más usados en este centro" / "Otros insumos" según `masUsado`.

Convenciones de las consultas:

- `centroId` omitido o `null` = **todos los centros visibles del actor** (toda la red para
  ADMIN_RED; toda su institución para ADMIN).
  Pasar un centro ajeno lanza `SIN_ACCESO_AL_CENTRO`. Lo habitual: pasar el `centroId` de
  `contextoPagina`.
- `Paginado<T>` = `{ items, total, pagina, porPagina, totalPaginas }`; por defecto 25, máximo 100.
  Todos los servicios normalizan con `normalizarPagina` (`servicios/apoyo-admin`), que acota la
  página a 1..1.000.000 con `acotarPagina` (§9): un `?pagina=` absurdo cae en la página 1.
- **Texto y fechas de filtros:** todo texto libre pasa por `textoDeBusqueda` (`apoyo-admin`; quita
  caracteres de control como el byte nulo y acota a 120) antes de llegar a SQL o al detalle de
  auditoría. Las fechas `desde`/`hasta` se leen con `parsearDiaFiltro`: fuera de 2000–2100 se
  ignoran.
- **Stock:** `total` = unidades físicas; `vencido` = en lotes vencidos; `disponible = total −
  vencido`. `estadoStock` compara `disponible` con el mínimo (suma de los mínimos de los centros
  del alcance): `SIN_STOCK` (≤ 0), `BAJO_MINIMO` (< mínimo), `OK`. Sin mínimo definido solo hay
  `SIN_STOCK` / `OK`.
- **Vencimiento = semáforo** (`EstadoVencimiento`, regla única en `@/lib/estados`): `VENCIDO`
  (venció), `ROJO` (vence en menos de 3 meses), `AMARILLO` (3 meses o más y menos de 6), `VERDE`
  (6 meses o más) y `SIN_VENCIMIENTO`. Ver "Semáforo de vencimiento" a continuación.
- El inventario lista los insumos con existencias registradas o con parámetro de stock en el
  alcance (un consultorio no ve dializadores que nunca tuvo). Con `ubicacionId` se filtran los
  insumos con stock en esa ubicación y se agrega `enUbicacion`; los totales y estados siguen
  siendo del alcance de centros.
- Las alertas de stock existen solo para insumos con `ParametroStock` en el centro
  (`stockMinimo > 0`), una por insumo × centro.
- **Búsquedas por texto:** sin distinguir tildes ni mayúsculas (`unaccent` + `ILIKE`, con
  `patronLike` de `servicios/apoyo-admin.ts`, que escapa comodines y acota a 120 caracteres) en
  inventario, catálogo (`buscarInsumos`, administración), proveedores, usuarios, historial de
  movimientos y todos los reportes y sus CSV (existencias, consumo, vencimientos, movimientos y
  mermas; estos dos últimos con `consultaPorTexto`).

### Semáforo de vencimiento

Regla única, en `src/lib/estados.ts`. **No la repitas**: usa estas piezas.

| Pieza | Qué es |
|---|---|
| `MESES_SEMAFORO_ROJO = 3`, `MESES_SEMAFORO_AMARILLO = 6` | Las dos constantes de la regla. |
| `limitesSemaforo(hoy)` | `{ hoy, amarilloDesde: hoy + 3 meses, verdeDesde: hoy + 6 meses }` (meses calendario con `sumarMeses`: mismo día del mes, o su último día si no existe; hoy = día de Santiago). |
| `calcularEstadoVencimiento(fecha, hoy)` | `fecha < hoy` → `VENCIDO`; `< amarilloDesde` → `ROJO`; `< verdeDesde` → `AMARILLO`; si no `VERDE`; sin fecha → `SIN_VENCIMIENTO`. El día del vencimiento aún es `ROJO`. |
| `peorEstadoVencimiento`, `GRAVEDAD_SEMAFORO` | Color de un insumo = el peor de sus lotes con stock (VENCIDO > ROJO > AMARILLO > VERDE). |
| `leerSemaforo` / `escribirSemaforo`, `FILTROS_SEMAFORO`, `OPCIONES_FILTRO_SEMAFORO` | Filtro `?semaforo=rojo|amarillo|verde|vencido` de la URL (admite varios separados por coma). |
| `servicios/semaforo.ts` | La misma regla en SQL: `sqlColorSemaforo`, `sqlEsColor`, `sqlEsAlgunColor` reciben las fechas de `limitesSemaforo` (la base y el código clasifican igual; lo comprueba `tests/semaforo.test.ts`). |
| `BadgeEstadoVencimiento`, `SEMAFORO_UI`, `LeyendaSemaforo`, `DesgloseSemaforo` (`@/components/ui`) | Presentación: color + **forma propia** (octágono, triángulo, círculo; calendario tachado para vencido) + nombre escrito. Nunca solo color. |

Convenciones:

- **Unidad de conteo:** un "lote" del semáforo es un lote con stock **en una ubicación** (fila de
  `existencias` con cantidad > 0): es lo que se lista en alertas, panel y reportes. Un lote en dos
  ubicaciones cuenta dos veces. "Insumos" = insumos distintos con algún lote de ese color.
- **Coherencia:** panel (`resumenSemaforo`) = pestañas de `/alertas` (`resumen.vencidos|rojo|amarillo`)
  = `/inventario?semaforo=` (n.º de insumos) = reportes de existencias y vencimientos con
  `?semaforo=` (n.º de lotes). `tests/semaforo.test.ts` y `e2e/coherencia.spec.ts` lo verifican.
- **Alcance:** todos los servicios del semáforo (`resumenSemaforo`, `lotesPorColor`, panel,
  alertas, inventario, reportes y exportaciones) filtran con `alcanceDeCentros`, así que cada
  institución ve solo su semáforo y la red ve la suma. En el panel de ADMIN_RED,
  `resumenPorInstitucion` reparte el mismo desglose por centro (`ResumenPanel.porCentro`: sin
  stock, bajo mínimo, vencidos, rojo, amarillo) entre las instituciones.
  `tests/aislamiento-semaforo-proveedores.test.ts` comprueba el aislamiento (también del orden
  "por uso" del directorio de proveedores y de la búsqueda por código del escáner).
- **Orden del panel:** botón Escanear (celular/tablet) y acciones del bodeguero → indicadores (qué
  falta) → "La red por institución" (solo ADMIN_RED en "Toda la red") → semáforo y productos en
  rojo → atención de hoy y actividad, con proveedores y accesos rápidos al costado.
- **URLs antiguas:** `/inventario?estado=POR_VENCER|VENCIDO` redirige a `?semaforo=rojo,amarillo` /
  `?semaforo=vencido`; `/alertas?tab=por-vencer` abre la pestaña Rojo; el antiguo `?dias=30|60|90`
  de los reportes se ignora.
- **Reportes:** `FilaExistencia.estadoVencimiento`; el CSV de existencias y de vencimientos trae la
  columna de texto "Semáforo" (`Rojo`, `Amarillo`, `Verde`, `Vencido`, `Sin vencimiento`). El
  reporte de vencimientos lista por defecto vencidos + rojo + amarillo.

### Exportaciones CSV

Un Route Handler de exportación es `responderCsv((actor) => exportarX(actor, filtros))`
(`@/server/respuesta-csv`): exige sesión sin cambio de clave pendiente, limita a
`MAXIMO_EXPORTACIONES_POR_MINUTO` (10) descargas por usuario y minuto (429 + `Retry-After`),
traduce `ErrorDominio` a 400/401/403/404, y transmite el archivo por partes sin caché. El servicio
devuelve un `ExportacionCsv` `{ archivo, encabezados, filas: AsyncIterable<CeldaCsv[]>, truncada? }`
y audita con `auditarExportacion`. Tope: `MAXIMO_FILAS_EXPORTACION` (200.000). El servicio entrega
hasta una fila más que el tope y `responderCsv` (`conAvisoDeTope`) corta ahí y **termina el archivo
con una fila de aviso** ("archivo incompleto…"); cuando se sabe de antemano, además envía
`X-Exportacion-Truncada: 1` y la auditoría registra `truncada: true`.

`@/lib/csv`: `generarCsv(encabezados, filas)` (documento completo en memoria, para archivos
pequeños), `filaCsv`, `escaparCeldaCsv`, `neutralizarFormula`, `nombreArchivoCsv(base, sufijo?)`.
Formato para Excel es-CL: UTF-8 con BOM, separador `;`, CRLF, decimales con coma y protección
contra inyección de fórmulas.

### Cómo agregar un servicio

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
    texto: textoParam(sp.q) ?? undefined,     // nunca sp.q directo (ver §9, @/lib/parametros)
    pagina: paginaParam(sp.pagina),           // nunca Number(sp.pagina)
  });
  // …PageHeader, filtros (SearchInput escribe ?q=), DataTable, <Pagination {...inventario} />
}
```

- Los filtros y la página viven en la **URL** (`?q=`, `?estado=`, `?pagina=`): `SearchInput` y
  `Pagination` ya la sincronizan. La página relee `searchParams` **siempre** con los helpers de
  `@/lib/parametros` (`textoParam`, `paginaParam`, `diaParam`, `enumParam`) o de
  `@/lib/parametros-url` / `leerFiltros`: son el único lugar donde se acotan página, texto y fechas.
- Lo interactivo va en un Client Component hermano (`formulario-x.tsx`, `"use client"`) que
  recibe datos serializables por props. No pases funciones ni íconos desde el servidor.
- Ruta dinámica: `const { insumoId } = await params;` y `notFound()` si el servicio lanza
  `NO_ENCONTRADO`. Ojo: si la ruta tiene un `loading.tsx` por encima, la respuesta ya empezó a
  transmitirse y el estado HTTP queda en 200 (se ve la pantalla de "no encontrado", con
  `noindex`). Las rutas de detalle que deben responder 404 real viven en el grupo `(directo)`,
  que no tiene `loading.tsx` (§10).
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

`accionSegura` exige sesión (sin cambio de contraseña pendiente; si la cookie trae una sesión que ya
no vale, la borra), verifica el permiso del rol, valida con zod, traduce errores y revalida. Devuelve siempre `ResultadoAccion<T>`:
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

`useAccion` maneja `pendiente`, `error`, `erroresCampo`, los toasts (éxito y error) y la sesión
vencida (§5). Las claves de `erroresCampo` son las rutas de zod (`"cantidad"`, `"items.0.cantidad"`).

**Ningún error del servidor puede quedar invisible.** Si el servidor devuelve un error de un campo
que la pantalla no muestra en ese momento (un modo que oculta el control, un campo interno como
`claveIdempotencia`), debe aparecer en el resumen del formulario: los formularios de movimientos
usan `<ResumenErrores errores={accion.erroresCampo} camposVisibles={[…]} />`
(`@/components/movimientos/formulario`; la lógica pura es `erroresSinControl` de
`@/lib/errores-formulario`).

## 8. Errores

`ErrorDominio(codigo, mensaje, { campo?, detalle? })` en `@/server/errores`. Mensajes en español,
listos para el usuario. Códigos: `NO_AUTENTICADO`, `SIN_PERMISO`, `SIN_ACCESO_AL_CENTRO`,
`VALIDACION`, `NO_ENCONTRADO`, `INACTIVO`, `DUPLICADO`, `EN_USO`, `STOCK_INSUFICIENTE`,
`LOTE_VENCIDO`, `LOTE_INCONSISTENTE`, `VENCIMIENTO_REQUERIDO`, `TRASLADO_INVALIDO`,
`CREDENCIALES_INVALIDAS`, `PASSWORD_DEBIL`, `PASSWORD_ACTUAL_INCORRECTA`, `OPERACION_INVALIDA`,
`DEMASIADOS_INTENTOS` (límite de intentos o servidor saturado; 429 en exportaciones).
Agrega códigos nuevos a `CODIGOS_ERROR`. Los errores inesperados se registran en el servidor y al
cliente llega un mensaje genérico (`codigo: "ERROR_INTERNO"`).

En páginas, un `ErrorDominio` no atrapado cae en `(app)/error.tsx`; atrapa `NO_ENCONTRADO` y llama
a `notFound()` cuando corresponda.

## 9. Utilidades Chile (`src/lib`)

| Módulo | Funciones |
|---|---|
| `chile/rut` | `validarRut`, `formatearRut` (12.345.678-5), `normalizarRut` (12345678-5), `calcularDv`, `limpiarRut` |
| `chile/regiones` | `REGIONES` (16 regiones con comunas principales), `NOMBRES_REGIONES`, `comunasDeRegion` |
| `fechas` | `hoyEnSantiago`, `diaEnSantiago`, `parsearDia`, `formatearDia` (dd-MM-yyyy), `formatearFecha`, `formatearFechaHora` (dd-MM-yyyy HH:mm), `formatearRelativo`, `describirVencimiento`, `sumarDias`, `sumarMeses`, `diasEntre`, `inicioDelDia`, `finDelDia`, `diaADate`, `dateADia` |
| `formato` | `formatearNumero` (1.234), `formatearDecimal`, `formatearDecimalFijo`, `formatearCLP` ($12.500), `formatearMonto` ($1.250,5: conserva decimales), `formatearPorcentaje`, `pluralizar`, `interpretarNumero` / `parsearNumero`, `normalizarTexto` |
| `gs1`, `escaneo` | Códigos de barras y cadenas GS1; rutas del flujo de escaneo (§15) |
| `estados` | `calcularEstadoStock`, `calcularEstadoVencimiento`, `limitesSemaforo`, `peorEstadoVencimiento`, `leerSemaforo`, `diasParaVencer`, etiquetas (`ETIQUETA_*`), `SIGNO_MOVIMIENTO`, `MOTIVOS_MERMA`, `MOTIVOS_AJUSTE`, `UNIDADES_MEDIDA`, `TIPOS_*` |
| `esquemas/base` | `zId`, `zIdOpcional`, `zCantidad`, `zEnteroNoNegativo`, `zTexto(max)`, `zTextoOpcional(max)`, `zDia`, `zDiaOpcional`, `zMontoOpcional` (+ `MONTO_MAXIMO`), `zRut`, `zEmail`, `zClaveIdempotencia`, `nuevaClaveIdempotencia()` |
| `csv` | `generarCsv`, `filaCsv`, `escaparCeldaCsv`, `neutralizarFormula`, `nombreArchivoCsv`, `BOM_UTF8` (ver "Exportaciones CSV" en §6) |
| `unidades` | `pluralUnidad("caja")` → "cajas", `unidadSegun(cantidad, unidad)`, `cantidadConUnidad(20, "caja")` → "20 cajas", `cantidadConSigno(3, "caja", 1)` → "+3 cajas" |
| `parametros` | ★ Único lugar donde se acota lo que viene de la URL: `acotarPagina(valor)` (entero seguro 1..`PAGINA_MAXIMA` = 1.000.000; lo demás → 1), `limpiarTexto(texto, max?)` (sin caracteres de control, recortado), `textoParam`, `enumParam(valor, permitidos)`, `paginaParam`, `diaParam` (día de filtro, 2000–2100) |
| `parametros-url` | Filtros en la URL compartidos por páginas y Route Handlers, sobre los helpers anteriores: `parametrosDe(URLSearchParams)`, `leerTexto`, `leerOpcion`, `leerEntero` (enteros pequeños, p. ej. `dias`), `leerPagina(sp, clave?)`, `leerDia`, `construirHref(ruta, parametros)`, `resolverCentro(…)` |
| `errores-formulario` | `conPuntoFinal`, `unirErrores`, `erroresSinControl(errores, camposVisibles)`, `esSesionVencida(resultado)`, `rutaLoginConDestino(location)` |
| `filtros-reportes` | `leerFiltros(sp)`: los filtros de los reportes, iguales en la vista y en su exportación |
| `fefo` | `ordenarFefo(lotes)`, `planificarFefo(lotes, cantidad)`: vista previa en el cliente del orden que aplicará el servidor |
| `abastecimiento` | `calcularReposicion`, `calcularCobertura`, `nivelDeCobertura`, `ETIQUETA_NIVEL_COBERTURA` |

**Montos (`zMontoOpcional`, `interpretarNumero`).** La coma es el separador decimal; el punto es
de miles solo si agrupa de a tres (`1.250`, `1.250.000,5`). Un punto usado como decimal (`1250.5`,
`1.5`) **se rechaza** con "Usa coma para los decimales: 1250,5." en vez de adivinar: el libro mayor
es inmutable. Tope de sanidad `MONTO_MAXIMO` = 100.000.000. El formulario de ingreso muestra bajo
el campo el monto interpretado ("Se guardará como $1.250,5 por caja").

**Mensajes de validación.** Todos los mensajes de `src/lib/esquemas` terminan en punto, tutean y
dicen "correo electrónico" (nunca "email"); `tests/utilidades.test.ts` lo comprueba leyendo el
código.

`zCantidad` y `zEnteroNoNegativo` aceptan **solo** un `number` entero o un texto de dígitos
(`"24"`, `" 24 "`): rechazan `"0x10"`, `"1e3"`, `true`, `[5]` o `""`, que `z.coerce.number()`
convertiría en silencio. `motivo` admite hasta 200 caracteres y `nota` hasta 500. zod corre en modo
`jitless` (configurado en `esquemas/base`): no usa `new Function`, que la CSP bloquearía.

Fechas de filtros: usa `parsearDiaFiltro` (`fechas`), no `parsearDia`: ignora lo que cae fuera de
2000–2100 (`?desde=9999-12-31` producía instantes que la base no maneja).

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
| `Badge` y derivados | `<Badge tono="neutro\|marca\|exito\|alerta\|peligro\|info" icono={X}>`, `<BadgeEstadoStock estado />`, `<BadgeEstadoVencimiento estado dias />` (semáforo), `<LeyendaSemaforo />`, `<DesgloseSemaforo conteo />`, `<BadgeTipoMovimiento tipo />`, `<BadgeRol rol />`, `<BadgeActivo activo />` |
| `Card` | `<Card>` con `<CardHeader titulo descripcion acciones />`, `CardFooter`. `relleno={false}` + `overflow-hidden` para tablas a sangre. |
| `DataTable` | Tabla en escritorio, tarjetas en móvil. Ver ejemplo abajo. Sirve en Server Components. |
| `Dialog` | `<Dialog><DialogTrigger asChild>…</DialogTrigger><DialogContent titulo descripcion ancho="sm\|md\|lg\|xl">…<DialogFooter/></DialogContent></Dialog>` (hoja inferior en móvil). |
| `Sheet` | Panel lateral: `<SheetContent titulo lado="derecha\|izquierda">`. |
| `ConfirmDialog` | `<ConfirmDialog disparador={<Button/>} titulo descripcion peligro textoConfirmar onConfirmar={async () => …} />` |
| `Tabs` | `<Tabs defaultValue="a"><TabsList><TabsTrigger value="a" contador={3}>…</TabsTrigger></TabsList><TabsContent value="a">…` |
| `DropdownMenu` | `DropdownMenuTrigger/Content/Item/Label/Separator` (acciones por fila, menús). |
| `toast` / `Toaster` | `toast.exito("Guardado")`, `toast.error("…")`, `toast.info("…")`. `Toaster` ya está en el layout raíz. |
| `Pagination` | `<Pagination {...paginado} />` (usa `?pagina=` y conserva los demás parámetros). Con más de una lista paginada en la página: `parametro="paginaMermas"` y `etiqueta="Paginación de mermas"` (nombre accesible del `nav`). Una página más allá del final ofrece "Ir a la última página". |
| `SearchInput` | `<SearchInput placeholder="Buscar insumo…" />` sincroniza `?q=` con debounce; con `onBuscar` no toca la URL. `useDebounce(valor, ms)`. |
| `EmptyState` | `<EmptyState icono={X} titulo descripcion accion={…} compacto />` |
| `Skeleton` | `Skeleton`, `SkeletonTabla`, `SkeletonTarjetas` (para `loading.tsx`). |
| `PageHeader` | `<PageHeader titulo descripcion acciones volver={{ href, label }} />` — un solo `<h1>` por página. |
| `StatCard` | `<StatCard etiqueta valor detalle icono tono href />` |
| `Alert` | `<Alert tono="info\|exito\|alerta\|peligro" titulo>…</Alert>` para mensajes en línea. |
| `useAccion` | Ver §7. |
| `avisarSesionVencida`, `esSesionVencida` | Sesión vencida desde el cliente (§5). |

Fuera del kit, piezas compartidas por las pantallas:

| Pieza | Uso |
|---|---|
| `ComboboxInsumo` (`@/components/movimientos/combobox-insumo`) | Buscador accesible de insumos (combobox WAI-ARIA; nombre, código o código de barras escaneado). `<ComboboxInsumo valor onCambiar iniciales placeholder? autoFocus? disabled? compacto? priorizarRetirosDeCentroId? />` con `InsumoOpcion` (= `OpcionInsumo` de `buscarInsumos`). Llama a `buscarInsumosAccion`. Dentro de `<Field>` toma id y aria. |
| `@/components/movimientos/formulario` | `useExistenciasInsumo(insumoId, centroId)` (existencias en vivo vía `existenciasInsumoAccion`), `PanelExistencias`, `Confirmacion` (props `centro`: centro REAL del movimiento según el servidor; `repetido`: avisa "Este movimiento ya estaba registrado; no se duplicó."), `CifrasConfirmacion`, `enfocarPrimerError`, `erroresDeEsquema`, `unirErrores`, `AnuncioErrores`, `ResumenErrores`, `AYUDA_SIN_PACIENTES` (ayuda de todo campo de nota o motivo libre). |
| `AvisoCambioCentro` (`@/components/movimientos/aviso-cambio-centro`) | En las cuatro páginas de formulario: al volver a la pestaña refresca los datos del servidor y, si el centro activo cambió en otra pestaña, lo avisa. |
| `BotonCorregirVencimiento` (`@/components/inventario/corregir-vencimiento`) | Diálogo de corrección del vencimiento de un lote (solo administradores). |
| `ResumenInstituciones` (`@/components/panel/resumen-instituciones`) | "La red por institución" del panel de ADMIN_RED en "Toda la red": una tarjeta por institución (centros, sin stock, bajo mínimo y el semáforo en lotes: vencidos, rojo y amarillo, con la forma de cada color); `/panel?institucion=<id>` despliega sus centros y cada conteo enlaza a `/alertas?tab=…&centro=…`. |
| `AvisoCatalogoCompartido` (`@/components/admin/aviso-catalogo-compartido`) | Aviso al ADMIN de institución: el catálogo es de toda la red (crea, no modifica). |
| `@/components/movimientos/campos` | `CampoCantidad`, `SelectUbicacion`, `SelectorLote`, `OpcionesTarjeta`, `Grupo`, `Sugerencias`, `ubicacionPorDefecto`, `leerCantidad`. |
| `useParametrosUrl()` (`@/components/inventario/parametros-url`) | Estado en la URL para filtros y paneles: `{ params, urlCon(cambios, { conservarPagina? }), filtrar(cambios), pendiente, iniciar, router }`. `filtrar` reemplaza la entrada del historial, vuelve a la página 1 y no salta al inicio. `enfocarFila(id)` devuelve el foco a la fila (`data-fila`) que abrió un panel. |
| `@/components/admin/filtros-url` | ★ Módulo único de filtros que escriben en la URL (lo usan administración, alertas y reportes): `BarraFiltros`, `FiltroBusqueda`, `FiltroSelect`, `FiltroFecha`, `FiltroPeriodo`, `FiltroCentro` (solo en "Toda la red"), `LimpiarFiltros`. `useValidacion(esquema, erroresServidor)` en `use-validacion`. |

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
centro y menú de usuario. El selector ofrece "Toda la red" + los centros agrupados por
institución (ADMIN_RED), "Toda mi institución" + sus centros (ADMIN) o solo los centros asignados
(BODEGUERO, VISITANTE); el menú de usuario muestra la institución. Para agregar una entrada de navegación edita `src/lib/navegacion.ts`
(con su permiso). El contenido de cada página se renderiza dentro de `<main>` con ancho máximo y
márgenes ya definidos: empieza directamente con `<PageHeader>`.

### Temas: claro, oscuro y según el dispositivo

- **Preferencia:** cookie `ri_tema` = `claro` | `oscuro` (no httpOnly, `SameSite=Lax`, 1 año; sin
  cookie = "según el dispositivo", el valor por defecto). La escribe el navegador
  (`useTema().cambiar` en `components/shell/tema.tsx`, igual que `ri_sidebar`) y sobrevive al
  cierre de sesión. `@/lib/tema` tiene las constantes y `leerTema` (lista blanca).
- **Sin parpadeo y sin script:** `app/layout.tsx` lee la cookie y pone `data-tema="claro|oscuro"`
  en `<html>` (y el `theme-color`: uno fijo, o uno por `prefers-color-scheme` si no hay cookie).
  Con "según el dispositivo" no hay atributo y decide el CSS. No hay script en línea: la CSP no
  cambia.
- **CSS (`globals.css`):** `:root` y `@theme` tienen los valores claros; `@utility ri-tema-oscuro`
  redefine los tokens `--ri-*` y las escalas `--color-*`, y se aplica con `@apply` en
  `@media screen { :root[data-tema="oscuro"] }` y en
  `@media screen and (prefers-color-scheme: dark) { :root:not([data-tema]) }`. Al ser solo
  `screen`, **la impresión siempre sale en claro**. `color-scheme` acompaña al tema (controles
  nativos, scrollbars).
- **Papel de cada escalón en oscuro** (no es una inversión): `50–100` fondos teñidos, `200–400`
  bordes y anillos, `500–600` gráficos, íconos y bordes de acento (≥ 3:1), `700–950` texto
  (≥ 4,5:1). Por eso **un relleno sólido con texto blanco nunca usa un escalón numérico**:
  `bg-primario` (+ `-hover`, `-activo`), `bg-critico` (+ `-hover`, `-activo`) y `bg-vencido`
  (`ring-vencido-borde`). Otros tokens: `bg-superficie-alta` (diálogos, menús, toasts: un nivel
  sobre `superficie`), `bg-velo` (fondo de diálogos), `outline-foco`, `bg-pista`/`text-sobre-pista`
  (tooltip del rail), `serie-salidas` (gráfico) y los fijos `noche-*` / `exito-fijo` para zonas
  siempre oscuras (panel del login, cámara del escáner).
- **Controles:** `TemaEnMenu` (menú de usuario, `menuitemradio`) y `SelectorTema` (login y cambio
  de contraseña, radios nativos).
- **Pruebas:** `tests/tema.test.ts` mide con la fórmula de WCAG los pares texto/fondo (≥ 4,5:1) y
  gráfico/fondo (≥ 3:1) de los tokens en ambos temas, incluido el semáforo; `e2e/tema.spec.ts`
  cubre el cambio, la persistencia, `prefers-color-scheme`, la impresión y la CSP. Si agregas un
  color nuevo, agrégalo a los dos temas y a la prueba.

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
  `pointer-fine:` (p. ej. `Button size="sm"`), nunca un breakpoint de ancho. Los botones internos
  de fila de las tablas (inventario, historial) son compactos con mouse y suben a 44 px con
  `pointer-coarse:min-h-11`.
- **Formularios de movimiento:** piden confirmación los ajustes y las mermas (siempre) y los
  retiros de más de la mitad de lo disponible en la ubicación; mientras cargan las existencias el
  botón de envío queda deshabilitado con "Cargando existencias…"; la confirmación muestra el centro
  real del movimiento.
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
  `entidad` = nombre del modelo, `detalle` sin datos sensibles, e `institucionId` según §4
  ("Auditoría por institución").
- **Commits:** mensajes claros en español; sin identificadores de herramientas de IA.
- **Trabajo en paralelo:** cada equipo trabaja en sus rutas y en archivos nuevos de `servicios/`,
  `acciones/` y `esquemas/`. Los archivos compartidos (`permisos.ts`, `navegacion.ts`,
  `servicios/index.ts`, `errores.ts`, `schema.prisma`, UI kit) se tocan con cambios mínimos y
  aditivos. Un cambio de schema requiere migración nueva (`npm run db:migrate -- --name x`); no
  edites las migraciones ya aplicadas. Si la migración agrega una tabla de solo-agregar, incluye
  sus triggers de inmutabilidad y documenta el `REVOKE` en `DESPLIEGUE.md` §6.1.

## 12. Comandos

```bash
npm run dev          # desarrollo (http://localhost:3000)
npm run build        # build de producción (output standalone)
npm start            # inicia ese build: scripts/iniciar.mjs copia .next/static y public junto a
                     # .next/standalone/server.js y lo arranca (npm start -- -p 3200).
                     # "next start" NO sirve con output standalone.
npm run typecheck    # next typegen + tsc --noEmit
npm run lint         # eslint
npm test             # vitest (migra y usa la base de DATABASE_URL_TEST; se ejecuta en serie)
npm run test:e2e     # Playwright contra el build (base medired_e2e; ver README)
npm run db:migrate   # prisma migrate dev         npm run db:deploy (producción)
npm run db:seed      # seed demo (idempotente; el historial solo se genera si no hay movimientos)
npm run db:reset     # borra TODO y vuelve a migrar + seed (solo desarrollo)
npm run db:studio    # Prisma Studio
```

`db:reset` es destructivo y Prisma lo bloquea cuando lo invoca un agente de IA: debe ejecutarlo una
persona. Variables en `.env` (ver `.env.example`): `DATABASE_URL`, `DATABASE_URL_TEST`,
`SESION_HORAS`, `TRUST_PROXY`. PostgreSQL local: `service postgresql start` si estuviera detenido.

`prisma` (CLI) es una **devDependency**: el servidor en producción solo usa `@prisma/client`
(la imagen `app` no contiene la CLI). `npm ci` debe instalar las dependencias de desarrollo
(el `postinstall` ejecuta `prisma generate` y el build las necesita); no uses `--omit=dev`.
`npm audit --omit=dev` sigue listando la CLI porque `@prisma/client` la declara como *peer*
opcional; la comprobación equivalente a lo que corre en producción es
`npm audit --omit=dev --omit=optional`.

### Cuentas demo (seed)

Dos instituciones ficticias: **Centros de Diálisis Andes SpA** (Centro de Diálisis Ñuñoa y Centro
de Diálisis Concepción) y **Corporación Municipal de Salud Cerro Alegre** (Consultorio Cerro
Alegre).

| Rol | Email | Contraseña | Institución · centros |
|---|---|---|---|
| ADMIN_RED | admin@redinsumos.cl | Admin.Demo.2026 | toda la red |
| ADMIN | admin.andes@redinsumos.cl | AdminAndes.Demo.2026 | Andes · todos sus centros |
| ADMIN | admin.cerroalegre@redinsumos.cl | AdminCerro.Demo.2026 | Cerro Alegre · todos sus centros |
| BODEGUERO | bodega@redinsumos.cl | Bodega.Demo.2026 | Andes · Centro de Diálisis Ñuñoa |
| VISITANTE | visita@redinsumos.cl | Visita.Demo.2026 | Andes · Centro de Diálisis Ñuñoa |
| BODEGUERO | bodega.valparaiso@redinsumos.cl | Bodega.Valpo.2026 | Cerro Alegre · Consultorio Cerro Alegre |
| BODEGUERO | bodega.concepcion@redinsumos.cl | Bodega.Conce.2026 | Andes · Centro de Diálisis Concepción |
| VISITANTE | nuevo@redinsumos.cl | Temporal.2026 (debe cambiarla) | Andes · Ñuñoa y Concepción |

Si el seed corre sobre una base demo anterior al nivel Institución (ya migrada), reutiliza la
"Institución principal" de la migración como Andes y mueve el consultorio a Cerro Alegre.

La contraseña temporal de la cuenta demo `nuevo@` no vence (el seed deja `passwordTemporalExpira`
en `null`); las que genera la aplicación vencen a las 72 h.

## 13. Seguridad y deudas conocidas

- Cabeceras en `next.config.ts`: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy` (`camera=(self)` para el escáner; micrófono, ubicación y pagos bloqueados),
  COOP, HSTS en producción y una CSP de respaldo (sin scripts en línea) para
  lo que no pasa por el proxy (archivos estáticos).
- **CSP con nonce por solicitud** (`src/proxy.ts`, `construirCsp`): `script-src 'self'
  'nonce-…' 'strict-dynamic' 'wasm-unsafe-eval'` (este último solo para el lector de códigos, §15),
  **sin `'unsafe-inline'`** en scripts (en desarrollo se agrega
  `'unsafe-eval'`, que React necesita). Next lee el nonce de la cabecera de la solicitud y lo pone
  en sus scripts; por eso todo se renderiza por solicitud (`connection()` en el layout raíz). Si
  agregas un `<Script>` propio, pásale el nonce (`(await headers()).get("x-nonce")`). `style-src`
  conserva `'unsafe-inline'` (React y Radix escriben estilos en línea).
- Límite de intentos, IP confiable y contraseñas temporales: §5. Inmutabilidad e idempotencia: §3.
- **Deuda — `style-src 'unsafe-inline'`:** quitarlo exige eliminar los `style={…}` en línea.
- **Deuda — bloqueo global por cuenta:** un ataque muy distribuido (30+ fallos desde muchas IP)
  retrasa hasta 15 min a un titular que entra desde una red nueva; no afecta a sus redes habituales.
  Sin `TRUST_PROXY`, un tercero puede bloquear una cuenta 15 min repitiendo claves erradas.
- **Deuda — recuperación de contraseña:** no hay flujo por correo; la restablece un administrador
  (de la institución o de la red).
- **Límites conocidos del nivel Institución:** (1) el correo de un usuario, el nombre de un centro,
  el código de un insumo y el RUT de un proveedor son únicos en toda la red: al crear uno repetido,
  el mensaje "ya existe" revela que existe en otra institución; (2) el contador "ingresos" de la
  lista de proveedores cuenta los de toda la red; (3) la restricción "centros asignados de la
  misma institución" se valida en el servidor y al armar la sesión, no con una FK compuesta en la
  base; (4) no hay vista "Toda la institución X" para el administrador de la red (elige un centro
  o usa el resumen por institución del panel); (5) lo que un ADMIN de institución hace sobre
  proveedores solo queda en la auditoría de su institución y de la red.
- **Deuda — 404 real fuera de `(directo)`:** las rutas de detalle de administración
  (`/admin/insumos/<id>`, `/admin/centros/<id>`) siguen bajo `(app)/loading.tsx`: un id inexistente
  muestra "no encontrado" (con `noindex`) pero responde HTTP 200.
- **Deuda — sesión vencida y borradores:** al vencer la sesión se conserva la ruta (con su
  prellenado por URL), no lo escrito en el formulario.
- **Deuda — sin conexión:** la app es instalable (manifiesto) pero no tiene service worker: no
  funciona sin red.
- **Auditoría legible:** toda acción que el código escribe tiene etiqueta en
  `components/admin/auditoria-legible.ts` (`ETIQUETA_ACCION`); el test de utilidades falla si se
  agrega una acción sin etiqueta.
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
| Scripts | `scripts/` | `admin:crear`, `sesiones:limpiar` (tsx, importan `./preparar-entorno` primero; `sesiones:limpiar` borra sesiones vencidas y contadores vencidos del limitador), `respaldo.sh` y `restaurar.sh` (bash + cliente PostgreSQL; compatibles con los triggers de inmutabilidad). |
| CI | `.github/workflows/ci.yml` | Migraciones, tipos, lint, pruebas, build e imagen Docker. |

La limpieza de sesiones y contadores vencidos la hace `npm run sesiones:limpiar` (servicio
`mantenimiento` de Compose o cron). `npm run db:seed` es solo para demostración y se niega a correr
con `NODE_ENV=production` salvo `SEED_DEMO=1`. Compose fija `TRUST_PROXY=1` para la aplicación y
permite conectarla con un rol de base de datos de privilegios mínimos (`APP_DB_USER`,
`APP_DB_PASSWORD`; `DESPLIEGUE.md` §6.1).

## 15. Escáner de códigos y proveedores en el panel

### Escáner con la cámara

| Pieza | Dónde | Notas |
|---|---|---|
| Parser GS1 y GTIN | `src/lib/gs1.ts` | Propio, puro e isomórfico. `validarGtin`, `normalizarGtin` (→ 14 dígitos), `variantesGtin` (GTIN-14 ↔ EAN-13 ↔ UPC-A ↔ EAN-8 por ceros a la izquierda), `parsearGs1` (forma cruda con FNC1/`<GS>`, con paréntesis y GS1 Digital Link; AI 01, 10, 11, 17, 21 y los comunes), `fechaGs1` (AAMMDD; día 00 = último día del mes en vencimientos; siglo por la regla GS1) e `interpretarCodigo` → `{ tipo: "GS1" \| "GTIN" \| "TEXTO", codigo, gtin, candidatos, lote, vencimiento, fabricacion, serie }`. No adivina: una cadena inválida o incompleta no entrega lote ni fecha. |
| Lector | `src/components/escaner/lector.ts` | `BarcodeDetector` nativo si reconoce todos los formatos (Chrome en Android); si no, **`zxing-wasm`** (ZXing C++ en WebAssembly: Safari/iOS, Firefox, escritorio). Formatos: EAN-13, EAN-8, UPC-A/E, Code 128 (GS1-128), DataMatrix (GS1) y QR. El `.wasm` lo empaqueta Next como estático propio con hash (`new URL(…, import.meta.url)` → `/_next/static/media/`): **sin CDN**. |
| Diálogo | `src/components/escaner/dialogo-escaner.tsx` | Pantalla completa en celular. Cámara trasera (`facingMode: environment`), marco guía, linterna si el dispositivo la ofrece (`torch`), vibración + pitido + marca visual al leer, y **siempre** "Escribir el código" (también para lectores USB/Bluetooth). Estados con explicación: sin permiso, sin cámara, contexto no seguro (HTTP), cámara ocupada, lector no disponible. Libera la cámara al cerrar, al leer, al desmontar y al pasar a segundo plano. |
| Botón | `BotonEscanear` (`components/escaner/boton-escanear.tsx`) | Carga el diálogo con `next/dynamic` (nada del escáner pesa en el resto de la app). Sin `alLeer` navega a `/movimientos/escanear`. `BotonEscanearInsumo` busca el insumo y lo entrega (formulario de retiro). |
| Página | `/movimientos/escanear` (permiso `movimientos:ingreso`) | Con `?codigo=` busca **en el servidor** (`buscarInsumoPorCodigo`): una coincidencia activa → `redirect` a `/movimientos/ingreso?insumo=…&lote=…&vence=…&fab=…&escaneado=1`; si no, "No reconocemos este código": buscar el insumo a mano y continuar; con `catalogo:gestionar` (solo ADMIN_RED: modifica el catálogo compartido), además "Asociar este código a ese insumo" (`asociarCodigoBarrasAccion`, auditado); con `catalogo:crear` (ADMIN_RED y ADMIN), "Crear insumo con este código" (`/admin/insumos/nuevo?codigoBarras=`). Al ADMIN de institución se le indica que para asociarlo a un insumo existente contacte al administrador de la red; al bodeguero, que lo pida a su administrador. Nada de esto bloquea el ingreso. El mismo producto no puede quedar en dos insumos: crear, editar y asociar comparan todas las formas del GTIN (`variantesGtin`). |
| Rutas | `src/lib/escaneo.ts` | `hrefEscaneo(textoLeido)` interpreta en el cliente y arma parámetros simples (`codigo`, `lote`, `vence`, `fab`); el servidor valida cada uno (`limpiarTexto`, `normalizarNumeroLote`, `diaParam`). |

Dónde aparece: botón grande **Escanear** del panel (bajo `xl`: celular y tablet), ítem **Escanear**
de la barra inferior (roles con `movimientos:ingreso`), "Escanear para ingresar" en Accesos rápidos
y botón junto al buscador de insumos en los formularios de ingreso (completa insumo, lote y fechas
sin perder lo escrito) y de retiro.

Seguridad: `Permissions-Policy: camera=(self)` (y nada más habilitado) en `next.config.ts`; la CSP
de `proxy.ts` agrega `'wasm-unsafe-eval'` a `script-src` (solo permite compilar WebAssembly; no
`eval`), `media-src 'self' blob:` y `worker-src 'self'`. La cámara exige HTTPS o `localhost`.

Pruebas: `tests/gs1.test.ts` (parser y GTIN), `tests/proveedores-escaneo.test.ts` (búsqueda y
asociación), `e2e/escaner.spec.ts` (flujos por entrada manual) y `e2e/escaner-camara.spec.ts`
(cámara falsa de Chromium con un DataMatrix GS1 generado por `e2e/soporte/camara-falsa.ts`).

### Proveedores en el panel

- `Proveedor.sitioWeb`: lo valida y normaliza `zSitioWebOpcional` / `normalizarSitioWeb`
  (`@/lib/esquemas/proveedores`): solo `http(s)`, agrega `https://` si falta, sin credenciales,
  dominio real, máximo 300 caracteres. La base repite la defensa con un `CHECK`, y
  `listarDirectorioProveedores` y el componente vuelven a pasar el valor por `normalizarSitioWeb`
  antes de usarlo como `href`: nunca llega a la interfaz un `javascript:`.
- `DirectorioProveedores` (`components/panel/directorio-proveedores.tsx`): acordeón con
  `<details>/<summary>` (teclado nativo), "Ir a comprar" con `target="_blank"
  rel="noopener noreferrer"`, dominio visible e ícono de enlace externo; `tel:` y `mailto:`; "Editar"
  solo con `proveedores:gestionar`. El panel muestra 6 (`PROVEEDORES_EN_PANEL`); `/proveedores`,
  todos, con buscador.

## 16. Proveedor por insumo

El catálogo es compartido por toda la red, así que el proveedor de un insumo tiene **dos niveles**:

| Nivel | Dónde vive | Quién lo define |
|---|---|---|
| **Red** (predeterminado) | `Insumo.proveedorId` (opcional) | `catalogo:gestionar` (ADMIN_RED): `definirProveedorRed` o el campo "Proveedor predeterminado" de la edición del insumo. Al **crear** un insumo (`catalogo:crear`, también un ADMIN de institución) se puede indicar. |
| **Institución** (preferencia) | `ProveedorInsumoInstitucion` (`@@unique([insumoId, institucionId])`) | `proveedores-insumo:gestionar`: el ADMIN solo para SU institución; ADMIN_RED para cualquiera, indicando cuál (`definirProveedorInstitucion`). |

**Proveedor efectivo** de un insumo en un contexto = el de la institución del contexto, si existe →
si no, el predeterminado de la red → si no, ninguno. El contexto es la institución **del centro**
(o la del usuario): `institucionDeContexto(actor, centroId)` devuelve la del actor para ADMIN,
BODEGUERO y VISITANTE (nunca viene de la entrada) y, para ADMIN_RED, la del centro elegido o `null`
en "Toda la red" (ahí ve el predeterminado de la red y, en la ficha, el desglose por institución).

Reglas (todas en `servicios/proveedor-insumo.ts`; **no repitas la resolución en otro lado**):

- **Listados:** `sqlProveedorEfectivo` agrega dos `LEFT JOIN` y las columnas `prov*`; `proveedorDeFila`
  las convierte en `ProveedorEfectivo` (`{ id, rut, razonSocial, contacto, telefono, email, sitioWeb,
  activo, origen: "INSTITUCION" | "RED" }`). Sin consultas por fila. Lo usan `listarInventario`
  (campo `proveedor` y filtro `proveedorId`; `"sin"` = sin proveedor), `contarInsumosPorProveedor`,
  `listarInsumosAdmin`, `obtenerAlertas` / `listaReposicion` y el reporte de existencias. Donde cada
  fila es de un centro (alertas, reposición, existencias) la institución es `ce."institucionId"`: el
  proveedor es el de la institución de **ese** centro, también en "Toda la red".
- **Aislamiento:** quien no es ADMIN_RED solo lee la fila de su institución
  (`detalleProveedorInsumo.porInstitucion` llega vacío) y solo escribe en la suya (otra institución
  en la entrada → `NO_ENCONTRADO`). Un ADMIN no puede tocar el predeterminado de la red
  (`SIN_PERMISO`).
- **Proveedor inactivo:** no se puede asignar (`INACTIVO`, campo `proveedorId`) ni se ofrece en los
  selectores; una asignación existente **no se borra**: se entrega con `activo: false` y la interfaz
  la marca "Inactivo" y sugiere cambiarla. Las FK a `proveedores` son `Restrict`.
- **Último ingreso:** si no hay proveedor efectivo, `detalleProveedorInsumo.ultimoIngreso` trae el
  del último INGRESO del insumo en los centros del alcance. Es informativo ("Último proveedor"),
  con "Usar como predeterminado" para quien puede cambiarlo.
- **Ingreso:** `proveedorSugeridoAccion` (solo lectura) entrega el efectivo para el centro de destino
  y el formulario lo preselecciona sin pisar uno elegido a mano. `registrarIngreso` **no** modifica
  el proveedor del insumo, se registre con el que se registre.
- **Auditoría:** `INSUMO_PROVEEDOR_RED_ACTUALIZADO` (evento de red, `institucionId: null`) e
  `INSUMO_PROVEEDOR_INSTITUCION_ACTUALIZADO` (con la institución afectada, lo haga su administrador o
  el de la red); ambos con `entidad: "Insumo"` y `cambios.proveedor`. Cambiarlo desde la edición del
  insumo queda en `INSUMO_ACTUALIZADO`.
- **Lista de reposición:** `ListaReposicion.porProveedor` (grupos por proveedor efectivo, "sin
  proveedor" al final); `?agrupar=proveedor` en la página y en el CSV (mismas columnas, otro orden).
  El CSV agrega Proveedor, RUT, Teléfono y Correo; el de existencias (y el de vencimientos, que
  comparte formato), la columna Proveedor.

Interfaz (`components/proveedores/`): `BloqueProveedor` (nombre, origen, "Ir a comprar", `tel:`,
`mailto:`, aviso de inactivo, último proveedor y desglose), `EnlaceComprar` (reutiliza
`normalizarSitioWeb`; `target="_blank" rel="noopener noreferrer"`), `NombreProveedor` (grillas) y
`BotonCambiarProveedor` (diálogo con buscador de proveedores activos, ámbito explícito —"para tu
institución" / "predeterminado de la red"—, "Volver al predeterminado de la red" y paso de
confirmación). Aparece en: grilla y panel lateral de `/inventario` (columna desde `xl`; bajo el
nombre en anchos menores; filtro `?proveedor=`), ficha del insumo, `/admin/insumos` (columna, campo
al crear/editar y sección "Proveedor de tu institución"), alertas de stock y "Qué requiere atención",
lista de reposición, formulario de ingreso, reporte de existencias y directorio de proveedores
("Insumos que le compras" → `/inventario?proveedor=<id>`).

El seed asigna el predeterminado a los insumos demo (cuatro quedan sin proveedor) y tres
preferencias por institución; solo completa lo que está vacío, de modo que también sirve sobre una
base demo ya sembrada y no pisa lo definido a mano.

Pruebas: `tests/proveedor-insumo.test.ts` y `e2e/proveedor-insumo.spec.ts`.

Límites conocidos: (1) no hay historial de proveedores por insumo más allá de la auditoría; (2) el
filtro del inventario ofrece solo proveedores activos; (3) en "Toda la red" el inventario del
administrador de la red muestra y filtra por el predeterminado de la red, no por las preferencias
de cada institución (las ve en la ficha); (4) en los CSV, un teléfono que empieza con "+" lleva el
apóstrofo de la protección contra fórmulas (`neutralizarFormula`).
