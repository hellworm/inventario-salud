# Manual de uso de RedInsumos

Guía breve para el trabajo diario. Está organizada por rol: lee la parte común y luego la sección de
tu rol.

- [Para todos](#para-todos)
- [Visitante](#visitante) — solo consulta
- [Bodeguero](#bodeguero) — recibe y entrega insumos
- [Administrador](#administrador) — gestiona toda la red
- [Preguntas frecuentes](#preguntas-frecuentes)

> Tu rol aparece bajo tu nombre, arriba a la derecha. Si necesitas hacer algo que tu rol no permite,
> pídelo a un administrador de tu red.

---

## Para todos

### Entrar al sistema

![Pantalla de ingreso](capturas/01-login.png)

1. Abre la dirección del sistema que te entregó tu institución, en el navegador del computador,
   tablet o teléfono.
2. Escribe tu **correo electrónico** y tu **contraseña** e ingresa.
3. **La primera vez** (o después de que te restablezcan la clave) el sistema te pedirá cambiar la
   contraseña temporal por una propia. Debe tener **al menos 10 caracteres, con letras y números**,
   y ser distinta de la anterior.

Si te equivocas 5 veces seguidas, el acceso a tu cuenta desde ese lugar se bloquea por 15 minutos.
Si olvidaste tu contraseña, pide a un administrador que la restablezca: te dará una temporal, que
debes usar **dentro de 72 horas** (después vence y hay que pedir otra).

### Orientarse en la pantalla

- **Menú**: las secciones a las que tienes acceso. En el computador está a la izquierda; en una
  tablet horizontal se reduce a una columna de íconos (el botón de abajo lo abre completo); en el
  teléfono queda abajo, con el resto en **Menú**.
- **Selector de centro** (arriba): si trabajas en más de un centro, elige cuál quieres ver. Los
  administradores pueden elegir además **Toda la red**.
- **Tu nombre** (arriba a la derecha): **Cambiar contraseña**, **Ayuda** y **Salir**.

Cierra la sesión al terminar si el equipo es compartido. Por seguridad, se cierra sola tras varias
horas sin uso: si eso pasa mientras llenas un formulario, verás el aviso **Tu sesión venció** y el
sistema te llevará a ingresar de nuevo y de vuelta a la misma pantalla (lo que no alcanzaste a
registrar hay que escribirlo otra vez).

Si aparece **“No tienes un centro activo asignado”**, tu cuenta no está asignada a ningún centro en
funcionamiento: pide a un administrador que te asigne uno.

### Instalarlo en la tablet o el teléfono

RedInsumos se puede dejar como una aplicación más del equipo, con su ícono y a pantalla completa:

- **Android (Chrome) o computador (Chrome/Edge):** menú del navegador → **Instalar aplicación** o
  **Agregar a la pantalla principal**.
- **iPad o iPhone (Safari):** botón **Compartir** → **Agregar a inicio**.

Sigue necesitando conexión a internet: no funciona sin red.

### Palabras que usa el sistema

| Palabra | Significa |
|---|---|
| **Insumo** | Un producto del catálogo (por ejemplo "Mascarilla N95"). |
| **Lote** | Una partida de ese insumo, con su número de lote y fecha de vencimiento. |
| **Ubicación** | El lugar físico dentro del centro: bodega, sala, refrigerador. |
| **Disponible** | Lo que se puede usar: el total menos lo vencido. |
| **Mínimo** | La cantidad bajo la cual conviene reponer. |
| **Ingreso / Retiro** | Entrada de insumos al centro / salida para su uso. |
| **Traslado** | Mover insumos de una ubicación a otra, o a otro centro. |
| **Ajuste** | Corregir la cantidad cuando el sistema no coincide con lo que hay físicamente. |
| **Merma** | Dar de baja insumos vencidos, dañados o perdidos. |

### Los estados y sus colores

Los estados siempre llevan texto e ícono, no solo color:

- **Stock suficiente** — hay más que el mínimo.
- **Bajo mínimo** — queda menos que el mínimo: conviene reponer.
- **Sin stock** — no queda nada utilizable.
- **Vence en N días** — el lote vence dentro de los próximos 90 días.
- **Vencido** — ya no se puede usar; hay que separarlo y darlo de baja.

---

## Visitante

Puedes **consultar** el inventario y las alertas de tus centros. No puedes registrar ni modificar
nada.

### Ver el resumen del día — *Panel*

Muestra cuántos insumos están sin stock, bajo el mínimo, vencidos o por vencer, y qué requiere
atención hoy, en orden de prioridad. Toca cualquier tarjeta o fila para ver el detalle.

### Buscar un insumo — *Inventario*

![Inventario](capturas/03-inventario.png)

1. Entra a **Inventario**.
2. Escribe en el buscador el **nombre, código o número de lote**.
3. Si quieres, filtra por **categoría** o **ubicación**, o usa los botones **Sin stock**, **Bajo
   mínimo**, **Por vencer**, **Vencidos** o **Stock suficiente**.
4. Toca un insumo para abrir su ficha: verás cuánto hay, **en qué ubicación está cada lote** y
   cuándo vence.

![Ficha de un insumo](capturas/04-ficha-insumo.png)

### Ver qué falta o está por vencer — *Alertas*

En **Alertas** hay cuatro pestañas: **Sin stock**, **Bajo mínimo**, **Vencidos** y **Por vencer**
(esta última separa los que vencen en 30 días o menos, de 31 a 60 y de 61 a 90).

Cada fila trae, a la derecha, la acción que tu rol puede hacer (un visitante solo consulta):
**Ingresar** lo que falta, **Retirar** primero el lote que está por vencer o **Dar de baja** un lote
vencido. El formulario se abre con el insumo, la ubicación y el lote ya elegidos.

El botón **Lista de reposición** arma el listado de lo que conviene pedir. Puedes **imprimirlo** o
descargarlo con **Exportar CSV** para abrirlo en Excel.

![Lista de reposición](capturas/09-reposicion.png)

---

## Bodeguero

Además de consultar (todo lo del [Visitante](#visitante)), **registras lo que entra y lo que sale**
en tus centros y ves el historial de movimientos.

> Registra cada movimiento **en el momento** en que ocurre. El inventario es tan confiable como lo
> que se anota.

### Registrar un ingreso (llegan insumos)

![Registrar ingreso](capturas/05-ingreso.png)

1. Menú **Registrar → Ingreso** (o el botón **Registrar ingreso** del Panel).
2. **Insumo:** búscalo por nombre o código.
3. **Ubicación de destino:** dónde lo vas a guardar.
4. **Número de lote** y **Vencimiento:** cópialos tal como vienen en el envase. Si el lote ya
   existe en tu centro, el sistema te lo sugiere: tócalo para usarlo y no tener que escribirlo (la
   fecha ya registrada se conserva).
5. **Cantidad**, en la unidad que indica el sistema (unidades, cajas, frascos…).
6. Opcional pero recomendado: **Proveedor** y **Guía o factura**. También puedes anotar el **costo
   unitario** y una nota. En el costo usa **coma para los decimales** (`1250,5`); el punto separa
   miles (`1.250`). Bajo el campo se muestra el monto tal como se guardará: revísalo, porque los
   movimientos no se pueden corregir después.
7. Revisa el resumen al pie ("Vas a ingresar…") y presiona **Registrar ingreso**.

A la derecha ves las existencias actuales de ese insumo, para comprobar.

A tener en cuenta:

- No se pueden ingresar lotes **ya vencidos**.
- Si el insumo controla vencimiento, la fecha es obligatoria.
- Si el número de lote ya existe con **otra** fecha de vencimiento, el sistema avisa: revisa el
  envase, porque uno de los dos datos está mal. Si la fecha registrada es la equivocada, un
  administrador puede corregirla.
- En las notas y motivos **no escribas datos de pacientes**.

### Registrar un retiro (salen insumos para su uso)

![Registrar retiro](capturas/06-retiro.png)

1. Menú **Registrar → Retiro**.
2. Elige el **insumo** (al abrir el buscador aparecen primero los **más usados en este centro**) y
   **desde qué ubicación** lo sacas. Verás cuánto hay disponible ahí.
3. **¿De qué lote sale?**
   - **Automático** (recomendado): el sistema descuenta primero lo que vence antes y te muestra de
     qué lotes saldrá. **Toma físicamente esos mismos lotes.**
   - **Elegir lote:** si necesitas sacar de un lote en particular.
4. Escribe la **cantidad**.
5. Opcional: **Destino o motivo** (por ejemplo "Reposición de sala" o "Procedimiento") y una nota.
6. Revisa el resumen y presiona **Registrar retiro**. Si vas a sacar **más de la mitad** de lo
   disponible en esa ubicación, el sistema te pide confirmar antes de registrar.

A tener en cuenta:

- No se puede retirar más de lo disponible.
- Los lotes **vencidos no se pueden retirar**: avisa a un administrador para que los dé de baja.

### Revisar lo registrado — *Movimientos*

En **Movimientos** (en el teléfono aparece como **Historial**) está todo lo que entró y salió en tus
centros, con fecha, usuario, lote y cantidad. Puedes filtrar y tocar un movimiento para ver su
detalle.

![Historial de movimientos](capturas/07-movimientos.png)

**¿Te equivocaste?** Los movimientos no se editan ni se borran: así el historial es confiable.
Avisa a un administrador para que haga un **ajuste** que corrija la cantidad.

---

## Administrador

Tienes acceso completo a toda la red: todo lo del [Bodeguero](#bodeguero), más traslados, ajustes y
mermas, reportes y la administración del sistema.

![Panel del administrador](capturas/02-panel-administrador.png)

### Revisar la red cada día — *Panel*

Con **Toda la red** seleccionada arriba, el Panel reúne lo que requiere atención en todos los
centros, en orden de prioridad: insumos sin stock, lotes vencidos por dar de baja y lo que vence
esta semana. Cada fila trae el botón para resolverlo (**Ingresar**, **Dar de baja** o **Retirar**).
El gráfico **Actividad de los últimos 14 días** muestra cuántos movimientos de entrada y de salida
se registraron cada día (cuenta movimientos, no unidades). Cambia el selector para ver un solo
centro.

### Trasladar insumos

Menú **Registrar → Traslado**. Elige el insumo y el lote, la ubicación de **origen**, la de
**destino** (puede ser de otro centro) y la cantidad. El sistema registra la salida y la entrada
juntas. Sirve también para mover lotes vencidos a un lugar apartado mientras se dan de baja.

### Corregir el stock o dar de baja — *Ajuste o merma*

Menú **Registrar → Ajuste o merma**. Elige una opción:

| Opción | Cuándo usarla |
|---|---|
| **Sumar stock** | Hay **más** de lo que dice el sistema. |
| **Restar stock** | Hay **menos** de lo que dice el sistema. |
| **Dar de baja** (merma) | El insumo está vencido, dañado, contaminado, perdió la cadena de frío o se extravió. |

Indica insumo, ubicación, lote, cantidad y el **motivo** (obligatorio; por ejemplo "Conteo de
inventario" o "Vencimiento"). Antes de registrar, el sistema muestra un resumen y **pide
confirmar**: un ajuste o una merma no se pueden editar ni borrar (un error se corrige con otro
ajuste). Todo queda en el historial y en la auditoría con tu nombre.

Dar de baja es la **única** forma de sacar del inventario un lote vencido.

### Corregir el vencimiento de un lote

Si la fecha de vencimiento de un lote se digitó mal, abre la **ficha completa** del insumo (desde
Inventario) y, en la tabla **Existencias por lote y ubicación**, usa **Corregir vencimiento**.
Indica la fecha correcta y el motivo, revisa el antes y el después y confirma.

La fecha es del lote: cambia en **todas** las ubicaciones y centros donde esté, y puede dejarlo
vencido o vigente. Queda en la auditoría con tu nombre, la fecha anterior, la nueva y el motivo.

### Reportes

![Reporte de consumo](capturas/10-reporte-consumo.png)

En **Reportes** hay cuatro, cada uno con vista previa y descarga para Excel (CSV) según los filtros
que apliques:

- **Existencias:** stock actual valorizado por centro, ubicación y lote.
- **Movimientos:** ingresos, retiros, ajustes, mermas y traslados de un período.
- **Consumo y cobertura:** cuánto se retira de cada insumo, el promedio diario y para cuántos días
  alcanza lo que hay.
- **Vencimientos y mermas:** lotes vencidos o por vencer y las bajas del período.

### Administración

En el menú **Administración**:

| Sección | Para qué |
|---|---|
| **Insumos** | El catálogo común a toda la red: código, nombre, categoría, unidad de medida, si controla vencimiento o requiere cadena de frío y, opcionalmente, su registro sanitario. En la ficha de cada insumo defines el **stock mínimo y máximo por centro**, que es lo que activa las alertas. |
| **Categorías** | Los grupos en que se ordenan los insumos. |
| **Centros y ubicaciones** | Los establecimientos de la red y los lugares donde cada uno guarda su stock (bodegas, salas, refrigeradores). |
| **Proveedores** | A quiénes se les compra, para indicarlos en los ingresos. |
| **Usuarios** | Quién puede entrar, con qué rol y en qué centros. |
| **Auditoría** | Registro de quién hizo qué y cuándo. Solo lectura. |

Lo que tiene historial **no se elimina, se desactiva**: un insumo, centro, ubicación, proveedor o
usuario desactivado deja de usarse pero sus registros se conservan.

### Usuarios

![Usuarios](capturas/11-usuarios.png)

- **Crear:** botón **Nuevo usuario**. Indica nombre, correo electrónico, rol y centros. El sistema muestra una
  **contraseña temporal una sola vez**: entrégasela a la persona por un medio seguro. Deberá
  cambiarla al entrar, y tiene **72 horas** para hacerlo: después la temporal vence y hay que
  restablecerla.
- **Estado de la contraseña temporal:** en la lista, quien aún no la cambia aparece con
  **Contraseña temporal vence el dd-mm-aaaa**. Si la dejó vencer, aparece **Contraseña temporal
  vencida** con el botón **Restablecer** ahí mismo: no puede entrar hasta que generes otra.
- **Menú ⋮ de cada usuario:**
  - **Editar datos, rol y centros.**
  - **Restablecer contraseña:** genera una nueva temporal, válida por 72 horas (para quien olvidó
    la suya o dejó vencer la anterior).
  - **Desbloquear cuenta:** si quedó bloqueada por intentos fallidos.
  - **Desactivar usuario:** para quien ya no debe entrar; queda fuera de inmediato. Se puede
    reactivar después.

Buenas prácticas: una cuenta por persona (nunca compartidas), el rol más limitado que le permita
hacer su trabajo, y al menos dos administradores en la red. El detalle de estas tareas está en
[`OPERACION.md`](OPERACION.md#usuarios).

### Auditoría

![Auditoría](capturas/12-auditoria.png)

**Administración → Auditoría** lista los ingresos al sistema, los movimientos de stock y los
cambios de administración, con filtros. Abre un registro para ver su detalle. Conviene revisarla
periódicamente, en especial los ajustes, las mermas y los intentos de ingreso fallidos.

### Poner en marcha un centro nuevo (orden sugerido)

1. **Centros y ubicaciones:** crea el centro y sus ubicaciones.
2. **Categorías** e **Insumos:** revisa que el catálogo tenga lo que el centro usa.
3. En cada insumo, define el **mínimo** para ese centro.
4. **Proveedores:** agrega los que falten.
5. **Usuarios:** crea las cuentas del personal y asígnales el centro.
6. Carga el stock inicial: con **ingresos** (si hay guía o factura) o con **Ajuste → Sumar stock**
   y motivo "Stock inicial".

---

## Preguntas frecuentes

**Olvidé mi contraseña.** Pide a un administrador que la restablezca. No hay recuperación por
correo.

**Me dice "Correo electrónico o contraseña incorrectos" y estoy seguro de la clave.** Puede que la cuenta esté
bloqueada por intentos fallidos (espera 15 minutos o pide que la desbloqueen), desactivada, o que
tu contraseña temporal haya vencido (pide que te la restablezcan).

**No veo un centro o un botón que otro compañero sí ve.** Depende del rol y de los centros
asignados a cada persona. Consulta a un administrador.

**Registré mal un movimiento.** No se puede editar ni borrar. Un administrador lo corrige con un
ajuste, indicando el motivo.

**El sistema dice que hay stock, pero no lo encuentro.** Revisa en la ficha del insumo en qué
ubicación y lote figura. Si realmente no está, avisa a un administrador para que lo ajuste.

**¿Puedo usarlo en el teléfono o la tablet?** Sí, en el navegador, o instalado como aplicación (ver
[Instalarlo en la tablet o el teléfono](#instalarlo-en-la-tablet-o-el-teléfono)). Necesita conexión.

**Me apareció "Tu sesión venció" al registrar.** La sesión se cerró por inactividad. Ingresa de
nuevo: vuelves a la misma pantalla, pero lo que no alcanzó a registrarse hay que escribirlo otra vez.

**¿Se guardan datos de pacientes?** No. RedInsumos registra insumos y movimientos. **No escribas
nombres, RUT ni datos de pacientes** en las notas o motivos.
