-- Proveedor por insumo, en dos niveles:
--  * "insumos"."proveedorId": proveedor predeterminado de la RED (opcional).
--  * "proveedores_insumo_institucion": proveedor preferido de UNA institución
--    para un insumo; sobrescribe el de la red solo para ella.
-- Solo agrega estructura: no modifica ni rellena datos existentes.

-- AlterTable
ALTER TABLE "insumos" ADD COLUMN     "proveedorId" TEXT;

-- CreateTable
CREATE TABLE "proveedores_insumo_institucion" (
    "id" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "institucionId" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedores_insumo_institucion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proveedores_insumo_institucion_institucionId_idx" ON "proveedores_insumo_institucion"("institucionId");

-- CreateIndex
CREATE INDEX "proveedores_insumo_institucion_proveedorId_idx" ON "proveedores_insumo_institucion"("proveedorId");

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_insumo_institucion_insumoId_institucionId_key" ON "proveedores_insumo_institucion"("insumoId", "institucionId");

-- CreateIndex
CREATE INDEX "insumos_proveedorId_idx" ON "insumos"("proveedorId");

-- AddForeignKey
ALTER TABLE "insumos" ADD CONSTRAINT "insumos_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedores_insumo_institucion" ADD CONSTRAINT "proveedores_insumo_institucion_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "insumos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedores_insumo_institucion" ADD CONSTRAINT "proveedores_insumo_institucion_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "instituciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedores_insumo_institucion" ADD CONSTRAINT "proveedores_insumo_institucion_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

