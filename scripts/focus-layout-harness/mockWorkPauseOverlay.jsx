import React, { useEffect, useState } from "react";

export default function MockWorkPauseOverlay() {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const onPause = (event) => setPaused(Boolean(event?.detail?.paused));
    window.addEventListener("synthetic-work-pause", onPause);
    return () => window.removeEventListener("synthetic-work-pause", onPause);
  }, []);

  if (!paused) return null;

  return (
    <div
      data-testid="synthetic-work-pause-overlay"
      className="pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4"
    >
      <div className="rounded-2xl bg-white p-6 shadow-xl">
        <div className="text-xl font-black">WORK PAUSED</div>
        <button
          type="button"
          className="mt-4 rounded-xl border px-4 py-2"
          onClick={() => setPaused(false)}
        >
          Resume synthetic Work
        </button>
      </div>
    </div>
  );
}
