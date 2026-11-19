-- Nivel Institución y dos niveles de administración.
--
--  * Tabla `instituciones`. Cada centro pertenece a una institución.
--  * Rol nuevo ADMIN_RED (administrador de la red). ADMIN pasa a ser
--    "administrador de institución".
--  * `usuarios.institucionId`: obligatorio salvo para ADMIN_RED (CHECK).
--  * `registros_auditoria.institucionId`: alcance del registro.
--
-- Migración de datos de una base ya desplegada (una sola organización):
--  * se crea la institución "Institución principal" (id fijo
--    `institucion_inicial`) y se le asignan todos los centros y todos los
--    usuarios que no son administradores;
--  * los ADMIN existentes eran el operador: pasan a ADMIN_RED (sin institución);
--  * la auditoría histórica de centros, movimientos y usuarios de esa
--    institución se le atribuye; el resto queda como evento de red.
-- En una base vacía no se crea ninguna institución.

-- CreateTable
CREATE TABLE "instituciones" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rut" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instituciones_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "instituciones_nombre_key" ON "instituciones"("nombre");

-- Institución por defecto: solo si la base ya tiene datos.
INSERT INTO "instituciones" ("id", "nombre", "actualizadoEn")
SELECT 'institucion_inicial', 'Institución principal', CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "centros") OR EXISTS (SELECT 1 FROM "usuarios" WHERE "rol" <> 'ADMIN');

-- Centros: columna obligatoria, con los existentes en la institución por defecto.
ALTER TABLE "centros" ADD COLUMN "institucionId" TEXT;
UPDATE "centros" SET "institucionId" = 'institucion_inicial';
ALTER TABLE "centros" ALTER COLUMN "institucionId" SET NOT NULL;
CREATE INDEX "centros_institucionId_idx" ON "centros"("institucionId");
ALTER TABLE "centros" ADD CONSTRAINT "centros_institucionId_fkey"
  FOREIGN KEY ("institucionId") REFERENCES "instituciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rol: se recrea el tipo (un valor agregado con ALTER TYPE … ADD VALUE no se
-- puede usar en la misma transacción). Los ADMIN existentes pasan a ADMIN_RED.
CREATE TYPE "Rol_nuevo" AS ENUM ('ADMIN_RED', 'ADMIN', 'BODEGUERO', 'VISITANTE');
ALTER TABLE "usuarios" ALTER COLUMN "rol" TYPE "Rol_nuevo"
  USING (CASE WHEN "rol"::text = 'ADMIN' THEN 'ADMIN_RED' ELSE "rol"::text END)::"Rol_nuevo";
DROP TYPE "Rol";
ALTER TYPE "Rol_nuevo" RENAME TO "Rol";

-- Usuarios: institución obligatoria salvo para ADMIN_RED.
ALTER TABLE "usuarios" ADD COLUMN "institucionId" TEXT;
UPDATE "usuarios" SET "institucionId" = 'institucion_inicial' WHERE "rol" <> 'ADMIN_RED';
-- Un administrador de la red ve todo: sus asignaciones centro a centro sobran.
DELETE FROM "usuarios_centros" uc USING "usuarios" u WHERE u."id" = uc."usuarioId" AND u."rol" = 'ADMIN_RED';
CREATE INDEX "usuarios_institucionId_idx" ON "usuarios"("institucionId");
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_institucionId_fkey"
  FOREIGN KEY ("institucionId") REFERENCES "instituciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_institucion_segun_rol"
  CHECK (("rol" = 'ADMIN_RED') = ("institucionId" IS NULL));

-- Auditoría: alcance por institución.
ALTER TABLE "registros_auditoria" ADD COLUMN "institucionId" TEXT;

-- La bitácora es inmutable (trigger contra UPDATE). SOLO para este relleno
-- inicial se deshabilita el trigger de fila, dentro de la transacción de la
-- migración, y se vuelve a habilitar de inmediato. El contenido de los
-- registros no cambia: solo se completa la columna nueva.
ALTER TABLE "registros_auditoria" DISABLE TRIGGER "registros_auditoria_sin_update_ni_delete";
UPDATE "registros_auditoria" a
SET "institucionId" = 'institucion_inicial'
WHERE EXISTS (SELECT 1 FROM "instituciones" WHERE "id" = 'institucion_inicial')
  AND (
    -- lo que ocurre dentro de un centro
    a."entidad" IN ('Movimiento', 'Centro', 'Ubicacion', 'Lote')
    -- parámetros de stock por centro (el resto de "Insumo" es catálogo de la red)
    OR a."accion" = 'PARAMETROS_STOCK_ACTUALIZADOS'
    -- acciones de los usuarios de la institución (ingresos, exportaciones, sesiones…)
    OR EXISTS (SELECT 1 FROM "usuarios" u WHERE u."id" = a."usuarioId" AND u."institucionId" IS NOT NULL)
    -- gestión de los usuarios de la institución
    OR (a."entidad" = 'Usuario'
        AND EXISTS (SELECT 1 FROM "usuarios" u WHERE u."id" = a."entidadId" AND u."institucionId" IS NOT NULL))
  );
ALTER TABLE "registros_auditoria" ENABLE TRIGGER "registros_auditoria_sin_update_ni_delete";

CREATE INDEX "registros_auditoria_institucionId_creadoEn_idx"
  ON "registros_auditoria"("institucionId", "creadoEn" DESC);
ALTER TABLE "registros_auditoria" ADD CONSTRAINT "registros_auditoria_institucionId_fkey"
  FOREIGN KEY ("institucionId") REFERENCES "instituciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
