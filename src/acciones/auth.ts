"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { esquemaCambiarPassword, esquemaLogin } from "@/lib/esquemas/auth";
import type { ErroresCampo } from "@/lib/resultado";
import { aResultadoError } from "@/server/accion-segura";
import { cambiarPassword } from "@/server/auth/autenticacion";
import { CENTRO_TODOS, COOKIE_CENTRO } from "@/server/auth/constantes";
import {
  cerrarSesionActual,
  descartarCookieSesionInvalida,
  iniciarSesionConCookie,
  listarCentrosDelActor,
  obtenerSesion,
} from "@/server/auth/sesion";
import { puedeVerTodosSusCentros } from "@/lib/permisos";
import { erroresDeZod } from "@/server/validacion";

/** Estado de los formularios de autenticación (para `useActionState`). */
export interface EstadoFormulario {
  error?: string;
  erroresCampo?: ErroresCampo;
  /** Valores a conservar tras un error (nunca contraseñas). */
  valores?: Record<string, string>;
}

/** Solo se aceptan destinos internos, para evitar redirecciones abiertas. */
function destinoSeguro(valor: FormDataEntryValue | null): string {
  const destino = typeof valor === "string" ? valor : "";
  return /^\/(?!\/)[\w\-./?=&%[\]]*$/.test(destino) && !destino.startsWith("/login") ? destino : "/panel";
}

export async function iniciarSesionAccion(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const email = String(formData.get("email") ?? "");
  const validado = esquemaLogin.safeParse({ email, password: formData.get("password") });
  if (!validado.success) {
    return { erroresCampo: erroresDeZod(validado.error), valores: { email } };
  }
  let debeCambiar: boolean;
  try {
    const usuario = await iniciarSesionConCookie(validado.data.email, validado.data.password);
    debeCambiar = usuario.debeCambiarPassword;
  } catch (error) {
    unstable_rethrow(error);
    return { error: aResultadoError(error).error, valores: { email } };
  }
  redirect(debeCambiar ? "/cambiar-password" : destinoSeguro(formData.get("destino")));
}

export async function cerrarSesionAccion(): Promise<void> {
  await cerrarSesionActual();
  redirect("/login");
}

export async function cambiarPasswordAccion(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const sesion = await obtenerSesion();
  if (!sesion) {
    await descartarCookieSesionInvalida();
    redirect("/login");
  }

  const validado = esquemaCambiarPassword.safeParse({
    actual: formData.get("actual"),
    nueva: formData.get("nueva"),
    confirmacion: formData.get("confirmacion"),
  });
  if (!validado.success) return { erroresCampo: erroresDeZod(validado.error) };

  try {
    await cambiarPassword(
      sesion.usuario.id,
      { actual: validado.data.actual, nueva: validado.data.nueva },
      { sesionActualId: sesion.sesionId, ip: sesion.actor.ip },
    );
  } catch (error) {
    unstable_rethrow(error);
    const r = aResultadoError(error);
    return { error: r.erroresCampo ? undefined : r.error, erroresCampo: r.erroresCampo };
  }
  revalidatePath("/", "layout");
  redirect("/panel?aviso=password-actualizada");
}

/**
 * Cambia el centro activo (persistido en cookie por 1 año). `centroId` puede
 * ser un id de centro o `"todos"` (solo administradores: toda la red para
 * ADMIN_RED, toda su institución para ADMIN).
 * Valores no permitidos se ignoran. Exige sesión vigente y sin cambio de
 * contraseña pendiente (igual que `accionSegura`).
 */
export async function cambiarCentroActivoAccion(centroId: string): Promise<void> {
  const sesion = await obtenerSesion();
  if (!sesion) {
    await descartarCookieSesionInvalida();
    redirect("/login");
  }
  // Con cambio de contraseña pendiente no se permite ninguna otra acción.
  if (sesion.usuario.debeCambiarPassword) redirect("/cambiar-password");

  let valor: string | null = null;
  if (centroId === CENTRO_TODOS) {
    if (puedeVerTodosSusCentros(sesion.actor)) valor = CENTRO_TODOS;
  } else {
    const centros = await listarCentrosDelActor(sesion);
    if (centros.some((c) => c.id === centroId)) valor = centroId;
  }
  if (valor === null) return;

  (await cookies()).set(COOKIE_CENTRO, valor, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
