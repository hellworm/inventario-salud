# RedInsumos

Inventario en red de insumos médicos para Chile (Next.js 16, React 19, Prisma 6, PostgreSQL).

**Antes de escribir código lee `docs/ARQUITECTURA.md`**: estructura, patrones canónicos de página y
Server Action, firmas de los servicios, matriz de permisos, catálogo del UI kit y convenciones.

Reglas rápidas:

- Next 16 cambió APIs (`proxy.ts`, `params`/`searchParams`/`cookies()` asíncronos, tipos
  `PageProps<"/ruta">`). Ante la duda: `node_modules/next/dist/docs/`.
- Las páginas y acciones no usan Prisma directo: todo pasa por `src/server/servicios`.
- Autorización siempre en el servidor: `contextoPagina(permiso)` en páginas, `accionSegura` en
  acciones y `verificarPermiso(actor, permiso, centroId)` en servicios. Permisos en
  `src/lib/permisos.ts`.
- UI: componentes de `@/components/ui`, textos en español de Chile, fechas con `@/lib/fechas`
  (America/Santiago) y números con `@/lib/formato`.
- Prisma está fijado en 6.19.3: no lo actualices.
- Antes de terminar: `npm run typecheck && npm run lint && npm test && npm run build`.
- No ejecutes `npm run db:reset` (destructivo): pídelo a una persona.
