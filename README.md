# RedInsumos

Inventario en red de insumos médicos para centros de salud en Chile (diálisis, consultorios,
clínicas): stock por lote y ubicación, vencimientos, alertas, trazabilidad y permisos por rol y
centro.

## Puesta en marcha

Requisitos: Node 22+, PostgreSQL 16.

```bash
cp .env.example .env        # ajusta DATABASE_URL si es necesario
npm install
npm run db:migrate          # crea las tablas
npm run db:seed             # datos de demostración (~40 s)
npm run dev                 # http://localhost:3000
```

Cuentas de demostración: `admin@redinsumos.cl` / `Admin.Demo.2026`,
`bodega@redinsumos.cl` / `Bodega.Demo.2026`, `visita@redinsumos.cl` / `Visita.Demo.2026`.
Son solo para desarrollo: no ejecutes el seed en producción.

Los tests usan una base aparte (`DATABASE_URL_TEST`, por defecto `medired_test`), que debe existir:
`createdb medired_test`.

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

- [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md): arquitectura, patrones, servicios, permisos, UI kit y comandos.
