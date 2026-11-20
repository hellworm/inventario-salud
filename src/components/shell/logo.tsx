import { cn } from "@/lib/cn";

/** Isotipo: una caja de insumos con la cruz clínica, enlazada en red. */
export function Isotipo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9", className)} role="img" aria-label="RedInsumos">
      <rect width="40" height="40" rx="10" className="fill-primario" />
      <path
        d="M20 8.5 30 14v12l-10 5.5L10 26V14l10-5.5Z"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.55"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M20 14.5v11M14.5 20h11" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, claro = false }: { className?: string; claro?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Isotipo />
      <span className={cn("text-lg font-semibold tracking-tight", claro ? "text-white" : "text-texto")}>
        Red<span className={claro ? "text-noche-200" : "text-marca-600"}>Insumos</span>
      </span>
    </span>
  );
}
