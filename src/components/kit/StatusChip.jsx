import * as React from "react";

import { cn } from "@/lib/utils";
import {
  statusTone,
  statusLabel,
  TONE_CHIP_CLASSES,
  TONE_DOT_CLASSES,
  TONE_NAMES,
} from "./statusTones";

// One status pill for the whole app. `status` resolves through the shared
// status -> tone map (see statusTones.js); pass `tone` explicitly to render
// an arbitrary tone, and `label` to override the auto title-cased label.
const StatusChip = React.forwardRef(
  (
    { status, tone, label, showDot = true, size = "md", className, children, ...props },
    ref
  ) => {
    const resolvedTone = TONE_NAMES.includes(tone) ? tone : statusTone(status);
    const text = children ?? (label || statusLabel(status));
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold",
          size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs",
          TONE_CHIP_CLASSES[resolvedTone],
          className
        )}
        {...props}
      >
        {showDot && (
          <span
            aria-hidden="true"
            className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT_CLASSES[resolvedTone])}
          />
        )}
        {text}
      </span>
    );
  }
);
StatusChip.displayName = "StatusChip";

export { StatusChip, statusTone, statusLabel };
