-- Búsquedas sin distinguir tildes (extensión "trusted": no requiere superusuario).
CREATE EXTENSION IF NOT EXISTS unaccent;

-- CreateEnum
CREATE TYPE "TipoCentro" AS ENUM ('DIALISIS', 'CONSULTORIO', 'CLINICA', 'HOSPITAL', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoUbicacion" AS ENUM ('BODEGA', 'SALA', 'REFRIGERADO', 'OTRO');

-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'BODEGUERO', 'VISITANTE');

-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('INGRESO', 'RETIRO', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'MERMA', 'TRASLADO_SALIDA', 'TRASLADO_ENTRADA');

-- CreateTable
CREATE TABLE "centros" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoCentro" NOT NULL,
    "rut" TEXT,
    "direccion" TEXT NOT NULL,
    "comuna" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "centros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ubicaciones" (
    "id" TEXT NOT NULL,
    "centroId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoUbicacion" NOT NULL DEFAULT 'BODEGA',
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ubicaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "debeCambiarPassword" BOOLEAN NOT NULL DEFAULT true,
    "ultimoAcceso" TIMESTAMP(3),
    "intentosFallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoHasta" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios_centros" (
    "usuarioId" TEXT NOT NULL,
    "centroId" TEXT NOT NULL,

    CONSTRAINT "usuarios_centros_pkey" PRIMARY KEY ("usuarioId","centroId")
);

-- CreateTable
CREATE TABLE "sesiones" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insumos" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "categoriaId" TEXT NOT NULL,
    "unidadMedida" TEXT NOT NULL,
    "presentacion" TEXT,
    "fabricante" TEXT,
    "registroSanitario" TEXT,
    "codigoBarras" TEXT,
    "requiereCadenaFrio" BOOLEAN NOT NULL DEFAULT false,
    "controlaVencimiento" BOOLEAN NOT NULL DEFAULT true,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insumos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametros_stock" (
    "id" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "centroId" TEXT NOT NULL,
    "stockMinimo" INTEGER NOT NULL,
    "stockMaximo" INTEGER,

    CONSTRAINT "parametros_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores" (
    "id" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "contacto" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lotes" (
    "id" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "numeroLote" TEXT NOT NULL,
    "fechaVencimiento" DATE,
    "fechaFabricacion" DATE,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "existencias" (
    "id" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "ubicacionId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "existencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL,
    "insumoId" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "ubicacionId" TEXT NOT NULL,
    "centroId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "saldoPosterior" INTEGER NOT NULL,
    "motivo" TEXT,
    "documentoRef" TEXT,
    "proveedorId" TEXT,
    "costoUnitario" DECIMAL(14,2),
    "nota" TEXT,
    "usuarioId" TEXT NOT NULL,
    "trasladoGrupoId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registros_auditoria" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "detalle" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registros_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "centros_nombre_key" ON "centros"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "ubicaciones_centroId_nombre_key" ON "ubicaciones"("centroId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_centros_centroId_idx" ON "usuarios_centros"("centroId");

-- CreateIndex
CREATE UNIQUE INDEX "sesiones_tokenHash_key" ON "sesiones"("tokenHash");

-- CreateIndex
CREATE INDEX "sesiones_usuarioId_idx" ON "sesiones"("usuarioId");

-- CreateIndex
CREATE INDEX "sesiones_expiraEn_idx" ON "sesiones"("expiraEn");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_nombre_key" ON "categorias"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "insumos_codigo_key" ON "insumos"("codigo");

-- CreateIndex
CREATE INDEX "insumos_categoriaId_idx" ON "insumos"("categoriaId");

-- CreateIndex
CREATE INDEX "insumos_nombre_idx" ON "insumos"("nombre");

-- CreateIndex
CREATE INDEX "insumos_codigoBarras_idx" ON "insumos"("codigoBarras");

-- CreateIndex
CREATE INDEX "parametros_stock_centroId_idx" ON "parametros_stock"("centroId");

-- CreateIndex
CREATE UNIQUE INDEX "parametros_stock_insumoId_centroId_key" ON "parametros_stock"("insumoId", "centroId");

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_rut_key" ON "proveedores"("rut");

-- CreateIndex
CREATE INDEX "lotes_fechaVencimiento_idx" ON "lotes"("fechaVencimiento");

-- CreateIndex
CREATE UNIQUE INDEX "lotes_insumoId_numeroLote_key" ON "lotes"("insumoId", "numeroLote");

-- CreateIndex
CREATE INDEX "existencias_ubicacionId_idx" ON "existencias"("ubicacionId");

-- CreateIndex
CREATE UNIQUE INDEX "existencias_loteId_ubicacionId_key" ON "existencias"("loteId", "ubicacionId");

-- CreateIndex
CREATE INDEX "movimientos_centroId_creadoEn_idx" ON "movimientos"("centroId", "creadoEn" DESC);

-- CreateIndex
CREATE INDEX "movimientos_insumoId_creadoEn_idx" ON "movimientos"("insumoId", "creadoEn" DESC);

-- CreateIndex
CREATE INDEX "movimientos_loteId_idx" ON "movimientos"("loteId");

-- CreateIndex
CREATE INDEX "movimientos_ubicacionId_idx" ON "movimientos"("ubicacionId");

-- CreateIndex
CREATE INDEX "movimientos_usuarioId_idx" ON "movimientos"("usuarioId");

-- CreateIndex
CREATE INDEX "movimientos_tipo_creadoEn_idx" ON "movimientos"("tipo", "creadoEn" DESC);

-- CreateIndex
CREATE INDEX "movimientos_trasladoGrupoId_idx" ON "movimientos"("trasladoGrupoId");

-- CreateIndex
CREATE INDEX "movimientos_creadoEn_idx" ON "movimientos"("creadoEn" DESC);

-- CreateIndex
CREATE INDEX "registros_auditoria_creadoEn_idx" ON "registros_auditoria"("creadoEn" DESC);

-- CreateIndex
CREATE INDEX "registros_auditoria_usuarioId_creadoEn_idx" ON "registros_auditoria"("usuarioId", "creadoEn" DESC);

-- CreateIndex
CREATE INDEX "registros_auditoria_entidad_entidadId_idx" ON "registros_auditoria"("entidad", "entidadId");

-- AddForeignKey
ALTER TABLE "ubicaciones" ADD CONSTRAINT "ubicaciones_centroId_fkey" FOREIGN KEY ("centroId") REFERENCES "centros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios_centros" ADD CONSTRAINT "usuarios_centros_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios_centros" ADD CONSTRAINT "usuarios_centros_centroId_fkey" FOREIGN KEY ("centroId") REFERENCES "centros"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insumos" ADD CONSTRAINT "insumos_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parametros_stock" ADD CONSTRAINT "parametros_stock_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "insumos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parametros_stock" ADD CONSTRAINT "parametros_stock_centroId_fkey" FOREIGN KEY ("centroId") REFERENCES "centros"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "insumos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "existencias" ADD CONSTRAINT "existencias_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "lotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "existencias" ADD CONSTRAINT "existencias_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "insumos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "lotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_centroId_fkey" FOREIGN KEY ("centroId") REFERENCES "centros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_auditoria" ADD CONSTRAINT "registros_auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Reglas de integridad que Prisma no expresa en el schema
-- ---------------------------------------------------------------------------

-- El stock nunca puede quedar negativo (última línea de defensa).
ALTER TABLE "existencias"
  ADD CONSTRAINT "existencias_cantidad_no_negativa" CHECK ("cantidad" >= 0);

ALTER TABLE "movimientos"
  ADD CONSTRAINT "movimientos_cantidad_positiva" CHECK ("cantidad" > 0),
  ADD CONSTRAINT "movimientos_saldo_no_negativo" CHECK ("saldoPosterior" >= 0);

ALTER TABLE "parametros_stock"
  ADD CONSTRAINT "parametros_stock_minimo_no_negativo" CHECK ("stockMinimo" >= 0),
  ADD CONSTRAINT "parametros_stock_maximo_coherente"
    CHECK ("stockMaximo" IS NULL OR "stockMaximo" >= "stockMinimo");

ALTER TABLE "usuarios"
  ADD CONSTRAINT "usuarios_email_minusculas" CHECK ("email" = lower("email"));

-- El libro mayor de movimientos es inmutable: no se edita ni se borra.
CREATE OR REPLACE FUNCTION movimientos_inmutables() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los movimientos son inmutables (operación % no permitida)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "movimientos_sin_update_ni_delete"
  BEFORE UPDATE OR DELETE ON "movimientos"
  FOR EACH ROW EXECUTE FUNCTION movimientos_inmutables();
