# Inventario Salud

Aplicación web **multi-empresa** para inventario de insumos de salud (medicamentos, material clínico).
Cada centro (empresa) tiene sus propios datos y varios usuarios con distintos roles.

Hecha con **Python + Django + PostgreSQL**, pensada para trabajarse en **VS Code**.

## Qué incluye

- **Empresas y usuarios:** registro de un centro nuevo, invitación de usuarios y roles:
  - **Administrador:** todo, incluida la gestión de usuarios.
  - **Bodega:** crea productos, lotes y ubicaciones, y registra movimientos.
  - **Solo lectura:** consulta.
- Un usuario puede pertenecer a **varias empresas** y cambiar entre ellas desde la barra superior.
- **Productos** con código, presentación, unidad y stock mínimo.
- **Lotes** con fecha de vencimiento.
- **Ubicaciones:** bodega, farmacia, botiquín…
- **Movimientos:** entradas, salidas y ajustes. El stock **se calcula** a partir del historial, así cada cambio queda auditado (quién, cuándo, cuánto).
- **Panel** con alertas de lotes vencidos, lotes por vencer y productos bajo el stock mínimo.
- Validaciones: no se puede sacar más stock del que hay, y no hay códigos duplicados dentro de una empresa.
- **Aislamiento entre empresas** probado con tests automáticos.

## Empezar en VS Code (Windows, Mac o Linux)

Requisitos: [Python 3.11+](https://www.python.org/downloads/), [Git](https://git-scm.com/) y [VS Code](https://code.visualstudio.com/).

1. Clona el repositorio y ábrelo en VS Code (`Archivo → Abrir carpeta`).
2. Instala las extensiones recomendadas cuando VS Code te lo sugiera (Python, Django…).
3. Abre la terminal de VS Code (`Ctrl + ñ` o `Ver → Terminal`) y ejecuta:

   ```bash
   # Crear entorno virtual
   python -m venv .venv

   # Activarlo
   #   Windows:      .venv\Scripts\activate
   #   Mac/Linux:    source .venv/bin/activate

   pip install -r requirements.txt
   cp .env.example .env          # en Windows: copy .env.example .env

   python manage.py migrate       # crea las tablas
   python manage.py datos_demo    # (opcional) datos de ejemplo
   python manage.py createsuperuser   # (opcional) acceso a /admin
   python manage.py runserver
   ```

4. Abre <http://127.0.0.1:8000>.

Con `datos_demo` se crean dos empresas (*Clínica Demo* y *Farmacia Demo*) con estos usuarios:
`clinica_admin`, `clinica_bodega`, `clinica_lector`, `farmacia_admin`, `farmacia_bodega` y `farmacia_lector`.
La contraseña de todos es `demo12345`.

También puedes arrancar con **F5**: en `.vscode/launch.json` están las configuraciones *Django: servidor* y *Django: pruebas*, con depurador.

### Usar PostgreSQL en tu computador (opcional)

Por defecto se usa SQLite, que no necesita instalar nada. Para trabajar igual que en producción:

```bash
docker compose up -d
```

Luego, en `.env`, activa la línea:

```
DATABASE_URL=postgres://inventario:inventario@localhost:5432/inventario
```

y vuelve a correr `python manage.py migrate`.

## Pruebas

```bash
python manage.py test
```

## Estructura

```
config/        Configuración del proyecto (settings, urls)
cuentas/       Empresas, membresías, roles, registro y usuarios
  middleware.py  Determina la empresa activa de cada request
  mixins.py      Filtra todo por empresa y controla permisos por rol
inventario/    Productos, lotes, ubicaciones, movimientos, stock y panel
templates/     Pantallas HTML
static/        Estilos
```

### Cómo funciona el aislamiento entre empresas

Todas las tablas del inventario tienen una columna `empresa`. Las vistas heredan de `DeEmpresaMixin`, que:

1. filtra todas las consultas por la empresa activa del usuario (si alguien pide un registro de otra empresa, recibe un 404);
2. asigna la empresa al crear un registro;
3. limita los desplegables de los formularios a registros de esa misma empresa.

**Regla de oro al agregar pantallas nuevas:** usa siempre `DeEmpresaMixin` o `EmpresaRequeridaMixin` y filtra por `request.empresa`.

El admin de Django (`/admin`) es solo para el equipo que opera la plataforma, porque ve los datos de **todas** las empresas.

## Publicar en internet (producción)

Sirve cualquier hosting de Python con PostgreSQL (Render, Railway, Fly.io…). Variables de entorno necesarias:

| Variable | Ejemplo |
|---|---|
| `DEBUG` | `0` |
| `SECRET_KEY` | una cadena larga y aleatoria |
| `DATABASE_URL` | `postgres://...` (la entrega el hosting) |
| `ALLOWED_HOSTS` | `tu-app.onrender.com,tu-dominio.com` |
| `CSRF_TRUSTED_ORIGINS` | `https://tu-app.onrender.com` |

Comandos de despliegue:

```bash
pip install -r requirements.txt
python manage.py collectstatic --noinput
python manage.py migrate
gunicorn config.wsgi
```

Configura también los **respaldos automáticos** de la base de datos en el hosting.

## Próximos pasos sugeridos

- Registrar la entrada creando el lote en el mismo formulario.
- Transferencias entre ubicaciones en un solo paso.
- Exportar a Excel o CSV.
- Recuperación de contraseña por correo.
- Alertas por correo de vencimientos y stock bajo.
- Planes y cobro por empresa.
