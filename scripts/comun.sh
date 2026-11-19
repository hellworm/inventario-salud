# Funciones compartidas por respaldo.sh y restaurar.sh (no se ejecuta directamente).
# shellcheck shell=bash

# Carpeta raíz del proyecto (la que contiene scripts/).
RAIZ_PROYECTO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fallar() {
  echo "✖ $*" >&2
  exit 1
}

# Lee UNA variable desde .env sin ejecutar el archivo (no se evalúa como código).
# Solo se usa si la variable no viene ya definida en el entorno.
leer_de_env() {
  local nombre="$1" archivo="${RAIZ_PROYECTO}/.env" linea valor
  [ -f "$archivo" ] || return 0
  linea="$(grep -E "^[[:space:]]*${nombre}=" "$archivo" | tail -n 1 || true)"
  [ -n "$linea" ] || return 0
  valor="${linea#*=}"
  valor="${valor%$'\r'}"
  # Quita comillas envolventes simples o dobles.
  if [[ "$valor" =~ ^\"(.*)\"$ ]] || [[ "$valor" =~ ^\'(.*)\'$ ]]; then
    valor="${BASH_REMATCH[1]}"
  fi
  printf '%s' "$valor"
}

# Deja en URL_PG la dirección de conexión que entienden pg_dump/pg_restore/psql.
# Prisma agrega parámetros propios (?schema=public) que esas herramientas
# rechazan, por eso se quita todo lo que viene después de "?".
resolver_url_pg() {
  local url="${DATABASE_URL:-}"
  [ -n "$url" ] || url="$(leer_de_env DATABASE_URL)"
  [ -n "$url" ] || fallar "Falta DATABASE_URL (defínela en el entorno o en ${RAIZ_PROYECTO}/.env)."
  case "$url" in
    postgresql://* | postgres://*) ;;
    *) fallar 'DATABASE_URL debe comenzar con "postgresql://".' ;;
  esac
  URL_PG="${url%%\?*}"
}

# Nombre de la base de una URL (sin credenciales), para mostrar en pantalla.
nombre_de_base() {
  local sin_parametros="${1%%\?*}"
  printf '%s' "${sin_parametros##*/}"
}

# Servidor[:puerto] de una URL, sin usuario ni clave.
servidor_de_url() {
  local resto="${1#*://}"
  resto="${resto%%/*}"
  printf '%s' "${resto##*@}"
}

exigir_comando() {
  command -v "$1" >/dev/null 2>&1 || fallar "No se encontró el comando '$1'. Instala el cliente de PostgreSQL 16 (paquete postgresql-client-16)."
}
