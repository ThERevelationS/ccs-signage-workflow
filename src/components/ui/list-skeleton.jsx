import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function ListSkeleton({ rows = 5, className, rowClassName }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cn("h-20 w-full rounded-xl", rowClassName)} />
      ))}
    </div>
  );
}
