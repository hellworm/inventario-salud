# syntax=docker/dockerfile:1
#
# Imagen de producción de RedInsumos (multi-etapa).
#
# Etapas finales (targets):
#   app           Servidor web mínimo (salida "standalone" de Next), usuario sin
#                 privilegios. Es la imagen que atiende a los usuarios.
#   herramientas  Proyecto completo con Prisma CLI y scripts de operación:
#                 migraciones, crear administrador, limpiar sesiones.
#
#   docker build --target app -t redinsumos-app .
#   docker build --target herramientas -t redinsumos-herramientas .
#
# Base Debian "slim" (glibc): los binarios nativos de Prisma (motor
# debian-openssl-3.0.x) y de @node-rs/argon2 (linux-*-gnu) se instalan y generan
# DENTRO de la imagen, por lo que siempre corresponden a su plataforma
# (amd64 o arm64). No se copian node_modules desde el equipo anfitrión.

ARG NODE_VERSION=22

# ---------------------------------------------------------------------------
# base: Node + OpenSSL (lo necesita el motor de Prisma)
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---------------------------------------------------------------------------
# dependencias: npm ci (incluye las de desarrollo: se necesitan para compilar)
# El "postinstall" ejecuta `prisma generate`, por eso se copia antes el esquema.
# ---------------------------------------------------------------------------
FROM base AS dependencias
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --include=dev

# ---------------------------------------------------------------------------
# construccion: build de Next (genera .next/standalone). No necesita la base
# de datos ni secretos.
# ---------------------------------------------------------------------------
FROM dependencias AS construccion
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# herramientas: migraciones y scripts de operación
# ---------------------------------------------------------------------------
FROM dependencias AS herramientas
ENV NODE_ENV=production
COPY --chown=node:node . .
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# ---------------------------------------------------------------------------
# app: servidor web (etapa final por defecto)
# ---------------------------------------------------------------------------
FROM base AS app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# La salida standalone ya trae server.js y solo los node_modules necesarios.
# No incluye los estáticos ni public/ (manifiesto e íconos de la app instalable):
# se copian aparte. Fuera de Docker lo mismo lo hace `npm start` (scripts/iniciar.mjs).
COPY --from=construccion --chown=node:node /app/.next/standalone ./
COPY --from=construccion --chown=node:node /app/.next/static ./.next/static
COPY --from=construccion --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/salud').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "server.js"]
