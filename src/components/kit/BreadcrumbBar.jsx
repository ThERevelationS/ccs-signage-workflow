import * as React from "react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

// Standalone lifecycle trail: [{ label, to? }] where the last item renders
// as the current page. Items without `to` render as static text -- handy for
// non-navigable lifecycle steps (e.g. ["Estimate", "Sent", "Approved"]).
const BreadcrumbBar = React.forwardRef(({ items = [], className, ...props }, ref) => {
  const trail = (Array.isArray(items) ? items : []).filter(
    (item) => item && String(item.label ?? "").trim() !== ""
  );
  if (!trail.length) return null;
  return (
    <Breadcrumb ref={ref} className={className} {...props}>
      <BreadcrumbList className="flex-nowrap gap-1.5 text-xs sm:gap-2">
        {trail.map((item, i) => {
          const last = i === trail.length - 1;
          return (
            <React.Fragment key={`${item.label}-${i}`}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {last ? (
                  <BreadcrumbPage className="max-w-[220px] truncate">
                    {item.label}
                  </BreadcrumbPage>
                ) : item.to ? (
                  <BreadcrumbLink asChild className="max-w-[220px] truncate">
                    <Link to={item.to}>{item.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <span className="max-w-[220px] truncate">{item.label}</span>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
});
BreadcrumbBar.displayName = "BreadcrumbBar";

export { BreadcrumbBar };
