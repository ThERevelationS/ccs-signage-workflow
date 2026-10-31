import * as React from "react";

import { cn } from "@/lib/utils";
import { BreadcrumbBar } from "./BreadcrumbBar";
import { StatusChip } from "./StatusChip";

// Page-level header: optional breadcrumb trail, icon + title + status chip,
// optional subtitle, and a right-aligned action cluster. Mirrors the
// PurchaseOrders/Invoices page-top vocabulary (text-2xl slate title,
// text-sm slate-500 subtitle) so pages can stop hand-rolling it.
//
//   <PageHeader
//     breadcrumbs={[{ label: "Sales", to: "/SalesHome" }, { label: "Invoices" }]}
//     icon={Receipt}
//     title="Invoices"
//     subtitle="A/R and payment capture."
//     status={invoice.status}
//     actions={<><Button>Refresh</Button><Button>New</Button></>}
//   />
const PageHeader = React.forwardRef(
  (
    { breadcrumbs, icon: Icon, title, subtitle, status, statusLabel, actions, className, children, ...props },
    ref
  ) => (
    <div
      ref={ref}
      className={cn("mb-4 flex flex-wrap items-center justify-between gap-3", className)}
      {...props}
    >
      <div className="min-w-0">
        {breadcrumbs?.length > 0 && <BreadcrumbBar items={breadcrumbs} className="mb-1" />}
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-5 w-5 shrink-0 text-violet-600 dark:text-violet-400" />}
          <h1 className="truncate text-2xl font-bold text-slate-900 dark:text-slate-100">
            {title}
          </h1>
          {status && <StatusChip status={status} label={statusLabel} />}
        </div>
        {subtitle && (
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        )}
        {children}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  )
);
PageHeader.displayName = "PageHeader";

export { PageHeader };
