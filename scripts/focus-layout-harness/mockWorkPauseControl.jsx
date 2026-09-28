import React from "react";

export default function MockWorkPauseControl({ fullWidth = false } = {}) {
  return (
    <button
      type="button"
      className={fullWidth ? "w-full" : ""}
      onClick={() => window.dispatchEvent(new CustomEvent("synthetic-work-pause", {
        detail: { paused: true },
      }))}
    >
      Pause Work synthetic
    </button>
  );
}
