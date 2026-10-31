import * as React from "react";
import { Link } from "react-router-dom";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

// The "never a blank table" pattern: icon + title + message + optional CTA.
// Two CTA shapes: pass `action` (any node) for full control, or the
// actionLabel + actionTo / onAction convenience props for a standard
// link / button styled like the app's primary violet action.
const EmptyState = React.forwardRef(
  (
    {
      icon: Icon = Inbox,
      title = "Nothing here yet",
      message,
      action,
      actionLabel,
      actionTo,
      onAction,
      compact = false,
      className,
      ...props
    },
    ref
  ) => {
    const cta =
      action ||
      (actionLabel && actionTo ? (
        <Link
          to={actionTo}
          className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700"
        >
          {actionLabel}
        </Link>
      ) : actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700"
        >
          {actionLabel}
        </button>
      ) : null);
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center justify-center px-6 text-center text-slate-500 dark:text-slate-400",
          compact ? "py-8" : "py-16",
          className
        )}
        {...props}
      >
        {Icon && <Icon className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />}
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</div>
        {message && <p className="mt-0.5 max-w-sm text-xs text-slate-400 dark:text-slate-500">{message}</p>}
        {cta}
      </div>
    );
  }
);
EmptyState.displayName = "EmptyState";

export { EmptyState };
