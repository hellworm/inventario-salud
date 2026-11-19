import { Boxes, CalendarClock, Network, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/shell/logo";
import { SelectorTema } from "@/components/shell/tema";

const VENTAJAS = [
  { icono: Boxes, titulo: "Stock al día", texto: "Ingresos y retiros por lote, desde la bodega o la sala." },
  { icono: CalendarClock, titulo: "Vencimientos bajo control", texto: "Alertas a 30, 60 y 90 días. Primero sale lo que vence antes." },
  { icono: Network, titulo: "Toda la red en una vista", texto: "Cada centro ve lo suyo; la administración ve el conjunto." },
  { icono: ShieldCheck, titulo: "Trazabilidad completa", texto: "Cada movimiento queda registrado con usuario, fecha y motivo." },
];

export default function LayoutAuth({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-noche-900 text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(60rem_40rem_at_-10%_-10%,rgb(69_171_179/0.35),transparent_60%),radial-gradient(40rem_30rem_at_110%_110%,rgb(26_116_128/0.6),transparent_60%)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:44px_44px]"
        />
        <Logo claro className="relative" />
        <div className="relative max-w-md">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight xl:text-4xl">
            Los insumos de tu red, siempre a la vista.
          </h2>
          <p className="mt-4 text-lg text-noche-100/90">
            Inventario clínico simple para centros de diálisis, consultorios y clínicas.
          </p>
          <ul className="mt-10 space-y-5">
            {VENTAJAS.map(({ icono: Icono, titulo, texto }) => (
              <li key={titulo} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  <Icono className="size-5 text-noche-200" aria-hidden />
                </span>
                <div>
                  <p className="font-medium">{titulo}</p>
                  <p className="text-sm text-noche-100/80">{texto}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-noche-100/70">Hecho para equipos de salud en Chile.</p>
      </aside>
      <main className="relative flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <SelectorTema className="absolute top-3 right-3 sm:top-4 sm:right-4" />
        <div className="w-full max-w-[26rem]">
          {/* En bloque propio: el logo es `inline-flex` y, sin esto, el contenido siguiente queda pegado en la misma línea. */}
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
