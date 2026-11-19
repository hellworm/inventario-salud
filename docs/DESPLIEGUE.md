# Despliegue de RedInsumos en producción

Guía para instalar y mantener RedInsumos sin ser especialista. Si un término no se entiende, hay un
[glosario](#glosario) al final.

**Contenido**

1. [Qué opción elegir](#1-qué-opción-elegir)
2. [Opción A — Un servidor con Docker Compose](#2-opción-a--un-servidor-con-docker-compose-recomendada)
3. [Opción B — Plataforma gestionada](#3-opción-b--plataforma-gestionada-paas--postgresql-gestionado)
4. [Variables de configuración](#4-variables-de-configuración)
5. [Primer administrador](#5-primer-administrador)
6. [HTTPS es obligatorio](#6-https-es-obligatorio)
7. [Respaldos](#7-respaldos)
8. [Actualizar a una versión nueva](#8-actualizar-a-una-versión-nueva)
9. [Restauración ante desastre](#9-restauración-ante-desastre)
10. [Monitoreo y registros](#10-monitoreo-y-registros)
11. [Checklist de salida a producción](#11-checklist-de-salida-a-producción)

---

## 1. Qué opción elegir

| Situación | Recomendación |
|---|---|
| 1 a ~10 centros (diálisis, consultorios), decenas de usuarios, sin equipo de informática propio | **Opción A**: un servidor virtual (VPS) con Docker Compose. Todo queda en una sola máquina, con respaldo automático. |
| No quieren administrar un servidor, o ya usan una nube | **Opción B**: plataforma gestionada para la aplicación + PostgreSQL gestionado. Más cara, menos mantenimiento. |
| Clínicas u hospitales con área de TI | Opción B, o la imagen Docker en su propia infraestructura, con PostgreSQL gestionado o en alta disponibilidad, respaldos fuera del sitio y monitoreo propio. |

**Tamaño de servidor sugerido (opción A):** 2 CPU, 4 GB de RAM, 40 GB de disco SSD, Ubuntu 24.04
LTS. La aplicación es liviana; el disco se usa sobre todo en respaldos. Para construir la imagen se
recomiendan al menos 2 GB de RAM libres.

**Ubicación de los datos:** elige un proveedor con centro de datos en Chile o, en su defecto, en
Sudamérica: mejora la velocidad y simplifica las conversaciones sobre dónde residen los datos (ver
[`PRIVACIDAD.md`](PRIVACIDAD.md)).

---

## 2. Opción A — Un servidor con Docker Compose (recomendada)

Qué se obtiene con un solo comando:

| Servicio | Función |
|---|---|
| `db` | PostgreSQL 16 con los datos en un volumen persistente. No se expone a internet. |
| `migrar` | Aplica las migraciones pendientes de la base **antes** de que arranque la aplicación y termina. |
| `app` | La aplicación web. Se reinicia sola si falla. |
| `mantenimiento` | Borra las sesiones vencidas una vez al día. |
| `respaldo` | Respaldo diario de la base en la carpeta `respaldos/`, con rotación. |
| `caddy` (opcional) | Proxy con HTTPS automático (certificado gratuito de Let's Encrypt). |

### 2.1 Preparar el servidor

1. Contrata un servidor con Ubuntu 24.04 y anota su dirección IP.
2. En el DNS de tu dominio crea un registro **A** (por ejemplo `insumos.miclinica.cl`) apuntando a
   esa IP.
3. Conéctate por SSH e instala Docker con las
   [instrucciones oficiales](https://docs.docker.com/engine/install/ubuntu/) (incluyen el
   complemento `docker compose`).
4. Abre en el cortafuegos solo los puertos **22** (SSH), **80** y **443** (web):

   ```bash
   sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443 && sudo ufw enable
   ```

### 2.2 Instalar RedInsumos

```bash
git clone <url-del-repositorio> redinsumos
cd redinsumos

cp .env.example .env
nano .env        # completa lo siguiente:
```

En `.env` completa como mínimo:

```bash
POSTGRES_PASSWORD=<pega aquí el resultado de: openssl rand -hex 24>
DOMINIO=insumos.miclinica.cl
COMPOSE_PROFILES=https
```

Protege el archivo y levanta todo:

```bash
chmod 600 .env
docker compose up -d
```

La primera vez tarda varios minutos (descarga y construye las imágenes). Después verifica:

```bash
docker compose ps                         # "app" y "db" deben decir "healthy"
curl -s https://insumos.miclinica.cl/api/salud
# → {"estado":"ok","baseDeDatos":"ok"}
```

Luego crea el [primer administrador](#5-primer-administrador).

> **Sin dominio todavía (prueba interna):** omite `DOMINIO` y `COMPOSE_PROFILES`. La aplicación
> queda en `http://127.0.0.1:3000`, accesible **solo desde el propio servidor**. Para verla desde tu
> computador usa un túnel SSH: `ssh -L 3000:127.0.0.1:3000 usuario@servidor` y abre
> <http://localhost:3000>. No la publiques por HTTP sin cifrar (ver [sección 6](#6-https-es-obligatorio)).

### 2.3 El proxy HTTPS (Caddy)

Ya viene incluido; estos son los bloques que lo definen, por si quieres adaptarlos.

`docker-compose.yml` (servicio opcional, perfil `https`):

```yaml
caddy:
  image: caddy:2
  profiles: ["https"]
  restart: unless-stopped
  environment:
    DOMINIO: ${DOMINIO:-}
  ports: ["80:80", "443:443", "443:443/udp"]
  volumes:
    - ./Caddyfile:/etc/caddy/Caddyfile:ro
    - caddy_datos:/data          # certificados: no borrar este volumen
    - caddy_config:/config
```

`Caddyfile`:

```caddyfile
{$DOMINIO:localhost} {
	encode zstd gzip
	reverse_proxy app:3000 {
		health_uri /api/salud
		health_interval 30s
	}
}
```

Caddy obtiene y renueva el certificado solo, y redirige HTTP a HTTPS. Requiere que el dominio ya
apunte al servidor y que los puertos 80 y 443 estén abiertos. Si prefieres otro proxy (Nginx,
Traefik, el balanceador de tu nube), apúntalo a `127.0.0.1:3000` y asegúrate de que reenvíe las
cabeceras `Host` y `X-Forwarded-For`.

#### La IP real de cada persona: `TRUST_PROXY`

La aplicación nunca ve directamente a quien la visita: ve al proxy. El proxy le informa la IP real
en la cabecera `X-Forwarded-For`, pero esa cabecera también la puede escribir cualquier visitante,
así que la aplicación **solo la usa si se le dice cuántos proxies de confianza tiene delante**:

| `TRUST_PROXY` | Cuándo | Efecto |
|---|---|---|
| `1` | Un proxy: Caddy (el de Compose), Nginx o el balanceador de la nube. **Es el valor que fija `docker-compose.yml`.** | Toma la última IP de la cabecera, que es la que agregó tu proxy. |
| `2` (o más) | Proxies en cadena, por ejemplo un CDN delante de Caddy o Nginx. | Toma la penúltima (la que vio el primer proxy de tu cadena). |
| `0` o sin definir | Sin proxy, o si no sabes qué hay delante. | No se registra ninguna IP. |

Con la IP real la aplicación (a) la anota en la auditoría y en las sesiones y (b) limita los
intentos de inicio de sesión **por IP**: 20 intentos cada 5 minutos por IP, y 5 fallos seguidos
bloquean por 15 minutos solo esa combinación de IP + cuenta. Así, alguien que prueba claves desde
otra red no deja fuera al titular de la cuenta.

Sin IP confiable (`TRUST_PROXY=0`) la protección sigue activa pero **degrada**: 5 fallos bloquean la
cuenta completa por 15 minutos (un tercero podría bloquear a propósito a una persona repitiendo
claves erradas; un administrador la desbloquea desde **Administración → Usuarios**) y la auditoría
queda sin IP.

Dos cuidados:

- **No pongas un número mayor que el real.** Con `TRUST_PROXY=2` y un solo proxy, la aplicación
  tomaría una posición que el visitante puede escribir a su antojo.
- **El proxy debe agregar la IP, no copiarla.** Caddy lo hace bien por defecto (descarta lo que
  mande el visitante). En Nginx usa `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`
  (agrega al final) o `$remote_addr` (reemplaza); ambas sirven con `TRUST_PROXY=1`. Si tienes un CDN
  delante de Caddy, declara sus rangos en `trusted_proxies` del Caddyfile y usa `TRUST_PROXY=2`.

Para comprobarlo: inicia sesión y mira **Administración → Auditoría**; el registro "Inicio de
sesión" debe mostrar tu IP pública (no `172.x` ni `127.0.0.1`).

### 2.4 Comandos del día a día

```bash
docker compose ps                    # estado de los servicios
docker compose logs -f app           # registros de la aplicación (Ctrl+C para salir)
docker compose logs respaldo         # resultado de los respaldos
docker compose restart app           # reiniciar la aplicación
docker compose down                  # detener todo (los datos se conservan)
```

> `docker compose down -v` **borra los volúmenes, es decir, la base de datos**. No lo uses en
> producción.

---

## 3. Opción B — Plataforma gestionada (PaaS) + PostgreSQL gestionado

Sirve cualquier plataforma que ejecute contenedores Docker (por ejemplo Railway, Render, Fly.io,
Google Cloud Run o AWS App Runner) junto a un PostgreSQL 16 gestionado (el de la misma plataforma,
Google Cloud SQL, Amazon RDS, Neon, Supabase, etc.). Prefiere regiones en Chile o Sudamérica.

Pasos generales (los nombres de los menús cambian según la plataforma):

1. **Crea la base PostgreSQL 16** y copia su dirección de conexión. Activa los **respaldos
   automáticos** del proveedor (idealmente con recuperación a un punto en el tiempo).
   - El usuario de la aplicación debe poder crear la extensión `unaccent` (la usa la búsqueda sin
     tildes). En la mayoría de los proveedores está permitida; si no, pide habilitarla.
2. **Crea el servicio web** desde este repositorio usando el `Dockerfile`, etapa (target) `app`.
   - Puerto: `3000`.
   - Comprobación de salud (health check): ruta `/api/salud`.
   - Variables: `DATABASE_URL` (obligatoria; agrega `?schema=public` si no lo trae y
     `sslmode=require` si el proveedor lo exige) y, opcionalmente, `SESION_HORAS`.
3. **Aplica las migraciones** en cada despliegue, antes de publicar la versión nueva. Dos formas:
   - Como "comando de despliegue/release" de la plataforma, con la etapa `herramientas` del
     `Dockerfile`: `npx prisma migrate deploy`.
   - Desde un computador de confianza o desde CI: `DATABASE_URL=<producción> npm run db:deploy`.
4. **Crea el primer administrador** ([sección 5](#5-primer-administrador)) ejecutando el comando en
   la etapa `herramientas` o desde un computador de confianza con `DATABASE_URL` de producción.
5. **Programa la limpieza de sesiones** como tarea diaria (cron job) de la plataforma:
   `npm run sesiones:limpiar` en la etapa `herramientas`.
6. **Dominio y HTTPS:** asocia tu dominio en la plataforma; el certificado lo gestiona ella.
7. **Respaldos fuera del proveedor:** además de los automáticos, guarda periódicamente una copia
   propia con `scripts/respaldo.sh` ([sección 7](#7-respaldos)).

> Esta opción se describe a nivel general: no fue ejecutada en una plataforma concreta. Las piezas
> que usa (imagen, endpoint de salud, migraciones y scripts) son las mismas de la opción A.

Una sola instancia de la aplicación es suficiente para decenas de usuarios. Se pueden ejecutar
varias sin cambios: las sesiones y los datos viven en PostgreSQL.

---

## 4. Variables de configuración

La aplicación valida su configuración al arrancar. Si falta algo obligatorio **no inicia** y
muestra, por ejemplo:

```
✖ Configuración inválida: RedInsumos no puede iniciar.

  - DATABASE_URL: falta. Es la dirección de conexión a PostgreSQL (postgresql://usuario:clave@servidor:5432/base?schema=public).
```

| Variable | Obligatoria | Dónde se usa | Descripción |
|---|:-:|---|---|
| `DATABASE_URL` | Sí | Aplicación y scripts | Conexión a PostgreSQL. Con Docker Compose se arma sola a partir de `POSTGRES_*`. |
| `SESION_HORAS` | No | Aplicación | Horas de inactividad antes de cerrar la sesión (1–168; por defecto 12). |
| `TRUST_PROXY` | Recomendada | Aplicación | Cantidad de proxies inversos de confianza delante de la aplicación (0–10; por defecto 0; Compose la fija en 1). Ver [§2.3](#la-ip-real-de-cada-persona-trust_proxy). |
| `APP_DB_USER`, `APP_DB_PASSWORD` | No | `docker-compose.yml` | Rol de base de datos con privilegios mínimos para la aplicación. Ver [§6.1](#61-endurecimiento-recomendado-de-la-base-de-datos). |
| `POSTGRES_PASSWORD` | Sí (Compose) | `docker-compose.yml` | Clave de la base. Larga, aleatoria, solo letras y números. |
| `POSTGRES_USER`, `POSTGRES_DB` | No | `docker-compose.yml` | Usuario y nombre de la base (por defecto `redinsumos`). |
| `DOMINIO` | Para HTTPS | Caddy | Dominio público, sin `https://`. |
| `COMPOSE_PROFILES` | No | Docker Compose | Ponlo en `https` para activar el proxy sin escribir `--profile https`. |
| `PUERTO_APP` | No | `docker-compose.yml` | Puerto local de la aplicación (por defecto 3000). |
| `RESPALDO_RETENCION_DIAS` | No | Respaldos | Días que se conservan los respaldos locales (por defecto 14). |
| `RESPALDO_DIR` / `RESPALDO_DIR_ANFITRION` | No | Respaldos | Carpeta de destino (fuera de Docker / con Compose). |
| `RESPALDO_INTERVALO_SEGUNDOS` | No | Servicio `respaldo` | Frecuencia del respaldo automático (por defecto 86400 = diario). |
| `ADMIN_EMAIL`, `ADMIN_NOMBRE` | No | `admin:crear` | Alternativa a los argumentos `--email` y `--nombre`. |
| `DATABASE_URL_TEST` | Solo desarrollo | `npm test` | Base de pruebas. No se usa en producción. |

El archivo [`.env.example`](../.env.example) trae cada variable comentada. **Nunca** subas `.env`
al repositorio ni lo envíes por correo o chat.

---

## 5. Primer administrador

Una instalación nueva no tiene usuarios. El primero se crea desde la línea de comandos:

```bash
# Con Docker Compose
docker compose run --rm mantenimiento npm run admin:crear -- --email ana@miclinica.cl --nombre "Ana Pérez"

# Sin Docker (con DATABASE_URL definida)
npm run admin:crear -- --email ana@miclinica.cl --nombre "Ana Pérez"
```

Resultado:

```
✔ Administrador creado.

    Correo electrónico:   ana@miclinica.cl
    Contraseña temporal:  Abcd-Efgh-2345-Jkmn

  Anótala ahora: no se volverá a mostrar ni se puede recuperar.
  Al iniciar sesión, el sistema pedirá cambiarla por una definitiva.
  Vence en 72 horas: si no se usa a tiempo, repite el comando con --restablecer.
```

- La contraseña temporal se muestra **una sola vez**; en la base solo queda cifrada (hash).
- En el primer ingreso el sistema **obliga** a cambiarla.
- **Vence a las 72 horas.** Si nadie la usó a tiempo, se genera otra con `--restablecer`.
- Es seguro repetir el comando: si el email ya existe no cambia nada.
- Si se prefiere definir la contraseña temporal: agrega `--password-stdin` y escríbela cuando la
  pida (nunca se acepta como argumento, para que no quede en el historial).
- **Recuperar el acceso** de un administrador (olvidó la clave o quedó bloqueado y no hay otro):
  el mismo comando con `--restablecer`.

Desde ahí, el resto de los usuarios, centros e insumos se crean en la aplicación (menú
**Administración**). Ver [`OPERACION.md`](OPERACION.md).

> **No cargues los datos de demostración en producción.** `npm run db:seed` crea cuentas con
> contraseñas públicas. Por eso se niega a ejecutarse cuando `NODE_ENV=production` (así corre dentro
> de los contenedores). La bandera `SEED_DEMO=1` lo fuerza y existe solo para montar un ambiente de
> **capacitación** separado, nunca la instalación real.

---

## 6. HTTPS es obligatorio

- En producción la cookie de sesión se marca como "segura": **el navegador solo la envía por
  HTTPS**. Por HTTP sin cifrar el inicio de sesión no funciona (salvo en `localhost`).
- Sin HTTPS, contraseñas y datos viajarían en texto legible por la red.
- La aplicación envía además la cabecera HSTS, que indica al navegador usar siempre HTTPS.

Con la opción A, el perfil `https` lo resuelve solo. Con la opción B lo resuelve la plataforma. No
publiques el puerto 3000 directamente a internet.

### 6.1 Endurecimiento recomendado de la base de datos

El historial de movimientos y la auditoría son **inalterables**: la base de datos rechaza con
triggers cualquier `UPDATE`, `DELETE` o `TRUNCATE` sobre las tablas `movimientos` y
`registros_auditoria`, venga de la aplicación o de una consola SQL.

Esa protección tiene un límite: el **dueño** de las tablas (el usuario `POSTGRES_USER`, con el que
se crean) podría deshabilitar los triggers. Para cerrar esa puerta, haz que la aplicación se conecte
con un usuario distinto, de privilegios mínimos, y deja al dueño solo para migrar y respaldar. Es
opcional, pero recomendable en producción; toma cinco minutos.

**1. Crear el rol de la aplicación** (una sola vez; elige una clave larga, solo letras y números):

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

```sql
-- Rol con el que se conectará la aplicación. No es dueño de nada.
CREATE ROLE redinsumos_app LOGIN PASSWORD 'CAMBIA_ESTA_CLAVE';

GRANT CONNECT ON DATABASE redinsumos TO redinsumos_app;
GRANT USAGE ON SCHEMA public TO redinsumos_app;

-- Tablas normales: leer y escribir. Nunca TRUNCATE, ni crear o alterar tablas.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO redinsumos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO redinsumos_app;

-- Libro mayor y auditoría: SOLO leer y agregar.
REVOKE UPDATE, DELETE ON "movimientos", "registros_auditoria" FROM redinsumos_app;

-- La aplicación no necesita la bitácora de migraciones.
REVOKE ALL ON "_prisma_migrations" FROM redinsumos_app;

-- Las tablas que creen las migraciones futuras heredan los mismos permisos.
-- (Reemplaza "redinsumos" por tu POSTGRES_USER si lo cambiaste.)
ALTER DEFAULT PRIVILEGES FOR ROLE redinsumos IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO redinsumos_app;
ALTER DEFAULT PRIVILEGES FOR ROLE redinsumos IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO redinsumos_app;
```

Si tu base o tu usuario no se llaman `redinsumos`, cambia esos nombres en los comandos.

**2. Indicar a Compose que la aplicación use ese rol.** En `.env`:

```bash
APP_DB_USER=redinsumos_app
APP_DB_PASSWORD=LA_CLAVE_QUE_ELEGISTE
```

y `docker compose up -d`. Los servicios `app` y `mantenimiento` pasan a conectarse con
`redinsumos_app`; `migrar` y `respaldo` siguen usando al dueño. Sin Docker, es lo mismo: la
`DATABASE_URL` del servidor web lleva el rol de la aplicación y la que se usa para
`npm run db:deploy`, `respaldo` y `restaurar` lleva al dueño.

**3. Comprobar** (debe fallar con "permission denied"):

```bash
docker compose exec db psql -U redinsumos_app -d redinsumos -c 'DELETE FROM "registros_auditoria"'
```

Notas:

- Después de **restaurar un respaldo** hay que repetir el paso 1 desde `GRANT USAGE ON SCHEMA…`
  (la restauración recrea las tablas y los permisos no viajan en el respaldo). El rol y su clave se
  conservan.
- Si una migración futura agregara otra tabla de solo-agregar, sus notas de versión indicarán el
  `REVOKE` correspondiente.
- `respaldo.sh` y `restaurar.sh` funcionan igual con los triggers: el respaldo solo lee y la
  restauración recrea las tablas desde cero (no usa `UPDATE`, `DELETE` ni `TRUNCATE`).

---

## 7. Respaldos

**Regla de oro: un respaldo que nunca se ha restaurado no es un respaldo.** Ensaya la restauración
antes de salir a producción y luego al menos cada tres meses
([`OPERACION.md`](OPERACION.md#ensayar-una-restauración)).

### Qué viene resuelto

- El servicio `respaldo` genera cada día un archivo en `respaldos/`
  (`redinsumos-<base>-<fecha>Z.dump`), comprimido, verifica que sea legible y borra los que superan
  `RESPALDO_RETENCION_DIAS` (14 por defecto) **solo si el nuevo salió bien**.
- Respaldo manual en cualquier momento (hazlo siempre antes de actualizar):

  ```bash
  docker compose run --rm respaldo "bash /scripts/respaldo.sh"     # con Docker Compose
  npm run respaldo                                                  # sin Docker
  ```

### Qué debes agregar tú: una copia fuera del servidor

Si el servidor se pierde, se pierden también los respaldos que están en él. Copia la carpeta
`respaldos/` a otro lugar todos los días: un almacenamiento de objetos (S3, Google Cloud Storage,
Backblaze B2) o un segundo servidor. Ejemplo con `rclone` en el cron del servidor:

```cron
# m h  dom mon dow  comando
30 4 * * * rclone copy /home/usuario/redinsumos/respaldos remoto:redinsumos-respaldos --max-age 2d
```

### Retención recomendada

| Copia | Frecuencia | Conservar |
|---|---|---|
| Local (servidor) | Diaria | 14 días |
| Fuera del servidor | Diaria | 30 días |
| Fuera del servidor | Mensual (la del día 1) | 12 meses |
| Antes de cada actualización | Puntual | Hasta confirmar que la versión nueva funciona |

Ajusta los plazos a las obligaciones de tu establecimiento (trazabilidad de insumos, auditorías).
Los respaldos contienen **todos** los datos del sistema: guárdalos cifrados o con acceso restringido.

---

## 8. Actualizar a una versión nueva

```bash
cd redinsumos

# 1. Respaldo previo (obligatorio)
docker compose run --rm respaldo "bash /scripts/respaldo.sh"

# 2. Traer la versión nueva
git pull                      # o: git fetch --tags && git checkout v1.2.0

# 3. Reconstruir y levantar. Las migraciones se aplican solas antes de iniciar la app.
docker compose up -d --build

# 4. Verificar
docker compose ps
docker compose logs migrar    # debe terminar con "migrations have been successfully applied" o "No pending migrations"
curl -s https://insumos.miclinica.cl/api/salud
```

Habrá una interrupción breve (segundos a un par de minutos) mientras se reemplaza el contenedor:
actualiza fuera del horario de atención.

**Si algo sale mal:**

- La migración falla → la aplicación nueva **no arranca** (por diseño) y la anterior ya se detuvo.
  Revisa `docker compose logs migrar`. Para volver atrás: `git checkout <versión anterior>` y
  `docker compose up -d --build`.
- La versión nueva arrancó pero funciona mal y **ya modificó la base** → vuelve al código anterior
  y, si la base quedó incompatible, restaura el respaldo del paso 1
  ([sección 9](#9-restauración-ante-desastre)). Se pierde lo registrado después del respaldo.

En la opción B el flujo es el mismo en concepto: respaldo → migraciones → publicar la imagen nueva.

---

## 9. Restauración ante desastre

### Caso 1: hay que volver a un respaldo en el mismo servidor

```bash
# 1. Detener lo que escribe en la base
docker compose stop app mantenimiento

# 2. (Si la base aún responde) respaldar el estado actual, por si acaso
docker compose run --rm respaldo "bash /scripts/respaldo.sh"

# 3. Restaurar. Pide escribir el nombre de la base para confirmar.
ls respaldos/
docker compose run --rm respaldo "bash /scripts/restaurar.sh /respaldos/<archivo>.dump"

# 4. Aplicar migraciones pendientes (si el respaldo es de una versión anterior) y reiniciar
docker compose run --rm migrar
docker compose up -d
```

### Caso 2: se perdió el servidor completo

1. Crea un servidor nuevo y prepáralo ([2.1](#21-preparar-el-servidor)).
2. Clona el repositorio (en la misma versión que estaba en uso) y recrea `.env`. Puedes usar una
   `POSTGRES_PASSWORD` nueva: la base se crea desde cero.
3. Copia el respaldo más reciente (desde la copia externa) a la carpeta `respaldos/`.
4. Levanta solo la base, restaura y luego el resto:

   ```bash
   docker compose up -d db
   docker compose run --rm respaldo "bash /scripts/restaurar.sh /respaldos/<archivo>.dump"
   docker compose up -d
   ```

5. Apunta el DNS del dominio a la IP nueva y verifica `/api/salud` y el inicio de sesión.

Tras restaurar, las sesiones que estaban abiertas al momento del respaldo pueden seguir válidas
hasta vencer; si el incidente fue de seguridad, ciérralas todas (ver
[`OPERACION.md`](OPERACION.md#cerrar-todas-las-sesiones)) y cambia las contraseñas.

**Cuánto se puede perder:** con respaldo diario, hasta 24 horas de registros. Si eso no es
aceptable, baja `RESPALDO_INTERVALO_SEGUNDOS` (por ejemplo `21600` = cada 6 horas) o usa un
PostgreSQL gestionado con recuperación a un punto en el tiempo.

---

## 10. Monitoreo y registros

- **Salud:** `GET /api/salud` responde `200 {"estado":"ok","baseDeDatos":"ok"}` si la aplicación y
  la base funcionan, y `503` si no alcanza la base. Es público y no entrega datos sensibles.
  Configura un monitor externo gratuito (UptimeRobot, Better Stack, Healthchecks, etc.) que consulte
  `https://<tu-dominio>/api/salud` cada pocos minutos y avise por correo.
- **Registros (logs):** todo va a la salida estándar del contenedor: `docker compose logs app`. Los
  errores del servidor salen como una línea JSON con hora, contexto, mensaje y detalle técnico; las
  contraseñas, tokens, cookies y claves de conexión se ocultan automáticamente.
- **Rotación de logs de Docker:** para que no llenen el disco, crea `/etc/docker/daemon.json` con
  lo siguiente y reinicia Docker (`sudo systemctl restart docker`):

  ```json
  { "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }
  ```

- **Disco:** revisa el espacio libre cada cierto tiempo (`df -h`). Lo que más crece son los
  respaldos y las imágenes antiguas (`docker image prune -f` las elimina).
- **Auditoría funcional** (quién hizo qué): dentro de la aplicación, en **Administración →
  Auditoría**.

---

## 11. Checklist de salida a producción

### Configuración y secretos

- [ ] `POSTGRES_PASSWORD` es larga, aleatoria y **distinta** de cualquier ejemplo (`medired_dev`
      es solo de desarrollo).
- [ ] `.env` tiene permisos restringidos (`chmod 600 .env`) y no está en el repositorio.
- [ ] La aplicación arranca sin advertencias de configuración (`docker compose logs app`).
- [ ] `TRUST_PROXY` corresponde a los proxies que realmente hay delante (1 con el Caddy incluido) y
      la auditoría muestra la IP pública de quien inicia sesión.
- [ ] (Recomendado) La aplicación se conecta con un rol de base de datos de privilegios mínimos
      ([§6.1](#61-endurecimiento-recomendado-de-la-base-de-datos)).

### Datos

- [ ] **No** se cargó el seed de demostración. Comprobación: no existen usuarios `@redinsumos.cl`
      en **Administración → Usuarios**.
- [ ] El primer administrador se creó con `admin:crear` y ya cambió su contraseña temporal.
- [ ] Existen **al menos dos** administradores (si uno pierde el acceso, el otro lo restablece).
- [ ] Centros, ubicaciones, categorías, insumos y mínimos de stock están cargados y revisados.
- [ ] Cada persona tiene su propia cuenta, con el rol mínimo que necesita. No hay cuentas compartidas.

### Red y acceso

- [ ] El sitio abre **solo por HTTPS** con certificado válido; HTTP redirige a HTTPS.
- [ ] El cortafuegos expone solo los puertos 22, 80 y 443. El puerto de PostgreSQL (5432) y el 3000
      no son accesibles desde internet.
- [ ] El acceso SSH al servidor es con llave (no con contraseña) y solo para quienes lo operan.
- [ ] El sistema operativo recibe actualizaciones de seguridad automáticas
      (`unattended-upgrades` en Ubuntu).

### Respaldos y continuidad

- [ ] El respaldo automático corre a diario (`docker compose logs respaldo`, archivos en `respaldos/`).
- [ ] Hay una **copia fuera del servidor**, automática.
- [ ] Se **ensayó una restauración** completa en una base aparte y se revisaron los datos.
- [ ] Está escrito quién restaura, con qué accesos y en cuánto tiempo.

### Operación

- [ ] Un monitor externo consulta `/api/salud` y avisa a alguien.
- [ ] La rotación de logs de Docker está configurada.
- [ ] La limpieza de sesiones y de contadores de intentos corre a diario (`docker compose logs mantenimiento`).
- [ ] Hay un responsable de revisar la auditoría periódicamente y de dar de baja a quienes dejan la
      institución.
- [ ] Los usuarios recibieron el [manual](MANUAL-USUARIO.md) y saben a quién pedir ayuda.
- [ ] Se revisó [`PRIVACIDAD.md`](PRIVACIDAD.md) con quien corresponda en la institución.

---

## Glosario

- **Contenedor / Docker:** forma de empaquetar la aplicación con todo lo que necesita, para que
  funcione igual en cualquier servidor.
- **Docker Compose:** herramienta que levanta varios contenedores juntos (aplicación, base de
  datos, etc.) a partir de un archivo.
- **Migración:** cambio ordenado en la estructura de la base de datos al pasar de una versión a otra.
- **Proxy inverso:** programa que recibe las visitas desde internet (con HTTPS) y las pasa a la
  aplicación.
- **Variable de entorno / `.env`:** valores de configuración (como la clave de la base) que se
  entregan a la aplicación sin escribirlos en el código.
- **Seed:** carga de datos de ejemplo para demostración.
- **VPS:** servidor virtual arrendado a un proveedor.
- **PaaS:** plataforma que ejecuta la aplicación por ti, sin que administres el servidor.
