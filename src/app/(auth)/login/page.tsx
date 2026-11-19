import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui";
import { obtenerSesion } from "@/server/auth/sesion";
import { FormularioLogin } from "./formulario-login";

export const metadata: Metadata = { title: "Ingresar" };

const CUENTAS_DEMO = [
  { rol: "Administrador de la red", email: "admin@redinsumos.cl", password: "Admin.Demo.2026" },
  { rol: "Administrador de institución (Andes)", email: "admin.andes@redinsumos.cl", password: "AdminAndes.Demo.2026" },
  { rol: "Administrador de institución (Cerro Alegre)", email: "admin.cerroalegre@redinsumos.cl", password: "AdminCerro.Demo.2026" },
  { rol: "Bodeguero (Andes, Ñuñoa)", email: "bodega@redinsumos.cl", password: "Bodega.Demo.2026" },
  { rol: "Bodeguero (Cerro Alegre, Valparaíso)", email: "bodega.valparaiso@redinsumos.cl", password: "Bodega.Valpo.2026" },
  { rol: "Visitante (Andes, Ñuñoa)", email: "visita@redinsumos.cl", password: "Visita.Demo.2026" },
];

export default async function PaginaLogin({ searchParams }: PageProps<"/login">) {
  const sesion = await obtenerSesion();
  if (sesion) redirect(sesion.usuario.debeCambiarPassword ? "/cambiar-password" : "/panel");

  const { destino, motivo } = await searchParams;
  const mostrarDemo = process.env.NODE_ENV !== "production";

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-texto sm:text-[1.75rem]">Ingresa a tu cuenta</h1>
      <p className="mt-1.5 mb-7 text-[0.9375rem] text-texto-suave">
        Usa el correo y la contraseña que te entregó la administración de tu institución.
      </p>
      {motivo === "sesion" ? (
        <Alert tono="info" className="mb-5">
          Tu sesión venció. Ingresa de nuevo y volverás a la pantalla donde estabas.
        </Alert>
      ) : null}
      <FormularioLogin destino={typeof destino === "string" ? destino : undefined} />
      <p className="mt-6 text-sm text-texto-suave">
        ¿Olvidaste tu contraseña? Pide a un administrador que la restablezca.
      </p>

      {mostrarDemo ? (
        <section className="mt-8 rounded-tarjeta border border-dashed border-borde-fuerte/70 bg-superficie p-4" aria-label="Cuentas de demostración">
          <h2 className="text-sm font-semibold text-texto">Cuentas de demostración</h2>
          <p className="text-xs text-texto-tenue">Visible solo en desarrollo.</p>
          <dl className="mt-3 space-y-2 text-sm">
            {CUENTAS_DEMO.map((c) => (
              <div key={c.email} className="flex flex-col gap-x-3 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between">
                <dt className="font-medium text-texto">{c.rol}</dt>
                <dd className="font-mono text-[0.8125rem] break-all text-texto-suave">
                  {c.email} · {c.password}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </>
  );
}
