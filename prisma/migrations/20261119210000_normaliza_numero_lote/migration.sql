-- Números de lote en forma canónica: sin espacios en los extremos, espacios
-- internos colapsados a uno y en mayúsculas (igual que `normalizarNumeroLote`
-- en src/lib/esquemas/movimientos.ts). Desde esta versión los ingresos buscan
-- el lote por su forma canónica; esta migración alinea los lotes ya existentes
-- para que "L-01  A" y "L-01 A" no terminen siendo dos lotes distintos.
--
-- Si dos lotes del mismo insumo quedarían con el mismo número (variantes del
-- mismo lote registradas por separado), NO se tocan: fusionarlos exige mover
-- existencias y eso lo decide una persona.
UPDATE "lotes" l
SET "numeroLote" = upper(regexp_replace(btrim(l."numeroLote"), '\s+', ' ', 'g'))
WHERE l."numeroLote" <> upper(regexp_replace(btrim(l."numeroLote"), '\s+', ' ', 'g'))
  AND NOT EXISTS (
    SELECT 1
    FROM "lotes" o
    WHERE o."insumoId" = l."insumoId"
      AND o."id" <> l."id"
      AND upper(regexp_replace(btrim(o."numeroLote"), '\s+', ' ', 'g'))
        = upper(regexp_replace(btrim(l."numeroLote"), '\s+', ' ', 'g'))
  );
