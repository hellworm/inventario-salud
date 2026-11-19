import { notFound } from "next/navigation";

/** Comodín: cualquier ruta que no existe responde 404 (dentro del shell si hay sesión). */
export default function RutaInexistente() {
  notFound();
}
