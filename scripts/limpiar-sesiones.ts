/**
 * Elimina las sesiones vencidas de la base de datos.
 *
 * Una sesión está vencida si pasó su expiración deslizante (`expiraEn`) o si
 * superó la vida máxima absoluta desde su creación (7 días). Las sesiones
 * vigentes no se tocan: nadie pierde su sesión por ejecutar este script.
 *
 * Uso:   npm run sesiones:limpiar
 * Es seguro ejecutarlo todas las veces que se quiera (p. ej. una vez al día).
 */
import "./preparar-entorno";
import { VIDA_MAXIMA_SESION_MS } from "@/server/auth/constantes";
import { db } from "@/server/db";

async function main(): Promise<void> {
  const ahora = new Date();
  const limiteCreacion = new Date(ahora.getTime() - VIDA_MAXIMA_SESION_MS);
  const { count } = await db.sesion.deleteMany({
    where: { OR: [{ expiraEn: { lt: ahora } }, { creadoEn: { lt: limiteCreacion } }] },
  });
  const vigentes = await db.sesion.count();
  console.log(
    `${ahora.toISOString()} sesiones:limpiar → ${count} sesiones vencidas eliminadas; ${vigentes} vigentes se conservan.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("✖ No se pudieron limpiar las sesiones:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
