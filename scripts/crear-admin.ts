/**
 * Crea el primer ADMINISTRADOR DE LA RED (rol ADMIN_RED) de una instalación (sin datos demo).
 *
 * Uso:
 *   npm run admin:crear -- --email ana@miclinica.cl --nombre "Ana Pérez"
 *   ADMIN_EMAIL=ana@miclinica.cl ADMIN_NOMBRE="Ana Pérez" npm run admin:crear
 *
 * Opciones:
 *   --email <email>       Email del administrador (o variable ADMIN_EMAIL).
 *   --nombre <nombre>     Nombre visible (o ADMIN_NOMBRE). Por defecto "Administrador".
 *   --password-stdin      Lee la contraseña temporal desde la entrada estándar en
 *                         vez de generarla (nunca se pasa por argumento).
 *   --restablecer         Si el administrador ya existe: le asigna una contraseña
 *                         temporal nueva, lo desbloquea, lo reactiva y cierra sus
 *                         sesiones. Sirve para recuperar el acceso.
 *
 * El administrador de la red no pertenece a ninguna institución: ve y gestiona
 * toda la red. Los administradores de cada institución (rol ADMIN) se crean
 * después desde la aplicación (Administración → Instituciones / Usuarios).
 *
 * Comportamiento:
 *   - La contraseña temporal se muestra UNA sola vez; en la base queda su hash.
 *   - El usuario debe cambiarla en su primer ingreso (debeCambiarPassword).
 *   - Idempotente: si el email ya existe no cambia nada (salvo con --restablecer).
 *   - Nunca convierte en administrador a un usuario existente con otro rol.
 */
import "./preparar-entorno";
import { z } from "zod";
import { registrarAuditoria } from "@/server/auditoria";
import { normalizarEmail } from "@/server/auth/autenticacion";
import { hashearPassword, validarPoliticaPassword } from "@/server/auth/password";
import { db, enTransaccion } from "@/server/db";
import { VIGENCIA_PASSWORD_TEMPORAL_MS } from "@/server/auth/constantes";
import { liberarSujeto, sujetoDeEmail } from "@/server/limitador";
import { ErrorDominio } from "@/server/errores";
import { generarPasswordTemporal } from "@/server/servicios/usuarios";

class ErrorDeUso extends Error {}

interface Opciones {
  email: string;
  nombre: string;
  passwordStdin: boolean;
  restablecer: boolean;
}

function leerOpciones(argumentos: readonly string[]): Opciones {
  let email = process.env.ADMIN_EMAIL ?? "";
  let nombre = process.env.ADMIN_NOMBRE ?? "";
  let passwordStdin = false;
  let restablecer = false;

  for (let i = 0; i < argumentos.length; i++) {
    const argumento = argumentos[i]!;
    const igual = argumento.startsWith("--") ? argumento.indexOf("=") : -1;
    const clave = igual === -1 ? argumento : argumento.slice(0, igual);
    const valorPegado = igual === -1 ? undefined : argumento.slice(igual + 1);
    const valor = (): string => {
      if (valorPegado !== undefined) return valorPegado;
      const siguiente = argumentos[++i];
      if (siguiente === undefined) throw new ErrorDeUso(`Falta el valor de ${clave}.`);
      return siguiente;
    };
    if (clave === "--email") email = valor();
    else if (clave === "--nombre") nombre = valor();
    else if (clave === "--password-stdin") passwordStdin = true;
    else if (clave === "--restablecer") restablecer = true;
    else if (clave === "--password") {
      throw new ErrorDeUso(
        "Por seguridad la contraseña no se acepta como argumento (queda en el historial). Usa --password-stdin o deja que se genere.",
      );
    } else throw new ErrorDeUso(`Opción desconocida: ${argumento}`);
  }

  if (!email.trim()) {
    throw new ErrorDeUso("Indica el correo electrónico del administrador con --email (o la variable ADMIN_EMAIL).");
  }
  const emailValido = z.email().max(200).safeParse(normalizarEmail(email));
  if (!emailValido.success) throw new ErrorDeUso(`El correo electrónico "${email}" no es válido.`);
  nombre = nombre.trim() || "Administrador";
  if (nombre.length > 120) throw new ErrorDeUso("El nombre no puede superar los 120 caracteres.");

  return { email: emailValido.data, nombre, passwordStdin, restablecer };
}

async function leerPasswordDeStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    console.error("Escribe la contraseña temporal y presiona Enter (se verá en pantalla):");
  }
  let texto = "";
  process.stdin.setEncoding("utf8");
  for await (const trozo of process.stdin) {
    texto += trozo;
    if (texto.includes("\n")) break;
  }
  process.stdin.pause();
  const password = texto.split(/\r?\n/)[0] ?? "";
  if (!password) throw new ErrorDeUso("No se recibió ninguna contraseña por la entrada estándar.");
  return password;
}

async function obtenerPassword(opciones: Opciones): Promise<{ password: string; generada: boolean }> {
  if (!opciones.passwordStdin) return { password: generarPasswordTemporal(), generada: true };
  const password = await leerPasswordDeStdin();
  validarPoliticaPassword(password);
  if (password.toLowerCase().includes(opciones.email.split("@")[0]!)) {
    throw new ErrorDominio("PASSWORD_DEBIL", "La contraseña no puede contener el nombre de usuario del correo electrónico.");
  }
  return { password, generada: false };
}

function mostrarCredenciales(titulo: string, email: string, credencial: { password: string; generada: boolean }): void {
  console.log(`\n✔ ${titulo}`);
  console.log(`\n    Correo electrónico:   ${email}`);
  if (credencial.generada) {
    console.log(`    Contraseña temporal:  ${credencial.password}`);
    console.log("\n  Anótala ahora: no se volverá a mostrar ni se puede recuperar.");
  } else {
    console.log("    Contraseña temporal:  la que ingresaste por la entrada estándar.");
  }
  console.log("  Al iniciar sesión, el sistema pedirá cambiarla por una definitiva.");
  console.log("  Vence en 72 horas: si no se usa a tiempo, repite el comando con --restablecer.\n");
}

async function main(): Promise<void> {
  const opciones = leerOpciones(process.argv.slice(2));
  const existente = await db.usuario.findUnique({
    where: { email: opciones.email },
    select: { id: true, rol: true, activo: true },
  });

  if (existente && existente.rol !== "ADMIN_RED") {
    throw new ErrorDeUso(
      `Ya existe un usuario con el correo electrónico ${opciones.email} y rol ${existente.rol}. Este script no cambia roles: usa otro correo o pide a un administrador que lo edite en Administración → Usuarios.`,
    );
  }

  if (existente && !opciones.restablecer) {
    console.log(
      `✔ El administrador de la red ${opciones.email} ya existe${existente.activo ? "" : " (está desactivado)"}: no se hizo ningún cambio.`,
    );
    console.log("  Si perdió el acceso, vuelve a ejecutar el comando agregando --restablecer.");
    return;
  }

  const credencial = await obtenerPassword(opciones);
  const passwordHash = await hashearPassword(credencial.password);
  // La contraseña temporal vence a las 72 horas (como las que entrega un administrador).
  const passwordTemporalExpira = new Date(Date.now() + VIGENCIA_PASSWORD_TEMPORAL_MS);

  if (existente) {
    await enTransaccion(async (tx) => {
      await tx.usuario.update({
        where: { id: existente.id },
        data: {
          passwordHash, debeCambiarPassword: true, passwordTemporalExpira, activo: true,
          intentosFallidos: 0, bloqueadoHasta: null,
        },
      });
      // También los bloqueos por IP + email del limitador de intentos.
      await liberarSujeto(sujetoDeEmail(opciones.email), tx, ["LOGIN_PAR", "LOGIN_CUENTA", "PASSWORD_ACTUAL"]);
      await tx.sesion.deleteMany({ where: { usuarioId: existente.id } });
      await registrarAuditoria(tx, null, {
        accion: "USUARIO_PASSWORD_RESTABLECIDA",
        entidad: "Usuario",
        entidadId: existente.id,
        detalle: { email: opciones.email, origen: "script admin:crear --restablecer" },
      });
    });
    mostrarCredenciales("Acceso del administrador de la red restablecido.", opciones.email, credencial);
    return;
  }

  await enTransaccion(async (tx) => {
    // El email es único en la base: dos ejecuciones simultáneas no crean duplicados.
    const creado = await tx.usuario.create({
      data: {
        nombre: opciones.nombre, email: opciones.email, rol: "ADMIN_RED", passwordHash,
        debeCambiarPassword: true, passwordTemporalExpira,
      },
      select: { id: true },
    });
    await registrarAuditoria(tx, null, {
      accion: "USUARIO_CREADO",
      entidad: "Usuario",
      entidadId: creado.id,
      detalle: { nombre: opciones.nombre, email: opciones.email, rol: "ADMIN_RED", origen: "script admin:crear" },
    });
  });
  mostrarCredenciales("Administrador de la red creado. Desde Administración → Instituciones podrá crear las instituciones y a sus administradores.", opciones.email, credencial);
}

main()
  .catch((error: unknown) => {
    if (error instanceof ErrorDeUso || error instanceof ErrorDominio) {
      console.error(`\n✖ ${error.message}\n`);
      if (error instanceof ErrorDeUso) {
        console.error('  Ejemplo: npm run admin:crear -- --email ana@miclinica.cl --nombre "Ana Pérez"\n');
      }
    } else {
      // Solo el mensaje: nunca se imprime la contraseña ni su hash.
      console.error("\n✖ No se pudo crear el administrador:", error instanceof Error ? error.message : error, "\n");
    }
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
