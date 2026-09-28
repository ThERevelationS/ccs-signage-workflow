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
      className={`ccs-glass-control focus-pause-pair group relative flex items-stretch overflow-hidden ${compact ? "rounded-xl" : "rounded-2xl"} ${fullWidth ? "w-full" : ""} ${compact ? "focus-pause-pair--compact" : ""} ${className}`}
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
