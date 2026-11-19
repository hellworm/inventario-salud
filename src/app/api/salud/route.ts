import { baseDeDatosDisponible } from "@/server/salud";

/**
 * Endpoint de salud para Docker, balanceadores y monitoreo externo.
 * Público y sin datos sensibles: solo indica si la aplicación responde y si
 * alcanza la base de datos. 200 = todo bien; 503 = sin base de datos.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const disponible = await baseDeDatosDisponible();
  return Response.json(
    { estado: disponible ? "ok" : "error", baseDeDatos: disponible ? "ok" : "sin_conexion" },
    { status: disponible ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
