import GlobalFocusTimer from "@/components/timeclock/GlobalFocusTimer";
import GlobalWorkPauseControl from "@/components/timeclock/GlobalWorkPauseControl";

export default function FocusPausePair({
  currentUser,
  fullWidth = false,
  compact = false,
  className = "",
} = {}) {
  if (!currentUser) return null;

  return (
    <div
      data-focus-pause-pair
      className={`focus-pause-pair group relative flex items-stretch overflow-hidden rounded-2xl border border-violet-200/80 bg-white/60 shadow-[0_8px_24px_rgba(76,29,149,0.12)] backdrop-blur-xl ring-1 ring-white/70 transition-[box-shadow,border-color,background-color] duration-200 hover:border-violet-300 hover:shadow-[0_10px_28px_rgba(76,29,149,0.18)] dark:border-white/10 dark:bg-slate-950/55 dark:ring-white/5 dark:hover:border-violet-400/35 ${fullWidth ? "w-full" : ""} ${compact ? "focus-pause-pair--compact" : ""} ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70 dark:opacity-35"
        style={{
          background:
            "radial-gradient(circle at 18% 20%, rgba(196,181,253,0.38), transparent 34%), radial-gradient(circle at 86% 80%, rgba(94,234,212,0.22), transparent 32%)",
        }}
      />
      <GlobalFocusTimer
        key={currentUser?.id || currentUser?.email || "signed-out"}
        currentUser={currentUser}
        paired
        compact={compact}
        fullWidth={fullWidth}
      />
      <GlobalWorkPauseControl paired compact={compact} fullWidth={fullWidth} />
    </div>
  );
}
