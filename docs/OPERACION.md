# Operación de RedInsumos

Tareas rutinarias y solución de problemas para quien mantiene el sistema. La instalación está en
[`DESPLIEGUE.md`](DESPLIEGUE.md) y el uso diario, en [`MANUAL-USUARIO.md`](MANUAL-USUARIO.md).

Los comandos suponen la instalación con Docker Compose y se ejecutan en la carpeta del proyecto en
el servidor. Sin Docker, los equivalentes son los `npm run …` indicados.

**Contenido**

- [Rutina recomendada](#rutina-recomendada)
- [Usuarios](#usuarios): crear, restablecer contraseñas, desbloquear, dar de baja
- [Respaldos](#respaldos): verificar, respaldar a mano, ensayar una restauración
- [Auditoría](#revisar-la-auditoría)
- [Sesiones](#sesiones)
- [Base de datos](#base-de-datos)
- [Solución de problemas](#solución-de-problemas)

---

## Rutina recomendada

| Cuándo | Qué | Cómo |
|---|---|---|
| Cada día (automático) | Respaldo de la base | Servicio `respaldo`. Nada que hacer. |
| Cada día (automático) | Limpieza de sesiones vencidas | Servicio `mantenimiento`. Nada que hacer. |
| Cada semana | Confirmar que hay respaldos recientes y copia externa | `ls -lh respaldos/` y revisar el destino externo. |
| Cada semana | Revisar el monitor de `/api/salud` y el espacio en disco | `df -h` |
| Cada mes | Revisar usuarios: dar de baja a quien ya no corresponde | **Administración → Usuarios** |
| Cada mes | Revisar la auditoría: ingresos fallidos, ajustes y mermas inusuales | **Administración → Auditoría** |
| Cada mes | Actualizaciones del sistema operativo y de RedInsumos | [`DESPLIEGUE.md` §8](DESPLIEGUE.md#8-actualizar-a-una-versión-nueva) |
| Cada 3 meses | **Ensayar una restauración** | [Más abajo](#ensayar-una-restauración) |

---

## Usuarios

Todo se hace en la aplicación, con una cuenta de **Administrador**, en **Administración →
Usuarios**. Cada fila tiene un menú de acciones (botón **⋮**).

### Crear un usuario

1. **Nuevo usuario**.
2. Completa nombre y apellido, email (lo usará para ingresar), rol y, para Bodeguero o Visitante,
   los centros a los que tendrá acceso. El enlace **¿Qué puede hacer cada rol?** lo explica.
3. Al guardar, el sistema muestra una **contraseña temporal una sola vez**. Entrégasela a la persona
   por un medio seguro (en persona o por teléfono; evita correo o chats grupales).
4. En su primer ingreso el sistema le pedirá cambiarla.

Mientras no la cambie, la cuenta aparece con la etiqueta **Clave temporal**.

### Restablecer una contraseña

No hay recuperación por correo: la restablece un administrador.

1. Menú **⋮** del usuario → **Restablecer contraseña** → confirmar.
2. Se muestra una nueva contraseña temporal (una sola vez) y se cierran las sesiones de esa persona.
3. Entrégasela; deberá cambiarla al ingresar.

Un administrador no puede restablecer **su propia** contraseña desde ahí: la cambia en el menú de
su nombre (arriba a la derecha) → **Cambiar contraseña**, o se la restablece otro administrador.

### Desbloquear una cuenta

Tras 5 intentos fallidos, la cuenta se bloquea por 15 minutos y se desbloquea sola. Para no
esperar: menú **⋮** → **Desbloquear cuenta**. Si la persona no recuerda la clave, además
restablécela.

### Cambiar rol o centros

Menú **⋮** → **Editar datos, rol y centros**. Al cambiar el rol o los centros, la persona debe
volver a iniciar sesión.

### Dar de baja a un usuario

Menú **⋮** → **Desactivar usuario**. Queda fuera de inmediato (se cierran sus sesiones) y no puede
volver a entrar. Los usuarios no se eliminan, para conservar el historial de lo que registraron;
se pueden reactivar con **Reactivar usuario**.

El sistema impide dejar la red sin administradores: no permite desactivar ni degradar al último
administrador activo, ni desactivarse a uno mismo.

### Ningún administrador puede entrar

Desde el servidor:

```bash
docker compose run --rm mantenimiento npm run admin:crear -- --email ana@miclinica.cl --restablecer
# sin Docker:  npm run admin:crear -- --email ana@miclinica.cl --restablecer
```

Asigna una contraseña temporal nueva a ese administrador, lo desbloquea, lo reactiva y cierra sus
sesiones. Queda anotado en la auditoría. Si no existe ningún administrador, el mismo comando sin
`--restablecer` crea uno.

---

## Respaldos

### Verificar que se están haciendo

```bash
ls -lh respaldos/                       # debe haber un archivo de las últimas 24 horas
docker compose logs --tail 20 respaldo  # debe decir "✔ Respaldo listo: …"
```

Si aparece `EL RESPALDO FALLO`, la línea anterior indica la causa (lo más común: disco lleno o la
base detenida).

### Respaldo manual

```bash
docker compose run --rm respaldo "bash /scripts/respaldo.sh"
# sin Docker:  npm run respaldo
```

Hazlo siempre antes de actualizar el sistema o de una carga masiva de datos.

### Ensayar una restauración

Restaura el último respaldo en una base **aparte**, sin tocar la real:

```bash
# 1. Crear una base de ensayo
docker compose exec db sh -c 'createdb -U "$POSTGRES_USER" ensayo'

# 2. Restaurar ahí el respaldo más reciente (pide escribir "ensayo" para confirmar)
docker compose run --rm respaldo 'bash /scripts/restaurar.sh "$(ls -t /respaldos/*.dump | head -1)" --destino "${DATABASE_URL%/*}/ensayo"'

# 3. Comparar cantidades con la base real (deben coincidir con lo que había al respaldar)
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d ensayo -c "SELECT (SELECT count(*) FROM usuarios) AS usuarios, (SELECT count(*) FROM insumos) AS insumos, (SELECT count(*) FROM movimientos) AS movimientos"'

# 4. Borrar la base de ensayo
docker compose exec db sh -c 'dropdb -U "$POSTGRES_USER" ensayo'
```

Sin Docker:

```bash
createdb ensayo
bash scripts/restaurar.sh respaldos/<archivo>.dump --destino postgresql://usuario:clave@localhost:5432/ensayo
dropdb ensayo
```

Anota la fecha del ensayo y cuánto tardó. La restauración real (sobre la base en uso) está en
[`DESPLIEGUE.md` §9](DESPLIEGUE.md#9-restauración-ante-desastre).

### Qué hace y qué no hace `restaurar.sh`

- **Reemplaza todo** el contenido de la base de destino por el del respaldo.
- Pide confirmar escribiendo el nombre de la base (o `--si` para automatizar).
- Valida el archivo antes de tocar nada y restaura en una sola transacción: si falla, no deja datos
  a medias (la base queda vacía y se puede reintentar).
- No detiene la aplicación: detenla antes (`docker compose stop app mantenimiento`).

---

## Revisar la auditoría

**Administración → Auditoría** (solo Administrador) muestra quién hizo qué y cuándo: ingresos al
sistema, movimientos de stock y cambios de administración. Es de solo lectura y se puede filtrar.
Al abrir un registro se ve su detalle.

Qué mirar periódicamente:

- **Ingresos fallidos o cuentas bloqueadas** repetidos sobre una misma cuenta: posible intento de
  acceso indebido. Confirma con la persona y restablece su contraseña.
- **Ajustes y mermas**: son las operaciones que corrigen el stock. Revisa que tengan un motivo
  razonable y que no se concentren en una persona o insumo.
- **Cambios de usuarios** (creaciones, cambios de rol, contraseñas restablecidas): deben
  corresponder a solicitudes reales.

El historial de movimientos es inalterable: la propia base de datos rechaza cualquier modificación o
borrado. Un error se corrige con un movimiento nuevo (un ajuste), nunca editando el anterior.

---

## Sesiones

- Una sesión se cierra tras `SESION_HORAS` de inactividad (12 por defecto) y, en cualquier caso, a
  los 7 días.
- Las sesiones vencidas se borran a diario (servicio `mantenimiento`). A mano:

  ```bash
  docker compose run --rm mantenimiento npm run sesiones:limpiar
  # sin Docker:  npm run sesiones:limpiar
  ```

- **Sin Docker**, prográmalo con cron (`crontab -e`), junto con el respaldo:

  ```cron
  # m  h  dom mon dow  comando
  15 3 * * * cd /ruta/a/redinsumos && npm run --silent sesiones:limpiar >> /var/log/redinsumos-mantenimiento.log 2>&1
  30 3 * * * cd /ruta/a/redinsumos && bash scripts/respaldo.sh        >> /var/log/redinsumos-respaldo.log 2>&1
  ```

### Cerrar todas las sesiones

Ante una sospecha de acceso indebido, obliga a todos a ingresar de nuevo:

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DELETE FROM sesiones"'
```

No borra usuarios ni datos: solo cierra las sesiones abiertas.

---

## Base de datos

- **Consola SQL** (solo para consultas; evita modificar datos a mano):

  ```bash
  docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
  ```

- **Cambiar la clave de la base:** `POSTGRES_PASSWORD` solo se aplica al crear la base por primera
  vez. Para cambiarla después:

  1. Abre la consola SQL (comando anterior), escribe `\password` y presiona Enter. Ingresa la clave
     nueva dos veces (solo letras y números) y sal con `\q`.
  2. Edita `.env` y pon la misma clave en `POSTGRES_PASSWORD`.
  3. `docker compose up -d` recrea los servicios con la clave nueva.

- **Los datos viven en el volumen `redinsumos_datos_postgres`.** `docker compose down` lo conserva;
  `docker compose down -v` lo **borra**.

---

## Solución de problemas

### La aplicación no inicia: "Configuración inválida"

El mensaje nombra la variable y el problema. Corrige `.env` y ejecuta `docker compose up -d`.
Causas típicas: `DATABASE_URL` ausente o mal escrita; `SESION_HORAS` no numérica.

### `docker compose` dice "Falta POSTGRES_PASSWORD en el archivo .env"

Falta completar esa variable en `.env` (o el archivo no existe: `cp .env.example .env`).

### El sitio muestra error o no carga

```bash
docker compose ps                 # ¿algún servicio detenido o "unhealthy"?
docker compose logs --tail 50 app
curl -s http://127.0.0.1:3000/api/salud
```

| Lo que se ve | Causa probable | Qué hacer |
|---|---|---|
| `/api/salud` responde `503` y `"baseDeDatos":"sin_conexion"` | La base está detenida o la clave no coincide | `docker compose logs --tail 50 db`; `docker compose up -d db`. Si dice *authentication failed*, la clave de `.env` no es la de la base (ver "Cambiar la clave"). |
| `app` no existe o está en "Created" | La migración falló y la aplicación no partió | `docker compose logs migrar`. Corrige y `docker compose up -d`. |
| `/api/salud` responde bien en el servidor pero el dominio no abre | Proxy, DNS o cortafuegos | `docker compose logs caddy`; verifica que el dominio apunte a la IP y que 80/443 estén abiertos. |
| Aviso de certificado inválido | Caddy aún no obtiene el certificado | Revisa `docker compose logs caddy`: suele ser DNS mal apuntado o puerto 80 cerrado. |
| Todo lento o caídas intermitentes | Disco lleno o poca memoria | `df -h`, `free -h`, `docker image prune -f`. |

### No se puede iniciar sesión

- **"Email o contraseña incorrectos"**: es el mismo mensaje para clave errada, cuenta bloqueada o
  usuario desactivado (a propósito, para no dar pistas). Revisa el estado del usuario en
  **Administración → Usuarios** y desbloquea o restablece.
- **Ingresa la clave correcta y vuelve a la pantalla de ingreso, sin mensaje de error**: el sitio
  se está abriendo por HTTP y no por HTTPS. En producción la sesión solo funciona por HTTPS
  ([`DESPLIEGUE.md` §6](DESPLIEGUE.md#6-https-es-obligatorio)).
- **Nadie puede entrar tras una restauración**: las cuentas son las del momento del respaldo. Usa
  `admin:crear --restablecer`.

### Un usuario no ve un centro, un menú o un botón

Es por su rol o sus centros asignados. Revisa **Editar datos, rol y centros**. Recuerda que solo el
Administrador hace traslados, ajustes y mermas, y ve reportes y administración.

### "Ocurrió un error inesperado"

El detalle técnico queda en los registros, con hora:

```bash
docker compose logs --since 15m app | grep '"nivel":"error"'
```

Cada línea trae `contexto`, `mensaje` y `error` (nombre, código y traza). Las contraseñas y claves
se ocultan solas, pero **revisa antes de compartir** un registro: puede incluir nombres de insumos o
correos de usuarios.

### El stock del sistema no coincide con el físico

No es una falla técnica: se corrige en la aplicación con **Ajuste o merma** (Administrador),
indicando el motivo (por ejemplo "Conteo de inventario"). Queda registrado en el historial y en la
auditoría.

### El disco se llenó

```bash
df -h
du -sh respaldos/
docker system df
docker image prune -f              # borra imágenes antiguas sin uso
```

Baja `RESPALDO_RETENCION_DIAS` si los respaldos locales ocupan demasiado (y confirma antes que la
copia externa funciona).

### Dónde pedir ayuda técnica

Reúne antes: qué se intentaba hacer, hora aproximada, mensaje en pantalla y las líneas de
`docker compose logs app` de ese momento. Con eso, quien dé soporte puede ubicar el problema.
