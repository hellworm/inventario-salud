# Privacidad y cumplimiento: nota informativa

> **Alcance de este documento.** Describe qué datos guarda RedInsumos y entrega orientaciones
> generales sobre la normativa chilena. **No es asesoría legal.** RedInsumos no cuenta con
> certificaciones (por ejemplo ISO 27001) ni con autorizaciones o validaciones de autoridades
> sanitarias o de protección de datos. Cada institución debe revisar sus obligaciones con su propia
> asesoría legal.

## Qué datos personales guarda el sistema

RedInsumos gestiona **insumos**, no pacientes. **No tiene campos para datos de pacientes ni datos
clínicos**, y no debe usarse para registrarlos.

Los datos personales que sí almacena corresponden a quienes usan el sistema y a contactos de
proveedores:

| Dato | Dónde | Para qué |
|---|---|---|
| Nombre y email de cada usuario; rol y centros asignados | Usuarios | Identificar a la persona y definir su acceso. |
| Contraseña | Usuarios | Solo se guarda un resumen cifrado irreversible (hash argon2id), nunca la contraseña. |
| Fecha del último acceso, intentos fallidos y bloqueos | Usuarios | Seguridad de la cuenta. |
| Contadores de intentos de inicio de sesión por IP (sin emails: solo un código irreversible) | Intentos | Frenar ataques de fuerza bruta. Se borran solos al vencer (minutos). |
| Dirección IP y navegador de cada sesión | Sesiones | Seguridad. Las sesiones vencidas se borran periódicamente. |
| Quién hizo cada acción, cuándo y desde qué IP | Auditoría y movimientos | Trazabilidad del inventario y control interno. |
| Razón social, RUT, nombre de contacto, teléfono y email | Proveedores | Identificar al proveedor en los ingresos. Normalmente son datos de empresas; el contacto puede ser una persona. |

**Campos de texto libre.** Las notas y motivos de los movimientos aceptan cualquier texto. Instruye
a los usuarios para que **no escriban ahí nombres, RUT ni otros datos de pacientes** (por ejemplo,
"retiro para procedimiento", no "retiro para el paciente Juan Pérez"). Los datos de salud son datos
sensibles y exigen resguardos que este sistema no está diseñado para dar.

## Medidas de resguardo incluidas

- Acceso con cuenta personal, roles y permisos por centro, validados siempre en el servidor.
- Contraseñas con hash argon2id, cambio obligatorio de la clave temporal y bloqueo tras intentos
  fallidos.
- Sesiones con vencimiento, en cookie no accesible desde scripts y solo por HTTPS en producción.
- Registro de auditoría e historial de movimientos que no se puede modificar ni borrar.
- Cabeceras de seguridad del navegador (CSP, HSTS, entre otras).
- Registros técnicos (logs) que ocultan contraseñas, tokens y claves.

Medidas que dependen de quien opera la instalación: HTTPS, claves robustas, respaldos protegidos,
control de quién accede al servidor y baja oportuna de usuarios (ver el checklist de
[`DESPLIEGUE.md`](DESPLIEGUE.md#11-checklist-de-salida-a-producción)).

## Normativa chilena de protección de datos (referencia general)

- **Ley N° 19.628**, sobre protección de la vida privada: marco vigente para el tratamiento de
  datos personales.
- **Ley N° 21.719** (publicada en diciembre de 2024): reforma la anterior, refuerza los derechos de
  las personas, exige medidas de seguridad y el aviso de vulneraciones, y crea la Agencia de
  Protección de Datos Personales con facultades de fiscalización y sanción. Su entrada en vigencia
  general fue fijada para el **1 de diciembre de 2026**; confirma con tu asesoría legal los plazos
  y obligaciones que te aplican.

En términos prácticos, la institución que instala RedInsumos decide para qué y cómo se usan los
datos de sus usuarios, y por tanto es quien responde por su tratamiento. Puntos que conviene
revisar:

1. **Informar** a los funcionarios que el sistema registra sus acciones (auditoría) y con qué fin.
2. **Minimizar:** crear solo las cuentas necesarias, con el rol mínimo, y no ingresar datos que el
   sistema no requiere.
3. **Derechos de las personas:** definir cómo se atienden las solicitudes de acceso, rectificación
   y, cuando proceda, supresión. Nombre y email se corrigen en *Administración → Usuarios*. Los
   usuarios con historial no se eliminan sino que se desactivan, porque sus registros sostienen la
   trazabilidad del inventario; la forma de conciliar esto con una solicitud de supresión debe
   evaluarse caso a caso con asesoría legal.
4. **Conservación:** definir por cuánto tiempo se guardan la auditoría y los respaldos. El sistema
   no borra automáticamente la auditoría.
5. **Proveedores y ubicación de los datos:** si el servidor, la base de datos o los respaldos
   están con un tercero (hosting, nube), formalizar el encargo por contrato y conocer en qué país
   quedan los datos, en especial si salen de Chile.
6. **Incidentes:** tener definido a quién avisar y qué hacer ante un acceso indebido o una pérdida
   de datos (ver [`OPERACION.md`](OPERACION.md#cerrar-todas-las-sesiones)).

## Instituto de Salud Pública (ISP) y normativa sanitaria

- El ISP es la autoridad que regula y fiscaliza medicamentos y dispositivos médicos en Chile. El
  catálogo de RedInsumos permite anotar el **registro sanitario** de un insumo como dato de
  referencia; el sistema **no lo valida** contra el ISP ni se conecta con sus registros.
- El control por lote, vencimiento y ubicación, el retiro de lo que vence primero y el historial
  inalterable ayudan a sostener la trazabilidad y a responder ante alertas o retiros de productos.
  Aun así, **RedInsumos no reemplaza** los registros, procedimientos ni autorizaciones que la
  normativa sanitaria exija a cada establecimiento (por ejemplo, para medicamentos sujetos a control
  especial o para el registro de temperaturas de la cadena de frío, que el sistema no mide).
- RedInsumos es una herramienta de gestión de inventario. No es un dispositivo médico ni participa
  en decisiones clínicas.
