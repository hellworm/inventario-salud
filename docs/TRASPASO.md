# RedInsumos — documento de traspaso

Este documento resume todo lo necesario para retomar el proyecto en otra cuenta o con otra
persona. Está escrito para que una sesión nueva de Claude (o un desarrollador) pueda continuar
sin el historial de la conversación original.

Fecha del traspaso: 20-11-2026.

---

## 1. Qué es

**RedInsumos** es una aplicación web de inventario en red de insumos médicos para Chile.
Parte orientada a centros pequeños (diálisis, consultorios) y está pensada para crecer a
clínicas y hospitales.

- Repositorio: `https://github.com/hellworm/inventario-salud`
- Rama principal: `main` (todo el producto está aquí).
- Rama `legacy-django`: el prototipo anterior en Django, conservado solo como respaldo.
  No se usa.
- Nombre "RedInsumos": provisorio; lo eligió Claude al inicio y no ha sido confirmado como
  marca definitiva.

## 2. Tecnología

| Pieza | Elección |
|---|---|
| Aplicación | Next.js 16 (App Router), React 19, TypeScript estricto |
| Estilos | Tailwind CSS 4, componentes propios en `src/components/ui` |
| Base de datos | PostgreSQL 16 |
| Acceso a datos | Prisma **6.19.3 fijado** (no actualizar a 7 u 8) |
| Contraseñas | argon2id |
| Pruebas | vitest (servicios) y Playwright (punta a punta) |
| Escáner | `BarcodeDetector` nativo y `zxing-wasm` de respaldo; parser GS1 propio |

## 3. Qué hace hoy (todo publicado en `main`)

**Estructura**: Red → Instituciones → Centros → Ubicaciones → Lotes → Existencias, con un
historial de movimientos inmutable y un registro de auditoría también inmutable.

**Roles** (definidos por el dueño del producto; no cambiarlos sin su visto bueno):

| Rol | Qué puede hacer |
|---|---|
| Administrador de la red (`ADMIN_RED`) | Todo, en todas las instituciones. Es el operador de la plataforma. |
| Administrador de institución (`ADMIN`) | Todo dentro de su institución: centros, usuarios, stock, reportes, auditoría. No ve otras instituciones. |
| Bodeguero (`BODEGUERO`) | Solo ingresar y retirar insumos en sus centros asignados. |
| Visitante (`VISITANTE`) | Solo lectura: inventario, alertas y proveedores de sus centros. |

**Funciones**:

- Inventario por insumo, lote y ubicación, con búsqueda y filtros (categoría, ubicación,
  proveedor, estado de stock, semáforo).
- Movimientos: ingreso, retiro (consume primero lo que vence antes), traslado, ajuste y merma,
  con confirmación en las operaciones delicadas y protección contra doble envío.
- **Semáforo de vencimiento** (regla fija pedida por el dueño): rojo si vence en menos de
  3 meses, amarillo entre 3 y 6, verde desde 6. "Vencido" es un estado aparte. Cada color lleva
  además forma, ícono y texto.
- Pantalla principal: indicadores, semáforo con productos en rojo pinchables, lista de lo que
  requiere atención, proveedores con "Ir a comprar" y datos desplegables, y resumen por
  institución para el administrador de la red.
- **Proveedor por insumo**: predeterminado de la red, y cada institución puede fijar el suyo.
  Se ve en inventario, ficha, alertas y lista de reposición; viene preseleccionado al ingresar.
- **Escáner con la cámara del celular** para ingresar productos; si el código es GS1,
  pre-rellena lote y vencimiento. Siempre hay opción de escribir el código.
- Alertas (sin stock, bajo mínimo, vencidos, rojo, amarillo) y lista de reposición imprimible,
  agrupable por proveedor.
- Reportes con exportación CSV: existencias, movimientos, consumo y cobertura, vencimientos y
  mermas.
- Administración: instituciones, centros y ubicaciones, usuarios, catálogo de insumos y
  categorías, mínimos y máximos por centro, proveedores, auditoría.
- **Tema claro, oscuro o según el dispositivo**, elegible en el menú de usuario.
- Página de ayuda por rol dentro de la aplicación.

## 4. Decisiones tomadas y por qué

Estas decisiones las tomó el dueño o las aceptó implícitamente; conviene respetarlas.

- **Una red con varias instituciones**, no multi-empresa con registro autónomo. El operador
  ve "el complejo total".
- **Catálogo de insumos compartido** por toda la red. El administrador de institución puede
  crear insumos y categorías, pero solo el de la red edita o desactiva los existentes.
- **Proveedores compartidos** por la red, editables por ambos niveles de administrador, con
  auditoría.
- **Los traslados no cruzan instituciones**, ni siquiera hechos por el administrador de la red.
- **Nadie cambia de institución** (ni usuarios ni centros).
- **Asociar un código de barras a un insumo existente** es solo del administrador de la red.
- **El bodeguero no da de baja vencidos**: el panel le indica separarlos y avisar a su
  administrador.
- **Semáforo con límites fijos** de 3 y 6 meses, iguales para todos los insumos.

Decisiones que el dueño **no ha confirmado** y podrían reabrirse:

- Si el bodeguero debería poder dar de baja lo vencido.
- Si el visitante debería ver el historial de movimientos y los reportes.
- Si el operador debería poder trasladar stock entre instituciones.
- Nombre y marca definitivos del producto.

## 5. Estado de calidad al momento del traspaso

Medido sobre el commit `d8e5c09` de `main`:

| Verificación | Resultado |
|---|---|
| `npm run typecheck` | Sin errores |
| `npm run lint` | Sin errores |
| `npm test` | 454 pruebas, todas pasan |
| `npm run build` | Correcto |
| `npm run test:e2e` | 187 de 188 en la corrida completa |

La prueba e2e que falló es `e2e/robustez-url.spec.ts:36` (182 navegaciones seguidas con tope
de 180 s). Pasa sola en menos de un minuto y se cae únicamente con la máquina saturada. No es
un defecto de la aplicación, pero la prueba es frágil y conviene reforzarla (por ejemplo,
dividirla o subirle el tope).

El producto pasó por una auditoría de seguridad, una revisión de UX y accesibilidad, y una
ronda de QA, todas con sus correcciones aplicadas. Ninguna encontró hallazgos críticos.

## 6. Pendientes reales

**Antes de salir a producción**:

1. **Imagen Docker sin construir ni probar.** El `Dockerfile` y `docker-compose.yml` están
   revisados solo por lectura, porque el entorno de desarrollo no tenía Docker. Hay que
   construir la imagen y levantar el stack una vez.
2. **Escáner sin probar con cámara real.** Solo se probó con una cámara simulada y códigos
   generados. Falta validarlo en iPhone y Android con envases reales. Requiere HTTPS.
3. **Sin alojamiento.** La aplicación no está desplegada en ningún servidor; solo corre en
   local. Las opciones están en `docs/DESPLIEGUE.md`.
4. **Copia de respaldos fuera del servidor**: documentada, no automatizada.

**Limitaciones conocidas del producto**:

- No hay recuperación de contraseña por correo; la restablece un administrador con una
  contraseña temporal que caduca a las 72 horas.
- No funciona sin conexión.
- Si la sesión vence a mitad de un formulario, se vuelve a la misma pantalla tras ingresar,
  pero lo escrito se pierde.
- Correo de usuario, nombre de centro, código de insumo y RUT de proveedor son únicos en toda
  la red: el mensaje "ya existe" revela que existe en otra institución.
- No hay salvaguarda de "último administrador de una institución".
- No hay un flujo dentro de la aplicación para que una institución pida asociar un código de
  barras.
- En tema oscuro, el borde de campos y botones secundarios queda algo bajo el contraste
  recomendado.
- `npm audit` muestra 3 avisos de una dependencia de la herramienta de Prisma, que solo se usa
  al construir y migrar. **No ejecutar `npm audit fix --force`**: sube Prisma de versión mayor
  y rompe el proyecto.
- Las capturas de `docs/capturas` son anteriores al tema oscuro y al proveedor por insumo
  (salvo `15-panel-oscuro.png`).

La lista completa está en la sección "Estado y pendientes conocidos" del `README.md` y en
`docs/ARQUITECTURA.md` §13.

## 7. Cómo levantarlo en un computador

Requisitos: Node.js 22 o superior, PostgreSQL 16 y Git. Probado por el dueño en Windows.

```bash
git clone https://github.com/hellworm/inventario-salud redinsumos
cd redinsumos
npm install
```

Crear `.env` a partir de `.env.example` y ajustar `DATABASE_URL` con el usuario y la clave de
PostgreSQL. En Windows, con el usuario `postgres`:

```
DATABASE_URL="postgresql://postgres:TU_CLAVE@localhost:5432/medired?schema=public"
```

```bash
npm run db:deploy
npm run db:seed
npm run dev
```

Abrir `http://localhost:3000`.

**Para actualizar una instalación existente** tras nuevos cambios en `main`:

```bash
git pull
npm install
npm run db:deploy
npm run db:seed
npm run dev
```

`db:seed` es seguro sobre una base ya sembrada: solo completa lo que falta y no regenera el
historial.

**Notas de Windows** aprendidas en la instalación del dueño:

- La carpeta del proyecto quedó en `C:\redinsumos`.
- `cd %USERPROFILE%\Documents` falló (PowerShell, o Documentos dentro de OneDrive); se usó
  `cd C:\`.
- `npm install` muestra avisos de `install-scripts` y de vulnerabilidades: son avisos, no
  errores.

## 8. Cuentas de demostración

Solo existen tras ejecutar `npm run db:seed`. Son públicas y de ejemplo: **nunca cargarlas en
producción** (el seed se niega a correr con `NODE_ENV=production`).

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador de la red | admin@redinsumos.cl | Admin.Demo.2026 |
| Administrador de institución (Andes) | admin.andes@redinsumos.cl | AdminAndes.Demo.2026 |
| Administrador de institución (Cerro Alegre) | admin.cerroalegre@redinsumos.cl | AdminCerro.Demo.2026 |
| Bodeguero (Ñuñoa) | bodega@redinsumos.cl | Bodega.Demo.2026 |
| Bodeguero (Valparaíso) | bodega.valparaiso@redinsumos.cl | Bodega.Valpo.2026 |
| Bodeguero (Concepción) | bodega.concepcion@redinsumos.cl | Bodega.Conce.2026 |
| Visitante (Ñuñoa) | visita@redinsumos.cl | Visita.Demo.2026 |
| Visitante con cambio de clave obligatorio | nuevo@redinsumos.cl | Temporal.2026 |

Instituciones de demostración: "Centros de Diálisis Andes SpA" (Centro de Diálisis Ñuñoa y
Centro de Diálisis Concepción) y "Corporación Municipal de Salud Cerro Alegre" (Consultorio
Cerro Alegre). Todos los datos son ficticios.

Cinco intentos fallidos seguidos bloquean el acceso por un rato.

## 9. Dónde está cada cosa

| Documento | Contenido |
|---|---|
| `README.md` | Portada, puesta en marcha, comandos, pruebas, pendientes |
| `CLAUDE.md` | Reglas rápidas para trabajar el código con Claude |
| `docs/ARQUITECTURA.md` | Estructura, modelo de datos, matriz de permisos, servicios, convenciones |
| `docs/DESPLIEGUE.md` | Opciones de alojamiento, HTTPS, primer administrador, respaldos, checklist |
| `docs/OPERACION.md` | Tareas rutinarias y resolución de problemas |
| `docs/MANUAL-USUARIO.md` | Guía por rol en lenguaje simple |
| `docs/PRIVACIDAD.md` | Qué datos personales guarda (no guarda datos de pacientes) |

Carpetas principales: `src/app` (páginas), `src/server/servicios` (lógica de negocio),
`src/lib/permisos.ts` (permisos), `src/components` (interfaz), `prisma` (esquema, 6
migraciones y datos de demostración), `tests` (vitest), `e2e` (Playwright), `scripts`
(arranque, primer administrador, respaldos).

## 10. Reglas para quien continúe el desarrollo

- Leer `docs/ARQUITECTURA.md` antes de escribir código.
- Las páginas y acciones no usan Prisma directo: todo pasa por `src/server/servicios`.
- La autorización se valida siempre en el servidor (rol, institución y centro), nunca solo
  ocultando botones.
- No editar migraciones existentes: crear una nueva.
- No ejecutar `npm run db:reset` ni `prisma migrate reset` sin que una persona lo autorice.
- No actualizar Prisma de versión mayor.
- Usar los componentes y colores del kit (`@/components/ui`, tokens `--ri-*`): un color fijo
  rompe el tema oscuro.
- Antes de dar algo por terminado: `npm run typecheck && npm run lint && npm test && npm run build`.
- Los cambios de permisos por rol los decide el dueño del producto.

## 11. Cómo se construyó

El desarrollo lo coordinó una sesión de Claude que repartió el trabajo entre agentes
especializados, en este orden: cimientos (esquema, autenticación, permisos, lógica de stock);
tres módulos en paralelo (inventario y movimientos, administración, panel y reportes);
revisión independiente de seguridad, UX y QA; correcciones; despliegue y documentación;
instituciones; semáforo, proveedores y escáner; tema oscuro y proveedor por insumo.

Cada entrega se fusionó en `main` solo después de pasar tipos, linter y pruebas.

## 12. Siguientes pasos sugeridos

En orden de valor para acercarse a un uso real:

1. Elegir alojamiento y desplegar con HTTPS; construir y probar la imagen Docker.
2. Probar el escáner en teléfonos reales y con envases reales.
3. Resolver las decisiones de permisos pendientes de la sección 4.
4. Recuperación de contraseña por correo.
5. Reforzar la prueba e2e frágil y regenerar las capturas de la documentación.
6. Definir nombre y marca definitivos.

## 13. Para retomar con Claude en otra cuenta

1. Conectar la cuenta de GitHub en la nueva cuenta de Claude y dar acceso al repositorio
   `hellworm/inventario-salud`.
2. Abrir una sesión sobre ese repositorio.
3. Pedirle a Claude que lea `docs/TRASPASO.md`, `CLAUDE.md` y `docs/ARQUITECTURA.md` antes de
   empezar.

Un primer mensaje útil:

> Retomo el proyecto RedInsumos. Lee docs/TRASPASO.md, CLAUDE.md y docs/ARQUITECTURA.md.
> Luego confirma que el proyecto compila y que las pruebas pasan, y dime en qué estado está
> antes de proponer cambios.
