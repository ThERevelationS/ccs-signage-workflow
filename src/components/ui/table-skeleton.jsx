import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function TableSkeleton({ columns = 5, rows = 6, className }) {
  const headerCells = Array.from({ length: columns });
  const bodyRows = Array.from({ length: rows });

  return (
    <table className={cn("w-full text-sm", className)}>
      <thead className="bg-slate-50 dark:bg-slate-800">
        <tr>
          {headerCells.map((_, i) => (
            <th key={i} className="px-4 py-2.5">
              <Skeleton className="h-3 w-16" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {bodyRows.map((_, r) => (
          <tr key={r} className="border-t border-slate-100 dark:border-slate-800">
            {headerCells.map((_, c) => (
              <td key={c} className="px-4 py-3">
                <Skeleton className={c === 0 ? "h-4 w-36" : "h-4 w-16"} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
