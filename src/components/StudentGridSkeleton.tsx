import { Skeleton } from "@/components/ui/skeleton";

export function StudentGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading students">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-(--shadow-card)">
          <div className="flex justify-between">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-1.5 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}
