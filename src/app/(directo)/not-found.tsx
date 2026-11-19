import { NoEncontrado } from "@/components/shell/no-encontrado";
import { obtenerSesion } from "@/server/auth/sesion";

export default async function NoEncontradoDirecto() {
  const sesion = await obtenerSesion();
  return <NoEncontrado haySesion={sesion !== null} />;
}
