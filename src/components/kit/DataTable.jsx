import * as React from "react";

import { cn } from "@/lib/utils";
import { EmptyState } from "./EmptyState";

// Light conventions wrapper over a plain <table> — same markup the
// PurchaseOrders/Invoices lists hand-roll (rounded-2xl slate border card,
// sticky slate-50 thead, border-t rows, violet hover). Two densities:
// default matches the financial pages (px-4 py-2.5), `dense` matches the
// product queues (px-2 py-1.5, text-xs).
//
//   <DataTableShell head={["PO #", "Vendor", "Total"]} isEmpty={!rows.length}
//                   emptyState={{ title: "No purchase orders yet." }}>
//     {rows.map((r) => <Tr key={r.id}><Td>{r.po_number}</Td>...</Tr>)}
//   </DataTableShell>
//
// `head` accepts strings, nodes, or { label, className, dense } objects.
const DataTableShell = React.forwardRef(
  (
    {
      head,
      columns, // alias for head (column labels or { label, className } objects)
      children,
      isEmpty = false,
      emptyColSpan,
      emptyState, // EmptyState props object or a fully-built node
      dense = false,
      sticky = true,
      className,
      tableClassName,
      ...props
    },
    ref
  ) => {
    const cols = head || columns || [];
    const colSpan = emptyColSpan || Math.max(cols.length, 1);
    const emptyNode = React.isValidElement(emptyState)
      ? emptyState
      : <EmptyState compact {...(emptyState || {})} />;
    return (
      <div
        ref={ref}
        className={cn(
          "overflow-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
          className
        )}
        {...props}
      >
        <table className={cn("w-full text-left", dense ? "text-xs" : "text-sm", tableClassName)}>
          {cols.length > 0 && (
            <thead
              className={cn(
                "bg-slate-50 text-xs font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400",
                sticky && "sticky top-0 z-10"
              )}
            >
              <tr>
                {cols.map((col, i) => {
                  if (React.isValidElement(col)) {
                    return React.cloneElement(col, { key: col.key ?? i });
                  }
                  const { label, children, dense: colDense, ...rest } =
                    col && typeof col === "object" ? col : { label: col };
                  return (
                    <Th key={i} dense={colDense ?? dense} {...rest}>
                      {children ?? label}
                    </Th>
                  );
                })}
              </tr>
            </thead>
          )}
          <tbody
            className={cn(
              "[&_tr]:border-t [&_tr]:border-slate-100 dark:[&_tr]:border-slate-800",
              "[&_tr:hover]:bg-violet-50/40 dark:[&_tr:hover]:bg-slate-800/50"
            )}
          >
            {isEmpty ? (
              <tr className="hover:bg-transparent dark:hover:bg-transparent">
                <td colSpan={colSpan} className="p-0">
                  {emptyNode}
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
    );
  }
);
DataTableShell.displayName = "DataTableShell";

// Row with the shared border + hover defaults baked in — callers can still
// add cursor-pointer etc. via className.
const Tr = React.forwardRef(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-t border-slate-100 transition-colors hover:bg-violet-50/40 dark:border-slate-800 dark:hover:bg-slate-800/50",
      className
    )}
    {...props}
  />
));
Tr.displayName = "Tr";

const Th = React.forwardRef(({ dense = false, className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn("text-left", dense ? "px-2 py-1.5" : "px-4 py-2.5", className)}
    {...props}
  />
));
Th.displayName = "Th";

const Td = React.forwardRef(({ dense = false, className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("align-middle", dense ? "px-2 py-1.5" : "px-4 py-2.5", className)}
    {...props}
  />
));
Td.displayName = "Td";

export { DataTableShell, Tr, Th, Td };
