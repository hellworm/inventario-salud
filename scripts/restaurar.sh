#!/usr/bin/env bash
#
# Restauración de un respaldo de RedInsumos.
#
#   bash scripts/restaurar.sh <archivo.dump>                 (restaura en DATABASE_URL)
#   bash scripts/restaurar.sh <archivo.dump> --destino URL   (restaura en otra base)
#   bash scripts/restaurar.sh <archivo.dump> --si            (sin preguntar; para automatizar)
#
# ATENCIÓN: REEMPLAZA TODO el contenido de la base de destino por el del
# respaldo. Lo que se haya registrado después del respaldo se pierde.
#
# Antes de restaurar sobre la base en uso:
#   1. Detén la aplicación (docker compose stop app mantenimiento).
#   2. Saca un respaldo del estado actual, por si acaso (scripts/respaldo.sh).
# La base de destino debe existir (puede estar vacía). Para ensayar, crea una
# base aparte y usa --destino. Ver docs/OPERACION.md.

set -euo pipefail
# shellcheck source=scripts/comun.sh
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"

ARCHIVO=""
DESTINO_URL=""
CONFIRMADO="no"

while [ $# -gt 0 ]; do
  case "$1" in
    --destino)
      [ $# -ge 2 ] || fallar "Falta la dirección después de --destino."
      DESTINO_URL="$2"
      shift 2
      ;;
    --si) CONFIRMADO="si"; shift ;;
    -h | --help) sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) fallar "Opción desconocida: $1" ;;
    *)
      [ -z "$ARCHIVO" ] || fallar "Indica un solo archivo de respaldo."
      ARCHIVO="$1"
      shift
      ;;
  esac
done

[ -n "$ARCHIVO" ] || fallar "Indica el archivo de respaldo. Ejemplo: bash scripts/restaurar.sh respaldos/redinsumos-….dump"
[ -f "$ARCHIVO" ] || fallar "No existe el archivo: ${ARCHIVO}"

exigir_comando pg_restore
exigir_comando psql

if [ -n "$DESTINO_URL" ]; then
  case "$DESTINO_URL" in
    postgresql://* | postgres://*) URL_PG="${DESTINO_URL%%\?*}" ;;
    *) fallar 'La dirección de --destino debe comenzar con "postgresql://".' ;;
  esac
else
  resolver_url_pg
fi

pg_restore --list "$ARCHIVO" >/dev/null 2>&1 || fallar "El archivo no es un respaldo válido de pg_dump (formato custom) o está dañado."

BASE="$(nombre_de_base "$URL_PG")"
SERVIDOR="$(servidor_de_url "$URL_PG")"

psql "$URL_PG" -v ON_ERROR_STOP=1 -qAtc 'SELECT 1' >/dev/null 2>&1 \
  || fallar "No se pudo conectar a la base \"${BASE}\" en ${SERVIDOR}. ¿Existe la base y son correctos el usuario y la clave?"

TABLAS="$(psql "$URL_PG" -qAtc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")"

echo
echo "  Respaldo:  ${ARCHIVO} ($(du -h "$ARCHIVO" | cut -f1))"
echo "  Destino:   base \"${BASE}\" en ${SERVIDOR} (hoy tiene ${TABLAS} tablas)"
echo
echo "  Se BORRARÁ todo el contenido actual de \"${BASE}\" y se reemplazará por el del respaldo."
echo

if [ "$CONFIRMADO" != "si" ]; then
  [ -t 0 ] || fallar "Se requiere confirmación. Ejecuta el comando en una terminal o agrega --si."
  read -r -p "  Para continuar escribe el nombre de la base de destino (${BASE}): " RESPUESTA
  [ "$RESPUESTA" = "$BASE" ] || fallar "No coincide. Restauración cancelada; no se modificó nada."
fi

echo "→ Vaciando la base \"${BASE}\"…"
psql "$URL_PG" -v ON_ERROR_STOP=1 -q <<'SQL'
SET client_min_messages = warning;
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
SQL

echo "→ Restaurando…"
# Una sola transacción: o se restaura todo o no queda nada a medias.
pg_restore --dbname="$URL_PG" --no-owner --no-acl --single-transaction --exit-on-error "$ARCHIVO"

RESUMEN="$(psql "$URL_PG" -qAtF ', ' -c "SELECT
  (SELECT count(*) FROM usuarios) || ' usuarios',
  (SELECT count(*) FROM centros) || ' centros',
  (SELECT count(*) FROM insumos) || ' insumos',
  (SELECT count(*) FROM movimientos) || ' movimientos'" 2>/dev/null || echo "no se pudo leer el resumen")"

echo "✔ Restauración completa en \"${BASE}\": ${RESUMEN}."
echo "  Si era la base en uso: aplica migraciones pendientes (npm run db:deploy o"
echo "  docker compose run --rm migrar) y vuelve a iniciar la aplicación."
