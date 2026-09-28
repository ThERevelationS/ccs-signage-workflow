import React from "react";

export default function MockWorkPauseControl({
  fullWidth = false,
  paired = false,
  compact = false,
} = {}) {
  return (
    <button
      data-work-pause-trigger
      type="button"
      className={`${fullWidth ? "flex-1" : ""} ${paired ? "border-l px-3" : ""} ${compact ? "text-xs" : ""}`}
      onClick={() => window.dispatchEvent(new CustomEvent("synthetic-work-pause", {
        detail: { paused: true },
      }))}
    >
      Pause Work synthetic
    </button>
  );
}
