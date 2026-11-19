#!/usr/bin/env bash
#
# Respaldo de la base de datos de RedInsumos.
#
#   bash scripts/respaldo.sh            (o: npm run respaldo)
#
# Qué hace:
#   1. Genera un respaldo completo y comprimido con pg_dump (formato "custom").
#   2. Verifica que el archivo se pueda leer antes de darlo por bueno.
#   3. Borra los respaldos con más de RESPALDO_RETENCION_DIAS días, solo si el
#      respaldo nuevo salió bien (nunca se queda sin ningún respaldo).
#
# Variables (del entorno o del archivo .env):
#   DATABASE_URL             Conexión a la base (obligatoria).
#   RESPALDO_DIR             Carpeta de destino. Por defecto: ./respaldos
#   RESPALDO_RETENCION_DIAS  Días que se conservan. Por defecto: 14 (0 = no borrar)
#
# Los respaldos contienen todos los datos del sistema: guárdalos también fuera
# del servidor y con acceso restringido. Ver docs/OPERACION.md.

set -euo pipefail
# shellcheck source=scripts/comun.sh
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"

exigir_comando pg_dump
exigir_comando pg_restore
resolver_url_pg

DESTINO="${RESPALDO_DIR:-$(leer_de_env RESPALDO_DIR)}"
DESTINO="${DESTINO:-${RAIZ_PROYECTO}/respaldos}"
RETENCION="${RESPALDO_RETENCION_DIAS:-$(leer_de_env RESPALDO_RETENCION_DIAS)}"
RETENCION="${RETENCION:-14}"
[[ "$RETENCION" =~ ^[0-9]+$ ]] || fallar "RESPALDO_RETENCION_DIAS debe ser un número entero de días (recibido: ${RETENCION})."

BASE="$(nombre_de_base "$URL_PG")"
MARCA="$(date -u +%Y%m%d-%H%M%S)"
ARCHIVO="${DESTINO}/redinsumos-${BASE}-${MARCA}Z.dump"
TEMPORAL="${ARCHIVO}.parcial"

umask 077                      # solo el dueño puede leer los respaldos
mkdir -p "$DESTINO"
trap 'rm -f "$TEMPORAL"' EXIT

echo "→ Respaldando la base \"${BASE}\" de $(servidor_de_url "$URL_PG")…"
pg_dump --dbname="$URL_PG" --format=custom --compress=9 --no-owner --no-acl --file="$TEMPORAL"

# Un respaldo que no se puede leer no sirve: se valida su índice.
pg_restore --list "$TEMPORAL" >/dev/null || fallar "El respaldo generado no se puede leer; no se conserva."
[ -s "$TEMPORAL" ] || fallar "El respaldo quedó vacío; no se conserva."

mv "$TEMPORAL" "$ARCHIVO"
trap - EXIT
echo "✔ Respaldo listo: ${ARCHIVO} ($(du -h "$ARCHIVO" | cut -f1))"

if [ "$RETENCION" -gt 0 ]; then
  BORRADOS="$(find "$DESTINO" -maxdepth 1 -type f -name 'redinsumos-*.dump' -mtime "+${RETENCION}" -print -delete | wc -l)"
  echo "  Rotación: ${BORRADOS} respaldo(s) con más de ${RETENCION} días eliminados."
fi
echo "  Respaldos disponibles: $(find "$DESTINO" -maxdepth 1 -type f -name 'redinsumos-*.dump' | wc -l)"
