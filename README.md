# RedInsumos

**Inventario en red de insumos médicos para centros de salud en Chile.**

RedInsumos permite a centros de diálisis, consultorios y clínicas saber, en todo momento, **qué
insumos tienen, dónde están, cuándo vencen y quién los movió**. Funciona en el navegador (computador,
tablet o teléfono) y conecta a todos los centros de una misma red.

![Panel del administrador](docs/capturas/02-panel-administrador.png)

## Qué hace

- **Stock por lote y ubicación.** Cada insumo se controla por número de lote, fecha de vencimiento
  y lugar físico (bodega, sala, refrigerador) dentro de cada centro.
- **Vencimientos bajo control.** Al retirar, el sistema usa primero lo que vence antes (FEFO) y
  nunca entrega lotes vencidos. Avisa con 90, 60 y 30 días de anticipación.
- **Alertas y lista de reposición.** Insumos sin stock, bajo el mínimo, por vencer y vencidos, con
  una lista de compra imprimible o exportable.
- **Trazabilidad completa.** Cada ingreso, retiro, traslado, ajuste y merma queda registrado con
  usuario, fecha y motivo. El historial no se puede modificar ni borrar.
- **Permisos por rol y por centro.** Cada persona ve y hace solo lo que le corresponde.
- **Reportes para Excel.** Existencias, movimientos, consumo y cobertura, vencimientos y mermas.
- **Pensado para Chile.** RUT, regiones y comunas, pesos chilenos, hora de Santiago y textos en
  español de Chile.

| Inventario | Registrar un retiro |
|---|---|
| ![Inventario](docs/capturas/03-inventario.png) | ![Retiro](docs/capturas/06-retiro.png) |

| Alertas | En el teléfono |
|---|---|
| ![Alertas](docs/capturas/08-alertas.png) | <img src="docs/capturas/13-panel-movil.png" alt="Panel en el teléfono" width="260"> |

## Roles

| Rol | Para quién | Qué puede hacer |
|---|---|---|
| **Administrador** | Encargado de la red | Ve y opera todos los centros; registra todo tipo de movimientos; administra insumos, centros, proveedores y usuarios; consulta reportes y auditoría. |
| **Bodeguero** | Quien recibe y entrega insumos | Registra ingresos y retiros en sus centros; consulta inventario, alertas e historial. |
| **Visitante** | Quien solo necesita consultar | Consulta inventario y alertas de sus centros. No modifica nada. |

La guía de uso por rol está en [`docs/MANUAL-USUARIO.md`](docs/MANUAL-USUARIO.md).

## Pruebas e2e (Playwright)

La suite de `e2e/` recorre la aplicación real en Chromium (escritorio 1440 px y, para los flujos
principales marcados `@movil`, 390 px). Usa **su propia base** (`medired_e2e`): crea insumos,
usuarios y proveedores nuevos en cada ejecución, así que nunca debe apuntar a la base de demo.

```bash
createdb medired_e2e                                  # una sola vez
export DATABASE_URL=postgresql://medired:medired_dev@localhost:5432/medired_e2e?schema=public
npx prisma migrate deploy && npx prisma db seed       # una sola vez (o para partir de cero)
npm run build                                         # la suite levanta `next start -p 3200`
unset DATABASE_URL
npm run test:e2e                                      # todo; agrega p. ej. `retiros` o `--project=movil`
```

- Si ya hay un servidor en el puerto 3200 se reutiliza. Variables: `E2E_PORT`, `E2E_DATABASE_URL`
  (base del servidor que arranca la suite), `E2E_BASE_URL` (usar un servidor ya levantado),
  `E2E_WORKERS`, `E2E_CHROMIUM` (ruta a un Chromium ya instalado).
- `@playwright/test` debe coincidir con el navegador instalado (`npx playwright install chromium`
  si no hay uno).
- Cada rol inicia sesión una vez (`e2e/sesiones.setup.ts`) y los tests reutilizan esa sesión.
- Los tests marcados con `bugConocido("B-xx: …")` documentan bugs reales pendientes: se espera que
  fallen y no rompen la suite. `E2E_EXIGIR_BUGS=1 npm run test:e2e -- -g "B-"` los ejecuta como
  tests normales para ver el fallo o comprobar un arreglo.

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

Las crea `npm run db:seed` junto con 3 centros, 52 insumos y unos 60 días de historial.

| Rol | Email | Contraseña | Centros |
|---|---|---|---|
| Administrador | `admin@redinsumos.cl` | `Admin.Demo.2026` | Toda la red |
| Bodeguero | `bodega@redinsumos.cl` | `Bodega.Demo.2026` | Centro de Diálisis Ñuñoa |
| Visitante | `visita@redinsumos.cl` | `Visita.Demo.2026` | Centro de Diálisis Ñuñoa |
| Bodeguero | `bodega.valparaiso@redinsumos.cl` | `Bodega.Valpo.2026` | Consultorio Cerro Alegre |
| Bodeguero | `bodega.concepcion@redinsumos.cl` | `Bodega.Conce.2026` | Centro de Diálisis Concepción |
| Visitante | `nuevo@redinsumos.cl` | `Temporal.2026` (pide cambiarla) | Valparaíso y Concepción |

> **Los datos de demostración son solo para desarrollo y capacitación.** Sus contraseñas son
> públicas. En producción el seed se niega a ejecutarse y el primer administrador se crea con
> `npm run admin:crear` (ver [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md)).

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
| `npm run build` / `npm run start` | Compila para producción / inicia la versión compilada. |
| `npm run typecheck` | Verifica los tipos de TypeScript. |
| `npm run lint` | Revisa el estilo y errores comunes del código. |
| `npm test` | Ejecuta las pruebas (usa la base `DATABASE_URL_TEST`). |
| `npm run db:migrate` | Desarrollo: crea y aplica migraciones. |
| `npm run db:deploy` | Producción: aplica las migraciones pendientes. |
| `npm run db:seed` | Carga datos de **demostración** (bloqueado en producción). |
| `npm run db:studio` | Explorador visual de la base (Prisma Studio). |
| `npm run admin:crear -- --email …` | Crea el primer administrador (o recupera su acceso con `--restablecer`). |
| `npm run sesiones:limpiar` | Borra las sesiones vencidas. |
| `npm run respaldo` | Respaldo comprimido de la base, con rotación. |
| `npm run restaurar -- <archivo>` | Restaura un respaldo (pide confirmación). |

`npm run db:reset` borra **toda** la base y la vuelve a crear: es solo para desarrollo y debe
ejecutarlo una persona, a conciencia.

## Estructura del proyecto

```
prisma/              Modelo de datos, migraciones y datos de demostración (seed)
scripts/             Operación: crear administrador, limpiar sesiones, respaldo y restauración
src/
  app/               Pantallas (login, panel, inventario, movimientos, alertas, reportes, admin)
    api/salud/       Endpoint de salud para monitoreo
  acciones/          Acciones del servidor que invocan los formularios
  components/        Componentes de interfaz
  lib/               Reglas compartidas: permisos, fechas, formato, RUT, validaciones
  server/            Lógica de servidor: servicios, autenticación, auditoría, configuración
  proxy.ts           Protección de rutas (redirige a /login sin sesión)
tests/               Pruebas automáticas
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
vencimientos, concurrencia), permisos, autenticación, administración, reportes y configuración.

Antes de entregar un cambio:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

El flujo de integración continua (`.github/workflows/ci.yml`) ejecuta lo mismo en cada cambio y
además construye la imagen Docker.

## Estado y alcance

RedInsumos gestiona **insumos**, no pacientes: no almacena datos clínicos ni de pacientes. Es una
herramienta de apoyo a la gestión de inventario y no reemplaza las obligaciones regulatorias de cada
establecimiento. Ver [`docs/PRIVACIDAD.md`](docs/PRIVACIDAD.md).
