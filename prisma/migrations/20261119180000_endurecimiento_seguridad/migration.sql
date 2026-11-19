-- Endurecimiento de seguridad: idempotencia de movimientos, vencimiento de
-- contraseñas temporales, limitador de intentos e inmutabilidad reforzada.

-- AlterTable
ALTER TABLE "movimientos" ADD COLUMN     "claveIdempotencia" TEXT,
ADD COLUMN     "indiceIdempotencia" INTEGER;

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "passwordTemporalExpira" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "intentos_login" (
    "clave" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "sujeto" TEXT,
    "ip" TEXT,
    "cuenta" INTEGER NOT NULL,
    "cuentaAnterior" INTEGER NOT NULL DEFAULT 0,
    "ventanaInicio" TIMESTAMP(3) NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intentos_login_pkey" PRIMARY KEY ("clave")
);

-- CreateIndex
CREATE INDEX "intentos_login_expiraEn_idx" ON "intentos_login"("expiraEn");

-- CreateIndex
CREATE INDEX "intentos_login_sujeto_idx" ON "intentos_login"("sujeto");

-- CreateIndex
CREATE UNIQUE INDEX "movimientos_claveIdempotencia_indiceIdempotencia_key" ON "movimientos"("claveIdempotencia", "indiceIdempotencia");

-- ---------------------------------------------------------------------------
-- Reglas que Prisma no expresa en el schema
-- ---------------------------------------------------------------------------

-- La clave de idempotencia y su índice van siempre juntos.
ALTER TABLE "movimientos"
  ADD CONSTRAINT "movimientos_idempotencia_coherente"
    CHECK (("claveIdempotencia" IS NULL) = ("indiceIdempotencia" IS NULL));

-- Las contraseñas temporales que ya estaban pendientes caducan 72 horas después
-- de aplicar esta migración (las nuevas, 72 horas después de generarse).
UPDATE "usuarios"
  SET "passwordTemporalExpira" = CURRENT_TIMESTAMP + INTERVAL '72 hours'
  WHERE "debeCambiarPassword";

-- El libro mayor tampoco se puede vaciar con TRUNCATE (los triggers de fila no
-- lo cubren).
CREATE TRIGGER "movimientos_sin_truncate"
  BEFORE TRUNCATE ON "movimientos"
  FOR EACH STATEMENT EXECUTE FUNCTION movimientos_inmutables();

-- La bitácora de auditoría es igual de inmutable: solo admite INSERT.
CREATE OR REPLACE FUNCTION auditoria_inmutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los registros de auditoría son inmutables (operación % no permitida)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "registros_auditoria_sin_update_ni_delete"
  BEFORE UPDATE OR DELETE ON "registros_auditoria"
  FOR EACH ROW EXECUTE FUNCTION auditoria_inmutable();

CREATE TRIGGER "registros_auditoria_sin_truncate"
  BEFORE TRUNCATE ON "registros_auditoria"
  FOR EACH STATEMENT EXECUTE FUNCTION auditoria_inmutable();
