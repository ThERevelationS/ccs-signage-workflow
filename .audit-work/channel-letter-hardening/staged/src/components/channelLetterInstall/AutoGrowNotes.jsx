import React, { useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * AutoGrowNotes — a textarea that grows in height to fit its content.
 * Used inline next to small numeric fields where the user wants to leave
 * a free-form note about how/why that value was set.
 *
 * Resize approach: reset height to 'auto' before reading scrollHeight so the
 * textarea can SHRINK as well as grow.
 */
export default function AutoGrowNotes({
  value,
  onChange,
  disabled,
  placeholder = "Notes…",
  className,
  minHeightPx = 36,
}) {
  const ref = useRef(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.max(minHeightPx, el.scrollHeight);
    el.style.height = `${next}px`;
  };

  // Resize on value change (e.g. when settings load from DB) and on mount.
  useEffect(() => {
    resize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Textarea
      ref={ref}
      rows={1}
      value={value || ""}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => {
        onChange(e.target.value);
        resize();
      }}
      onInput={resize}
      className={cn(
        "resize-none overflow-hidden leading-snug py-1.5 px-2 text-xs bg-white border-slate-200 focus:border-slate-400 focus:ring-0 transition-colors",
        className
      )}
      style={{ minHeight: `${minHeightPx}px` }}
    />
  );
}