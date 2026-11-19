import { Skeleton, SkeletonTabla } from "@/components/ui/skeleton";

export default function CargandoInventario() {
  return (
    <div className="space-y-4">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-28 w-full rounded-tarjeta" />
      <SkeletonTabla filas={8} />
    </div>
  );
}
