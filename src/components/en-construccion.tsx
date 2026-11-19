import { Construction } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, type PageHeaderProps } from "@/components/ui/page-header";

/** Marcador de posición para páginas aún no implementadas. */
export function EnConstruccion({ nota, ...encabezado }: PageHeaderProps & { nota?: string }) {
  return (
    <>
      <PageHeader {...encabezado} />
      <EmptyState
        icono={Construction}
        titulo="En construcción"
        descripcion={nota ?? "Esta sección estará disponible pronto."}
      />
    </>
  );
}
