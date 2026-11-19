-- Sitio web del proveedor ("Ir a comprar" en el panel). Opcional.
ALTER TABLE "proveedores" ADD COLUMN "sitioWeb" TEXT;

-- Defensa en profundidad: aunque la aplicación valida y normaliza la URL,
-- la base solo admite enlaces http(s) de largo acotado (nunca javascript:, data:, etc.).
ALTER TABLE "proveedores"
  ADD CONSTRAINT "proveedores_sitioWeb_http"
  CHECK ("sitioWeb" IS NULL OR ("sitioWeb" ~ '^https?://[^[:space:]]+$' AND char_length("sitioWeb") <= 300));
