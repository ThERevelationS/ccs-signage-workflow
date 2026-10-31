import * as React from "react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import { recordHref } from "./recordRoutes";

// Typed record deep-link. The kind -> route map lives in recordRoutes.js:
//   <RecordLink kind="estimate" id={est.id}>Q-1042</RecordLink>
// renders <Link to="/EstimateDetail?id=...">. When the id is blank or the
// kind is unknown it degrades to a <span> -- never a broken href.
const RecordLink = React.forwardRef(
  ({ kind, id, children, className, ...props }, ref) => {
    const href = recordHref(kind, id);
    const text = children ?? String(id ?? "").trim() ?? "";
    if (!href) {
      return (
        <span ref={ref} className={cn("text-slate-500 dark:text-slate-400", className)} {...props}>
          {text}
        </span>
      );
    }
    return (
      <Link
        ref={ref}
        to={href}
        className={cn("text-sky-700 hover:underline dark:text-sky-400", className)}
        {...props}
      >
        {text}
      </Link>
    );
  }
);
RecordLink.displayName = "RecordLink";

export { RecordLink };
