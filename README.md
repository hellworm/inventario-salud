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

## Documentación

- [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md): arquitectura, patrones, servicios, permisos, UI kit y comandos.
