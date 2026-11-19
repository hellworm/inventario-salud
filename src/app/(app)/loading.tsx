import { Skeleton, SkeletonTabla, SkeletonTarjetas } from "@/components/ui/skeleton";

export default function Cargando() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <SkeletonTarjetas />
      <SkeletonTabla />
    </div>
  );
}
