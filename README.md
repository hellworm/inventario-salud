# RedInsumos

**Inventario en red de insumos médicos para centros de salud en Chile.**

RedInsumos permite a centros de diálisis, consultorios y clínicas saber, en todo momento, **qué
insumos tienen, dónde están, cuándo vencen y quién los movió**. Funciona en el navegador (computador,
tablet o teléfono) y conecta a todos los centros de una misma red. La red puede reunir a **varias
instituciones**: cada una ve y administra solo lo suyo, y el operador de la plataforma ve el
conjunto.

![Panel del administrador de la red: indicadores, la red por institución y el semáforo de vencimientos](docs/capturas/02-panel-administrador.png)

## Qué hace

- **Stock por lote y ubicación.** Cada insumo se controla por número de lote, fecha de vencimiento
  y lugar físico (bodega, sala, refrigerador) dentro de cada centro.
- **Semáforo de vencimientos.** Cada lote es **rojo** (vence en menos de 3 meses), **amarillo** (de
  3 a 6 meses) o **verde** (6 meses o más); los vencidos van aparte. La pantalla principal muestra
  cuántos insumos y lotes hay de cada color y la lista de productos en rojo, todo clicable. Al
  retirar, el sistema usa primero lo que vence antes (FEFO) y nunca entrega lotes vencidos.
- **Escáner con la cámara del celular.** Un botón «Escanear» en la pantalla principal lee el código
  de barras o el DataMatrix del envase y abre el ingreso con el insumo —y, si el código es GS1, el
  lote y el vencimiento— ya completos. También acepta el código escrito o un lector USB/Bluetooth.
- **Proveedores a mano.** En la pantalla principal, cada proveedor tiene su botón «Ir a comprar»
  (abre su sitio web) y despliega teléfono, correo y contacto.
- **Alertas y lista de reposición.** Insumos sin stock, bajo el mínimo, vencidos, en rojo y en
  amarillo, con una lista de compra imprimible o exportable.
- **Trazabilidad completa.** Cada ingreso, retiro, traslado, ajuste y merma queda registrado con
  usuario, fecha y motivo. El historial no se puede modificar ni borrar.
- **Menos errores al registrar.** Confirmación antes de un ajuste, una merma o un retiro grande;
  desde cada alerta se abre el formulario ya prellenado; un doble clic no duplica el movimiento.
- **Permisos por rol, por institución y por centro.** Cada persona ve y hace solo lo que le
  corresponde; una institución nunca ve datos de otra.
- **Reportes para Excel.** Existencias, movimientos, consumo y cobertura, vencimientos y mermas.
- **Pensado para Chile.** RUT, regiones y comunas, pesos chilenos, hora de Santiago y textos en
  español de Chile.

| Inventario | Registrar un retiro |
|---|---|
| ![Inventario con el semáforo de vencimiento](docs/capturas/03-inventario.png) | ![Retiro](docs/capturas/06-retiro.png) |

| Alertas (pestaña Rojo) | Administración de instituciones |
|---|---|
| ![Alertas](docs/capturas/08-alertas.png) | ![Instituciones](docs/capturas/11-instituciones.png) |

| En el teléfono | Escáner |
|---|---|
| <img src="docs/capturas/13-panel-movil.png" alt="Panel en el teléfono, con el botón Escanear" width="260"> | <img src="docs/capturas/14-escaner-movil.png" alt="Escanear para ingresar en el teléfono" width="260"> |

## Roles

| Rol | Para quién | Qué puede hacer |
|---|---|---|
| **Administrador de la red** | Operador de la plataforma | Ve y gestiona toda la red: crea instituciones y a sus administradores, administra el catálogo compartido (incluido asociar códigos de barras a insumos existentes) y cualquier centro o usuario; ve el resumen de la red por institución con su semáforo de vencimientos. |
| **Administrador de institución** | Encargado de una institución | Todo dentro de **su institución**: opera todos sus centros, registra todo tipo de movimientos (también escaneando), administra sus centros, ubicaciones y usuarios, los proveedores y los mínimos de stock; consulta reportes y auditoría de su institución. Crea insumos nuevos, pero no modifica los existentes (son de toda la red). |
| **Bodeguero** | Quien recibe y entrega insumos | Registra ingresos (también escaneando) y retiros en sus centros; consulta inventario, alertas, historial y proveedores. |
| **Visitante** | Quien solo necesita consultar | Consulta inventario, alertas y proveedores de sus centros. No modifica nada. |

La guía de uso por rol está en [`docs/MANUAL-USUARIO.md`](docs/MANUAL-USUARIO.md).

## Documentación

| Documento | Para qué sirve |
|---|---|
| [`docs/MANUAL-USUARIO.md`](docs/MANUAL-USUARIO.md) | Cómo usar el sistema, por rol, en lenguaje simple. |
| [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md) | Cómo instalarlo en producción (servidor con Docker o plataforma gestionada), HTTPS, primer administrador, actualización y checklist de salida. |
| [`docs/OPERACION.md`](docs/OPERACION.md) | Tareas rutinarias (usuarios, respaldos, auditoría) y solución de problemas. |
| [`docs/PRIVACIDAD.md`](docs/PRIVACIDAD.md) | Qué datos personales guarda el sistema y consideraciones de la normativa chilena. |
| [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) | Para desarrolladores: estructura, patrones, servicios, permisos y UI. |

---

## Puesta en marcha en desarrollo

### Requisitos

- **Node.js 22** o superior (`node -v`).
- **PostgreSQL 16** en ejecución, con un usuario que pueda crear bases de datos.
- Git.

### Paso a paso

```bash
# 1. Obtener el código e instalar dependencias
git clone <url-del-repositorio> redinsumos
cd redinsumos
npm install

# 2. Crear el archivo de configuración
cp .env.example .env
#    Abre .env y ajusta DATABASE_URL si tu usuario, clave o base son distintos.

# 3. Crear las bases de datos (la de desarrollo y la de pruebas)
createdb medired
createdb medired_test

# 4. Crear las tablas
npm run db:migrate

# 5. Cargar datos de demostración (tarda unos 40 segundos)
npm run db:seed

# 6. Iniciar
npm run dev
```

Abre <http://localhost:3000> e ingresa con una de las cuentas de demostración.

> Si al iniciar aparece **"Configuración inválida"**, el mensaje indica exactamente qué variable
> falta o está mal en `.env`.

### Cuentas de demostración

Las crea `npm run db:seed` junto con 2 instituciones, 3 centros, 52 insumos y unos 60 días de
historial. Instituciones: **Centros de Diálisis Andes SpA** (Centro de Diálisis Ñuñoa y Centro de
Diálisis Concepción) y **Corporación Municipal de Salud Cerro Alegre** (Consultorio Cerro Alegre).

| Rol | Correo electrónico | Contraseña | Institución · centros |
|---|---|---|---|
| Administrador de la red | `admin@redinsumos.cl` | `Admin.Demo.2026` | Toda la red |
| Administrador de institución | `admin.andes@redinsumos.cl` | `AdminAndes.Demo.2026` | Andes · todos sus centros |
| Administrador de institución | `admin.cerroalegre@redinsumos.cl` | `AdminCerro.Demo.2026` | Cerro Alegre · todos sus centros |
| Bodeguero | `bodega@redinsumos.cl` | `Bodega.Demo.2026` | Centro de Diálisis Ñuñoa |
| Visitante | `visita@redinsumos.cl` | `Visita.Demo.2026` | Centro de Diálisis Ñuñoa |
| Bodeguero | `bodega.valparaiso@redinsumos.cl` | `Bodega.Valpo.2026` | Consultorio Cerro Alegre |
| Bodeguero | `bodega.concepcion@redinsumos.cl` | `Bodega.Conce.2026` | Centro de Diálisis Concepción |
| Visitante | `nuevo@redinsumos.cl` | `Temporal.2026` (pide cambiarla) | Ñuñoa y Concepción (Andes) |

> **Los datos de demostración son solo para desarrollo y capacitación.** Sus contraseñas son
> públicas. En producción el seed se niega a ejecutarse y el primer administrador de la red se crea
> con `npm run admin:crear` (ver [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md)).

## Producción en tres pasos

```bash
cp .env.example .env          # completa POSTGRES_PASSWORD (y DOMINIO para HTTPS)
docker compose up -d          # construye, migra la base y levanta todo
docker compose run --rm mantenimiento npm run admin:crear -- --email ana@miclinica.cl --nombre "Ana Pérez"
```

Incluye PostgreSQL 16 con volumen persistente, migraciones automáticas, respaldo diario, limpieza de
sesiones y, opcionalmente, HTTPS automático. La guía completa, con el checklist de salida a
producción, está en [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en <http://localhost:3000>. |
| `npm run build` | Compila para producción (salida autocontenida en `.next/standalone`). |
| `npm start` | Inicia la versión compilada: copia los estáticos y `public/` junto al servidor y lo arranca (`npm start -- -p 3200` para otro puerto). No uses `next start`: no es compatible con esta salida. |
| `npm run typecheck` | Verifica los tipos de TypeScript. |
| `npm run lint` | Revisa el estilo y errores comunes del código. |
| `npm test` | Ejecuta las pruebas de servicios y utilidades (usa la base `DATABASE_URL_TEST`). |
| `npm run test:e2e` | Recorre la aplicación compilada en un navegador (usa la base `medired_e2e`; ver más abajo). |
| `npm run db:migrate` | Desarrollo: crea y aplica migraciones. |
| `npm run db:deploy` | Producción: aplica las migraciones pendientes. |
| `npm run db:seed` | Carga datos de **demostración** (bloqueado en producción). |
| `npm run db:studio` | Explorador visual de la base (Prisma Studio). |
| `npm run admin:crear -- --email …` | Crea el primer administrador de la red (o recupera su acceso con `--restablecer`). |
| `npm run sesiones:limpiar` | Borra las sesiones vencidas y los contadores vencidos del limitador de intentos. |
| `npm run respaldo` | Respaldo comprimido de la base, con rotación. |
| `npm run restaurar -- <archivo>` | Restaura un respaldo (pide confirmación). |

`npm run db:reset` borra **toda** la base y la vuelve a crear: es solo para desarrollo y debe
ejecutarlo una persona, a conciencia.

## Estructura del proyecto

```
prisma/              Modelo de datos, migraciones y datos de demostración (seed)
scripts/             Operación: iniciar el build, crear administrador, limpiar sesiones, respaldo y restauración
src/
  app/               Pantallas (login, panel, inventario, movimientos, alertas, reportes, ayuda, admin)
    api/salud/       Endpoint de salud para monitoreo
  acciones/          Acciones del servidor que invocan los formularios
  components/        Componentes de interfaz
  lib/               Reglas compartidas: permisos, fechas, formato, RUT, validaciones
  server/            Lógica de servidor: servicios, autenticación, auditoría, configuración
  proxy.ts           Protección de rutas (redirige a /login sin sesión) y política de seguridad de contenido
tests/               Pruebas automáticas de servicios y utilidades (vitest)
e2e/                 Pruebas de punta a punta en navegador (Playwright)
public/              Manifiesto e íconos de la aplicación instalable
docs/                Documentación y capturas
Dockerfile, docker-compose.yml, Caddyfile     Contenedor y despliegue
.github/workflows/ci.yml                      Integración continua
```

Tecnología: Next.js 16, React 19, TypeScript, Prisma 6 y PostgreSQL 16. El detalle técnico está en
[`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

## Pruebas

```bash
createdb medired_test     # solo la primera vez
npm test
```

Las pruebas usan una base aparte (`DATABASE_URL_TEST`, cuyo nombre debe terminar en `_test`), la
migran y la limpian solas; nunca tocan la base de desarrollo. Cubren reglas de inventario (FEFO,
vencimientos, concurrencia), permisos, autenticación, administración, reportes, configuración y
las utilidades de formato, validación y lectura de parámetros.

Antes de entregar un cambio:

```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run test:e2e          # si tocaste pantallas o flujos (necesita el build y la base medired_e2e)
```

El flujo de integración continua (`.github/workflows/ci.yml`) ejecuta lo mismo en cada cambio y
además construye la imagen Docker.

## Pruebas e2e (Playwright)

La suite de `e2e/` recorre la aplicación **compilada** en Chromium: escritorio (1440 px), los flujos
principales marcados `@movil` también a 390 px, y los marcados `@tablet` a 1024 × 768 con pantalla
táctil. Usa **su propia base** (`medired_e2e`): crea insumos, usuarios y proveedores nuevos en cada
ejecución, así que nunca debe apuntar a la base de demostración.

```bash
# Una sola vez, o para partir de cero (dropdb medired_e2e antes de createdb):
createdb medired_e2e
export DATABASE_URL="postgresql://medired:medired_dev@localhost:5432/medired_e2e?schema=public"
npx prisma migrate deploy && npx prisma db seed
unset DATABASE_URL

npm run build             # la suite prueba el build; vuelve a compilar si cambiaste el código
npm run test:e2e          # todo; agrega p. ej. `retiros`, `--project=movil` o `-g "FEFO"`
```

- `e2e/escaner-camara.spec.ts` prueba el escáner con la **cámara falsa de Chromium**: genera un
  video con un DataMatrix GS1 (`e2e/soporte/camara-falsa.ts`, con `bwip-js`) y comprueba que el
  lector lo decodifica y abre el ingreso prellenado. El resto de los flujos de escaneo
  (`e2e/escaner.spec.ts`) usa la entrada manual del código.

- La suite levanta el servidor con `node scripts/iniciar.mjs -p 3200` (lo mismo que `npm start`) y
  lo detiene al terminar. Si ya hay un servidor en el puerto 3200 lo reutiliza: asegúrate de que
  sea el build actual. Tras una actualización con migraciones nuevas, aplícalas también a
  `medired_e2e` (`prisma migrate deploy`).
- Variables: `E2E_PORT`, `E2E_DATABASE_URL` (base del servidor que arranca la suite),
  `E2E_BASE_URL` (usar un servidor ya levantado), `E2E_WORKERS`, `E2E_CHROMIUM` (ruta a un Chromium
  ya instalado).
- `@playwright/test` debe coincidir con el navegador instalado (`npx playwright install chromium`
  si no hay uno).
- Cada cuenta del seed (administrador de la red, los dos administradores de institución,
  bodegueros y visitante) inicia sesión una vez (`e2e/sesiones.setup.ts`) y los tests reutilizan
  esa sesión. `e2e/instituciones.spec.ts` cubre el aislamiento entre instituciones (menú, URL
  directa con ids ajenos, selector de centro, exportación CSV y Server Actions manipuladas), el
  resumen de la red por institución y el alta de una institución con su primer administrador.
  `e2e/roles-semaforo-escaner.spec.ts` cubre lo que cruza ambas funciones: el administrador de
  institución en el escáner (crea el insumo con el código, no lo asocia a uno existente), el
  visitante viendo proveedores y el semáforo por institución del administrador de la red.
- **Límite de intentos de ingreso.** El servidor de la suite corre con `TRUST_PROXY=1` (lo fija
  `playwright.config.ts`; es solo de ese servidor de pruebas) y cada test envía su propia
  `X-Forwarded-For` con una IP distinta (`ipDelTest`, en `e2e/soporte/fixtures.ts`), como personas
  en redes distintas. Así se prueba el modelo real —bloqueo por cuenta + IP sin dejar fuera al
  titular desde otra red, límite por IP y el modo "sin IP"— y los intentos fallidos de un test no
  consumen el cupo de los demás. La protección no se desactiva en ningún caso.
- `bugConocido("B-xx: …")` (`e2e/soporte/fixtures.ts`) marca un test que documenta un bug real
  pendiente: se espera que falle y no rompe la suite. Hoy **ningún test lo usa**; queda como
  herramienta para el próximo informe de QA (`E2E_EXIGIR_BUGS=1` los ejecuta como tests normales).

## Estado y pendientes conocidos

La aplicación está completa para el alcance descrito arriba y pasa todas sus verificaciones
(tipos, lint, pruebas de servicios, build y suite e2e). Lo que **no** hace o queda pendiente:

- **Recuperación de contraseña por correo:** no existe; la restablece un administrador (contraseña
  temporal válida por 72 horas).
- **Sin conexión:** se puede instalar en la tablet o el teléfono, pero necesita internet para
  funcionar; no guarda movimientos para enviarlos después.
- **Sesión vencida a mitad de un formulario:** el sistema avisa y devuelve a la misma pantalla tras
  ingresar, pero lo escrito y no registrado se pierde.
- **Lotes duplicados por espacios:** desde esta versión el número de lote se normaliza. Si antes se
  registraron dos variantes del mismo lote (por ejemplo `L-01  A` y `L-01 A`), siguen separadas:
  hay que unificarlas a mano con un traslado o ajuste.
- **Bloqueo de cuentas sin proxy declarado:** sin `TRUST_PROXY` la aplicación no conoce la IP de
  cada persona y el bloqueo por intentos fallidos es por cuenta (un tercero podría bloquearla 15
  minutos). En producción con Docker Compose ya viene configurado.
- **Asociar códigos de barras a insumos existentes** es solo del administrador de la red (el
  catálogo es compartido). Un administrador de institución puede crear un insumo nuevo con el
  código escaneado, pero si el insumo ya existe debe pedirle la asociación al administrador de la
  red: no hay un flujo de "solicitud" dentro de la aplicación.
- **Proveedores compartidos:** el directorio y sus datos de contacto son comunes a toda la red;
  cualquier administrador (de la red o de una institución) puede editarlos, y el cambio lo ven
  todas las instituciones (queda en la auditoría). Solo el orden "más usados primero" es propio
  de cada institución.
- **Detrás de un proxy o túnel que cambia el dominio** (por ejemplo una vista previa) el inicio de
  sesión falla si el proxy no reenvía el host público; se resuelve en el proxy o compilando con
  `SERVER_ACTIONS_ORIGENES` (ver [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md) §2.3). La aplicación
  no se puede incrustar en un `<iframe>`.
- **Escáner:** probado con la cámara simulada de Chromium y con imágenes generadas (EAN-13,
  Code 128, DataMatrix GS1 y QR); conviene validarlo con los teléfonos reales del centro (iPhone/
  Safari y Android/Chrome) y con los envases que más se reciben antes de darlo por bueno. Requiere
  HTTPS. La linterna depende del teléfono (en iPhone el navegador no siempre la ofrece).
- **Códigos GS1 sin separador:** si un lector USB elimina el separador entre campos, el lote puede
  llegar pegado a lo que sigue; por eso el formulario siempre muestra lo leído para revisarlo.
- **Semáforo fijo:** los límites (3 y 6 meses) son los mismos para todos los insumos; no se
  configuran por insumo ni por centro.
- **Costos:** el costo unitario es opcional y los reportes valorizan con el costo promedio de los
  ingresos que lo traen; no es un sistema contable.
- **Modo oscuro** y listado oficial completo de comunas: no incluidos.
- **Imagen Docker:** el `Dockerfile` se mantiene al día con el código, pero conviene construirla y
  probarla en el entorno de destino antes de salir a producción (ver el checklist de
  [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md)).

El detalle técnico de las deudas está en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) §13.

## Alcance

RedInsumos gestiona **insumos**, no pacientes: no almacena datos clínicos ni de pacientes. Es una
herramienta de apoyo a la gestión de inventario y no reemplaza las obligaciones regulatorias de cada
establecimiento. Ver [`docs/PRIVACIDAD.md`](docs/PRIVACIDAD.md).
